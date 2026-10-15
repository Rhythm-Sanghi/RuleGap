import { Router, Request, Response } from 'express';
import { z } from 'zod';
import {
  RuleContractSchema,
  isScholarshipFieldCompatible,
  isScholarshipUnitCompatible,
} from '../../shared/contract.js';
import { planStore } from '../storage/planStore.js';

export const plansRouter = Router();

const CreatePlanBodySchema = z
  .object({
    contract: RuleContractSchema,
    fixtureId: z.literal('scholarship'),
    fixtureMode: z.enum(['inconsistent', 'corrected']),
    targetFieldSelector: z.literal('#annual-income'),
    demoProbes: z.array(z.number().int().safe()).optional(),
  })
  .refine(
    (data) => isScholarshipFieldCompatible(data.contract.fieldName),
    {
      message: "Incompatible field: The 'scholarship' fixture validates annual family income. Contracts for unrelated fields (such as Student Age, GPA, or Credit Score) cannot be verified against this fixture.",
      path: ['contract', 'fieldName'],
    }
  )
  .refine(
    (data) => isScholarshipUnitCompatible(data.contract.unit),
    {
      message: "Incompatible unit: The 'scholarship' fixture validates monetary income in INR (₹). Contracts denominated in other units (such as USD, EUR, or non-currency units) cannot be verified against this fixture.",
      path: ['contract', 'unit'],
    }
  )
  .refine(
    (data) => data.contract.threshold >= 0,
    {
      message: "Incompatible threshold: Income threshold cannot be negative for the 'scholarship' fixture.",
      path: ['contract', 'threshold'],
    }
  );

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
    const existingPlan = await planStore.getPlan(planId);
    if (!existingPlan) {
      return res.status(404).json({ error: `Plan '${planId}' not found` });
    }
    if (existingPlan.contract) {
      if (!isScholarshipFieldCompatible(existingPlan.contract.fieldName)) {
        return res.status(400).json({
          error: `Cannot approve plan: Contract field '${existingPlan.contract.fieldName}' is incompatible with fixture '${existingPlan.fixtureId}'.`,
        });
      }
      if (!isScholarshipUnitCompatible(existingPlan.contract.unit)) {
        return res.status(400).json({
          error: `Cannot approve plan: Contract unit '${existingPlan.contract.unit}' is incompatible with fixture '${existingPlan.fixtureId}'.`,
        });
      }
    }
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
