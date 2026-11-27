// @vitest-environment node
import { describe, it, expect } from 'vitest';
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
