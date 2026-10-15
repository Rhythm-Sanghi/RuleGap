import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { startServer } from '../../server/server.js';
import { browserPool } from '../../server/runner/browserPool.js';
import { observeFormSubmission } from '../../server/runner/formObserver.js';
import { generateBoundaryTestCases } from '../../shared/ruleEngine.js';
import { SCHOLARSHIP_DEMO_PROBES } from '../../shared/sampleData.js';

describe('Slice 2 E2E: Embedded Fixture & Black-Box Playwright Observer', () => {
  let server: http.Server;
  const testPort = 3005;

  beforeAll(async () => {
    server = await startServer(testPort);
  });

  afterAll(async () => {
    await browserPool.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('verifies Mode A (Inconsistent Fixture) produces exactly 4 confirmed mismatches and 3 consistent outcomes', async () => {
    const browser = await browserPool.getBrowser();
    const cases = generateBoundaryTestCases('<=', 300000, 'INR', SCHOLARSHIP_DEMO_PROBES);
    expect(cases).toHaveLength(7);

    const observations = [];
    const targetUrl = `http://127.0.0.1:${testPort}/fixtures/scholarship?mode=inconsistent`;

    for (const testCase of cases) {
      // Create a fresh hermetic browser context for each test case
      const context = await browserPool.createHermeticContext(browser, testPort);
      const page = await context.newPage();

      try {
        const observation = await observeFormSubmission(page, {
          runId: '11111111-2222-3333-4444-555555555555',
          caseId: testCase.caseId,
          value: testCase.value,
          expectedOutcome: testCase.expectedOutcome,
          targetUrl,
          fieldSelector: '#annual-income',
          submitSelector: '#submit-btn',
          timeoutMs: 10000,
        });

        observations.push(observation);
      } finally {
        await context.close();
      }
    }

    const consistent = observations.filter((o) => o.classification === 'CONSISTENT');
    const mismatches = observations.filter((o) => o.classification === 'CONFIRMED_MISMATCH');
    const inconclusive = observations.filter((o) => o.classification === 'INCONCLUSIVE');
    const errors = observations.filter((o) => o.classification === 'EXECUTION_ERROR');

    expect(consistent).toHaveLength(3);
    expect(mismatches).toHaveLength(4);
    expect(inconclusive).toHaveLength(0);
    expect(errors).toHaveLength(0);

    // Verify exact mismatching values
    const mismatchValues = mismatches.map((m) => m.value);
    expect(mismatchValues).toEqual([250001, 275000, 299999, 300000]);

    // Verify that screenshots were captured for mismatches
    for (const mismatch of mismatches) {
      expect(mismatch.screenshotId).not.toBeNull();
      expect(mismatch.observedFeedbackText).toContain('Annual family income exceeds eligible limit');
    }

    // Verify consistent values: 249999 and 250000 are accepted; 300001 is rejected
    const consistentValues = consistent.map((c) => c.value);
    expect(consistentValues).toEqual([249999, 250000, 300001]);
  });

  it('verifies Mode B (Corrected Fixture) produces exactly 7 consistent outcomes and 0 mismatches', async () => {
    const browser = await browserPool.getBrowser();
    const cases = generateBoundaryTestCases('<=', 300000, 'INR', SCHOLARSHIP_DEMO_PROBES);
    const observations = [];
    const targetUrl = `http://127.0.0.1:${testPort}/fixtures/scholarship?mode=corrected`;

    for (const testCase of cases) {
      const context = await browserPool.createHermeticContext(browser, testPort);
      const page = await context.newPage();

      try {
        const observation = await observeFormSubmission(page, {
          runId: '22222222-3333-4444-5555-666666666666',
          caseId: testCase.caseId,
          value: testCase.value,
          expectedOutcome: testCase.expectedOutcome,
          targetUrl,
          fieldSelector: '#annual-income',
          submitSelector: '#submit-btn',
          timeoutMs: 10000,
        });

        observations.push(observation);
      } finally {
        await context.close();
      }
    }

    const consistent = observations.filter((o) => o.classification === 'CONSISTENT');
    const mismatches = observations.filter((o) => o.classification === 'CONFIRMED_MISMATCH');

    expect(consistent).toHaveLength(7);
    expect(mismatches).toHaveLength(0);
  });

  it('handles missing target field selector as EXECUTION_ERROR', async () => {
    const browser = await browserPool.getBrowser();
    const context = await browserPool.createHermeticContext(browser, testPort);
    const page = await context.newPage();

    try {
      const observation = await observeFormSubmission(page, {
        runId: '33333333-4444-5555-6666-777777777777',
        caseId: 'case-missing',
        value: 200000,
        expectedOutcome: 'ACCEPT',
        targetUrl: `http://127.0.0.1:${testPort}/fixtures/scholarship`,
        fieldSelector: '#non-existent-selector',
        timeoutMs: 2000,
      });

      expect(observation.classification).toBe('EXECUTION_ERROR');
      expect(observation.diagnosticDetails).toContain("Target field selector '#non-existent-selector' not found");
    } finally {
      await context.close();
    }
  });

  it('classifies unrelated required-field error as INCONCLUSIVE rather than policy mismatch', async () => {
    const browser = await browserPool.getBrowser();
    const context = await browserPool.createHermeticContext(browser, testPort);
    const page = await context.newPage();

    try {
      const observation = await observeFormSubmission(page, {
        runId: '44444444-5555-6666-7777-888888888888',
        caseId: 'case-unrelated',
        value: 200000,
        expectedOutcome: 'ACCEPT',
        targetUrl: `http://127.0.0.1:${testPort}/fixtures/scholarship`,
        fieldSelector: '#annual-income',
        timeoutMs: 2000,
        preSubmitHook: async (p) => {
          // Deliberately clear required applicant name before submit
          await p.locator('#applicant-name').fill('');
        },
      });

      expect(observation.classification).toBe('INCONCLUSIVE');
      expect(observation.observedFormOutcome).toBe('INDETERMINATE');
      expect(observation.diagnosticDetails).toContain('unrelated required field');
    } finally {
      await context.close();
    }
  });

  it('blocks unauthorized navigation or redirects to external domains', async () => {
    const browser = await browserPool.getBrowser();
    const context = await browserPool.createHermeticContext(browser, testPort);
    const page = await context.newPage();

    try {
      // Attempting to navigate to external domain should fail due to route abort('blockedbyclient')
      let blocked = false;
      try {
        await page.goto('https://example.com', { timeout: 3000 });
      } catch (err: unknown) {
        blocked = true;
      }
      expect(blocked).toBe(true);
    } finally {
      await context.close();
    }
  });
});
