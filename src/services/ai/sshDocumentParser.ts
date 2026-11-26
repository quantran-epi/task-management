/**
 * Pure-JS parsers for binary documents fetched over SSH. No server, OCR, or daemon:
 * docx -> mammoth, xlsx -> exceljs, pdf -> pdfjs-dist text layer only.
 * All inputs are ArrayBuffers from `readRemoteFileBytes` (Tauri IPC Response).
 */

import mammoth from 'mammoth';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
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
const MAX_PDF_PAGES_PER_READ = 20;
const MAX_XLSX_ROWS_PER_READ = 200;
const MAX_XLSX_COLS_PER_READ = 50;
const MAX_DOCX_BLOCKS_PER_READ = 200;
const SUPPORTED_FORMATS: SshDocumentFormat[] = ['docx', 'xlsx', 'pdf'];
const SCAN_NOTE = 'PDF không có text layer (có thể là ảnh scan); không hỗ trợ OCR.';

/** 1-based ranges returned by `info` and consumed by `read`. */
export interface SshDocumentRegion {
  pageStart?: number | undefined;
  pageCount?: number | undefined;
  sheet?: string | undefined;
  rowStart?: number | undefined;
  rowCount?: number | undefined;
  colStart?: number | undefined;
  colCount?: number | undefined;
  blockStart?: number | undefined;
  blockCount?: number | undefined;
}

export interface SshDocumentInfo extends SshDocumentRegion {
  format: SshDocumentFormat;
  sizeBytes: number;
  sheetCount?: number;
  pageCount?: number;
  blockCount?: number;
  sheets?: Array<{ name: string; rowCount: number; columnCount: number }>;
  note?: string;
  nextRange: SshDocumentRegion;
}

export interface SshDocumentRegionResult {
  format: SshDocumentFormat;
  text: string;
  truncated: boolean;
  note?: string | undefined;
  pageCount?: number | undefined;
  blockCount?: number | undefined;
  /** Set when word/document.xml index failed and mammoth recovery was used. */
  fallbackUsed?: boolean | undefined;
}

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
      const cells = (row.values as unknown[]).slice(1).map((value) => {
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
  const loadingTask = pdfjsLib.getDocument({ data: bytes });
  try {
    const pdf = await loadingTask.promise;
    const pages: string[] = [];
    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
      const page = await pdf.getPage(pageNo);
      const content = await page.getTextContent();
      page.cleanup();
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
    // pdfjs-dist 6 exposes loadingTask.destroy(); `clearResources` does not exist.
    await loadingTask.destroy();
  }
}

function requireFormat(filename: string): SshDocumentFormat {
  const ext = extOf(filename);
  if (!SUPPORTED_FORMATS.includes(ext as SshDocumentFormat)) {
    throw new Error('Định dạng tệp không được hỗ trợ. Chỉ hỗ trợ .docx, .xlsx, .pdf.');
  }
  return ext as SshDocumentFormat;
}

function positive(value: number | undefined, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(Math.floor(parsed), max);
}

async function loadWorkbook(buffer: ArrayBuffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(
    toBytes(buffer) as unknown as Parameters<typeof workbook.xlsx.load>[0],
  );
  return workbook;
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && value !== null && 'result' in value) {
    return String((value as { result?: unknown }).result ?? '');
  }
  if (typeof value === 'object' && value !== null && 'text' in value) {
    return String((value as { text?: unknown }).text ?? '');
  }
  if (typeof value === 'object' && value !== null && 'richText' in value) {
    return (value as { richText?: Array<{ text?: string }> }).richText
      ?.map((part) => part.text ?? '')
      .join('') ?? '';
  }
  if (typeof value === 'object') return '';
  return String(value);
}

function sheetsOf(workbook: ExcelJS.Workbook): Array<ExcelJS.Worksheet & { getCell?: (r: number, c: number) => { value: unknown } }> {
  if (workbook.worksheets?.length) return workbook.worksheets;
  const legacy = workbook as unknown as { eachSheet?: (cb: (ws: ExcelJS.Worksheet) => void) => void };
  if (!legacy.eachSheet) return [];
  const collected: ExcelJS.Worksheet[] = [];
  legacy.eachSheet((ws) => collected.push(ws));
  return collected;
}

function sheetInfo(workbook: ExcelJS.Workbook) {
  return sheetsOf(workbook).map((ws) => ({
    name: ws.name,
    rowCount: ws.rowCount,
    columnCount: ws.columnCount,
  }));
}

