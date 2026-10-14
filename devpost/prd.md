---
doc: prd
status: approved
---

# RuleGap — Product Requirements

RuleGap is a local-first software consistency verifier that bridges documented policy rules, live web form validation, and reproducible boundary-test evidence to prove when an application form contradicts its published requirements.
Source: `scope.md > Who It's For`

---

## The Core Journey

The primary end-to-end journey takes a user from a written policy statement to verifiable discrepancy evidence and consistency resolution:

1. **Arrival & Orientation:** The user opens RuleGap via a single local startup command. The interface presents a clean, three-zone workbench in an empty, ready state, with the embedded synthetic scholarship demo fixture pre-selected.
2. **Policy Ingestion:** The user loads the synthetic scholarship policy (via file upload or paste) stating: *"Applicants with annual family income of ₹300,000 or less are eligible."*
3. **Clause Selection:** The user highlights or selects the income eligibility clause within the source text viewer.
4. **Contract Confirmation:** The user reviews the structured rule contract fields (`Field: Income`, `Operator: <=`, `Threshold: 300000`, `Unit: INR`), adjusts them if necessary, and clicks **Confirm Rule Contract**.
5. **Target Mapping & Fixture State:** The user verifies the target field mapping (`#annual-income`) against the authorized localhost scholarship form. The fixture control defaults to **Mode A (Inconsistent — ₹250,000 cap)**.
6. **Pre-Flight Test Plan Review:** RuleGap deterministically derives boundary test values from the confirmed rule (`299999`, `300000`, `300001`) and incorporates the fixture's configured demonstration probes (`249999`, `250000`, `250001`, `275000`) for a total of seven deduplicated test cases with their expected policy outcomes and selection rationales. The user inspects and approves the test plan table.
7. **Verification Run:** The user clicks **Run Verification**. An independent Playwright runner executes the approved tests against the rendered form DOM, streaming real-time progress and per-test execution updates.
8. **Evidence Inspection (Run 1 — Inconsistent Fixture):** The evidence matrix populates with real observed outcomes:
   - **4 Confirmed Mismatches** (`250001`, `275000`, `299999`, `300000`) where the policy permits the applicant but the form explicitly rejects them with an income limit error.
   - **3 Consistent Cases** (`249999`, `250000` accepted; `300001` rejected).
   - **0 Inconclusive**, **0 Execution Errors**, **0 Not Executed**.
   - Summary display reads: *"Confirmed mismatches at 4 tested values (lowest mismatch: ₹250,001; highest mismatch: ₹300,000; intermediate un-sampled values are not tested)."*
   The user expands evidence rows to inspect captured DOM feedback, timestamps, and screenshots.
   This completed execution is preserved as an immutable historical record (**Run 1**).
9. **Fixture Correction & Rerun:** The user toggles the fixture toolbar to **Mode B (Corrected — ₹300,000 cap)**. RuleGap preserves **Run 1** in the run history, marks the current active plan approval as stale/invalidated, prompts the user to re-approve the test plan for the updated target state, and reruns the same test suite.
10. **Resolution & Evidence Export (Run 2 — Corrected Fixture):** The rerun executes genuinely through Playwright and completes with **7 Consistent out of 7 executed cases** (0 mismatches, 0 inconclusive, 0 errors). The user can switch between **Run 1** and **Run 2** via a simple run selector. Clicking **Export Evidence Report** on either run downloads a self-contained, single-file offline HTML report for that specific run.

---

## Screens and Layout

RuleGap utilizes a **Hybrid Guided Workbench** layout combining simultaneous panel visibility with progressive prerequisite gating:

### 1. Application Header (Top Bar)
- Product branding: **RuleGap** with monospace version/build tag.
- Workspace status indicator (Ready, Verification Running, Complete).
- Global actions: Reset Workspace, Documentation link.

### 2. Left Workspace Panel — Policy & Rule Contract
- **Source Input Tab Group:** Toggle between **Paste Text** and **Upload PDF**.
- **Document Excerpt Viewer:** Monospace/serif text viewer displaying the imported policy with selectable text and character/line counter.
- **Contract Editor Form:**
  - Field Name (e.g., `Annual Family Income`)
  - Operator select (`<`, `<=`, `>`, `>=`)
  - Threshold input (finite positive integer, formatted with commas for readability)
  - Unit / Currency (e.g., `INR`)
  - Source Quote Reference (captured excerpt)
