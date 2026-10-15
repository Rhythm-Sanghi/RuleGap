import fs from 'fs';
import path from 'path';
import {
  VerificationRunSnapshot,
  VerificationRunSnapshotSchema,
} from '../../shared/contract.js';
import { computeSummaryCounts } from '../../shared/ruleEngine.js';
import { SERVER_CONFIG } from '../config.js';

export async function atomicWriteFile(targetPath: string, content: string): Promise<void> {
  const dir = path.dirname(targetPath);
  const base = path.basename(targetPath);
  const tempPath = path.join(
    dir,
    `.${base}.${process.pid}.${Date.now()}.${Math.random().toString(36).substring(2, 8)}.tmp`
  );

  // Write content to temporary file first
  await fs.promises.writeFile(tempPath, content, 'utf-8');

  // Retry rename bounded times for transient Windows sharing violations (EPERM, EBUSY)
  const maxAttempts = 10;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await fs.promises.rename(tempPath, targetPath);
      return;
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      const isTransient = code === 'EPERM' || code === 'EBUSY';
      if (isTransient && attempt < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, 15 * (attempt + 1)));
        continue;
      }
      // On retry exhaustion or non-transient error:
      // Clean up temp file safely and rethrow error explicitly.
      // targetPath was never touched with an unsafe in-place copy.
      try {
        await fs.promises.unlink(tempPath);
      } catch {
        // ignore unlink error if file already gone
      }
      throw err;
    }
  }
}

export class RunStore {
  private customBaseDir?: string;
  private boundRunDirs: Map<string, string> = new Map();

  constructor(baseDir?: string) {
    this.customBaseDir = baseDir;
  }

  get baseDir(): string {
    const dir = this.customBaseDir || SERVER_CONFIG.runsStorageDir;
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  /**
   * Locks the directory for a specific runId so that environment changes
   * mid-run cannot redirect checkpoints or finalization across split directories.
   */
  bindRunDir(runId: string, dir?: string): string {
    const resolved = dir || this.baseDir;
    this.boundRunDirs.set(runId, resolved);
    return resolved;
  }

  getDirForRun(runId: string): string {
    return this.boundRunDirs.get(runId) || this.baseDir;
  }

  /**
   * Writes an atomic progress checkpoint for an active run.
   */
  async saveActiveCheckpoint(snapshot: VerificationRunSnapshot): Promise<void> {
    const dir = this.boundRunDirs.get(snapshot.runId) || this.bindRunDir(snapshot.runId);
    const filename = `.active-${snapshot.runId}.json`;
    const finalPath = path.join(dir, filename);
    await atomicWriteFile(finalPath, JSON.stringify(snapshot, null, 2));
  }

  /**
   * Atomically finalizes a run record and removes any active checkpoint.
   */
  async saveFinalizedRun(snapshot: VerificationRunSnapshot): Promise<void> {
    // Validate schema
    VerificationRunSnapshotSchema.parse(snapshot);

    const dir = this.boundRunDirs.get(snapshot.runId) || this.bindRunDir(snapshot.runId);
    const filename = `${snapshot.runId}.json`;
    const finalPath = path.join(dir, filename);
    await atomicWriteFile(finalPath, JSON.stringify(snapshot, null, 2));

    // Clean up active checkpoint if present
    const activePath = path.join(dir, `.active-${snapshot.runId}.json`);
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

    const searchDirs = new Set<string>();
    const bound = this.boundRunDirs.get(runId);
    if (bound) searchDirs.add(bound);
    searchDirs.add(this.baseDir);

    for (const dir of searchDirs) {
      const finalizedPath = path.join(dir, `${runId}.json`);
      try {
        const data = await fs.promises.readFile(finalizedPath, 'utf-8');
        return VerificationRunSnapshotSchema.parse(JSON.parse(data));
      } catch {
        // Check active checkpoint
        const activePath = path.join(dir, `.active-${runId}.json`);
        try {
          const data = await fs.promises.readFile(activePath, 'utf-8');
          return VerificationRunSnapshotSchema.parse(JSON.parse(data));
        } catch {
          // continue checking next directory
        }
      }
    }
    return null;
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
