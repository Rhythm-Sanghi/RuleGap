import React from 'react';
import { NumericOperator, RuleContract } from '../../shared/contract.js';

interface ContractEditorProps {
  fieldName: string;
  setFieldName: (v: string) => void;
  operator: NumericOperator;
  setOperator: (op: NumericOperator) => void;
  threshold: number;
  setThreshold: (t: number) => void;
  unit: string;
  setUnit: (u: string) => void;
  sourceExcerpt: string;
  setSourceExcerpt: (e: string) => void;
  isConfirmed: boolean;
  confirmedContract: RuleContract | null;
  onConfirm: () => void;
  onEdit: () => void;
  disabled?: boolean;
}

export const ContractEditor: React.FC<ContractEditorProps> = ({
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
  onConfirm,
  onEdit,
  disabled = false,
}) => {
  return (
    <div className="panel" aria-labelledby="contract-editor-heading">
      <div className="panel-header">
        <div className="panel-header-title">
          <span className={`step-indicator ${isConfirmed ? 'active' : ''}`}>2</span>
          <h2 id="contract-editor-heading">Rule Contract Confirmation</h2>
        </div>
        {isConfirmed ? (
          <span className="badge badge-consistent">
            Confirmed Contract
          </span>
        ) : (
          <span className="badge badge-neutral">Drafting</span>
        )}
      </div>

      <div className="panel-body">
        {/* Confirmed Contract Summary Card */}
        {isConfirmed && confirmedContract && (
          <div style={{ backgroundColor: 'var(--status-consistent-bg)', border: '1px solid var(--status-consistent-border)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--status-consistent)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Confirmed Rule Contract
              </span>
              <span className="mono" style={{ fontSize: '0.75rem', color: '#065f46' }}>
                {confirmedContract.confirmedAt ? new Date(confirmedContract.confirmedAt).toLocaleTimeString() : ''}
              </span>
            </div>
            <div className="mono font-semibold" style={{ fontSize: '0.95rem', color: '#064e3b' }}>
              {confirmedContract.fieldName} {confirmedContract.operator} ₹{confirmedContract.threshold.toLocaleString('en-IN')} {confirmedContract.unit}
            </div>
            <div style={{ fontSize: '0.78rem', color: '#065f46', marginTop: 4, fontStyle: 'italic' }}>
              &ldquo;{confirmedContract.sourceExcerpt}&rdquo;
            </div>
          </div>
        )}

        {/* Source Excerpt */}
        <div className="form-group">
          <label htmlFor="source-excerpt" className="form-label">
            Source Policy Excerpt (Relevant Rule Sentence)
          </label>
          <textarea
            id="source-excerpt"
            className="form-textarea"
            style={{ minHeight: 70 }}
            value={sourceExcerpt}
            onChange={(e) => {
              if (isConfirmed) onEdit();
              setSourceExcerpt(e.target.value);
            }}
            placeholder="e.g., The total annual family income of the applicant cannot exceed INR 3,00,000."
            disabled={disabled || isConfirmed}
          />
        </div>

        {/* Target Field Name */}
        <div className="form-group">
          <label htmlFor="field-name" className="form-label">
            Target Field Name
          </label>
          <input
            id="field-name"
            type="text"
            className="form-control"
            value={fieldName}
            onChange={(e) => {
              if (isConfirmed) onEdit();
              setFieldName(e.target.value);
            }}
            placeholder="Annual Family Income"
            disabled={disabled || isConfirmed}
          />
        </div>

        {/* Structured Comparison Operator, Threshold, Unit */}
        <div className="input-row">
          <div className="form-group" style={{ flex: '0 0 100px' }}>
            <label htmlFor="operator-select" className="form-label">
              Operator
            </label>
            <select
              id="operator-select"
              className="form-select"
              value={operator}
              onChange={(e) => {
                if (isConfirmed) onEdit();
                setOperator(e.target.value as NumericOperator);
              }}
              disabled={disabled || isConfirmed}
            >
              <option value="<=">&lt;=</option>
              <option value="<">&lt;</option>
              <option value=">=">&gt;=</option>
              <option value=">">&gt;</option>
            </select>
          </div>

          <div className="form-group" style={{ flex: 1 }}>
            <label htmlFor="threshold-input" className="form-label">
              Policy Threshold Value
            </label>
            <input
              id="threshold-input"
              type="number"
              className="form-control"
              value={threshold}
              onChange={(e) => {
                if (isConfirmed) onEdit();
                setThreshold(Number(e.target.value));
              }}
              disabled={disabled || isConfirmed}
            />
          </div>

          <div className="form-group" style={{ flex: '0 0 90px' }}>
            <label htmlFor="unit-input" className="form-label">
              Unit
            </label>
            <input
              id="unit-input"
              type="text"
              className="form-control"
              value={unit}
              onChange={(e) => {
                if (isConfirmed) onEdit();
                setUnit(e.target.value);
              }}
              disabled={disabled || isConfirmed}
            />
          </div>
        </div>

        {/* Action Button: Confirm or Edit */}
        <div style={{ marginTop: 8 }}>
          {isConfirmed ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Confirmed: {confirmedContract?.confirmedAt ? new Date(confirmedContract.confirmedAt).toLocaleTimeString() : ''}
              </span>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onEdit}
                disabled={disabled}
              >
                Modify Contract
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={onConfirm}
              disabled={disabled || !fieldName.trim() || threshold === undefined}
              style={{ width: '100%' }}
            >
              Confirm Rule Contract & Derive Plan
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
