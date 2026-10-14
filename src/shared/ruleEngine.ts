import {
  NumericOperator,
  PolicyExpectation,
  BoundaryTestCase,
  FormOutcome,
  VerificationClassification,
  TestObservation,
  SummaryCounts,
  SampledMismatchSummary,
} from './contract.js';

/**
 * Pure deterministic policy rule evaluator.
 * Evaluates whether an input value satisfies a confirmed numeric policy constraint.
 */
export function evaluatePolicyExpectation(
  operator: NumericOperator,
  threshold: number,
  inputValue: number
): PolicyExpectation {
  if (!Number.isSafeInteger(threshold)) {
    throw new Error(`Threshold ${threshold} must be a safe integer`);
  }
  if (!Number.isSafeInteger(inputValue)) {
    throw new Error(`Input value ${inputValue} must be a safe integer`);
  }

  let satisfies: boolean;
  switch (operator) {
    case '<':
      satisfies = inputValue < threshold;
      break;
    case '<=':
      satisfies = inputValue <= threshold;
      break;
    case '>':
      satisfies = inputValue > threshold;
      break;
    case '>=':
      satisfies = inputValue >= threshold;
      break;
    default: {
      const exhaustiveCheck: never = operator;
      throw new Error(`Unsupported operator: ${exhaustiveCheck}`);
    }
  }

  return satisfies ? 'ACCEPT' : 'REJECT';
}

/**
 * Generates deterministic boundary test cases for a numeric policy rule,
 * with optional explicitly configured demonstration probes.
 */
export function generateBoundaryTestCases(
  operator: NumericOperator,
  threshold: number,
  unit: string,
  demoProbes: number[] = []
): BoundaryTestCase[] {
  if (!Number.isSafeInteger(threshold)) {
    throw new Error(`Threshold ${threshold} is not a safe integer`);
  }

  // Generic boundary points: threshold - 1, threshold, threshold + 1
  const boundaryPoints = new Set<number>();
  if (Number.isSafeInteger(threshold - 1)) boundaryPoints.add(threshold - 1);
  boundaryPoints.add(threshold);
  if (Number.isSafeInteger(threshold + 1)) boundaryPoints.add(threshold + 1);

  // Combine generic boundaries with demonstration probes
  const allValues = new Set<number>(boundaryPoints);
  for (const probe of demoProbes) {
    if (Number.isSafeInteger(probe)) {
      allValues.add(probe);
    }
  }

  // Sort values ascending
  const sortedValues = Array.from(allValues).sort((a, b) => a - b);

  return sortedValues.map((val, idx) => {
    const isCoreBoundary = boundaryPoints.has(val);
    let rationale: string;

    if (val === threshold) {
      const boundaryType = operator.includes('=') ? 'inclusive' : 'exclusive';
      rationale = `Exact policy boundary threshold (${threshold} ${unit}, ${boundaryType})`;
    } else if (val === threshold - 1) {
      rationale = `Immediate integer predecessor to policy threshold (${val} ${unit})`;
    } else if (val === threshold + 1) {
      rationale = `Immediate integer successor to policy threshold (${val} ${unit})`;
    } else if (val === 0) {
      rationale = `Zero baseline value (${val} ${unit})`;
    } else {
      rationale = `Configured demonstration probe (${val} ${unit})`;
    }

    const expectedOutcome = evaluatePolicyExpectation(operator, threshold, val);

    return {
      caseId: `case-${idx + 1}-${val}`,
      value: val,
      unit,
      expectedOutcome,
      rationale,
      isDemoProbe: !isCoreBoundary,
    };
  });
}

/**
 * Compares an expected policy outcome with an observed form outcome.
 */
export function compareOutcomes(
  expected: PolicyExpectation,
  observed: FormOutcome | null
): VerificationClassification {
  if (observed === null || observed === 'INDETERMINATE') {
    return 'INCONCLUSIVE';
  }

  if (observed === 'ACCEPTED') {
    return expected === 'ACCEPT' ? 'CONSISTENT' : 'CONFIRMED_MISMATCH';
  }

  if (observed === 'REJECTED') {
    return expected === 'REJECT' ? 'CONSISTENT' : 'CONFIRMED_MISMATCH';
  }

  return 'INCONCLUSIVE';
}

/**
 * Computes mutually exclusive summary counts across all scheduled test cases,
 * verifying the strict invariant:
 * consistent + confirmedMismatch + inconclusive + executionError + notExecuted + interrupted = totalScheduled
 */
export function computeSummaryCounts(
  observations: TestObservation[],
  totalScheduled: number
): SummaryCounts {
  let consistent = 0;
  let confirmedMismatch = 0;
  let inconclusive = 0;
  let executionError = 0;
  let notExecuted = 0;
  let interrupted = 0;

  for (const obs of observations) {
    if (obs.lifecycleState === 'NOT_EXECUTED') {
      notExecuted++;
    } else if (obs.lifecycleState === 'INTERRUPTED') {
      interrupted++;
    } else if (obs.classification === 'CONSISTENT') {
      consistent++;
    } else if (obs.classification === 'CONFIRMED_MISMATCH') {
      confirmedMismatch++;
    } else if (obs.classification === 'INCONCLUSIVE') {
      inconclusive++;
    } else if (obs.classification === 'EXECUTION_ERROR') {
      executionError++;
    } else {
      // Default unclassified completed observation
      inconclusive++;
    }
  }

  const accountedFor =
    consistent + confirmedMismatch + inconclusive + executionError + notExecuted + interrupted;

  // Account for any cases scheduled but not present in observations array
  if (accountedFor < totalScheduled) {
    notExecuted += totalScheduled - accountedFor;
  }

  return {
    consistent,
    confirmedMismatch,
    inconclusive,
    executionError,
    notExecuted,
    interrupted,
    totalScheduled,
  };
}

/**
 * Computes sampled mismatch metadata without claiming a continuous affected interval.
 */
export function computeSampledMismatchSummary(
  observations: TestObservation[]
): SampledMismatchSummary | null {
  const mismatchValues: number[] = [];

  for (const obs of observations) {
    if (obs.classification === 'CONFIRMED_MISMATCH') {
      mismatchValues.push(obs.value);
    }
  }

  if (mismatchValues.length === 0) {
    return null;
  }

  const lowestMismatchValue = Math.min(...mismatchValues);
  const highestMismatchValue = Math.max(...mismatchValues);

  return {
    lowestMismatchValue,
    highestMismatchValue,
    disclaimer: `Discrepancy confirmed at ${mismatchValues.length} sampled test values between ${lowestMismatchValue.toLocaleString()} and ${highestMismatchValue.toLocaleString()}. Intermediate un-sampled values are not tested.`,
  };
}
