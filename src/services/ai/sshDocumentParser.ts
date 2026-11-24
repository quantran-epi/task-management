/**
 * Pure-JS parsers for binary documents fetched over SSH. No server, OCR, or daemon:
 * docx -> mammoth, xlsx -> exceljs, pdf -> pdfjs-dist text layer only.
 * All inputs are ArrayBuffers from `readRemoteFileBytes` (Tauri IPC Response).
 */

import mammoth from 'mammoth';
import ExcelJS from 'exceljs';
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export type SshDocumentFormat = 'docx' | 'xlsx' | 'pdf';

export interface ParsedDocument {
  format: SshDocumentFormat;
  text: string;
  truncated: boolean;
  metadata: {
    sheetCount?: number;
    pageCount?: number;
    note?: string;
  };
}

const DEFAULT_MAX_CHARS = 24000;
const SUPPORTED_FORMATS: SshDocumentFormat[] = ['docx', 'xlsx', 'pdf'];
const SCAN_NOTE = 'PDF không có text layer (có thể là ảnh scan); không hỗ trợ OCR.';

/** Truncate before sending to the AI context; cap must be independent of file size. */
function truncateText(text: string, maxChars: number): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false };
  return {
    text: `${text.slice(0, maxChars)}\n\n[Đã cắt bởi tool: nội dung vượt quá ${maxChars} ký tự.]`,
    truncated: true,
  };
}

function toBytes(buffer: ArrayBuffer): Uint8Array {
  // A view with byteOffset != 0 must be sliced to its own bytes before being handed
  // to mammoth/exceljs/pdfjs, otherwise the parsers read the wrong memory region.
  // ArrayBuffer may be a detached view wrapper; copying guarantees exact owned bytes.
  return new Uint8Array(buffer.slice(0));
}

function extOf(filename: string): string {
  const clean = filename.split(/[\\/]/).pop() ?? filename;
  const idx = clean.lastIndexOf('.');
  return idx === -1 ? '' : clean.slice(idx + 1).toLowerCase();
}

export async function parseDocx(buffer: ArrayBuffer): Promise<ParsedDocument> {
  const bytes = toBytes(buffer);
  const result = await mammoth.extractRawText({ arrayBuffer: bytes.buffer as ArrayBuffer });
  return {
    format: 'docx',
    text: `[DOCX]\n${result.value ?? ''}`,
    truncated: false,
    metadata: {},
  };
}

export async function parseXlsx(buffer: ArrayBuffer): Promise<ParsedDocument> {
  const bytes = toBytes(buffer);
  const workbook = new ExcelJS.Workbook();
  // ExcelJS types declare Buffer, but runtime accepts ArrayBuffer/Uint8Array.
  // The cast only satisfies TS; the value passed at runtime is unchanged.
  await workbook.xlsx.load(bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);

  const sections: string[] = [];
  let sheetCount = 0;
  workbook.eachSheet((ws) => {
    sheetCount += 1;
    const rows: string[] = [];
    ws.eachRow((row) => {
      // ExcelJS row.values is 1-indexed: index 0 is a sparse hole, real cells start at 1.
      const cells = (row.values as unknown[]).map((value) => {
        if (value === null || value === undefined) return '';
        if (typeof value === 'object' && 'result' in value) return String((value as { result?: unknown }).result ?? '');
        return String(value);
      });
      rows.push(cells.join(' | '));
    });
    sections.push(`=== Sheet: ${ws.name} ===\n${rows.join('\n')}`);
  });

  return {
    format: 'xlsx',
    text: `[XLSX]\n${sections.join('\n\n')}`,
    truncated: false,
    metadata: { sheetCount },
  };
}

export async function parsePdf(buffer: ArrayBuffer): Promise<ParsedDocument> {
  const bytes = toBytes(buffer);
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  try {
    const pages: string[] = [];
    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
      // Some pdfjs builds expose getTextContent on the document, others on the page.
      const textSource = typeof (pdf as { getTextContent?: unknown }).getTextContent === 'function'
        ? pdf
        : await pdf.getPage(pageNo);
      const content = await (textSource as { getTextContent: () => Promise<{ items: unknown[] }> }).getTextContent();
      const text = content.items
        .map((item) => (item && typeof item === 'object' && 'str' in item ? String((item as { str?: unknown }).str ?? '') : ''))
        .join('');
      pages.push(`--- Trang ${pageNo} ---\n${text}`);
    }
    const joinedText = pages.join('\n\n');
    const hasText = pages.some((p) => p.replace(/--- Trang \d+ ---/, '').trim().length > 0);
    return {
      format: 'pdf',
      text: hasText ? `[PDF]\n${joinedText}` : '',
      truncated: false,
      metadata: hasText ? { pageCount: pdf.numPages } : { pageCount: pdf.numPages, note: SCAN_NOTE },
    };
  } finally {
    // `clearResources` exists in pdfjs-dist 6; older builds had `destroy`.
    await (pdf as unknown as { clearResources?: () => Promise<void> }).clearResources?.();
  }
}

/** Dispatch by filename extension and cap the resulting text for AI context safety. */
export async function parseSshDocument(
  buffer: ArrayBuffer,
  filename: string,
  maxChars: number = DEFAULT_MAX_CHARS,
): Promise<ParsedDocument> {
  const ext = extOf(filename);
  if (!SUPPORTED_FORMATS.includes(ext as SshDocumentFormat)) {
    throw new Error('Định dạng tệp không được hỗ trợ. Chỉ hỗ trợ .docx, .xlsx, .pdf.');
  }

  let parsed: ParsedDocument;
  if (ext === 'docx') parsed = await parseDocx(buffer);
  else if (ext === 'xlsx') parsed = await parseXlsx(buffer);
  else parsed = await parsePdf(buffer);

  const capped = truncateText(parsed.text, maxChars);
  return { ...parsed, text: capped.text, truncated: capped.truncated };
}
