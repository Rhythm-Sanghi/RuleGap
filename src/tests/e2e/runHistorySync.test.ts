import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

describe('Run History and Displayed Results Synchronization Regression Test', () => {
  const testPort = 3055;
  const isolatedDataDir = path.join(os.tmpdir(), `rulegap-sync-test-${Date.now()}`);
  let currentProc: ChildProcess | null = null;
  let browser: Browser;

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
          currentProc = proc;
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

  function killProcess(proc: ChildProcess | null): Promise<void> {
    return new Promise((resolve) => {
      if (!proc || !proc.pid) {
        resolve();
        return;
      }
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(proc.pid), '/f', '/t']).on('close', () => resolve());
      } else {
        proc.kill('SIGKILL');
        resolve();
      }
    });
  }

  beforeAll(async () => {
    // Clean isolated directory
    if (fs.existsSync(isolatedDataDir)) {
      await fs.promises.rm(isolatedDataDir, { recursive: true, force: true });
    }
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    if (browser) {
      await browser.close().catch(() => {});
    }
    if (currentProc) {
      await killProcess(currentProc);
    }
    if (fs.existsSync(isolatedDataDir)) {
      await fs.promises.rm(isolatedDataDir, { recursive: true, force: true });
    }
  });

  it('proves run history and displayed results remain strictly synchronized across runs, selection, reload, and restart', async () => {
    // 1. Launch complete production application server with isolated data directory
    const { url } = await spawnServer();

    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    try {
      await page.goto(url);
      await page.waitForSelector('.app-header');

      // 2. Complete Mode A verification run
      await page.locator('button:has-text("Load Sample Policy")').click();
      await page.locator('button:has-text("Confirm Rule Contract & Derive Plan")').click();
      await page.waitForSelector('button:has-text("Approve Plan & Authorize Verification")');
      const approveBtn = page.locator('button:has-text("Approve Plan & Authorize Verification")');
      await approveBtn.scrollIntoViewIfNeeded();
      await approveBtn.click();
      await page.waitForSelector('.badge:has-text("Plan Approved")');
      await page.waitForSelector('button:has-text("Start Browser Verification Run")');
      const startBtn = page.locator('button:has-text("Start Browser Verification Run")');
      await startBtn.scrollIntoViewIfNeeded();
      await startBtn.click();

      // Wait for Mode A completion
      await page.waitForSelector('.callout-danger', { timeout: 75000 });
      expect(await page.locator('.summary-card.consistent .summary-value').textContent()).toBe('3');
      expect(await page.locator('.summary-card.mismatch .summary-value').textContent()).toBe('4');

      // 3. Record actual Mode A run ID
      const headerTextA = await page.locator('.panel[aria-labelledby="evidence-matrix-heading"] .panel-header .mono').textContent();
      const matchA = headerTextA?.match(/Run\s+([a-f0-9]{8})/i);
      expect(matchA).not.toBeNull();
      const runIdPrefixA = matchA![1].toLowerCase();

      // Obtain full runId from history-select
      await page.waitForSelector('#history-select');
      const runIdA = await page.locator('#history-select').inputValue();
      expect(runIdA.toLowerCase()).toContain(runIdPrefixA);

      // Verify history selector displays 1 run recorded and selects Run #1
      const historyOptionsA = await page.locator('#history-select option').allTextContents();
      expect(historyOptionsA.length).toBe(1);
      expect(historyOptionsA[0]).toContain(`Run #1 [${runIdPrefixA}]`);
      expect(historyOptionsA[0]).toContain('Mode A (Inconsistent)');
      expect(historyOptionsA[0]).toContain('4 Mismatches');

      // 4. Switch to Mode B, reapprove, and run verification
      await page.locator('#fixture-mode-select').selectOption('corrected');
      await page.locator('button:has-text("Approve Plan & Authorize Verification")').click();
      await page.waitForSelector('.badge:has-text("Plan Approved")');
      await page.locator('button:has-text("Start Browser Verification Run")').click();

      // Wait for Mode B completion
      await page.waitForSelector('.callout-success', { timeout: 75000 });
      expect(await page.locator('.summary-card.consistent .summary-value').textContent()).toBe('7');
      expect(await page.locator('.summary-card.mismatch .summary-value').textContent()).toBe('0');

      // 5. Record actual Mode B run ID
      const headerTextB = await page.locator('.panel[aria-labelledby="evidence-matrix-heading"] .panel-header .mono').textContent();
      const matchB = headerTextB?.match(/Run\s+([a-f0-9]{8})/i);
      expect(matchB).not.toBeNull();
      const runIdPrefixB = matchB![1].toLowerCase();
      expect(runIdPrefixB).not.toBe(runIdPrefixA);

      // 6. Confirm history selector identifies the newly completed Mode B run being displayed
      const currentSelectedRunId = await page.locator('#history-select').inputValue();
      const runIdB = currentSelectedRunId;
      expect(runIdB).not.toBe(runIdA);
      expect(runIdB.toLowerCase()).toContain(runIdPrefixB);

      const historyOptionsB = await page.locator('#history-select option').allTextContents();
      expect(historyOptionsB.length).toBe(2);
      expect(historyOptionsB[0]).toContain(`Run #2 [${runIdPrefixB}]`);
      expect(historyOptionsB[0]).toContain('Mode B (Corrected)');
      expect(historyOptionsB[0]).toContain('7/7 Consistent');
      expect(historyOptionsB[1]).toContain(`Run #1 [${runIdPrefixA}]`);
      expect(historyOptionsB[1]).toContain('Mode A (Inconsistent)');
      expect(historyOptionsB[1]).toContain('4 Mismatches');

      // 7. Select Mode A in history selector and verify everything syncs to Mode A
      await page.locator('#history-select').selectOption(runIdA);

      // Verify displayed run ID & fixture mode
      await page.waitForFunction(
        (prefix) => document.querySelector('.panel[aria-labelledby="evidence-matrix-heading"] .panel-header .mono')?.textContent?.includes(prefix),
        runIdPrefixA
      );
      const displayedModeA = await page.locator('.panel[aria-labelledby="evidence-matrix-heading"] .badge-neutral').first().textContent();
      expect(displayedModeA).toContain('Mode A: Inconsistent Fixture');

      // Verify four counters
      expect(await page.locator('.summary-card.consistent .summary-value').textContent()).toBe('3');
      expect(await page.locator('.summary-card.mismatch .summary-value').textContent()).toBe('4');
      expect(await page.locator('.summary-card.inconclusive .summary-value').textContent()).toBe('0');
      expect(await page.locator('.summary-card.error .summary-value').textContent()).toBe('0');

      // Verify evidence matrix rows show 4 mismatches
      const mismatchRowsA = await page.locator('tr.mismatch-row').count();
      expect(mismatchRowsA).toBe(4);

      // Verify screenshot evidence loads for Mode A mismatch
      const inspectBtn = page.locator('tr.mismatch-row').first().getByRole('button', { name: 'Inspect' });
      await inspectBtn.click();
      await page.waitForSelector('.drawer', { state: 'visible' });
      expect(await page.locator('.drawer h3').textContent()).toContain('Evidence Inspection');
      const screenshotPreview = page.locator('.screenshot-preview');
      await screenshotPreview.waitFor({ state: 'visible' });
      expect(await screenshotPreview.getAttribute('src')).toContain(`/api/runs/${runIdA}/screenshots/`);
      await page.keyboard.press('Escape');
      await page.waitForSelector('.drawer', { state: 'detached' });

      // 8. Switch back to Mode B and verify all displayed values match Mode B
      await page.locator('#history-select').selectOption(runIdB);

      await page.waitForFunction(
        (prefix) => document.querySelector('.panel[aria-labelledby="evidence-matrix-heading"] .panel-header .mono')?.textContent?.includes(prefix),
        runIdPrefixB
      );
      const displayedModeB = await page.locator('.panel[aria-labelledby="evidence-matrix-heading"] .badge-neutral').first().textContent();
      expect(displayedModeB).toContain('Mode B: Corrected Fixture');

      expect(await page.locator('.summary-card.consistent .summary-value').textContent()).toBe('7');
      expect(await page.locator('.summary-card.mismatch .summary-value').textContent()).toBe('0');
      const mismatchRowsB = await page.locator('tr.mismatch-row').count();
      expect(mismatchRowsB).toBe(0);

      // 9. Reload browser and repeat history selection
      await page.reload();
      await page.waitForSelector('.app-header');
      await page.waitForSelector('#history-select');

      // By default after reload, latest run (Mode B) is loaded
      await page.waitForFunction(
        (prefix) => document.querySelector('.panel[aria-labelledby="evidence-matrix-heading"] .panel-header .mono')?.textContent?.includes(prefix),
        runIdPrefixB
      );
      expect(await page.locator('#history-select').inputValue()).toBe(runIdB);
      expect(await page.locator('.summary-card.consistent .summary-value').textContent()).toBe('7');

      // Switch to Mode A on reloaded page
      await page.locator('#history-select').selectOption(runIdA);
      await page.waitForFunction(
        (prefix) => document.querySelector('.panel[aria-labelledby="evidence-matrix-heading"] .panel-header .mono')?.textContent?.includes(prefix),
        runIdPrefixA
      );
      expect(await page.locator('.summary-card.mismatch .summary-value').textContent()).toBe('4');

      // 10. Restart application and verify historical selection and evidence remain correct
      await killProcess(currentProc);
      currentProc = null;
      await new Promise((r) => setTimeout(r, 1000));

      const { url: restartedUrl } = await spawnServer();
      await page.goto(restartedUrl);
      await page.waitForSelector('.app-header');
      await page.waitForSelector('#history-select');

      // Verify both runs survived application restart
      const restartedOptions = await page.locator('#history-select option').allTextContents();
      expect(restartedOptions.length).toBe(2);
      expect(restartedOptions[0]).toContain(`Run #2 [${runIdPrefixB}]`);
      expect(restartedOptions[1]).toContain(`Run #1 [${runIdPrefixA}]`);

      // Select Mode A on restarted server
      await page.locator('#history-select').selectOption(runIdA);
      await page.waitForFunction(
        (prefix) => document.querySelector('.panel[aria-labelledby="evidence-matrix-heading"] .panel-header .mono')?.textContent?.includes(prefix),
        runIdPrefixA
      );
      expect(await page.locator('.summary-card.mismatch .summary-value').textContent()).toBe('4');

      // Select Mode B on restarted server
      await page.locator('#history-select').selectOption(runIdB);
      await page.waitForFunction(
        (prefix) => document.querySelector('.panel[aria-labelledby="evidence-matrix-heading"] .panel-header .mono')?.textContent?.includes(prefix),
        runIdPrefixB
      );
      expect(await page.locator('.summary-card.consistent .summary-value').textContent()).toBe('7');

      // 11. Export each selected run and verify report contains corresponding run ID and results
      const reportResA = await fetch(`${restartedUrl}/api/runs/${runIdA}/report`);
      expect(reportResA.status).toBe(200);
      const reportHtmlA = await reportResA.text();
      expect(reportHtmlA).toContain(runIdA);
      expect(reportHtmlA).toContain('Mode A (Inconsistent)');
      expect(reportHtmlA).toContain('COMPLETED_MISMATCHES');

      const reportResB = await fetch(`${restartedUrl}/api/runs/${runIdB}/report`);
      expect(reportResB.status).toBe(200);
      const reportHtmlB = await reportResB.text();
      expect(reportHtmlB).toContain(runIdB);
      expect(reportHtmlB).toContain('Mode B (Corrected)');
      expect(reportHtmlB).toContain('COMPLETED_CONSISTENT');
    } finally {
      await context.close();
    }
  }, 120000);
});
