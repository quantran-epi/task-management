import { describe, it, expect } from 'vitest';
import {
  executeDynamicFileScript,
  generateXlsxBlobWithExcelJS,
  generateDocxBlobWithDocx,
  sanitizeScript,
} from '../dynamicFileSandbox';

describe('dynamicFileSandbox', () => {
  it('sanitizes code fences from script', () => {
    const raw = '```javascript\nconst a = 1;\nreturn a;\n```';
    expect(sanitizeScript(raw)).toBe('const a = 1;\nreturn a;');
  });

  it('generates xlsx blob using ExcelJS', async () => {
    const markdownTable = '| Task | Status | Hours |\n| UI Design | Done | 5 |\n| Backend | In Progress | 10 |';
    const blob = await generateXlsxBlobWithExcelJS(markdownTable, 'Tasks');
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(100);
    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  });

  it('generates docx blob using docx library', async () => {
    const markdown = '# Project Title\n## Overview\nThis is a *styled* document with **bold** text.\n\n- Point 1\n- Point 2\n\n```ts\nconst x = 1;\n```\n\n> Important quote';
    const blob = await generateDocxBlobWithDocx(markdown);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(100);
  });

  it('executes dynamic script returning an ExcelJS workbook', async () => {
    const script = `
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Custom');
      ws.addRow(['Title', 'Priority', 'Score']);
      ws.addRow(['Fix login', 'High', 95]);
      return wb;
    `;
    const blob = await executeDynamicFileScript(script, 'xlsx');
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(100);
  });

  it('executes dynamic script returning a docx Document', async () => {
    const script = `
      const doc = new docx.Document({
        sections: [{
          children: [
            new docx.Paragraph({ text: 'Dynamic Header', heading: docx.HeadingLevel.HEADING_1 }),
            new docx.Paragraph({ text: 'Generated via AI script execution' })
          ]
        }]
      });
      return doc;
    `;
    const blob = await executeDynamicFileScript(script, 'docx');
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(100);
  });

  it('executes dynamic script returning a pptxgen presentation', async () => {
    const script = `
      const pptx = new pptxgen();
      const slide = pptx.addSlide();
      slide.addText('Dynamic PPTX', { x: 1, y: 1, fontSize: 32 });
      return pptx;
    `;
    const blob = await executeDynamicFileScript(script, 'pptx');
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(100);
  });
});
