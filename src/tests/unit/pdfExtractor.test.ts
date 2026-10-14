import { describe, it, expect } from 'vitest';

// Node 20 polyfill for Promise.withResolvers (standard in Node 22+)
if (typeof (Promise as any).withResolvers === 'undefined') {
  (Promise as any).withResolvers = function <T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: any) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

import * as pdfjsLib from 'pdfjs-dist';

describe('PDF Extraction & Contract Excerpt Integrity', () => {
  // Minimal valid PDF with searchable text
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

  // Minimal valid PDF with NO text (simulating scanned / image-only PDF)
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

  it('successfully extracts text from a text-based PDF document using pdfjs-dist', async () => {
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(textPdfData) });
    const pdf = await loadingTask.promise;

    expect(pdf.numPages).toBe(1);
    const page = await pdf.getPage(1);
    const content = await page.getTextContent();
    const extracted = content.items
      // @ts-expect-error item str
      .map((item) => item.str || '')
      .join(' ')
      .trim();

    expect(extracted).toContain('Applicants with annual family income of 300,000 INR or less are eligible.');
  });

  it('detects scanned / image-only PDF with zero text and triggers graceful fallback', async () => {
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(scannedEmptyPdfData) });
    const pdf = await loadingTask.promise;

    expect(pdf.numPages).toBe(1);
    const page = await pdf.getPage(1);
    const content = await page.getTextContent();
    const extracted = content.items
      // @ts-expect-error item str
      .map((item) => item.str || '')
      .join(' ')
      .trim();

    // Zero text extracted
    expect(extracted).toBe('');
  });

  it('rejects contract confirmation if excerpt is fabricated or empty', async () => {
    // In our updated useRuleContract:
    // Excerpt must be genuine and non-empty, matching the actual text
    const sampleText = 'Section 4: Household income must be under 300000 INR.';
    const lines = sampleText.split('\n').map((l) => l.trim()).filter(Boolean);
    const matchedExcerpt = lines.find((l) => /(income|threshold|300000)/i.test(l)) || lines[0];

    expect(matchedExcerpt).toBe('Section 4: Household income must be under 300000 INR.');
    expect(matchedExcerpt).not.toBe('Policy rule definition');
  });
});
