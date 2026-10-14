import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { RuleContractSchema } from '../../shared/contract.js';
import { planStore } from '../storage/planStore.js';
import { runStore } from '../storage/runStore.js';
import { evidenceStore } from '../storage/evidenceStore.js';
import { executionRunner } from '../runner/executionRunner.js';
import { cancellationManager } from '../runner/cancellationManager.js';
import { SERVER_CONFIG } from '../config.js';

export const runsRouter = Router();

const StartRunBodySchema = z.object({
  planId: z.string().uuid(),
  contract: RuleContractSchema,
});

// Start verification run
runsRouter.post('/api/runs', async (req: Request, res: Response) => {
  try {
    const { planId, contract } = StartRunBodySchema.parse(req.body);

    // 1. Authoritative plan check
    const plan = await planStore.getPlan(planId);
    if (!plan) {
      return res.status(404).json({ error: `Plan '${planId}' does not exist` });
    }
    if (!plan.isApproved) {
      return res.status(400).json({ error: 'Cannot execute unapproved test plan' });
    }
    if (plan.contractId !== contract.id) {
      return res.status(400).json({ error: 'Plan was created for a different rule contract' });
    }

    // 2. Concurrency lock: at most one active run
    if (executionRunner.isRunActive()) {
      return res.status(409).json({
        error: 'A verification run is already active. Please wait or cancel the running verification.',
      });
    }

    const runId = crypto.randomUUID();
    const port = Number(req.socket.localPort) || SERVER_CONFIG.port;

    // Start asynchronous execution
    await executionRunner.startRun(runId, plan, contract, port);

    res.status(201).json({ runId, status: 'RUNNING' });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: errorMsg });
  }
});

// List historical runs
runsRouter.get('/api/runs', async (_req: Request, res: Response) => {
  try {
    const runs = await runStore.listRuns();
    res.json({ runs });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: errorMsg });
  }
});

// Get authoritative snapshot for a run
runsRouter.get('/api/runs/:id', async (req: Request, res: Response) => {
  try {
    const run = await runStore.getRun(req.params.id);
    if (!run) {
      return res.status(404).json({ error: 'Run not found' });
    }
    res.json(run);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: errorMsg });
  }
});

// SSE event stream endpoint
runsRouter.get('/api/runs/:id/events', async (req: Request, res: Response) => {
  const runId = req.params.id;
  const run = await runStore.getRun(runId);

  if (!run) {
    return res.status(404).json({ error: 'Run not found' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const lastEventIdHeader = req.headers['last-event-id'];
  const lastEventId = typeof lastEventIdHeader === 'string' ? Number(lastEventIdHeader) : undefined;

  executionRunner.addSubscriber(runId, res, lastEventId);
});

// Cancel active run
runsRouter.post('/api/runs/:id/cancel', async (req: Request, res: Response) => {
  const runId = req.params.id;

  const success = cancellationManager.requestCancellation(runId);
  if (!success && executionRunner.getActiveRunId() !== runId) {
    // If run already finalized
    const run = await runStore.getRun(runId);
    if (run) {
      return res.json({ success: true, status: run.status, runId });
    }
    return res.status(404).json({ error: 'Active run not found' });
  }

  res.json({
    success: true,
    status: 'CANCELLATION_REQUESTED',
    runId,
  });
});

// Screenshot evidence binary retrieval
runsRouter.get('/api/runs/:id/screenshots/:caseId', async (req: Request, res: Response) => {
  const { id: runId, caseId } = req.params;
  const buffer = await evidenceStore.getScreenshot(`${runId}/${caseId}`);

  if (!buffer) {
    return res.status(404).json({ error: 'Screenshot evidence not found' });
  }

  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(buffer);
});

// Standalone offline HTML report download
runsRouter.get('/api/runs/:id/report', async (req: Request, res: Response) => {
  try {
    const run = await runStore.getRun(req.params.id);
    if (!run) {
      return res.status(404).json({ error: 'Run not found' });
    }

    const { generateHtmlEvidenceReport } = await import('../report/reportGenerator.js');
    const html = await generateHtmlEvidenceReport(run);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="rulegap-evidence-${run.runId.slice(0, 8)}.html"`
    );
    res.send(html);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: errorMsg });
  }
});

