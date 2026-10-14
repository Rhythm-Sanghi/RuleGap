import http from 'http';
import path from 'path';
import fs from 'fs';
import { chromium } from 'playwright';
import { createApp } from '../src/server/server.js';
import { browserPool } from '../src/server/runner/browserPool.js';

async function main() {
  const screenshotsDir = path.resolve(process.cwd(), 'devpost/screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  const app = createApp();
  let server: http.Server;
  let serverPort = 3000;

  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      serverPort = typeof addr === 'object' && addr ? addr.port : 3000;
      resolve();
    });
  });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  try {
    // 1. Empty workbench
    await page.goto(`http://127.0.0.1:${serverPort}`);
    await page.waitForSelector('.app-header');
    await page.screenshot({ path: path.join(screenshotsDir, '01-empty-workbench.png'), fullPage: true });
    console.log('Saved 01-empty-workbench.png');

    // 2. Load policy & confirm contract -> Pre-flight plan derived
    await page.locator('button:has-text("Load Sample Policy")').click();
    await page.locator('button:has-text("Confirm Rule Contract & Derive Plan")').click();
    await page.waitForSelector('table[aria-label="Pre-flight test plan cases"]');

    // Approve test plan
    await page.locator('button:has-text("Approve Plan & Authorize Verification")').click();
    await page.waitForSelector('.badge:has-text("Plan Approved")');
    await page.screenshot({ path: path.join(screenshotsDir, '02-approved-test-plan.png'), fullPage: true });
    console.log('Saved 02-approved-test-plan.png');

    // 3. Four-mismatch result (Mode A verification)
    await page.locator('button:has-text("Start Browser Verification Run")').click();
    await page.waitForSelector('.callout-danger', { timeout: 35000 });
    // Scroll down to show results section cleanly
    await page.locator('.workbench-results-section').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(screenshotsDir, '03-four-mismatch-result.png'), fullPage: true });
    console.log('Saved 03-four-mismatch-result.png');

    // 4. Evidence drawer open
    const inspectBtn = page.locator('tr.mismatch-row').first().getByRole('button', { name: 'Inspect' });
    await inspectBtn.click();
    await page.waitForSelector('.drawer', { state: 'visible' });
    // Wait for screenshot inside drawer to load
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
    await page.locator('.workbench-results-section').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(screenshotsDir, '05-corrected-consistent-result.png'), fullPage: true });
    console.log('Saved 05-corrected-consistent-result.png');

  } finally {
    await browser.close().catch(() => {});
    await browserPool.close();
    server.close();
  }
}

main().catch(console.error);
