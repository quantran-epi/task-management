import { describe, it, expect, vi, beforeEach } from 'vitest';

const { extractRawTextMock, xlsxLoadMock, getDocumentMock, eachRowMock, eachSheetMock } = vi.hoisted(() => ({
  extractRawTextMock: vi.fn(),
  xlsxLoadMock: vi.fn(),
  getDocumentMock: vi.fn(),
  eachRowMock: vi.fn(),
  eachSheetMock: vi.fn(),
}));

vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'pdf.worker.mock.mjs' }));

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: getDocumentMock,
}));

vi.mock('mammoth', () => ({ default: { extractRawText: extractRawTextMock } }));

vi.mock('exceljs', () => {
  class Workbook {
    xlsx = { load: xlsxLoadMock };
    eachSheet = eachSheetMock;
  }
  return { default: { Workbook }, Workbook };
});

import {
  parseSshDocument,
  type ParsedDocument,
} from '../sshDocumentParser';

/** Distinct byte payloads so parser call arguments can be asserted precisely. */
function offsetBuffer(bytes: number[]): ArrayBuffer {
  const backing = new Uint8Array(bytes.length + 5);
  backing.set(bytes, 5);
  return backing.buffer.slice(5, 5 + bytes.length);
}

describe('sshDocumentParser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    eachRowMock.mockImplementation((cb: (row: { values: Array<null | { result?: string }> }) => void) => {
      // ExcelJS row.values is 1-indexed: index 0 is the sparse hole.
      cb({ values: [null, { result: 'A1' }, { result: 'B1' }] });
    });
  });

  it('parses docx via mammoth extractRawText with [DOCX] header', async () => {
    extractRawTextMock.mockResolvedValue({ value: 'Dòng 1\nDòng 2' });
    const result: ParsedDocument = await parseSshDocument(offsetBuffer([1, 2, 3]), 'report.docx');

    expect(result.format).toBe('docx');
    expect(result.text).toContain('[DOCX]');
    expect(result.text).toContain('Dòng 1');
    expect(result.truncated).toBe(false);
    expect(extractRawTextMock).toHaveBeenCalledTimes(1);
    const arg = extractRawTextMock.mock.calls[0]![0] as { arrayBuffer: ArrayBuffer };
    expect(Array.from(new Uint8Array(arg.arrayBuffer))).toEqual([1, 2, 3]);
  });

  it('parses xlsx via exceljs into per-sheet sections with sheetCount', async () => {
    xlsxLoadMock.mockResolvedValue(undefined);
    eachSheetMock.mockImplementation((cb: (ws: { name: string; eachRow: typeof eachRowMock }) => void) => {
      cb({ name: 'Sheet1', eachRow: eachRowMock });
      cb({ name: 'Sheet2', eachRow: eachRowMock });
    });

    const result = await parseSshDocument(offsetBuffer([4, 5]), 'data.xlsx');

    expect(result.format).toBe('xlsx');
    expect(result.metadata.sheetCount).toBe(2);
    expect(result.text).toContain('=== Sheet: Sheet1 ===');
    expect(result.text).toContain('=== Sheet: Sheet2 ===');
    expect(result.text).toContain('A1 | B1');
    const loaded = xlsxLoadMock.mock.calls[0]![0] as Uint8Array;
    expect(Array.from(loaded)).toEqual([4, 5]);
  });

  it('parses pdf text layer per page with pageCount', async () => {
    const getTextContent = vi.fn()
      .mockResolvedValueOnce({ items: [{ str: 'Trang 1' }] })
      .mockResolvedValueOnce({ items: [{ str: 'Trang 2' }] });
    getDocumentMock.mockReturnValue({
      promise: Promise.resolve({
        numPages: 2,
        getPage: vi.fn().mockResolvedValue({ getTextContent, cleanup: vi.fn() }),
      }),
      destroy: vi.fn().mockResolvedValue(undefined),
    });

    const result = await parseSshDocument(offsetBuffer([6, 7]), 'scan.pdf');

    expect(result.format).toBe('pdf');
    expect(result.metadata.pageCount).toBe(2);
    expect(result.text).toContain('Trang 1');
    expect(result.text).toContain('Trang 2');
  });

  it('returns empty text with a scan note when PDF has no text layer', async () => {
    getDocumentMock.mockReturnValue({
      promise: Promise.resolve({
        numPages: 1,
        getPage: vi.fn().mockResolvedValue({
          getTextContent: vi.fn().mockResolvedValue({ items: [] }),
          cleanup: vi.fn(),
        }),
      }),
      destroy: vi.fn().mockResolvedValue(undefined),
    });

    const result = await parseSshDocument(new ArrayBuffer(2), 'scan.pdf');

    expect(result.text).toBe('');
    expect(result.metadata.note).toContain('không hỗ trợ OCR');
  });

  it('rejects unsupported extensions with a Vietnamese error', async () => {
    await expect(parseSshDocument(new ArrayBuffer(1), 'notes.txt')).rejects.toThrow(/docx|xlsx|pdf/);
  });

  it('caps output at 24000 chars with truncated flag and notice', async () => {
    extractRawTextMock.mockResolvedValue({ value: 'X'.repeat(30_000) });
    const result = await parseSshDocument(new ArrayBuffer(2), 'long.docx', 100);

    expect(result.truncated).toBe(true);
    expect(result.text).toContain('vượt quá 100 ký tự');
    expect(result.text.length).toBeLessThanOrEqual(100 + 60);
  });

});
