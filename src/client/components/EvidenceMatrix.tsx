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
            Verification Evidence Matrix ({fixtureMode === 'inconsistent' ? 'Mode A Inconsistent' : 'Mode B Corrected'})
          </h2>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="mono" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Run {runId.slice(0, 8)}
          </span>
          {isTerminal && (
            <button
              type="button"
              className="btn btn-secondary"
              style={{ minHeight: 34, padding: '4px 12px', fontSize: '0.8rem' }}
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
                <th scope="col">Test Value</th>
                <th scope="col">Policy Expectation</th>
                <th scope="col">Observed Form Outcome</th>
                <th scope="col">Classification</th>
                <th scope="col">Duration</th>
                <th scope="col">Evidence</th>
              </tr>
            </thead>
            <tbody>
              {observations.map((obs) => {
                const isMismatch = obs.classification === 'CONFIRMED_MISMATCH';
                return (
                  <tr key={obs.caseId} className={isMismatch ? 'mismatch-row' : ''}>
                    <td className="mono" style={{ fontWeight: 600 }}>
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
                    <td className="mono" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      {obs.durationMs > 0 ? `${obs.durationMs}ms` : '—'}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ minHeight: 30, padding: '2px 8px', fontSize: '0.75rem' }}
                        onClick={() => onSelectObservation(obs)}
                        disabled={obs.lifecycleState === 'PENDING' || obs.lifecycleState === 'NOT_EXECUTED'}
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
