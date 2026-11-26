import { describe, it, expect, vi, afterEach } from 'vitest';
import JSZip from 'jszip';
import {
  executeDynamicFileScript,
  generateXlsxBlobWithExcelJS,
  generateDocxBlobWithDocx,
  sanitizeScript,
  SCRIPT_TIMEOUT_MS,
  generateXlsxBlobFromGrid,
} from '../dynamicFileSandbox';

describe('dynamicFileSandbox', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sanitizes code fences from script', () => {
    const raw = '```javascript\nconst a = 1;\nreturn a;\n```';
    expect(sanitizeScript(raw)).toBe('const a = 1;\nreturn a;');
  });

  it('rejects a script that never resolves instead of hanging', async () => {
    vi.useFakeTimers();
    const pending = executeDynamicFileScript('await new Promise(() => {}); return new Blob([]);', 'txt');
    const assertion = expect(pending).rejects.toThrow(/60 giây/);
    await vi.advanceTimersByTimeAsync(SCRIPT_TIMEOUT_MS + 1000);
    await assertion;
  });

  it('generates xlsx blob using ExcelJS', async () => {
    const markdownTable = '| Task | Status | Hours |\n| UI Design | Done | 5 |\n| Backend | In Progress | 10 |';
    const blob = await generateXlsxBlobWithExcelJS(markdownTable, 'Tasks');
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(100);
    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  });

  it('generates xlsx from a real column/row grid without formula injection', async () => {
    const blob = await generateXlsxBlobFromGrid(
      ['ID', 'NAME'],
      [[1, 'Alice'], [2, '=HYPERLINK("http://evil")']],
      'Results'
    );
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(100);
  });

  it('generates docx blob using docx library', async () => {
    const markdown = '# Project Title\n## Overview\nThis is a *styled* document with **bold** text.\n\n- Point 1\n- Point 2\n\n```ts\nconst x = 1;\n```\n\n> Important quote';
    const blob = await generateDocxBlobWithDocx(markdown);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(100);
  });

  it('embeds a real PNG image in DOCX and uses it as caption', async () => {
    const png = Uint8Array.from(
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64'
      )
    );
    const src = 'data:image/png;base64,TEST';
    const images = new Map([
      [src, { data: png, extension: 'png' as const, alt: 'Minimal', width: 1, height: 1 }],
    ]);
    const blob = await generateDocxBlobWithDocx(`# Report\n![Minimal](${src})`, undefined, images);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const media = Object.keys(zip.files).filter((name) => name.startsWith('word/media/'));
    expect(media.length).toBeGreaterThan(0);
    const documentXml = await zip.file('word/document.xml')!.async('string');
    expect(documentXml).toContain('<w:drawing');
    expect(documentXml).toContain('Minimal');
  });

  it('keeps alt text when image source is missing from the map', async () => {
    const blob = await generateDocxBlobWithDocx('![Fallback](file:///secret)');
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(Object.keys(zip.files).some((name) => name.startsWith('word/media/'))).toBe(false);
    const documentXml = await zip.file('word/document.xml')!.async('string');
    expect(documentXml).toContain('Fallback');
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
