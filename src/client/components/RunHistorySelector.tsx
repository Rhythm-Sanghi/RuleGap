import React from 'react';
import { VerificationRunSnapshot } from '../../shared/contract.js';

interface RunHistorySelectorProps {
  runs: VerificationRunSnapshot[];
  selectedRunId: string | null;
  onSelectRun: (runId: string) => void;
  disabled?: boolean;
}

export const RunHistorySelector: React.FC<RunHistorySelectorProps> = ({
  runs,
  selectedRunId,
  onSelectRun,
  disabled = false,
}) => {
  if (runs.length <= 1) {
    return null;
  }

  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <div className="panel-header" style={{ padding: '8px 16px' }}>
        <h3 style={{ fontSize: '0.875rem' }}>Verification Run History</h3>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          {runs.length} Runs Recorded
        </span>
      </div>
      <div className="panel-body" style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label htmlFor="history-select" className="sr-only">
            Select historical verification run
          </label>
          <select
            id="history-select"
            className="form-select"
            style={{ minHeight: 38, fontSize: '0.84rem' }}
            value={selectedRunId || ''}
            onChange={(e) => onSelectRun(e.target.value)}
            disabled={disabled}
          >
            {runs.map((r, index) => {
              const modeLabel = r.fixtureMode === 'inconsistent' ? 'Mode A (Inconsistent)' : 'Mode B (Corrected)';
              const time = new Date(r.startedAt).toLocaleTimeString();
              const date = new Date(r.startedAt).toLocaleDateString();
              const mismatches = r.summaryCounts.confirmedMismatch;
              const outcome =
                r.status === 'COMPLETED_CONSISTENT'
                  ? '7/7 Consistent'
                  : r.status === 'COMPLETED_MISMATCHES'
                  ? `${mismatches} Mismatches`
                  : r.status;

              return (
                <option key={r.runId} value={r.runId}>
                  Run #{runs.length - index}: {modeLabel} — {outcome} ({date} {time})
                </option>
              );
            })}
          </select>
        </div>
      </div>
    </div>
  );
};
