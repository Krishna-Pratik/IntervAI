/**
 * Resume text extraction (PDF via pdf-parse, DOCX via mammoth, TXT
 * passthrough; legacy .doc errors clearly). Pure I/O → text — the
 * extracted text is what later feeds the Gemini profile extraction.
 */

import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';

export interface ParsedResume {
  text: string;
  format: 'pdf' | 'docx' | 'doc' | 'txt';
}

// pdf-parse v2: ESM PDFParse class, text concatenated across pages.
async function parsePdf(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  return result.text ?? '';
}

async function parseDocx(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

/** Throws an explicit error for unsupported formats. */
export async function parseResumeBuffer(
  buffer: Buffer,
  format: string,
): Promise<ParsedResume> {
  const lower = format.toLowerCase();

  if (lower === 'pdf') {
    const text = await parsePdf(buffer);
    return { text: text.trim(), format: 'pdf' };
  }

  if (lower === 'docx') {
    const text = await parseDocx(buffer);
    return { text: text.trim(), format: 'docx' };
  }

  if (lower === 'doc') {
    throw new Error(
      'Legacy .doc files are not supported. Please upload as .pdf or .docx.',
    );
  }

  if (lower === 'txt') {
    return { text: buffer.toString('utf-8').trim(), format: 'txt' };
  }

  throw new Error(`Unsupported resume format: ${format}`);
}

/** Normalized format (pdf, docx, doc, txt) from filename/MIME, or null. */
export function detectFormat(filename: string, mimeType: string): string | null {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';

  if (ext === 'pdf' || mimeType === 'application/pdf') return 'pdf';
  if (
    ext === 'docx' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return 'docx';
  }
  if (ext === 'doc' || mimeType === 'application/msword') return 'doc';
  if (ext === 'txt' || mimeType === 'text/plain') return 'txt';

  return null;
}
