/**
 * Client-side multi-format file generation and browser download utility.
 * Supports Markdown (.md), Plain Text (.txt), Word (.docx), Excel (.xlsx), CSV (.csv), and PowerPoint (.pptx).
 * DOCX and XLSX are created using zero-dependency, pure TypeScript store-mode (uncompressed) OpenXML ZIP archives.
 */

import { isTauriApp } from './timerPopout';

export type ExportFormat = 'md' | 'txt' | 'docx' | 'xlsx' | 'csv' | 'pptx';

export interface FileExportResult {
  filename: string;
  format: ExportFormat;
  sizeBytes: number;
  blob: Blob;
}

// CRC32 Lookup Table
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[i] = c >>> 0;
}

function computeCrc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ data[i]!) & 0xff]!;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

interface ZipEntry {
  path: string;
  data: Uint8Array;
}

/**
 * Builds an uncompressed (Store mode, compression method 0) ZIP archive.
 * Standard OpenXML consumers (Microsoft Office, Google Docs/Sheets, LibreOffice)
 * officially accept store-mode ZIP containers.
 */
function createStoreZip(entries: ZipEntry[]): Blob {
  const encoder = new TextEncoder();
  const fileRecords: Array<{
    pathBytes: Uint8Array;
    data: Uint8Array;
    crc32: number;
    offset: number;
  }> = [];

  let offset = 0;
  const localHeaderChunks: Uint8Array[] = [];

  for (const entry of entries) {
    const pathBytes = encoder.encode(entry.path);
    const crc32 = computeCrc32(entry.data);
    const dataLen = entry.data.length;

    // Local file header: 30 bytes + filename
    const header = new Uint8Array(30 + pathBytes.length);
    const view = new DataView(header.buffer);

    view.setUint32(0, 0x04034b50, true); // Local file header signature
    view.setUint16(4, 20, true); // Version needed to extract (2.0)
    view.setUint16(6, 0x0800, true); // General purpose bit flag (UTF-8)
    view.setUint16(8, 0, true); // Compression method (0 = store)
    view.setUint16(10, 0, true); // File last mod time
    view.setUint16(12, 0, true); // File last mod date
    view.setUint32(14, crc32, true); // CRC-32
    view.setUint32(18, dataLen, true); // Compressed size
    view.setUint32(22, dataLen, true); // Uncompressed size
    view.setUint16(26, pathBytes.length, true); // Filename length
    view.setUint16(28, 0, true); // Extra field length

    header.set(pathBytes, 30);

    localHeaderChunks.push(header, entry.data);
    fileRecords.push({
      pathBytes,
      data: entry.data,
      crc32,
      offset,
    });

    offset += header.length + dataLen;
  }

  const centralDirOffset = offset;
  const centralDirChunks: Uint8Array[] = [];
  let centralDirSize = 0;

  for (const rec of fileRecords) {
    // Central directory header: 46 bytes + filename
    const header = new Uint8Array(46 + rec.pathBytes.length);
    const view = new DataView(header.buffer);

    view.setUint32(0, 0x02014b50, true); // Central directory header signature
    view.setUint16(4, 20, true); // Version made by
    view.setUint16(6, 20, true); // Version needed to extract
    view.setUint16(8, 0x0800, true); // General purpose bit flag (UTF-8)
    view.setUint16(10, 0, true); // Compression method (store)
    view.setUint16(12, 0, true); // File last mod time
    view.setUint16(14, 0, true); // File last mod date
    view.setUint32(16, rec.crc32, true); // CRC-32
    view.setUint32(20, rec.data.length, true); // Compressed size
    view.setUint32(24, rec.data.length, true); // Uncompressed size
    view.setUint16(28, rec.pathBytes.length, true); // Filename length
    view.setUint16(30, 0, true); // Extra field length
    view.setUint16(32, 0, true); // Comment length
    view.setUint16(34, 0, true); // Disk number start
    view.setUint16(36, 0, true); // Internal file attributes
    view.setUint32(38, 0, true); // External file attributes
    view.setUint32(42, rec.offset, true); // Relative offset of local header

    header.set(rec.pathBytes, 46);

    centralDirChunks.push(header);
    centralDirSize += header.length;
  }

  // End of central directory record (22 bytes)
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true); // EOCD signature
  eocdView.setUint16(4, 0, true); // Number of this disk
  eocdView.setUint16(6, 0, true); // Disk where central directory starts
  eocdView.setUint16(8, fileRecords.length, true); // Number of central directory records on this disk
  eocdView.setUint16(10, fileRecords.length, true); // Total central directory records
  eocdView.setUint32(12, centralDirSize, true); // Size of central directory
  eocdView.setUint32(16, centralDirOffset, true); // Offset of start of central directory
  eocdView.setUint16(20, 0, true); // Comment length

  // Combine all Uint8Array chunks into a single ArrayBuffer for standard Blob compatibility
  const totalLength = offset + centralDirSize + eocd.length;
  const outBuffer = new Uint8Array(totalLength);
  let pos = 0;

  for (const chunk of localHeaderChunks) {
    outBuffer.set(chunk, pos);
    pos += chunk.length;
  }
  for (const chunk of centralDirChunks) {
    outBuffer.set(chunk, pos);
    pos += chunk.length;
  }
  outBuffer.set(eocd, pos);

  return new Blob([outBuffer.buffer as ArrayBuffer], {
    type: 'application/octet-stream',
  });
}

