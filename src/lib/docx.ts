import mammoth from "mammoth";

/**
 * Pulls plain text out of a .docx in the browser.
 *
 * Only the modern XML-based .docx works — legacy binary .doc is a completely
 * different format that mammoth (and browsers generally) can't read.
 */
export async function extractDocxText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const { value } = await mammoth.extractRawText({ arrayBuffer });

  return value
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
