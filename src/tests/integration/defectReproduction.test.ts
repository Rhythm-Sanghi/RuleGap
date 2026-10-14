import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { createServer } from '../../server/server.js';
import { computeSummaryCounts } from '../../shared/ruleEngine.js';
import { TestObservation, RuleContract } from '../../shared/contract.js';

describe('Defect Reproduction Suite (Pre-Fix Verification)', () => {
  let server: http.Server;
  let serverPort: number;
  const testDataDir = path.resolve(process.cwd(), '.rulegap-defect-repro');

  beforeAll(async () => {
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
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    delete process.env.RULEGAP_DATA_DIR;
    fs.rmSync(testDataDir, { recursive: true, force: true });
  });

  describe('Defect 1: Run-Start API allows contract tampering when contractId is preserved', () => {
    it('MUST REJECT a run-start request if threshold differs from the approved plan', async () => {
      const originalContract: RuleContract = {
        id: '11111111-2222-3333-4444-555555555555',
        fieldName: 'Annual Family Income',
        operator: '<=',
        threshold: 300000,
        unit: 'INR',
        sourceExcerpt: 'Approved policy excerpt for 300000 INR',
        sourceDocumentName: 'policy.txt',
        sourceType: 'sample_policy',
        confirmedAt: new Date().toISOString(),
      };

      // 1. Create plan
      const planRes = await fetch(`http://127.0.0.1:${serverPort}/api/plans`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-RuleGap-Client': 'true',
        },
        body: JSON.stringify({
          contract: originalContract,
          fixtureId: 'scholarship',
          fixtureMode: 'inconsistent',
          targetFieldSelector: '#annual-income',
          demoProbes: [250000],
        }),
      });
      expect(planRes.status).toBe(201);
      const planData = await planRes.json();
      const planId = planData.planId;

      // 2. Approve plan
      const approveRes = await fetch(`http://127.0.0.1:${serverPort}/api/plans/${planId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-RuleGap-Client': 'true',
        },
        body: JSON.stringify({}),
      });
      expect(approveRes.status).toBe(200);

      // 3. Attempt to start run with TAMPERED contract: threshold changed to 500000 but same UUID
      const tamperedContract: RuleContract = {
        ...originalContract,
        threshold: 500000, // Tampered threshold!
      };

      const startRes = await fetch(`http://127.0.0.1:${serverPort}/api/runs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-RuleGap-Client': 'true',
        },
        body: JSON.stringify({
          planId,
          contract: tamperedContract,
        }),
      });

      const startBody = await startRes.json();
      // EXPECTATION: Should be rejected with 400 Bad Request
      expect(startRes.status).toBe(400);
      expect(startBody.error).toMatch(/contract|mismatch|tamper|approved/i);
    });
  });

  describe('Defect 2: computeSummaryCounts counts PENDING and RUNNING cases as INCONCLUSIVE', () => {
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

      // In the buggy code: inconclusive === 2!
      // In correct code: inconclusive MUST be 0!
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

  describe('Defect 3: Permissive Host Header Validation', () => {
    it('MUST REJECT Host headers with malicious suffixes like 127.0.0.1:3000.evil.com', async () => {
      const status = await new Promise<number>((resolve, reject) => {
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port: serverPort,
            path: '/api/runs',
            method: 'GET',
            headers: {
              Host: `127.0.0.1:${serverPort}.evil.com`,
            },
          },
          (res) => resolve(res.statusCode || 0)
        );
        req.on('error', reject);
        req.end();
      });

      expect(status).toBe(403);
    });

    it('MUST REJECT Host headers with hostname prefixes like localhost.evil.com:3000', async () => {
      const status = await new Promise<number>((resolve, reject) => {
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port: serverPort,
            path: '/api/runs',
            method: 'GET',
            headers: {
              Host: `localhost.evil.com:${serverPort}`,
            },
          },
          (res) => resolve(res.statusCode || 0)
        );
        req.on('error', reject);
        req.end();
      });

      expect(status).toBe(403);
    });
  });

  describe('Defect 4: Late SSE subscription after run completion hangs or receives no terminal event', () => {
    it('MUST immediately send terminal event (run_completed) to a late subscriber connecting without Last-Event-ID', async () => {
      // Create a dummy completed run directly in runStore
      const { runStore } = await import('../../server/storage/runStore.js');
      const runId = '99999999-8888-7777-6666-555555555555';
      const completedRun = {
        runId,
        planId: '11111111-2222-3333-4444-555555555555',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        status: 'COMPLETED_CONSISTENT' as const,
        contract: {
          id: '11111111-2222-3333-4444-555555555555',
          fieldName: 'Annual Family Income',
          operator: '<=' as const,
          threshold: 300000,
          unit: 'INR',
          sourceExcerpt: 'Excerpt',
          sourceDocumentName: 'policy.txt',
          sourceType: 'sample_policy' as const,
          confirmedAt: new Date().toISOString(),
        },
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

      // Now connect as a late subscriber without Last-Event-ID
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
              resolve(); // timeout after 1.5s if no terminal event sent
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
});
