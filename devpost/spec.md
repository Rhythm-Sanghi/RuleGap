---
doc: spec
status: approved
---

# RuleGap — Technical Spec

RuleGap is a local-first software consistency verifier that demonstrates when the requirements published in a policy document contradict the actual validation restrictions enforced by an application form.
Source: `prd.md > The Core Journey`

---

## How This Works, In Plain Language

RuleGap is structured around three decoupled engineering components operating as a cohesive workbench:

1. **The Policy & Rule Engine:** Ingests raw policy text or text-based PDFs (via client-side PDF.js), records source provenance, and manages human-confirmed numeric rules (`income <= 300000`). It deterministically computes expected policy outcomes (`ACCEPT` or `REJECT`) for any numeric input without AI or network calls.
2. **The Form Observer (Browser Runner):** Executes Playwright against an authorized localhost target form in black-box mode. For each test value, it creates a fresh, hermetic browser context with clean storage, inputs the value into the target field, triggers validation, and captures observable DOM feedback (`Form Accepted` banner vs field-specific `Form Rejected` error). It has no access to the form's internal validation code or configuration.
3. **The Verification & Comparison Engine:** Independently compares the policy expectation against the observed form behavior. It assigns one of four strict classifications (`Consistent`, `Confirmed Mismatch`, `Inconclusive`, `Execution Error`), streams real-time progress to the UI via Server-Sent Events, records immutable run history snapshots, and generates self-contained offline HTML reports.

Everything runs locally on a single machine via a unified Node.js server binding strictly to `127.0.0.1:3000`, requiring zero paid APIs, cloud services, or external databases.

---

## The Core Journey Through the System

This trace maps directly to `prd.md > The Core Journey`:

1. **User opens `http://127.0.0.1:3000`:** The Express server serves the compiled React client workbench. The client queries `GET /api/fixtures` to inspect available authorized local fixtures (`/fixtures/scholarship`) and defaults to **Mode A (Inconsistent — ₹250,000 cap)**.
2. **Policy Ingestion & Contract Confirmation:** The user uploads a PDF or pastes policy text. Client extracts text via in-browser PDF.js (falling back gracefully to manual text entry if extraction yields no text, tagging provenance as `manual_fallback_pdf`). The user confirms structured fields. Client validates fields via Zod and locks the contract state.
3. **Pre-Flight Test Plan Generation & Server Approval:** The client invokes the deterministic boundary generator with the confirmed threshold (`300000`) and operator (`<=`). The generator derives generic boundary points (`299999`, `300000`, `300001`) and merges the fixture's configured demonstration probes (`249999`, `250000`, `250001`, `275000`). The client requests `POST /api/plans` to create a server-managed canonical test plan snapshot. The server validates the contract, recomputes expectations, deduplicates values, bounds the test count, and issues a `planId`.
4. **Explicit Plan Approval & Run Request:** The user checks **Approve Test Plan**, which sends `POST /api/plans/:planId/approve` to explicitly record server-side authorization. When the user clicks **Run Verification**, the client posts `{ planId }` to `POST /api/runs` with custom header `X-RuleGap-Client: true`. The server verifies that the referenced `planId` exists, is approved, matches the current active contract and fixture configuration, and starts execution.
5. **SSE Stream & Execution:** The client opens an EventSource to `GET /api/runs/:runId/events`. The server's Playwright runner iterates through the 7 cases:
   - For each case: creates a fresh `browserContext` with route blocking (allowing only the fixture route and required same-origin static assets), navigates to `http://127.0.0.1:3000/fixtures/scholarship?mode=inconsistent`, fills `#annual-income`, submits `#submit-btn`, and waits for explicit DOM feedback (`[data-testid="status-accepted"]` or `[data-testid="field-error"]`).
   - If a mismatch occurs, Playwright captures a viewport screenshot, saves it to bounded local storage, and emits an SSE event with sequence number, outcome, and evidence URI.
   - Client receives events, increments the progress bar, and updates the evidence matrix.
