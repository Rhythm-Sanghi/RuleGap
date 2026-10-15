import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { chromium, Browser, Page } from 'playwright';
import { createApp } from '../../server/server.js';
import { browserPool, getCommonChromiumLaunchOptions } from '../../server/runner/browserPool.js';

describe('Slice 4 E2E: Interactive Workbench End-to-End User Journey', () => {
  let server: http.Server;
  let serverPort: number;
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    const app = createApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        serverPort = typeof addr === 'object' && addr ? addr.port : 3000;
        app.set('serverPort', serverPort);
        resolve();
      });
    });

    browser = await chromium.launch(getCommonChromiumLaunchOptions());
    page = await browser.newPage();
    page.on('console', (msg) => console.log('BROWSER CONSOLE:', msg.text()));
    page.on('pageerror', (err) => console.error('BROWSER PAGEERROR:', err));
    page.on('requestfailed', (req) => console.error('REQ FAILED:', req.url(), req.failure()?.errorText));
  });

  afterAll(async () => {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
    await browserPool.close();
    if (server) {
      server.closeAllConnections?.();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
  }, 60000);

  it('completes the full interactive workflow: import -> confirm contract -> approve -> verify Mode A -> switch Mode B -> compare history', async () => {
    const journeyStartTime = Date.now();

    // 1. Navigate to application root
    await page.goto(`http://127.0.0.1:${serverPort}`);

    // Verify header
    expect(await page.locator('.brand-logo').textContent()).toContain('RuleGap');
    expect(await page.locator('.brand-tagline').textContent()).toContain('The rules say yes. The form says no.');

    // 2. Click "Load Sample Policy"
    const loadSampleBtn = page.locator('button:has-text("Load Sample Policy")');
    await loadSampleBtn.click();

    // Verify textarea populated
    const policyText = await page.locator('#policy-text-area').inputValue();
    expect(policyText).toContain('COMMUNITY SCHOLARSHIP FOUNDATION');

    // Verify contract editor fields populated
    expect(await page.locator('#field-name').inputValue()).toBe('Annual Family Income');
    expect(await page.locator('#threshold-input').inputValue()).toBe('300000');
    expect(await page.locator('#operator-select').inputValue()).toBe('<=');

    // 3. Click "Confirm Rule Contract & Derive Plan"
    const confirmContractBtn = page.getByRole('button', { name: 'Confirm Rule Contract & Derive Plan' });
    await confirmContractBtn.click();

    // Verify Pre-flight plan is derived with 7 cases and needs approval
    await page.waitForSelector('table[aria-label="Pre-flight test plan cases"]');
    const preFlightRows = page.locator('table[aria-label="Pre-flight test plan cases"] tbody tr');
    expect(await preFlightRows.count()).toBe(7);
    expect(await page.locator('.badge:has-text("Approval Required")').isVisible()).toBe(true);

    // 4. Click "Approve Plan & Authorize Verification"
    const approveBtn = page.getByRole('button', { name: 'Approve Plan & Authorize Verification' });
    await approveBtn.click();
    await page.waitForSelector('.badge:has-text("Plan Approved")');
    expect(await page.locator('.badge:has-text("Plan Approved")').isVisible()).toBe(true);
    await page.waitForSelector('button:has-text("Start Browser Verification Run")');

    // 5. Click "Start Browser Verification Run" (Mode A default)
    const startRunBtn = page.locator('button:has-text("Start Browser Verification Run")');
    await startRunBtn.scrollIntoViewIfNeeded();
    await startRunBtn.click();
    await page.waitForSelector('button:has-text("Verification Running...")');

    // Wait for Mode A verification to complete (all 7 observations finished)
    await page.waitForSelector('.callout-danger', {
      timeout: 90000,
    });

    // Check Mode A summary counts in the UI
    expect(await page.locator('.summary-card.consistent .summary-value').textContent()).toBe('3');
    expect(await page.locator('.summary-card.mismatch .summary-value').textContent()).toBe('4');
    expect(await page.locator('.summary-card.inconclusive .summary-value').textContent()).toBe('0');
    expect(await page.locator('.summary-card.error .summary-value').textContent()).toBe('0');

    // 6. Inspect evidence drawer for a mismatch case
    const inspectBtn = page.locator('tr.mismatch-row').first().getByRole('button', { name: 'Inspect' });
    await inspectBtn.click();

    // Verify drawer appears with screenshot and observable DOM feedback
    await page.waitForSelector('.drawer', { state: 'visible' });
    expect(await page.locator('#drawer-title').textContent()).toContain('Evidence Inspection');
    expect(await page.locator('.screenshot-preview').isVisible()).toBe(true);

    // Close drawer via Escape key
    await page.keyboard.press('Escape');
    await page.waitForSelector('.drawer', { state: 'detached' });

    // 7. Switch Fixture Mode to Mode B (Corrected Fixture)
    await page.locator('#fixture-mode-select').selectOption('corrected');

    // Verify approval required for the new mode
    await page.waitForSelector('.panel[data-fixture-mode="corrected"]');
    await page.waitForSelector('.badge:has-text("Approval Required")');
    expect(await page.locator('.badge:has-text("Approval Required")').isVisible()).toBe(true);

    // 8. Re-approve and start run on Mode B
    const approveBtn2 = page.getByRole('button', { name: 'Approve Plan & Authorize Verification' });
    await approveBtn2.click();
    await page.waitForSelector('.badge:has-text("Plan Approved")');
    expect(await page.locator('.badge:has-text("Plan Approved")').isVisible()).toBe(true);
    await page.waitForSelector('button:has-text("Start Browser Verification Run")');

    const startRunBtn2 = page.locator('button:has-text("Start Browser Verification Run")');
    await startRunBtn2.scrollIntoViewIfNeeded();
    await startRunBtn2.click();
    await page.waitForSelector('button:has-text("Verification Running...")');

    // Wait for Mode B verification to complete
    await page.waitForSelector('.callout-success', {
      timeout: 90000,
    });

    // Check Mode B summary counts in the UI
    expect(await page.locator('.summary-card.consistent .summary-value').textContent()).toBe('7');
    expect(await page.locator('.summary-card.mismatch .summary-value').textContent()).toBe('0');

    // 9. Verify Run History contains both runs and permits switching
    await page.waitForSelector('#history-select');
    const historyOptions = page.locator('#history-select option');
    expect(await historyOptions.count()).toBeGreaterThanOrEqual(2);

    // Switch to Mode A run in history (with 4 mismatches)
    const modeAOption = page.locator('#history-select option:has-text("Mode A (Inconsistent)")').first();
    const modeARunId = await modeAOption.getAttribute('value');
    expect(modeARunId).not.toBeNull();
    await page.locator('#history-select').selectOption(modeARunId!);

    // Wait for and verify UI reflects historical Mode A with 4 mismatches preserved!
    await page.waitForSelector('.summary-card.mismatch .summary-value:has-text("4")');
    expect(await page.locator('.summary-card.mismatch .summary-value').textContent()).toBe('4');
    expect(await page.locator('.summary-card.consistent .summary-value').textContent()).toBe('3');

    // 10. Verify Export HTML Report button is active and accessible
    const exportBtn = page.locator('button:has-text("Export HTML Report")');
    expect(await exportBtn.isVisible()).toBe(true);

    const journeyDurationMs = Date.now() - journeyStartTime;
    console.log(`[Demonstration Benchmark] Full 12-step workbench journey completed in ${journeyDurationMs}ms (${(journeyDurationMs / 1000).toFixed(2)}s). Fits within 180s video limit.`);
    expect(journeyDurationMs).toBeLessThan(180000);
  }, 180000);
});
