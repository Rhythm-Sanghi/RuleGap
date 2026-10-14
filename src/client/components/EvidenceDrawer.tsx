import React, { useEffect, useRef } from 'react';
import { TestObservation, VerificationRunSnapshot } from '../../shared/contract.js';

interface EvidenceDrawerProps {
  observation: TestObservation | null;
  snapshot: VerificationRunSnapshot | null;
  onClose: () => void;
}

export const EvidenceDrawer: React.FC<EvidenceDrawerProps> = ({
  observation,
  snapshot,
  onClose,
}) => {
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previouslyFocusedElementRef.current = document.activeElement as HTMLElement;
    const timer = setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 20);

    return () => {
      clearTimeout(timer);
      previouslyFocusedElementRef.current?.focus();
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Tab' && drawerRef.current) {
        const focusables = Array.from(
          drawerRef.current.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null);

        if (focusables.length === 0) {
          e.preventDefault();
          return;
        }

        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first || document.activeElement === drawerRef.current) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!observation || !snapshot) {
    return null;
  }

  const screenshotUrl = observation.screenshotId
    ? `/api/runs/${snapshot.runId}/screenshots/${observation.caseId}`
    : null;

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div
        ref={drawerRef}
        className="drawer"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
        aria-labelledby="drawer-title"
      >
        <div className="drawer-header">
          <div>
            <h3 id="drawer-title">Evidence Inspection: Case {observation.caseId}</h3>
            <span className="mono" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Value: ₹{observation.value.toLocaleString('en-IN')}
            </span>
          </div>
          <button
            ref={closeButtonRef}
            autoFocus
            type="button"
            className="btn btn-secondary"
            style={{ minHeight: 34, padding: '4px 10px' }}
            onClick={onClose}
            aria-label="Close evidence inspection drawer"
          >
            ✕
          </button>
        </div>

        <div className="drawer-body">
          {/* Outcomes summary */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div className="panel" style={{ padding: 12, marginBottom: 0 }}>
              <span className="form-label">Policy Expectation</span>
              <span
                className={`badge ${
                  observation.expectedOutcome === 'ACCEPT' ? 'badge-consistent' : 'badge-error'
                }`}
              >
                {observation.expectedOutcome}
              </span>
            </div>
            <div className="panel" style={{ padding: 12, marginBottom: 0 }}>
              <span className="form-label">Observed Form Outcome</span>
              {observation.observedFormOutcome ? (
                <span
                  className={`badge ${
                    observation.observedFormOutcome === 'ACCEPTED'
                      ? 'badge-consistent'
                      : observation.observedFormOutcome === 'REJECTED'
                      ? 'badge-error'
                      : 'badge-inconclusive'
                  }`}
                >
                  {observation.observedFormOutcome}
                </span>
              ) : (
                <span style={{ color: 'var(--text-muted)' }}>—</span>
              )}
            </div>
          </div>

          {/* Classification result */}
          <div className="form-group">
            <span className="form-label">Discrepancy Classification</span>
            <p style={{ fontWeight: 600 }}>
              {observation.classification || 'PENDING'}
            </p>
          </div>

          {/* Observable DOM Feedback */}
          <div className="form-group">
            <span className="form-label">Observed Form Feedback Text</span>
            <div
              style={{
                backgroundColor: 'var(--bg-subtle)',
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.85rem',
                border: '1px solid var(--border-main)',
              }}
            >
              {observation.observedFeedbackText ? (
                <span>&ldquo;{observation.observedFeedbackText}&rdquo;</span>
              ) : (
                <span style={{ color: 'var(--text-muted)' }}>No explicit feedback text recorded.</span>
              )}
            </div>
          </div>

          {/* Diagnostic details */}
          {observation.diagnosticDetails && (
            <div className="form-group">
              <span className="form-label">Diagnostic Details</span>
              <p className="mono" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {observation.diagnosticDetails}
              </p>
            </div>
          )}

          {/* Screenshot Evidence */}
          <div className="form-group">
            <span className="form-label">Authoritative Browser Screenshot Evidence</span>
            {screenshotUrl ? (
              <div>
                <img
                  src={screenshotUrl}
                  alt={`Browser validation observation for income ₹${observation.value}`}
                  className="screenshot-preview"
                />
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                  Hermetic Chromium viewport capture at form submission.
                </p>
              </div>
            ) : (
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                No screenshot evidence captured for this test case.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
