import React from 'react';
import { Header } from './components/Header.js';
import { SourceIngestion } from './components/SourceIngestion.js';
import { ContractEditor } from './components/ContractEditor.js';
import { FixtureControl } from './components/FixtureControl.js';
import { PreFlightPlan } from './components/PreFlightPlan.js';
import { SummaryBar } from './components/SummaryBar.js';
import { EvidenceMatrix } from './components/EvidenceMatrix.js';
import { EvidenceDrawer } from './components/EvidenceDrawer.js';
import { RunHistorySelector } from './components/RunHistorySelector.js';

import { useRuleContract } from './hooks/useRuleContract.js';
import { usePreFlightPlan } from './hooks/usePreFlightPlan.js';
import { useVerificationRun } from './hooks/useVerificationRun.js';

export const App: React.FC = () => {
  const {
    sourceText,
    setSourceText,
    sourceDocumentName,
    sourceType,
    fieldName,
    setFieldName,
    operator,
    setOperator,
    threshold,
    setThreshold,
    unit,
    setUnit,
    sourceExcerpt,
    setSourceExcerpt,
    isConfirmed,
    confirmedContract,
    loadSamplePolicy,
    loadPastedFallback,
    loadExtractedPdf,
    confirmContract,
    editContract,
  } = useRuleContract();

  const {
    fixtureMode,
    setFixtureMode,
    plan,
    isApproved,
    isGenerating,
    isApproving,
    planError,
    generatePlan,
    approvePlan,
    resetPlan,
  } = usePreFlightPlan();

  const {
    activeRunSnapshot,
    selectedRunSnapshot,
    historicalRuns,
    isRunning,
    isCancelling,
    selectedObservation,
    setSelectedObservation,
    selectRun,
    startRun,
    cancelRun,
  } = useVerificationRun();

  // Step 2 Confirm contract -> automatically derive pre-flight plan
  const handleConfirmContract = async () => {
    const contract = confirmContract();
    await generatePlan(contract, fixtureMode);
  };

  // Modify contract -> invalidate pre-flight plan approval
  const handleEditContract = () => {
    editContract();
    resetPlan();
  };

  // Toggle fixture mode -> re-derive plan (clearing approval)
  const handleModeChange = async (newMode: 'inconsistent' | 'corrected') => {
    setFixtureMode(newMode);
    if (confirmedContract) {
      await generatePlan(confirmedContract, newMode);
    }
  };

  const handleStartRun = () => {
    if (plan && confirmedContract && isApproved) {
      startRun(plan, confirmedContract);
    }
  };

  const handleExportReport = () => {
    if (selectedRunSnapshot) {
      window.open(`/api/runs/${selectedRunSnapshot.runId}/report`, '_blank');
    }
  };

  return (
    <div>
      <Header isRunning={isRunning} activeRunId={activeRunSnapshot?.runId || null} />

      <main className="workbench-container" role="main">
        {/* Left Column: Rule & Contract Ingestion */}
        <div className="workbench-column" aria-label="Rule Contract Workspace">
          <SourceIngestion
            sourceText={sourceText}
            setSourceText={setSourceText}
            sourceDocumentName={sourceDocumentName}
            sourceType={sourceType}
            onLoadSample={loadSamplePolicy}
            onPdfExtracted={loadExtractedPdf}
            onFallbackPaste={loadPastedFallback}
            isConfirmed={isConfirmed}
            onEdit={handleEditContract}
          />

          <ContractEditor
            fieldName={fieldName}
            setFieldName={setFieldName}
            operator={operator}
            setOperator={setOperator}
            threshold={threshold}
            setThreshold={setThreshold}
            unit={unit}
            setUnit={setUnit}
            sourceExcerpt={sourceExcerpt}
            setSourceExcerpt={setSourceExcerpt}
            isConfirmed={isConfirmed}
            confirmedContract={confirmedContract}
            onConfirm={handleConfirmContract}
            onEdit={handleEditContract}
            disabled={isRunning}
          />
        </div>

        {/* Right Column: Verification Setup & Evidence Matrix */}
        <div className="workbench-column" aria-label="Verification Execution & Evidence Workspace">
          <FixtureControl
            fixtureMode={fixtureMode}
            onModeChange={handleModeChange}
            disabled={isRunning}
          />

          <PreFlightPlan
            plan={plan}
            isApproved={isApproved}
            isGenerating={isGenerating}
            isApproving={isApproving}
            planError={planError}
            onApprove={approvePlan}
            isRunning={isRunning}
            isCancelling={isCancelling}
            onStartRun={handleStartRun}
            onCancelRun={cancelRun}
            disabled={!isConfirmed}
          />

          <RunHistorySelector
            runs={historicalRuns}
            selectedRunId={selectedRunSnapshot?.runId || null}
            onSelectRun={selectRun}
            disabled={isRunning}
          />

          <SummaryBar snapshot={selectedRunSnapshot} isRunning={isRunning} />

          <EvidenceMatrix
            snapshot={selectedRunSnapshot}
            onSelectObservation={(obs) => setSelectedObservation(obs)}
            onExportReport={handleExportReport}
          />
        </div>
      </main>

      {/* Slide-over Evidence Drawer */}
      <EvidenceDrawer
        observation={selectedObservation}
        snapshot={selectedRunSnapshot}
        onClose={() => setSelectedObservation(null)}
      />
    </div>
  );
};
