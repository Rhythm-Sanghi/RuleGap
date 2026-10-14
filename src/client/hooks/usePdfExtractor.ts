import { useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

// Configure pdfjs worker in Vite
try {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.mjs',
    import.meta.url
  ).toString();
} catch {
  // Fallback if URL resolution fails
}

export interface ExtractedPdfResult {
  text: string;
  pageCount: number;
  fileName: string;
}

export function usePdfExtractor() {
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [fallbackOffer, setFallbackOffer] = useState<{ fileName: string } | null>(null);

  const extractTextFromPdf = async (file: File): Promise<ExtractedPdfResult | null> => {
    setIsExtracting(true);
    setExtractionError(null);
    setFallbackOffer(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
      const pdf = await loadingTask.promise;

      let fullText = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          // @ts-expect-error item has str property in pdfjs text items
          .map((item) => item.str || '')
          .join(' ');
        fullText += pageText + '\n\n';
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
