import { describe, it, expect } from 'vitest';
import { isLikelyMermaidCode } from '../../../src/components/common/GlobalDiagramViewer';

describe('GlobalDiagramViewer', () => {
  describe('isLikelyMermaidCode', () => {
    it('detects ```mermaid block', () => {
      expect(isLikelyMermaidCode('```mermaid\nflowchart TD\n  A-->B\n```')).toBe(true);
    });

    it('detects flowchart TD without fences', () => {
      expect(isLikelyMermaidCode('flowchart TD\n  A-->B')).toBe(true);
      expect(isLikelyMermaidCode('flowchart LR\n  Start --> Stop')).toBe(true);
    });

    it('detects sequenceDiagram', () => {
      expect(isLikelyMermaidCode('sequenceDiagram\n  Alice->>Bob: Hello')).toBe(true);
    });

    it('detects classDiagram and erDiagram', () => {
      expect(isLikelyMermaidCode('classDiagram\n  class Animal')).toBe(true);
      expect(isLikelyMermaidCode('erDiagram\n  CUSTOMER ||--o{ ORDER : places')).toBe(true);
    });

    it('detects mindmap and gantt', () => {
      expect(isLikelyMermaidCode('mindmap\n  root((Idea))')).toBe(true);
      expect(isLikelyMermaidCode('gantt\n  title Project\n  dateFormat YYYY-MM-DD')).toBe(true);
    });

    it('rejects ordinary text or code', () => {
      expect(isLikelyMermaidCode('Hello world, this is a plain text note.')).toBe(false);
      expect(isLikelyMermaidCode('const x = 10;\nfunction test() {}')).toBe(false);
      expect(isLikelyMermaidCode('short')).toBe(false);
    });
  });
});
