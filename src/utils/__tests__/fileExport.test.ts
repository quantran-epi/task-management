import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  exportContentAsFile,
  inferFormatFromFilename,
  sanitizeFilename,
  generateDocxBlob,
  generateXlsxBlob,
  generateCsvBlob,
  downloadBlob,
  saveFileWithPicker,
} from '../fileExport';
import { APP_NAME } from '../../constants/app';

describe('fileExport', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('inferFormatFromFilename', () => {
    it('detects format from extensions correctly', () => {
      expect(inferFormatFromFilename('report.docx')).toBe('docx');
      expect(inferFormatFromFilename('data.XLSX')).toBe('xlsx');
      expect(inferFormatFromFilename('sheet.csv')).toBe('csv');
      expect(inferFormatFromFilename('notes.MD')).toBe('md');
      expect(inferFormatFromFilename('readme.txt')).toBe('txt');
    });

    it('falls back to md for unknown or missing extension', () => {
      expect(inferFormatFromFilename('unknown_file')).toBe('md');
      expect(inferFormatFromFilename('file.pdf')).toBe('md');
    });
  });

  describe('sanitizeFilename', () => {
    it('strips directory traversal and illegal characters', () => {
      expect(sanitizeFilename('../secret/report?.docx')).toBe('secret_report_.docx');
      expect(sanitizeFilename('..\\windows\\bad:file*name.xlsx')).toBe('windows_bad_file_name.xlsx');
      expect(sanitizeFilename('   ')).toBe('download');
    });
  });

  describe('generateCsvBlob', () => {
    it('generates valid CSV with UTF-8 BOM and RFC 4180 escaping', async () => {
      const markdownTable = `| Name | Notes | Count |
| "Special" Alpha | Hello, World | 10 |
| Beta | Normal | 20 |`;

      const blob = generateCsvBlob(markdownTable);
      expect(blob.type).toContain('text/csv');

      const buffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(buffer);

      // Verify UTF-8 BOM: 0xEF, 0xBB, 0xBF
      expect(bytes[0]).toBe(0xef);
      expect(bytes[1]).toBe(0xbb);
      expect(bytes[2]).toBe(0xbf);

      const text = new TextDecoder('utf-8').decode(bytes);
      expect(text).toContain('"Name","Notes","Count"');
      expect(text).toContain('"""Special"" Alpha","Hello, World","10"');
      expect(text).toContain('"Beta","Normal","20"');
    });

    it('escapes dangerous leading formula characters in CSV per T-QOX-04', async () => {
      const table = `| Code | Value |
| =1+2 | @formula |`;
      const blob = generateCsvBlob(table);
      const text = await blob.text();
      expect(text).toContain("'\t=1+2");
      expect(text).toContain("'\t@formula");
    });
  });

  describe('generateDocxBlob', () => {
    it('generates valid uncompressed OpenXML Word ZIP with PK header', async () => {
      const content = `# Project Overview

This is an introduction paragraph with **bold text** and *italic words*.

## Milestones

- Milestone 1: Core setup
- Milestone 2: Release

| ID | Task | Status |
| 1 | Setup | Done |
| 2 | Testing | Pending |
`;
      const blob = generateDocxBlob(content, 'Test Document');
      expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');

      const buffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(buffer);

      // ZIP local file header signature: 0x50, 0x4B, 0x03, 0x04 ("PK\x03\x04")
      expect(bytes[0]).toBe(0x50);
      expect(bytes[1]).toBe(0x4b);
      expect(bytes[2]).toBe(0x03);
      expect(bytes[3]).toBe(0x04);

      // TextDecoder check for OpenXML inner paths
      const text = new TextDecoder('utf-8').decode(bytes);
      expect(text).toContain('[Content_Types].xml');
      expect(text).toContain('word/document.xml');
      expect(text).toContain('_rels/.rels');
      expect(text).toContain('Project Overview');
      expect(text).toContain('bold text');
      expect(text).toContain('Milestone 1');
      expect(text).toContain('Testing');
    });
  });

  describe('generateXlsxBlob', () => {
    it('generates valid uncompressed OpenXML Excel ZIP with PK header from markdown table', async () => {
      const table = `| Project | Estimate | Hours |
| ${APP_NAME} | 100 | 45 |
| Website | 50 | 20 |`;

      const blob = generateXlsxBlob(table, 'Workload');
      expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

      const buffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(buffer);

      // ZIP signature
      expect(bytes[0]).toBe(0x50);
      expect(bytes[1]).toBe(0x4b);
      expect(bytes[2]).toBe(0x03);
      expect(bytes[3]).toBe(0x04);

      const text = new TextDecoder('utf-8').decode(bytes);
      expect(text).toContain('[Content_Types].xml');
      expect(text).toContain('xl/workbook.xml');
      expect(text).toContain('xl/worksheets/sheet1.xml');
      expect(text).toContain(APP_NAME);
      expect(text).toContain('Website');
    });

    it('generates single-column spreadsheet if text is not a table', async () => {
      const lines = `First line
Second line
Third line`;
      const blob = generateXlsxBlob(lines);
      const text = await blob.text();
      expect(text).toContain('First line');
      expect(text).toContain('Third line');
    });
  });

  describe('exportContentAsFile', () => {
    it('exports MD and TXT directly', async () => {
      const mdResult = await exportContentAsFile('# Test', 'sample.md');
      expect(mdResult.format).toBe('md');
      expect(mdResult.filename).toBe('sample.md');
      expect(mdResult.blob.type).toContain('text/markdown');

      const txtResult = await exportContentAsFile('Hello text', 'sample.txt');
      expect(txtResult.format).toBe('txt');
      expect(txtResult.filename).toBe('sample.txt');
      expect(txtResult.blob.type).toContain('text/plain');
    });

    it('exports DOCX and XLSX correctly', async () => {
      const docx = await exportContentAsFile('# Report\nContent', 'report.docx');
      expect(docx.format).toBe('docx');
      expect(docx.sizeBytes).toBeGreaterThan(100);

      const xlsx = await exportContentAsFile('| A | B |\n| 1 | 2 |', 'table.xlsx');
      expect(xlsx.format).toBe('xlsx');
      expect(xlsx.sizeBytes).toBeGreaterThan(100);
    });

    it('calls downloadBlob when in browser environment', () => {
      const clickMock = vi.fn();
      const appendMock = vi.fn();
      const removeMock = vi.fn();

      const origCreateElement = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        if (tag === 'a') {
          return {
            set href(_v: string) {},
            set download(_v: string) {},
            click: clickMock,
          } as unknown as HTMLElement;
        }
        return origCreateElement(tag);
      });
      vi.spyOn(document.body, 'appendChild').mockImplementation(appendMock as any);
      vi.spyOn(document.body, 'removeChild').mockImplementation(removeMock as any);
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

      const blob = new Blob(['test']);
      downloadBlob('test.txt', blob);

      expect(clickMock).toHaveBeenCalled();
    });
  });

  describe('saveFileWithPicker', () => {
    it('uses window.showSaveFilePicker when available in browser', async () => {
      const mockWritable = {
        write: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      };
      const mockHandle = {
        createWritable: vi.fn().mockResolvedValue(mockWritable),
      };
      (window as any).showSaveFilePicker = vi.fn().mockResolvedValue(mockHandle);

      const blob = new Blob(['sample content'], { type: 'text/plain' });
      const res = await saveFileWithPicker('test.txt', blob);

      expect(res.saved).toBe(true);
      expect((window as any).showSaveFilePicker).toHaveBeenCalledWith(
        expect.objectContaining({ suggestedName: 'test.txt' })
      );
      expect(mockWritable.write).toHaveBeenCalledWith(blob);
      expect(mockWritable.close).toHaveBeenCalled();

      delete (window as any).showSaveFilePicker;
    });

    it('gracefully handles user cancellation with AbortError', async () => {
      const abortErr = new Error('The user aborted a request.');
      abortErr.name = 'AbortError';
      (window as any).showSaveFilePicker = vi.fn().mockRejectedValue(abortErr);

      const blob = new Blob(['content']);
      const res = await saveFileWithPicker('cancelled.docx', blob);

      expect(res.saved).toBe(false);
      delete (window as any).showSaveFilePicker;
    });
  });
});