/**
 * Escapes XML special characters for safety in OpenXML documents.
 */
function escapeXml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Sanitizes filename by stripping directory traversal and illegal characters per T-QOX-01.
 */
export function sanitizeFilename(filename: string): string {
  if (!filename) return 'download';
  const clean = filename
    .replace(/\.\.[\/\\]/g, '') // directory traversal
    .replace(/[\\/:*?"<>|]/g, '_') // illegal filesystem chars
    .trim();
  return clean.length > 0 ? clean : 'download';
}

/**
 * Infers target file format from filename extension.
 */
export function inferFormatFromFilename(filename: string): ExportFormat {
  if (!filename) return 'md';
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'docx':
      return 'docx';
    case 'xlsx':
      return 'xlsx';
    case 'csv':
      return 'csv';
    case 'pptx':
      return 'pptx';
    case 'txt':
      return 'txt';
    case 'md':
      return 'md';
    default:
      return 'md';
  }
}

/**
 * Parses markdown table lines into 2D array of string cells.
 */
function parseMarkdownTable(lines: string[], startIdx: number): { rows: string[][]; nextIdx: number } {
  const rows: string[][] = [];
  let idx = startIdx;

  while (idx < lines.length) {
    const line = lines[idx]!.trim();
    if (!line.startsWith('|') && !line.includes('|')) {
      break;
    }

    // Skip markdown separator row |---|---|
    if (/^\|?(\s*:?-+:?\s*\|)+\s*:?-+:?\s*\|?$/.test(line)) {
      idx++;
      continue;
    }

    const rawCells = line.split('|');
    // Drop leading and trailing empty elements from outer pipes
    if (line.startsWith('|')) rawCells.shift();
    if (line.endsWith('|')) rawCells.pop();

    const cells = rawCells.map((c) => c.trim());
    if (cells.length > 0) {
      rows.push(cells);
    }
    idx++;
  }

  return { rows, nextIdx: idx };
}

/**
 * Generates an uncompressed OpenXML Word document (.docx).
 */
export function generateDocxBlob(content: string, _title?: string): Blob {
  const encoder = new TextEncoder();
  const lines = (content || '').split('\n');
  const bodyXmlParts: string[] = [];

  let i = 0;
  while (i < lines.length) {
    const rawLine = lines[i]!;
    const line = rawLine.trim();

    if (!line) {
      // Empty line / paragraph break
      bodyXmlParts.push('<w:p><w:pPr><w:spacing w:after="120"/></w:pPr></w:p>');
      i++;
      continue;
    }

    // Table detection: line contains '|'
    if (line.startsWith('|') || (line.includes('|') && i + 1 < lines.length && lines[i + 1]!.includes('-|-'))) {
      const { rows, nextIdx } = parseMarkdownTable(lines, i);
      if (rows.length > 0) {
        let tblXml = '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>';
        tblXml += '<w:top w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>';
        tblXml += '<w:left w:val="none"/>';
        tblXml += '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>';
        tblXml += '<w:right w:val="none"/>';
        tblXml += '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="E5E5E5"/>';
        tblXml += '<w:insideV w:val="none"/>';
        tblXml += '</w:tblBorders></w:tblPr>';

        rows.forEach((row, rowIdx) => {
          tblXml += '<w:tr>';
          row.forEach((cell) => {
            const isHeader = rowIdx === 0;
            tblXml += '<w:tc>';
            tblXml += `<w:tcPr>${isHeader ? '<w:shd w:val="clear" w:color="auto" w:fill="F3F4F6"/>' : ''}<w:tcMar><w:top w:w="120" w:type="dxa"/><w:bottom w:w="120" w:type="dxa"/><w:left w:w="160" w:type="dxa"/><w:right w:w="160" w:type="dxa"/></w:tcMar></w:tcPr>`;
            tblXml += `<w:p><w:r>${isHeader ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${escapeXml(cell)}</w:t></w:r></w:p>`;
            tblXml += '</w:tc>';
          });
          tblXml += '</w:tr>';
        });

        tblXml += '</w:tbl>';
        bodyXmlParts.push(tblXml);
      }
      i = nextIdx;
      continue;
    }

    // Heading 1: # Title
    if (line.startsWith('# ')) {
      const text = line.slice(2).trim();
      bodyXmlParts.push(
        `<w:p><w:pPr><w:pStyle w:val="Heading1"/><w:spacing w:before="240" w:after="120"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="36"/><w:color w:val="111827"/></w:rPr><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`
      );
      i++;
      continue;
    }

    // Heading 2: ## Title
    if (line.startsWith('## ')) {
      const text = line.slice(3).trim();
      bodyXmlParts.push(
        `<w:p><w:pPr><w:pStyle w:val="Heading2"/><w:spacing w:before="200" w:after="100"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="30"/><w:color w:val="1F2937"/></w:rPr><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`
      );
      i++;
      continue;
    }

    // Heading 3: ### Title
    if (line.startsWith('### ')) {
      const text = line.slice(4).trim();
      bodyXmlParts.push(
        `<w:p><w:pPr><w:pStyle w:val="Heading3"/><w:spacing w:before="160" w:after="80"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="26"/><w:color w:val="374151"/></w:rPr><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`
      );
      i++;
      continue;
    }

    // Bullet item: - text, * text, 1. text
    const bulletMatch = line.match(/^[-*]\s+(.*)$/) || line.match(/^\d+\.\s+(.*)$/);
    if (bulletMatch && bulletMatch[1]) {
      const bulletText = bulletMatch[1];
      bodyXmlParts.push(
        `<w:p><w:pPr><w:ind w:left="400" w:hanging="200"/><w:spacing w:after="80"/></w:pPr><w:r><w:t xml:space="preserve">&#8226;  ${escapeXml(bulletText)}</w:t></w:r></w:p>`
      );
      i++;
      continue;
    }

    // Standard paragraph with simple bold/italic inline parsing
    let pXml = '<w:p><w:pPr><w:spacing w:after="120"/></w:pPr>';
    const parts = line.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
    for (const part of parts) {
      if (!part) continue;
      if (part.startsWith('**') && part.endsWith('**')) {
        pXml += `<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${escapeXml(part.slice(2, -2))}</w:t></w:r>`;
      } else if (part.startsWith('*') && part.endsWith('*')) {
        pXml += `<w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">${escapeXml(part.slice(1, -1))}</w:t></w:r>`;
      } else {
        pXml += `<w:r><w:t xml:space="preserve">${escapeXml(part)}</w:t></w:r>`;
      }
    }
    pXml += '</w:p>';
    bodyXmlParts.push(pXml);

    i++;
  }

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${bodyXmlParts.join('\n    ')}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const docRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`;

  const entries: ZipEntry[] = [
    { path: '[Content_Types].xml', data: encoder.encode(contentTypesXml) },
    { path: '_rels/.rels', data: encoder.encode(rootRelsXml) },
    { path: 'word/_rels/document.xml.rels', data: encoder.encode(docRelsXml) },
    { path: 'word/document.xml', data: encoder.encode(documentXml) },
  ];

  const zipBlob = createStoreZip(entries);
  return new Blob([zipBlob], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

/**
 * Converts index number (0-based) to Excel column letters (A, B, ..., Z, AA, AB...).
 */
function toColumnLetter(colIndex: number): string {
  let temp = colIndex;
  let letter = '';
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

/**
 * Extracts 2D array of rows from markdown or text for Excel spreadsheet generation.
 */
function extractGridFromText(content: string): string[][] {
  const lines = (content || '').split('\n');
  const grid: string[][] = [];

  // Check if markdown table pattern exists
  const hasMarkdownTable = lines.some((l) => l.trim().startsWith('|') || l.trim().includes('|'));

  if (hasMarkdownTable) {
    let inTable = false;
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      if (line.includes('|')) {
        // Skip separator row
        if (/^\|?(\s*:?-+:?\s*\|)+\s*:?-+:?\s*\|?$/.test(line)) {
          continue;
        }
        const rawCells = line.split('|');
        if (line.startsWith('|')) rawCells.shift();
        if (line.endsWith('|')) rawCells.pop();
        const cells = rawCells.map((c) => c.trim());
        if (cells.length > 0) {
          grid.push(cells);
          inTable = true;
        }
      } else if (inTable) {
        // Continue capturing other non-empty lines or stop
        grid.push([line]);
      }
    }
  }

  // Fallback if no table found: split lines by comma or tab or preserve as single column
  if (grid.length === 0) {
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      if (line.includes('\t')) {
        grid.push(line.split('\t').map((c) => c.trim()));
      } else if (line.includes(',') && !line.startsWith('#')) {
        grid.push(line.split(',').map((c) => c.trim()));
      } else {
        grid.push([line]);
      }
    }
  }

  return grid.length > 0 ? grid : [['No data']];
}

/**
 * Generates an uncompressed OpenXML Excel workbook (.xlsx).
 */
export function generateXlsxBlob(content: string, _sheetTitle?: string): Blob {
  const encoder = new TextEncoder();
  const grid = extractGridFromText(content);

  const rowXmlParts: string[] = [];
  grid.forEach((row, rowIdx) => {
    const rowNumber = rowIdx + 1;
    const cellXmlParts: string[] = [];

    row.forEach((cellValue, colIdx) => {
      const colLetter = toColumnLetter(colIdx);
      const cellRef = `${colLetter}${rowNumber}`;

      // Check if numeric
      const trimmed = cellValue.trim();
      const isNum = trimmed !== '' && !isNaN(Number(trimmed)) && !trimmed.startsWith('0') || trimmed === '0';

      if (isNum) {
        cellXmlParts.push(`<c r="${cellRef}"><v>${trimmed}</v></c>`);
      } else {
        cellXmlParts.push(
          `<c r="${cellRef}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(cellValue)}</t></is></c>`
        );
      }
    });

    rowXmlParts.push(`<row r="${rowNumber}">${cellXmlParts.join('')}</row>`);
  });

  const sheet1Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    ${rowXmlParts.join('\n    ')}
  </sheetData>
