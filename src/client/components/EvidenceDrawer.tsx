import React, { useEffect, useRef, useState } from 'react';
import { TestObservation, VerificationRunSnapshot, TestPlanRecord } from '../../shared/contract.js';
import { formatObservationExplanation, formatValueWithUnit } from '../../shared/ruleEngine.js';

interface EvidenceDrawerProps {
  observation: TestObservation | null;
  snapshot: VerificationRunSnapshot | null;
  plan?: TestPlanRecord | null;
  onClose: () => void;
}

export const EvidenceDrawer: React.FC<EvidenceDrawerProps> = ({
  observation,
  snapshot,
  plan,
  onClose,
}) => {
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const fullSizeCloseBtnRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);

  const [isFullSizeOpen, setIsFullSizeOpen] = useState<boolean>(false);
  const [zoomLevel, setZoomLevel] = useState<'fit' | '100%' | '150%'>('fit');
  const fullSizeTriggerRef = useRef<HTMLElement | null>(null);

  const openFullSize = (e?: React.MouseEvent) => {
    fullSizeTriggerRef.current = (e?.currentTarget as HTMLElement) || (document.activeElement as HTMLElement);
    setZoomLevel('fit');
    setIsFullSizeOpen(true);
  };

  const closeFullSize = () => {
    setIsFullSizeOpen(false);
  };

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
    if (isFullSizeOpen) {
      const timer = setTimeout(() => {
        fullSizeCloseBtnRef.current?.focus();
      }, 20);
      return () => clearTimeout(timer);
    } else if (fullSizeTriggerRef.current) {
      fullSizeTriggerRef.current.focus();
      fullSizeTriggerRef.current = null;
    }
  }, [isFullSizeOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (isFullSizeOpen) {
          closeFullSize();
        } else {
          onClose();
        }
        return;
      }

      if (e.key === 'Tab') {
        const container = isFullSizeOpen ? document.querySelector('.fullsize-modal') : drawerRef.current;
        if (!container) return;

        const focusables = Array.from(
          container.querySelectorAll<HTMLElement>(
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
          if (document.activeElement === first || document.activeElement === container) {
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
  }, [onClose, isFullSizeOpen]);

  if (!observation || !snapshot) {
    return null;
  }

  const caseIndex = snapshot.observations.findIndex((o) => o.caseId === observation.caseId) + 1;
  const totalCases = snapshot.observations.length;
  const isMismatch = observation.classification === 'CONFIRMED_MISMATCH';

  const screenshotUrl = observation.screenshotId
    ? `/api/runs/${snapshot.runId}/screenshots/${observation.caseId}`
    : null;

  const renderReadableClassification = (c: string | null) => {
    switch (c) {
      case 'CONSISTENT':
        return <span className="badge badge-consistent">Consistent</span>;
      case 'CONFIRMED_MISMATCH':
        return <span className="badge badge-mismatch">Confirmed Mismatch</span>;
      case 'INCONCLUSIVE':
        return <span className="badge badge-inconclusive">Inconclusive</span>;
      case 'EXECUTION_ERROR':
        return <span className="badge badge-error">Execution Error</span>;
      default:
        return <span className="badge badge-neutral">{c || 'Pending'}</span>;
    }
  };

  // Retrieve rationale from the authoritative test plan when available, or clearly mark it unavailable
  const matchingCase =
    plan && snapshot && plan.planId === snapshot.planId
      ? plan.cases.find((c) => c.caseId === observation?.caseId)
      : null;
  const rationale = matchingCase?.rationale || 'Unavailable';

  // Format executedAt safely without displaying Invalid Date
  const executionTimestamp = (() => {
    if (!observation?.executedAt) return '—';
    const date = new Date(observation.executedAt);
    return isNaN(date.getTime()) ? '—' : date.toLocaleString();
  })();

  return (
    <>
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
          {/* Header */}
          <div className="drawer-header">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span className="mono font-semibold" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Case {caseIndex} of {totalCases}
                </span>
                {renderReadableClassification(observation.classification)}
                <span className="badge badge-neutral" style={{ fontSize: '0.7rem' }}>
                  {snapshot.fixtureMode === 'inconsistent' ? 'Mode A (Inconsistent)' : 'Mode B (Corrected)'}
                </span>
              </div>
              <h3 id="drawer-title" style={{ fontSize: '1.15rem', display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span>Evidence Inspection</span>
                <span className="mono" style={{ color: 'var(--text-primary)', fontWeight: 700 }}>
                  {formatValueWithUnit(observation.value, snapshot.contract.unit)}
                </span>
              </h3>
            </div>
            <button
              ref={closeButtonRef}
              autoFocus
              type="button"
              className="btn btn-secondary"
              style={{ minHeight: 34, padding: '4px 12px' }}
              onClick={onClose}
              aria-label="Close evidence inspection drawer"
            >
              ✕
            </button>
          </div>

          <div className="drawer-body">
            {/* Primary Policy vs Form Comparison */}
            <div className="comparison-box" style={{ marginBottom: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div className="panel" style={{ padding: 12, marginBottom: 0 }}>
                  <span className="form-label">Policy Expectation</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <span
                      className={`badge ${
                        observation.expectedOutcome === 'ACCEPT' ? 'badge-consistent' : 'badge-error'
                      }`}
                    >
                      {observation.expectedOutcome}
                    </span>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      Rule: {snapshot.contract.fieldName} {snapshot.contract.operator} {formatValueWithUnit(snapshot.contract.threshold, snapshot.contract.unit)}
                    </span>
                  </div>
                </div>

                <div className="panel" style={{ padding: 12, marginBottom: 0 }}>
                  <span className="form-label">Observed Form Outcome</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
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
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      Form DOM State
                    </span>
                  </div>
                </div>
              </div>

              {/* Contradiction / Consistency Verdict Explanation */}
              {isMismatch ? (
                <div className="callout callout-danger" style={{ marginBottom: 0 }}>
                  <strong>Contradiction Confirmed: </strong>
                  {formatObservationExplanation(snapshot.contract, observation)}
                </div>
              ) : observation.classification === 'CONSISTENT' ? (
                <div className="callout callout-success" style={{ marginBottom: 0 }}>
                  <strong>Validation Consistent: </strong>
                  {formatObservationExplanation(snapshot.contract, observation)}
                </div>
              ) : observation.classification === 'INCONCLUSIVE' ? (
                <div className="callout callout-warning" style={{ marginBottom: 0 }}>
                  <strong>Inconclusive: </strong>
                  {formatObservationExplanation(snapshot.contract, observation)}
                </div>
              ) : null}
            </div>

            {/* Observable DOM Feedback Text */}
            <div className="form-group" style={{ marginBottom: 16 }}>
              <span className="form-label">Captured Browser-Visible Feedback</span>
              <div
                style={{
                  backgroundColor: 'var(--bg-subtle)',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.85rem',
                  border: '1px solid var(--border-main)',
                  color: isMismatch ? 'var(--status-mismatch)' : 'var(--text-primary)',
                  fontWeight: isMismatch ? 500 : 400,
                }}
              >
                {observation.observedFeedbackText ? (
                  <span>&ldquo;{observation.observedFeedbackText}&rdquo;</span>
                ) : (
                  <span style={{ color: 'var(--text-muted)' }}>No explicit error feedback text displayed by form.</span>
                )}
              </div>
            </div>

            {/* Authoritative Screenshot Viewport */}
            <div className="form-group" style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span className="form-label" style={{ marginBottom: 0 }}>
                  Authoritative Browser Screenshot Evidence
                </span>
                {screenshotUrl && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ minHeight: 28, padding: '2px 10px', fontSize: '0.75rem' }}
                    onClick={openFullSize}
                    aria-label="View screenshot full size"
                  >
                    View Full Size ↗
                  </button>
                )}
              </div>

              {screenshotUrl ? (
                <div style={{ position: 'relative' }}>
                  <img
                    src={screenshotUrl}
                    alt={`Browser validation observation for income ₹${observation.value}`}
                    className="screenshot-preview"
                    style={{ cursor: 'pointer' }}
                    onClick={openFullSize}
                    title="Click to enlarge screenshot"
                  />
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    Hermetic Chromium viewport capture at form submission. Click image or &ldquo;View Full Size&rdquo; to enlarge.
                  </p>
                </div>
              ) : (
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  No screenshot evidence captured for this test case.
                </p>
              )}
            </div>

            {/* Progressive Disclosure: Technical Metadata */}
            <details className="tech-evidence-details" style={{ marginTop: 12 }}>
              <summary className="tech-evidence-summary">
                Technical Evidence & Diagnostic Metadata
              </summary>
              <div className="tech-evidence-body">
                <div className="metadata-row">
                  <span className="metadata-key">Internal Case ID:</span>
                  <span className="metadata-val mono">{observation.caseId}</span>
                </div>
                <div className="metadata-row">
                  <span className="metadata-key">Test Rationale:</span>
                  <span className="metadata-val">{rationale}</span>
                </div>
                <div className="metadata-row">
                  <span className="metadata-key">Source Document:</span>
                  <span className="metadata-val">{snapshot.contract.sourceDocumentName} ({snapshot.contract.sourceType})</span>
                </div>
                <div className="metadata-row">
                  <span className="metadata-key">Source Excerpt:</span>
                  <span className="metadata-val">&ldquo;{snapshot.contract.sourceExcerpt}&rdquo;</span>
                </div>
                <div className="metadata-row">
                  <span className="metadata-key">Confirmed Contract:</span>
                  <span className="metadata-val mono">
                    {snapshot.contract.fieldName} {snapshot.contract.operator} {formatValueWithUnit(snapshot.contract.threshold, snapshot.contract.unit)}
                  </span>
                </div>
                <div className="metadata-row">
                  <span className="metadata-key">Target Selector:</span>
                  <span className="metadata-val mono">#annual-income</span>
                </div>
                <div className="metadata-row">
                  <span className="metadata-key">Run ID:</span>
                  <span className="metadata-val mono">{snapshot.runId}</span>
                </div>
                <div className="metadata-row">
                  <span className="metadata-key">Timestamp:</span>
                  <span className="metadata-val mono">{executionTimestamp}</span>
                </div>
                <div className="metadata-row">
                  <span className="metadata-key">Duration:</span>
                  <span className="metadata-val mono">{observation.durationMs > 0 ? `${observation.durationMs}ms` : '—'}</span>
                </div>
                {observation.diagnosticDetails && (
                  <div className="metadata-row">
                    <span className="metadata-key">Diagnostics:</span>
                    <span className="metadata-val mono">{observation.diagnosticDetails}</span>
                  </div>
                )}
              </div>
            </details>
          </div>
        </div>
      </div>

      {/* Accessible Full-Size Screenshot Lightbox Modal */}
      {isFullSizeOpen && screenshotUrl && (
        <div
          className="drawer-backdrop"
          style={{ zIndex: 60, alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={closeFullSize}
        >
          <div
            className="fullsize-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="fullsize-modal-title"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-main)',
              boxShadow: 'var(--shadow-lg)',
              maxWidth: '92vw',
              maxHeight: '92vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '12px 18px',
                borderBottom: '1px solid var(--border-main)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: 'var(--bg-surface)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <h4 id="fullsize-modal-title" style={{ fontWeight: 600, fontSize: '0.9rem', margin: 0 }}>
                  Viewport Capture — Case {caseIndex} ({formatValueWithUnit(observation.value, snapshot.contract.unit)})
                </h4>
                <span className="badge badge-neutral mono" style={{ fontSize: '0.75rem' }}>
                  {snapshot.fixtureMode === 'inconsistent' ? 'Mode A (₹2,50,000 threshold)' : 'Mode B (₹3,00,000 threshold)'}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    type="button"
                    className={`btn btn-secondary ${zoomLevel === 'fit' ? 'btn-active' : ''}`}
                    style={{ minHeight: 28, padding: '2px 8px', fontSize: '0.75rem' }}
                    onClick={() => setZoomLevel('fit')}
                  >
                    Fit
                  </button>
                  <button
                    type="button"
                    className={`btn btn-secondary ${zoomLevel === '100%' ? 'btn-active' : ''}`}
                    style={{ minHeight: 28, padding: '2px 8px', fontSize: '0.75rem' }}
                    onClick={() => setZoomLevel('100%')}
                  >
                    100%
                  </button>
                  <button
                    type="button"
                    className={`btn btn-secondary ${zoomLevel === '150%' ? 'btn-active' : ''}`}
                    style={{ minHeight: 28, padding: '2px 8px', fontSize: '0.75rem' }}
                    onClick={() => setZoomLevel('150%')}
                  >
                    150%
                  </button>
                </div>
                <button
                  ref={fullSizeCloseBtnRef}
                  autoFocus
                  type="button"
                  className="btn btn-secondary"
                  style={{ minHeight: 28, padding: '2px 10px', fontSize: '0.8rem' }}
                  onClick={closeFullSize}
                  aria-label="Close full size screenshot modal"
                >
                  ✕
                </button>
              </div>
            </div>

            <div
              style={{
                flex: 1,
                overflow: 'auto',
                padding: 16,
                backgroundColor: 'var(--bg-subtle)',
                display: 'flex',
                justifyContent: 'center',
                alignItems: zoomLevel === 'fit' ? 'center' : 'flex-start',
              }}
            >
              <img
                src={screenshotUrl}
                alt={`Full size capture for Case ${caseIndex}`}
                style={{
                  maxWidth: zoomLevel === 'fit' ? '100%' : 'none',
                  maxHeight: zoomLevel === 'fit' ? 'calc(92vh - 80px)' : 'none',
                  width: zoomLevel === '100%' ? '1280px' : zoomLevel === '150%' ? '1920px' : 'auto',
                  border: '1px solid var(--border-main)',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: '#ffffff',
                }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

