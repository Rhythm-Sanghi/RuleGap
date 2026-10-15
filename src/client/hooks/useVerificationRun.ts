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
        setSelectedObservation(null);
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
      setSelectedObservation(null);

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

        let pollTimer: ReturnType<typeof setTimeout> | null = null;
        let isStreamActive = true;

        const stopPolling = () => {
          isStreamActive = false;
          if (pollTimer) {
            clearTimeout(pollTimer);
            pollTimer = null;
          }
        };

        sse.addEventListener('run_completed', (event: MessageEvent) => {
          stopPolling();
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
          stopPolling();
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
          stopPolling();
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

        const pollStatus = () => {
          if (!isStreamActive) return;
          fetch(`/api/runs/${runId}?_t=${Date.now()}`, { cache: 'no-store' })
            .then((r) => (r.ok ? r.json() : null))
            .then((data: VerificationRunSnapshot | null) => {
              if (!isStreamActive) return;
              if (data && data.status !== 'RUNNING' && data.status !== 'QUEUED') {
                stopPolling();
                setActiveRunSnapshot(data);
                setSelectedRunSnapshot(data);
                setHistoricalRuns((prev) => {
                  const filtered = prev.filter((r) => r.runId !== data.runId);
                  return [data, ...filtered];
                });
                setIsRunning(false);
                setIsCancelling(false);
                sse.close();
                fetchRunHistory();
                return;
              }
              pollTimer = setTimeout(pollStatus, 1000);
            })
            .catch(() => {
              if (isStreamActive) {
                pollTimer = setTimeout(pollStatus, 1500);
              }
            });
        };

        // Safety polling timer starts after 1s to guarantee terminal synchronization even if SSE drops
        pollTimer = setTimeout(pollStatus, 1000);

        sse.onerror = () => {
          // Immediate polling fallback if SSE connection encounters an error
          if (isStreamActive) {
            pollStatus();
          }
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
    setRunError(null);

    try {
      const res = await fetch(`/api/runs/${activeRunSnapshot.runId}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-RuleGap-Client': 'true',
        },
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Cancellation request rejected (${res.status})`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setRunError(`Failed to cancel verification run: ${msg}`);
      setIsCancelling(false);
    }
  }, [activeRunSnapshot, isRunning]);

  // Keep selected observation synchronized with latest snapshot updates
  useEffect(() => {
    if (selectedObservation && selectedRunSnapshot) {
      const matching = selectedRunSnapshot.observations.find((o) => o.caseId === selectedObservation.caseId);
      if (matching) {
        setSelectedObservation(matching);
      }
    }
  }, [selectedRunSnapshot]);

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
