import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { createServer } from '../../server/server.js';
import { planStore } from '../../server/storage/planStore.js';
import { runStore } from '../../server/storage/runStore.js';
import { executionRunner } from '../../server/runner/executionRunner.js';
import { browserPool } from '../../server/runner/browserPool.js';
import { computeSummaryCounts } from '../../shared/ruleEngine.js';
import { TestObservation, RuleContract } from '../../shared/contract.js';

describe('Independent Review Audit & Hardening Suite', () => {
  let server: http.Server;
  let serverPort: number;
  const testDataDir = path.join(os.tmpdir(), `rulegap-audit-${Date.now()}`);

  let originalDataDir: string | undefined;

  beforeAll(async () => {
    originalDataDir = process.env.RULEGAP_DATA_DIR;
    process.env.RULEGAP_DATA_DIR = testDataDir;
    fs.mkdirSync(testDataDir, { recursive: true });

    const app = createServer();
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        serverPort = typeof addr === 'object' && addr ? addr.port : 3000;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await browserPool.close();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    if (originalDataDir !== undefined) {
      process.env.RULEGAP_DATA_DIR = originalDataDir;
    } else {
      delete process.env.RULEGAP_DATA_DIR;
    }
    fs.rmSync(testDataDir, { recursive: true, force: true });
  });

  const baseContract: RuleContract = {
    id: 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d',
    fieldName: 'Annual Family Income',
    operator: '<=',
    threshold: 300000,
    unit: 'INR',
    sourceExcerpt: 'Applicants with annual family income of ₹300,000 or less are eligible.',
    sourceDocumentName: 'policy.txt',
    sourceType: 'sample_policy',
    confirmedAt: '2026-10-14T12:00:00.000Z',
  };

  async function createAndApprovePlan(contract: RuleContract = baseContract) {
    const planRes = await fetch(`http://127.0.0.1:${serverPort}/api/plans`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-RuleGap-Client': 'true',
      },
      body: JSON.stringify({
        contract,
        fixtureId: 'scholarship',
        fixtureMode: 'inconsistent',
        targetFieldSelector: '#annual-income',
        demoProbes: [250000],
      }),
    });
    const plan = await planRes.json();
    await fetch(`http://127.0.0.1:${serverPort}/api/plans/${plan.planId}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-RuleGap-Client': 'true',
      },
      body: JSON.stringify({}),
    });
    return plan.planId;
  }

  describe('Contract Tampering & Binding Defenses', () => {
    it('rejects start-run with modified threshold', async () => {
      const planId = await createAndApprovePlan();
      const res = await fetch(`http://127.0.0.1:${serverPort}/api/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-RuleGap-Client': 'true' },
        body: JSON.stringify({ planId, contract: { ...baseContract, threshold: 450000 } }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('threshold mismatch');
    });

    it('rejects start-run with modified operator', async () => {
      const planId = await createAndApprovePlan();
      const res = await fetch(`http://127.0.0.1:${serverPort}/api/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-RuleGap-Client': 'true' },
        body: JSON.stringify({ planId, contract: { ...baseContract, operator: '<' } }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('operator mismatch');
    });

    it('rejects start-run with modified unit', async () => {
      const planId = await createAndApprovePlan();
      const res = await fetch(`http://127.0.0.1:${serverPort}/api/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-RuleGap-Client': 'true' },
        body: JSON.stringify({ planId, contract: { ...baseContract, unit: 'USD' } }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('unit mismatch');
    });

    it('rejects start-run with modified sourceExcerpt', async () => {
      const planId = await createAndApprovePlan();
      const res = await fetch(`http://127.0.0.1:${serverPort}/api/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-RuleGap-Client': 'true' },
        body: JSON.stringify({ planId, contract: { ...baseContract, sourceExcerpt: 'Fabricated text' } }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('sourceExcerpt mismatch');
    });

    it('rejects start-run with modified contract ID', async () => {
      const planId = await createAndApprovePlan();
      const res = await fetch(`http://127.0.0.1:${serverPort}/api/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-RuleGap-Client': 'true' },
        body: JSON.stringify({ planId, contract: { ...baseContract, id: '99999999-9999-9999-9999-999999999999' } }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('Contract ID mismatch');
    });

    it('rejects execution of unverifiable legacy plans missing embedded contract', async () => {
      const legacyPlanId = '88888888-8888-8888-8888-888888888888';
      const legacyPlanPath = path.join(testDataDir, 'plans', `${legacyPlanId}.json`);
      fs.mkdirSync(path.dirname(legacyPlanPath), { recursive: true });
      fs.writeFileSync(
        legacyPlanPath,
        JSON.stringify({
          planId: legacyPlanId,
          contractId: baseContract.id,
          // Omitting contract to simulate legacy plan
          fixtureId: 'scholarship',
          fixtureMode: 'inconsistent',
          targetFieldSelector: '#annual-income',
          cases: [
            {
              caseId: 'case-1-300000',
              value: 300000,
              unit: 'INR',
              expectedOutcome: 'ACCEPT',
              rationale: 'Threshold',
              isDemoProbe: false,
            },
          ],
          createdAt: new Date().toISOString(),
          approvedAt: new Date().toISOString(),
          isApproved: true,
        })
      );

      const res = await fetch(`http://127.0.0.1:${serverPort}/api/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-RuleGap-Client': 'true' },
        body: JSON.stringify({ planId: legacyPlanId }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('unverifiable legacy');
    });

    it('safely derives executed contract directly from approved plan when contract is omitted in request body', async () => {
      const planId = await createAndApprovePlan();
      const res = await fetch(`http://127.0.0.1:${serverPort}/api/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-RuleGap-Client': 'true' },
        body: JSON.stringify({ planId }), // No contract in body!
      });
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.status).toBe('RUNNING');
      expect(data.runId).toBeDefined();
    });
  });

  describe('Late Subscriptions and Terminal Snapshot Dispatch', () => {
    it('dispatches run_failed immediately to a late subscriber without Last-Event-ID', async () => {
      const runId = '77777777-7777-7777-7777-777777777777';
      const failedRun = {
        runId,
        planId: '11111111-2222-3333-4444-555555555555',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        status: 'FAILED' as const,
        contract: baseContract,
        fixtureMode: 'inconsistent' as const,
        observations: [],
        summaryCounts: {
          consistent: 0,
          confirmedMismatch: 0,
          inconclusive: 0,
          executionError: 1,
          notExecuted: 0,
          interrupted: 0,
          totalScheduled: 1,
        },
        sampledMismatchSummary: null,
      };

      await runStore.saveFinalizedRun(failedRun);

      const receivedEvents: string[] = [];
      await new Promise<void>((resolve, reject) => {
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port: serverPort,
            path: `/api/runs/${runId}/events`,
            method: 'GET',
          },
          (res) => {
            res.on('data', (chunk) => {
              receivedEvents.push(chunk.toString());
              if (chunk.toString().includes('run_failed')) {
                req.destroy();
                resolve();
              }
            });
            setTimeout(() => {
              req.destroy();
              resolve();
            }, 1500);
          }
        );
        req.on('error', reject);
        req.end();
      });

      const output = receivedEvents.join('\n');
      expect(output).toContain('event: run_failed');
    });

    it('dispatches run_cancelled immediately to a late subscriber without Last-Event-ID', async () => {
      const runId = '66666666-6666-6666-6666-666666666666';
      const cancelledRun = {
        runId,
        planId: '11111111-2222-3333-4444-555555555555',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        status: 'CANCELLED_PARTIAL' as const,
        contract: baseContract,
        fixtureMode: 'inconsistent' as const,
        observations: [],
        summaryCounts: {
          consistent: 1,
          confirmedMismatch: 0,
          inconclusive: 0,
          executionError: 0,
          notExecuted: 1,
          interrupted: 0,
          totalScheduled: 2,
        },
        sampledMismatchSummary: null,
      };

      await runStore.saveFinalizedRun(cancelledRun);

      const receivedEvents: string[] = [];
      await new Promise<void>((resolve, reject) => {
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port: serverPort,
            path: `/api/runs/${runId}/events`,
            method: 'GET',
          },
          (res) => {
            res.on('data', (chunk) => {
              receivedEvents.push(chunk.toString());
              if (chunk.toString().includes('run_cancelled')) {
                req.destroy();
                resolve();
              }
            });
            setTimeout(() => {
              req.destroy();
              resolve();
            }, 1500);
          }
        );
        req.on('error', reject);
        req.end();
      });

      const output = receivedEvents.join('\n');
      expect(output).toContain('event: run_cancelled');
    });

    it('dispatches run_completed immediately to a late subscriber without Last-Event-ID', async () => {
      const runId = '99999999-8888-7777-6666-555555555555';
      const completedRun = {
        runId,
        planId: '11111111-2222-3333-4444-555555555555',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        status: 'COMPLETED_CONSISTENT' as const,
        contract: baseContract,
        fixtureMode: 'corrected' as const,
        observations: [],
        summaryCounts: {
          consistent: 1,
          confirmedMismatch: 0,
          inconclusive: 0,
          executionError: 0,
          notExecuted: 0,
          interrupted: 0,
          totalScheduled: 1,
        },
        sampledMismatchSummary: null,
      };

      await runStore.saveFinalizedRun(completedRun);

      const receivedEvents: string[] = [];
      await new Promise<void>((resolve, reject) => {
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port: serverPort,
            path: `/api/runs/${runId}/events`,
            method: 'GET',
            headers: {
              Accept: 'text/event-stream',
            },
          },
          (res) => {
            res.on('data', (chunk) => {
              receivedEvents.push(chunk.toString());
              if (chunk.toString().includes('run_completed')) {
                req.destroy();
                resolve();
              }
            });
            setTimeout(() => {
              req.destroy();
              resolve();
            }, 1500);
          }
        );
        req.on('error', reject);
        req.end();
      });

      const allOutput = receivedEvents.join('\n');
      expect(allOutput).toContain('event: run_completed');
      expect(allOutput).toContain(runId);
    });
  });

  describe('Summary Counts Lifecycle Accounting Invariants', () => {
    it('strictly preserves totalScheduled accounting across mixed observation states', () => {
      const observations: TestObservation[] = [
        // 1 completed consistent
        {
          caseId: 'case-1',
          value: 200000,
          expectedOutcome: 'ACCEPT',
          observedFormOutcome: 'ACCEPTED',
          observedFeedbackText: 'Accepted',
          classification: 'CONSISTENT',
          lifecycleState: 'COMPLETED',
          durationMs: 120,
          screenshotId: null,
          diagnosticDetails: null,
          executedAt: new Date().toISOString(),
        },
        // 1 completed confirmed mismatch
        {
          caseId: 'case-2',
          value: 275000,
          expectedOutcome: 'ACCEPT',
          observedFormOutcome: 'REJECTED',
          observedFeedbackText: 'Rejected',
          classification: 'CONFIRMED_MISMATCH',
          lifecycleState: 'COMPLETED',
          durationMs: 150,
          screenshotId: 's2',
          diagnosticDetails: null,
          executedAt: new Date().toISOString(),
        },
        // 1 running (active)
        {
          caseId: 'case-3',
          value: 300000,
          expectedOutcome: 'ACCEPT',
          observedFormOutcome: null,
          observedFeedbackText: null,
          classification: null,
          lifecycleState: 'RUNNING',
          durationMs: 0,
          screenshotId: null,
          diagnosticDetails: null,
          executedAt: null,
        },
        // 2 pending (not yet executed)
        {
          caseId: 'case-4',
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
        {
          caseId: 'case-5',
          value: 350000,
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
      ];

      const counts = computeSummaryCounts(observations, 5);

      expect(counts.consistent).toBe(1);
      expect(counts.confirmedMismatch).toBe(1);
      expect(counts.inconclusive).toBe(0);
      expect(counts.executionError).toBe(0);
      expect(counts.notExecuted).toBe(3); // 1 running + 2 pending
      expect(counts.interrupted).toBe(0);
      expect(counts.totalScheduled).toBe(5);

      const sum =
        counts.consistent +
        counts.confirmedMismatch +
        counts.inconclusive +
        counts.executionError +
        counts.notExecuted +
        counts.interrupted;
      expect(sum).toBe(counts.totalScheduled);
    });

    it('MUST NOT count PENDING or RUNNING observations as completed INCONCLUSIVE', () => {
      const pendingObservations: TestObservation[] = [
        {
          caseId: 'case-1',
          value: 250000,
          expectedOutcome: 'ACCEPT',
          observedFormOutcome: null,
          observedFeedbackText: null,
          classification: null,
          lifecycleState: 'PENDING',
          durationMs: 0,
          screenshotId: null,
          diagnosticDetails: null,
          executedAt: null,
        },
        {
          caseId: 'case-2',
          value: 300000,
          expectedOutcome: 'ACCEPT',
          observedFormOutcome: null,
          observedFeedbackText: null,
          classification: null,
          lifecycleState: 'RUNNING',
          durationMs: 0,
          screenshotId: null,
          diagnosticDetails: null,
          executedAt: null,
        },
      ];

      const counts = computeSummaryCounts(pendingObservations, 2);

      expect(counts.inconclusive).toBe(0);
      expect(counts.consistent).toBe(0);
      expect(counts.confirmedMismatch).toBe(0);
      expect(counts.executionError).toBe(0);
      expect(counts.notExecuted).toBe(2);
      expect(
        counts.consistent +
          counts.confirmedMismatch +
          counts.inconclusive +
          counts.executionError +
          counts.notExecuted +
          counts.interrupted
      ).toBe(2);
    });
  });

  describe('Fixture Contract Compatibility Enforcement', () => {
    it('rejects test plan creation with incompatible currency unit for scholarship fixture', async () => {
      const invalidContract: RuleContract = {
        ...baseContract,
        id: crypto.randomUUID(),
        unit: 'USD',
      };

      const res = await fetch(`http://127.0.0.1:${serverPort}/api/plans`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-RuleGap-Client': 'true',
        },
        body: JSON.stringify({
          contract: invalidContract,
          fixtureId: 'scholarship',
          fixtureMode: 'inconsistent',
          targetFieldSelector: '#annual-income',
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('Incompatible unit');
    });

    it('rejects test plan creation with negative income threshold', async () => {
      const invalidContract: RuleContract = {
        ...baseContract,
        id: crypto.randomUUID(),
        threshold: -5000,
      };

      const res = await fetch(`http://127.0.0.1:${serverPort}/api/plans`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-RuleGap-Client': 'true',
        },
        body: JSON.stringify({
          contract: invalidContract,
          fixtureId: 'scholarship',
          fixtureMode: 'inconsistent',
          targetFieldSelector: '#annual-income',
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('negative');
    });

    it('rejects test plan creation with unrelated field names (e.g., Student Age, GPA, Credit Score)', async () => {
      const unrelatedFields = ['Student Age', 'GPA', 'Credit Score', 'Attendance Percentage', 'Grade Point Average'];

      for (const fieldName of unrelatedFields) {
        const invalidContract: RuleContract = {
          ...baseContract,
          id: crypto.randomUUID(),
          fieldName,
        };

        const res = await fetch(`http://127.0.0.1:${serverPort}/api/plans`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-RuleGap-Client': 'true',
          },
          body: JSON.stringify({
            contract: invalidContract,
            fixtureId: 'scholarship',
            fixtureMode: 'inconsistent',
            targetFieldSelector: '#annual-income',
          }),
        });

        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error).toContain('Incompatible field');
      }
    });

    it('accepts deliberate, unambiguous income aliases for scholarship fixture', async () => {
      const validAliases = [
        'Annual Family Income',
        'family income',
        'annual income',
        'Household Income',
        'annual household income',
        'income',
        'Annual Family Income (INR)',
      ];

      for (const fieldName of validAliases) {
        const validContract: RuleContract = {
          ...baseContract,
          id: crypto.randomUUID(),
          fieldName,
        };

        const res = await fetch(`http://127.0.0.1:${serverPort}/api/plans`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-RuleGap-Client': 'true',
          },
          body: JSON.stringify({
            contract: validContract,
            fixtureId: 'scholarship',
            fixtureMode: 'inconsistent',
            targetFieldSelector: '#annual-income',
          }),
        });

        expect(res.status).toBe(201);
        const data = await res.json();
        expect(data.planId).toBeDefined();
      }
    });

    it('rejects approval of a plan if contract field name is unrelated to scholarship fixture', async () => {
      // Create a plan record directly in planStore simulating a tampered or bypassed plan
      const tamperedContract: RuleContract = {
        ...baseContract,
        id: crypto.randomUUID(),
        fieldName: 'Student Age',
      };
      const rawPlan = await planStore.createPlan({
        contract: tamperedContract,
        fixtureId: 'scholarship',
        fixtureMode: 'inconsistent',
        targetFieldSelector: '#annual-income',
      });

      // Attempt to approve via API
      const res = await fetch(`http://127.0.0.1:${serverPort}/api/plans/${rawPlan.planId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-RuleGap-Client': 'true',
        },
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('incompatible');
    });

    it('rejects execution start-run if approved plan has an incompatible field', async () => {
      // Force an approved plan with incompatible field in planStore
      const tamperedContract: RuleContract = {
        ...baseContract,
        id: crypto.randomUUID(),
        fieldName: 'GPA',
      };
      const rawPlan = await planStore.createPlan({
        contract: tamperedContract,
        fixtureId: 'scholarship',
        fixtureMode: 'inconsistent',
        targetFieldSelector: '#annual-income',
      });
      // Force approval state directly in store
      rawPlan.isApproved = true;
      rawPlan.approvedAt = new Date().toISOString();

      const res = await fetch(`http://127.0.0.1:${serverPort}/api/runs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-RuleGap-Client': 'true',
        },
        body: JSON.stringify({ planId: rawPlan.planId }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('incompatible');
    });

    it('rolls back runner lock and cancellation handle if initial checkpoint fails, allowing subsequent run to start', async () => {
      while (executionRunner.isRunActive()) {
        await new Promise((r) => setTimeout(r, 50));
      }

      const planId = await createAndApprovePlan();

      // Fault injection: mock saveActiveCheckpoint to fail on startup
      const checkpointSpy = vi.spyOn(runStore, 'saveActiveCheckpoint').mockRejectedValueOnce(
        new Error('Disk I/O error writing initial active checkpoint')
      );

      // Attempt to start run - must fail with 500 server error
      const failedRes = await fetch(`http://127.0.0.1:${serverPort}/api/runs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-RuleGap-Client': 'true',
        },
        body: JSON.stringify({ planId }),
      });

      expect(failedRes.status).toBe(500);
      const errData = await failedRes.json();
      expect(errData.error).toContain('Disk I/O error');

      // Crucial verification: runner lock MUST NOT be active
      expect(executionRunner.isRunActive()).toBe(false);

      // Verify that a subsequent valid run can start immediately without concurrency lock error
      checkpointSpy.mockRestore();

      const successRes = await fetch(`http://127.0.0.1:${serverPort}/api/runs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-RuleGap-Client': 'true',
        },
        body: JSON.stringify({ planId }),
      });

      expect(successRes.status).toBe(201);
      const successData = await successRes.json();
      expect(successData.runId).toBeDefined();
      expect(successData.status).toBe('RUNNING');

      // Cancel the run immediately so background browser processes do not contend with other tests
      await fetch(`http://127.0.0.1:${serverPort}/api/runs/${successData.runId}/cancel`, {
        method: 'POST',
        headers: { 'X-RuleGap-Client': 'true' },
      });

      while (executionRunner.isRunActive()) {
        await new Promise((r) => setTimeout(r, 50));
      }
    }, 15000);
  });
});