- **Confirm Contract Button:** Explicit action button that locks the contract and unlocks the Verification Setup panel. Editing any field unlocks the contract and invalidates downstream test approvals without erasing completed historical runs.

### 3. Right Workspace Panel — Verification Setup
- **Target Fixture Control Bar:** Compact developer-instrument segmented control:
  - `Mode A: Inconsistent (₹250,000 cap)`
  - `Mode B: Corrected (₹300,000 cap)`
  - Includes a synthetic demonstration disclaimer and a toggleable mini-preview of the rendered fixture DOM.
- **Field Target Selector:** Target form selector mapping (pre-configured to `#annual-income`).
- **Pre-Flight Test Plan Table:**
  - Columns: Test Case ID, Test Value, Operator & Rule Expectation, Selection Rationale.
  - Displays generic boundary cases derived from the rule plus any configured demonstration probes.
- **Approval & Execution Actions:**
  - **Approve Test Plan** checkbox/button.
  - **Run Verification** primary action button (enabled only when contract is confirmed and plan approved).
  - **Cancel Verification** button (visible and active during test execution).

### 4. Bottom Workspace Panel — Verification Results & Evidence
- **Run History Tab Bar:** Simple, labeled run selector (e.g., `Run 1 (Mode A: Inconsistent — 4 Mismatches)` | `Run 2 (Mode B: Corrected — 7 Consistent)`), allowing users to review and compare historical runs without overwriting evidence.
- **Verification Summary Bar:** Displays execution progress and category counts calculated strictly from real execution:
  - Progress: `Completed: X / Total Scheduled: Y | Executing: #Z | Not Executed: N`
  - Four Classification Counts:
    - `Consistent: [count]` (neutral/green)
    - `Confirmed Mismatch: [count]` (high-contrast alert/orange-red)
    - `Inconclusive: [count]` (amber warning)
    - `Execution Error: [count]` (muted red)
  - Mismatch Finding Banner: *"Confirmed mismatches at [N] tested values (lowest: ₹X; highest: ₹Y; values between them are not tested)."*
- **Primary Evidence Matrix:**
  - Columns: `#`, `Test Value`, `Policy Expectation`, `Observed Form Result`, `Classification`, `Evidence Action`.
- **Expandable Evidence Drawer (Row Expansion):**
  - Test Case ID, value, and units.
  - Selection rationale (boundary threshold or configured probe).
  - Source policy excerpt and rule contract.
  - Form selector and submission action.
  - Observable DOM feedback (captured rejection text or acceptance confirmation).
  - Classification reason explanation.
  - Execution timestamp and duration.
  - Browser screenshot thumbnail with modal viewer.
  - Diagnostic logs for inconclusive or error states.
- **Export Toolbar:**
  - **Export HTML Report** button (generates a self-contained, single-file offline HTML document for the currently viewed run).

### Responsive & Zoom Behavior
- **Desktop (1024px – 1440px+):** Two-column side-by-side workbench with results panel beneath.
- **Tablet (768px – 1023px):** Stacked panels with full-width tables and contained horizontal scrolling.
- **Mobile (360px – 767px):** Single-column sequential vertical layout with sticky status bar and collapsible panels.
- **200% Browser Zoom:** Grid transforms to single-column flex; table text wraps cleanly or scrolls within contained table viewports without causing whole-page horizontal overflow; focus rings remain fully visible.

---

## Look and Feel

- **Design Language:** **Workshop + Gridline + Studio Utility hybrid**.
- **Aesthetic Direction:** Purpose-built verification workbench. Industrial, disciplined, high-density, editorial typography.
- **Color Palette:**
  - Backgrounds: Neutral technical dark/light greys (`#0F1115` slate or `#F8F9FA` off-white).
  - Gridlines & Borders: Subdued technical grid lines (`#E2E8F0` / `#2D3748`, 1px solid).
  - Accent Color: Restrained industrial safety amber/signal blue (`#2563EB` or `#D97706`).
  - Status Indicators: Strict non-color-alone status tags (always paired with clear text labels and distinct geometric glyphs: `[✓] Consistent`, `[✕] Mismatch`, `[?] Inconclusive`, `[!] Error`, `[-] Not Executed`).
