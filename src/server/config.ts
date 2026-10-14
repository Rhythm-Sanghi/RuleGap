import path from 'path';

function getBaseDataDir(): string {
  return process.env.RULEGAP_DATA_DIR
    ? path.resolve(process.cwd(), process.env.RULEGAP_DATA_DIR)
    : path.resolve(process.cwd(), '.rulegap');
}

export const SERVER_CONFIG = {
  host: '127.0.0.1',
  port: Number(process.env.PORT) || 3000,
  actionTimeoutMs: 5000,
  caseTimeoutMs: 10000,
  maxScheduledCases: 25,
  get runsStorageDir(): string {
    return path.resolve(getBaseDataDir(), 'runs');
  },
  get evidenceStorageDir(): string {
    return path.resolve(getBaseDataDir(), 'evidence');
  },
  get plansStorageDir(): string {
    return path.resolve(getBaseDataDir(), 'plans');
  },
};

