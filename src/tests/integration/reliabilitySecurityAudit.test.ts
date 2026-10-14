import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import crypto from 'crypto';
import { createApp } from '../../server/server.js';
import { planStore } from '../../server/storage/planStore.js';
import { runStore } from '../../server/storage/runStore.js';
import { evidenceStore } from '../../server/storage/evidenceStore.js';
import { browserPool } from '../../server/runner/browserPool.js';
import { RuleContract } from '../../shared/contract.js';

describe('Slice 5 Audit: Reliability, Security, & Tamper Proofing', () => {
  let server: http.Server;
  let serverPort: number;

  beforeAll(async () => {
    const app = createApp();
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
    if (server) {
      server.closeAllConnections?.();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
  });

  const validContract: RuleContract = {
    id: crypto.randomUUID(),
    fieldName: 'Annual Family Income',
    operator: '<=',
    threshold: 300000,
    unit: 'INR',
    sourceExcerpt: 'Income cannot exceed INR 3,00,000.',
    sourceDocumentName: 'audit-test.txt',
    sourceType: 'sample_policy',
    confirmedAt: new Date().toISOString(),
  };

  it('rejects tampered plans where contract ID does not match server plan snapshot', async () => {
    // Create plan for validContract
    const createRes = await fetch(`http://127.0.0.1:${serverPort}/api/plans`, {
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
        demoProbes: [250001],
      }),
    });
    const plan = await createRes.json();

    // Approve the plan
    await fetch(`http://127.0.0.1:${serverPort}/api/plans/${plan.planId}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-RuleGap-Client': 'true',
      },
    });

    // Try to run with a tampered contract ID
    const tamperedContract = { ...validContract, id: crypto.randomUUID() };
    const runRes = await fetch(`http://127.0.0.1:${serverPort}/api/runs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-RuleGap-Client': 'true',
      },
      body: JSON.stringify({
        planId: plan.planId,
        contract: tamperedContract,
      }),
    });

    expect(runRes.status).toBe(400);
    const body = await runRes.json();
    expect(body.error).toContain('Plan was created for a different rule contract');
  });

  it('handles duplicate cancellation requests idempotently and cleanly', async () => {
    // Create & approve plan with 1 probe
    const createRes = await fetch(`http://127.0.0.1:${serverPort}/api/plans`, {
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
        demoProbes: [250000, 250001, 275000],
      }),
    });
    const plan = await createRes.json();
    await fetch(`http://127.0.0.1:${serverPort}/api/plans/${plan.planId}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-RuleGap-Client': 'true',
      },
    });

    // Start run
    const startRes = await fetch(`http://127.0.0.1:${serverPort}/api/runs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-RuleGap-Client': 'true',
      },
      body: JSON.stringify({
        planId: plan.planId,
        contract: validContract,
      }),
    });
    const { runId } = await startRes.json();

    // Send first cancellation
    const cancel1 = await fetch(`http://127.0.0.1:${serverPort}/api/runs/${runId}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-RuleGap-Client': 'true',
      },
    });
    expect(cancel1.status).toBe(200);

    // Send immediate duplicate cancellation
    const cancel2 = await fetch(`http://127.0.0.1:${serverPort}/api/runs/${runId}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-RuleGap-Client': 'true',
      },
    });
    expect(cancel2.status).toBe(200);

    // Wait until finalized
    let finalSnap: any = null;
    for (let i = 0; i < 20; i++) {
      const getRes = await fetch(`http://127.0.0.1:${serverPort}/api/runs/${runId}`);
      if (getRes.status === 200) {
        const snap = await getRes.json();
        if (snap.status === 'CANCELLED_PARTIAL') {
          finalSnap = snap;
          break;
        }
      }
      await new Promise((r) => setTimeout(r, 200));
    }

    expect(finalSnap).not.toBeNull();
    expect(finalSnap.status).toBe('CANCELLED_PARTIAL');

    // Send third cancellation after run is fully finalized
    const cancel3 = await fetch(`http://127.0.0.1:${serverPort}/api/runs/${runId}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-RuleGap-Client': 'true',
      },
    });
    expect(cancel3.status).toBe(200);
    const cancel3Body = await cancel3.json();
    expect(cancel3Body.status).toBe('CANCELLED_PARTIAL');
  });

  it('enforces evidence storage size boundaries (rejects screenshots > 1MB)', async () => {
    const oversizedBuffer = Buffer.alloc(1024 * 1024 + 10); // 1MB + 10 bytes
    await expect(
      evidenceStore.saveScreenshot(crypto.randomUUID(), 'case-oversized', oversizedBuffer)
    ).rejects.toThrow('Screenshot exceeds 1MB limit');
  });

  it('rejects path traversal attacks in screenshot and run retrieval', async () => {
    const maliciousCaseId = '../../etc/passwd';
    await expect(
      evidenceStore.saveScreenshot(crypto.randomUUID(), maliciousCaseId, Buffer.from([1, 2, 3]))
    ).rejects.toThrow('Invalid caseId');

    const traversalRun = await runStore.getRun('../../secret');
    expect(traversalRun).toBeNull();
  });
});
