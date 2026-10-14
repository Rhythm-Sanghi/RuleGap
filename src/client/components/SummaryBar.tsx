import React from 'react';
import { VerificationRunSnapshot } from '../../shared/contract.js';

interface SummaryBarProps {
  snapshot: VerificationRunSnapshot | null;
  isRunning: boolean;
}

export const SummaryBar: React.FC<SummaryBarProps> = ({ snapshot, isRunning }) => {
  if (!snapshot) {
    return null;
  }

  const { summaryCounts, status, sampledMismatchSummary, fixtureMode } = snapshot;
  const completedCount =
    summaryCounts.consistent +
    summaryCounts.confirmedMismatch +
    summaryCounts.inconclusive +
    summaryCounts.executionError;
  const progressPercent = Math.round((completedCount / summaryCounts.totalScheduled) * 100);

  return (
    <div className="summary-section" style={{ marginBottom: 20 }}>
      {/* Active Run Execution Progress Bar */}
      {isRunning && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: 4 }}>
            <span>Executing automated Playwright browser tests...</span>
            <span className="mono font-semibold">{completedCount} / {summaryCounts.totalScheduled} ({progressPercent}%)</span>
          </div>
          <div className="progress-container">
            <div className="progress-bar-fill" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      )}

      {/* Prominent Terminal Verdict Callout */}
      {!isRunning && status !== 'RUNNING' && status !== 'CANCELLATION_REQUESTED' && (
        <div style={{ marginBottom: 16 }}>
          {status === 'COMPLETED_MISMATCHES' && (
            <div className="verdict-banner callout callout-danger" role="alert">
              <div className="verdict-header">
                <div className="verdict-headline">
                  {summaryCounts.confirmedMismatch} of {summaryCounts.totalScheduled} tested values contradict the policy.
                </div>
                <span className="badge badge-mismatch">Policy Discrepancy</span>
              </div>
              <p className="verdict-detail">
                <strong>Confirmed Policy Mismatches Detected: </strong>
                The documented policy explicitly permits these incomes, but the application form rejected them.
                Discrepancies were confirmed at tested values between{' '}
                <span className="mono" style={{ fontWeight: 600 }}>₹{sampledMismatchSummary?.lowestMismatchValue?.toLocaleString('en-IN')}</span> and{' '}
                <span className="mono" style={{ fontWeight: 600 }}>₹{sampledMismatchSummary?.highestMismatchValue?.toLocaleString('en-IN')}</span>.
              </p>
              <div className="sampling-disclaimer">
                {sampledMismatchSummary?.disclaimer || 'Empirical verification across discrete boundary probes. Finite sampling does not guarantee continuous interval behavior.'}
              </div>
            </div>
          )}

          {status === 'COMPLETED_CONSISTENT' && (
            <div className="verdict-banner callout callout-success" role="status">
              <div className="verdict-header">
                <div className="verdict-headline">
                  All {summaryCounts.totalScheduled} executed cases agree with the documented rule.
                </div>
                <span className="badge badge-consistent">Validated Consistent</span>
              </div>
              <p className="verdict-detail">
                <strong>Form Validated Consistent Across Tested Values: </strong>
                All {summaryCounts.totalScheduled} executed boundary test cases produced validation outcomes
                consistent with the documented policy threshold (Fixture Mode: {fixtureMode === 'corrected' ? 'Mode B Corrected' : 'Mode A'}).
              </p>
              <div className="sampling-disclaimer">
                Finite sampling disclosure: Consistency is established strictly across tested boundary samples and probes; does not imply continuous interval proof.
              </div>
            </div>
          )}

          {status === 'CANCELLED_PARTIAL' && (
            <div className="verdict-banner callout callout-warning" role="status">
              <div className="verdict-header">
                <div className="verdict-headline">
                  Verification Cancelled: {completedCount} of {summaryCounts.totalScheduled} cases executed.
                </div>
                <span className="badge badge-neutral">Partial Run</span>
              </div>
              <p className="verdict-detail">
                <strong>Verification Run Cancelled by User: </strong>
                Execution was stopped mid-flight. Completed cases have been preserved as evidentiary snapshots; unattempted cases are marked NOT_EXECUTED.
              </p>
            </div>
          )}

          {status === 'COMPLETED_WITH_UNCERTAINTY' && (
            <div className="verdict-banner callout callout-warning" role="status">
              <div className="verdict-header">
                <div className="verdict-headline">
                  Verification Completed with Uncertainty: {summaryCounts.inconclusive} inconclusive case(s).
                </div>
                <span className="badge badge-inconclusive">Inconclusive</span>
              </div>
              <p className="verdict-detail">
                <strong>Verification Completed with Uncertainty: </strong>
                No confirmed mismatches were observed, but {summaryCounts.inconclusive} test case(s) yielded inconclusive form responses or errors.
              </p>
            </div>
          )}

          {status === 'FAILED' && (
            <div className="verdict-banner callout callout-danger" role="alert">
              <div className="verdict-header">
                <div className="verdict-headline">Run Execution Interrupted</div>
                <span className="badge badge-error">Failed</span>
              </div>
              <p className="verdict-detail">
                <strong>Run Execution Interrupted: </strong>
                The verification run failed or was interrupted by a system restart.
              </p>
            </div>
          )}
        </div>
      )}

      {/* 4-State Summary Metric Badges */}
      <div className="summary-bar" role="region" aria-label="Verification Summary Counts">
        <div className="summary-card consistent">
          <span className="summary-label">Consistent</span>
          <span className="summary-value" style={{ color: 'var(--status-consistent)' }}>
            {summaryCounts.consistent}
          </span>
        </div>

        <div className="summary-card mismatch">
          <span className="summary-label">Confirmed Mismatch</span>
          <span className="summary-value" style={{ color: 'var(--status-mismatch)' }}>
            {summaryCounts.confirmedMismatch}
          </span>
        </div>

        <div className="summary-card inconclusive">
          <span className="summary-label">Inconclusive</span>
          <span className="summary-value" style={{ color: 'var(--status-inconclusive)' }}>
            {summaryCounts.inconclusive}
          </span>
        </div>

        <div className="summary-card error">
          <span className="summary-label">Execution Errors</span>
          <span className="summary-value" style={{ color: 'var(--status-error)' }}>
            {summaryCounts.executionError}
          </span>
        </div>

        {!isRunning && summaryCounts.notExecuted > 0 && (
          <div className="summary-card not-executed">
            <span className="summary-label">Not Executed</span>
            <span className="summary-value" style={{ color: 'var(--text-muted)' }}>
              {summaryCounts.notExecuted}
            </span>
          </div>
        )}

        {!isRunning && summaryCounts.interrupted > 0 && (
          <div className="summary-card interrupted">
            <span className="summary-label">Interrupted</span>
            <span className="summary-value" style={{ color: '#b45309' }}>
              {summaryCounts.interrupted}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
