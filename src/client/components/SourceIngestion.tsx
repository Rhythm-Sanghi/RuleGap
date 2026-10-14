import React, { useRef, useState } from 'react';
import { usePdfExtractor } from '../hooks/usePdfExtractor.js';
import { SourceType } from '../../shared/contract.js';

interface SourceIngestionProps {
  sourceText: string;
  setSourceText: (text: string) => void;
  sourceDocumentName: string;
  sourceType: SourceType;
  onLoadSample: () => void;
  onPdfExtracted: (fileName: string, text: string) => void;
  onFallbackPaste: (fileName: string, text: string) => void;
  isConfirmed: boolean;
  onEdit: () => void;
}

export const SourceIngestion: React.FC<SourceIngestionProps> = ({
  sourceText,
  setSourceText,
  sourceDocumentName,
  sourceType,
  onLoadSample,
  onPdfExtracted,
  onFallbackPaste,
  isConfirmed,
  onEdit,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pasteModeAfterFallback, setPasteModeAfterFallback] = useState<boolean>(false);
  const [fallbackFileName, setFallbackFileName] = useState<string>('');

  const {
    extractTextFromPdf,
    isExtracting,
    extractionError,
    fallbackOffer,
    clearFallback,
  } = usePdfExtractor();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
      alert('Please upload a PDF document.');
      return;
    }

    const result = await extractTextFromPdf(file);
    if (result) {
      onPdfExtracted(result.fileName, result.text);
      setPasteModeAfterFallback(false);
    }
  };

  const handleTriggerPasteFallback = () => {
    if (fallbackOffer) {
      setFallbackFileName(fallbackOffer.fileName);
      setPasteModeAfterFallback(true);
      clearFallback();
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (isConfirmed) {
      onEdit();
    }
    const val = e.target.value;
    if (pasteModeAfterFallback) {
      onFallbackPaste(fallbackFileName || sourceDocumentName, val);
    } else {
      setSourceText(val);
    }
  };

  return (
    <div className="panel" aria-labelledby="source-ingestion-heading">
      <div className="panel-header">
        <div className="panel-header-title">
          <span className="step-indicator active">1</span>
          <h2 id="source-ingestion-heading">Policy Text & PDF Ingestion</h2>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onLoadSample}
          disabled={isExtracting}
          aria-label="Load synthetic demonstration policy"
        >
          Load Sample Policy
        </button>
      </div>

      <div className="panel-body">
        {/* PDF Upload Button and Trigger */}
        <div className="form-group">
          <label htmlFor="pdf-upload" className="form-label">
            Import Policy Document (PDF)
          </label>
          <input
            id="pdf-upload"
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            onChange={handleFileChange}
            style={{ display: 'none' }}
            disabled={isExtracting}
          />
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={isExtracting}
            style={{ width: '100%' }}
          >
            {isExtracting ? 'Extracting readable text...' : 'Select PDF File to Extract Text'}
          </button>
        </div>

        {/* Fallback Callout if PDF unparseable */}
        {extractionError && (
          <div className="callout callout-warning" role="alert">
            <p style={{ fontWeight: 600, marginBottom: 4 }}>PDF Extraction Issue</p>
            <p>{extractionError}</p>
            {fallbackOffer && (
              <div style={{ marginTop: 8 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ minHeight: 36, padding: '4px 12px', fontSize: '0.8rem' }}
                  onClick={handleTriggerPasteFallback}
                >
                  Paste Text Instead ({fallbackOffer.fileName})
                </button>
              </div>
            )}
          </div>
        )}

        {/* Document Metadata Strip */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span>Source:</span>
            <strong className="mono" style={{ color: 'var(--text-primary)' }}>{sourceDocumentName}</strong>
            <span className="badge badge-neutral" style={{ fontSize: '0.68rem', padding: '1px 6px' }}>
              {sourceType === 'sample_policy'
                ? 'Sample Policy'
                : sourceType === 'extracted_pdf'
                ? 'Extracted PDF'
                : sourceType === 'manual_fallback_pdf'
                ? 'Manual Fallback'
                : 'Pasted Text'}
            </span>
          </div>
          <span className="mono" style={{ fontSize: '0.75rem' }}>{sourceText.length} chars</span>
        </div>

        {/* Policy Text Box */}
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label htmlFor="policy-text-area" className="form-label">
            Policy Rule Text
          </label>
          <textarea
            id="policy-text-area"
            className="form-textarea"
            style={{ minHeight: 135, fontFamily: 'var(--font-mono)', fontSize: '0.82rem', lineHeight: 1.45 }}
            value={sourceText}
            onChange={handleTextChange}
            placeholder="Paste policy guidelines or load the sample policy above..."
            rows={7}
            aria-required="true"
          />
        </div>
      </div>
    </div>
  );
};
