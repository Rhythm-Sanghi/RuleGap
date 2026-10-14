import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import crypto from 'crypto';
import { generateHtmlEvidenceReport, escapeHtml } from '../../server/report/reportGenerator.js';
import { VerificationRunSnapshot } from '../../shared/contract.js';
import { runStore } from '../../server/storage/runStore.js';
import { evidenceStore } from '../../server/storage/evidenceStore.js';
import { createApp } from '../../server/server.js';

describe('Slice 5 Integration: Standalone Offline HTML Report Generator', () => {
  let server: http.Server;
  let serverPort: number;

  beforeAll(async () => {
    const app = createApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        serverPort = typeof addr === 'object' && addr ? addr.port : 3000;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (server) {
      server.closeAllConnections?.();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
  });

  const createMockSnapshot = (runId: string): VerificationRunSnapshot => ({
    runId,
    planId: crypto.randomUUID(),
    contract: {
      id: crypto.randomUUID(),
      fieldName: 'Annual Family Income <script>alert("xss")</script>',
      operator: '<=',
      threshold: 300000,
      unit: 'INR',
      sourceExcerpt: 'Income cannot exceed INR 3,00,000. <b>Crucial Policy</b>',
      sourceDocumentName: 'scholarship-policy.txt',
      sourceType: 'sample_policy',
      confirmedAt: new Date().toISOString(),
    },
    fixtureMode: 'inconsistent',
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    status: 'COMPLETED_MISMATCHES',
    observations: [
      {
        caseId: 'case-1',
        value: 250001,
        expectedOutcome: 'ACCEPT',
        observedFormOutcome: 'REJECTED',
        observedFeedbackText: 'Income ₹250,001 exceeds ceiling of ₹250,000 <img src=x onerror=alert(1)>',
        classification: 'CONFIRMED_MISMATCH',
        lifecycleState: 'COMPLETED',
        durationMs: 145,
        screenshotId: 'shot-1',
        diagnosticDetails: 'Observed rejection on valid value',
        executedAt: new Date().toISOString(),
      },
    ],
    summaryCounts: {
      totalScheduled: 1,
      consistent: 0,
      confirmedMismatch: 1,
      inconclusive: 0,
      executionError: 0,
      notExecuted: 0,
      interrupted: 0,
    },
    sampledMismatchSummary: {
      lowestMismatchValue: 250001,
      highestMismatchValue: 250001,
      disclaimer: 'Discrepancies identified strictly at tested values.',
    },
  });

  it('escapes dangerous HTML characters preventing injection vulnerabilities', () => {
    expect(escapeHtml('<script>alert("test")</script>')).toBe(
      '&lt;script&gt;alert(&quot;test&quot;)&lt;/script&gt;'
    );
    expect(escapeHtml('Rule & Policy')).toBe('Rule &amp; Policy');
  });

  it('generates a self-contained offline HTML report without external resources', async () => {
    const runId = crypto.randomUUID();
    const snapshot = createMockSnapshot(runId);

    // Save a mock PNG screenshot to evidenceStore
    const fakePng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    await evidenceStore.saveScreenshot(runId, 'case-1', fakePng);

    const html = await generateHtmlEvidenceReport(snapshot);

    // Assert strictly escaped content
    expect(html).not.toContain('<script>alert("xss")</script>');
    expect(html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    expect(html).toContain('data:image/png;base64,');

    // Assert self-contained: zero external network scripts or links
    expect(html).not.toMatch(/src=["']https?:\/\//i);
    expect(html).not.toMatch(/href=["']https?:\/\//i);

    // Assert structural sections
    expect(html).toContain('RuleGap — Software Consistency Evidence Report');
    expect(html).toContain('Confirmed Policy Rule Contract');
    expect(html).toContain('Observed Browser Evidence Matrix');
    expect(html).toContain('CONFIRMED MISMATCH');
    expect(html).toContain('250,001');
  });

  it('serves the report download via GET /api/runs/:id/report with attachment headers', async () => {
    const runId = crypto.randomUUID();
    const snapshot = createMockSnapshot(runId);
    await runStore.saveFinalizedRun(snapshot);

    const res = await fetch(`http://127.0.0.1:${serverPort}/api/runs/${runId}/report`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(res.headers.get('content-disposition')).toContain('attachment');
    expect(res.headers.get('content-disposition')).toContain(`rulegap-evidence-${runId.slice(0, 8)}.html`);

    const body = await res.text();
    expect(body).toContain('RuleGap — Software Consistency Evidence Report');
  });

  it('returns 404 when requesting a report for a nonexistent run', async () => {
    const missingId = crypto.randomUUID();
    const res = await fetch(`http://127.0.0.1:${serverPort}/api/runs/${missingId}/report`);
    expect(res.status).toBe(404);
  });
});