function decodeXmlText(raw: string): string {
  return raw
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

async function loadDocxBlocks(buffer: ArrayBuffer): Promise<string[]> {
  const zip = await JSZip.loadAsync(toBytes(buffer));
  const xmlFile = zip.file('word/document.xml');
  if (!xmlFile) throw new Error('DOCX thiếu word/document.xml');
  const xml = await xmlFile.async('string');
  const blocks: string[] = [];
  const blockPattern = /<w:p\b[\s\S]*?<\/w:p>|<w:tbl\b[\s\S]*?<\/w:tbl>/g;
  for (const match of xml.match(blockPattern) ?? []) {
    if (match.startsWith('<w:tbl')) {
      // A wide table would blow the context; one block per row keeps ranges meaningful.
      for (const row of match.match(/<w:tr\b[\s\S]*?<\/w:tr>/g) ?? []) {
        blocks.push(textFromXml(row));
      }
    } else {
      blocks.push(textFromXml(match));
    }
  }
  if (blocks.length === 0) throw new Error('Không dựng được block index từ word/document.xml');
  return blocks;
}

function textFromXml(xml: string): string {
  return [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
    .map((m) => decodeXmlText(m[1] ?? ''))
    .join('');
}

interface LoadedPdfDocument {
  pdf: pdfjsLib.PDFDocumentProxy;
  destroy: () => Promise<void>;
}

async function loadPdfDocument(buffer: ArrayBuffer): Promise<LoadedPdfDocument> {
  const loadingTask = pdfjsLib.getDocument({ data: toBytes(buffer) });
  try {
    const pdf = await loadingTask.promise;
    const destroy = async (): Promise<void> => {
      // PDFDocumentProxy.destroy exists in some pdfjs releases; loadingTask.destroy is the
      // stable teardown path across releases. Prefer the proxy when present, but always
      // fall through to the task so the worker is released even if the proxy has no destroy.
      const proxyDestroy = (pdf as unknown as { destroy?: () => Promise<void> }).destroy;
      if (typeof proxyDestroy === 'function') {
        await proxyDestroy.call(pdf);
        return;
      }
      await loadingTask.destroy();
    };
    return { pdf, destroy };
  } catch (err) {
    await loadingTask.destroy();
    throw err;
  }
}

async function pdfPageText(pdf: pdfjsLib.PDFDocumentProxy, pageNo: number): Promise<string> {
  const page = await pdf.getPage(pageNo);
  try {
    const content = await page.getTextContent();
    return content.items
      .map((item) => (item && typeof item === 'object' && 'str' in item
        ? String((item as { str?: unknown }).str ?? '')
        : ''))
      .join('');
  } finally {
    page.cleanup();
  }
}

/** Info-first contract: counts and a suggested range, never the whole document body. */
export async function getSshDocumentInfo(
  buffer: ArrayBuffer,
  filename: string,
): Promise<SshDocumentInfo> {
  const format = requireFormat(filename);
  const base = { format, sizeBytes: buffer.byteLength };

  if (format === 'pdf') {
    const { pdf, destroy } = await loadPdfDocument(buffer);
    try {
      return { ...base, pageCount: pdf.numPages, nextRange: { pageStart: 1, pageCount: Math.min(pdf.numPages, MAX_PDF_PAGES_PER_READ) } };
    } finally {
      await destroy();
    }
  }

  if (format === 'xlsx') {
    const workbook = await loadWorkbook(buffer);
    const sheets = sheetInfo(workbook);
    const first = sheets[0];
    return {
      ...base,
      sheetCount: sheets.length,
      sheets,
      nextRange: first ? { sheet: first.name, rowStart: 1, rowCount: Math.min(first.rowCount, MAX_XLSX_ROWS_PER_READ) } : {},
    };
  }

  try {
    const blocks = await loadDocxBlocks(buffer);
    return {
      ...base,
      blockCount: blocks.length,
      nextRange: { blockStart: 1, blockCount: Math.min(blocks.length, MAX_DOCX_BLOCKS_PER_READ) },
    };
  } catch {
    // Fallback only when the XML block index cannot be built; still info-only.
    const result = await mammoth.extractRawText({ arrayBuffer: toBytes(buffer).buffer as ArrayBuffer });
    const blocks = (result?.value ?? '').split('\n').filter((line) => line.trim().length > 0);
    return {
      ...base,
      blockCount: blocks.length,
      nextRange: { blockStart: 1, blockCount: Math.min(blocks.length || 1, MAX_DOCX_BLOCKS_PER_READ) },
      note: 'Block index từ word/document.xml không dùng được; dùng mammoth fallback.',
    };
  }
}

/** Range-only read: no whole-document join-and-cut. Text/code ranges use readRemoteFileSlice in the executor. */
export async function readSshDocumentRegion(
  buffer: ArrayBuffer,
  filename: string,
  range: SshDocumentRegion,
): Promise<SshDocumentRegionResult> {
  const format = requireFormat(filename);

  if (format === 'pdf') {
    const requested = Number(range.pageCount);
    if (range.pageCount === undefined || !Number.isFinite(requested) || requested < 1 || requested > MAX_PDF_PAGES_PER_READ) {
      throw new Error(`PDF mỗi lần chỉ đọc tối đa ${MAX_PDF_PAGES_PER_READ} trang; hãy cung cấp pageCount hợp lệ.`);
    }
    const { pdf, destroy } = await loadPdfDocument(buffer);
    try {
      const pageStart = positive(range.pageStart, 1, pdf.numPages);
      const pageCount = Math.min(Math.floor(requested), pdf.numPages - pageStart + 1);
      const sections: string[] = [];
      let hasText = false;
      for (let i = 0; i < pageCount; i += 1) {
        const pageNo = pageStart + i;
        const text = await pdfPageText(pdf, pageNo);
        if (text.trim()) hasText = true;
        sections.push(`--- Trang ${pageNo} ---\n${text}`);
      }
      const capped = truncateText(sections.join('\n\n'), DEFAULT_MAX_CHARS);
      return {
        format,
        text: capped.text,
        truncated: capped.truncated,
        ...(hasText ? {} : { note: SCAN_NOTE }),
      };
    } finally {
      await destroy();
    }
  }

  if (format === 'xlsx') {
    const workbook = await loadWorkbook(buffer);
    if (!range.sheet) throw new Error('Tham số "sheet" là bắt buộc khi đọc XLSX.');
    const ws = workbook.getWorksheet?.(range.sheet) ?? sheetsOf(workbook).find((s) => s.name === range.sheet);
    if (!ws) throw new Error(`Không tìm thấy sheet "${range.sheet}".`);
    const rowStart = positive(range.rowStart, 1, ws.rowCount);
    const colStart = positive(range.colStart, 1, ws.columnCount);
    const rowCount = positive(range.rowCount, Math.min(MAX_XLSX_ROWS_PER_READ, ws.rowCount - rowStart + 1), MAX_XLSX_ROWS_PER_READ);
    const colCount = positive(range.colCount, Math.min(MAX_XLSX_COLS_PER_READ, ws.columnCount - colStart + 1), MAX_XLSX_COLS_PER_READ);
    const rows: string[] = [];
    for (let rowNo = rowStart; rowNo < rowStart + rowCount && rowNo <= ws.rowCount; rowNo += 1) {
      const cells: string[] = [];
      for (let colNo = colStart; colNo < colStart + colCount && colNo <= ws.columnCount; colNo += 1) {
        cells.push(cellText(ws.getCell(rowNo, colNo).value));
      }
      rows.push(`${rowNo}: ${cells.join(' | ')}`);
    }
    const capped = truncateText(rows.join('\n'), DEFAULT_MAX_CHARS);
    return {
      format,
      text: `=== Sheet: ${ws.name} (rows ${rowStart}-${rowStart + rowCount - 1}, cols ${colStart}-${colStart + colCount - 1}) ===\n${capped.text}`,
      truncated: capped.truncated,
    };
  }

  let blocks: string[] | null = null;
  let fallbackUsed = false;
  try {
    blocks = await loadDocxBlocks(buffer);
  } catch {
    // Corrupt/missing XML index: mammoth is a recovery path, not the primary reader.
    fallbackUsed = true;
  }
  if (!blocks) {
    const result = await mammoth.extractRawText({ arrayBuffer: toBytes(buffer).buffer as ArrayBuffer });
    blocks = (result.value ?? '').split('\n').filter((line) => line.trim().length > 0);
  }
  const blockStart = positive(range.blockStart, 1, Math.max(blocks.length, 1));
  const blockCount = positive(range.blockCount, Math.min(MAX_DOCX_BLOCKS_PER_READ, blocks.length - blockStart + 1), MAX_DOCX_BLOCKS_PER_READ);
  const selected = blocks.slice(blockStart - 1, blockStart - 1 + blockCount)
    .map((text, idx) => `[${blockStart + idx}] ${text}`);
  const capped = truncateText(selected.join('\n'), DEFAULT_MAX_CHARS);
  return {
    format,
    text: capped.text,
    truncated: capped.truncated,
    blockCount: blocks.length,
    fallbackUsed: fallbackUsed || undefined,
  };
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
