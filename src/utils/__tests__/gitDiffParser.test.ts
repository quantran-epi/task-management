import { describe, it, expect } from 'vitest';
import { parseGitDiff, formatHunkPatch } from '../gitDiffParser';

describe('gitDiffParser formatHunkPatch', () => {
  it('formats unified patch from DiffHunk accurately', () => {
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
