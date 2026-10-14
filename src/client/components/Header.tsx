import React from 'react';

interface HeaderProps {
  isRunning: boolean;
  activeRunId: string | null;
}

export const Header: React.FC<HeaderProps> = ({ isRunning, activeRunId }) => {
  return (
    <header className="app-header" role="banner">
      <div className="brand-section">
        <div className="brand-logo">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
          <span>RuleGap</span>
        </div>
        <span className="brand-tagline">The rules say yes. The form says no.</span>
      </div>

      <div className="header-actions">
        {isRunning && (
          <span className="badge badge-inconclusive" aria-live="polite">
            <span className="step-indicator active" style={{ width: 8, height: 8 }} />
            Verifying Run {activeRunId ? activeRunId.slice(0, 8) : ''}...
          </span>
        )}
        <span className="badge badge-neutral" title="Bound strictly to 127.0.0.1">
          Local-First Engine
        </span>
      </div>
    </header>
  );
};
