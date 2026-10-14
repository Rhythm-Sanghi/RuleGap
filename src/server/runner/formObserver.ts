import { Page } from 'playwright';
import {
  PolicyExpectation,
  FormOutcome,
  VerificationClassification,
  TestObservation,
} from '../../shared/contract.js';
import { compareOutcomes } from '../../shared/ruleEngine.js';
import { evidenceStore } from '../storage/evidenceStore.js';

export interface FormObserverOptions {
  runId: string;
  caseId: string;
  value: number;
  expectedOutcome: PolicyExpectation;
  targetUrl: string;
  fieldSelector: string;
  submitSelector?: string;
  timeoutMs?: number;
  preSubmitHook?: (page: Page) => Promise<void>;
}

export async function observeFormSubmission(
  page: Page,
  options: FormObserverOptions
): Promise<TestObservation> {
  const {
    runId,
    caseId,
    value,
    expectedOutcome,
    targetUrl,
    fieldSelector,
    submitSelector = '#submit-btn',
    timeoutMs = 5000,
    preSubmitHook,
  } = options;

  const startTime = Date.now();
  let observedOutcome: FormOutcome | null = null;
  let feedbackText: string | null = null;
  let diagnosticDetails: string | null = null;
  let classification: VerificationClassification | null = null;
  let screenshotId: string | null = null;

  try {
    // 1. Navigate to target URL
    await page.goto(targetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: timeoutMs,
    });

    // 2. Locate target input field
    const inputElement = page.locator(fieldSelector);
    const inputCount = await inputElement.count();
    if (inputCount === 0) {
      const durationMs = Date.now() - startTime;
      return {
        caseId,
        value,
        expectedOutcome,
        observedFormOutcome: null,
        observedFeedbackText: null,
        classification: 'EXECUTION_ERROR',
        lifecycleState: 'COMPLETED',
        durationMs,
        screenshotId: null,
        diagnosticDetails: `Target field selector '${fieldSelector}' not found in DOM`,
        executedAt: new Date().toISOString(),
      };
    }

    // 3. Enter input value
    await inputElement.fill(String(value), { timeout: timeoutMs });

    // 4. Locate and click submit button
    const submitBtn = page.locator(submitSelector);
    if ((await submitBtn.count()) === 0) {
      const durationMs = Date.now() - startTime;
      return {
        caseId,
        value,
        expectedOutcome,
        observedFormOutcome: null,
        observedFeedbackText: null,
        classification: 'EXECUTION_ERROR',
        lifecycleState: 'COMPLETED',
        durationMs,
        screenshotId: null,
        diagnosticDetails: `Submit selector '${submitSelector}' not found in DOM`,
        executedAt: new Date().toISOString(),
      };
    }

    if (preSubmitHook) {
      await preSubmitHook(page);
    }

    await submitBtn.click({ timeout: timeoutMs });

    // 5. Race observable validation outcome selectors
    const acceptedLocator = page.locator('[data-testid="status-accepted"]');
    const fieldErrorLocator = page.locator('[data-testid="field-error"]');
    const unrelatedErrorLocator = page.locator('[data-testid="unrelated-error"]');

    const result = await Promise.race([
      acceptedLocator
        .waitFor({ state: 'visible', timeout: timeoutMs })
        .then(() => 'ACCEPTED' as const),
      fieldErrorLocator
        .waitFor({ state: 'visible', timeout: timeoutMs })
        .then(() => 'FIELD_ERROR' as const),
      unrelatedErrorLocator
        .waitFor({ state: 'visible', timeout: timeoutMs })
        .then(() => 'UNRELATED_ERROR' as const),
    ]).catch(() => 'TIMEOUT' as const);

    if (result === 'ACCEPTED') {
      observedOutcome = 'ACCEPTED';
      feedbackText = (await acceptedLocator.textContent())?.trim() ?? 'Application accepted';
    } else if (result === 'FIELD_ERROR') {
      observedOutcome = 'REJECTED';
      feedbackText = (await fieldErrorLocator.textContent())?.trim() ?? 'Form rejected';
    } else if (result === 'UNRELATED_ERROR') {
      observedOutcome = 'INDETERMINATE';
      feedbackText = (await unrelatedErrorLocator.textContent())?.trim() ?? 'Unrelated validation error';
      diagnosticDetails = 'Form validation failed due to unrelated required field or validation error';
    } else {
      observedOutcome = 'INDETERMINATE';
      diagnosticDetails = `No explicit acceptance or field rejection indicator observed within ${timeoutMs}ms`;
    }

    classification = compareOutcomes(expectedOutcome, observedOutcome);

    // Capture screenshot evidence for all completed form submissions
    try {
      const screenshotBuffer = await page.screenshot({ fullPage: false });
      screenshotId = await evidenceStore.saveScreenshot(runId, caseId, screenshotBuffer);
    } catch (err: unknown) {
      diagnosticDetails = (diagnosticDetails ? diagnosticDetails + '; ' : '') + `Screenshot failed: ${String(err)}`;
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    classification = 'EXECUTION_ERROR';
    diagnosticDetails = `Browser interaction failed: ${errorMsg}`;
  }

  const durationMs = Date.now() - startTime;

  return {
    caseId,
    value,
    expectedOutcome,
    observedFormOutcome: observedOutcome,
    observedFeedbackText: feedbackText,
    classification,
    lifecycleState: 'COMPLETED',
    durationMs,
    screenshotId,
    diagnosticDetails,
    executedAt: new Date().toISOString(),
  };
}
