---
doc: checklist
status: approved
---

# Build Checklist

Build mode: fast

## Slices

- [x] **1. Engineering Foundation, Shared Contract, and Deterministic Rule Engine**
  Becomes usable: A verified TypeScript core where numeric rule contracts (`<`, `<=`, `>`, `>=`) can be evaluated, boundary test cases deterministically generated with rationales and probe values, and contracts validated against Zod schemas.
  Why now: The rule engine and shared types form the backbone of the entire application. Bootstrapping dependencies and verifying calculation invariants early prevents downstream architecture refactors.
  PRD ref: `prd.md > Feature 2: Deterministic Rule Contract Confirmation`, `prd.md > Features and Behavior`
  Spec ref: `spec.md > Stack & Dependency Matrix`, `spec.md > Data Model & Classification Invariants`, `spec.md > File Structure`
  Build: Scaffold project with Node 24 and strict TypeScript configs; install pinned dependencies; create `src/shared/contract.ts`, `src/shared/ruleEngine.ts`, and `src/shared/sampleData.ts`; create unit tests in `src/tests/unit/ruleEngine.test.ts` and `src/tests/unit/contractSchemas.test.ts`.
  Verify (mechanical): Run `npx vitest run src/tests/unit/ruleEngine.test.ts src/tests/unit/contractSchemas.test.ts` and confirm 100% pass for operators, boundaries, safe integers, and Zod invariants.
  Learner check: Inspect `src/shared/ruleEngine.ts` and verify that boundary generation for `income <= 300000` produces exact points `299999`, `300000`, and `300001` with expected outcomes `ACCEPT`, `ACCEPT`, and `REJECT`.
  Commit: `feat: add core rule engine, shared schemas, and boundary generator`

- [x] **2. Embedded Scholarship Fixture and Black-Box Playwright Observer**
  Becomes usable: A real, rendered scholarship application web form running on localhost (`/fixtures/scholarship`) with defect toggle (Mode A ₹250k vs Mode B ₹300k), and an independent Playwright browser runner that navigates, inputs values, triggers validation, and captures explicit DOM outcomes under route-restricted network isolation.
  Why now: Browser observation is the primary technical risk. Proving real black-box DOM observation and mismatch detection before building the UI ensures our verification claims are genuine.
  PRD ref: `prd.md > The Core Journey` (Step 5, 7, 8, 9), `prd.md > Feature 4: Independent Black-Box Browser Verification`
  Spec ref: `spec.md > Components (ScholarshipFormFixture, VerificationExecutionRunner)`, `spec.md > Server Security & Boundary Containment`
  Build: Implement embedded fixture HTML/React page with explicit status indicators (`[data-testid="status-accepted"]`, `[data-testid="field-error"]`); implement Express server scaffold to serve fixture; implement `src/server/runner/browserPool.ts` and `src/server/runner/formObserver.ts` with route allowlist; create E2E test `src/tests/e2e/verificationFlow.test.ts` covering missing selectors, ambiguous feedback, unrelated errors, unauthorized navigation, and clean context isolation.
  Verify (mechanical): Run `npx vitest run src/tests/e2e/verificationFlow.test.ts` and confirm real browser execution produces exactly 4 confirmed mismatches on Mode A, 7 consistent results on Mode B, and handles anomalous DOM states safely.
  Learner check: Open `http://127.0.0.1:3000/fixtures/scholarship?mode=inconsistent` in a browser, enter `275000`, click submit, and verify explicit error message; switch to `mode=corrected` and verify acceptance banner.
  Commit: `feat: implement embedded scholarship fixture and black-box playwright runner`

- [x] **3. Authoritative Plan Approval, Atomic Checkpointing, SSE Streaming, and Safe Cancellation**
  Becomes usable: A complete server verification lifecycle API where test plans must be explicitly server-approved, active runs write atomic filesystem checkpoints for crash recovery, progress streams in real time via SSE with reconnection replay, and cancellation safely cleans up Playwright browser processes without false mismatch classifications.
  Why now: The verification execution infrastructure guarantees evidentiary integrity, race-condition safety, and process recovery before wiring the frontend.
  PRD ref: `prd.md > Non-Happy-Path UI Behaviors` (Cancellation, Runner Unavailable), `prd.md > Product Decisions`
  Spec ref: `spec.md > Authoritative Plan Management & Approval Gate`, `spec.md > Active Run Record vs Finalized Run Snapshot`, `spec.md > Cancellation Lifecycle & API Semantics`, `spec.md > Server-Sent Events (SSE) Reconnection Semantics`
  Build: Implement `src/server/routes/plans.ts`, `src/server/routes/runs.ts`, `src/server/storage/runStore.ts`, `src/server/storage/planStore.ts`, `src/server/runner/cancellationManager.ts`, and security middleware (`src/server/middleware/security.ts`); add integration tests in `src/tests/integration/runStore.test.ts`, `src/tests/integration/sseReconnection.test.ts`, and `src/tests/e2e/cancellation.test.ts` verifying real server restart recovery, plan digest rejection, and cancellation cleanup.
  Verify (mechanical): Run Vitest integration suite and verify plan approval gate, atomic crash reconciliation on restart, SSE Last-Event-ID replay, and cancellation resource cleanup.
  Learner check: Trigger a verification run via curl/API, initiate cancellation mid-flight, and verify that the run settles cleanly as `CANCELLED_PARTIAL` with unattempted tests marked `NOT_EXECUTED`.
  Commit: `feat: implement authoritative plan gate, atomic run store, sse streaming, and cancellation lifecycle`