</worksheet>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Sheet1" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`;

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`;

  const entries: ZipEntry[] = [
    { path: '[Content_Types].xml', data: encoder.encode(contentTypesXml) },
    { path: '_rels/.rels', data: encoder.encode(rootRelsXml) },
    { path: 'xl/_rels/workbook.xml.rels', data: encoder.encode(workbookRelsXml) },
    { path: 'xl/workbook.xml', data: encoder.encode(workbookXml) },
    { path: 'xl/worksheets/sheet1.xml', data: encoder.encode(sheet1Xml) },
  ];

  const zipBlob = createStoreZip(entries);
  return new Blob([zipBlob], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/**
 * Generates CSV content with UTF-8 BOM and RFC 4180 escaping.
 * Mitigates Excel formula injection per T-QOX-04.
 */
export function generateCsvBlob(content: string): Blob {
  const grid = extractGridFromText(content);
  const csvLines: string[] = [];

  for (const row of grid) {
    const escapedRow = row.map((cell) => {
      let val = cell;
      // T-QOX-04: Prevent formula injection for dangerous leading characters
      if (/^[=+\-@]/.test(val)) {
        val = `'\t${val}`;
      }
      // RFC 4180 quotation escaping
      return `"${val.replace(/"/g, '""')}"`;
    });
    csvLines.push(escapedRow.join(','));
  }

  // Prepend UTF-8 BOM (﻿)
  const csvString = '﻿' + csvLines.join('\r\n');
  return new Blob([csvString], { type: 'text/csv;charset=utf-8' });
}

