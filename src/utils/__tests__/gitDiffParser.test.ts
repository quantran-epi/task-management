import { describe, it, expect } from 'vitest';
import { parseGitDiff, buildHunkPatch, buildLinePatch, formatHunkPatch } from '../gitDiffParser';

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
    expect(patch).toContain('diff --git a/src/hello.ts b/src/hello.ts\n');
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

    const patch = buildLinePatch('src/hello.ts', hunk, 2);
    expect(patch).toContain('--- a/src/hello.ts\n+++ b/src/hello.ts\n');
    expect(patch).toContain('+line2-modified\n');
    expect(patch).not.toContain('+line2-extra');
    expect(patch).toContain(' line2\n');
  });

  it('buildLinePatch generates partial patch for single deletion line', () => {
    const files = parseGitDiff(sampleDiff);
    const hunk = files[0]!.hunks[0]!;

    const patch = buildLinePatch('src/hello.ts', hunk, 1);
    expect(patch).toContain('--- a/src/hello.ts\n+++ b/src/hello.ts\n');
    expect(patch).toContain('-line2\n');
    expect(patch).not.toContain('+line2-modified');
    expect(patch).not.toContain('+line2-extra');
  });

  it('formatHunkPatch accurately outputs unified patch for hunk', () => {
    const rawDiff = `diff --git a/foo.txt b/foo.txt
--- a/foo.txt
+++ b/foo.txt
@@ -1,3 +1,3 @@
 line 1
-line 2
+line 2 modified
 line 3
`;
    const files = parseGitDiff(rawDiff);
    expect(files.length).toBe(1);
    const hunk = files[0]!.hunks[0]!;
    const patch = formatHunkPatch('foo.txt', hunk);

    expect(patch).toContain('diff --git a/foo.txt b/foo.txt');
    expect(patch).toContain('--- a/foo.txt');
    expect(patch).toContain('+++ b/foo.txt');
    expect(patch).toContain('@@ -1,3 +1,3 @@');
    expect(patch).toContain(' line 1');
    expect(patch).toContain('-line 2');
    expect(patch).toContain('+line 2 modified');
    expect(patch).toContain(' line 3');
  });
});