- [x] **4. Complete Hybrid Guided Workbench Interface**
  Becomes usable: The complete interactive RuleGap web application adhering to the Workshop + Gridline + Studio Utility design system: text/PDF import with fallback, rule contract editor, target fixture control toolbar, pre-flight plan review table, live execution progress bar, 4-state summary badges, primary evidence matrix, expandable drawer, and run history selector.
  Why now: Connects all verified backend components into the human-centered, responsive, and accessible workbench designed in the PRD.
  PRD ref: `prd.md > Screens and Layout`, `prd.md > Look and Feel`, `prd.md > States and Boundaries`, `prd.md > Accessibility & Responsiveness Requirements`
  Spec ref: `spec.md > Look and Feel & Styling Architecture`, `spec.md > Components (RuleIngestionWorkspace, VerificationSetupWorkspace, ResultsAndEvidenceWorkspace)`
  Build: Implement CSS tokens in `src/client/styles/tokens.css` and layout in `src/client/styles/main.css`; build React components (`Header`, `TextImporter`, `PdfImporter`, `ContractEditor`, `FixtureControl`, `PreFlightTable`, `SummaryBar`, `EvidenceMatrix`, `EvidenceDrawer`, `RunHistorySelector`); integrate hooks (`useRuleContract`, `usePreFlightPlan`, `useVerificationRun`); ensure keyboard navigation, focus rings, and layout adaptability at 200% zoom.
  Verify (mechanical): Run `npm run build` and verify dual compilation (client and server build with zero errors); execute browser E2E test covering full user journey from import to rerun and historical inspection.
  Learner check: Open `http://127.0.0.1:3000`, load sample policy, confirm rule contract, review pre-flight plan, run verification against Mode A (observe 4 mismatches), toggle to Mode B, re-approve, and run (observe 7 consistent).
  Commit: `feat: build complete hybrid guided workbench interface and responsive components`

- [ ] **5. Standalone Offline HTML Evidence Export and Comprehensive Reliability Verification**
  Becomes usable: A pure report generation engine producing a single-file, self-contained offline HTML evidence report with inline CSS and base64-embedded screenshots; plus verification of the entire 15-point acceptance test suite including security headers, escaping, crash recovery, and offline execution.
  Why now: The exportable evidence report is the definitive artifact proving policy discrepancies to stakeholders; running the full test suite confirms all invariants are satisfied.
  PRD ref: `prd.md > Feature 6: Standalone HTML Evidence Export`, `prd.md > Product Decisions`
  Spec ref: `spec.md > Standalone HTML Evidence Report Generator`, `spec.md > Acceptance Test Suite Specification`
  Build: Implement `src/server/report/reportTemplate.ts` and `src/server/report/reportGenerator.ts` with strict HTML escaping and inline styling; hook export button to `GET /api/runs/:id/report`; run and verify all unit, integration, and E2E tests.
  Verify (mechanical): Run `npm test` and `npm run test:e2e` across all suites; verify that generated HTML report opens offline without external network calls and displays correct run data and base64 screenshots.
  Learner check: Download the exported HTML report from Run 1, open it in a disconnected browser, inspect the formatted evidence table, expand a mismatch screenshot, and verify the sampling disclaimer.
  Commit: `feat: implement standalone offline html report generator and verify full test suite`

## Hands-on Checkpoints

- [x] Early usable behavior explored — Slice 2 (Embedded scholarship fixture and real Playwright browser observation verified)
- [ ] Final kick-the-tires exploration and feedback completed

## Final Review

- [ ] Final review complete — feedback resolved and learner confirms ready to ship

## Code Tour and App Map

- [ ] Learning activity complete — guided route, focused alternative, prior practice connected, or brief recap
- [ ] Optional edit and transfer reflection addressed — offered/declined/already covered/not applicable as appropriate
- [ ] `devpost/app-map.html` generated from finished code, checked, and shown, including a project-grounded practice to reuse

Activity and evidence: [to be recorded during wrap-up]
Route and stops: [to be recorded during wrap-up]
Edit outcome: [to be recorded during wrap-up]
Reflection: [to be recorded during wrap-up]
Activity mode: [to be recorded during wrap-up]

## Revisions

