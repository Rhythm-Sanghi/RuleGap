import path from 'path';

export const SERVER_CONFIG = {
  host: '127.0.0.1',
  port: Number(process.env.PORT) || 3000,
  actionTimeoutMs: 5000,
  caseTimeoutMs: 10000,
  maxScheduledCases: 25,
  runsStorageDir: path.resolve(process.cwd(), '.rulegap/runs'),
  evidenceStorageDir: path.resolve(process.cwd(), '.rulegap/evidence'),
  plansStorageDir: path.resolve(process.cwd(), '.rulegap/plans'),
};
