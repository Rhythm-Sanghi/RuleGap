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
        <span className="badge badge-neutral">Authorized Fixture</span>
      </div>

      <div className="panel-body">
        <div className="form-group">
          <label htmlFor="target-form-select" className="form-label">
            Target Form Interface
          </label>
          <select id="target-form-select" className="form-select" disabled>
            <option value="scholarship">
              Synthetic Scholarship Application Form (/fixtures/scholarship)
            </option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="target-field-selector" className="form-label">
            Target Input Field Selector
          </label>
          <input
            id="target-field-selector"
            type="text"
            className="form-control mono"
            value="#annual-income"
            disabled
          />
        </div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label htmlFor="fixture-mode-select" className="form-label">
            Demonstration Fixture Mode
          </label>
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
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 6 }}>
            {fixtureMode === 'inconsistent'
              ? 'Form rejects values above ₹250,000, creating discrepancies against the ₹300,000 policy rule.'
              : 'Form aligns with policy, accepting all values up to ₹300,000 inclusive.'}
          </p>
        </div>
      </div>
    </div>
  );
};
