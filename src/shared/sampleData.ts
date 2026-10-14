import { RuleContract } from './contract.js';

export const SYNTHETIC_SCHOLARSHIP_POLICY = `COMMUNITY SCHOLARSHIP FOUNDATION
ELIGIBILITY CRITERIA & POLICY GUIDELINES (ACADEMIC YEAR 2026-2027)

Section 3: Financial Need Qualification
Applicants must demonstrate financial need to qualify for the community education grant.
Under the approved board guidelines:
"Applicants with annual family income of ₹300,000 or less are eligible to receive grant funding."

All reported household earnings, taxable wages, and regular financial assistance must be declared.
Supporting income certificates must be verified before disbursement. Applications must be completed online via the student registration portal.`;

export const SAMPLE_RULE_CONTRACT: RuleContract = {
  id: 'd8c7b8e1-5f2a-4c91-9e73-1b2c3d4e5f60',
  fieldName: 'Annual Family Income',
  operator: '<=',
  threshold: 300000,
  unit: 'INR',
  sourceExcerpt:
    'Applicants with annual family income of ₹300,000 or less are eligible to receive grant funding.',
  sourceDocumentName: 'scholarship_policy_2026.txt',
  sourceType: 'sample_policy',
  confirmedAt: '2026-10-14T12:00:00.000Z',
};

export const SCHOLARSHIP_DEMO_PROBES = [249999, 250000, 250001, 275000];
