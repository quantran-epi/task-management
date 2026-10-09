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
    expect(props?.format).toBeDefined();
    expect(props?.format?.enum).toEqual(['md', 'txt', 'docx', 'xlsx', 'csv', 'pptx']);
    expect(tool?.function.parameters.required).toContain('filename');
    expect(tool?.function.parameters.required).toContain('content');
  });

  it('rejects execution when filename or content is missing', async () => {
    const fakeDb = {} as any;
    const resNoFilename = await executeAiTool('generate_file', { content: 'hello' }, fakeDb);
    expect(JSON.parse(resNoFilename)).toEqual({ error: 'filename and content are required' });

    const resNoContent = await executeAiTool('generate_file', { filename: 'test.docx' }, fakeDb);
    expect(JSON.parse(resNoContent)).toEqual({ error: 'filename and content are required' });
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
      false
    );

    const result = JSON.parse(resultStr);
    expect(result.success).toBe(true);
    expect(result.filename).toBe('project-report.docx');
    expect(result.format).toBe('docx');
    expect(result.sizeBytes).toBeGreaterThan(100);
    expect(result.message).toContain('project-report.docx');
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
      false
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