- **Typography:** Clean sans-serif for UI labels (`Inter`, `system-ui`); monospace for numbers, operators, selectors, and test matrices (`JetBrains Mono`, `Consolas`).
- **Prohibited:** Purple gradients, glassmorphism, decorative AI sparkles, oversized rounded cards, generic dashboard vanity charts, ungrounded marketing buzzwords.

---

## Features and Behavior

### Feature 1: Policy Ingestion & Source Fallback
- **Text Import:** Accepts pasted text up to 50,000 characters.
- **PDF Extraction:** Extracts text layers from PDF files using PDF.js entirely in-browser/local.
- **Graceful Fallback on Extraction Failure:**
  - If a PDF has no selectable text (scanned, image-only, or encrypted), displays an inline accessible alert: *"Couldn't extract readable text from this PDF. It may be scanned, image-based, or protected. You can paste the relevant policy text instead."*
  - Provides a one-click **Paste Text Instead** action switching to the text tab.
  - Preserves the uploaded file name as a source metadata reference, but tags the source explicitly as: *"Manually supplied text associated with [filename]"* (never claiming the pasted text was extracted from the binary).

### Feature 2: Deterministic Rule Contract Confirmation
- Allows defining numeric boundary rules with operators `<`, `<=`, `>`, `>=`.
- Enforces strict numeric validation on thresholds (integers only; rejects non-numeric, overflow, or malformed values).
- Prevents conflicting operator-inclusivity semantics: the operator strictly determines whether the threshold boundary is inclusive (`<=`, `>=`) or exclusive (`<`, `>`).
- Requires explicit user confirmation via **Confirm Rule Contract**.
- Modifying any contract field after confirmation automatically marks downstream test plan approvals as stale, prompting re-approval before running, but preserves previously completed runs in the run history.

### Feature 3: Target Fixture Control & Pre-Flight Review
- Dedicated **Target Fixture Control** toolbar with an accessible segmented control:
  - **Mode A (Inconsistent):** Embedded fixture configured with defect (₹250,000 cap).
  - **Mode B (Corrected):** Embedded fixture configured with correction (₹300,000 cap).
- Displays clear synthetic demonstration disclaimer: *"Synthetic demonstration fixture for local verification testing only."*
- Generates generic boundary test cases from the confirmed rule (e.g., threshold - 1, threshold, threshold + 1, and 0 if applicable).
- Allows configured demonstration probes to be added cleanly without hardcoding them into the general rule engine.
- Automatically deduplicates overlapping test values and sorts them numerically.
- Displays pre-flight test table showing each value, expected policy outcome, and selection rationale.
- Requires explicit user review and approval before execution can be triggered.
- Switching fixture mode marks current plan approval as stale and requires re-approval for the new target state.

### Feature 4: Independent Black-Box Browser Verification
- Driven by a real Playwright browser instance operating strictly on localhost.
- Runner operates in pure black-box mode: interacts with the rendered DOM input (`#annual-income`), submits the form, and observes DOM outcomes.
- Security perimeter: Strictly rejects navigation or redirects to any unapproved destination or external host.
- Never imports fixture validation logic, reads backend code, or inspects the fixture's internal threshold setting.
- Evaluates observable form feedback:
  - Explicit confirmation message / accepted status banner → `Form Accepted`.
  - Explicit error alert with field message → `Form Rejected`.
  - Ambiguous DOM mutation, missing status indicator, or unrelated required-field error → `Indeterminate`.
  - Timeout, missing selector, or navigation failure → `Execution Error`.
- Safe Cancellation:
  - User can click **Cancel Verification** at any point during an active run.
  - Cancelling halts queued tests, safely terminates active Playwright browser pages/contexts, and marks unexecuted cases as `Not Executed`.
  - Categorizes the overall session as `Cancelled / Partial` (never reporting partial passes as full consistency).
- Prevents switching fixture modes while verification is actively running without confirming cancellation first.

### Feature 5: Evidence Matrix & Discrepancy Reporting
- Compares Expected Policy Outcome vs Observed Form Result:
  - Policy Accept + Form Reject → **Confirmed Mismatch**
  - Policy Reject + Form Accept → **Confirmed Mismatch**
  - Policy Accept + Form Accept → **Consistent**
  - Policy Reject + Form Reject → **Consistent**
  - Form Indeterminate → **Inconclusive**
  - Browser / Runner Failure → **Execution Error**
