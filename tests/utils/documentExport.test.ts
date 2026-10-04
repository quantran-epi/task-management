import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  sanitizeFilename,
  buildMarkdownWithFrontmatter,
  exportDocumentAsMarkdown,
  exportAllDocumentsAsZip,
} from '../../src/utils/documentExport';
import type { Note } from '../../src/types/models';

describe('documentExport utility', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis.URL, 'createObjectURL').mockReturnValue('blob:mock-url');
    vi.spyOn(globalThis.URL, 'revokeObjectURL').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sanitizes unsafe filename per T-14-07', () => {
    expect(sanitizeFilename('../../../etc/passwd')).toBe('etc_passwd');
    expect(sanitizeFilename('my:file*name?.md')).toBe('my_file_name_.md');
    expect(sanitizeFilename('')).toBe('untitled');
  });

  it('builds valid markdown with frontmatter', () => {
    const doc: Note = {
      id: 'doc-123',
      title: 'Tài liệu kiến trúc',
      body: '# Nội dung\nChi tiết hệ thống',
      tags: ['architecture', 'backend'],
      isPinned: false,
      createdAt: '2026-10-04T00:00:00.000Z',
      updatedAt: '2026-10-04T12:00:00.000Z',
      slug: 'tai-lieu-kien-truc',
    };

    const output = buildMarkdownWithFrontmatter(doc);

    expect(output).toContain('title: "Tài liệu kiến trúc"');
    expect(output).toContain('tags: ["architecture", "backend"]');
    expect(output).toContain('slug: "tai-lieu-kien-truc"');
    expect(output).toContain('# Nội dung\nChi tiết hệ thống');
  });

  it('exports document as markdown without errors', async () => {
    const doc: Note = {
      id: 'doc-123',
      title: 'Tài liệu test',
      body: '# Test\nNội dung',
      isPinned: false,
      createdAt: '2026-10-04T00:00:00.000Z',
      updatedAt: '2026-10-04T12:00:00.000Z',
    };

    let clicked = false;
    const origCreateElement = Document.prototype.createElement;
    vi.spyOn(document, 'createElement').mockImplementation(function (this: Document, tagName: string) {
      const el = origCreateElement.call(this, tagName);
      if (tagName === 'a') {
        el.click = () => {
          clicked = true;
        };
      }
      return el;
    });

    await exportDocumentAsMarkdown(doc);

    expect(clicked).toBe(true);
  });

  it('exports all documents as json bundle', async () => {
    const docs: Note[] = [
      {
        id: 'doc-1',
        title: 'Doc 1',
        body: 'Body 1',
        isPinned: false,
        createdAt: '2026-10-04T00:00:00.000Z',
        updatedAt: '2026-10-04T12:00:00.000Z',
      },
    ];

    let clicked = false;
    const origCreateElement = Document.prototype.createElement;
    vi.spyOn(document, 'createElement').mockImplementation(function (this: Document, tagName: string) {
      const el = origCreateElement.call(this, tagName);
      if (tagName === 'a') {
        el.click = () => {
          clicked = true;
        };
      }
      return el;
    });

    await exportAllDocumentsAsZip(docs, []);

    expect(clicked).toBe(true);
  });
});
