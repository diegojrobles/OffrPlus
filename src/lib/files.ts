export const MAX_RESUME_BYTES = 10 * 1024 * 1024; // matches the storage bucket limit

export const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export type ResumeFileKind = "pdf" | "docx";

/** What the file picker offers, and what the storage bucket accepts. */
export const RESUME_ACCEPT = `application/pdf,${DOCX_MIME},.pdf,.docx`;

/**
 * Identifies a resume file, or returns null if it isn't one we can handle.
 *
 * Checks the extension as well as the MIME type: browsers are inconsistent
 * about what they report for .docx, and some report nothing at all.
 */
export function resumeFileKind(file: File): ResumeFileKind | null {
  const name = file.name.toLowerCase();
  if (file.type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (file.type === DOCX_MIME || name.endsWith(".docx")) return "docx";
  return null;
}

export function contentTypeFor(kind: ResumeFileKind): string {
  return kind === "pdf" ? "application/pdf" : DOCX_MIME;
}

/**
 * Extracts text from a resume, loading the parser on demand. Both libraries
 * are large and most sessions never upload a file, so neither is in the main
 * bundle.
 */
export async function extractResumeText(
  file: File,
  kind: ResumeFileKind,
): Promise<string> {
  if (kind === "pdf") {
    const { extractPdfText } = await import("./pdf");
    return extractPdfText(file);
  }
  const { extractDocxText } = await import("./docx");
  return extractDocxText(file);
}

export function formatBytes(bytes: number | null): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
