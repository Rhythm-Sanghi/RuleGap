import path from 'path';
import fs from 'fs';
import { spawn, ChildProcess } from 'child_process';
import { chromium } from 'playwright';

async function main() {
  const screenshotsDir = path.resolve(process.cwd(), 'devpost/screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  const visualsDataDir = path.resolve(process.cwd(), '.rulegap-visuals');
  if (fs.existsSync(visualsDataDir)) {
    fs.rmSync(visualsDataDir, { recursive: true, force: true });
  }

  const serverPort = 3058;

  const serverProc: ChildProcess = await new Promise((resolve, reject) => {
    const proc = spawn('npx', ['tsx', 'src/server/server.ts'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(serverPort),
        RULEGAP_DATA_DIR: '.rulegap-visuals',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,
    });

    let stdout = '';
    const onData = (data: Buffer) => {
      stdout += data.toString();
      if (stdout.includes(`Running on http://127.0.0.1:${serverPort}`)) {
        proc.stdout?.off('data', onData);
        resolve(proc);
      }
    };

    proc.stdout?.on('data', onData);
    proc.on('error', reject);

    setTimeout(() => {
      reject(new Error(`Server failed to start within 12s: ${stdout}`));
    }, 12000);
  });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  async function takeCleanFullScreenshot(filePath: string) {
    // Scroll to top first
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(150);
    const scrollHeight = await page.evaluate(() =>
      Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, 900)
    );
    await page.setViewportSize({ width: 1440, height: scrollHeight });
    await page.screenshot({ path: filePath });
    // Reset standard viewport
    await page.setViewportSize({ width: 1440, height: 900 });
  }

  function killProcess(proc: ChildProcess): Promise<void> {
    return new Promise((resolve) => {
      if (!proc.pid) return resolve();
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(proc.pid), '/f', '/t']).on('close', () => resolve());
      } else {
        proc.kill('SIGKILL');
        resolve();
      }
    });
  }

  try {
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
    await page.waitForSelector('.callout-danger', { timeout: 35000 });
    // Wait for history-select to update
    await page.waitForSelector('#history-select');
    await takeCleanFullScreenshot(path.join(screenshotsDir, '03-four-mismatch-result.png'));
    console.log('Saved 03-four-mismatch-result.png');

    // 4. Evidence drawer open
    await page.locator('.workbench-results-section').scrollIntoViewIfNeeded();
    const inspectBtn = page.locator('tr.mismatch-row').first().getByRole('button', { name: 'Inspect' });
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
    await page.waitForSelector('.callout-success', { timeout: 35000 });
    // Wait for history-select to have 2 options
    await page.waitForFunction(() => {
      const select = document.querySelector('#history-select') as HTMLSelectElement | null;
      return select && select.options.length === 2;
    });
    await takeCleanFullScreenshot(path.join(screenshotsDir, '05-corrected-consistent-result.png'));
    console.log('Saved 05-corrected-consistent-result.png');

  } finally {
    await browser.close().catch(() => {});
    await killProcess(serverProc);
    if (fs.existsSync(visualsDataDir)) {
      fs.rmSync(visualsDataDir, { recursive: true, force: true });
    }
  }
}

main().catch(console.error);
