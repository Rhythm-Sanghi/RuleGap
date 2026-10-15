import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import {
  RuleContractSchema,
  isScholarshipFieldCompatible,
  isScholarshipUnitCompatible,
} from '../../shared/contract.js';
import { planStore } from '../storage/planStore.js';
import { runStore } from '../storage/runStore.js';
import { evidenceStore } from '../storage/evidenceStore.js';
import { executionRunner } from '../runner/executionRunner.js';
import { cancellationManager } from '../runner/cancellationManager.js';
import { SERVER_CONFIG } from '../config.js';

export const runsRouter = Router();

const StartRunBodySchema = z.object({
  planId: z.string().uuid(),
  contract: RuleContractSchema.optional(),
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

    // Reject unverifiable legacy plans without embedded contract
    if (!plan.contract) {
      return res.status(400).json({
        error: 'Cannot execute unverifiable legacy test plan without embedded rule contract',
      });
    }

    // If client supplied a contract, verify that every field matches the approved plan's contract
    if (contract) {
      if (contract.id !== plan.contract.id) {
        return res.status(400).json({
          error: `Plan was created for a different rule contract (Contract ID mismatch: submitted '${contract.id}' does not match approved plan '${plan.contract.id}')`,
        });
      }
      if (contract.threshold !== plan.contract.threshold) {
        return res.status(400).json({
          error: `Contract threshold mismatch: submitted ${contract.threshold} does not match approved plan ${plan.contract.threshold}`,
        });
      }
      if (contract.operator !== plan.contract.operator) {
        return res.status(400).json({
          error: `Contract operator mismatch: submitted '${contract.operator}' does not match approved plan '${plan.contract.operator}'`,
        });
      }
      if (contract.unit !== plan.contract.unit) {
        return res.status(400).json({
          error: `Contract unit mismatch: submitted '${contract.unit}' does not match approved plan '${plan.contract.unit}'`,
        });
      }
      if (contract.fieldName !== plan.contract.fieldName) {
        return res.status(400).json({
          error: `Contract fieldName mismatch: submitted '${contract.fieldName}' does not match approved plan '${plan.contract.fieldName}'`,
        });
      }
      if (contract.sourceExcerpt !== plan.contract.sourceExcerpt) {
        return res.status(400).json({
          error: `Contract sourceExcerpt mismatch: submitted excerpt does not match approved plan excerpt`,
        });
      }
    }

    // Always derive the executed contract strictly from the approved server plan
    const executedContract = plan.contract;

    if (!isScholarshipFieldCompatible(executedContract.fieldName)) {
      return res.status(400).json({
        error: `Cannot execute plan: Contract field '${executedContract.fieldName}' is incompatible with fixture '${plan.fixtureId}'.`,
      });
    }
    if (!isScholarshipUnitCompatible(executedContract.unit)) {
      return res.status(400).json({
        error: `Cannot execute plan: Contract unit '${executedContract.unit}' is incompatible with fixture '${plan.fixtureId}'.`,
      });
    }

    // 2. Concurrency lock: at most one active run
    if (executionRunner.isRunActive()) {
      return res.status(409).json({
        error: 'A verification run is already active. Please wait or cancel the running verification.',
      });
    }

    const runId = crypto.randomUUID();
    const socketWithServer = req.socket as { server?: { address?: () => unknown } };
    const serverAddr =
      socketWithServer.server && typeof socketWithServer.server.address === 'function'
        ? socketWithServer.server.address()
        : null;
    const serverPort =
      serverAddr && typeof serverAddr === 'object' && serverAddr && 'port' in serverAddr
        ? (serverAddr as { port: number }).port
        : null;
    const socketAddr = typeof req.socket.address === 'function' ? req.socket.address() : null;
    const socketPort =
      socketAddr && typeof socketAddr === 'object' && 'port' in socketAddr
        ? (socketAddr as { port: number }).port
        : req.socket.localPort;
    const configuredPort = req.app.get('serverPort') || req.app.get('port');
    const port = Number(serverPort || socketPort || configuredPort) || SERVER_CONFIG.port;

    // Start asynchronous execution with the authoritative approved contract
    try {
      await executionRunner.startRun(runId, plan, executedContract, port);
    } catch (startErr: unknown) {
      const errorMsg = startErr instanceof Error ? startErr.message : String(startErr);
      return res.status(500).json({ error: `Failed to initialize verification run: ${errorMsg}` });
    }

    res.status(201).json({ runId, status: 'RUNNING' });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: errorMsg });
  }
});

// Disable caching for all runs API endpoints to ensure fresh status updates
runsRouter.use('/api/runs', (_req: Request, res: Response, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
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

  // If the run is already in a terminal state, immediately dispatch the authoritative terminal event
  const isTerminal = [
    'COMPLETED_CONSISTENT',
    'COMPLETED_MISMATCHES',
    'COMPLETED_WITH_UNCERTAINTY',
    'CANCELLED_PARTIAL',
    'FAILED',
  ].includes(run.status);

  if (isTerminal) {
    res.write(`event: connected\ndata: {"status":"connected"}\n\n`);
    if (run.status === 'CANCELLED_PARTIAL') {
      res.write(`id: 1\nevent: run_cancelled\ndata: ${JSON.stringify(run)}\n\n`);
    } else if (run.status === 'FAILED') {
      res.write(
        `id: 1\nevent: run_failed\ndata: ${JSON.stringify({ error: 'Verification run failed or was interrupted', snapshot: run })}\n\n`
      );
    } else {
      res.write(`id: 1\nevent: run_completed\ndata: ${JSON.stringify(run)}\n\n`);
    }
    setTimeout(() => {
      try {
        res.end();
      } catch {
        // ignore closed connection
      }
    }, 1500);
    return;
  }

  // Send initial event to ensure client socket transitions to open state
  res.write(`event: connected\ndata: {"status":"connected"}\n\n`);

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

