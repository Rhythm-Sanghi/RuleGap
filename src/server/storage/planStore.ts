import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  RuleContract,
  TestPlanRecord,
  TestPlanRecordSchema,
} from '../../shared/contract.js';
import { generateBoundaryTestCases } from '../../shared/ruleEngine.js';
import { SERVER_CONFIG } from '../config.js';

export interface CreatePlanInput {
  contract: RuleContract;
  fixtureId: 'scholarship';
  fixtureMode: 'inconsistent' | 'corrected';
  targetFieldSelector: '#annual-income';
  demoProbes?: number[];
}

export class PlanStore {
  private customBaseDir?: string;
  private inMemoryPlans: Map<string, TestPlanRecord> = new Map();

  constructor(baseDir?: string) {
    this.customBaseDir = baseDir;
  }

  get baseDir(): string {
    const dir = this.customBaseDir || SERVER_CONFIG.plansStorageDir;
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  /**
   * Creates an authoritative server-managed test plan record with isApproved: false.
   */
  async createPlan(input: CreatePlanInput): Promise<TestPlanRecord> {
    const { contract, fixtureId, fixtureMode, targetFieldSelector, demoProbes = [] } = input;

    // Independently derive boundary test cases and expected outcomes on the server
    const cases = generateBoundaryTestCases(
      contract.operator,
      contract.threshold,
      contract.unit,
      demoProbes
    );

    if (cases.length > SERVER_CONFIG.maxScheduledCases) {
      throw new Error(`Plan exceeds maximum allowed test cases of ${SERVER_CONFIG.maxScheduledCases}`);
    }

    const planId = crypto.randomUUID();
    const planRecord: TestPlanRecord = {
      planId,
      contractId: contract.id,
      contract, // Full canonical contract bound to this plan
      fixtureId,
      fixtureMode,
      targetFieldSelector,
      cases,
      createdAt: new Date().toISOString(),
      approvedAt: null,
      isApproved: false,
    };

    // Validate against schema
    TestPlanRecordSchema.parse(planRecord);

    this.inMemoryPlans.set(planId, planRecord);
    await this.persistPlan(planRecord);

    return planRecord;
  }

  /**
   * Explicit user approval action tied to this exact plan snapshot.
   */
  async approvePlan(planId: string): Promise<TestPlanRecord> {
    const plan = await this.getPlan(planId);
    if (!plan) {
      throw new Error(`Plan ${planId} not found`);
    }

    plan.isApproved = true;
    plan.approvedAt = new Date().toISOString();

    this.inMemoryPlans.set(planId, plan);
    await this.persistPlan(plan);

    return plan;
  }

  /**
   * Retrieves a plan by ID.
   */
  async getPlan(planId: string): Promise<TestPlanRecord | null> {
    if (!/^[0-9a-fA-F-]{36}$/.test(planId)) {
      return null;
    }

    if (this.inMemoryPlans.has(planId)) {
      return this.inMemoryPlans.get(planId)!;
    }

    const planPath = path.join(this.baseDir, `${planId}.json`);
    try {
      const data = await fs.promises.readFile(planPath, 'utf-8');
      const parsed = JSON.parse(data);
      const validated = TestPlanRecordSchema.parse(parsed);
      this.inMemoryPlans.set(planId, validated);
      return validated;
    } catch {
      return null;
    }
  }

  private async persistPlan(plan: TestPlanRecord): Promise<void> {
    const planPath = path.join(this.baseDir, `${plan.planId}.json`);
    const tempPath = path.join(this.baseDir, `.${plan.planId}.tmp`);
    await fs.promises.writeFile(tempPath, JSON.stringify(plan, null, 2), 'utf-8');
    await fs.promises.rename(tempPath, planPath);
  }
}

export const planStore = new PlanStore();
