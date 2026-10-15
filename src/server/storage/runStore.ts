import fs from 'fs';
import path from 'path';
import {
  VerificationRunSnapshot,
  VerificationRunSnapshotSchema,
} from '../../shared/contract.js';
import { computeSummaryCounts } from '../../shared/ruleEngine.js';
import { SERVER_CONFIG } from '../config.js';

async function atomicWriteFile(targetPath: string, content: string): Promise<void> {
  const dir = path.dirname(targetPath);
  const base = path.basename(targetPath);
  const tempPath = path.join(dir, `.${base}.${process.pid}.${Date.now()}.tmp`);

  await fs.promises.writeFile(tempPath, content, 'utf-8');

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await fs.promises.rename(tempPath, targetPath);
      return;
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if ((code === 'EPERM' || code === 'EBUSY') && attempt < 4) {
        await new Promise((r) => setTimeout(r, 20 * (attempt + 1)));
        continue;
      }
      try {
        await fs.promises.copyFile(tempPath, targetPath);
        await fs.promises.unlink(tempPath).catch(() => {});
        return;
      } catch {
        throw err;
      }
    }
  }
}

export class RunStore {
  private customBaseDir?: string;

  constructor(baseDir?: string) {
    this.customBaseDir = baseDir;
  }

  get baseDir(): string {
    const dir = this.customBaseDir || SERVER_CONFIG.runsStorageDir;
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  /**
   * Writes an atomic progress checkpoint for an active run.
   */
  async saveActiveCheckpoint(snapshot: VerificationRunSnapshot): Promise<void> {
    const filename = `.active-${snapshot.runId}.json`;
    const finalPath = path.join(this.baseDir, filename);
    await atomicWriteFile(finalPath, JSON.stringify(snapshot, null, 2));
  }

  /**
   * Atomically finalizes a run record and removes any active checkpoint.
   */
  async saveFinalizedRun(snapshot: VerificationRunSnapshot): Promise<void> {
    // Validate schema
    VerificationRunSnapshotSchema.parse(snapshot);

    const filename = `${snapshot.runId}.json`;
    const finalPath = path.join(this.baseDir, filename);
    await atomicWriteFile(finalPath, JSON.stringify(snapshot, null, 2));

    // Clean up active checkpoint if present
    const activePath = path.join(this.baseDir, `.active-${snapshot.runId}.json`);
    try {
      await fs.promises.unlink(activePath);
    } catch {
      // ignore if already absent
    }
  }

  /**
   * Retrieves a run by ID, checking finalized snapshots first, then active checkpoints.
   */
  async getRun(runId: string): Promise<VerificationRunSnapshot | null> {
    if (!/^[0-9a-fA-F-]{36}$/.test(runId)) {
      return null;
    }

    const finalizedPath = path.join(this.baseDir, `${runId}.json`);
    try {
      const data = await fs.promises.readFile(finalizedPath, 'utf-8');
      return VerificationRunSnapshotSchema.parse(JSON.parse(data));
    } catch {
      // Check active checkpoint
      const activePath = path.join(this.baseDir, `.active-${runId}.json`);
      try {
        const data = await fs.promises.readFile(activePath, 'utf-8');
        return VerificationRunSnapshotSchema.parse(JSON.parse(data));
      } catch {
        return null;
      }
    }
  }

  /**
   * Lists all historical finalized runs sorted by start timestamp descending.
   */
  async listRuns(): Promise<VerificationRunSnapshot[]> {
    const files = await fs.promises.readdir(this.baseDir);
    const runs: VerificationRunSnapshot[] = [];

    for (const file of files) {
      if (file.endsWith('.json') && !file.startsWith('.') && /^[0-9a-fA-F-]{36}\.json$/.test(file)) {
        try {
          const data = await fs.promises.readFile(path.join(this.baseDir, file), 'utf-8');
          const run = VerificationRunSnapshotSchema.parse(JSON.parse(data));
          runs.push(run);
        } catch {
          // ignore corrupted/invalid files
        }
      }
    }

    return runs.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  }

  /**
   * Scans for any abandoned active checkpoint files from unexpected crashes/restarts,
   * reconciling them into an explicit FAILED terminal state.
   */
  async reconcileStartupCrashes(): Promise<number> {
    const files = await fs.promises.readdir(this.baseDir);
    let reconciledCount = 0;

    for (const file of files) {
      if (file.startsWith('.active-') && file.endsWith('.json')) {
        const filePath = path.join(this.baseDir, file);
        try {
          const content = await fs.promises.readFile(filePath, 'utf-8');
          const checkpoint: VerificationRunSnapshot = JSON.parse(content);

          // Mark in-flight or pending observations as interrupted / not-executed
          for (const obs of checkpoint.observations) {
            if (obs.lifecycleState === 'RUNNING') {
              obs.lifecycleState = 'INTERRUPTED';
              obs.diagnosticDetails = (obs.diagnosticDetails ? obs.diagnosticDetails + '; ' : '') + 'Server process interrupted';
            } else if (obs.lifecycleState === 'PENDING') {
              obs.lifecycleState = 'NOT_EXECUTED';
            }
          }

          checkpoint.summaryCounts = computeSummaryCounts(
            checkpoint.observations,
            checkpoint.summaryCounts.totalScheduled
          );
          checkpoint.status = 'FAILED';
          checkpoint.completedAt = new Date().toISOString();

          // Write finalized record and remove checkpoint
          await this.saveFinalizedRun(checkpoint);
          reconciledCount++;
        } catch {
          // If completely unparseable, remove corrupted checkpoint
          await fs.promises.unlink(filePath).catch(() => {});
        }
      }
    }

    return reconciledCount;
  }
}

export const runStore = new RunStore();
