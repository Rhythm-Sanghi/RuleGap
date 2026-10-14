import { describe, it, expect } from 'vitest';
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { chromium, Request } from 'playwright';
import { SCHOLARSHIP_DEMO_PROBES } from '../../shared/sampleData.js';
import { createApp } from '../../server/server.js';
import { browserPool } from '../../server/runner/browserPool.js';

describe('Slice 5 Offline HTML Report Audit: Standalone File Verification with Server Stopped', () => {
  it('opens downloaded report via file:// with server completely stopped, verifies offline rendering, base64 screenshots, and zero network calls', async () => {
    // 1. Start server
    const app = createApp();
    let serverPort = 0;
    const server: http.Server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => {
        const addr = s.address();
        serverPort = typeof addr === 'object' && addr ? addr.port : 3000;
        resolve(s);
      });
    });

    const reportPath = path.join(os.tmpdir(), `rulegap-offline-test-${Date.now()}.html`);

    try {
      // 2. Derive, approve, and execute a real verification run on Mode A
      const contract = {
        id: crypto.randomUUID(),
        fieldName: 'Annual Family Income <script>alert("xss")</script>',
        operator: '<=' as const,
        threshold: 300000,
        unit: 'INR',
        sourceExcerpt: 'Income cannot exceed INR 3,00,000. <b>Official Policy</b>',
        sourceDocumentName: 'policy.txt',
        sourceType: 'pasted_text' as const,
        confirmedAt: new Date().toISOString(),
      };

      const planRes = await fetch(`http://127.0.0.1:${serverPort}/api/plans`, {
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
      expect(planRes.status).toBe(201);
      const plan = await planRes.json();
      const planId = plan.planId;

      const approveRes = await fetch(`http://127.0.0.1:${serverPort}/api/plans/${planId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-RuleGap-Client': 'true' },
      });
      expect(approveRes.status).toBe(200);

      const startRes = await fetch(`http://127.0.0.1:${serverPort}/api/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-RuleGap-Client': 'true' },
        body: JSON.stringify({ planId, contract }),
      });
      expect(startRes.status).toBe(201);
      const { runId } = await startRes.json();

      // Poll until run reaches terminal state
      let completedRun: any = null;
      for (let i = 0; i < 150; i++) {
        const runRes = await fetch(`http://127.0.0.1:${serverPort}/api/runs/${runId}`);
        if (runRes.status === 200) {
          const snap = await runRes.json();
          if (snap.status && snap.status !== 'RUNNING' && snap.status !== 'QUEUED') {
            completedRun = snap;
            break;
          }
        }
        await new Promise((r) => setTimeout(r, 300));
      }
      expect(completedRun).not.toBeNull();
      expect(completedRun.status).toBe('COMPLETED_MISMATCHES');

      // 3. Download standalone HTML report from server
      const reportRes = await fetch(`http://127.0.0.1:${serverPort}/api/runs/${runId}/report`);
      expect(reportRes.status).toBe(200);
      const htmlContent = await reportRes.text();
      fs.writeFileSync(reportPath, htmlContent, 'utf-8');

      // 4. STOP THE SERVER COMPLETELY
      server.closeAllConnections?.();
      await new Promise<void>((resolve) => server.close(() => resolve()));

      // Verify server is dead (requests fail)
      await expect(fetch(`http://127.0.0.1:${serverPort}/api/runs/${runId}`)).rejects.toThrow();

      // 5. Launch Playwright and navigate directly to file://${reportPath}
      const browser = await chromium.launch({ headless: true });
      const context = await browser.newContext();
      const page = await context.newPage();

      // Intercept and assert ZERO external network requests
      const externalRequests: string[] = [];
      page.on('request', (req: Request) => {
        const url = req.url();
        if (!url.startsWith('file://')) {
          externalRequests.push(url);
        }
      });

      try {
        await page.goto(`file://${reportPath.replace(/\\/g, '/')}`, { waitUntil: 'load' });

        // Assert report title and content rendered
        expect(await page.title()).toContain('RuleGap Evidence Report');
        expect(await page.locator('h1').textContent()).toContain('RuleGap — Software Consistency Evidence Report');

        // Assert XSS payload is safely escaped and does not execute
        expect(await page.content()).not.toContain('<script>alert("xss")</script>');
        expect(await page.locator('.panel strong').first().textContent()).toContain('Annual Family Income <script>alert("xss")</script>');

        // Assert summary values match the completed run
        const consistentCount = await page.locator('.summary-card.consistent .summary-val').textContent();
        const mismatchCount = await page.locator('.summary-card.mismatch .summary-val').textContent();
        expect(consistentCount).toBe('3');
        expect(mismatchCount).toBe('4');

        // Assert screenshots are rendered as base64 images and have non-zero dimensions
        const screenshotImages = page.locator('img.screenshot-img');
        const imgCount = await screenshotImages.count();
        expect(imgCount).toBeGreaterThan(0);

        for (let i = 0; i < imgCount; i++) {
          const img = screenshotImages.nth(i);
          const src = await img.getAttribute('src');
          expect(src).toMatch(/^data:image\/png;base64,[A-Za-z0-9+/=]+/);

          // Verify natural dimensions are non-zero (valid image rendered)
          const dimensions = await img.evaluate((el: HTMLImageElement) => ({
            naturalWidth: el.naturalWidth,
            naturalHeight: el.naturalHeight,
            complete: el.complete,
          }));
          expect(dimensions.complete).toBe(true);
          expect(dimensions.naturalWidth).toBeGreaterThan(0);
          expect(dimensions.naturalHeight).toBeGreaterThan(0);
        }

        // Assert zero external network calls were made
        expect(externalRequests).toEqual([]);
      } finally {
        await context.close();
        await browser.close();
      }
    } finally {
      // Cleanup
      await browserPool.close();
      if (fs.existsSync(reportPath)) {
        fs.unlinkSync(reportPath);
      }
    }
  }, 60000);
});