6. **Run Settlement & History:** The runner completes all 7 cases. Server finalizes the run record, computes terminal status (`COMPLETED_MISMATCHES`), saves an immutable snapshot to `.rulegap/runs/[runId].json`, and emits a `run_completed` event with summary counts (3 Consistent, 4 Mismatch, 0 Inconclusive, 0 Error, 0 Not Executed, 0 Interrupted). Client saves this as **Run 1**.
7. **Fixture Toggle & Rerun:** The user toggles the fixture control to **Mode B (Corrected)**. Client detects target configuration change, invalidates the current test plan approval, and displays a re-approval prompt. Upon user re-approval and run, the server executes against `mode=corrected`. The run completes with 7 Consistent, terminal status `COMPLETED_CONSISTENT`, saved immutably as **Run 2**.
8. **Export:** The user clicks **Export HTML Report** on either run. Client requests `GET /api/runs/:runId/report`. The server compiles the run snapshot into a single self-contained HTML document with inline CSS, embedded base64 screenshots, and explicit sampling disclosures.

---

## Stack & Dependency Matrix

- **Runtime:** Node.js v24 LTS binding strictly to `127.0.0.1`
- **Frontend Framework:** React 18 / 19 with Vite
- **Backend Framework:** Express with TypeScript
- **Schema & Validation:** Zod (shared between client and server)
- **Browser Automation:** Playwright Chromium (hermetic browser contexts and route blocking)
- **Document Processing:** PDF.js (`pdfjs-dist`, client-side execution)
- **Testing:** Vitest (unit & integration) + Playwright Test Runner (E2E)
- **Styling:** CSS variables & modular CSS utility classes (no external UI framework, zero Tailwind bloat)

---

## Where It Runs and How Someone Tries It

- **Environment:** Local Windows / macOS / Linux machine with Node.js and npm installed. Fully offline after initial `npm install` and `npx playwright install chromium`.
- **Runtime Scripts:**
  - `npm run dev`: Starts the unified Express server with Vite middleware in development mode on `http://127.0.0.1:3000`.
  - `npm run build`: Dual compilation script:
    1. Compiles frontend via `vite build` into `dist/client`.
    2. Compiles backend via `tsc -p tsconfig.server.json` into `dist/server`.
  - `npm start`: Starts production server `node dist/server/server.js` serving `dist/client` static assets on `http://127.0.0.1:3000`.
  - `npm test`: Runs Vitest test suite for unit, schema, and report generator tests.
  - `npm run test:e2e`: Runs Playwright end-to-end tests against the embedded fixture.
- **No external accounts, API keys, databases, or GPU required.**

---

## Look and Feel & Styling Architecture

Translating `prd.md > Look and Feel` into modular CSS variables and layout tokens:
- **Design Tokens (`src/client/styles/tokens.css`):**
  - `--rg-bg-base`: `#09090B` (zinc-950)
  - `--rg-bg-panel`: `#18181B` (zinc-900)
  - `--rg-bg-card`: `#27272A` (zinc-800)
  - `--rg-border-grid`: `#3F3F46` (zinc-700, 1px solid)
  - `--rg-text-primary`: `#FAFAFA` (zinc-50)
  - `--rg-text-muted`: `#A1A1AA` (zinc-400)
  - `--rg-accent`: `#2563EB` (blue-600)
  - `--rg-status-consistent`: `#22C55E`
  - `--rg-status-mismatch`: `#EF4444`
  - `--rg-status-inconclusive`: `#F59E0B`
  - `--rg-status-error`: `#DC2626`
  - `--rg-status-unexecuted`: `#71717A`
- **Typography:** System sans-serif for interface copy; `'JetBrains Mono', 'Consolas', monospace` for all inputs, numbers, operators, thresholds, and evidence matrices.
- **Responsive Layout Space:** Layout adjusts using CSS media queries (`max-width: 1023px` stacks panels into sequential sections; `min-width: 1024px` renders 2-column workbench). Contained scroll viewports (`overflow-x: auto`) for tables prevent whole-page horizontal scrolling regardless of viewport width or browser zoom scale.

---

## Data Model & Classification Invariants

Shared TypeScript definitions and Zod schemas located in `src/shared/contract.ts`:

