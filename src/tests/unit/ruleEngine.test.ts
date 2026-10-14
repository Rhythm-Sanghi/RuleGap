import { describe, it, expect } from 'vitest';
import {
  evaluatePolicyExpectation,
  generateBoundaryTestCases,
  compareOutcomes,
  computeSummaryCounts,
  computeSampledMismatchSummary,
} from '../../shared/ruleEngine.js';
import { TestObservation } from '../../shared/contract.js';

describe('ruleEngine: evaluatePolicyExpectation', () => {
  it('correctly evaluates less than or equal to (<=) operator', () => {
    expect(evaluatePolicyExpectation('<=', 300000, 299999)).toBe('ACCEPT');
    expect(evaluatePolicyExpectation('<=', 300000, 300000)).toBe('ACCEPT');
    expect(evaluatePolicyExpectation('<=', 300000, 300001)).toBe('REJECT');
  });

  it('correctly evaluates strictly less than (<) operator', () => {
    expect(evaluatePolicyExpectation('<', 300000, 299999)).toBe('ACCEPT');
    expect(evaluatePolicyExpectation('<', 300000, 300000)).toBe('REJECT');
    expect(evaluatePolicyExpectation('<', 300000, 300001)).toBe('REJECT');
  });

  it('correctly evaluates greater than or equal to (>=) operator', () => {
    expect(evaluatePolicyExpectation('>=', 18, 17)).toBe('REJECT');
    expect(evaluatePolicyExpectation('>=', 18, 18)).toBe('ACCEPT');
    expect(evaluatePolicyExpectation('>=', 18, 19)).toBe('ACCEPT');
  });

  it('correctly evaluates strictly greater than (>) operator', () => {
    expect(evaluatePolicyExpectation('>', 18, 17)).toBe('REJECT');
    expect(evaluatePolicyExpectation('>', 18, 18)).toBe('REJECT');
    expect(evaluatePolicyExpectation('>', 18, 19)).toBe('ACCEPT');
  });

  it('throws on non-safe integers', () => {
    expect(() => evaluatePolicyExpectation('<=', 300000, 1.5)).toThrow(/safe integer/);
    expect(() => evaluatePolicyExpectation('<=', Number.MAX_SAFE_INTEGER + 1, 100)).toThrow(/safe integer/);
  });
});

describe('ruleEngine: generateBoundaryTestCases', () => {
  it('generates exact 7 deduplicated test values for scholarship demo', () => {
    const demoProbes = [249999, 250000, 250001, 275000];
    const cases = generateBoundaryTestCases('<=', 300000, 'INR', demoProbes);

    expect(cases).toHaveLength(7);
    const values = cases.map((c) => c.value);
    expect(values).toEqual([249999, 250000, 250001, 275000, 299999, 300000, 300001]);

    // Check expected outcomes
    expect(cases[0].expectedOutcome).toBe('ACCEPT'); // 249999
    expect(cases[1].expectedOutcome).toBe('ACCEPT'); // 250000
    expect(cases[2].expectedOutcome).toBe('ACCEPT'); // 250001
    expect(cases[3].expectedOutcome).toBe('ACCEPT'); // 275000
    expect(cases[4].expectedOutcome).toBe('ACCEPT'); // 299999
    expect(cases[5].expectedOutcome).toBe('ACCEPT'); // 300000
    expect(cases[6].expectedOutcome).toBe('REJECT'); // 300001
  });

  it('deduplicates probes that overlap with boundary points', () => {
    const overlappingProbes = [300000, 300001, 200000];
    const cases = generateBoundaryTestCases('<=', 300000, 'INR', overlappingProbes);

    const values = cases.map((c) => c.value);
    // Boundaries are 299999, 300000, 300001; overlapping 300000, 300001 must not appear twice
    expect(values).toEqual([200000, 299999, 300000, 300001]);
  });
});

