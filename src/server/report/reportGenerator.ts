import { VerificationRunSnapshot, TestObservation } from '../../shared/contract.js';
import { evidenceStore } from '../storage/evidenceStore.js';

export function escapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export async function generateHtmlEvidenceReport(snapshot: VerificationRunSnapshot): Promise<string> {
  const {
    runId,
    startedAt,
    completedAt,
    status,
    contract,
    fixtureMode,
    observations,
    summaryCounts,
    sampledMismatchSummary,
  } = snapshot;

  // Load screenshots as base64 data URIs
  const screenshots: Record<string, string> = {};
  for (const obs of observations) {
    if (obs.screenshotId) {
      const buf = await evidenceStore.getScreenshot(`${runId}/${obs.caseId}`);
      if (buf) {
        screenshots[obs.caseId] = `data:image/png;base64,${buf.toString('base64')}`;
      }
    }
  }

  const renderBadge = (classification: TestObservation['classification'], lifecycle: TestObservation['lifecycleState']) => {
    if (lifecycle === 'NOT_EXECUTED') {
      return '<span class="badge badge-neutral">NOT EXECUTED</span>';
    }
    if (lifecycle === 'INTERRUPTED') {
      return '<span class="badge badge-error">INTERRUPTED</span>';
    }
    switch (classification) {
      case 'CONSISTENT':
        return '<span class="badge badge-consistent">CONSISTENT</span>';
      case 'CONFIRMED_MISMATCH':
        return '<span class="badge badge-mismatch">CONFIRMED MISMATCH</span>';
      case 'INCONCLUSIVE':
        return '<span class="badge badge-inconclusive">INCONCLUSIVE</span>';
      case 'EXECUTION_ERROR':
        return '<span class="badge badge-error">EXECUTION ERROR</span>';
      default:
        return '<span class="badge badge-neutral">PENDING</span>';
    }
  };

  const renderRows = observations
    .map((obs) => {
      const isMismatch = obs.classification === 'CONFIRMED_MISMATCH';
      const screenshot = screenshots[obs.caseId];

      return `
      <tr class="${isMismatch ? 'mismatch-row' : ''}">
        <td class="mono font-bold">₹${obs.value.toLocaleString('en-IN')}</td>
        <td>
          <span class="badge ${obs.expectedOutcome === 'ACCEPT' ? 'badge-consistent' : 'badge-error'}">
            ${escapeHtml(obs.expectedOutcome)}
          </span>
        </td>
        <td>
          ${
            obs.observedFormOutcome
              ? `<span class="badge ${
                  obs.observedFormOutcome === 'ACCEPTED'
                    ? 'badge-consistent'
                    : obs.observedFormOutcome === 'REJECTED'
                    ? 'badge-error'
                    : 'badge-inconclusive'
                }">${escapeHtml(obs.observedFormOutcome)}</span>`
              : '—'
          }
        </td>
        <td>${renderBadge(obs.classification, obs.lifecycleState)}</td>
        <td class="mono text-muted">${obs.durationMs > 0 ? `${obs.durationMs}ms` : '—'}</td>
        <td class="feedback-cell">${escapeHtml(obs.observedFeedbackText || '—')}</td>
        <td>
          ${
            screenshot
              ? `<details>
                  <summary class="view-evidence-btn">View Capture</summary>
                  <div class="screenshot-container">
                    <img src="${screenshot}" alt="Observation capture for ₹${obs.value}" class="screenshot-img" />
                  </div>
                </details>`
              : '<span class="text-muted">None</span>'
          }
        </td>
      </tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RuleGap Evidence Report — Run ${escapeHtml(runId.slice(0, 8))}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background-color: #f8fafc;
      color: #0f172a;
      line-height: 1.5;
      padding: 32px 24px;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    .header {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 24px;
      margin-bottom: 24px;
      box-shadow: 0 1px 2px rgba(0,0,0,0.05);
    }
    .header-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .title { font-size: 1.5rem; font-weight: 700; color: #0f172a; }
    .tagline { color: #64748b; font-size: 0.875rem; margin-top: 4px; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 0.85rem; }
    .font-bold { font-weight: 600; }
    .text-muted { color: #64748b; }
    .meta-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-top: 16px; font-size: 0.85rem; border-top: 1px solid #f1f5f9; padding-top: 16px; }
    .panel {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 24px;
      box-shadow: 0 1px 2px rgba(0,0,0,0.05);
    }
    .panel h2 { font-size: 1.1rem; font-weight: 600; margin-bottom: 12px; color: #0f172a; }
    .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 20px; }
    .summary-card { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 16px; border-left: 4px solid #cbd5e1; }
    .summary-card.consistent { border-left-color: #059669; }
    .summary-card.mismatch { border-left-color: #dc2626; }
    .summary-card.inconclusive { border-left-color: #d97706; }
    .summary-card.error { border-left-color: #475569; }
    .summary-label { font-size: 0.75rem; font-weight: 600; text-transform: uppercase; color: #64748b; }
    .summary-val { font-size: 1.5rem; font-weight: 700; margin-top: 4px; }
    .callout { padding: 14px 16px; border-radius: 6px; font-size: 0.85rem; line-height: 1.45; margin-bottom: 20px; }
    .callout-danger { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; }
    .callout-success { background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; }
    .callout-warning { background: #fffbeb; border: 1px solid #fde68a; color: #92400e; }
    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; text-align: left; }
    th { background: #f1f5f9; color: #475569; font-weight: 600; padding: 10px 14px; border-bottom: 1px solid #e2e8f0; }
    td { padding: 10px 14px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
    tr.mismatch-row { background-color: rgba(254, 242, 242, 0.45); }
    .badge {
      display: inline-block;
      font-size: 0.72rem;
      font-weight: 700;
      padding: 3px 7px;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    .badge-consistent { background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0; }
    .badge-mismatch { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
    .badge-inconclusive { background: #fffbeb; color: #d97706; border: 1px solid #fde68a; }
    .badge-error { background: #f8fafc; color: #475569; border: 1px solid #cbd5e1; }
    .badge-neutral { background: #f1f5f9; color: #475569; }
    .feedback-cell { max-width: 260px; font-size: 0.8rem; color: #334155; }
    .view-evidence-btn { cursor: pointer; color: #2563eb; font-weight: 500; font-size: 0.8rem; }
    .screenshot-container { margin-top: 8px; border: 1px solid #cbd5e1; border-radius: 4px; overflow: hidden; background: #000; }
    .screenshot-img { width: 100%; max-width: 600px; display: block; }
    .footer { text-align: center; font-size: 0.75rem; color: #64748b; margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="header-top">
        <div>
          <h1 class="title">RuleGap — Software Consistency Evidence Report</h1>
          <p class="tagline">The rules say yes. The form says no. Local-first software consistency verifier.</p>
        </div>
        <div>
          <span class="badge ${status === 'COMPLETED_CONSISTENT' ? 'badge-consistent' : status === 'COMPLETED_MISMATCHES' ? 'badge-mismatch' : 'badge-neutral'}">
            ${escapeHtml(status)}
          </span>
        </div>
      </div>
      <div class="meta-grid">
        <div><span class="text-muted">Run ID:</span> <span class="mono">${escapeHtml(runId)}</span></div>
        <div><span class="text-muted">Started:</span> <span>${escapeHtml(startedAt)}</span></div>
        <div><span class="text-muted">Completed:</span> <span>${escapeHtml(completedAt || 'Incomplete')}</span></div>
        <div><span class="text-muted">Fixture Mode:</span> <span>${escapeHtml(fixtureMode === 'inconsistent' ? 'Mode A (Inconsistent)' : 'Mode B (Corrected)')}</span></div>
      </div>
    </div>

    <div class="panel">
      <h2>Confirmed Policy Rule Contract</h2>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 14px; margin-bottom: 12px;">
        <p style="font-style: italic; color: #334155; font-size: 0.9rem;">&ldquo;${escapeHtml(contract.sourceExcerpt)}&rdquo;</p>
      </div>
      <div class="meta-grid" style="border-top: none; padding-top: 0;">
        <div><span class="text-muted">Target Field:</span> <strong>${escapeHtml(contract.fieldName)}</strong></div>
        <div><span class="text-muted">Operator:</span> <strong class="mono">${escapeHtml(contract.operator)}</strong></div>
        <div><span class="text-muted">Threshold:</span> <strong class="mono">₹${contract.threshold.toLocaleString('en-IN')}</strong> (${escapeHtml(contract.unit)})</div>
        <div><span class="text-muted">Source Document:</span> <span>${escapeHtml(contract.sourceDocumentName)}</span></div>
        <div><span class="text-muted">Confirmed At:</span> <span>${escapeHtml(contract.confirmedAt)}</span></div>
      </div>
    </div>

    <div class="panel">
      <h2>Verification Summary</h2>
      <div class="summary-grid">
        <div class="summary-card consistent">
          <div class="summary-label">Consistent</div>
          <div class="summary-val" style="color: #059669;">${summaryCounts.consistent}</div>
        </div>
        <div class="summary-card mismatch">
          <div class="summary-label">Confirmed Mismatch</div>
          <div class="summary-val" style="color: #dc2626;">${summaryCounts.confirmedMismatch}</div>
        </div>
        <div class="summary-card inconclusive">
          <div class="summary-label">Inconclusive</div>
          <div class="summary-val" style="color: #d97706;">${summaryCounts.inconclusive}</div>
        </div>
        <div class="summary-card error">
          <div class="summary-label">Execution Errors</div>
          <div class="summary-val" style="color: #475569;">${summaryCounts.executionError}</div>
        </div>
      </div>

      ${
        status === 'COMPLETED_MISMATCHES' && sampledMismatchSummary
          ? `<div class="callout callout-danger">
              <strong>Confirmed Policy Mismatches Detected:</strong> The form rejected inputs that the documented policy explicitly allows.
              Discrepancies were confirmed at tested values between 
              <span class="mono font-bold">₹${sampledMismatchSummary.lowestMismatchValue?.toLocaleString('en-IN')}</span> and 
              <span class="mono font-bold">₹${sampledMismatchSummary.highestMismatchValue?.toLocaleString('en-IN')}</span>.
              <p style="margin-top: 6px; font-size: 0.8rem; color: #7f1d1d;">${escapeHtml(sampledMismatchSummary.disclaimer)}</p>
            </div>`
          : status === 'COMPLETED_CONSISTENT'
          ? `<div class="callout callout-success">
              <strong>Form Validated Consistent Across Tested Values:</strong> All ${summaryCounts.totalScheduled} executed test cases matched the policy rule expectations.
              <p style="margin-top: 6px; font-size: 0.8rem; color: #064e3b;">Note: Consistency is established strictly across tested boundary samples and probes.</p>
            </div>`
          : ''
      }
    </div>

    <div class="panel" style="padding: 0; overflow: hidden;">
      <div style="padding: 16px 20px; border-bottom: 1px solid #e2e8f0;">
        <h2>Observed Browser Evidence Matrix</h2>
      </div>
      <table>
        <thead>
          <tr>
            <th>Test Value</th>
            <th>Policy Expectation</th>
            <th>Observed Outcome</th>
            <th>Classification</th>
            <th>Duration</th>
            <th>Observed Feedback</th>
            <th>Screenshot Capture</th>
          </tr>
        </thead>
        <tbody>
          ${renderRows}
        </tbody>
      </table>
    </div>

    <div class="footer">
      <p>Generated by RuleGap — Self-Contained Offline Evidence Report. Zero external network dependencies.</p>
    </div>
  </div>
</body>
</html>`;
}