- Summary counts update dynamically from actual test executions.
- Discrepancy statement displays: *"Confirmed mismatches at [N] tested values (lowest: ₹X; highest: ₹Y; values between them are not tested)."*
- Evidence drawer expands on click/Enter to display full diagnostic details, timestamps, observed DOM text, and screenshots.
- Completed runs are saved immutably and accessible via the Run History selector.

### Feature 6: Standalone HTML Evidence Export
- Generates a self-contained, single-file HTML report document for the currently selected run.
- Fully offline readable: embedded inline CSS, no external fonts, no CDN scripts, safe HTML escaping.
- Contains:
  - Policy source excerpt and confirmed rule contract.
  - Target form metadata, fixture mode, and execution timestamp.
  - 4-category summary counts, execution state summary, and mismatch finding notes.
  - Complete evidence table with all test cases, expected/observed results, classifications, and captured DOM feedback.
  - Embedded base64 screenshot evidence for confirmed mismatches.
  - Transparent disclosures of testing scope and finite-sampling limitations.

---

## Non-Happy-Path UI Behaviors

1. **Unreadable PDF:** Displays accessible inline alert explaining that the PDF lacks readable text; provides one-click **Paste Text Instead** action; retains uploaded filename as source reference.
2. **Invalid Contract Values:** Threshold input validates as integer; displays inline error (*"Threshold must be a valid positive integer"*); disables confirmation button until corrected.
3. **Unresolved Field Mapping:** If target selector is not found in the rendered DOM, flags the test case with **Execution Error** (*"Selector `#annual-income` not found in target form"*); stops further tests and suggests checking form mapping.
4. **Browser Runner Unavailable:** If Playwright fails to initialize or browser binaries are missing, displays banner (*"Browser runner unavailable. Run `npx playwright install chromium` locally"*); marks verification as failed without falsely blaming policy rules.
5. **Unrelated Validation Errors:** If the form fails validation due to missing required fields other than the target, flags outcome as **Inconclusive** (*"Form rejected due to unmapped field `#applicant-name`"*); never converts into a policy mismatch.
6. **Inconclusive Test Cases:** Highlighted with amber `[?] Inconclusive` badge; drawer details why evidence was indeterminate; summary banner notes incomplete conclusive coverage.
7. **Execution Timeout:** If a test case exceeds the timeout threshold (e.g., 5000ms), Playwright halts the step, captures current DOM state, flags the case as **Execution Error** (*"Interaction timed out after 5000ms"*), and proceeds safely to the next test or halts according to policy.
8. **User Cancellation:** Safely terminates browser operations; marks remaining tests as **Not Executed**; sets run status to `Cancelled / Partial`; preserves completed observations; allows immediate retry.
9. **Stale Approved Plan:** When the rule contract or fixture mode changes, displays notice (*"Target or contract changed. Test plan approval reset. Please review and re-approve."*); disables **Run Verification** until approved.
10. **Evidence Export Failure:** If file generation encounters an error, displays inline notification with exact error message and offers a retry without losing run data.

---

## States and Boundaries

1. **Empty / First Use State:** Left panel ready for input; right and bottom panels disabled with prerequisite notices.
2. **Contract Confirmed State:** Left panel locked with **Edit Contract** button; right panel unlocked, generating pre-flight test cases.
3. **Pre-Flight Approved State:** User reviews and checks **Approve Test Plan**; **Run Verification** active.
4. **Verification In Progress State:** **Run Verification** disabled; **Cancel Verification** active; Target Fixture Control locked; live progress updating.
5. **Completed State (Mode A — Inconsistent Fixture):**
   - Summary bar: `Consistent: 3`, `Confirmed Mismatch: 4`, `Inconclusive: 0`, `Execution Error: 0`, `Not Executed: 0`.
   - Banner: *"Confirmed mismatches at 4 tested values (lowest: ₹250,001; highest: ₹300,000; intermediate un-sampled values are not tested)."*
   - Saved as **Run 1**. Export HTML enabled.
6. **Completed State (Mode B — Corrected Fixture):**
   - Summary bar: `Consistent: 7`, `Confirmed Mismatch: 0`, `Inconclusive: 0`, `Execution Error: 0`, `Not Executed: 0`.
   - Banner: *"All 7 executed test cases are consistent with documented rule."*
   - Saved as **Run 2**. Both runs switchable via Run History.
