import * as pdfjsLib from "pdfjs-dist";
// Vite resolves this to a hashed asset URL and ships the worker as a separate
// chunk, so the (large) PDF worker isn't bundled into the main app.
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

/**
 * Pulls the text layer out of a PDF in the browser.
 *
 * Scanned/image-only PDFs have no text layer and will come back empty or
 * near-empty — callers should treat a blank result as "couldn't extract"
 * rather than "the resume is blank".
 */
export async function extractPdfText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: buffer });
  const doc = await loadingTask.promise;

  try {
    const pages: string[] = [];

    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();

      // Rebuild rough line breaks: pdf.js emits positioned text runs, and
      // items with hasEOL set end a visual line.
      let text = "";
      for (const item of content.items) {
        if ("str" in item) {
          text += item.str;
          if (item.hasEOL) text += "\n";
          else if (item.str && !item.str.endsWith(" ")) text += " ";
        }
      }

      pages.push(text.replace(/[ \t]+\n/g, "\n").trim());
      page.cleanup();
    }

    return pages
      .join("\n\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  } finally {
    // Releases the worker and the copy of the file it holds.
    await loadingTask.destroy();
  }
}
