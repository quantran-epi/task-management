/**
 * Dynamic Browser Sandbox for AI-generated document creation.
 * Allows AI to execute JavaScript code in the browser using rich client libraries:
 * - ExcelJS (for professional spreadsheets with styles, formulas, and auto-column widths)
 * - docx (for Word documents with headers, tables, code blocks, and typography)
 * - pptxgenjs (for PowerPoint decks with stylized slides, layouts, and tables)
 */

import ExcelJS from 'exceljs';
import * as docx from 'docx';
import pptxgen from 'pptxgenjs';
import { extractGridFromText, parseMarkdownTable, type ExportFormat } from './fileExport';

export interface DynamicSandboxResult {
  blob: Blob;
  sizeBytes: number;
}

/**
 * Strips code fences (e.g. ```javascript ... ```) if script is wrapped in markdown.
 */
export function sanitizeScript(script: string): string {
  let clean = (script || '').trim();
  if (clean.startsWith('```')) {
    clean = clean.replace(/^```(?:[a-zA-Z0-9_-]+)?\n/, '').replace(/\n```$/, '');
  }
  return clean.trim();
}

/**
 * Runs a dynamic JavaScript script provided by AI inside a browser sandbox.
 * Returns the resulting binary Blob.
 */
export async function executeDynamicFileScript(
  script: string,
  format: ExportFormat,
  _filename?: string
): Promise<Blob> {
  const cleanScript = sanitizeScript(script);
  if (!cleanScript) {
    throw new Error('Script is empty');
  }

  // Define AsyncFunction constructor
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const runner = new AsyncFunction(
    'ExcelJS',
    'docx',
    'pptxgen',
    'extractGridFromText',
    cleanScript
  );

  const result = await runner(ExcelJS, docx, pptxgen, extractGridFromText);

  if (!result) {
    throw new Error('Script did not return a document, workbook, presentation, or Blob');
  }

  // 1. Result is already a Blob
  if (result instanceof Blob) {
    return result;
  }

  // 2. Result is an ExcelJS Workbook
  if (result.xlsx && typeof result.xlsx.writeBuffer === 'function') {
    const buffer = await result.xlsx.writeBuffer();
    return new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  }

  // 3. Result is a docx Document
  if (result instanceof docx.Document) {
    return await docx.Packer.toBlob(result);
  }

  // 4. Result is a PptxGenJS instance
  if (typeof result.write === 'function') {
    const blob = await result.write({ outputType: 'blob' });
    return blob as Blob;
  }

  // 5. Result is an ArrayBuffer / Uint8Array
  if (result instanceof ArrayBuffer || ArrayBuffer.isView(result)) {
    let mimeType = 'application/octet-stream';
    if (format === 'docx') {
      mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    } else if (format === 'xlsx') {
      mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    } else if (format === 'pptx') {
      mimeType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    }
    return new Blob([result as any], { type: mimeType });
  }

  throw new Error(
    `Unsupported script return type: ${typeof result}. Return an ExcelJS Workbook, docx Document, pptxgen instance, or Blob.`
  );
}

/**
 * Converts text/markdown table into a styled Excel workbook (.xlsx) using ExcelJS.
 */
