import { z } from 'zod';

export const NumericOperatorSchema = z.enum(['<', '<=', '>', '>=']);
export type NumericOperator = z.infer<typeof NumericOperatorSchema>;

export const SourceTypeSchema = z.enum([
  'extracted_pdf',
  'manual_fallback_pdf',
  'pasted_text',
  'sample_policy',
]);
export type SourceType = z.infer<typeof SourceTypeSchema>;

export const RuleContractSchema = z.object({
  id: z.string().uuid(),
  fieldName: z.string().min(1).max(100),
  operator: NumericOperatorSchema,
  threshold: z.number().int().safe(),
  unit: z.string().min(1).max(20),
  sourceExcerpt: z.string().min(1).max(5000),
  sourceDocumentName: z.string().max(255),
  sourceType: SourceTypeSchema,
  confirmedAt: z.string().datetime(),
});
export type RuleContract = z.infer<typeof RuleContractSchema>;

export const PolicyExpectationSchema = z.enum(['ACCEPT', 'REJECT']);
export type PolicyExpectation = z.infer<typeof PolicyExpectationSchema>;

export const BoundaryTestCaseSchema = z.object({
  caseId: z.string().regex(/^[a-zA-Z0-9_-]+$/),
  value: z.number().int().safe(),
  unit: z.string(),
  expectedOutcome: PolicyExpectationSchema,
  rationale: z.string(),
  isDemoProbe: z.boolean(),
});
export type BoundaryTestCase = z.infer<typeof BoundaryTestCaseSchema>;

export const TestPlanRecordSchema = z.object({
  planId: z.string().uuid(),
  contractId: z.string().uuid(),
  fixtureId: z.literal('scholarship'),
  fixtureMode: z.enum(['inconsistent', 'corrected']),
  targetFieldSelector: z.literal('#annual-income'),
  cases: z.array(BoundaryTestCaseSchema).min(1).max(25),
  createdAt: z.string().datetime(),
  approvedAt: z.string().datetime().nullable(),
  isApproved: z.boolean(),
});
export type TestPlanRecord = z.infer<typeof TestPlanRecordSchema>;

export const FormOutcomeSchema = z.enum(['ACCEPTED', 'REJECTED', 'INDETERMINATE']);
export type FormOutcome = z.infer<typeof FormOutcomeSchema>;

// Strict 4 verification outcomes (mutually exclusive)
export const VerificationClassificationSchema = z.enum([
  'CONSISTENT',
  'CONFIRMED_MISMATCH',
  'INCONCLUSIVE',
  'EXECUTION_ERROR',
]);
export type VerificationClassification = z.infer<typeof VerificationClassificationSchema>;

// Lifecycle states of a test case
export const CaseLifecycleStateSchema = z.enum([
  'PENDING',
  'RUNNING',
  'COMPLETED',
  'NOT_EXECUTED',
  'INTERRUPTED',
]);
export type CaseLifecycleState = z.infer<typeof CaseLifecycleStateSchema>;

export const TestObservationSchema = z.object({
  caseId: z.string(),
  value: z.number().int(),
  expectedOutcome: PolicyExpectationSchema,
  observedFormOutcome: FormOutcomeSchema.nullable(),
  observedFeedbackText: z.string().nullable(),
  classification: VerificationClassificationSchema.nullable(),
  lifecycleState: CaseLifecycleStateSchema,
  durationMs: z.number().nonnegative(),
  screenshotId: z.string().nullable(),
  diagnosticDetails: z.string().nullable(),
  executedAt: z.string().datetime().nullable(),
});
export type TestObservation = z.infer<typeof TestObservationSchema>;

// Run statuses: Nonterminal vs Terminal
export const RunStatusSchema = z.enum([
  'QUEUED',
  'RUNNING',
  'CANCELLATION_REQUESTED',
  'COMPLETED_CONSISTENT',
  'COMPLETED_MISMATCHES',
  'COMPLETED_WITH_UNCERTAINTY',
  'CANCELLED_PARTIAL',
  'FAILED',
]);
export type RunStatus = z.infer<typeof RunStatusSchema>;

export const SummaryCountsSchema = z.object({
  consistent: z.number().int().nonnegative(),
  confirmedMismatch: z.number().int().nonnegative(),
  inconclusive: z.number().int().nonnegative(),
  executionError: z.number().int().nonnegative(),
  notExecuted: z.number().int().nonnegative(),
  interrupted: z.number().int().nonnegative(),
  totalScheduled: z.number().int().positive(),
});
export type SummaryCounts = z.infer<typeof SummaryCountsSchema>;

export const SampledMismatchSummarySchema = z.object({
  lowestMismatchValue: z.number().nullable(),
  highestMismatchValue: z.number().nullable(),
  disclaimer: z.string(),
});
export type SampledMismatchSummary = z.infer<typeof SampledMismatchSummarySchema>;

export const VerificationRunSnapshotSchema = z.object({
  runId: z.string().uuid(),
  planId: z.string().uuid(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  status: RunStatusSchema,
  contract: RuleContractSchema,
  fixtureMode: z.enum(['inconsistent', 'corrected']),
  observations: z.array(TestObservationSchema),
  summaryCounts: SummaryCountsSchema,
  sampledMismatchSummary: SampledMismatchSummarySchema.nullable(),
});
export type VerificationRunSnapshot = z.infer<typeof VerificationRunSnapshotSchema>;