/**
 * Triggers client-side browser file download from Blob.
 */
export function downloadBlob(filename: string, blob: Blob): void {
  const cleanFilename = sanitizeFilename(filename);
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    try {
      const url = typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
        ? URL.createObjectURL(blob)
        : '';
      if (!url) return;
      const a = document.createElement('a');
      a.href = url;
      a.download = cleanFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // ignore cleanup errors in headless environments
        }
      }, 1000);
    } catch {
      // ignore jsdom / headless environments without Blob createObjectURL support
    }
  }
}

export interface SaveFilePickerOptions {
  title?: string;
  filters?: Array<{ name: string; extensions: string[] }>;
}

/**
 * Saves a file by prompting the user with a native or browser "Save As" location dialog.
 * Supports Tauri desktop native save dialog (with rfd on Windows/macOS/Linux),
 * modern Web File System Access API (showSaveFilePicker in Chrome/Edge),
 * and gracefully falls back to standard downloadBlob.
 */
export async function saveFileWithPicker(
  filename: string,
  blob: Blob,
  options?: SaveFilePickerOptions
): Promise<{ saved: boolean; path?: string }> {
  const cleanFilename = sanitizeFilename(filename);

  // 1. Desktop Tauri environment (native save dialog on Windows/macOS)
  if (isTauriApp()) {
    try {
      const buffer = await blob.arrayBuffer();
      const uint8 = new Uint8Array(buffer);
      const ext = cleanFilename.split('.').pop() || '';
      const filters =
        options?.filters ||
        (ext ? [{ name: ext.toUpperCase(), extensions: [ext] }] : undefined);

      const { invoke } = await import('@tauri-apps/api/core');
      const savedPath = await invoke<string | null>('save_file_dialog', {
        defaultName: cleanFilename,
        title: options?.title || 'Lưu tệp',
        filters,
        data: Array.from(uint8),
      });

      if (savedPath) {
        return { saved: true, path: savedPath };
      }
      return { saved: false }; // User cancelled the save dialog
    } catch (err) {
      console.warn(
        '[fileExport] Tauri save_file_dialog failed, falling back to downloadBlob:',
        err
      );
    }
  }

  // 2. Modern browser with showSaveFilePicker support
  if (
    typeof window !== 'undefined' &&
    'showSaveFilePicker' in window &&
    typeof (window as any).showSaveFilePicker === 'function'
  ) {
    try {
      const ext = cleanFilename.split('.').pop() || '';
      const mime = blob.type || 'application/octet-stream';
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: cleanFilename,
        types: ext
          ? [
              {
                description: `${ext.toUpperCase()} File`,
                accept: { [mime]: [`.${ext}`] },
              },
            ]
          : undefined,
      });

      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return { saved: true, path: cleanFilename };
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return { saved: false }; // User dismissed dialog
      }
      console.warn(
        '[fileExport] showSaveFilePicker failed, falling back to downloadBlob:',
        err
      );
    }
  }

  // 3. Fallback: classic anchor download
  downloadBlob(cleanFilename, blob);
  return { saved: true, path: cleanFilename };
}

