import { describe, it, expect } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';

describe('Slice 5 Reliability: Real Process Crash & Restart Recovery', () => {
  const testPort = 3042;

  function spawnServer(): Promise<{ proc: ChildProcess; url: string }> {
    return new Promise((resolve, reject) => {
      const serverDist = path.resolve(process.cwd(), 'dist/server/server/server.js');
      const useDist = fs.existsSync(serverDist);
      const cmd = useDist ? process.execPath : 'npx';
      const args = useDist ? [serverDist] : ['tsx', 'src/server/server.ts'];

      const proc = spawn(cmd, args, {
        cwd: process.cwd(),
        env: { ...process.env, PORT: String(testPort) },
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: !useDist,
      });

      let stdout = '';
      let stderr = '';
      const onData = (data: Buffer) => {
        const str = data.toString();
        stdout += str;
        if (stdout.includes(`Running on http://127.0.0.1:${testPort}`)) {
          proc.stdout?.off('data', onData);
          resolve({ proc, url: `http://127.0.0.1:${testPort}` });
        }
      };

      proc.stdout?.on('data', onData);
      proc.stderr?.on('data', (err) => {
        stderr += err.toString();
      });

      proc.on('error', reject);

      setTimeout(() => {
        reject(new Error(`Server process failed to start within 25s: ${stdout} | ${stderr}`));
      }, 25000);
    });
  }

  function killProcess(proc: ChildProcess): Promise<void> {
    return new Promise((resolve) => {
      if (proc.pid) {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/pid', String(proc.pid), '/f', '/t']).on('close', () => resolve());
        } else {
          proc.kill('SIGKILL');
          resolve();
        }
      } else {
        resolve();
      }
    });
  }

  it('reconciles in-flight run from unexpected server crash upon process restart', async () => {
    // 1. Spawn Server Instance 1
    const { proc: proc1, url } = await spawnServer();

    const contract = {
      id: crypto.randomUUID(),
      fieldName: 'Annual Family Income',
      operator: '<=',
      threshold: 300000,
      unit: 'INR',
      sourceExcerpt: 'Income cannot exceed INR 3,00,000.',
      sourceDocumentName: 'restart-test.txt',
      sourceType: 'sample_policy',
      confirmedAt: new Date().toISOString(),
    };

    // Create plan with multiple probes
    const planRes = await fetch(`${url}/api/plans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-RuleGap-Client': 'true' },
      body: JSON.stringify({
        contract,
        fixtureId: 'scholarship',
        fixtureMode: 'inconsistent',
        targetFieldSelector: '#annual-income',
        demoProbes: [250000, 250001, 275000, 300000],
      }),
    });
    const plan = await planRes.json();

    // Approve plan
    await fetch(`${url}/api/plans/${plan.planId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-RuleGap-Client': 'true' },
    });

    // Start verification run
    const startRes = await fetch(`${url}/api/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-RuleGap-Client': 'true' },
      body: JSON.stringify({ planId: plan.planId, contract }),
    });
    const { runId } = await startRes.json();

    // Wait briefly so run writes active checkpoint and starts browser
    await new Promise((r) => setTimeout(r, 600));

    // 2. ABRUPTLY KILL the running server process (simulating hard crash)
    await killProcess(proc1);

    // Wait for port release
    await new Promise((r) => setTimeout(r, 1000));

    // 3. Spawn Server Instance 2 (Restart)
    const { proc: proc2 } = await spawnServer();

    try {
      // Query the run from the new server instance
      const getRes = await fetch(`${url}/api/runs/${runId}`);
      expect(getRes.status).toBe(200);

      const recoveredSnapshot = await getRes.json();
      expect(recoveredSnapshot.runId).toBe(runId);
      expect(recoveredSnapshot.status).toBe('FAILED');
      expect(recoveredSnapshot.completedAt).not.toBeNull();

      // Check that unexecuted / in-flight cases were reconciled
      const hasInterruptedOrNotExecuted = recoveredSnapshot.observations.some(
        (o: any) => o.lifecycleState === 'INTERRUPTED' || o.lifecycleState === 'NOT_EXECUTED'
      );
      expect(hasInterruptedOrNotExecuted).toBe(true);
    } finally {
      await killProcess(proc2);
    }
  }, 35000);
});
