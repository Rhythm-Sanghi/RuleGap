---
doc: scope
status: approved
---

# RuleGap

"The rules say yes. The form says no."
RuleGap is an open-source, local-first software consistency verifier that demonstrates when the requirements published in a policy document contradict the actual validation restrictions enforced by an application form.

## The Unique Kernel
RuleGap connects a human-confirmed policy rule, deterministic boundary test generation, and black-box browser form observation to produce reproducible evidence of discrepancies. Rather than comparing static text documents or running generic fuzzers, it executes real browser interactions to verify whether a form's observed runtime validation agrees with a confirmed policy rule at sampled boundary points.

## Who It's For
Primary: QA engineers, civic-tech developers, nonprofit technology teams, and admissions/scholarship portal administrators who maintain digital application forms.
Today, policy updates often live in PDFs or memorandums while form validation rules are maintained in code. Inconsistencies (such as an unupdated income ceiling) silently reject eligible applicants. RuleGap provides an automated consistency check between written policy rules and live web form behavior.

## The Core Loop
1. **Rule Ingestion:** User pastes policy text or loads a text-based PDF and selects the relevant rule clause.
2. **Contract Confirmation:** User reviews and explicitly confirms a structured numeric condition (`field`, `operator` [`<`, `<=`, `>`, `>=`], `threshold`, `unit`). Operator semantics strictly govern boundary inclusivity.
3. **Field Mapping & Pre-Flight:** User maps the confirmed contract to an authorized local form field. RuleGap deterministically derives boundary test values (values below, on, and above boundary, plus separate optional demo probe values) along with expected rule outcomes. The user reviews and approves the test plan table before any execution begins.
4. **Independent Browser Verification:** A Playwright browser runner executes each approved test case against the rendered form DOM in black-box mode. It fills the target field, submits the form, and captures explicit, observable confirmation or rejection outcomes (including specific field rejection messages where available). The runner never inspects internal fixture code or configuration. Unrelated required-field errors or ambiguous validation failures are flagged as inconclusive rather than policy mismatches.
5. **Evidence & Resolution:** RuleGap renders an evidence matrix classifying every case (`Consistent`, `Confirmed Mismatch`, `Inconclusive`, `Execution Error`), displaying separate counts for each state. It highlights discrepancies at tested values, describes suspected affected intervals, and enables exporting a self-contained HTML evidence report. The user corrects the form, reruns the verification, and observes that all executed cases are consistent.

## Inspiration & Identity
- Aesthetic: **Workshop + Gridline + Studio Utility hybrid**. High-density, disciplined technical workbench, clean typography, neutral backgrounds, restrained industrial accent, zero decorative AI marketing tropes.
- Ethos: Software verification integrity, digital accessibility, and civic transparency.

## Why This Matters to the Learner
To design a reliable, evidence-driven browser verification system that pairs deterministic boundary testing with robust, black-box Playwright DOM observation. The priority is building a trustworthy tool that rigorously distinguishes genuine rule violations from automation errors and inconclusive observations without false claims of universal coverage.

## What "Working" Looks Like
A self-contained, reproducible local demonstration:
1. RuleGap starts via a single application startup command and imports a synthetic scholarship policy stating: *"Applicants with annual family income of ₹300,000 or less are eligible."*
2. User confirms contract: `income <= 300000 INR`.
3. Pre-flight generates boundary test cases (`299999`, `300000`, `300001`) plus configured demonstration probes (`249999`, `250000`, `250001`, `275000`).
4. Real Playwright browser automation interacts with the included synthetic scholarship form (which is intentionally misconfigured to reject values greater than ₹250,000).
5. The evidence matrix reports **4 Confirmed Mismatches** out of 7 executed cases at tested values `250001`, `275000`, `299999`, and `300000` (policy says yes, form says no) and **3 Consistent** cases (`249999`, `250000`, and `300001`). The runner records the observed rejection reasons, notes zero inconclusive/error executions, and exports an evidence report.
6. The user toggles/corrects the fixture threshold to ₹300,000, reruns the suite, and confirms **7 Consistent out of 7 executed cases** (0 mismatches, 0 inconclusive observations, 0 execution errors), strictly measured from real browser execution.

## The POC Boundary (Now)
- Single complete end-to-end journey from policy text/PDF to verified evidence report.
- Input: Pasted text and text-based PDF extraction (PDF.js).
- Rule Contract: Finite integer numeric comparison operators (`<`, `<=`, `>`, `>=`) with unambiguous inclusivity semantics.
- Pre-flight test plan generation with explicit user review and approval prior to execution.
- Independent, black-box Playwright browser runner testing rendered DOMs on explicitly allowed localhost targets.
- 4-state observation classifier:
  - `Confirmed Mismatch`: Explicit, verified form outcome directly contradicts policy rule expectation.
  - `Consistent`: Explicit, verified form outcome matches policy rule expectation.
  - `Inconclusive`: Form interaction completed, but result could not be definitively determined (missing explicit outcome indicators or unrelated validation failure).
  - `Execution Error`: Locator timeout, navigation failure, or browser crash prevented test execution. Never converted to a policy mismatch.
- Evidence matrix with per-test details, separate category counts, and exportable self-contained HTML report.
- Embedded synthetic scholarship application fixture with togglable defect (250,000 vs 300,000 INR) and explicit, accessible validation state indicators.
- Single command startup, fully offline capable, zero paid cloud API dependencies, MIT licensed.

## Later (Future Expansion)
- Multi-bound numeric ranges (e.g., `18 <= age <= 25`) and automated unit conversions.
- Multi-field and compound logical rules (e.g., income AND GPA thresholds).
- Non-numeric validation rules (regex patterns, date windows, residency dropdowns).
- Extension to user-authorized external URLs with security containment and confirmation sandbox.
- Automated selector discovery via visual layout heuristics.
- Headless CI/CD verification CLI.

## Explicitly Cut
- Scanned PDF OCR (avoids large native binary dependencies like Tesseract; text-based extraction is sufficient for PoC).
- Mandatory cloud LLM parsing (violates zero-cost, local-first offline principle; deterministic extraction + human confirmation is more reliable).
- Arbitrary unconstrained web crawling / bypassing auth, logins, or CAPTCHA (high security risk and outside ethical scope).
- Relational databases, user management, and microservices (unnecessary complexity; minimal local state is optimal).
