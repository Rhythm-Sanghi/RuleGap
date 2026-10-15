import { describe, it, expect, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { SCHOLARSHIP_DEMO_PROBES } from '../../shared/sampleData.js';

describe('RULEGAP_DATA_DIR Isolation and Restart Persistence', () => {
  const testPort = 3044;
  const isolatedDataDir = path.join(os.tmpdir(), `rulegap-demo-isolated-${Date.now()}`);
  const defaultRunsDir = path.resolve(process.cwd(), '.rulegap', 'runs');

  function spawnServer(): Promise<{ proc: ChildProcess; url: string }> {
    return new Promise((resolve, reject) => {
      const serverDist = path.resolve(process.cwd(), 'dist/server/server/server.js');
      const useDist = fs.existsSync(serverDist);
      const cmd = useDist ? process.execPath : 'npx';
      const args = useDist ? [serverDist] : ['tsx', 'src/server/server.ts'];

      const proc = spawn(cmd, args, {
        cwd: process.cwd(),
        env: {
          ...process.env,
          PORT: String(testPort),
          RULEGAP_DATA_DIR: isolatedDataDir,
        },
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
      proc.stderr?.on('data', (d) => { stderr += d.toString(); });
      proc.on('error', reject);

      setTimeout(() => {
        reject(new Error(`Server failed to start within 25s: ${stdout} | ${stderr}`));
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

  afterAll(async () => {
    // Clean up isolated data dir
    if (fs.existsSync(isolatedDataDir)) {
      await fs.promises.rm(isolatedDataDir, { recursive: true, force: true });
    }
  });

  it('proves RULEGAP_DATA_DIR isolates demo runs from default history and persists runs across process restarts', async () => {
    // Ensure clean state for isolated data dir
    if (fs.existsSync(isolatedDataDir)) {
      await fs.promises.rm(isolatedDataDir, { recursive: true, force: true });
    }

    // Record pre-test count of default runs to ensure they are untouched
    const defaultRunsBefore = fs.existsSync(defaultRunsDir)
      ? (await fs.promises.readdir(defaultRunsDir)).filter((f) => f.endsWith('.json') && !f.startsWith('.'))
      : [];

    // 1. Start Server Instance 1 with RULEGAP_DATA_DIR set
    const { proc: proc1, url } = await spawnServer();

    let createdRunId = '';

    try {
      // 2. Verify that querying /api/runs returns zero runs (isolated from default history)
      const listRes1 = await fetch(`${url}/api/runs`);
      expect(listRes1.status).toBe(200);
      const data1 = await listRes1.json();
      expect(data1.runs).toEqual([]);

      // 3. Create, approve, and execute a verification run in isolated environment
      const contract = {
        id: crypto.randomUUID(),
        fieldName: 'Annual Family Income',
        operator: '<=',
        threshold: 300000,
        unit: 'INR',
        sourceExcerpt: 'Income cannot exceed INR 3,00,000.',
        sourceDocumentName: 'isolation-test.txt',
        sourceType: 'sample_policy',
        confirmedAt: new Date().toISOString(),
      };

      const planRes = await fetch(`${url}/api/plans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-RuleGap-Client': 'true' },
        body: JSON.stringify({
          contract,
          fixtureId: 'scholarship',
          fixtureMode: 'inconsistent',
          targetFieldSelector: '#annual-income',
          demoProbes: SCHOLARSHIP_DEMO_PROBES,
        }),
      });
      const plan = await planRes.json();

      await fetch(`${url}/api/plans/${plan.planId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-RuleGap-Client': 'true' },
      });

      const startRes = await fetch(`${url}/api/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-RuleGap-Client': 'true' },
        body: JSON.stringify({ planId: plan.planId, contract }),
      });
      const startedRun = await startRes.json();
      createdRunId = startedRun.runId;

      // Poll until completed
      let finalRun: any = null;
      for (let i = 0; i < 120; i++) {
        await new Promise((r) => setTimeout(r, 500));
        const res = await fetch(`${url}/api/runs/${createdRunId}`);
        if (res.status === 200) {
          const run = await res.json();
          if (run.status && run.status.startsWith('COMPLETED')) {
            finalRun = run;
            break;
          }
        }
      }

      expect(finalRun).not.toBeNull();
      expect(finalRun.status).toBe('COMPLETED_MISMATCHES');
      expect(finalRun.summaryCounts.totalScheduled).toBe(7);
      expect(finalRun.summaryCounts.confirmedMismatch).toBe(4);
      expect(finalRun.summaryCounts.consistent).toBe(3);
      expect(finalRun.observations.length).toBe(7);

      // Verify that the run file was written inside isolatedDataDir/runs
      const isolatedRunsDir = path.join(isolatedDataDir, 'runs');
      expect(fs.existsSync(path.join(isolatedRunsDir, `${createdRunId}.json`))).toBe(true);

      // Verify that screenshots were written inside isolatedDataDir/evidence
      const isolatedEvidenceDir = path.join(isolatedDataDir, 'evidence', createdRunId);
      expect(fs.existsSync(isolatedEvidenceDir)).toBe(true);
      const evidenceFiles = await fs.promises.readdir(isolatedEvidenceDir);
      expect(evidenceFiles.length).toBeGreaterThan(0);

      // Verify that default .rulegap/runs directory was NOT modified
      if (fs.existsSync(defaultRunsDir)) {
        const defaultRunsAfter = (await fs.promises.readdir(defaultRunsDir)).filter(
          (f) => f.endsWith('.json') && !f.startsWith('.')
        );
        expect(defaultRunsAfter.length).toBe(defaultRunsBefore.length);
        expect(defaultRunsAfter).not.toContain(`${createdRunId}.json`);
      }

      // Verify /api/runs in Server 1 returns exactly the 1 demo run
      const listRes2 = await fetch(`${url}/api/runs`);
      const data2 = await listRes2.json();
      expect(data2.runs.length).toBe(1);
      expect(data2.runs[0].runId).toBe(createdRunId);
    } finally {
      // 4. Kill Server Instance 1
      await killProcess(proc1);
    }

    // Give OS a moment to free port
    await new Promise((r) => setTimeout(r, 1000));

    // 5. Verify data remains on disk in isolatedDataDir before starting Server 2
    expect(fs.existsSync(path.join(isolatedDataDir, 'runs', `${createdRunId}.json`))).toBe(true);

    // 6. Start Server Instance 2 pointing to the same RULEGAP_DATA_DIR
    const { proc: proc2, url: url2 } = await spawnServer();

    try {
      // 7. Verify Server 2 immediately recovers the previous run from isolated storage
      const listResRestart = await fetch(`${url2}/api/runs`);
      expect(listResRestart.status).toBe(200);
      const dataRestart = await listResRestart.json();
      expect(dataRestart.runs.length).toBe(1);
      expect(dataRestart.runs[0].runId).toBe(createdRunId);
      expect(dataRestart.runs[0].summaryCounts.totalScheduled).toBe(7);
      expect(dataRestart.runs[0].summaryCounts.confirmedMismatch).toBe(4);
      expect(dataRestart.runs[0].summaryCounts.consistent).toBe(3);

      // Verify direct retrieval by ID works
      const singleRes = await fetch(`${url2}/api/runs/${createdRunId}`);
      expect(singleRes.status).toBe(200);
      const singleRun = await singleRes.json();
      expect(singleRun.runId).toBe(createdRunId);
      expect(singleRun.observations.length).toBe(7);

      // Verify HTML report export works on recovered run
      const reportRes = await fetch(`${url2}/api/runs/${createdRunId}/report`);
      expect(reportRes.status).toBe(200);
      const reportHtml = await reportRes.text();
      expect(reportHtml).toContain('RuleGap — Software Consistency Evidence Report');
      expect(reportHtml).toContain(createdRunId);

      // Verify evidence screenshot is servable from recovered run via API
      const firstCase = singleRun.observations[0];
      const screenshotRes = await fetch(`${url2}/api/runs/${createdRunId}/screenshots/${firstCase.caseId}`);
      expect(screenshotRes.status).toBe(200);
      expect(screenshotRes.headers.get('content-type')).toContain('image/png');
    } finally {
      // 8. Kill Server Instance 2
      await killProcess(proc2);
    }
  }, 45000);
});
