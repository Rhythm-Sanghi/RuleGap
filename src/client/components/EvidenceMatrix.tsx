import React from 'react';
import { VerificationRunSnapshot, TestObservation } from '../../shared/contract.js';

interface EvidenceMatrixProps {
  snapshot: VerificationRunSnapshot | null;
  onSelectObservation: (obs: TestObservation) => void;
  onExportReport: () => void;
}

export const EvidenceMatrix: React.FC<EvidenceMatrixProps> = ({
  snapshot,
  onSelectObservation,
  onExportReport,
}) => {
  if (!snapshot) {
    return (
      <div className="panel">
        <div className="panel-header">
          <div className="panel-header-title">
            <span className="step-indicator">5</span>
            <h2>Verification Evidence Matrix</h2>
          </div>
          <span className="badge badge-neutral">No Run Selected</span>
        </div>
        <div className="panel-body">
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            Run a verification to inspect browser observations, form feedback, and screenshot evidence.
          </p>
        </div>
      </div>
    );
  }

  const { observations, runId, status, fixtureMode } = snapshot;

  const renderClassificationBadge = (obs: TestObservation) => {
    if (obs.lifecycleState === 'PENDING') {
      return <span className="badge badge-neutral">Pending</span>;
    }
    if (obs.lifecycleState === 'RUNNING') {
      return <span className="badge badge-inconclusive">Testing...</span>;
    }
    if (obs.lifecycleState === 'NOT_EXECUTED') {
      return <span className="badge badge-neutral">Not Executed</span>;
    }
    if (obs.lifecycleState === 'INTERRUPTED') {
      return <span className="badge badge-error">Interrupted</span>;
    }

    switch (obs.classification) {
      case 'CONSISTENT':
        return <span className="badge badge-consistent">Consistent</span>;
      case 'CONFIRMED_MISMATCH':
        return <span className="badge badge-mismatch">Mismatch</span>;
      case 'INCONCLUSIVE':
        return <span className="badge badge-inconclusive">Inconclusive</span>;
      case 'EXECUTION_ERROR':
        return <span className="badge badge-error">Error</span>;
      default:
        return <span className="badge badge-neutral">Unknown</span>;
    }
  };

  const isTerminal = status !== 'RUNNING' && status !== 'CANCELLATION_REQUESTED';

  return (
    <div className="panel" aria-labelledby="evidence-matrix-heading">
      <div className="panel-header">
        <div className="panel-header-title">
          <span className="step-indicator active">5</span>
          <h2 id="evidence-matrix-heading">
            Verification Evidence Matrix
          </h2>
          <span className="badge badge-neutral" style={{ marginLeft: 6 }}>
            {fixtureMode === 'inconsistent' ? 'Mode A: Inconsistent Fixture' : 'Mode B: Corrected Fixture'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span className="mono" style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            Run {runId.slice(0, 8)} • {observations.length} Cases
          </span>
          {isTerminal && (
            <button
              type="button"
              className="btn btn-secondary"
              style={{ minHeight: 34, padding: '4px 14px', fontSize: '0.8rem', fontWeight: 600 }}
              onClick={onExportReport}
            >
              Export HTML Report
            </button>
          )}
        </div>
      </div>

      <div className="panel-body" style={{ padding: 0 }}>
        <div className="data-table-container" style={{ border: 'none' }}>
          <table className="data-table" aria-label="Verification observations matrix">
            <thead>
              <tr>
                <th scope="col" style={{ width: '80px' }}>Case</th>
                <th scope="col" style={{ minWidth: '130px' }}>Test Value (INR)</th>
                <th scope="col" style={{ minWidth: '130px' }}>Policy Expectation</th>
                <th scope="col" style={{ minWidth: '150px' }}>Observed Outcome</th>
                <th scope="col" style={{ minWidth: '140px' }}>Classification</th>
                <th scope="col" style={{ minWidth: '220px' }}>Observed Feedback</th>
                <th scope="col" style={{ width: '90px' }}>Duration</th>
                <th scope="col" style={{ width: '90px', textAlign: 'center' }}>Evidence</th>
              </tr>
            </thead>
            <tbody>
              {observations.map((obs, index) => {
                const isMismatch = obs.classification === 'CONFIRMED_MISMATCH';
                return (
                  <tr key={obs.caseId} className={isMismatch ? 'mismatch-row' : ''}>
                    <td className="mono" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      #{index + 1}
                    </td>
                    <td className="mono" style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                      ₹{obs.value.toLocaleString('en-IN')}
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          obs.expectedOutcome === 'ACCEPT' ? 'badge-consistent' : 'badge-error'
                        }`}
                      >
                        {obs.expectedOutcome}
                      </span>
                    </td>
                    <td>
                      {obs.observedFormOutcome ? (
                        <span
                          className={`badge ${
                            obs.observedFormOutcome === 'ACCEPTED'
                              ? 'badge-consistent'
                              : obs.observedFormOutcome === 'REJECTED'
                              ? 'badge-error'
                              : 'badge-inconclusive'
                          }`}
                        >
                          {obs.observedFormOutcome}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>—</span>
                      )}
                    </td>
                    <td>{renderClassificationBadge(obs)}</td>
                    <td style={{ fontSize: '0.8rem', color: isMismatch ? 'var(--status-mismatch)' : 'var(--text-secondary)' }}>
                      {obs.observedFeedbackText ? (
                        <span title={obs.observedFeedbackText}>
                          &ldquo;{obs.observedFeedbackText.length > 45 ? `${obs.observedFeedbackText.slice(0, 42)}...` : obs.observedFeedbackText}&rdquo;
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td className="mono" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      {obs.durationMs > 0 ? `${obs.durationMs}ms` : '—'}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-inspect"
                        style={{ minHeight: 30, padding: '2px 10px', fontSize: '0.78rem' }}
                        onClick={() => onSelectObservation(obs)}
                        disabled={obs.lifecycleState === 'PENDING' || obs.lifecycleState === 'NOT_EXECUTED'}
                        aria-label={`Inspect Case ${index + 1}: ₹${obs.value}`}
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
