import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { RunStore } from '../../server/storage/runStore.js';
import { VerificationRunSnapshot } from '../../shared/contract.js';

describe('Slice 3 Integration: RunStore Atomic Checkpointing & Crash Recovery', () => {
  const testDir = path.join(os.tmpdir(), '.test-rulegap-runs-' + Date.now());
  let store: RunStore;

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
    store = new RunStore(testDir);
  });

  afterEach(async () => {
    await fs.promises.rm(testDir, { recursive: true, force: true }).catch(() => {});
  });

  const createMockSnapshot = (runId: string, status: VerificationRunSnapshot['status'] = 'RUNNING'): VerificationRunSnapshot => ({
    runId,
    planId: crypto.randomUUID(),
    contract: {
      id: crypto.randomUUID(),
      fieldName: 'Annual Family Income',
      operator: '<=',
      threshold: 300000,
      unit: 'INR',
      sourceExcerpt: 'Income cannot exceed INR 3,00,000.',
      sourceDocumentName: 'scholarship-policy.txt',
      sourceType: 'sample_policy',
      confirmedAt: new Date().toISOString(),
    },
    fixtureMode: 'inconsistent',
    startedAt: new Date().toISOString(),
    completedAt: null,
    status,
    observations: [
      {
        caseId: 'case-1',
        value: 249999,
        expectedOutcome: 'ACCEPT',
        observedFormOutcome: 'ACCEPTED',
        observedFeedbackText: 'Success',
        classification: 'CONSISTENT',
        lifecycleState: 'COMPLETED',
        durationMs: 120,
        screenshotId: null,
        diagnosticDetails: 'Validation succeeded',
        executedAt: new Date().toISOString(),
      },
      {
        caseId: 'case-2',
        value: 250001,
        expectedOutcome: 'ACCEPT',
        observedFormOutcome: null,
        observedFeedbackText: null,
        classification: null,
        lifecycleState: status === 'RUNNING' ? 'RUNNING' : 'PENDING',
        durationMs: 0,
        screenshotId: null,
        diagnosticDetails: null,
        executedAt: null,
      },
      {
        caseId: 'case-3',
        value: 300001,
        expectedOutcome: 'REJECT',
        observedFormOutcome: null,
        observedFeedbackText: null,
        classification: null,
        lifecycleState: 'PENDING',
        durationMs: 0,
        screenshotId: null,
        diagnosticDetails: null,
        executedAt: null,
      },
    ],
    summaryCounts: {
      totalScheduled: 3,
      consistent: 1,
      confirmedMismatch: 0,
      inconclusive: 0,
      executionError: 0,
      notExecuted: 2,
      interrupted: 0,
    },
    sampledMismatchSummary: null,
  });

  it('atomically saves active checkpoints and reads them before finalization', async () => {
    const runId = crypto.randomUUID();
    const snapshot = createMockSnapshot(runId, 'RUNNING');

    await store.saveActiveCheckpoint(snapshot);

    const activeFile = path.join(testDir, `.active-${runId}.json`);
    expect(fs.existsSync(activeFile)).toBe(true);

    const retrieved = await store.getRun(runId);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.runId).toBe(runId);
    expect(retrieved?.status).toBe('RUNNING');
  });

  it('finalizes a run, creating authoritative file and cleaning up active checkpoint', async () => {
    const runId = crypto.randomUUID();
    const snapshot = createMockSnapshot(runId, 'RUNNING');

    await store.saveActiveCheckpoint(snapshot);

    snapshot.status = 'COMPLETED_CONSISTENT';
    snapshot.completedAt = new Date().toISOString();
    snapshot.observations[1].observedFormOutcome = 'ACCEPTED';
    snapshot.observations[1].classification = 'CONSISTENT';
    snapshot.observations[1].lifecycleState = 'COMPLETED';
    snapshot.observations[1].executedAt = new Date().toISOString();
    snapshot.observations[2].observedFormOutcome = 'REJECTED';
    snapshot.observations[2].classification = 'CONSISTENT';
    snapshot.observations[2].lifecycleState = 'COMPLETED';
    snapshot.observations[2].executedAt = new Date().toISOString();
    snapshot.summaryCounts = {
      totalScheduled: 3,
      consistent: 3,
      confirmedMismatch: 0,
      inconclusive: 0,
      executionError: 0,
      notExecuted: 0,
      interrupted: 0,
    };

    await store.saveFinalizedRun(snapshot);

    const activeFile = path.join(testDir, `.active-${runId}.json`);
    const finalizedFile = path.join(testDir, `${runId}.json`);

    expect(fs.existsSync(activeFile)).toBe(false);
    expect(fs.existsSync(finalizedFile)).toBe(true);

    const retrieved = await store.getRun(runId);
    expect(retrieved?.status).toBe('COMPLETED_CONSISTENT');
    expect(retrieved?.summaryCounts.consistent).toBe(3);
  });

  it('lists historical finalized runs in descending chronological order', async () => {
    const run1 = createMockSnapshot(crypto.randomUUID(), 'COMPLETED_CONSISTENT');
    run1.startedAt = new Date(Date.now() - 10000).toISOString();
    run1.completedAt = new Date(Date.now() - 9000).toISOString();

    const run2 = createMockSnapshot(crypto.randomUUID(), 'COMPLETED_MISMATCHES');
    run2.startedAt = new Date(Date.now()).toISOString();
    run2.completedAt = new Date(Date.now() + 1000).toISOString();

    await store.saveFinalizedRun(run1);
    await store.saveFinalizedRun(run2);

    const list = await store.listRuns();
    expect(list.length).toBe(2);
    expect(list[0].runId).toBe(run2.runId);
    expect(list[1].runId).toBe(run1.runId);
  });

  it('reconciles abandoned active checkpoints on startup into explicit FAILED records', async () => {
    const runId = crypto.randomUUID();
    const abandoned = createMockSnapshot(runId, 'RUNNING');

    // Simulate an unexpected crash while case-2 was RUNNING and case-3 was PENDING
    await store.saveActiveCheckpoint(abandoned);

    const reconciled = await store.reconcileStartupCrashes();
    expect(reconciled).toBe(1);

    // Active checkpoint should be gone
    expect(fs.existsSync(path.join(testDir, `.active-${runId}.json`))).toBe(false);

    // Finalized file should exist with FAILED status
    const retrieved = await store.getRun(runId);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.status).toBe('FAILED');
    expect(retrieved?.observations[1].lifecycleState).toBe('INTERRUPTED');
    expect(retrieved?.observations[1].diagnosticDetails).toContain('Server process interrupted');
    expect(retrieved?.observations[2].lifecycleState).toBe('NOT_EXECUTED');
    expect(retrieved?.summaryCounts.notExecuted).toBe(1);
    expect(retrieved?.summaryCounts.interrupted).toBe(1);
  });
});