/**
 * Unified file export and download helper for MD, TXT, DOCX, XLSX, and CSV.
 */
export function exportContentAsFile(
  content: string,
  filename: string,
  format?: ExportFormat,
  autoDownload: boolean = true
): FileExportResult {
  const cleanFilename = sanitizeFilename(filename);
  const resolvedFormat = format || inferFormatFromFilename(cleanFilename);

  let blob: Blob;

  switch (resolvedFormat) {
    case 'docx':
      blob = generateDocxBlob(content);
      break;
    case 'xlsx':
      blob = generateXlsxBlob(content);
      break;
    case 'csv':
      blob = generateCsvBlob(content);
      break;
    case 'txt':
      blob = new Blob([content || ''], { type: 'text/plain;charset=utf-8' });
      break;
    case 'md':
    default:
      blob = new Blob([content || ''], { type: 'text/markdown;charset=utf-8' });
      break;
  }

  // Ensure filename has proper extension
  let finalFilename = cleanFilename;
  const expectedExt = `.${resolvedFormat}`;
  if (!finalFilename.toLowerCase().endsWith(expectedExt)) {
    finalFilename = `${finalFilename}${expectedExt}`;
  }

  if (autoDownload) {
    downloadBlob(finalFilename, blob);
  }

  return {
    filename: finalFilename,
    format: resolvedFormat,
    sizeBytes: blob.size,
    blob,
  };
}
