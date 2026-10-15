import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RunStore, atomicWriteFile } from '../../server/storage/runStore.js';
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

  describe('Fault injection & atomic guarantees', () => {
    it('recovers from transient EPERM/EBUSY rename collisions via bounded retries', async () => {
      const targetFile = path.join(testDir, 'transient-test.json');
      const originalRename = fs.promises.rename;
      let failCount = 0;

      // Fail twice with EPERM, then succeed
      vi.spyOn(fs.promises, 'rename').mockImplementation(async (oldPath, newPath) => {
        if (failCount < 2) {
          failCount++;
          const err = new Error('EPERM: operation not permitted');
          (err as { code?: string }).code = 'EPERM';
          throw err;
        }
        return originalRename(oldPath, newPath);
      });

      try {
        await atomicWriteFile(targetFile, JSON.stringify({ verified: true }));
        expect(failCount).toBe(2);
        expect(fs.existsSync(targetFile)).toBe(true);
        const data = JSON.parse(await fs.promises.readFile(targetFile, 'utf-8'));
        expect(data.verified).toBe(true);

        // Verify no leftover .tmp files
        const dirFiles = await fs.promises.readdir(testDir);
        expect(dirFiles.some((f) => f.endsWith('.tmp'))).toBe(false);
      } finally {
        vi.restoreAllMocks();
      }
    });

    it('safely handles permanent rename failure by deleting temp file and preserving existing target file intact', async () => {
      const targetFile = path.join(testDir, 'existing-record.json');
      const originalContent = JSON.stringify({ original: 'untouched-evidence' });
      await fs.promises.writeFile(targetFile, originalContent, 'utf-8');

      // Mock rename to permanently fail
      vi.spyOn(fs.promises, 'rename').mockImplementation(async () => {
        const err = new Error('EPERM: persistent lock violation');
        (err as { code?: string }).code = 'EPERM';
        throw err;
      });

      try {
        await expect(
          atomicWriteFile(targetFile, JSON.stringify({ corrupted: 'bad-data' }))
        ).rejects.toThrow('EPERM');

        // Existing target file must remain 100% untouched and uncorrupted
        const currentContent = await fs.promises.readFile(targetFile, 'utf-8');
        expect(currentContent).toBe(originalContent);

        // Temp file must be safely unlinked/deleted
        const dirFiles = await fs.promises.readdir(testDir);
        expect(dirFiles.some((f) => f.endsWith('.tmp'))).toBe(false);
      } finally {
        vi.restoreAllMocks();
      }
    });

    it('preserves existing valid finalized run records if subsequent write fails', async () => {
      const runId = crypto.randomUUID();
      const validSnapshot = createMockSnapshot(runId, 'COMPLETED_CONSISTENT');
      await store.saveFinalizedRun(validSnapshot);

      const originalRecord = await store.getRun(runId);
      expect(originalRecord).not.toBeNull();
      expect(originalRecord?.status).toBe('COMPLETED_CONSISTENT');

      // Fault injection: simulate disk/lock failure during next write
      vi.spyOn(fs.promises, 'rename').mockImplementation(async () => {
        const err = new Error('EBUSY: resource busy or locked');
        (err as { code?: string }).code = 'EBUSY';
        throw err;
      });

      const badSnapshot = createMockSnapshot(runId, 'FAILED');
      try {
        await expect(store.saveFinalizedRun(badSnapshot)).rejects.toThrow('EBUSY');

        // Authoritative record must still be intact and uncorrupted
        const preservedRecord = await store.getRun(runId);
        expect(preservedRecord?.status).toBe('COMPLETED_CONSISTENT');
      } finally {
        vi.restoreAllMocks();
      }
    });

    it('locks directory per runId so environmental changes mid-run cannot split run files', async () => {
      const runId = crypto.randomUUID();
      const initialSnapshot = createMockSnapshot(runId, 'RUNNING');

      // Explicitly bind to dirA
      const dirA = path.join(testDir, 'dirA');
      fs.mkdirSync(dirA, { recursive: true });
      store.bindRunDir(runId, dirA);

      await store.saveActiveCheckpoint(initialSnapshot);
      expect(fs.existsSync(path.join(dirA, `.active-${runId}.json`))).toBe(true);

      // Finalize the run
      initialSnapshot.status = 'COMPLETED_CONSISTENT';
      initialSnapshot.completedAt = new Date().toISOString();
      await store.saveFinalizedRun(initialSnapshot);

      // Finalized file and checkpoint cleanup must happen strictly in dirA
      expect(fs.existsSync(path.join(dirA, `${runId}.json`))).toBe(true);
      expect(fs.existsSync(path.join(dirA, `.active-${runId}.json`))).toBe(false);

      // Retrieval finds it via bound run dir
      const retrieved = await store.getRun(runId);
      expect(retrieved?.status).toBe('COMPLETED_CONSISTENT');
    });

    it('does not delete active checkpoint if finalization storage write fails during crash recovery', async () => {
      const runId = crypto.randomUUID();
      const abandoned = createMockSnapshot(runId, 'RUNNING');
      await store.saveActiveCheckpoint(abandoned);

      const activeFile = path.join(testDir, `.active-${runId}.json`);
      expect(fs.existsSync(activeFile)).toBe(true);

      // Force saveFinalizedRun to fail by mocking fs.promises.rename when writing the finalized file
      const renameSpy = vi.spyOn(fs.promises, 'rename').mockImplementation(async () => {
        const err = new Error('EPERM: disk locked during recovery finalization');
        (err as { code?: string }).code = 'EPERM';
        throw err;
      });

      // Expect reconcileStartupCrashes to propagate error
      await expect(store.reconcileStartupCrashes()).rejects.toThrow('EPERM');

      // Crucial assertion: the active checkpoint MUST STILL EXIST on disk and NOT be deleted!
      expect(fs.existsSync(activeFile)).toBe(true);

      // Restore rename so recovery can be retried
      renameSpy.mockRestore();

      // Retry reconciliation: it must succeed and finalize the run
      const reconciled = await store.reconcileStartupCrashes();
      expect(reconciled).toBe(1);
      expect(fs.existsSync(activeFile)).toBe(false);

      const finalized = await store.getRun(runId);
      expect(finalized?.status).toBe('FAILED');
      expect(finalized?.observations[1].lifecycleState).toBe('INTERRUPTED');
      expect(finalized?.observations[2].lifecycleState).toBe('NOT_EXECUTED');
    });
  });
});