describe('ruleEngine: compareOutcomes', () => {
  it('classifies policy matches as CONSISTENT', () => {
    expect(compareOutcomes('ACCEPT', 'ACCEPTED')).toBe('CONSISTENT');
    expect(compareOutcomes('REJECT', 'REJECTED')).toBe('CONSISTENT');
  });

  it('classifies policy contradictions as CONFIRMED_MISMATCH', () => {
    expect(compareOutcomes('ACCEPT', 'REJECTED')).toBe('CONFIRMED_MISMATCH');
    expect(compareOutcomes('REJECT', 'ACCEPTED')).toBe('CONFIRMED_MISMATCH');
  });

  it('classifies null or indeterminate as INCONCLUSIVE', () => {
    expect(compareOutcomes('ACCEPT', 'INDETERMINATE')).toBe('INCONCLUSIVE');
    expect(compareOutcomes('ACCEPT', null)).toBe('INCONCLUSIVE');
    expect(compareOutcomes('REJECT', null)).toBe('INCONCLUSIVE');
  });
});

describe('ruleEngine: computeSummaryCounts', () => {
  it('enforces totalScheduled invariant and counts accurately', () => {
    const observations: TestObservation[] = [
      {
        caseId: '1',
        value: 249999,
        expectedOutcome: 'ACCEPT',
        observedFormOutcome: 'ACCEPTED',
        observedFeedbackText: 'Accepted',
        classification: 'CONSISTENT',
        lifecycleState: 'COMPLETED',
        durationMs: 120,
        screenshotId: null,
        diagnosticDetails: null,
        executedAt: new Date().toISOString(),
      },
      {
        caseId: '2',
        value: 275000,
        expectedOutcome: 'ACCEPT',
        observedFormOutcome: 'REJECTED',
        observedFeedbackText: 'Income exceeds limit',
        classification: 'CONFIRMED_MISMATCH',
        lifecycleState: 'COMPLETED',
        durationMs: 110,
        screenshotId: 'shot-1',
        diagnosticDetails: null,
        executedAt: new Date().toISOString(),
      },
      {
        caseId: '3',
        value: 300000,
        expectedOutcome: 'ACCEPT',
        observedFormOutcome: null,
        observedFeedbackText: null,
        classification: null,
        lifecycleState: 'INTERRUPTED',
        durationMs: 50,
        screenshotId: null,
        diagnosticDetails: null,
        executedAt: null,
      },
      {
        caseId: '4',
        value: 300001,
        expectedOutcome: 'REJECT',
        observedFormOutcome: null,
        observedFeedbackText: null,
        classification: null,
        lifecycleState: 'NOT_EXECUTED',
        durationMs: 0,
        screenshotId: null,
        diagnosticDetails: null,
        executedAt: null,
      },
    ];

    const counts = computeSummaryCounts(observations, 4);

    expect(counts.consistent).toBe(1);
    expect(counts.confirmedMismatch).toBe(1);
    expect(counts.interrupted).toBe(1);
    expect(counts.notExecuted).toBe(1);
    expect(counts.inconclusive).toBe(0);
    expect(counts.executionError).toBe(0);

    const sum =
      counts.consistent +
      counts.confirmedMismatch +
      counts.inconclusive +
      counts.executionError +
      counts.notExecuted +
      counts.interrupted;
    expect(sum).toBe(counts.totalScheduled);
  });
});

describe('ruleEngine: computeSampledMismatchSummary', () => {
  it('returns lowest and highest mismatching values with disclaimer', () => {
    const observations: TestObservation[] = [
      {
        caseId: '1',
        value: 250001,
        expectedOutcome: 'ACCEPT',
        observedFormOutcome: 'REJECTED',
        observedFeedbackText: 'Exceeds limit',
        classification: 'CONFIRMED_MISMATCH',
        lifecycleState: 'COMPLETED',
        durationMs: 100,
        screenshotId: null,
        diagnosticDetails: null,
        executedAt: null,
      },
      {
        caseId: '2',
        value: 300000,
        expectedOutcome: 'ACCEPT',
        observedFormOutcome: 'REJECTED',
        observedFeedbackText: 'Exceeds limit',
        classification: 'CONFIRMED_MISMATCH',
        lifecycleState: 'COMPLETED',
        durationMs: 100,
        screenshotId: null,
        diagnosticDetails: null,
        executedAt: null,
      },
    ];

    const summary = computeSampledMismatchSummary(observations);
    expect(summary).not.toBeNull();
    expect(summary!.lowestMismatchValue).toBe(250001);
    expect(summary!.highestMismatchValue).toBe(300000);
    expect(summary!.disclaimer).toContain('Intermediate un-sampled values are not tested');
  });

  it('returns null when there are no mismatches', () => {
    const summary = computeSampledMismatchSummary([]);
    expect(summary).toBeNull();
  });
});
