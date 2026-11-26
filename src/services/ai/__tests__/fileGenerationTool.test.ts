import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AI_DATABASE_TOOLS, executeAiTool } from '../aiTools';
import * as fileExportModule from '../../../utils/fileExport';

describe('aiTools generate_file', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('registers generate_file tool definition in AI_DATABASE_TOOLS with required parameters', () => {
    const tool = AI_DATABASE_TOOLS.find((t) => t.function.name === 'generate_file');
    expect(tool).toBeDefined();
    expect(tool?.function.description).toContain('file');

    const props = tool?.function.parameters.properties;
    expect(props?.filename).toBeDefined();
    expect(props?.content).toBeDefined();
    expect(props?.script).toBeDefined();
    expect(props?.format).toBeDefined();
    expect(props?.format?.enum).toEqual(['md', 'txt', 'docx', 'xlsx', 'csv', 'pptx']);
    expect(tool?.function.parameters.required).toContain('filename');
  });

  it('rejects execution when filename or content/script is missing', async () => {
    const fakeDb = {} as any;
    const resNoFilename = await executeAiTool('generate_file', { content: 'hello' }, fakeDb);
    expect(JSON.parse(resNoFilename)).toEqual({ error: 'filename and either content or script are required' });

    const resNoContent = await executeAiTool('generate_file', { filename: 'test.docx' }, fakeDb);
    expect(JSON.parse(resNoContent)).toEqual({ error: 'filename and either content or script are required' });
  });

  it('executes generate_file with dynamic script and returns success payload', async () => {
    const fakeDb = {} as any;
    const script = `
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Sales');
      ws.addRow(['Product', 'Revenue']);
      ws.addRow(['TaskMate Pro', 5000]);
      return wb;
    `;

    const resultStr = await executeAiTool(
      'generate_file',
      {
        filename: 'sales.xlsx',
        script,
      },
      fakeDb
    );

    const result = JSON.parse(resultStr);
    expect(result.success).toBe(true);
    expect(result.filename).toBe('sales.xlsx');
    expect(result.format).toBe('xlsx');
    expect(result.sizeBytes).toBeGreaterThan(100);
    expect(result.content).toBe(script);
  });

  it('executes generate_file for docx and returns success payload with file metadata', async () => {
    const fakeDb = {} as any;
    const exportSpy = vi.spyOn(fileExportModule, 'exportContentAsFile');

    const resultStr = await executeAiTool(
      'generate_file',
      {
        filename: 'project-report.docx',
        content: '# Project Report\nEverything is on schedule.',
      },
      fakeDb
    );

    expect(exportSpy).toHaveBeenCalledWith(
      '# Project Report\nEverything is on schedule.',
      'project-report.docx',
      'docx',
      false,
      undefined
    );

    const result = JSON.parse(resultStr);
    expect(result.success).toBe(true);
    expect(result.filename).toBe('project-report.docx');
    expect(result.format).toBe('docx');
    expect(result.sizeBytes).toBeGreaterThan(100);
    expect(result.message).toContain('project-report.docx');
  });

  it('resolves image markdown before DOCX export and advertises image orchestration', async () => {
    const exportSpy = vi.spyOn(fileExportModule, 'exportContentAsFile');
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const content = `# Report\n![illustration](${png})`;
    await executeAiTool('generate_file', { filename: 'report.docx', content }, {} as any);
    expect(exportSpy).toHaveBeenCalledWith(
      content,
      'report.docx',
      'docx',
      false,
      expect.any(Map)
    );
    const images = exportSpy.mock.calls[0]![4]!;
    expect(images.get(png)?.extension).toBe('png');

    const generateFile = AI_DATABASE_TOOLS.find((t) => t.function.name === 'generate_file');
    const generatePptx = AI_DATABASE_TOOLS.find((t) => t.function.name === 'generate_pptx');
    const generateImage = AI_DATABASE_TOOLS.find((t) => t.function.name === 'generate_image');
    expect(generateFile?.function.description).toContain('mermaid');
    expect(generateFile?.function.description).toContain('generate_image');
    expect(generatePptx?.function.description).toContain('generate_image');
    expect(generateImage?.function.description).toContain('generate_file');
  });

  it('does not resolve images for xlsx exports', async () => {
    const exportSpy = vi.spyOn(fileExportModule, 'exportContentAsFile');
    await executeAiTool(
      'generate_file',
      { filename: 'data.xlsx', content: '| Task | Hours |\n| A | 1 |' },
      {} as any
    );
    expect(exportSpy.mock.calls[0]![4]).toBeUndefined();
  });

  it('executes generate_file for xlsx table and respects explicit format param', async () => {
    const fakeDb = {} as any;
    const exportSpy = vi.spyOn(fileExportModule, 'exportContentAsFile');

    const resultStr = await executeAiTool(
      'generate_file',
      {
        filename: 'workload-data',
        format: 'xlsx',
        content: '| Task | Hours |\n| Task A | 10 |\n| Task B | 20 |',
      },
      fakeDb
    );

    expect(exportSpy).toHaveBeenCalledWith(
      '| Task | Hours |\n| Task A | 10 |\n| Task B | 20 |',
      'workload-data',
      'xlsx',
      false,
      undefined
    );

    const result = JSON.parse(resultStr);
    expect(result.success).toBe(true);
    expect(result.filename).toBe('workload-data.xlsx');
    expect(result.format).toBe('xlsx');
    expect(result.sizeBytes).toBeGreaterThan(100);
  });

  it('executes generate_pptx and serializes slides array into non-empty content', async () => {
    const fakeDb = {} as any;
    const resultStr = await executeAiTool(
      'generate_pptx',
      {
        filename: 'presentation.pptx',
        presentationTitle: 'Roadmap Deck',
        slides: [
          { title: 'Intro', layout: 'title', subtitle: 'Overview' },
          { title: 'Plan', layout: 'content', bullets: ['Milestone 1', 'Milestone 2'] },
        ],
      },
      fakeDb
    );

    const result = JSON.parse(resultStr);
    expect(result.success).toBe(true);
    expect(result.filename).toBe('presentation.pptx');
    expect(result.slideCount).toBe(2);
    expect(result.content).toBeDefined();
    expect(result.content).toContain('Roadmap Deck');
    expect(result.content).toContain('Milestone 1');
  });
});
