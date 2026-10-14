import path from 'path';

const baseDataDir = process.env.RULEGAP_DATA_DIR
  ? path.resolve(process.cwd(), process.env.RULEGAP_DATA_DIR)
  : path.resolve(process.cwd(), '.rulegap');

export const SERVER_CONFIG = {
  host: '127.0.0.1',
  port: Number(process.env.PORT) || 3000,
  actionTimeoutMs: 5000,
  caseTimeoutMs: 10000,
  maxScheduledCases: 25,
  runsStorageDir: path.resolve(baseDataDir, 'runs'),
  evidenceStorageDir: path.resolve(baseDataDir, 'evidence'),
  plansStorageDir: path.resolve(baseDataDir, 'plans'),
};