```typescript
import { z } from 'zod';

export const NumericOperatorSchema = z.enum(['<', '<=', '>', '>=']);
export type NumericOperator = z.infer<typeof NumericOperatorSchema>;

export const SourceTypeSchema = z.enum([
  'extracted_pdf',
  'manual_fallback_pdf',
  'pasted_text',
  'sample_policy',
]);
export type SourceType = z.infer<typeof SourceTypeSchema>;

export const RuleContractSchema = z.object({
  id: z.string().uuid(),
  fieldName: z.string().min(1).max(100),
  operator: NumericOperatorSchema,
  threshold: z.number().int().safe(),
  unit: z.string().min(1).max(20),
  sourceExcerpt: z.string().min(1).max(5000),
  sourceDocumentName: z.string().max(255),
  sourceType: SourceTypeSchema,
  confirmedAt: z.string().datetime(),
});
export type RuleContract = z.infer<typeof RuleContractSchema>;

export const PolicyExpectationSchema = z.enum(['ACCEPT', 'REJECT']);
export type PolicyExpectation = z.infer<typeof PolicyExpectationSchema>;

export const BoundaryTestCaseSchema = z.object({
  caseId: z.string().regex(/^[a-zA-Z0-9_-]+$/),
  value: z.number().int().safe(),
  unit: z.string(),
  expectedOutcome: PolicyExpectationSchema,
  rationale: z.string(),
  isDemoProbe: z.boolean(),
});
export type BoundaryTestCase = z.infer<typeof BoundaryTestCaseSchema>;

export const TestPlanRecordSchema = z.object({
  planId: z.string().uuid(),
  contractId: z.string().uuid(),
  fixtureId: z.literal('scholarship'),
  fixtureMode: z.enum(['inconsistent', 'corrected']),
  targetFieldSelector: z.literal('#annual-income'),
  cases: z.array(BoundaryTestCaseSchema).min(1).max(25),
  createdAt: z.string().datetime(),
  approvedAt: z.string().datetime().nullable(),
  isApproved: z.boolean(),
});
export type TestPlanRecord = z.infer<typeof TestPlanRecordSchema>;

export const FormOutcomeSchema = z.enum(['ACCEPTED', 'REJECTED', 'INDETERMINATE']);
export type FormOutcome = z.infer<typeof FormOutcomeSchema>;

// Strict 4 verification outcomes (mutually exclusive)
export const VerificationClassificationSchema = z.enum([
  'CONSISTENT',
  'CONFIRMED_MISMATCH',
  'INCONCLUSIVE',
  'EXECUTION_ERROR',
]);
export type VerificationClassification = z.infer<typeof VerificationClassificationSchema>;

// Lifecycle states of a test case
export const CaseLifecycleStateSchema = z.enum([
  'PENDING',
  'RUNNING',
  'COMPLETED',
  'NOT_EXECUTED',
  'INTERRUPTED',
]);
export type CaseLifecycleState = z.infer<typeof CaseLifecycleStateSchema>;

export const TestObservationSchema = z.object({
  caseId: z.string(),
  value: z.number().int(),
  expectedOutcome: PolicyExpectationSchema,
  observedFormOutcome: FormOutcomeSchema.nullable(),
  observedFeedbackText: z.string().nullable(),
  classification: VerificationClassificationSchema.nullable(),
  lifecycleState: CaseLifecycleStateSchema,
  durationMs: z.number().nonnegative(),
  screenshotId: z.string().nullable(),
  diagnosticDetails: z.string().nullable(),
  executedAt: z.string().datetime().nullable(),
});
export type TestObservation = z.infer<typeof TestObservationSchema>;

// Run statuses: Nonterminal vs Terminal
export const RunStatusSchema = z.enum([
  'QUEUED',
  'RUNNING',
  'CANCELLATION_REQUESTED',
  'COMPLETED_CONSISTENT',
  'COMPLETED_MISMATCHES',
  'COMPLETED_WITH_UNCERTAINTY',
  'CANCELLED_PARTIAL',
  'FAILED',
]);
export type RunStatus = z.infer<typeof RunStatusSchema>;

export const SummaryCountsSchema = z.object({
  consistent: z.number().int().nonnegative(),
  confirmedMismatch: z.number().int().nonnegative(),
  inconclusive: z.number().int().nonnegative(),
  executionError: z.number().int().nonnegative(),
  notExecuted: z.number().int().nonnegative(),
  interrupted: z.number().int().nonnegative(),
  totalScheduled: z.number().int().positive(),
});
export type SummaryCounts = z.infer<typeof SummaryCountsSchema>;

export const VerificationRunSnapshotSchema = z.object({
  runId: z.string().uuid(),
  planId: z.string().uuid(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  status: RunStatusSchema,
  contract: RuleContractSchema,
  fixtureMode: z.enum(['inconsistent', 'corrected']),
  observations: z.array(TestObservationSchema),
  summaryCounts: SummaryCountsSchema,
  sampledMismatchSummary: z.object({
    lowestMismatchValue: z.number().nullable(),
    highestMismatchValue: z.number().nullable(),
    disclaimer: z.string(),
  }).nullable(),
});
export type VerificationRunSnapshot = z.infer<typeof VerificationRunSnapshotSchema>;
```

