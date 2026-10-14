import { useState, useEffect, useCallback, useRef } from 'react';
import {
  RuleContract,
  TestPlanRecord,
  VerificationRunSnapshot,
  TestObservation,
} from '../../shared/contract.js';

export function useVerificationRun() {
  const [activeRunSnapshot, setActiveRunSnapshot] = useState<VerificationRunSnapshot | null>(null);
  const [selectedRunSnapshot, setSelectedRunSnapshot] = useState<VerificationRunSnapshot | null>(null);
  const [historicalRuns, setHistoricalRuns] = useState<VerificationRunSnapshot[]>([]);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isCancelling, setIsCancelling] = useState<boolean>(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [selectedObservation, setSelectedObservation] = useState<TestObservation | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);

  const fetchRunHistory = useCallback(async (autoSelectLatest = false) => {
    try {
      const res = await fetch('/api/runs');
      if (res.ok) {
        const body = await res.json();
        const runs: VerificationRunSnapshot[] = body.runs || [];
        setHistoricalRuns(runs);
        if (autoSelectLatest && runs.length > 0) {
          setSelectedRunSnapshot((prev) => prev ?? runs[0]);
        }
      }
    } catch (err) {
      console.warn('Failed to load run history:', err);
    }
  }, []);

  useEffect(() => {
    fetchRunHistory(true);
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [fetchRunHistory]);

  const selectRun = useCallback(async (runId: string) => {
    try {
      const res = await fetch(`/api/runs/${runId}`);
      if (res.ok) {
        const snapshot: VerificationRunSnapshot = await res.json();
        setSelectedRunSnapshot(snapshot);
      }
    } catch (err) {
      console.warn('Failed to fetch run snapshot:', err);
    }
  }, []);

  const startRun = useCallback(
    async (plan: TestPlanRecord, contract: RuleContract) => {
      if (isRunning) return;
      setIsRunning(true);
      setIsCancelling(false);
      setRunError(null);

      try {
        const res = await fetch('/api/runs', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-RuleGap-Client': 'true',
          },
          body: JSON.stringify({
            planId: plan.planId,
            contract,
          }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Run failed to start (${res.status})`);
        }

        const { runId } = await res.json();

        // Initial snapshot scaffold
        const initialSnapshot: VerificationRunSnapshot = {
          runId,
          planId: plan.planId,
          startedAt: new Date().toISOString(),
          completedAt: null,
          status: 'RUNNING',
          contract,
          fixtureMode: plan.fixtureMode,
          observations: plan.cases.map((c) => ({
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
          })),
          summaryCounts: {
            consistent: 0,
            confirmedMismatch: 0,
            inconclusive: 0,
            executionError: 0,
            notExecuted: plan.cases.length,
            interrupted: 0,
            totalScheduled: plan.cases.length,
          },
          sampledMismatchSummary: null,
        };

        setActiveRunSnapshot(initialSnapshot);
        setSelectedRunSnapshot(initialSnapshot);

        // Connect SSE stream
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
        }

        const sse = new EventSource(`/api/runs/${runId}/events`);
        eventSourceRef.current = sse;

        sse.addEventListener('test_started', (event: MessageEvent) => {
          const { caseId } = JSON.parse(event.data);
          setActiveRunSnapshot((prev) => {
            if (!prev) return prev;
            const updated = {
              ...prev,
              observations: prev.observations.map((obs) =>
                obs.caseId === caseId ? { ...obs, lifecycleState: 'RUNNING' as const } : obs
              ),
            };
            setSelectedRunSnapshot(updated);
            return updated;
          });
        });

        sse.addEventListener('test_completed', (event: MessageEvent) => {
          const { observation, summaryCounts } = JSON.parse(event.data);
          setActiveRunSnapshot((prev) => {
            if (!prev) return prev;
            const updated = {
              ...prev,
              observations: prev.observations.map((obs) =>
                obs.caseId === observation.caseId ? observation : obs
              ),
              summaryCounts,
            };
            setSelectedRunSnapshot(updated);
            return updated;
          });
        });

        sse.addEventListener('run_completed', (event: MessageEvent) => {
          const finalSnapshot: VerificationRunSnapshot = JSON.parse(event.data);
          setActiveRunSnapshot(finalSnapshot);
          setSelectedRunSnapshot(finalSnapshot);
          setHistoricalRuns((prev) => {
            const filtered = prev.filter((r) => r.runId !== finalSnapshot.runId);
            return [finalSnapshot, ...filtered];
          });
          setIsRunning(false);
          sse.close();
          fetchRunHistory();
        });

        sse.addEventListener('run_cancelled', (event: MessageEvent) => {
          const cancelledSnapshot: VerificationRunSnapshot = JSON.parse(event.data);
          setActiveRunSnapshot(cancelledSnapshot);
          setSelectedRunSnapshot(cancelledSnapshot);
          setHistoricalRuns((prev) => {
            const filtered = prev.filter((r) => r.runId !== cancelledSnapshot.runId);
            return [cancelledSnapshot, ...filtered];
          });
          setIsRunning(false);
          setIsCancelling(false);
          sse.close();
          fetchRunHistory();
        });

        sse.addEventListener('run_failed', (event: MessageEvent) => {
          const { error, snapshot } = JSON.parse(event.data);
          setRunError(error || 'Verification run encountered a fatal error');
          if (snapshot) {
            setActiveRunSnapshot(snapshot);
            setSelectedRunSnapshot(snapshot);
            setHistoricalRuns((prev) => {
              const filtered = prev.filter((r) => r.runId !== snapshot.runId);
              return [snapshot, ...filtered];
            });
          }
          setIsRunning(false);
          sse.close();
          fetchRunHistory();
        });

        sse.onerror = () => {
          // Polling fallback if SSE connection is dropped
          fetch(`/api/runs/${runId}`)
            .then((r) => r.json())
            .then((data: VerificationRunSnapshot) => {
              if (data && data.status !== 'RUNNING') {
                setActiveRunSnapshot(data);
                setSelectedRunSnapshot(data);
                setHistoricalRuns((prev) => {
                  const filtered = prev.filter((r) => r.runId !== data.runId);
                  return [data, ...filtered];
                });
                setIsRunning(false);
                sse.close();
                fetchRunHistory();
              }
            })
            .catch(() => {});
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setRunError(msg);
        setIsRunning(false);
      }
    },
    [isRunning, fetchRunHistory]
  );

  const cancelRun = useCallback(async () => {
    if (!activeRunSnapshot || !isRunning) return;
    setIsCancelling(true);

    try {
      await fetch(`/api/runs/${activeRunSnapshot.runId}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-RuleGap-Client': 'true',
        },
      });
    } catch (err) {
      console.warn('Cancellation request error:', err);
    }
  }, [activeRunSnapshot, isRunning]);

  return {
    activeRunSnapshot,
    selectedRunSnapshot,
    historicalRuns,
    isRunning,
    isCancelling,
    runError,
    selectedObservation,
    setSelectedObservation,
    selectRun,
    startRun,
    cancelRun,
    fetchRunHistory,
  };
}
