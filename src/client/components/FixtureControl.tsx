import React from 'react';

interface FixtureControlProps {
  fixtureMode: 'inconsistent' | 'corrected';
  onModeChange: (mode: 'inconsistent' | 'corrected') => void;
  disabled?: boolean;
}

export const FixtureControl: React.FC<FixtureControlProps> = ({
  fixtureMode,
  onModeChange,
  disabled = false,
}) => {
  return (
    <div className="panel" aria-labelledby="fixture-control-heading">
      <div className="panel-header">
        <div className="panel-header-title">
          <span className="step-indicator active">3</span>
          <h2 id="fixture-control-heading">Target Form & Fixture Mode</h2>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="badge badge-neutral">Authorized Fixture</span>
          <a
            href={`/fixtures/scholarship?mode=${fixtureMode}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary"
            style={{ minHeight: 30, padding: '2px 10px', fontSize: '0.78rem', textDecoration: 'none' }}
            title="Inspect authorized synthetic form in new browser tab"
          >
            Open Test Form ↗
          </a>
        </div>
      </div>

      <div className="panel-body">
        <div style={{ backgroundColor: 'var(--bg-subtle)', border: '1px solid var(--border-main)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Target Environment
            </span>
            <span className="badge badge-neutral" style={{ fontSize: '0.7rem' }}>Synthetic Only</span>
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-primary)', marginBottom: 4 }}>
            <strong>Portal: </strong>Synthetic Scholarship Application (<code>/fixtures/scholarship</code>)
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-primary)' }}>
            <strong>Input Field: </strong><code className="mono">#annual-income</code> (Annual Family Income in INR)
          </div>
        </div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <label htmlFor="fixture-mode-select" className="form-label" style={{ marginBottom: 0 }}>
              Demonstration Fixture Mode
            </label>
            <span className="mono" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {fixtureMode === 'inconsistent' ? 'Form Threshold: ₹2,50,000' : 'Form Threshold: ₹3,00,000'}
            </span>
          </div>
          <select
            id="fixture-mode-select"
            className="form-select"
            value={fixtureMode}
            onChange={(e) => onModeChange(e.target.value as 'inconsistent' | 'corrected')}
            disabled={disabled}
          >
            <option value="inconsistent">
              Mode A: Inconsistent Fixture (Form enforces ₹250,000 threshold)
            </option>
            <option value="corrected">
              Mode B: Corrected Fixture (Form matches policy ₹300,000 threshold)
            </option>
          </select>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 6, lineHeight: 1.4 }}>
            {fixtureMode === 'inconsistent'
              ? 'Form rejects values above ₹250,000, creating discrepancies against the ₹300,000 policy rule.'
              : 'Form aligns with policy, accepting all values up to ₹300,000 inclusive.'}
          </p>
        </div>
      </div>
    </div>
  );
};

