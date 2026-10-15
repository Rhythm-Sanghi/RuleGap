import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import crypto from 'crypto';
import { createServer } from '../../server/server.js';
import { planStore } from '../../server/storage/planStore.js';
import { RuleContract } from '../../shared/contract.js';

describe('Slice 3 Integration: Security Middleware & Plan Approval Gate', () => {
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
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('rejects state-changing POST requests without X-RuleGap-Client header', async () => {
    const res = await fetch(`http://127.0.0.1:${serverPort}/api/plans`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain('X-RuleGap-Client');
  });

  it('rejects requests with untrusted Host header', async () => {
    const status = await new Promise<number>((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: serverPort,
          path: '/api/runs',
          method: 'GET',
          headers: {
            Host: 'evil-attacker.com',
          },
        },
        (res) => {
          resolve(res.statusCode || 0);
        }
      );
      req.on('error', reject);
      req.end();
    });

    expect(status).toBe(403);
  });

  it('enforces plan approval before permitting verification run execution', async () => {
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

    // 1. Create plan via API
    const createRes = await fetch(`http://127.0.0.1:${serverPort}/api/plans`, {
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

    expect(createRes.status).toBe(201);
    const plan = await createRes.json();
    expect(plan.isApproved).toBe(false);

    // 2. Attempt to start run with unapproved plan -> MUST be rejected (400)
    const runAttempt1 = await fetch(`http://127.0.0.1:${serverPort}/api/runs`, {
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

    expect(runAttempt1.status).toBe(400);
    const runErr1 = await runAttempt1.json();
    expect(runErr1.error).toContain('Cannot execute unapproved test plan');

    // 3. Explicitly approve the plan
    const approveRes = await fetch(`http://127.0.0.1:${serverPort}/api/plans/${plan.planId}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-RuleGap-Client': 'true',
      },
    });

    expect(approveRes.status).toBe(200);
    const body = await approveRes.json();
    expect(body.plan.isApproved).toBe(true);
    expect(body.plan.approvedAt).not.toBeNull();
  });

  it('ignores forged Host header port and derives target strictly from trusted server socket', async () => {
    const { executionRunner } = await import('../../server/runner/executionRunner.js');
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

    const createRes = await fetch(`http://127.0.0.1:${serverPort}/api/plans`, {
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
    const plan = await createRes.json();

    await fetch(`http://127.0.0.1:${serverPort}/api/plans/${plan.planId}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-RuleGap-Client': 'true',
      },
    });

    let observedExecutionPort: number | null = null;
    const originalStartRun = executionRunner.startRun;
    executionRunner.startRun = async (runId, p, c, port) => {
      observedExecutionPort = port;
    };

    try {
      const forgedReq = http.request({
        hostname: '127.0.0.1',
        port: serverPort,
        path: '/api/runs',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-RuleGap-Client': 'true',
          Host: '127.0.0.1:54321', // Forged port in Host header
        },
      });

      await new Promise<void>((resolve, reject) => {
        forgedReq.on('response', (res) => {
          expect(res.statusCode).toBe(201);
          resolve();
        });
        forgedReq.on('error', reject);
        forgedReq.write(JSON.stringify({ planId: plan.planId, contract }));
        forgedReq.end();
      });

      expect(observedExecutionPort).toBe(serverPort);
      expect(observedExecutionPort).not.toBe(54321);
    } finally {
      executionRunner.startRun = originalStartRun;
    }
  });

  it('rejects Host headers with malicious suffixes like 127.0.0.1:3000.evil.com', async () => {
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

  it('rejects Host headers with hostname prefixes like localhost.evil.com:3000', async () => {
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