### Strict Classification & Disposition Invariant
Every scheduled test case is assigned exactly one disposition upon run completion:
$$\text{consistent} + \text{confirmedMismatch} + \text{inconclusive} + \text{executionError} + \text{notExecuted} + \text{interrupted} = \text{totalScheduled}$$

A run is classified as `COMPLETED_CONSISTENT` **if and only if**:
- `totalScheduled === consistent`
- `confirmedMismatch === 0`, `inconclusive === 0`, `executionError === 0`, `notExecuted === 0`, `interrupted === 0`

---

## Server Security & Boundary Containment

1. **Host & Port Binding:** Express binds strictly to `127.0.0.1:3000`. The server checks the `Host` header and rejects requests not addressing `127.0.0.1:3000` or `localhost:3000` with HTTP 403.
2. **Anti-CSRF Header Protection:** All state-changing requests (`POST /api/runs`, `POST /api/runs/:id/cancel`, `POST /api/plans`, `POST /api/plans/:id/approve`) require the custom header `X-RuleGap-Client: true`. Cross-origin browser requests cannot set custom headers without CORS preflight approval; CORS is explicitly disabled for external origins.
3. **Target Allowlist & URL Construction:** The server rejects arbitrary URLs from clients. The client specifies `fixtureId: 'scholarship'` and `fixtureMode: 'inconsistent' | 'corrected'`. The server validates these against an internal allowlist and constructs the absolute URL internally:
   `const targetUrl = new URL(`/fixtures/scholarship?mode=${mode}`, 'http://127.0.0.1:3000').href;`
4. **Playwright Network Sandbox & Route Allowlist:**
   - Playwright context route interception permits only requests to:
     - `http://127.0.0.1:3000/fixtures/scholarship*` (the approved target form)
     - `http://127.0.0.1:3000/assets/*` and `http://127.0.0.1:3000/src/*` (required same-origin scripts/styles in dev/prod)
     - `http://127.0.0.1:3000/@vite/*` and `http://127.0.0.1:3000/@react-refresh` (Vite dev assets)
   - All other requests (external domains, unauthorized local paths, redirects) are aborted immediately (`blockedbyclient`).
   - Service workers are blocked (`serviceWorkers: 'block'`).
   - Popups and unexpected new pages are automatically closed.
5. **Path Traversal & Storage Limits:** `runId`, `planId`, and `caseId` are validated against strict UUID and alphanumeric regexes before accessing filesystem storage under `.rulegap/runs/` and `.rulegap/evidence/`. Screenshots are limited to a maximum of 25 per run and 1MB each.

---

## Authoritative Plan Management & Approval Gate

To ensure plan approval is truly authoritative:
1. **Plan Snapshot Creation (`POST /api/plans`):**
   Client posts `{ contract, fixtureId, fixtureMode, targetFieldSelector, testValues }`.
   Server validates contract and bounds, recomputes expected outcomes independently, deduplicates values, bounds cases, creates a server-side `TestPlanRecord` with a UUID `planId`, sets `isApproved: false`, and stores it in server memory/storage.
2. **Explicit User Approval Action (`POST /api/plans/:planId/approve`):**
   When the user reviews the plan and checks "Approve Test Plan", the client sends `POST /api/plans/:planId/approve`. The server sets `isApproved: true`, `approvedAt: new Date().toISOString()`, and returns `{ success: true, planId }`.
3. **Execution Gate (`POST /api/runs`):**
   Client submits `{ planId }`. The server retrieves the plan record by `planId`:
   - Rejects if plan does not exist or `isApproved === false` (HTTP 400 `PLAN_NOT_APPROVED`).
   - Rejects if the plan's `contractId` does not match the currently confirmed contract or if `fixtureMode` does not match current target state (HTTP 400 `PLAN_STALE`).
   - Uses the server's canonical plan cases and expectations to drive the verification run.

