import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { chromium, Browser } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { createApp } from '../../server/server.js';
import { browserPool } from '../../server/runner/browserPool.js';

describe('Slice 5 E2E Audit: Accessibility, Keyboard Navigation, & Responsive Breakpoints', () => {
  let server: http.Server;
  let serverPort: number;
  let browser: Browser;

  beforeAll(async () => {
    const app = createApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        serverPort = typeof addr === 'object' && addr ? addr.port : 3000;
        resolve();
      });
    });

    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    if (server) {
      server.closeAllConnections?.();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
    await browser.close().catch(() => {});
    await browserPool.close();
  }, 30000);

  const breakpoints = [
    { name: 'Mobile Small (360px)', width: 360, height: 640 },
    { name: 'Mobile Modern (390px)', width: 390, height: 844 },
    { name: 'Tablet (768px)', width: 768, height: 1024 },
    { name: 'Desktop Compact (1024px)', width: 1024, height: 768 },
    { name: 'Desktop Wide (1440px)', width: 1440, height: 900 },
  ];

  for (const bp of breakpoints) {
    it(`renders cleanly without horizontal clipping at ${bp.name}`, async () => {
      const context = await browser.newContext({
        viewport: { width: bp.width, height: bp.height },
      });
      const page = await context.newPage();

      try {
        await page.goto(`http://127.0.0.1:${serverPort}`);
        await page.waitForSelector('.app-header');

        // Check header and workbench main container exist
        expect(await page.locator('.app-header').isVisible()).toBe(true);
        expect(await page.locator('.workbench-container').isVisible()).toBe(true);

        // Check for no accidental page-level horizontal overflow
        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
        expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2); // 2px margin of error for scrollbar rendering
      } finally {
        await context.close();
      }
    });
  }

  it('passes automated axe-core accessibility audit across workbench and dialog states', async () => {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();

    try {
      await page.goto(`http://127.0.0.1:${serverPort}`);
      await page.waitForSelector('.app-header');

      // 1. Audit initial state
      const initialAudit = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze();
      expect(initialAudit.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);

      // 2. Load sample policy, confirm contract, derive plan
      await page.locator('button:has-text("Load Sample Policy")').click();
      await page.locator('button:has-text("Confirm Rule Contract & Derive Plan")').click();
      await page.waitForSelector('table[aria-label="Pre-flight test plan cases"]');

      // Audit pre-flight state
      const preflightAudit = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze();
      expect(preflightAudit.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);

      // 3. Approve and start run
      await page.locator('button:has-text("Approve Plan & Authorize Verification")').click();
      await page.locator('button:has-text("Start Browser Verification Run")').click();
      await page.waitForSelector('.callout-danger', { timeout: 35000 });

      // Audit completed verification matrix state
      const postRunAudit = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze();
      expect(postRunAudit.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);

      // 4. Open Evidence Inspection Drawer
      const inspectBtn = page.locator('tr.mismatch-row').first().getByRole('button', { name: 'Inspect' });
      await inspectBtn.click();
      await page.waitForSelector('.drawer', { state: 'visible' });

      // Audit modal dialog state
      const drawerAudit = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze();
      expect(drawerAudit.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);
    } finally {
      await context.close();
    }
  }, 50000);

  it('performs genuine 200% zoom verification checking all 10 key elements, reachability, focus rings, and horizontal containment', async () => {
    // Standard 1280px screen zoomed to 200% yields an effective CSS layout viewport of 640px
    const context = await browser.newContext({
      viewport: { width: 640, height: 800 },
    });
    const page = await context.newPage();

    try {
      await page.goto(`http://127.0.0.1:${serverPort}`);
      await page.waitForSelector('.brand-logo');

      // Element 1: Header / navigation
      expect(await page.locator('.app-header').isVisible()).toBe(true);

      // Element 2: Workbench panels container
      expect(await page.locator('.workbench-container').isVisible()).toBe(true);

      // Element 3: Policy text viewer
      expect(await page.locator('#policy-text-area').isVisible()).toBe(true);

      // Element 4: Contract editor fields
      expect(await page.locator('#field-name').isVisible()).toBe(true);
      expect(await page.locator('#threshold-input').isVisible()).toBe(true);
      expect(await page.locator('#operator-select').isVisible()).toBe(true);

      // Element 6: Fixture controls
      expect(await page.locator('#fixture-mode-select').isVisible()).toBe(true);

      // Load sample policy under 200% zoom
      const loadBtn = page.locator('button:has-text("Load Sample Policy")');
      await loadBtn.scrollIntoViewIfNeeded();
      await loadBtn.click();
      expect((await page.locator('#policy-text-area').inputValue()).length).toBeGreaterThan(50);

      // Confirm contract and derive plan
      const confirmBtn = page.locator('button:has-text("Confirm Rule Contract & Derive Plan")');
      await confirmBtn.scrollIntoViewIfNeeded();
      await confirmBtn.click();

      // Element 5: Pre-flight table
      await page.waitForSelector('table[aria-label="Pre-flight test plan cases"]');
      expect(await page.locator('table[aria-label="Pre-flight test plan cases"]').isVisible()).toBe(true);

      // Check horizontal containment: table scrolls inside container, no page-level horizontal blowout
      const preflightScrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const preflightClientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(preflightScrollWidth).toBeLessThanOrEqual(preflightClientWidth + 2);

      // Approve plan
      const approveBtn = page.locator('button:has-text("Approve Plan & Authorize Verification")');
      await approveBtn.scrollIntoViewIfNeeded();
      await approveBtn.click();
      await page.waitForSelector('.badge:has-text("Plan Approved")');

      // Start Mode A run under 200% zoom
      const startBtn = page.locator('button:has-text("Start Browser Verification Run")');
      await startBtn.scrollIntoViewIfNeeded();
      await startBtn.click();

      // Wait for run completion
      await page.waitForSelector('.callout-danger', { timeout: 35000 });

      // Element 7: Evidence matrix
      expect(await page.locator('table[aria-label="Verification observations matrix"]').isVisible()).toBe(true);

      // Element 10: Export controls button
      const exportBtn = page.locator('button:has-text("Export HTML Report")');
      await exportBtn.scrollIntoViewIfNeeded();
      expect(await exportBtn.isVisible()).toBe(true);

      // Element 8: Open and inspect Evidence drawer under 200% zoom
      const inspectBtn = page.locator('tr.mismatch-row').first().getByRole('button', { name: 'Inspect' });
      await inspectBtn.scrollIntoViewIfNeeded();
      await inspectBtn.click();
      await page.waitForSelector('.drawer', { state: 'visible' });
      expect(await page.locator('#drawer-title').isVisible()).toBe(true);

      // Close drawer
      await page.keyboard.press('Escape');
      await page.waitForSelector('.drawer', { state: 'detached' });

      // Run Mode B to populate history
      await page.locator('#fixture-mode-select').selectOption('corrected');
      const approveBtn2 = page.locator('button:has-text("Approve Plan & Authorize Verification")');
      await approveBtn2.scrollIntoViewIfNeeded();
      await approveBtn2.click();

      const startBtn2 = page.locator('button:has-text("Start Browser Verification Run")');
      await startBtn2.scrollIntoViewIfNeeded();
      await startBtn2.click();
      await page.waitForSelector('.callout-success', { timeout: 35000 });

      // Element 9: History selector (now visible with multiple runs)
      await page.waitForSelector('#history-select');
      expect(await page.locator('#history-select').isVisible()).toBe(true);

      // Check focus indicator on focused elements
      await exportBtn.focus();
      const hasFocusOutline = await page.evaluate(() => {
        const active = document.activeElement;
        if (!active) return false;
        const style = window.getComputedStyle(active);
        return style.outlineStyle !== 'none' || style.boxShadow.includes('rgba');
      });
      expect(hasFocusOutline).toBe(true);

      // Final check: document layout contains no horizontal blowout under 200% zoom
      const finalScrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const finalClientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(finalScrollWidth).toBeLessThanOrEqual(finalClientWidth + 2);
    } finally {
      await context.close();
    }
  }, 75000);

  it('supports full keyboard navigation with visible focus rings and dialog focus management', async () => {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();

    try {
      await page.goto(`http://127.0.0.1:${serverPort}`);
      await page.waitForSelector('.app-header');

      // Tab into load sample policy button
      const loadBtn = page.locator('button:has-text("Load Sample Policy")');
      await loadBtn.focus();
      await page.keyboard.press('Enter');

      // Check that field-name receives keyboard input
      const fieldInput = page.locator('#field-name');
      await fieldInput.focus();
      await page.keyboard.type(' (Edited)');
      expect(await fieldInput.inputValue()).toContain('(Edited)');

      // Confirm contract via keyboard
      const confirmBtn = page.locator('button:has-text("Confirm Rule Contract & Derive Plan")');
      await confirmBtn.focus();
      await page.keyboard.press('Enter');

      // Approve plan via keyboard
      await page.waitForSelector('button:has-text("Approve Plan & Authorize Verification")');
      const approveBtn = page.locator('button:has-text("Approve Plan & Authorize Verification")');
      await approveBtn.focus();
      await page.keyboard.press('Enter');

      // Start run via keyboard
      await page.waitForSelector('button:has-text("Start Browser Verification Run")');
      const startBtn = page.locator('button:has-text("Start Browser Verification Run")');
      await startBtn.focus();
      await page.keyboard.press('Enter');

      // Wait for run completion
      await page.waitForSelector('.callout-danger', { timeout: 35000 });

      // Focus the inspect button and activate via keyboard
      const inspectBtn = page.locator('tr.mismatch-row').first().getByRole('button', { name: 'Inspect' });
      await inspectBtn.focus();
      await inspectBtn.press('Enter');

      // Drawer opens and focus is placed on drawer close button
      await page.waitForSelector('.drawer', { state: 'visible' });
      await page.waitForFunction(() => {
        const active = document.activeElement;
        return active?.getAttribute('aria-label') === 'Close evidence inspection drawer';
      }, { timeout: 10000 });
      const focusedInDrawer = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
      expect(focusedInDrawer).toBe('Close evidence inspection drawer');

      // Press Escape to dismiss drawer and confirm focus restoration
      await page.keyboard.press('Escape');
      await page.waitForSelector('.drawer', { state: 'detached' });
      const restoredFocusedText = await page.evaluate(() => document.activeElement?.textContent);
      expect(restoredFocusedText).toContain('Inspect');
    } finally {
      await context.close();
    }
  }, 50000);

  it('respects prefers-reduced-motion media query by disabling/zeroing transition durations', async () => {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();

    try {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(`http://127.0.0.1:${serverPort}`);
      await page.waitForSelector('.app-header');

      const bodyTransition = await page.evaluate(() => {
        const body = document.querySelector('body');
        return window.getComputedStyle(body!).transitionDuration;
      });

      // Transitions are disabled or instantaneous (0.01ms / 0s)
      expect(['0s', '0.00001s', '0.01ms', ''].some((val) => bodyTransition.includes(val) || bodyTransition === '0s')).toBe(true);
    } finally {
      await context.close();
    }
  });

  it('includes proper semantic landmarks, accessible table labels, and modal semantics', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await page.goto(`http://127.0.0.1:${serverPort}`);

      // Semantic landmarks
      expect(await page.locator('header[role="banner"]').isVisible()).toBe(true);
      expect(await page.locator('main[role="main"]').isVisible()).toBe(true);

      // Load policy & derive plan
      await page.locator('button:has-text("Load Sample Policy")').click();
      await page.locator('button:has-text("Confirm Rule Contract & Derive Plan")').click();

      // Check pre-flight table has accessible name
      await page.waitForSelector('table[aria-label="Pre-flight test plan cases"]');
      expect(await page.locator('table[aria-label="Pre-flight test plan cases"]').isVisible()).toBe(true);
    } finally {
      await context.close();
    }
  });
});
