import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { RuleContractSchema } from '../../shared/contract.js';
import { planStore } from '../storage/planStore.js';

export const plansRouter = Router();

const CreatePlanBodySchema = z.object({
  contract: RuleContractSchema,
  fixtureId: z.literal('scholarship'),
  fixtureMode: z.enum(['inconsistent', 'corrected']),
  targetFieldSelector: z.literal('#annual-income'),
  demoProbes: z.array(z.number().int().safe()).optional(),
});

// Create canonical server-managed plan
plansRouter.post('/api/plans', async (req: Request, res: Response) => {
  try {
    const parsed = CreatePlanBodySchema.parse(req.body);
    const plan = await planStore.createPlan(parsed);
    res.status(201).json(plan);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: errorMsg });
  }
});

// Explicit approval action
plansRouter.post('/api/plans/:id/approve', async (req: Request, res: Response) => {
  try {
    const planId = req.params.id;
    const approvedPlan = await planStore.approvePlan(planId);
    res.json({ success: true, plan: approvedPlan });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: errorMsg });
  }
});

// Retrieve plan
plansRouter.get('/api/plans/:id', async (req: Request, res: Response) => {
  const plan = await planStore.getPlan(req.params.id);
  if (!plan) {
    return res.status(404).json({ error: 'Plan not found' });
  }
  res.json(plan);
});
