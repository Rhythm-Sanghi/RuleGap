import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import crypto from 'crypto';
import { createServer } from '../../server/server.js';
import { RuleContract } from '../../shared/contract.js';
import { browserPool } from '../../server/runner/browserPool.js';

describe('Slice 3 E2E: Execution Cancellation Lifecycle', () => {
  let server: http.Server;
  let serverPort: number;

  beforeAll(async () => {
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
  });

  it('safely cancels an in-flight verification run, closes browser contexts, and persists CANCELLED_PARTIAL', async () => {
    const contract: RuleContract = {
      id: crypto.randomUUID(),
      fieldName: 'Annual Family Income',
      operator: '<=',
      threshold: 300000,
      unit: 'INR',
      sourceExcerpt: 'Income cannot exceed INR 3,00,000.',
      sourceDocumentName: 'scholarship-policy.txt',
      sourceType: 'sample_policy',
      confirmedAt: new Date().toISOString(),
    };

    // 1. Create plan with all 7 cases
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
        demoProbes: [250001, 275000, 300000],
      }),
    });
    expect(planRes.status).toBe(201);
    const plan = await planRes.json();

    // 2. Approve plan
    const approveRes = await fetch(`http://127.0.0.1:${serverPort}/api/plans/${plan.planId}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-RuleGap-Client': 'true',
      },
    });
    expect(approveRes.status).toBe(200);

    // 3. Start run
    const startRes = await fetch(`http://127.0.0.1:${serverPort}/api/runs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-RuleGap-Client': 'true',
      },
      body: JSON.stringify({
        planId: plan.planId,
        contract,
      }),
    });
    expect(startRes.status).toBe(201);
    const { runId, status } = await startRes.json();
    expect(status).toBe('RUNNING');

    // Wait a short moment for at least 1 case to begin executing
    await new Promise((r) => setTimeout(r, 400));

    // 4. Send cancellation request
    const cancelRes = await fetch(`http://127.0.0.1:${serverPort}/api/runs/${runId}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-RuleGap-Client': 'true',
      },
    });
    expect(cancelRes.status).toBe(200);

    // 5. Poll run until it enters terminal status
    let finalSnapshot: any = null;
    for (let attempts = 0; attempts < 30; attempts++) {
      const getRes = await fetch(`http://127.0.0.1:${serverPort}/api/runs/${runId}`);
      if (getRes.status === 200) {
        const snap = await getRes.json();
        if (snap.status !== 'RUNNING' && snap.status !== 'CANCELLATION_REQUESTED') {
          finalSnapshot = snap;
          break;
        }
      }
      await new Promise((r) => setTimeout(r, 300));
    }

    expect(finalSnapshot).not.toBeNull();
    expect(finalSnapshot.status).toBe('CANCELLED_PARTIAL');
    expect(finalSnapshot.completedAt).not.toBeNull();

    // Verify unexecuted cases were recorded as NOT_EXECUTED or INTERRUPTED
    const notExecutedCount = finalSnapshot.observations.filter(
      (o: any) => o.lifecycleState === 'NOT_EXECUTED' || o.lifecycleState === 'INTERRUPTED'
    ).length;
    expect(notExecutedCount).toBeGreaterThan(0);
    expect(finalSnapshot.summaryCounts.notExecuted + finalSnapshot.summaryCounts.interrupted).toBe(
      notExecutedCount
    );

    // Verify subsequent run can be started without concurrency conflict
    const startRes2 = await fetch(`http://127.0.0.1:${serverPort}/api/runs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-RuleGap-Client': 'true',
      },
      body: JSON.stringify({
        planId: plan.planId,
        contract,
      }),
    });
    expect(startRes2.status).toBe(201);

    // Cancel the second one immediately so test finishes cleanly
    const { runId: runId2 } = await startRes2.json();
    await fetch(`http://127.0.0.1:${serverPort}/api/runs/${runId2}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-RuleGap-Client': 'true',
      },
    });
  }, 25000);
});
