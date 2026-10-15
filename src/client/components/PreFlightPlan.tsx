import React from 'react';
import { TestPlanRecord } from '../../shared/contract.js';
import { formatValueWithUnit } from '../../shared/ruleEngine.js';

interface PreFlightPlanProps {
  plan: TestPlanRecord | null;
  isApproved: boolean;
  isGenerating: boolean;
  isApproving: boolean;
  planError: string | null;
  runError?: string | null;
  onApprove: () => void;
  isRunning: boolean;
  isCancelling: boolean;
  onStartRun: () => void;
  onCancelRun: () => void;
  disabled?: boolean;
}

export const PreFlightPlan: React.FC<PreFlightPlanProps> = ({
  plan,
  isApproved,
  isGenerating,
  isApproving,
  planError,
  runError,
  onApprove,
  isRunning,
  isCancelling,
  onStartRun,
  onCancelRun,
  disabled = false,
}) => {
  if (isGenerating) {
    return (
      <div className="panel">
        <div className="panel-body" style={{ textAlign: 'center', padding: '32px' }}>
          <p style={{ color: 'var(--text-muted)' }}>Deriving boundary test plan from confirmed contract...</p>
        </div>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="panel">
        <div className="panel-header">
          <div className="panel-header-title">
            <span className="step-indicator">4</span>
            <h2>Pre-Flight Verification Plan</h2>
          </div>
          <span className="badge badge-neutral">Awaiting Contract</span>
        </div>
        <div className="panel-body">
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            Confirm a rule contract above to generate and inspect the derived boundary test cases.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="panel" aria-labelledby="pre-flight-heading">
      <div className="panel-header">
        <div className="panel-header-title">
          <span className={`step-indicator ${isApproved ? 'active' : ''}`}>4</span>
          <h2 id="pre-flight-heading">Pre-Flight Test Plan Review</h2>
        </div>
        <div>
          {isApproved ? (
            <span className="badge badge-consistent">Plan Approved</span>
          ) : (
            <span className="badge badge-inconclusive">Approval Required</span>
          )}
        </div>
      </div>

      <div className="panel-body">
        {(planError || runError) && (
          <div className="callout callout-danger" role="alert">
            {planError || runError}
          </div>
        )}

        <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: 12 }}>
          Server-derived <strong>{plan.cases.length} boundary and demonstration test cases</strong> based on policy threshold.
          Approval is strictly required before execution.
        </p>

        {/* Pre-flight table */}
        <div className="data-table-container" style={{ marginBottom: 16 }}>
          <table className="data-table" aria-label="Pre-flight test plan cases">
            <thead>
              <tr>
                <th scope="col">Test Value ({plan.contract?.unit || 'Value'})</th>
                <th scope="col">Policy Expectation</th>
                <th scope="col">Test Rationale</th>
              </tr>
            </thead>
            <tbody>
              {plan.cases.map((c) => (
                <tr key={c.caseId}>
                  <td className="mono" style={{ fontWeight: 600 }}>
                    {formatValueWithUnit(c.value, plan.contract?.unit || c.unit || 'INR')}
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        c.expectedOutcome === 'ACCEPT' ? 'badge-consistent' : 'badge-error'
                      }`}
                    >
                      {c.expectedOutcome}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                    {c.rationale}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {!isApproved ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={onApprove}
              disabled={disabled || isApproving}
              style={{ width: '100%' }}
            >
              {isApproving ? 'Authorizing Plan...' : 'Approve Plan & Authorize Verification'}
            </button>
          ) : isRunning ? (
            <div style={{ display: 'flex', gap: 12, width: '100%' }}>
              <button
                type="button"
                className="btn btn-primary"
                disabled
                style={{ flex: 1 }}
              >
                Verification Running...
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={onCancelRun}
                disabled={isCancelling}
              >
                {isCancelling ? 'Cancelling...' : 'Cancel Run'}
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={onStartRun}
              disabled={disabled}
              style={{ width: '100%' }}
            >
              Start Browser Verification Run
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