7. **Cancelled / Partial State:** Run terminated early; completed cases preserved; uncompleted cases marked `Not Executed`; run status `Cancelled / Partial`.
8. **Stale / Invalidated State:** Triggered on contract edit or fixture toggle; current plan approval reset; historical runs untouched.

---

## Accessibility & Responsiveness Requirements

- **Semantic HTML & Landmarks:** Proper use of `<header>`, `<main>`, `<section>`, `<nav>`, and `<table>` with `scope="col"` headers.
- **Keyboard Navigation:** All interactive elements (tabs, inputs, buttons, segmented controls, table row expanders) fully operable via `Tab`, `Enter`, `Space`, and arrow keys.
- **Focus Indicators:** High-contrast 2px focus rings (`outline: 2px solid #2563EB; outline-offset: 2px`) on all focusable controls.
- **Screen Reader Announcements:** Dynamic state updates (test progress, verification complete, cancellation) announced via `aria-live="polite"` regions.
- **Color Independence:** Outcomes never conveyed by color alone (always paired with clear textual labels and distinct geometric glyphs).
- **Zoom & Viewports:** Validated at 360px, 390px, 768px, 1024px, 1440px widths and under 200% browser zoom without clipping or whole-page horizontal overflow.
- **Reduced Motion:** Respects `prefers-reduced-motion: reduce` by disabling transitions and progress animations.

---

## Product Decisions

- **Preserve Completed Verification History:** Historical runs are saved immutably with run selector tabs, enabling side-by-side demonstration of buggy vs corrected states without erasing evidence.
- **Simultaneous 3-Zone Workbench over Step-by-Step Wizard:** Preserves technical context by keeping policy, test setup, and verification results visible at once on desktop, while using prerequisite gating to guide the flow.
- **Black-Box DOM Observation:** Playwright runner evaluates the rendered form strictly from the outside, preventing test logic from relying on internal fixture thresholds.
- **Four Distinct Observation States + Not Executed State:** Explicitly separates policy contradictions (`Confirmed Mismatch`) from lack of clear evidence (`Inconclusive`), technical failures (`Execution Error`), and unattempted cases (`Not Executed`).
- **Finite Sample Integrity:** Avoids overclaiming continuous bug intervals or universal form correctness; frames findings strictly in terms of tested values.
- **Offline Single-File HTML Export:** Self-contained document with embedded styles and base64 screenshots ensures evidence can be shared and opened anywhere offline without external assets.

---

## What We're Building (POC Boundary)

- Single complete end-to-end journey from policy document to verified report.
- Text pasting and text-based PDF extraction with graceful fallback.
- Finite integer numeric rule contracts (`<`, `<=`, `>`, `>=`).
- Pre-flight generic boundary generation + configured demo probes with user approval.
- Embedded synthetic scholarship application fixture with togglable defect (₹250k vs ₹300k).
- Black-box Playwright runner executing against rendered localhost DOM.
- 4-state observation classifier + `Not Executed` state with cancellation and stale plan invalidation.
- Immutable run history preserving completed runs.
- Primary evidence matrix with expandable diagnostic drawer.
- Single-file self-contained HTML evidence report generator.
- MIT open-source, fully offline capable, zero paid API dependencies, single-command startup.

---

## Deferred From the POC

- Non-numeric rules (text patterns, dates, categorical dropdowns).
- Multi-field compound rules (e.g., income AND GPA thresholds).
- Multi-bound numeric ranges (e.g., `18 <= age <= 25`) and currency/unit conversions.
- Testing arbitrary external websites (security perimeter restricted to localhost).
- Automated visual form field auto-detection.
- Database persistence and multi-user accounts.

---

## Non-Goals

- Will not evaluate unconfirmed user expressions as executable JavaScript.
- Will not bypass CAPTCHAs, bot protections, or authentication screens.
- Will not perform scanned document OCR via heavy native binaries.
- Will not rely on cloud AI APIs for core verification functionality.
- Will not claim legal determinations or universal form correctness.

---

## Open Questions

- None remaining for product definition. All consequential behaviors, states, layouts, and boundaries are resolved for `4-spec`.
