import { describe, expect, it } from 'vitest';
import type { RemoteQuery } from '../session';
import { buildGrepOptions, matchesMask } from '../query';
import { FIND_MATCH_LIMIT, type GrepResult } from '../session';
import { PathOutsideRepoError } from '../../../../services/gitRemoteTreeService';

const base: RemoteQuery = {
  pattern: 'needle',
  mode: 'content',
  scope: 'whole-ref',
  matchCase: false,
  words: false,
  regex: false,
};

describe('buildGrepOptions — D-05/D-09', () => {
  it('maps options to grep options with the 2000 limit and no path for whole-ref', () => {
    expect(buildGrepOptions(base)).toEqual({
      pattern: 'needle',
      caseSensitive: false,
      literal: true,
      limit: 2000,
    });
    expect(FIND_MATCH_LIMIT).toBe(2000);
  });

  it('toggles caseSensitive/literal from Match Case and Regex', () => {
    const opts = buildGrepOptions({ ...base, matchCase: true, regex: true });
    expect(opts.caseSensitive).toBe(true);
    expect(opts.literal).toBe(false);
  });

  it('wraps with word boundaries only in regex+words mode', () => {
    expect(buildGrepOptions({ ...base, regex: true, words: true }).pattern).toBe('\\bneedle\\b');
    expect(buildGrepOptions({ ...base, regex: false, words: true }).pattern).toBe('needle');
    expect(buildGrepOptions({ ...base, regex: true, words: false }).pattern).toBe('needle');
  });

  it('adds a confined path only for Directory scope', () => {
    expect(buildGrepOptions({ ...base, scope: 'directory', directory: 'src/main' }).path).toBe(
      'src/main'
    );
    expect(buildGrepOptions({ ...base, scope: 'directory', directory: '/src/./main' }).path).toBe(
      'src/main'
    );
    expect(buildGrepOptions(base).path).toBeUndefined();
  });

  it('rejects a directory that escapes the repo before any command', () => {
    expect(() => buildGrepOptions({ ...base, scope: 'directory', directory: '../etc' })).toThrow(
      PathOutsideRepoError
    );
  });

  it('never concatenates a malicious pattern into a command string', () => {
    const evil = "'; rm -rf /; '";
    const opts = buildGrepOptions({ ...base, pattern: evil });
    expect(opts.pattern).toBe(evil); // remains DATA, passed to escapeShellArg by the service
    expect(typeof opts.pattern).toBe('string');
    // No option value is a shell command / no field carries a composed command string.
    for (const value of Object.values(opts)) {
      if (typeof value === 'string') expect(value).not.toContain('git ');
    }
    const _proof: GrepResult = { hits: [], truncated: false };
    expect(_proof.hits).toEqual([]);
  });
});

describe('matchesMask — D-05 client-side filter', () => {
  it('accepts all paths for an empty mask', () => {
    expect(matchesMask('anything.ts', undefined)).toBe(true);
    expect(matchesMask('deep/a.md', '')).toBe(true);
  });

  it('matches representative globs', () => {
    expect(matchesMask('index.ts', '*.ts')).toBe(true);
    expect(matchesMask('src/deep/index.ts', '*.ts')).toBe(false); // * never crosses /
    expect(matchesMask('src/deep/foo.test.ts', '**/*.test.ts')).toBe(true);
    expect(matchesMask('foo.test.ts', '**/*.test.ts')).toBe(true);
    expect(matchesMask('src/a.ts', '*.md')).toBe(false);
  });
});
