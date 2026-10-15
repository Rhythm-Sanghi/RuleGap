import { useState } from 'react';
import { RuleContract, NumericOperator, SourceType } from '../../shared/contract.js';
import {
  SAMPLE_POLICY_TEXT,
  SAMPLE_RULE_EXCERPT,
  SAMPLE_RULE_THRESHOLD,
  SAMPLE_RULE_OPERATOR,
  SAMPLE_RULE_UNIT,
  SAMPLE_FIELD_NAME,
} from '../../shared/sampleData.js';

export function useRuleContract() {
  const [sourceText, setSourceText] = useState<string>('');
  const [sourceDocumentName, setSourceDocumentName] = useState<string>('manual-entry.txt');
  const [sourceType, setSourceType] = useState<SourceType>('pasted_text');

  const [fieldName, setFieldName] = useState<string>('Annual Family Income');
  const [operator, setOperator] = useState<NumericOperator>('<=');
  const [threshold, setThreshold] = useState<number | ''>(300000);
  const [unit, setUnit] = useState<string>('INR');
  const [sourceExcerpt, setSourceExcerpt] = useState<string>('');

  const [isConfirmed, setIsConfirmed] = useState<boolean>(false);
  const [confirmedContract, setConfirmedContract] = useState<RuleContract | null>(null);

  const loadSamplePolicy = () => {
    setSourceText(SAMPLE_POLICY_TEXT);
    setSourceDocumentName('national-merit-scholarship-policy.txt');
    setSourceType('sample_policy');
    setFieldName(SAMPLE_FIELD_NAME);
    setOperator(SAMPLE_RULE_OPERATOR);
    setThreshold(SAMPLE_RULE_THRESHOLD);
    setUnit(SAMPLE_RULE_UNIT);
    setSourceExcerpt(SAMPLE_RULE_EXCERPT);
    setIsConfirmed(false);
    setConfirmedContract(null);
  };

  const extractExcerptFromText = (text: string): string => {
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    // Find line mentioning threshold or income
    const matchingLine = lines.find((l) =>
      /(income|threshold|grant|scholarship|limit|eligible|300,?000|250,?000)/i.test(l)
    );
    return matchingLine || lines[0] || '';
  };

  const updateSourceText = (text: string) => {
    setSourceText(text);
    setSourceType('pasted_text');
    setSourceDocumentName('manual-entry.txt');
    // Invalidate stale sample excerpt or missing excerpts
    setSourceExcerpt((prevExcerpt) => {
      if (prevExcerpt && text.includes(prevExcerpt) && prevExcerpt !== SAMPLE_RULE_EXCERPT) {
        return prevExcerpt;
      }
      return extractExcerptFromText(text);
    });
    setIsConfirmed(false);
    setConfirmedContract(null);
  };

  const updateSourceExcerpt = (excerpt: string) => {
    setSourceExcerpt(excerpt);
    setIsConfirmed(false);
    setConfirmedContract(null);
  };

  const loadPastedFallback = (fileName: string, text: string) => {
    setSourceText(text);
    setSourceDocumentName(fileName);
    setSourceType('manual_fallback_pdf');
    setSourceExcerpt(extractExcerptFromText(text));
    setIsConfirmed(false);
    setConfirmedContract(null);
  };

  const loadExtractedPdf = (fileName: string, text: string) => {
    setSourceText(text);
    setSourceDocumentName(fileName);
    setSourceType('extracted_pdf');
    setSourceExcerpt(extractExcerptFromText(text));
    setIsConfirmed(false);
    setConfirmedContract(null);
  };

  const confirmContract = (): RuleContract => {
    const cleanExcerpt = sourceExcerpt.trim() || extractExcerptFromText(sourceText);
    if (!cleanExcerpt) {
      throw new Error('A genuine source policy excerpt is required to confirm the rule contract');
    }

    if (threshold === '' || typeof threshold === 'undefined') {
      throw new Error('Policy threshold value cannot be empty');
    }

    const numThreshold = Number(threshold);
    if (isNaN(numThreshold) || !Number.isInteger(numThreshold) || !Number.isSafeInteger(numThreshold) || numThreshold < 0) {
      throw new Error('Policy threshold value must be a valid, non-negative integer (e.g. 300000)');
    }

    const contract: RuleContract = {
      id: crypto.randomUUID(),
      fieldName: fieldName.trim() || 'Annual Family Income',
      operator,
      threshold: numThreshold,
      unit: unit.trim() || 'INR',
      sourceExcerpt: cleanExcerpt,
      sourceDocumentName,
      sourceType,
      confirmedAt: new Date().toISOString(),
    };

    setConfirmedContract(contract);
    setIsConfirmed(true);
    return contract;
  };

  const editContract = () => {
    setIsConfirmed(false);
    setConfirmedContract(null);
  };

  return {
    sourceText,
    setSourceText: updateSourceText,
    sourceDocumentName,
    setSourceDocumentName,
    sourceType,
    setSourceType,
    fieldName,
    setFieldName,
    operator,
    setOperator,
    threshold,
    setThreshold,
    unit,
    setUnit,
    sourceExcerpt,
    setSourceExcerpt: updateSourceExcerpt,
    isConfirmed,
    confirmedContract,
    loadSamplePolicy,
    loadPastedFallback,
    loadExtractedPdf,
    confirmContract,
    editContract,
  };
}
