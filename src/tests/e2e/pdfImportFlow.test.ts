import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { chromium, Browser, Page, Request } from 'playwright';
import { createApp } from '../../server/server.js';
import { browserPool, getCommonChromiumLaunchOptions } from '../../server/runner/browserPool.js';

describe('Slice 4 E2E: Real Production PDF Import, Worker Verification & Fallback', () => {
  let server: http.Server;
  let serverPort: number;
  let browser: Browser;
  let page: Page;
  let tempDir: string;
  let textPdfPath: string;
  let scannedPdfPath: string;

  const failedRequests: { url: string; error: string }[] = [];
  const consoleErrors: string[] = [];
  const successfulResponses: { url: string; status: number }[] = [];

  // Minimal valid PDF with searchable text stream
  const textPdfData = Buffer.from(`%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj
4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
5 0 obj << /Length 74 >> stream
BT
/F1 12 Tf
100 700 Td
(Applicants with annual family income of 300,000 INR or less are eligible.) Tj
ET
endstream endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000236 00000 n 
0000000305 00000 n 
trailer << /Size 6 /Root 1 0 R >>
startxref
431
%%EOF
`);

  // Minimal valid PDF with zero text (simulating image-only/scanned document)
  const scannedEmptyPdfData = Buffer.from(`%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >> endobj
4 0 obj << /Length 0 >> stream
endstream endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000204 00000 n 
trailer << /Size 5 /Root 1 0 R >>
startxref
254
%%EOF
`);

  beforeAll(async () => {
    // Write sample PDF files to temp directory
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rulegap-pdf-e2e-'));
    textPdfPath = path.join(tempDir, 'sample-policy.pdf');
    scannedPdfPath = path.join(tempDir, 'scanned-policy.pdf');
    fs.writeFileSync(textPdfPath, textPdfData);
    fs.writeFileSync(scannedPdfPath, scannedEmptyPdfData);

    // Launch server on random port serving production client
    const app = createApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        serverPort = typeof addr === 'object' && addr ? addr.port : 3000;
        resolve();
      });
    });

    browser = await chromium.launch(getCommonChromiumLaunchOptions());
    page = await browser.newPage();

    // Listen to network and console diagnostics
    page.on('requestfailed', (req: Request) => {
      failedRequests.push({
        url: req.url(),
        error: req.failure()?.errorText || 'Unknown failure',
      });
    });

    page.on('response', (res) => {
      successfulResponses.push({
        url: res.url(),
        status: res.status(),
      });
    });

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
  });

  afterAll(async () => {
    await page?.close().catch(() => {});
    await browser?.close().catch(() => {});
    await browserPool.close();
    if (server) {
      server.closeAllConnections?.();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
    // Clean up temporary PDFs
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }, 15000);

  it('loads the workbench and displays the PDF import interface', async () => {
    await page.goto(`http://127.0.0.1:${serverPort}`);

    expect(await page.locator('.brand-logo').textContent()).toContain('RuleGap');
    const uploadInput = page.locator('#pdf-upload');
    expect(await uploadInput.count()).toBe(1);
    const selectBtn = page.locator('button:has-text("Select PDF File to Extract Text")');
    expect(await selectBtn.isVisible()).toBe(true);
  });

  it('uploads a real text-based PDF via UI, loads pdf.worker successfully with 0 errors, and extracts text', async () => {
    // Clear tracked errors before this test
    failedRequests.length = 0;
    consoleErrors.length = 0;

    // Attach text PDF
    await page.setInputFiles('#pdf-upload', textPdfPath);

    // Wait for extracted text to appear in textarea
    const policyArea = page.locator('#policy-text-area');
    await page.waitForFunction(
      () => {
        const el = document.querySelector('#policy-text-area') as HTMLTextAreaElement | null;
        return el && el.value.includes('Applicants with annual family income of 300,000 INR or less are eligible.');
      },
      { timeout: 5000 }
    );

    const extractedVal = await policyArea.inputValue();
    expect(extractedVal).toContain('Applicants with annual family income of 300,000 INR or less are eligible.');

    // Verify document metadata
    const docMeta = await page.locator('.document-meta-strip').textContent();
    expect(docMeta).toContain('sample-policy.pdf');
    expect(docMeta).toContain('Extracted PDF');

    // Verify pdf.worker was loaded successfully (HTTP 200)
    const workerResponses = successfulResponses.filter(
      (r) => r.url.includes('pdf.worker') || r.url.includes('pdfjs-dist')
    );
    expect(workerResponses.length).toBeGreaterThan(0);
    for (const wr of workerResponses) {
      expect(wr.status).toBe(200);
    }

    // Verify zero failed requests and zero console errors
    expect(failedRequests).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  it('uploads an image-only / scanned PDF, displays fallback alert, and allows pasting text', async () => {
    // Attach scanned PDF
    await page.setInputFiles('#pdf-upload', scannedPdfPath);

    // Wait for warning callout to appear
    await page.waitForSelector('.callout-warning:has-text("PDF Extraction Issue")', { timeout: 5000 });
    const warningText = await page.locator('.callout-warning').textContent();
    expect(warningText).toContain("Couldn't extract readable text from this PDF");

    // Verify fallback button with filename
    const fallbackBtn = page.locator('button:has-text("Paste Text Instead (scanned-policy.pdf)")');
    expect(await fallbackBtn.isVisible()).toBe(true);

    // Click fallback button
    await fallbackBtn.click();

    // Verify warning callout cleared
    expect(await page.locator('.callout-warning').count()).toBe(0);

    // Type/paste text manually into policy textarea
    const policyArea = page.locator('#policy-text-area');
    await policyArea.fill('Manual pasted rule: Income under 300000 INR required.');
    expect(await policyArea.inputValue()).toBe('Manual pasted rule: Income under 300000 INR required.');
  });
});