---

## Active Run Record vs Finalized Run Snapshot

1. **Active Run Record with Atomic Checkpoints:**
   - Maintained by a thread-safe singleton `ActiveRunManager`. Only **one active run** is permitted concurrently (HTTP 409 `VERIFICATION_ALREADY_ACTIVE` if another is triggered).
   - Holds active Playwright `Browser`, active `BrowserContext`, running test index, cancellation abort handle, and buffered SSE events.
   - **Atomic Progress Checkpoints:** As each test case completes, the runner atomically writes a checkpoint to `.rulegap/runs/.active-[runId].json.tmp` and renames it to `.rulegap/runs/.active-[runId].json`, preserving all completed observations durably on disk during execution.
2. **Finalized Run Snapshot (Immutable Disk Store):**
   - Upon completion, cancellation, or failure, the active checkpoint is finalized into `VerificationRunSnapshot`.
   - Written atomically to `.rulegap/runs/[runId].json` (writes to temp file, then renames), and the active checkpoint file is removed.
   - Once written, finalized snapshots are immutable.
3. **Crash Recovery & Reconciliation:**
   - When the server starts up, it scans `.rulegap/runs/`:
     - If any `.active-[runId].json` checkpoint file exists, the server reconciles it:
       - Preserves all completed observations.
       - Marks any in-flight case as `INTERRUPTED`.
       - Marks all queued uncompleted cases as `NOT_EXECUTED`.
       - Finalizes status to `FAILED` with diagnostic `"Server process interrupted or restarted during execution"`.
       - Atomically writes `.rulegap/runs/[runId].json` and removes the active checkpoint.
4. **History Discovery (`GET /api/runs`):**
   - Reads `.rulegap/runs/` and returns a list of all finalized historical runs (`runId`, `startedAt`, `completedAt`, `status`, `fixtureMode`, `summaryCounts`).

---

## Cancellation Lifecycle & API Semantics

When the user clicks **Cancel Verification**:
1. Client sends `POST /api/runs/:id/cancel` with header `X-RuleGap-Client: true`.
2. Server verifies `runId` matches active run. Sets internal flag `cancellationRequested = true`.
3. Server transitions active run status to `CANCELLATION_REQUESTED` and immediately responds with:
   `{ success: true, status: 'CANCELLATION_REQUESTED', runId }`
4. Runner execution loop catches the cancellation flag:
   - Halts scheduling of remaining test cases.
   - Triggers `activeContext.close()` to interrupt in-flight page operations.
   - In a structured `try/finally` block, safely releases all browser handles (`browserPool.release(browser)`).
5. For the active test case: if interrupted during interaction, set `lifecycleState: 'INTERRUPTED'`, `observedFormOutcome: null`, `classification: null`.
6. For all remaining queued test cases: set `lifecycleState: 'NOT_EXECUTED'`, `observedFormOutcome: null`, `classification: null`.
7. Recomputes summary counts: increments `interrupted` and `notExecuted`.
8. Finalizes run status to `CANCELLED_PARTIAL`.
9. Atomically writes finalized snapshot to disk and emits SSE event `run_cancelled`.
10. Idempotency: Subsequent calls to `POST /api/runs/:id/cancel` return the current state without error.

---

## Server-Sent Events (SSE) Reconnection Semantics

- **Endpoint:** `GET /api/runs/:id/events`
- **Headers:** `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`
- **Monotonic Sequence Numbers:** Every event payload carries a 1-based integer `seq`.
- **Event ID Protocol:** Express emits `id: <seq>\n`.
- **Event Types:**
  - `event: test_started` — `{ seq, caseId, value }`
  - `event: test_completed` — `{ seq, observation }` (metadata only; screenshot references are URIs, not base64)
  - `event: run_completed` — `{ seq, runSnapshot }`
  - `event: run_cancelled` — `{ seq, runSnapshot }`
  - `event: run_failed` — `{ seq, runSnapshot }`
