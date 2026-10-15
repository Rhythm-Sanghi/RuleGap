import { useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
// @ts-expect-error Vite URL query import for web worker asset
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

// Configure pdfjs worker using Vite asset URL
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

export interface ExtractedPdfResult {
  text: string;
  pageCount: number;
  fileName: string;
}

export const MAX_PDF_SIZE_BYTES = 10 * 1024 * 1024; // 10MB limit
export const MAX_PDF_PAGES = 50; // 50 pages limit
export const MAX_PDF_EXTRACTED_CHARS = 500000; // 500k characters limit

export function usePdfExtractor() {
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [fallbackOffer, setFallbackOffer] = useState<{ fileName: string } | null>(null);

  const extractTextFromPdf = async (file: File): Promise<ExtractedPdfResult | null> => {
    setIsExtracting(true);
    setExtractionError(null);
    setFallbackOffer(null);

    // Validate file type
    if (file.type && file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setExtractionError('Selected file is not a PDF document. Please select a valid .pdf file or paste policy text.');
      setFallbackOffer({ fileName: file.name });
      setIsExtracting(false);
      return null;
    }

    // Validate file size limit
    if (file.size > MAX_PDF_SIZE_BYTES) {
      const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
      setExtractionError(
        `PDF file size (${sizeMb} MB) exceeds the 10 MB limit for local in-browser parsing. Please use a smaller policy document or paste the relevant policy rule.`
      );
      setFallbackOffer({ fileName: file.name });
      setIsExtracting(false);
      return null;
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
      const pdf = await loadingTask.promise;

      // Validate page count limit
      if (pdf.numPages > MAX_PDF_PAGES) {
        setExtractionError(
          `PDF document length (${pdf.numPages} pages) exceeds the 50-page limit for local policy verification. Please select an excerpt or paste the relevant policy rule.`
        );
        setFallbackOffer({ fileName: file.name });
        return null;
      }

      let fullText = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          // @ts-expect-error item has str property in pdfjs text items
          .map((item) => item.str || '')
          .join(' ');
        fullText += pageText + '\n\n';

        if (fullText.length > MAX_PDF_EXTRACTED_CHARS) {
          fullText = fullText.slice(0, MAX_PDF_EXTRACTED_CHARS);
          break;
        }
      }

      fullText = fullText.trim();

      if (!fullText) {
        setExtractionError(
          "Couldn't extract readable text from this PDF. It may be scanned, image-based, or protected. You can paste the relevant policy text instead."
        );
        setFallbackOffer({ fileName: file.name });
        return null;
      }

      return {
        text: fullText,
        pageCount: pdf.numPages,
        fileName: file.name,
      };
    } catch (err: unknown) {
      console.warn('PDF extraction failed:', err);
      setExtractionError(
        "Couldn't extract readable text from this PDF. It may be scanned, image-based, or protected. You can paste the relevant policy text instead."
      );
      setFallbackOffer({ fileName: file.name });
      return null;
    } finally {
      setIsExtracting(false);
    }
  };

  const clearFallback = () => {
    setFallbackOffer(null);
    setExtractionError(null);
  };

  return {
    extractTextFromPdf,
    isExtracting,
    extractionError,
    fallbackOffer,
    clearFallback,
  };
}
