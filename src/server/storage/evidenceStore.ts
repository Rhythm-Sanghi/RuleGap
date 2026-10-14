import fs from 'fs';
import path from 'path';
import { SERVER_CONFIG } from '../config.js';

export class EvidenceStore {
  private baseDir: string;

  constructor(baseDir: string = SERVER_CONFIG.evidenceStorageDir) {
    this.baseDir = baseDir;
    fs.mkdirSync(this.baseDir, { recursive: true });
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

    const runEvidenceDir = path.join(this.baseDir, runId);
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

    const filePath = path.join(this.baseDir, runId, `${caseId}.png`);
    try {
      return await fs.promises.readFile(filePath);
    } catch {
      return null;
    }
  }
}

export const evidenceStore = new EvidenceStore();
