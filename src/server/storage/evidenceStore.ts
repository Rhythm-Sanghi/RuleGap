import fs from 'fs';
import path from 'path';
import { SERVER_CONFIG } from '../config.js';

export class EvidenceStore {
  private customBaseDir?: string;
  private boundRunDirs: Map<string, string> = new Map();

  constructor(baseDir?: string) {
    this.customBaseDir = baseDir;
  }

  get baseDir(): string {
    const dir = this.customBaseDir || SERVER_CONFIG.evidenceStorageDir;
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  /**
   * Locks the evidence directory for a specific runId so that environment changes
   * mid-run cannot redirect screenshot storage or lookups across split directories.
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
   * Saves a binary screenshot buffer to disk safely, returning its screenshotId.
   */
  async saveScreenshot(runId: string, caseId: string, imageBuffer: Buffer): Promise<string> {
    // Validate IDs to prevent path traversal
    if (!/^[a-zA-Z0-9_-]+$/.test(caseId)) {
      throw new Error(`Invalid caseId for evidence storage: ${caseId}`);
    }
    if (!/^[0-9a-fA-F-]{36}$/.test(runId)) {
      throw new Error(`Invalid runId for evidence storage: ${runId}`);
    }

    const dir = this.boundRunDirs.get(runId) || this.bindRunDir(runId);
    const runEvidenceDir = path.join(dir, runId);
    await fs.promises.mkdir(runEvidenceDir, { recursive: true });

    const filename = `${caseId}.png`;
    const targetPath = path.join(runEvidenceDir, filename);

    // Limit screenshot size to 1MB
    if (imageBuffer.length > 1024 * 1024) {
      throw new Error('Screenshot exceeds 1MB limit');
    }

    await fs.promises.writeFile(targetPath, imageBuffer);
    return `${runId}/${caseId}`;
  }

  /**
   * Retrieves a screenshot buffer by screenshotId.
   */
  async getScreenshot(screenshotId: string): Promise<Buffer | null> {
    const parts = screenshotId.split('/');
    if (parts.length !== 2) return null;
    const [runId, caseId] = parts;

    if (!/^[0-9a-fA-F-]{36}$/.test(runId) || !/^[a-zA-Z0-9_-]+$/.test(caseId)) {
      return null;
    }

    const searchDirs = new Set<string>();
    const bound = this.boundRunDirs.get(runId);
    if (bound) searchDirs.add(bound);
    searchDirs.add(this.baseDir);

    for (const dir of searchDirs) {
      const filePath = path.join(dir, runId, `${caseId}.png`);
      try {
        return await fs.promises.readFile(filePath);
      } catch {
        // continue checking next directory
      }
    }
    return null;
  }
}

export const evidenceStore = new EvidenceStore();
