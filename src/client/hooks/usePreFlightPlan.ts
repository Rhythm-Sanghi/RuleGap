import { useState, useCallback } from 'react';
import { RuleContract, TestPlanRecord } from '../../shared/contract.js';
import { DEMO_PROBES } from '../../shared/sampleData.js';

export function usePreFlightPlan() {
  const [fixtureMode, setFixtureMode] = useState<'inconsistent' | 'corrected'>('inconsistent');
  const [plan, setPlan] = useState<TestPlanRecord | null>(null);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isApproving, setIsApproving] = useState<boolean>(false);
  const [planError, setPlanError] = useState<string | null>(null);

  const generatePlan = useCallback(
    async (contract: RuleContract, currentMode: 'inconsistent' | 'corrected' = fixtureMode) => {
      setIsGenerating(true);
      setPlanError(null);

      try {
        const res = await fetch('/api/plans', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-RuleGap-Client': 'true',
          },
          body: JSON.stringify({
            contract,
            fixtureId: 'scholarship',
            fixtureMode: currentMode,
            targetFieldSelector: '#annual-income',
            demoProbes: DEMO_PROBES,
          }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Failed to create plan (${res.status})`);
        }

        const createdPlan: TestPlanRecord = await res.json();
        setPlan(createdPlan);
        return createdPlan;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setPlanError(msg);
        return null;
      } finally {
        setIsGenerating(false);
      }
    },
    [fixtureMode]
  );

  const approvePlan = useCallback(async () => {
    if (!plan) return null;
    setIsApproving(true);
    setPlanError(null);

    try {
      const res = await fetch(`/api/plans/${plan.planId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-RuleGap-Client': 'true',
        },
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed to approve plan (${res.status})`);
      }

      const body = await res.json();
      const approvedPlan: TestPlanRecord = body.plan;
      setPlan(approvedPlan);
      return approvedPlan;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setPlanError(msg);
      return null;
    } finally {
      setIsApproving(false);
    }
  }, [plan]);

  const resetPlan = () => {
    setPlan(null);
    setPlanError(null);
  };

  return {
    fixtureMode,
    setFixtureMode,
    plan,
    isApproved: plan?.isApproved || false,
    isGenerating,
    isApproving,
    planError,
    generatePlan,
    approvePlan,
    resetPlan,
  };
}
