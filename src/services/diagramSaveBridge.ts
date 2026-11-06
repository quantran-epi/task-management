import { db as defaultDb, type TaskPlannerDatabase } from '../db';
import { createNote } from '../db/repositories/noteRepo';
import type { Note } from '../types/models';
import { useLayoutStore } from '../workbench/store/layoutStore';

/**
 * Strips ANSI escape sequences and terminal formatting codes from raw string.
 * Mitigates T-29.1-09 before saving diagram to database.
 */
export function stripAnsiSequences(input: string): string {
  // eslint-disable-next-line no-control-regex
  return input.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
}

/**
 * Extracts all ```mermaid ... ``` code blocks from text, terminal logs, or markdown.
 */
export function extractMermaidBlocks(text: string): string[] {
  if (!text) return [];
  const clean = stripAnsiSequences(text);
  const regex = /```(?:mermaid)?\s*\r?\n([\s\S]*?)```/gi;
  const blocks: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(clean)) !== null) {
    if (match[1]) {
      const trimmed = match[1].trim();
      if (trimmed.length > 0) {
        blocks.push(trimmed);
      }
    }
  }

  // Fallback: check if text itself is bare mermaid definition without fences
  if (blocks.length === 0) {
    const trimmed = clean.trim();
    if (
      /^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|gitGraph|mindmap|timeline)\b/i.test(
        trimmed
      )
    ) {
      blocks.push(trimmed);
    }
  }

  return blocks;
}

/**
 * Saves a Mermaid diagram code block as a Note with type 'diagram' and opens in Diagram Studio.
 */
export async function saveDiagramToStudio(
  title: string,
  mermaidCode: string,
  tags: string[] = [],
  db: TaskPlannerDatabase = defaultDb
): Promise<Note> {
  const sanitized = stripAnsiSequences(mermaidCode).trim();
  const noteTitle = title.trim() || 'Remote Diagram';
  const mergedTags = Array.from(new Set(['diagram', 'remote', ...tags]));

  const note = await createNote(
    {
      type: 'diagram',
      title: noteTitle,
      body: sanitized,
      tags: mergedTags,
      isPinned: false,
    },
    db
  );

  return note;
}

/**
 * Opens a diagram note in Diagram Studio inside Workbench center tabs.
 */
export function openDiagramInStudio(noteId: string): void {
  useLayoutStore.getState().openTab({
    id: `mermaid-${noteId}`,
    title: 'Diagram',
    viewType: 'mermaid',
    params: { noteId },
    closable: true,
  });
}
