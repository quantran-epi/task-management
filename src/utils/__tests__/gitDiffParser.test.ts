import { describe, it, expect } from 'vitest';
import { parseGitDiff, buildHunkPatch, buildLinePatch } from '../gitDiffParser';

describe('gitDiffParser patch builders', () => {
  const sampleDiff = `diff --git a/src/hello.ts b/src/hello.ts
index 123..456 100644
--- a/src/hello.ts
+++ b/src/hello.ts
@@ -1,3 +1,4 @@
 line1
-line2
+line2-modified
+line2-extra
 line3`;

  it('buildHunkPatch generates valid unified diff for hunk', () => {
    const files = parseGitDiff(sampleDiff);
    expect(files.length).toBe(1);
    const hunk = files[0]!.hunks[0]!;

    const patch = buildHunkPatch('src/hello.ts', hunk);
    expect(patch).toContain('--- a/src/hello.ts\n+++ b/src/hello.ts\n');
    expect(patch).toContain('@@ -1,3 +1,4 @@');
    expect(patch).toContain(' line1\n');
    expect(patch).toContain('-line2\n');
    expect(patch).toContain('+line2-modified\n');
    expect(patch).toContain('+line2-extra\n');
    expect(patch).toContain(' line3\n');
  });

  it('buildLinePatch generates partial patch for single addition line', () => {
    const files = parseGitDiff(sampleDiff);
    const hunk = files[0]!.hunks[0]!;

    // hunk.lines:
    // 0: context 'line1'
    // 1: delete 'line2'
    // 2: add 'line2-modified'
    // 3: add 'line2-extra'
    // 4: context 'line3'
    const patch = buildLinePatch('src/hello.ts', hunk, 2);
    expect(patch).toContain('--- a/src/hello.ts\n+++ b/src/hello.ts\n');
    expect(patch).toContain('+line2-modified\n');
    // other addition line is omitted
    expect(patch).not.toContain('+line2-extra');
    // delete line is kept as context line
    expect(patch).toContain(' line2\n');
  });

  it('buildLinePatch generates partial patch for single deletion line', () => {
    const files = parseGitDiff(sampleDiff);
    const hunk = files[0]!.hunks[0]!;

    const patch = buildLinePatch('src/hello.ts', hunk, 1);
    expect(patch).toContain('--- a/src/hello.ts\n+++ b/src/hello.ts\n');
    expect(patch).toContain('-line2\n');
    // addition lines are omitted
    expect(patch).not.toContain('+line2-modified');
    expect(patch).not.toContain('+line2-extra');
  });
});
