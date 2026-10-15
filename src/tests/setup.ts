import os from 'os';
import path from 'path';
import fs from 'fs';

// If no custom RULEGAP_DATA_DIR was specified for the test process,
// ensure all in-process tests default to a clean, isolated temporary directory
// so that tests never write into or delete the developer's normal .rulegap directory.
if (!process.env.RULEGAP_DATA_DIR) {
  const testRoot = path.join(os.tmpdir(), `rulegap-test-suite-${Date.now()}-${process.pid}`);
  process.env.RULEGAP_DATA_DIR = testRoot;

  process.on('exit', () => {
    try {
      if (fs.existsSync(testRoot)) {
        fs.rmSync(testRoot, { recursive: true, force: true });
      }
    } catch {
      // ignore
    }
  });
}