- **Reconnection with `Last-Event-ID`:**
  - Server buffers up to 100 recent events per active run.
  - When a client reconnects presenting `Last-Event-ID: N`, the server immediately replays events from `N + 1` to current.
  - If `Last-Event-ID` is older than the buffer or invalid, the client performs a full reconciliation by fetching `GET /api/runs/:id`.
- **Deduplication:** The client tracks received `seq` numbers; any event with `seq <= lastSeenSeq` is discarded.
- **Connection Teardown:** After emitting a terminal event (`run_completed`, `run_cancelled`, `run_failed`), the server closes the SSE response stream.

---

## Standalone HTML Evidence Report Generator

- **Implementation:** `src/server/report/reportGenerator.ts`
- **Pure Function:** Takes a `VerificationRunSnapshot` and generates a single, fully offline HTML string.
- **Security & Sanitization:**
  - All user text (`sourceExcerpt`, `sourceDocumentName`, `fieldName`) and observed DOM text (`observedFeedbackText`, `diagnosticDetails`) are strictly HTML-escaped using standard entity encoding (`&`, `<`, `>`, `"`, `'`).
  - No user-supplied strings are rendered as unescaped HTML.
- **Self-Contained Bundling:**
  - Styles are embedded in a single `<style>` block.
  - No external fonts, no CDN scripts, no `<script>` tags required for viewing.
  - Captured screenshots are retrieved from `.rulegap/evidence/`, verified as valid PNG buffers, and embedded directly as `data:image/png;base64,...` data URIs.
- **Sampling Disclosures:** The report prominently displays:
  > **Testing Limitation & Verification Scope:** Findings are verified solely for the sampled input values. RuleGap does not infer or prove continuous intervals or exhaustive form behavior between sampled points.

---

## Components

### Component 1: `RuleIngestionWorkspace`
- Implements: `prd.md > Feature 1: Policy Ingestion & Source Fallback` & `prd.md > Feature 2: Deterministic Rule Contract Confirmation`.
- Manages text/PDF input, handles PDF.js extraction with fallback alerts, provides the controlled contract editor form (`field`, `operator`, `threshold`, `unit`), and manages explicit confirmation and invalidation events.

### Component 2: `VerificationSetupWorkspace`
- Implements: `prd.md > Feature 3: Target Fixture Control & Pre-Flight Review`.
- Renders the Target Fixture Control segmented toolbar (Mode A vs Mode B), creates server-managed test plan snapshot, sends explicit approval action, and triggers verification run.

### Component 3: `VerificationExecutionRunner` (Server-side)
- Implements: `prd.md > Feature 4: Independent Black-Box Browser Verification`.
- Orchestrates Playwright browser instance, creates fresh browser contexts per test, enforces network sandbox, fills inputs, captures DOM outcomes, evaluates observable feedback, manages cancellation, and emits SSE events.

### Component 4: `ResultsAndEvidenceWorkspace`
- Implements: `prd.md > Feature 5: Evidence Matrix & Discrepancy Reporting`.
- Displays active run progress, renders the 4-state summary badges, lists test rows in the primary matrix, provides the expandable evidence drawer with screenshots and diagnostics, and hosts the Run History selector.

### Component 5: `ScholarshipFormFixture`
- Implements: `prd.md > The Core Journey (Step 1, 5, 9)`.
- Embedded, fully rendered HTML/React application form hosted at `/fixtures/scholarship`. Supports `?mode=inconsistent` (rejects `> 250000`) and `?mode=corrected` (rejects `> 300000`). Emits explicit, accessible DOM outcomes (`[data-testid="status-accepted"]`, `[data-testid="field-error"]`). Strictly decoupled from runner logic.

### Component 6: `StandaloneReportGenerator` (Server-side)
- Implements: `prd.md > Feature 6: Standalone HTML Evidence Export`.
- Ingests an immutable run snapshot, HTML-escapes all text, inlines CSS styles, embeds screenshots as base64 data URIs, and returns a single standalone `.html` string.

---

## File Structure

