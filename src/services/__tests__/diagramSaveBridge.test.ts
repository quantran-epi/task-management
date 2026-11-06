import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../../db';
import {
  extractMermaidBlocks,
  saveDiagramToStudio,
  openDiagramInStudio,
  stripAnsiSequences,
} from '../diagramSaveBridge';
import { useLayoutStore } from '../../workbench/store/layoutStore';

describe('diagramSaveBridge', () => {
  beforeEach(async () => {
    await db.notes.clear();
    useLayoutStore.getState().resetLayout();
  });

  describe('extractMermaidBlocks', () => {
    it('extracts single mermaid code block from markdown', () => {
      const markdown = `
# Architecture
Here is the system flow:
\`\`\`mermaid
graph TD
  A[Client] --> B[Server]
\`\`\`
End of architecture.
      `;
      const blocks = extractMermaidBlocks(markdown);
      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toContain('graph TD');
      expect(blocks[0]).toContain('A[Client] --> B[Server]');
    });

    it('extracts multiple mermaid code blocks', () => {
      const text = `
\`\`\`mermaid
flowchart LR
  X --> Y
\`\`\`

Some explanation in between.

\`\`\`mermaid
sequenceDiagram
  Alice->>Bob: Hello
\`\`\`
      `;
      const blocks = extractMermaidBlocks(text);
      expect(blocks).toHaveLength(2);
      expect(blocks[0]).toContain('flowchart LR');
      expect(blocks[1]).toContain('sequenceDiagram');
    });

    it('strips ANSI escape sequences from terminal output before extraction', () => {
      const ansiColoredLog = `
\x1B[32m[INFO]\x1B[0m Claude Code generated diagram:
\`\`\`mermaid
\x1B[1mgraph LR\x1B[0m
  Step1 --> Step2
\`\`\`
Done!
      `;
      const blocks = extractMermaidBlocks(ansiColoredLog);
      expect(blocks).toHaveLength(1);
      expect(blocks[0]).not.toContain('\x1B');
      expect(blocks[0]).toContain('graph LR');
      expect(blocks[0]).toContain('Step1 --> Step2');
    });

    it('handles raw diagram without code fences', () => {
      const raw = 'sequenceDiagram\n  Client->>Server: Request\n  Server-->>Client: Response';
      const blocks = extractMermaidBlocks(raw);
      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toBe(raw);
    });

    it('returns empty array for text with no diagrams', () => {
      const plain = 'Just some regular text without any diagrams.';
      const blocks = extractMermaidBlocks(plain);
      expect(blocks).toHaveLength(0);
    });
  });

  describe('saveDiagramToStudio', () => {
    it('creates note with type: diagram and tags in database', async () => {
      const code = 'graph TD\n  Start --> Finish';
      const note = await saveDiagramToStudio('Workflow Diagram', code, ['custom-tag'], db);

      expect(note).toBeDefined();
      expect(note.id).toBeDefined();
      expect(note.type).toBe('diagram');
      expect(note.title).toBe('Workflow Diagram');
      expect(note.body).toBe(code);
      expect(note.tags).toContain('diagram');
      expect(note.tags).toContain('remote');
      expect(note.tags).toContain('custom-tag');

      const saved = await db.notes.get(note.id);
      expect(saved).toBeDefined();
      expect(saved?.body).toBe(code);
    });

    it('uses fallback title when title is empty', async () => {
      const code = 'pie title Pets\n  "Dogs" : 386\n  "Cats" : 85';
      const note = await saveDiagramToStudio('', code, [], db);
      expect(note.title).toBe('Remote Diagram');
    });
  });

  describe('openDiagramInStudio', () => {
    it('opens editor tab with viewType: mermaid in layoutStore', () => {
      const noteId = 'test-note-123';
      openDiagramInStudio(noteId);

      const state = useLayoutStore.getState();
      const tab = state.openTabs.find((t) => t.id === `mermaid-${noteId}`);
      expect(tab).toBeDefined();
      expect(tab?.viewType).toBe('mermaid');
      expect(tab?.params).toEqual({ noteId });
      expect(state.activeTabId).toBe(`mermaid-${noteId}`);
    });
  });

  describe('stripAnsiSequences', () => {
    it('removes ANSI color codes', () => {
      const input = '\u001b[31mRed Text\u001b[0m and \u001b[32mGreen\u001b[0m';
      expect(stripAnsiSequences(input)).toBe('Red Text and Green');
    });
  });
});
