import { describe, it, expect, vi } from 'vitest';
import { extractMermaidCode, fixMermaidWithAi } from '../../../src/services/ai/mermaidFixerService';
import * as nineRouterClient from '../../../src/services/ai/nineRouterClient';
import * as tokenService from '../../../src/services/ai/nineRouterTokenService';

describe('mermaidFixerService', () => {
  describe('extractMermaidCode', () => {
    it('extracts code from ```mermaid ... ``` block', () => {
      const input = '```mermaid\ngraph TD\n  A --> B\n```';
      expect(extractMermaidCode(input)).toBe('graph TD\n  A --> B');
    });

    it('extracts code from generic code block', () => {
      const input = '```\nsequenceDiagram\n  Alice->>Bob: Hi\n```';
      expect(extractMermaidCode(input)).toBe('sequenceDiagram\n  Alice->>Bob: Hi');
    });

    it('returns raw text if no code block', () => {
      const input = 'flowchart LR\n  Start --> Stop';
      expect(extractMermaidCode(input)).toBe('flowchart LR\n  Start --> Stop');
    });

    it('strips thinking blocks before extraction', () => {
      const input = '<think>I need to fix this</think>\n```mermaid\ngraph TD\n  X-->Y\n```';
      expect(extractMermaidCode(input)).toBe('graph TD\n  X-->Y');
    });
  });

  describe('fixMermaidWithAi', () => {
    it('calls completeChatText and parses returned mermaid code', async () => {
      vi.spyOn(tokenService, 'getNineRouterApiKey').mockResolvedValue('test-key');
      vi.spyOn(tokenService, 'getNineRouterConfig').mockResolvedValue({
        endpoint: 'http://localhost:20128',
        defaultModel: 'test-model',
      });

      vi.spyOn(nineRouterClient, 'completeChatText').mockResolvedValue(
        '```mermaid\nflowchart TD\n  A["Node with (parentheses)"] --> B\n```'
      );

      const res = await fixMermaidWithAi({
        code: 'flowchart TD\n  A[Node with (parentheses)] --> B',
        errorMessage: 'Parse error on line 2',
      });

      expect(res.fixedCode).toBe('flowchart TD\n  A["Node with (parentheses)"] --> B');
    });
  });
});
