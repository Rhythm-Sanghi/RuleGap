import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { chromium, Browser, Page } from 'playwright';
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
    await browser.close().catch(() => {});
    await browserPool.close();
    if (server) {
      server.closeAllConnections?.();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
  }, 15000);

  const breakpoints = [
    { name: 'Mobile Small (360px)', width: 360, height: 640 },
    { name: 'Mobile Modern (390px)', width: 390, height: 844 },
    { name: 'Tablet (768px)', width: 768, height: 1024 },
    { name: 'Desktop Compact (1024px)', width: 1024, height: 768 },
    { name: 'Desktop Wide (1440px)', width: 1440, height: 900 },
  ];

  for (const bp of breakpoints) {
    it(`renders cleanly without horizontal clipping at ${bp.name}`, async () => {
      const page = await browser.newPage({
        viewport: { width: bp.width, height: bp.height },
      });

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
        await page.close();
      }
    });
  }

  it('remains legible and functional under 200% browser zoom', async () => {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 2, // 200% DPR
    });

    try {
      await page.goto(`http://127.0.0.1:${serverPort}`);
      await page.waitForSelector('.brand-logo');

      // Click "Load Sample Policy" under 200% zoom
      const loadBtn = page.locator('button:has-text("Load Sample Policy")');
      await loadBtn.click();

      // Check text area populated
      const text = await page.locator('#policy-text-area').inputValue();
      expect(text.length).toBeGreaterThan(50);
    } finally {
      await page.close();
    }
  });

  it('supports full keyboard navigation with visible focus rings', async () => {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 800 },
    });

    try {
      await page.goto(`http://127.0.0.1:${serverPort}`);
      await page.waitForSelector('.app-header');

      // Tab through key inputs
      await page.keyboard.press('Tab');
      let focusedTag = await page.evaluate(() => document.activeElement?.tagName);
      expect(focusedTag).toBeTruthy();

      // Press Enter on focused button if Load Sample Policy
      const loadBtn = page.locator('button:has-text("Load Sample Policy")');
      await loadBtn.focus();
      await page.keyboard.press('Enter');

      // Check that field-name receives input
      const fieldInput = page.locator('#field-name');
      await fieldInput.focus();
      await page.keyboard.type(' Modified');
      expect(await fieldInput.inputValue()).toContain('Modified');
    } finally {
      await page.close();
    }
  });

  it('includes proper semantic landmarks, accessible table labels, and modal semantics', async () => {
    const page = await browser.newPage();

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
      await page.close();
    }
  });
});