export async function generateXlsxBlobWithExcelJS(
  content: string,
  sheetTitle?: string
): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetTitle || 'Sheet1');
  const grid: string[][] = extractGridFromText(content);

  grid.forEach((row: string[], rowIdx: number) => {
    const convertedRow = row.map((cell: string) => {
      const trimmed = cell.trim();
      const isNum =
        (trimmed !== '' && !isNaN(Number(trimmed)) && !trimmed.startsWith('0')) ||
        trimmed === '0';
      return isNum ? Number(trimmed) : cell;
    });

    const worksheetRow = worksheet.addRow(convertedRow);

    if (rowIdx === 0) {
      // Header styling: bold, light gray fill, bottom border
      worksheetRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FF1E293B' }, size: 11 };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF1F5F9' },
        };
        cell.border = {
          bottom: { style: 'medium', color: { argb: 'FF94A3B8' } },
        };
      });
    } else {
      worksheetRow.eachCell((cell) => {
        cell.border = {
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        };
      });
    }
  });

  // Auto-fit column widths
  worksheet.columns.forEach((column) => {
    let maxLen = 12;
    column.eachCell?.({ includeEmpty: true }, (cell) => {
      const val = cell.value !== undefined && cell.value !== null ? String(cell.value) : '';
      if (val.length > maxLen) {
        maxLen = Math.min(60, val.length + 3);
      }
    });
    column.width = maxLen;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/**
 * Converts markdown text into a styled Word document (.docx) using docx library.
 */
export async function generateDocxBlobWithDocx(
  content: string,
  _title?: string
): Promise<Blob> {
  const lines = (content || '').split('\n');
  const children: (docx.Paragraph | docx.Table)[] = [];

  let i = 0;
  while (i < lines.length) {
    const rawLine = lines[i]!;
    const line = rawLine.trim();

    if (!line) {
      children.push(new docx.Paragraph({ spacing: { after: 120 } }));
      i++;
      continue;
    }

    // Code block detection
    if (line.startsWith('```')) {
      i++;
      const codeLines: string[] = [];
      while (i < lines.length && !lines[i]!.trim().startsWith('```')) {
        codeLines.push(lines[i]!);
        i++;
      }
      if (i < lines.length && lines[i]!.trim().startsWith('```')) {
        i++;
      }
      for (const cLine of codeLines) {
        children.push(
          new docx.Paragraph({
            children: [
              new docx.TextRun({
                text: cLine,
                font: 'Consolas',
                size: 20,
                color: '1F2937',
              }),
            ],
            shading: { type: docx.ShadingType.CLEAR, fill: 'F3F4F6' },
            indent: { left: 240, right: 240 },
            spacing: { after: 40 },
          })
        );
      }
      continue;
    }

    // Blockquote detection
    if (line.startsWith('>')) {
      const quoteText = line.replace(/^>\s*/, '');
      children.push(
        new docx.Paragraph({
          children: [new docx.TextRun({ text: quoteText, italics: true, color: '4B5563' })],
          border: {
            left: {
              color: '6366F1',
              space: 8,
              style: docx.BorderStyle.SINGLE,
              size: 18,
            },
          },
          indent: { left: 240 },
          spacing: { after: 100 },
        })
      );
      i++;
      continue;
    }

    // Table detection: line contains '|'
    if (
      line.startsWith('|') ||
      (line.includes('|') && i + 1 < lines.length && lines[i + 1]!.includes('-|-'))
    ) {
      const { rows, nextIdx } = parseMarkdownTable(lines, i);
      if (rows.length > 0) {
        const tableRows = rows.map((rowCells: string[], rowIdx: number) => {
          const isHeader = rowIdx === 0;
          return new docx.TableRow({
            children: rowCells.map((cellText: string) => {
              return new docx.TableCell({
                children: [
                  new docx.Paragraph({
                    children: [
                      new docx.TextRun({
                        text: cellText,
                        bold: isHeader,
                        color: isHeader ? '111827' : '1F2937',
                      }),
                    ],
                  }),
                ],
                ...(isHeader
                  ? { shading: { type: docx.ShadingType.CLEAR, fill: 'F1F5F9' } }
                  : {}),
                margins: { top: 120, bottom: 120, left: 160, right: 160 },
              });
            }),
          });
        });

        children.push(
          new docx.Table({
            width: { size: 100, type: docx.WidthType.PERCENTAGE },
            rows: tableRows,
          })
        );
      }
      i = nextIdx;
      continue;
    }

    // Heading 1: # Title
    if (line.startsWith('# ')) {
      children.push(
        new docx.Paragraph({
          text: line.slice(2).trim(),
          heading: docx.HeadingLevel.HEADING_1,
          spacing: { before: 240, after: 120 },
        })
      );
      i++;
      continue;
    }

    // Heading 2: ## Title
    if (line.startsWith('## ')) {
      children.push(
        new docx.Paragraph({
          text: line.slice(3).trim(),
          heading: docx.HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 100 },
        })
      );
      i++;
      continue;
    }

    // Heading 3: ### Title
    if (line.startsWith('### ')) {
      children.push(
        new docx.Paragraph({
          text: line.slice(4).trim(),
          heading: docx.HeadingLevel.HEADING_3,
          spacing: { before: 160, after: 80 },
        })
      );
      i++;
      continue;
    }

    // Bullet points: - item, * item, 1. item
    const bulletMatch = line.match(/^[-*]\s+(.*)$/) || line.match(/^\d+\.\s+(.*)$/);
    if (bulletMatch && bulletMatch[1]) {
      children.push(
        new docx.Paragraph({
          text: bulletMatch[1],
          bullet: { level: 0 },
          spacing: { after: 80 },
        })
      );
      i++;
      continue;
    }

    // Standard paragraph with bold/italic inline parsing
    const textRuns: docx.TextRun[] = [];
    const parts = line.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
    for (const part of parts) {
      if (!part) continue;
      if (part.startsWith('**') && part.endsWith('**')) {
        textRuns.push(new docx.TextRun({ text: part.slice(2, -2), bold: true }));
      } else if (part.startsWith('*') && part.endsWith('*')) {
        textRuns.push(new docx.TextRun({ text: part.slice(1, -1), italics: true }));
      } else {
        textRuns.push(new docx.TextRun({ text: part }));
      }
    }

    children.push(new docx.Paragraph({ children: textRuns, spacing: { after: 120 } }));
    i++;
  }

  const doc = new docx.Document({
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });

  return await docx.Packer.toBlob(doc);
}