```
RuleGap/
├── .agents/
│   └── skills/              # Devpost Learn official skill pack
├── devpost/
│   ├── learner-profile.md   # Learner onboarding profile (gitignored)
│   ├── scope.md             # Approved scope
│   ├── prd.md               # Approved product requirements
│   └── spec.md              # Approved technical specification
├── src/
│   ├── shared/              # Shared between client and server
│   │   ├── contract.ts      # Shared Zod schemas and TypeScript types
│   │   ├── ruleEngine.ts    # Pure deterministic rule evaluator & boundary generator
│   │   └── sampleData.ts    # Synthetic scholarship policy text and metadata
│   ├── server/              # Node.js backend (Express)
│   │   ├── server.ts        # Express app entry point (serves API, client, & fixtures)
│   │   ├── config.ts        # Port (3000), host (127.0.0.1), timeouts, paths
│   │   ├── middleware/
│   │   │   └── security.ts  # Host header validation, CSRF header checks
│   │   ├── routes/
│   │   │   ├── runs.ts      # Run lifecycle, SSE streaming, cancellation
│   │   │   ├── plans.ts     # Plan creation, validation, and approval gate
│   │   │   └── fixtures.ts  # Fixture metadata and state
│   │   ├── runner/
│   │   │   ├── browserPool.ts         # Playwright instance lifecycle & context factory
│   │   │   ├── formObserver.ts        # Black-box DOM interaction & feedback extractor
│   │   │   └── cancellationManager.ts # Safe abort & resource release
│   │   ├── storage/
│   │   │   ├── runStore.ts            # Atomic JSON filesystem storage & crash reconciliation
│   │   │   ├── planStore.ts           # Authoritative server plan storage
│   │   │   └── evidenceStore.ts       # Bounded screenshot PNG storage
│   │   └── report/
│   │       ├── reportTemplate.ts      # Offline HTML report template with inline CSS
│   │       └── reportGenerator.ts     # Sanitizes data, embeds base64 images, generates HTML
│   ├── client/              # React frontend (Vite)
│   │   ├── index.html       # Client entry HTML
│   │   ├── main.tsx         # React root
│   │   ├── App.tsx          # Hybrid Guided Workbench layout
│   │   ├── styles/
│   │   │   ├── tokens.css   # Workshop + Gridline CSS variables
│   │   │   └── main.css     # High-density workbench layout styles
│   │   ├── components/
│   │   │   ├── Header.tsx                 # Top bar with product identity & status
│   │   │   ├── PolicyIngestion/
│   │   │   │   ├── TextImporter.tsx       # Paste text & character counter
│   │   │   │   ├── PdfImporter.tsx        # In-browser PDF.js extractor with fallback
│   │   │   │   └── ContractEditor.tsx     # Structured rule form & confirm action
│   │   │   ├── VerificationSetup/
│   │   │   │   ├── FixtureControl.tsx     # Mode A vs Mode B segmented toolbar
│   │   │   │   ├── PreFlightTable.tsx     # 7-case review table & approve checkbox
│   │   │   │   └── ActionButtons.tsx      # Run Verification & Cancel buttons
│   │   │   ├── ResultsAndEvidence/
│   │   │   │   ├── RunHistorySelector.tsx # Labeled tabs for historical runs
│   │   │   │   ├── SummaryBar.tsx         # 4-state count badges & progress
│   │   │   │   ├── EvidenceMatrix.tsx     # Primary results table
│   │   │   │   ├── EvidenceDrawer.tsx     # Expandable row diagnostics & screenshot
│   │   │   │   └── ExportButton.tsx       # Single-file HTML report download
│   │   │   └── Fixture/
│   │   │       └── ScholarshipForm.tsx    # Embedded synthetic scholarship form component
│   │   └── hooks/
│   │       ├── useRuleContract.ts         # Contract state & validation
│   │       ├── usePreFlightPlan.ts        # Plan creation, approval, and boundary generation
│   │       └── useVerificationRun.ts      # SSE connection, events, and run history
│   └── tests/
│       ├── unit/
│       │   ├── ruleEngine.test.ts         # Boundary values, operators, edge cases
│       │   ├── reportGenerator.test.ts    # HTML escaping, sanitization, single-file bundle
│       │   ├── planAuthority.test.ts      # Plan creation, approval gate, tamper rejection
│       │   └── contractSchemas.test.ts    # Zod validation & type invariants
│       ├── integration/
│       │   ├── securityMiddleware.test.ts # Host header, CSRF, unauthorized URL rejection
│       │   ├── runStore.test.ts           # Atomic persistence, crash recovery reconciliation
│       │   └── sseReconnection.test.ts    # Sequence numbering, Last-Event-ID replay
│       └── e2e/
│           ├── verificationFlow.test.ts   # Real browser Playwright test against fixture (both modes)
│           ├── cancellation.test.ts       # Cancellation during execution & cleanup
│           └── isolation.test.ts          # Fresh context state isolation verification
├── package.json
├── tsconfig.json
├── tsconfig.server.json
├── vite.config.ts
├── vitest.config.ts
└── playwright.config.ts
```

