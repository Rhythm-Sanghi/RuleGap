import { useState, useCallback, useRef } from 'react';
import { RuleContract, TestPlanRecord } from '../../shared/contract.js';
import { DEMO_PROBES } from '../../shared/sampleData.js';

export function usePreFlightPlan() {
  const [fixtureMode, setFixtureMode] = useState<'inconsistent' | 'corrected'>('inconsistent');
  const [plan, setPlan] = useState<TestPlanRecord | null>(null);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isApproving, setIsApproving] = useState<boolean>(false);
  const [planError, setPlanError] = useState<string | null>(null);

  const generationIdRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const generatePlan = useCallback(
    async (contract: RuleContract, currentMode: 'inconsistent' | 'corrected' = fixtureMode) => {
      // Abort previous in-flight plan generation if active
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const genId = ++generationIdRef.current;
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
          signal: controller.signal,
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Failed to create plan (${res.status})`);
        }

        const createdPlan: TestPlanRecord = await res.json();
        if (genId !== generationIdRef.current) {
          return null; // Stale plan generation response superseded by newer request
        }

        setPlan(createdPlan);
        return createdPlan;
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') {
          return null;
        }
        if (genId !== generationIdRef.current) {
          return null;
        }
        const msg = err instanceof Error ? err.message : String(err);
        setPlanError(msg);
        // On plan-generation failure, do not leave an obsolete approved plan executable
        setPlan(null);
        return null;
      } finally {
        if (genId === generationIdRef.current) {
          setIsGenerating(false);
        }
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
    generationIdRef.current++;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
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
