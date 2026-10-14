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
    <div style={{ marginBottom: 20 }}>
      {/* Progress Bar during active run */}
      {isRunning && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: 4 }}>
            <span>Executing automated Playwright browser tests...</span>
            <span className="mono">{completedCount} / {summaryCounts.totalScheduled} ({progressPercent}%)</span>
          </div>
          <div className="progress-container">
            <div className="progress-bar-fill" style={{ width: `${progressPercent}%` }} />
          </div>
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
      </div>

      {/* Terminal Status & Discrepancy Language Callout */}
      {!isRunning && status !== 'RUNNING' && status !== 'CANCELLATION_REQUESTED' && (
        <div>
          {status === 'COMPLETED_MISMATCHES' && sampledMismatchSummary && (
            <div className="callout callout-danger" role="alert">
              <strong>Confirmed Policy Mismatches Detected: </strong>
              The form rejected inputs that the documented policy explicitly allows.
              Discrepancies were confirmed at tested values between{' '}
              <span className="mono">₹{sampledMismatchSummary.lowestMismatchValue?.toLocaleString('en-IN')}</span> and{' '}
              <span className="mono">₹{sampledMismatchSummary.highestMismatchValue?.toLocaleString('en-IN')}</span>.
              <p style={{ marginTop: 4, fontSize: '0.78rem', color: '#7f1d1d' }}>
                {sampledMismatchSummary.disclaimer}
              </p>
            </div>
          )}

          {status === 'COMPLETED_CONSISTENT' && (
            <div className="callout callout-success" role="status">
              <strong>Form Validated Consistent Across Tested Values: </strong>
              All {summaryCounts.totalScheduled} executed boundary test cases produced validation outcomes
              consistent with the documented policy threshold (Fixture Mode: {fixtureMode === 'corrected' ? 'Mode B Corrected' : 'Mode A'}).
              <p style={{ marginTop: 4, fontSize: '0.78rem', color: '#064e3b' }}>
                Note: Consistency is established strictly across tested boundary samples and probes.
              </p>
            </div>
          )}

          {status === 'CANCELLED_PARTIAL' && (
            <div className="callout callout-warning" role="status">
              <strong>Verification Run Cancelled by User: </strong>
              Execution was stopped mid-flight. Completed cases have been preserved as evidentiary snapshots; unattempted cases are marked NOT_EXECUTED.
            </div>
          )}

          {status === 'COMPLETED_WITH_UNCERTAINTY' && (
            <div className="callout callout-warning" role="status">
              <strong>Verification Completed with Uncertainty: </strong>
              No confirmed mismatches were observed, but {summaryCounts.inconclusive} test case(s) yielded inconclusive form responses or errors.
            </div>
          )}

          {status === 'FAILED' && (
            <div className="callout callout-danger" role="alert">
              <strong>Run Execution Interrupted: </strong>
              The verification run failed or was interrupted by a system restart.
            </div>
          )}
        </div>
      )}
    </div>
  );
};