---

## Acceptance Test Suite Specification

During `5-build`, the automated test suite must verify these explicit invariants:

1. **Rule Engine Invariants (`unit/ruleEngine.test.ts`):**
   - Correct evaluation of `<`, `<=`, `>`, `>=` on safe integers.
   - Generation of exact boundary points (`threshold - 1`, `threshold`, `threshold + 1`).
   - Deduplication when demonstration probes overlap with boundary points.
2. **Security & Sandbox (`integration/securityMiddleware.test.ts`):**
   - HTTP 403 returned when `Host` header is untrusted.
   - HTTP 403 returned on `POST` requests lacking `X-RuleGap-Client: true`.
   - Rejection of client requests attempting to set unauthorized target URLs.
   - Playwright route interception permits required local assets (`/assets/*`, `/vite.svg`) while blocking external web requests.
3. **Plan Authority & Approval Gate (`unit/planAuthority.test.ts`):**
   - Server creates plan snapshot and stores `isApproved: false`.
   - Explicit approval endpoint sets `isApproved: true`.
   - Execution rejected if plan is not approved or if contract/fixture parameters are modified.
4. **State Machine & Summary Invariants (`unit/contractSchemas.test.ts`):**
   - Mathematical check: `consistent + confirmedMismatch + inconclusive + executionError + notExecuted + interrupted === totalScheduled`.
   - Run status evaluates to `COMPLETED_WITH_UNCERTAINTY` when inconclusive/error tests occur without mismatches.
   - Full consistency is blocked if any test is unexecuted, interrupted, or inconclusive.
5. **Persistence & Crash Recovery (`integration/runStore.test.ts`):**
   - Atomic checkpoint writes during active execution.
   - Server startup reconciliation: active checkpoints with unfinished runs are marked `FAILED` with interrupted cases.
6. **Cancellation & Race Conditions (`e2e/cancellation.test.ts`):**
   - Cancellation during active navigation stops browser operations.
   - Repeated cancellation calls remain idempotent.
   - Interrupted case marked `INTERRUPTED`; queued cases marked `NOT_EXECUTED`.
   - Final status settles as `CANCELLED_PARTIAL`.
7. **SSE Reconnection (`integration/sseReconnection.test.ts`):**
   - Reconnect with `Last-Event-ID` replays missed events without duplicate execution.
8. **Real Browser Verification (`e2e/verificationFlow.test.ts`):**
   - Mode A (Inconsistent): Exactly 4 confirmed mismatches, 3 consistent cases, 0 inconclusive, 0 errors.
   - Mode B (Corrected): Exactly 7 consistent cases, 0 mismatches, 0 inconclusive, 0 errors.
   - Screenshots captured and rendered for mismatches.
9. **HTML Report Sanitization (`unit/reportGenerator.test.ts`):**
   - Script tags (`<script>alert(1)</script>`) in policy text or DOM error messages are properly escaped.
   - Base64 screenshots are properly embedded in offline report.

---

## Decisions and Open Issues

### Key Technical Decisions
1. **Authoritative Server Plan Gate:** Server manages canonical plan records; explicit approval endpoint gates execution; prevents tampered or stale executions.
2. **Crash Recovery & Checkpointing:** Atomic intermediate checkpoints prevent data corruption during unexpected restarts; startup reconciliation cleanly recovers abandoned runs.
3. **Dual-Build Pipeline:** Dual compilation (`vite build` for client, `tsc -p tsconfig.server.json` for server) guarantees clean production artifacts with zero dev-runtime dependencies.
4. **Pure CSS Tokens over Tailwind:** Custom CSS variables preserve the dense Workshop + Gridline look with zero setup overhead and zero build flakiness.

### Open Questions & Technical Blockers
- None. The specification is comprehensive, fully aligned with PRD and Scope, and approved for `5-build`.
