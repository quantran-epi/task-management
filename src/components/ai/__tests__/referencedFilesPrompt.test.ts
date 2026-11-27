// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  buildReferencedFilesPrompt,
  buildStandaloneSystemPrompt,
  REFERENCED_FILES_HINT,
} from '../AIChatDrawer';

const BASE_PARAMS = {
  todayStr: '2026-11-27',
  weekday: 'Friday',
  time: '16:30',
  graphitiSkillSegment: '',
};

describe('buildReferencedFilesPrompt (quick 261127-mrx)', () => {
  it('returns an empty string when nothing is attached', () => {
    expect(buildReferencedFilesPrompt([])).toBe('');
  });

  it('keeps each selected path verbatim inside one referenced_files block', () => {
    const result = buildReferencedFilesPrompt([
      '/srv/repo/a.sql',
      '/srv/repo/report handwriting.txt',
    ]);

    expect(result).toContain('<referenced_files>');
    expect(result).toContain('</referenced_files>');
    expect(result).toContain('`/srv/repo/a.sql`');
    expect(result).toContain('`/srv/repo/report handwriting.txt`');
    expect(result).toContain(REFERENCED_FILES_HINT);
    expect(result).not.toContain('/srv/repo/not-selected.md');
  });
});

describe('buildStandaloneSystemPrompt (quick 261127-mrx)', () => {
  it('omits the block entirely when no file is attached and keeps the legacy sections', () => {
    const prompt = buildStandaloneSystemPrompt({ ...BASE_PARAMS, referencedFilesBlock: '' });

    expect(prompt).not.toContain('<referenced_files>');
    expect(prompt).toContain('AVAILABLE CAPABILITIES');
    expect(prompt).toContain('retrieve_knowledge');
    expect(prompt).toContain('CRITICAL ANTI-HALLUCINATION RULES');
  });

  it('appends the exact block and path while preserving capability and anti-hallucination sections', () => {
    const block = buildReferencedFilesPrompt(['/srv/repo/report handwriting.txt']);
    const prompt = buildStandaloneSystemPrompt({ ...BASE_PARAMS, referencedFilesBlock: block });

    expect(prompt).toContain(block);
    expect(prompt).toContain('`/srv/repo/report handwriting.txt`');
    expect(prompt).toContain('AVAILABLE CAPABILITIES');
    expect(prompt).toContain('CRITICAL ANTI-HALLUCINATION RULES');
  });
});

describe('neutral tool routing prompts (quick 261128-09x)', () => {
  const chatSource = readFileSync(new URL('../AIChatDrawer.tsx', import.meta.url), 'utf8');
  const telegramSource = readFileSync(
    new URL('../../../services/telegram/telegramChatTurn.ts', import.meta.url),
    'utf8'
  );
  const allSources = `${chatSource}\n${telegramSource}`;

  it('has no directive that forces a specific tool call', () => {
    // Source is TypeScript: prompt backticks appear escaped as \\` in the template literal.
    // Assert on the literal as stored, not the rendered text, or the guard silently passes
    // while the directive is still in the prompt.
    for (const banned of [
      'retrieve_knowledge\\` tool repeatedly',
      'YOU MUST CALL THE RELEVANT DATABASE TOOLS',
      'YOU MUST CALL THE RELEVANT TOOLS',
      'FULL DATABASE MUTATION CAPABILITIES',
      'in the SAME turn',
      'dùng `retrieve_knowledge` nhiều lần',
    ]) {
      expect(allSources).not.toContain(banned);
    }
  });

  it('keeps capability lists, anti-hallucination rules and Telegram read-only gate', () => {
    expect(chatSource).toContain('AVAILABLE CAPABILITIES');
    expect(chatSource).toContain('CRITICAL ANTI-HALLUCINATION RULES');
    expect(telegramSource).toContain('CRITICAL ANTI-HALLUCINATION RULES');
    expect(telegramSource).toContain('Mutations are unavailable in this turn');
  });
});
