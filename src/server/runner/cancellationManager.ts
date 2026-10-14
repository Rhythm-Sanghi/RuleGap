import { BrowserContext } from 'playwright';

export interface ActiveRunHandle {
  runId: string;
  activeContext: BrowserContext | null;
  isCancellationRequested: boolean;
  abortController: AbortController;
}

export class CancellationManager {
  private activeRuns: Map<string, ActiveRunHandle> = new Map();

  registerRun(runId: string): ActiveRunHandle {
    const handle: ActiveRunHandle = {
      runId,
      activeContext: null,
      isCancellationRequested: false,
      abortController: new AbortController(),
    };
    this.activeRuns.set(runId, handle);
    return handle;
  }

  setActiveContext(runId: string, context: BrowserContext | null): void {
    const handle = this.activeRuns.get(runId);
    if (handle) {
      handle.activeContext = context;
      if (context && handle.isCancellationRequested) {
        context.close().catch(() => {});
        handle.activeContext = null;
      }
    }
  }

  getAbortSignal(runId: string): AbortSignal | null {
    const handle = this.activeRuns.get(runId);
    return handle ? handle.abortController.signal : null;
  }

  requestCancellation(runId: string): boolean {
    const handle = this.activeRuns.get(runId);
    if (!handle) {
      return false;
    }

    handle.isCancellationRequested = true;
    handle.abortController.abort();

    // Close the active browser context immediately to interrupt in-flight page operations
    if (handle.activeContext) {
      handle.activeContext.close().catch(() => {});
      handle.activeContext = null;
    }

    return true;
  }

  isCancelled(runId: string): boolean {
    const handle = this.activeRuns.get(runId);
    return handle ? handle.isCancellationRequested : false;
  }

  unregisterRun(runId: string): void {
    const handle = this.activeRuns.get(runId);
    if (handle && handle.activeContext) {
      handle.activeContext.close().catch(() => {});
    }
    this.activeRuns.delete(runId);
  }
}

export const cancellationManager = new CancellationManager();
