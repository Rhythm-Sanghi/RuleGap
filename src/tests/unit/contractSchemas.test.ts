import { describe, it, expect } from 'vitest';
import {
  RuleContractSchema,
  BoundaryTestCaseSchema,
  TestPlanRecordSchema,
  TestObservationSchema,
  SummaryCountsSchema,
  VerificationRunSnapshotSchema,
} from '../../shared/contract.js';

describe('contractSchemas: Zod Validation & Type Invariants', () => {
  it('validates a correct RuleContract', () => {
    const valid = {
      id: 'd8c7b8e1-5f2a-4c91-9e73-1b2c3d4e5f60',
      fieldName: 'Annual Family Income',
      operator: '<=',
      threshold: 300000,
      unit: 'INR',
      sourceExcerpt: 'Applicants with annual family income of ₹300,000 or less are eligible.',
      sourceDocumentName: 'scholarship_policy.txt',
      sourceType: 'sample_policy',
      confirmedAt: '2026-10-14T12:00:00.000Z',
    };

    const parsed = RuleContractSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
  });

  it('rejects an invalid operator or non-safe integer threshold', () => {
    const invalidOp = {
      id: 'd8c7b8e1-5f2a-4c91-9e73-1b2c3d4e5f60',
      fieldName: 'Income',
      operator: '==', // not permitted
      threshold: 300000,
      unit: 'INR',
      sourceExcerpt: 'Some excerpt',
      sourceDocumentName: 'doc.txt',
      sourceType: 'pasted_text',
      confirmedAt: '2026-10-14T12:00:00.000Z',
    };
    expect(RuleContractSchema.safeParse(invalidOp).success).toBe(false);

    const invalidThreshold = {
      ...invalidOp,
      operator: '<=',
      threshold: 300000.5, // not an integer
    };
    expect(RuleContractSchema.safeParse(invalidThreshold).success).toBe(false);
  });

  it('validates a BoundaryTestCase', () => {
    const valid = {
      caseId: 'case-1-299999',
      value: 299999,
      unit: 'INR',
      expectedOutcome: 'ACCEPT',
      rationale: 'Predecessor to boundary',
      isDemoProbe: false,
    };
    expect(BoundaryTestCaseSchema.safeParse(valid).success).toBe(true);

    const invalid = {
      ...valid,
      expectedOutcome: 'MAYBE', // invalid
    };
    expect(BoundaryTestCaseSchema.safeParse(invalid).success).toBe(false);
  });

  it('validates TestPlanRecord', () => {
    const validPlan = {
      planId: 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d',
      contractId: 'd8c7b8e1-5f2a-4c91-9e73-1b2c3d4e5f60',
      fixtureId: 'scholarship',
      fixtureMode: 'inconsistent',
      targetFieldSelector: '#annual-income',
      cases: [
        {
          caseId: 'case-1-250000',
          value: 250000,
          unit: 'INR',
          expectedOutcome: 'ACCEPT',
          rationale: 'Demo probe',
          isDemoProbe: true,
        },
      ],
      createdAt: '2026-10-14T12:00:00.000Z',
      approvedAt: null,
      isApproved: false,
    };
    expect(TestPlanRecordSchema.safeParse(validPlan).success).toBe(true);
  });

  it('validates TestObservation and strict states', () => {
    const validObs = {
      caseId: 'case-1',
      value: 250000,
      expectedOutcome: 'ACCEPT',
      observedFormOutcome: 'ACCEPTED',
      observedFeedbackText: 'Registration successful',
      classification: 'CONSISTENT',
      lifecycleState: 'COMPLETED',
      durationMs: 145,
      screenshotId: null,
      diagnosticDetails: null,
      executedAt: '2026-10-14T12:00:05.000Z',
    };
    expect(TestObservationSchema.safeParse(validObs).success).toBe(true);

    const invalidLifecycle = {
      ...validObs,
      lifecycleState: 'UNKNOWN_STATE',
    };
    expect(TestObservationSchema.safeParse(invalidLifecycle).success).toBe(false);
  });

  it('validates SummaryCounts schema', () => {
    const validCounts = {
      consistent: 3,
      confirmedMismatch: 4,
      inconclusive: 0,
      executionError: 0,
      notExecuted: 0,
      interrupted: 0,
      totalScheduled: 7,
    };
    expect(SummaryCountsSchema.safeParse(validCounts).success).toBe(true);

    const negativeCount = {
      ...validCounts,
      confirmedMismatch: -1,
    };
    expect(SummaryCountsSchema.safeParse(negativeCount).success).toBe(false);
  });

  it('validates a complete VerificationRunSnapshot', () => {
    const validSnapshot = {
      runId: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e',
      planId: 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d',
      startedAt: '2026-10-14T12:00:00.000Z',
      completedAt: '2026-10-14T12:00:15.000Z',
      status: 'COMPLETED_MISMATCHES',
      contract: {
        id: 'd8c7b8e1-5f2a-4c91-9e73-1b2c3d4e5f60',
        fieldName: 'Annual Family Income',
        operator: '<=',
        threshold: 300000,
        unit: 'INR',
        sourceExcerpt: 'Applicants with annual family income of ₹300,000 or less are eligible.',
        sourceDocumentName: 'scholarship_policy.txt',
        sourceType: 'sample_policy',
        confirmedAt: '2026-10-14T12:00:00.000Z',
      },
      fixtureMode: 'inconsistent',
      observations: [],
      summaryCounts: {
        consistent: 3,
        confirmedMismatch: 4,
        inconclusive: 0,
        executionError: 0,
        notExecuted: 0,
        interrupted: 0,
        totalScheduled: 7,
      },
      sampledMismatchSummary: {
        lowestMismatchValue: 250001,
        highestMismatchValue: 300000,
        disclaimer: 'Discrepancy confirmed at 4 tested values.',
      },
    };

    expect(VerificationRunSnapshotSchema.safeParse(validSnapshot).success).toBe(true);
  });
});
