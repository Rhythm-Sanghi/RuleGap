import type { Page } from 'playwright';
import { Response } from 'express';
import {
  TestPlanRecord,
  RuleContract,
  VerificationRunSnapshot,
  TestObservation,
} from '../../shared/contract.js';
import {
  computeSummaryCounts,
  computeSampledMismatchSummary,
} from '../../shared/ruleEngine.js';
import { browserPool } from './browserPool.js';
import { observeFormSubmission } from './formObserver.js';
import { cancellationManager } from './cancellationManager.js';
import { runStore } from '../storage/runStore.js';
import { SERVER_CONFIG } from '../config.js';

export interface SseEvent {
  seq: number;
  type: 'test_started' | 'test_completed' | 'run_completed' | 'run_cancelled' | 'run_failed';
  data: unknown;
}

export class ExecutionRunner {
  private currentActiveRunId: string | null = null;
  private eventBuffers: Map<string, SseEvent[]> = new Map();
  private subscribers: Map<string, Set<Response>> = new Map();

  isRunActive(): boolean {
    return this.currentActiveRunId !== null;
  }

  getActiveRunId(): string | null {
    return this.currentActiveRunId;
  }

  addSubscriber(runId: string, res: Response, lastEventId?: number): void {
    if (!this.subscribers.has(runId)) {
      this.subscribers.set(runId, new Set());
    }
    const subs = this.subscribers.get(runId)!;
    subs.add(res);

    // Initial handshake
    res.write(`event: connected\ndata: {"status":"connected"}\n\n`);

    // Replay missed events from buffer (from effectiveLastEventId onwards)
    const minSeq = lastEventId !== undefined ? lastEventId : 0;
    if (this.eventBuffers.has(runId)) {
      const buffer = this.eventBuffers.get(runId)!;
      for (const ev of buffer) {
        if (ev.seq > minSeq) {
          res.write(`id: ${ev.seq}\nevent: ${ev.type}\ndata: ${JSON.stringify(ev.data)}\n\n`);
        }
      }
    }

    res.on('close', () => {
      subs.delete(res);
      if (subs.size === 0) {
        this.subscribers.delete(runId);
      }
    });
  }

