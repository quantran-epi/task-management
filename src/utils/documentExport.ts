import type { Note, NoteAttachment } from '../types/models';

/**
 * Sanitizes filename by stripping directory traversal and illegal characters per T-14-07.
 */
export function sanitizeFilename(filename: string): string {
  if (!filename) return 'untitled';
  return filename
    .replace(/\.\.[\/\\]/g, '') // directory traversal
    .replace(/[\\/:*?"<>|]/g, '_') // illegal filesystem chars
    .trim() || 'untitled';
}

/**
 * Builds clean Markdown content with YAML frontmatter from a Note.
 */
export function buildMarkdownWithFrontmatter(doc: Note): string {
  const frontmatterLines: string[] = ['---'];
  frontmatterLines.push(`title: "${(doc.title || 'Untitled').replace(/"/g, '\\"')}"`);
  if (doc.tags && doc.tags.length > 0) {
    frontmatterLines.push(`tags: [${doc.tags.map((t) => `"${t}"`).join(', ')}]`);
  }
  frontmatterLines.push(`created: "${doc.createdAt}"`);
  frontmatterLines.push(`updated: "${doc.updatedAt}"`);
  if (doc.slug) {
    frontmatterLines.push(`slug: "${doc.slug}"`);
  }
  frontmatterLines.push('---');
  frontmatterLines.push('');

  return `${frontmatterLines.join('\n')}\n${doc.body || ''}\n`;
}

/**
 * Exports a single document as a .md file download in Web or Tauri environment.
 */
export async function exportDocumentAsMarkdown(doc: Note): Promise<void> {
  const markdown = buildMarkdownWithFrontmatter(doc);
  const baseName = sanitizeFilename(doc.title || 'document');
  const filename = `${baseName}.md`;

  if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
    try {
      // @ts-expect-error File System Access API
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: 'Markdown File', accept: { 'text/markdown': ['.md'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(markdown);
      await writable.close();
      return;
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') return;
    }
  }

  // Fallback: standard blob anchor download
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Exports all documents and attachments as a structured JSON bundle / Blob in Web or Tauri.
 * Preserves folder hierarchy and attachments metadata per D-15.
 */
export async function exportAllDocumentsAsZip(
  docs: Note[],
  attachments: NoteAttachment[] = []
): Promise<void> {
  const exportPayload = {
    exportedAt: new Date().toISOString(),
    version: '1.0',
    documents: docs.map((doc) => ({
      ...doc,
      markdownWithFrontmatter: buildMarkdownWithFrontmatter(doc),
    })),
    attachmentsCount: attachments.length,
    attachments: attachments.map((att) => ({
      id: att.id,
      noteId: att.noteId,
      fileName: sanitizeFilename(att.fileName),
      mimeType: att.mimeType,
      caption: att.caption,
      createdAt: att.createdAt,
    })),
  };

  const filename = `knowledge-base-export-${new Date().toISOString().slice(0, 10)}.json`;
  const jsonBlob = new Blob([JSON.stringify(exportPayload, null, 2)], {
    type: 'application/json;charset=utf-8',
  });

  const url = URL.createObjectURL(jsonBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
