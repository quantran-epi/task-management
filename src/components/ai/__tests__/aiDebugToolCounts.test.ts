// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { summarizeToolCounts } from '../AIDebugModal';

describe('summarizeToolCounts (quick 261128-09x)', () => {
  it('groups duplicate tool names into name ×N counts', () => {
    expect(
      summarizeToolCounts([
        { name: 'retrieve_knowledge' },
        { name: 'query_tasks' },
        { name: 'retrieve_knowledge' },
      ])
    ).toBe('retrieve_knowledge ×2, query_tasks ×1');
  });

  it('returns an empty string when no tools ran', () => {
    expect(summarizeToolCounts([])).toBe('');
  });

  it('never renders args, results or other payload content', () => {
    const summary = summarizeToolCounts([
      { name: 'query_tasks', ...({ args: { secret: 'token' }, result: 'private text' } as any) },
    ]);
    expect(summary).toBe('query_tasks ×1');
    expect(summary).not.toContain('secret');
    expect(summary).not.toContain('private');
  });
});
