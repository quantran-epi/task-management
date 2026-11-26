import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  extractRawTextMock,
  xlsxLoadMock,
  getDocumentMock,
  eachRowMock,
  eachSheetMock,
  jsZipLoadMock,
  workbookStateMock,
} = vi.hoisted(() => ({
  extractRawTextMock: vi.fn(),
  xlsxLoadMock: vi.fn(),
  getDocumentMock: vi.fn(),
  eachRowMock: vi.fn(),
  eachSheetMock: vi.fn(),
  jsZipLoadMock: vi.fn(),
  workbookStateMock: { worksheets: [] as any[] },
}));

vi.mock('jszip', () => ({ default: { loadAsync: jsZipLoadMock } }));

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
  getSshDocumentInfo,
  parseSshDocument,
  readSshDocumentRegion,
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
    jsZipLoadMock.mockReset();
    xlsxLoadMock.mockReset();
    extractRawTextMock.mockReset();
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

  describe('progressive document API', () => {
    function mockPdf(pageTexts: string[], options?: { proxyDestroy?: boolean }) {
      const proxyDestroy = vi.fn().mockResolvedValue(undefined);
      const loadingTaskDestroy = vi.fn().mockResolvedValue(undefined);
      const getPage = vi.fn(async (pageNo: number) => ({
        getTextContent: vi.fn().mockResolvedValue({ items: [{ str: pageTexts[pageNo - 1] ?? '' }] }),
        cleanup: vi.fn(),
      }));
      getDocumentMock.mockImplementation(() => ({
        promise: Promise.resolve({
          numPages: pageTexts.length,
          getPage,
          ...(options?.proxyDestroy === false ? {} : { destroy: proxyDestroy }),
        }),
        destroy: loadingTaskDestroy,
      }));
      return { getPage, proxyDestroy, loadingTaskDestroy };
    }

    function mockWorkbook(sheets: Record<string, string[][]>) {
      const worksheets = Object.entries(sheets).map(([name, rows]) => ({
        name,
        rowCount: rows.length,
        columnCount: Math.max(0, ...rows.map((r) => r.length)),
        getCell: (row: number, col: number) => ({ value: rows[row - 1]?.[col - 1] ?? null }),
      }));
      workbookStateMock.worksheets = worksheets;
      eachSheetMock.mockImplementation((cb: (ws: (typeof worksheets)[number]) => void) => worksheets.forEach(cb));
    }

    it('info returns format/size/counts with a next-range hint without OCR', async () => {
      mockPdf(['Trang 1', 'Trang 2']);
      const pdfInfo = await getSshDocumentInfo(offsetBuffer([1, 2, 3]), 'scan.pdf');
      expect(pdfInfo).toMatchObject({ format: 'pdf', sizeBytes: 3, pageCount: 2 });
      expect(pdfInfo.nextRange).toMatchObject({ pageStart: 1, pageCount: 2 });
      expect(pdfInfo.note).toBeUndefined();

      mockWorkbook({ Data: [['A1', 'B1'], ['A2', 'B2']] });
      const xlsxInfo = await getSshDocumentInfo(offsetBuffer([4, 5]), 'data.xlsx');
      expect(xlsxInfo).toMatchObject({ format: 'xlsx', sizeBytes: 2, sheetCount: 1 });
      expect(xlsxInfo.sheets).toEqual([{ name: 'Data', rowCount: 2, columnCount: 2 }]);
      expect(xlsxInfo.nextRange).toMatchObject({ sheet: 'Data', rowStart: 1, rowCount: 2 });

      jsZipLoadMock.mockImplementation(async () => ({
        file: vi.fn().mockResolvedValue({
          async: vi.fn().mockResolvedValue('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Test</w:t></w:r></w:p></w:body></w:document>'),
        }),
      }));
      const docxInfo = await getSshDocumentInfo(offsetBuffer([6]), 'report.docx');
      expect(docxInfo).toMatchObject({ format: 'docx', sizeBytes: 1 });
      expect(docxInfo.nextRange).toMatchObject({ blockStart: 1 });
    });

    it('reads only the requested PDF pages and rejects pageCount > 20', async () => {
      const { getPage, proxyDestroy } = mockPdf(Array.from({ length: 25 }, (_, i) => `Trang ${i + 1}`));
      const region = await readSshDocumentRegion(new ArrayBuffer(2), 'scan.pdf', {
        pageStart: 3,
        pageCount: 2,
      });
      expect(getPage).toHaveBeenCalledTimes(2);
      expect(getPage).toHaveBeenCalledWith(3);
      expect(getPage).toHaveBeenCalledWith(4);
      expect(region.text).toContain('Trang 3');
      expect(region.text).toContain('Trang 4');
      expect(region.text).not.toContain('Trang 5');
      expect(region.format).toBe('pdf');
      expect(proxyDestroy).toHaveBeenCalledTimes(1);

      const callsBefore = getDocumentMock.mock.calls.length;
      await expect(
        readSshDocumentRegion(new ArrayBuffer(2), 'scan.pdf', { pageStart: 1, pageCount: 21 }),
      ).rejects.toThrow(/20/);
      expect(getPage).toHaveBeenCalledTimes(2);
      expect(getDocumentMock).toHaveBeenCalledTimes(callsBefore);

      const noProxyDestroy = mockPdf([''], { proxyDestroy: false });
      await getSshDocumentInfo(new ArrayBuffer(2), 'scan.pdf');
      expect(noProxyDestroy.loadingTaskDestroy).toHaveBeenCalledTimes(1);

      mockPdf(['']);
      const scan = await readSshDocumentRegion(new ArrayBuffer(2), 'scan.pdf', {
        pageStart: 1,
        pageCount: 1,
      });
      expect(scan.note).toContain('không hỗ trợ OCR');
    });

    it('reads only requested XLSX sheet rows and columns', async () => {
      mockWorkbook({
        Data: [['A1', 'B1', 'C1'], ['A2', 'B2', 'C2'], ['A3', 'B3', 'C3']],
        Other: [['Z1']],
      });
      const region = await readSshDocumentRegion(new ArrayBuffer(2), 'data.xlsx', {
        sheet: 'Data',
        rowStart: 2,
        rowCount: 2,
        colStart: 2,
        colCount: 2,
      });
      expect(region.text).toContain('B2 | C2');
      expect(region.text).toContain('B3 | C3');
      expect(region.text).not.toContain('A2');
      expect(region.text).not.toContain('Z1');
      expect(region.truncated).toBe(false);
    });

    it('builds DOCX block index from word/document.xml with mammoth fallback', async () => {
      const xml = '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Đoạn một</w:t></w:r></w:p><w:p><w:r><w:t>Đoạn hai</w:t></w:r></w:p></w:body></w:document>';
      const zipFile = vi.fn().mockReturnValue({ async: vi.fn().mockResolvedValue(xml) });
      jsZipLoadMock.mockImplementation(async () => ({ file: zipFile }));
      extractRawTextMock.mockResolvedValue({ value: 'FALLBACK' });

      const region = await readSshDocumentRegion(new ArrayBuffer(2), 'report.docx', {
        blockStart: 1,
        blockCount: 1,
      });
      expect(zipFile).toHaveBeenCalledWith('word/document.xml');
      const primaryCalls = extractRawTextMock.mock.calls.length;
      expect(primaryCalls).toBe(0);
      expect(region.text).toContain('Đoạn một');
      expect(region.text).not.toContain('Đoạn hai');
      expect(region.blockCount).toBe(2);

      jsZipLoadMock.mockRejectedValue(new Error('zip hỏng'));
      const fallback = await readSshDocumentRegion(new ArrayBuffer(2), 'report.docx', {
        blockStart: 1,
        blockCount: 1,
      });
      expect(extractRawTextMock).toHaveBeenCalledTimes(primaryCalls + 1);
      expect(fallback.text).toContain('FALLBACK');
    });
  });
});
