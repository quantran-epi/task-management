import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { stripCommonRootPrefix } from '../ZipImportPreviewModal';
import { extractMarkdownMetadata } from '../../../utils/smartIngestion';

describe('Zip Markdown Import extraction', () => {
  it('stripCommonRootPrefix detects and strips common enclosing directory', () => {
    const paths = [
      'my-docs/readme.md',
      'my-docs/guide.md',
      'my-docs/sub/nested.md',
    ];
    const { commonPrefix, strippedPaths } = stripCommonRootPrefix(paths);

    expect(commonPrefix).toBe('my-docs');
    expect(strippedPaths).toEqual([
      'readme.md',
      'guide.md',
      'sub/nested.md',
    ]);
  });

  it('stripCommonRootPrefix leaves paths unchanged if root contains loose files', () => {
    const paths = [
      'readme.md',
      'docs/guide.md',
    ];
    const { commonPrefix, strippedPaths } = stripCommonRootPrefix(paths);

    expect(commonPrefix).toBe('');
    expect(strippedPaths).toEqual(paths);
  });

  it('stripCommonRootPrefix leaves paths unchanged if multiple different top-level folders exist', () => {
    const paths = [
      'folderA/readme.md',
      'folderB/guide.md',
    ];
    const { commonPrefix, strippedPaths } = stripCommonRootPrefix(paths);

    expect(commonPrefix).toBe('');
    expect(strippedPaths).toEqual(paths);
  });
  it('unzips and extracts markdown files, detecting titles from first H1 or filename', async () => {
    const zip = new JSZip();

    // Add markdown files
    zip.file('readme.md', '# Project Overview\n\nThis is the overview.');
    zip.file('docs/guide.markdown', '# Getting Started Guide\n\nStep 1: Install.');
    zip.file('notes/untitled.md', 'No heading in this file, just raw text.');
    // Add non-markdown and hidden files (should be ignored)
    zip.file('image.png', 'fake image bytes');
    zip.file('.DS_Store', 'macos metadata');
    zip.file('__MACOSX/._readme.md', 'macos resource fork');

    const content = await zip.generateAsync({ type: 'arraybuffer' });
    const loadedZip = await JSZip.loadAsync(content);

    const extracted: Array<{ relativePath: string; fileName: string; title: string; body: string }> = [];

    loadedZip.forEach((relativePath, entry) => {
      if (
        !entry.dir &&
        !relativePath.includes('__MACOSX') &&
        !relativePath.split('/').some((part) => part.startsWith('.')) &&
        (relativePath.toLowerCase().endsWith('.md') || relativePath.toLowerCase().endsWith('.markdown'))
      ) {
        const parts = relativePath.split('/');
        const fileName = parts[parts.length - 1] || 'document.md';
        extracted.push({ relativePath, fileName, title: '', body: '' });
      }
    });

    for (const item of extracted) {
      const entry = loadedZip.file(item.relativePath);
      const body = (await entry?.async('string')) || '';
      item.body = body;
      const h1Match = body.match(/^#\s+(.+)$/m);
      item.title = h1Match && h1Match[1]
        ? h1Match[1].trim()
        : item.fileName.replace(/\.(md|markdown)$/i, '').trim();
    }

    expect(extracted.length).toBe(3);

    const readme = extracted.find((e) => e.relativePath === 'readme.md');
    expect(readme?.title).toBe('Project Overview');

    const guide = extracted.find((e) => e.relativePath === 'docs/guide.markdown');
    expect(guide?.title).toBe('Getting Started Guide');

    const untitled = extracted.find((e) => e.relativePath === 'notes/untitled.md');
    expect(untitled?.title).toBe('untitled');
  });

  it('extracts title and tags using smart ingestion metadata from markdown body', () => {
    const markdown = '# API Guide\n\n#backend #auth\n\nEndpoint details here.';
    const metadata = extractMarkdownMetadata(markdown);

    expect(metadata.title).toBe('API Guide');
    expect(metadata.tags).toEqual(['backend', 'auth']);
  });
});
