# RuleGap

> **"The rules say yes. The form says no."**

An open-source, local-first software consistency verifier built for the Devpost *Build With AI: Basics 2026* hackathon.

RuleGap detects, documents, and proves discrepancies between written policy guidelines (PDF/text) and digital form validation logic through automated, black-box browser execution.

---

## The Problem

When institutions update grant limits, scholarship income thresholds, or regulatory policies, digital web forms frequently remain hardcoded with obsolete criteria. Eligible applicants are silently rejected without explanation, while compliance officers and engineers lack shared, reproducible evidence of where and how the form diverged from the documented policy.

## The Solution

RuleGap provides a unified, local-first verification workbench:

1. **Policy Ingestion**: Paste policy text or extract text from a PDF policy document (with graceful inline fallback for unparseable documents).
2. **Rule Contract Confirmation**: Formally confirm the field name, comparison operator (`<=`, `<`, `>=`, `>`), threshold value, unit, and source excerpt.
3. **Pre-Flight Test Plan Review**: The system deterministically derives boundary test values ($T-1$, $T$, $T+1$) and demonstration probes. An authoritative plan approval gate requires explicit user sign-off before any browser execution can begin.
4. **Independent Black-Box Browser Verification**: A hermetic Playwright Chromium runner navigates to the authorized target form, inputs values, submits, and inspects observable DOM feedback without reading internal form source code or hardcoded thresholds.
5. **Primary Evidence Matrix & Inspection**: Results are categorized into four mutually exclusive classifications:
   - **Consistent**: Observable form behavior matches policy expectation.
   - **Confirmed Mismatch**: Form rejected an applicant the policy permits, or accepted one the policy forbids.
   - **Inconclusive**: Form rejected due to an unrelated required field or ambiguous feedback.
   - **Execution Error**: Target field or submit button missing from the DOM.
6. **Standalone Offline HTML Evidence Export**: Download a single-file, self-contained HTML report with inline styling and base64-embedded screenshots that opens offline with zero external network calls.

---

## Demonstration Fixture

RuleGap includes an embedded synthetic scholarship application fixture (`/fixtures/scholarship`) supporting two demonstration modes:

- **Mode A (Inconsistent Fixture)**: Form enforces an unupdated ₹250,000 threshold against a documented ₹300,000 policy rule.
  - Executing the 7 boundary test cases produces: **3 Consistent**, **4 Confirmed Mismatches** (at ₹250,001, ₹275,000, ₹299,999, ₹300,000), **0 Inconclusive**, **0 Execution Errors**.
- **Mode B (Corrected Fixture)**: Form enforces the updated ₹300,000 threshold.
  - Executing the 7 boundary test cases produces: **7 Consistent**, **0 Confirmed Mismatches**.

Historical verification runs are preserved immutably, allowing stakeholders to compare pre- and post-correction evidence side by side.

---

## Architectural Principles & Integrity

- **Zero Cloud Dependencies & Zero Paid APIs**: Runs entirely on the local machine without external LLM API keys or SaaS subscriptions.
- **Hermetic Security Perimeter**: All browser contexts block external network routes, unrequested popups, and service workers, restricting execution strictly to `127.0.0.1`.
- **Anti-CSRF & Host Header Validation**: All state-changing API endpoints require the custom `X-RuleGap-Client: true` header and validate the `Host` header.
- **Evidence Integrity**: Never claims universal correctness or complete form coverage from finite samples. Reports consistency strictly across tested values with explicit sampling disclaimers.
- **Crash Recovery**: Active verification runs maintain atomic filesystem checkpoints (`.active-[runId].json`), safely reconciling interrupted runs to `FAILED` on server restart.

---

## Installation & Startup

### Prerequisites

- [Node.js](https://nodejs.org/) v20 or v24
- npm v10+

### Quick Start

1. **Clone the repository and install dependencies**:
   ```bash
   git clone https://github.com/example/rulegap.git
   cd rulegap
   npm install
   ```

2. **Install Playwright Chromium browser**:
   ```bash
   npx playwright install chromium
   ```

3. **Start the development server**:
   ```bash
   npm run dev
   ```
   Open your browser to `http://127.0.0.1:3000`.

### Production Build & Run

```bash
# Build client and server bundles
npm run build

# Start production server
npm start
```

### Running Tests

```bash
# Run all unit, integration, and E2E test suites
npm test

# Run E2E Playwright tests specifically
npm run test:e2e
```

---

## Technology Stack

- **Runtime & Backend**: Node.js, Express, TypeScript, Zod
- **Frontend**: React 18, Vite, Custom CSS (Workshop + Gridline design tokens)
- **Browser Automation**: Playwright (Headless Chromium)
- **Document Processing**: `pdfjs-dist` (client-side text extraction)
- **Testing**: Vitest, Playwright Test

---

## License

[MIT License](LICENSE) — Copyright (c) 2026 RuleGap Contributors.