  public emitEvent(runId: string, type: SseEvent['type'], data: unknown): void {
    if (!this.eventBuffers.has(runId)) {
      if (this.eventBuffers.size >= 20) {
        const oldestKey = this.eventBuffers.keys().next().value;
        if (oldestKey) this.eventBuffers.delete(oldestKey);
      }
      this.eventBuffers.set(runId, []);
    }
    const buffer = this.eventBuffers.get(runId)!;
    const seq = buffer.length + 1;
    const event: SseEvent = { seq, type, data };

    buffer.push(event);
    if (buffer.length > 100) {
      buffer.shift(); // keep last 100 events
    }

    const subs = this.subscribers.get(runId);
    if (subs) {
      const payload = `id: ${seq}\nevent: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
      for (const res of subs) {
        try {
          res.write(payload);
        } catch {
          // ignore closed connections
        }
      }
    }

    if (type === 'run_completed' || type === 'run_cancelled' || type === 'run_failed') {
      const currentSubs = this.subscribers.get(runId);
      if (currentSubs) {
        setTimeout(() => {
          for (const res of currentSubs) {
            try {
              res.end();
            } catch {
              // ignore closed connections
            }
          }
          this.subscribers.delete(runId);
        }, 1000);
      }
    }
  }

  /**
   * Starts and orchestrates an authorized verification run.
   */
  async startRun(
    runId: string,
    plan: TestPlanRecord,
    contract: RuleContract,
    port: number = SERVER_CONFIG.port
  ): Promise<void> {
    if (this.currentActiveRunId !== null) {
      throw new Error('A verification run is already active');
    }

    this.currentActiveRunId = runId;
    cancellationManager.registerRun(runId);

    const initialObservations: TestObservation[] = plan.cases.map((c) => ({
      caseId: c.caseId,
      value: c.value,
      expectedOutcome: c.expectedOutcome,
      observedFormOutcome: null,
      observedFeedbackText: null,
      classification: null,
      lifecycleState: 'PENDING',
      durationMs: 0,
      screenshotId: null,
      diagnosticDetails: null,
      executedAt: null,
    }));

    const snapshot: VerificationRunSnapshot = {
      runId,
      planId: plan.planId,
      startedAt: new Date().toISOString(),
      completedAt: null,
      status: 'RUNNING',
      contract,
      fixtureMode: plan.fixtureMode,
      observations: initialObservations,
      summaryCounts: computeSummaryCounts(initialObservations, plan.cases.length),
      sampledMismatchSummary: null,
    };

    // Save initial active checkpoint
    await runStore.saveActiveCheckpoint(snapshot);

    // Run execution loop asynchronously
    this.executeLoop(snapshot, plan, port).finally(() => {
      this.currentActiveRunId = null;
      cancellationManager.unregisterRun(runId);
    });
  }

  private async executeLoop(
    snapshot: VerificationRunSnapshot,
    plan: TestPlanRecord,
    port: number
  ): Promise<void> {
    const runId = snapshot.runId;
    const targetUrl = `http://127.0.0.1:${port}/fixtures/scholarship?mode=${plan.fixtureMode}`;

    try {
      const browser = await browserPool.getBrowser();

      for (let i = 0; i < plan.cases.length; i++) {
        // Check if cancellation was requested before scheduling this case
        if (cancellationManager.isCancelled(runId)) {
          await this.handleCancellationFinalization(snapshot, i);
          return;
        }

        const testCase = plan.cases[i];
        snapshot.observations[i].lifecycleState = 'RUNNING';

        this.emitEvent(runId, 'test_started', {
          caseId: testCase.caseId,
          value: testCase.value,
          index: i,
          total: plan.cases.length,
        });

        const context = await browserPool.createHermeticContext(browser, port);
        if (cancellationManager.isCancelled(runId)) {
          await context.close().catch(() => {});
          await this.handleCancellationFinalization(snapshot, i);
          return;
        }

        // Safely create new page, aborting immediately if cancellation arrives during newPage()
        let page: Page;
        const abortSignal = cancellationManager.getAbortSignal(runId);
        try {
          page = await new Promise<Page>((resolve, reject) => {
            if (abortSignal?.aborted) {
              return reject(new Error('Execution cancelled before page creation'));
            }
            const onAbort = () => reject(new Error('Execution cancelled during page creation'));
            abortSignal?.addEventListener('abort', onAbort, { once: true });

            context.newPage().then(
              (p) => {
                abortSignal?.removeEventListener('abort', onAbort);
                resolve(p);
              },
              (err) => {
                abortSignal?.removeEventListener('abort', onAbort);
                reject(err);
              }
            );
          });
        } catch (pageErr: unknown) {
          await context.close().catch(() => {});
          if (cancellationManager.isCancelled(runId)) {
            snapshot.observations[i].lifecycleState = 'INTERRUPTED';
            snapshot.observations[i].diagnosticDetails = 'Execution interrupted by user cancellation';
            await this.handleCancellationFinalization(snapshot, i + 1);
            return;
          }
          throw pageErr;
        }

        // Register active context so requestCancellation can close it if cancelled during observation
        cancellationManager.setActiveContext(runId, context);

        let observation: TestObservation;
        try {
          observation = await observeFormSubmission(page, {
            runId,
            caseId: testCase.caseId,
            value: testCase.value,
            expectedOutcome: testCase.expectedOutcome,
            targetUrl,
            fieldSelector: plan.targetFieldSelector,
            submitSelector: '#submit-btn',
            timeoutMs: SERVER_CONFIG.actionTimeoutMs,
          });
        } catch (err: unknown) {
          // If cancelled during observation
          if (cancellationManager.isCancelled(runId)) {
            snapshot.observations[i].lifecycleState = 'INTERRUPTED';
            snapshot.observations[i].diagnosticDetails = 'Execution interrupted by user cancellation';
            await this.handleCancellationFinalization(snapshot, i + 1);
            return;
          }

          observation = {
            caseId: testCase.caseId,
            value: testCase.value,
            expectedOutcome: testCase.expectedOutcome,
            observedFormOutcome: null,
            observedFeedbackText: null,
            classification: 'EXECUTION_ERROR',
            lifecycleState: 'COMPLETED',
            durationMs: 0,
            screenshotId: null,
            diagnosticDetails: err instanceof Error ? err.message : String(err),
            executedAt: new Date().toISOString(),
          };
        } finally {
          cancellationManager.setActiveContext(runId, null);
          await context.close().catch(() => {});
        }

        // Check again if cancelled during observation or page cleanup
        if (cancellationManager.isCancelled(runId)) {
          snapshot.observations[i].lifecycleState = 'INTERRUPTED';
          snapshot.observations[i].diagnosticDetails = 'Execution interrupted by user cancellation';
          await this.handleCancellationFinalization(snapshot, i + 1);
          return;
        }

        snapshot.observations[i] = observation;
        snapshot.summaryCounts = computeSummaryCounts(snapshot.observations, plan.cases.length);

        // Save atomic progress checkpoint to disk
        await runStore.saveActiveCheckpoint(snapshot);

        this.emitEvent(runId, 'test_completed', {
          observation,
          summaryCounts: snapshot.summaryCounts,
        });
      }

      // Check if cancellation arrived at completion
      if (cancellationManager.isCancelled(runId)) {
        await this.handleCancellationFinalization(snapshot, plan.cases.length);
        return;
      }

      // All cases completed naturally — compute final terminal status
      snapshot.completedAt = new Date().toISOString();
      const counts = snapshot.summaryCounts;

      if (counts.confirmedMismatch > 0) {
        snapshot.status = 'COMPLETED_MISMATCHES';
      } else if (counts.inconclusive > 0 || counts.executionError > 0) {
        snapshot.status = 'COMPLETED_WITH_UNCERTAINTY';
      } else if (counts.consistent === counts.totalScheduled) {
        snapshot.status = 'COMPLETED_CONSISTENT';
      } else {
        snapshot.status = 'COMPLETED_WITH_UNCERTAINTY';
      }

      snapshot.sampledMismatchSummary = computeSampledMismatchSummary(snapshot.observations);

      // Save finalized immutable snapshot
      await runStore.saveFinalizedRun(snapshot);
      this.emitEvent(runId, 'run_completed', snapshot);
    } catch (err: unknown) {
      snapshot.completedAt = new Date().toISOString();
      snapshot.status = 'FAILED';
      await runStore.saveFinalizedRun(snapshot).catch(() => {});
      this.emitEvent(runId, 'run_failed', {
        error: err instanceof Error ? err.message : String(err),
        snapshot,
      });
    }
  }

  private async handleCancellationFinalization(
    snapshot: VerificationRunSnapshot,
    interruptedIndex: number
  ): Promise<void> {
    snapshot.completedAt = new Date().toISOString();
    snapshot.status = 'CANCELLED_PARTIAL';

    // Mark remaining unexecuted test cases
    for (let j = interruptedIndex; j < snapshot.observations.length; j++) {
      if (snapshot.observations[j].lifecycleState !== 'INTERRUPTED') {
        snapshot.observations[j].lifecycleState = 'NOT_EXECUTED';
      }
    }

    snapshot.summaryCounts = computeSummaryCounts(
      snapshot.observations,
      snapshot.summaryCounts.totalScheduled
    );
    snapshot.sampledMismatchSummary = computeSampledMismatchSummary(snapshot.observations);

    await runStore.saveFinalizedRun(snapshot);
    this.emitEvent(snapshot.runId, 'run_cancelled', snapshot);
  }
}

export const executionRunner = new ExecutionRunner();
