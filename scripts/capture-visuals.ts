import path from 'path';
import fs from 'fs';
import os from 'os';
import { spawn, ChildProcess } from 'child_process';
import { chromium, Browser } from 'playwright';
import { getCommonChromiumLaunchOptions } from '../src/server/runner/browserPool.js';

async function main() {
  const screenshotsDir = path.resolve(process.cwd(), 'devpost/screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  // Use isolated unique temporary storage to guarantee no pollution or deletion of developer data
  const visualsDataDir = path.join(os.tmpdir(), `rulegap-visuals-${Date.now()}`);
  const serverPort = 3058;

  const serverDist = path.resolve(process.cwd(), 'dist/server/server/server.js');
  const useDist = fs.existsSync(serverDist);
  const cmd = useDist ? process.execPath : 'npx';
  const args = useDist ? [serverDist] : ['tsx', 'src/server/server.ts'];

  let serverProc: ChildProcess | null = null;
  let browser: Browser | null = null;

  function killProcess(proc: ChildProcess | null): Promise<void> {
    return new Promise((resolve) => {
      if (!proc || !proc.pid || proc.killed) return resolve();
      try {
        if (process.platform === 'win32') {
          const killer = spawn('taskkill', ['/pid', String(proc.pid), '/f', '/t']);
          killer.on('close', () => resolve());
          killer.on('error', () => resolve());
        } else {
          proc.kill('SIGKILL');
          resolve();
        }
      } catch {
        resolve();
      }
    });
  }

  try {
    serverProc = await new Promise<ChildProcess>((resolve, reject) => {
      const proc = spawn(cmd, args, {
        cwd: process.cwd(),
        env: {
          ...process.env,
          PORT: String(serverPort),
          RULEGAP_DATA_DIR: visualsDataDir,
        },
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: !useDist,
      });

      let stdout = '';
      let started = false;
      const onData = (data: Buffer) => {
        stdout += data.toString();
        if (!started && stdout.includes(`Running on http://127.0.0.1:${serverPort}`)) {
          started = true;
          resolve(proc);
        }
      };

      proc.stdout?.on('data', onData);
      proc.on('error', reject);

      setTimeout(() => {
        reject(new Error(`Server failed to start within 15s: ${stdout}`));
      }, 15000);
    });

    browser = await chromium.launch(getCommonChromiumLaunchOptions());
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();

    async function takeCleanFullScreenshot(filePath: string) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(150);
      const scrollHeight = await page.evaluate(() =>
        Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, 900)
      );
      await page.setViewportSize({ width: 1440, height: scrollHeight });
      await page.screenshot({ path: filePath });
      await page.setViewportSize({ width: 1440, height: 900 });
    }

    // 1. Empty workbench
    await page.goto(`http://127.0.0.1:${serverPort}`);
    await page.waitForSelector('.app-header');
    await takeCleanFullScreenshot(path.join(screenshotsDir, '01-empty-workbench.png'));
    console.log('Saved 01-empty-workbench.png');

    // 2. Load policy & confirm contract -> Pre-flight plan derived
    await page.locator('button:has-text("Load Sample Policy")').click();
    await page.locator('button:has-text("Confirm Rule Contract & Derive Plan")').click();
    await page.waitForSelector('table[aria-label="Pre-flight test plan cases"]');

    // Approve test plan
    await page.locator('button:has-text("Approve Plan & Authorize Verification")').click();
    await page.waitForSelector('.badge:has-text("Plan Approved")');
    await takeCleanFullScreenshot(path.join(screenshotsDir, '02-approved-test-plan.png'));
    console.log('Saved 02-approved-test-plan.png');

    // 3. Four-mismatch result (Mode A verification)
    await page.locator('button:has-text("Start Browser Verification Run")').click();
    await page.waitForSelector('.callout-danger', { timeout: 45000 });
    await page.waitForSelector('#history-select');
    await takeCleanFullScreenshot(path.join(screenshotsDir, '03-four-mismatch-result.png'));
    console.log('Saved 03-four-mismatch-result.png');

    // 4. Evidence drawer open
    await page.locator('.workbench-results-section').scrollIntoViewIfNeeded();
    const inspectBtn = page.locator('tr.mismatch-row').first().locator('.btn-inspect');
    await inspectBtn.click();
    await page.waitForSelector('.drawer', { state: 'visible' });
    await page.waitForSelector('.screenshot-preview');
    await page.screenshot({ path: path.join(screenshotsDir, '04-evidence-drawer.png') });
    console.log('Saved 04-evidence-drawer.png');

    // Close drawer
    await page.keyboard.press('Escape');
    await page.waitForSelector('.drawer', { state: 'detached' });

    // 5. Corrected seven-consistent result (Mode B verification)
    await page.locator('#fixture-mode-select').selectOption('corrected');
    await page.locator('button:has-text("Approve Plan & Authorize Verification")').click();
    await page.locator('button:has-text("Start Browser Verification Run")').click();
    await page.waitForSelector('.callout-success', { timeout: 45000 });
    await page.waitForFunction(() => {
      const select = document.querySelector('#history-select') as HTMLSelectElement | null;
      return select && select.options.length === 2;
    });
    await takeCleanFullScreenshot(path.join(screenshotsDir, '05-corrected-consistent-result.png'));
    console.log('Saved 05-corrected-consistent-result.png');
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
    if (serverProc) {
      await killProcess(serverProc);
    }
    if (fs.existsSync(visualsDataDir)) {
      try {
        await fs.promises.rm(visualsDataDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  }
}

if (process.argv.includes('--run')) {
  main().catch(console.error);
}
export { main };
