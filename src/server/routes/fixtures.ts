import { Router, Request, Response } from 'express';

export const fixturesRouter = Router();

// Metadata endpoint
fixturesRouter.get('/api/fixtures', (_req: Request, res: Response) => {
  res.json({
    availableFixtures: [
      {
        id: 'scholarship',
        name: 'Community Scholarship Application Portal (Synthetic)',
        path: '/fixtures/scholarship',
        targetFieldSelector: '#annual-income',
        submitSelector: '#submit-btn',
        modes: [
          {
            id: 'inconsistent',
            label: 'Mode A: Inconsistent (₹250,000 cap)',
            description: 'Form rejects income > ₹250,000 (contradicts published policy of ₹300,000).',
          },
          {
            id: 'corrected',
            label: 'Mode B: Corrected (₹300,000 cap)',
            description: 'Form restriction updated to match published policy of ₹300,000.',
          },
        ],
        defaultMode: 'inconsistent',
      },
    ],
  });
});

// Rendered HTML fixture endpoint
fixturesRouter.get('/fixtures/scholarship', (req: Request, res: Response) => {
  const mode = req.query.mode === 'corrected' ? 'corrected' : 'inconsistent';
  const threshold = mode === 'corrected' ? 300000 : 250000;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Community Scholarship Grant Portal (Synthetic Test Fixture)</title>
  <style>
    :root {
      --bg: #0F172A;
      --card: #1E293B;
      --border: #334155;
      --text: #F8FAFC;
      --muted: #94A3B8;
      --primary: #2563EB;
      --error: #EF4444;
      --success: #22C55E;
    }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      background: var(--bg);
      color: var(--text);
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      padding: 1rem;
      box-sizing: border-box;
    }
    .fixture-container {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 2rem;
      max-width: 480px;
      width: 100%;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3);
    }
    .banner {
      background: #0284C7;
      color: white;
      font-size: 0.75rem;
      font-weight: 700;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      display: inline-block;
      margin-bottom: 1rem;
      letter-spacing: 0.05em;
    }
    h1 {
      font-size: 1.25rem;
      margin: 0 0 0.5rem 0;
    }
    p {
      color: var(--muted);
      font-size: 0.875rem;
      margin: 0 0 1.5rem 0;
    }
    .form-group {
      margin-bottom: 1rem;
    }
    label {
      display: block;
      font-size: 0.8125rem;
      font-weight: 600;
      margin-bottom: 0.375rem;
    }
    input {
      width: 100%;
      padding: 0.5rem 0.75rem;
      background: #0F172A;
      border: 1px solid var(--border);
      border-radius: 4px;
      color: white;
      font-family: monospace;
      font-size: 0.9375rem;
      box-sizing: border-box;
    }
    input:focus {
      outline: 2px solid var(--primary);
    }
    button {
      width: 100%;
      padding: 0.625rem 1rem;
      background: var(--primary);
      color: white;
      border: none;
      border-radius: 4px;
      font-weight: 600;
      cursor: pointer;
      margin-top: 0.5rem;
    }
    button:hover {
      background: #1D4ED8;
    }
    .feedback {
      margin-top: 1rem;
      padding: 0.75rem;
      border-radius: 4px;
      font-size: 0.875rem;
      display: none;
    }
    .feedback.error {
      display: block;
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid var(--error);
      color: #FCA5A5;
    }
    .feedback.success {
      display: block;
      background: rgba(34, 197, 94, 0.15);
      border: 1px solid var(--success);
      color: #86EFAC;
    }
    .meta-tag {
      margin-top: 1.5rem;
      padding-top: 1rem;
      border-top: 1px solid var(--border);
      font-size: 0.75rem;
      color: var(--muted);
      font-family: monospace;
    }
  </style>
</head>
<body>
  <div class="fixture-container">
    <div class="banner">SYNTHETIC TEST FIXTURE</div>
    <h1>Community Scholarship Application</h1>
    <p>Please enter your certified household income details for verification.</p>

    <form id="scholarship-form" novalidate>
      <div class="form-group">
        <label for="applicant-name">Applicant Full Name</label>
        <input id="applicant-name" name="name" value="Jane Doe" required />
        <div id="name-error-container"></div>
      </div>

      <div class="form-group">
        <label for="annual-income">Annual Family Income (INR)</label>
        <input id="annual-income" name="income" type="number" required placeholder="e.g. 250000" />
      </div>

      <button id="submit-btn" type="submit">Submit Application</button>

      <div id="feedback-area"></div>
    </form>

    <div class="meta-tag">
      Target Mode: <strong>${mode}</strong> (Enforced Cap: ₹${threshold.toLocaleString('en-IN')})
    </div>
  </div>

  <script>
    const FORM_THRESHOLD = ${threshold};

    document.getElementById('scholarship-form').addEventListener('submit', function(e) {
      e.preventDefault();
      const feedbackArea = document.getElementById('feedback-area');
      const nameInput = document.getElementById('applicant-name');
      const incomeInput = document.getElementById('annual-income');

      feedbackArea.innerHTML = '';
      feedbackArea.className = 'feedback';

      // Check unrelated validation error
      if (!nameInput.value.trim()) {
        feedbackArea.className = 'feedback error';
        feedbackArea.innerHTML = '<div data-testid="unrelated-error" id="name-error" role="alert">Applicant Name is required.</div>';
        return;
      }

      const rawVal = incomeInput.value.trim();
      const incomeVal = Number(rawVal);

      if (rawVal === '' || isNaN(incomeVal)) {
        feedbackArea.className = 'feedback error';
        feedbackArea.innerHTML = '<div data-testid="field-error" id="income-error" role="alert">Please enter a valid numeric income amount.</div>';
        return;
      }

      // Enforce the threshold validation rule
      if (incomeVal > FORM_THRESHOLD) {
        feedbackArea.className = 'feedback error';
        feedbackArea.innerHTML = '<div data-testid="field-error" id="income-error" role="alert">Annual family income exceeds eligible limit of ₹' + FORM_THRESHOLD.toLocaleString('en-IN') + ' for this grant program.</div>';
      } else {
        feedbackArea.className = 'feedback success';
        feedbackArea.innerHTML = '<div data-testid="status-accepted" id="status-accepted" role="status">Application successfully received for processing. Reference ID: SCH-2026-OK.</div>';
      }
    });
  </script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});
