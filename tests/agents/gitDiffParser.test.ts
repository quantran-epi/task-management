import { describe, it, expect } from 'vitest';
import { parseGitDiff } from '../../src/utils/gitDiffParser';

describe('gitDiffParser', () => {
  it('returns empty array when input is empty or whitespace', () => {
    expect(parseGitDiff('')).toEqual([]);
    expect(parseGitDiff('   \n  \t  ')).toEqual([]);
  });

  it('parses standard single-file unified diff with additions, deletions, and context lines', () => {
    const rawDiff = `diff --git a/src/hello.ts b/src/hello.ts
index e69de29..d95f3ad 100644
--- a/src/hello.ts
+++ b/src/hello.ts
@@ -1,3 +1,4 @@
 const a = 1;
-const b = 2;
+const b = 3;
+const c = 4;
 const d = 5;
`;
    const files = parseGitDiff(rawDiff);
    expect(files).toHaveLength(1);
    const file = files[0]!;
    expect(file.oldPath).toBe('src/hello.ts');
    expect(file.newPath).toBe('src/hello.ts');
    expect(file.status).toBe('modified');
    expect(file.additions).toBe(2);
    expect(file.deletions).toBe(1);
    expect(file.hunks).toHaveLength(1);

    const hunk = file.hunks[0]!;
    expect(hunk.oldStart).toBe(1);
    expect(hunk.oldCount).toBe(3);
    expect(hunk.newStart).toBe(1);
    expect(hunk.newCount).toBe(4);

    expect(hunk.lines).toHaveLength(5);
    expect(hunk.lines[0]).toEqual({
      type: 'context',
      oldLineNumber: 1,
      newLineNumber: 1,
      content: 'const a = 1;',
    });
    expect(hunk.lines[1]).toEqual({
      type: 'delete',
      oldLineNumber: 2,
      content: 'const b = 2;',
    });
    expect(hunk.lines[2]).toEqual({
      type: 'add',
      newLineNumber: 2,
      content: 'const b = 3;',
    });
    expect(hunk.lines[3]).toEqual({
      type: 'add',
      newLineNumber: 3,
      content: 'const c = 4;',
    });
    expect(hunk.lines[4]).toEqual({
      type: 'context',
      oldLineNumber: 3,
      newLineNumber: 4,
      content: 'const d = 5;',
    });
  });

  it('assigns correct oldLineNumber and newLineNumber across multiple hunks', () => {
    const rawDiff = `diff --git a/src/math.ts b/src/math.ts
--- a/src/math.ts
+++ b/src/math.ts
@@ -10,3 +10,3 @@
 line 10
-line 11 old
+line 11 new
 line 12
@@ -50,3 +50,4 @@
 line 50
+line 50.5 added
 line 51
 line 52
`;
    const files = parseGitDiff(rawDiff);
    expect(files).toHaveLength(1);
    const file = files[0]!;
    expect(file.hunks).toHaveLength(2);

    const hunk1 = file.hunks[0]!;
    expect(hunk1.oldStart).toBe(10);
    expect(hunk1.newStart).toBe(10);
    expect(hunk1.lines[1]).toEqual({
      type: 'delete',
      oldLineNumber: 11,
      content: 'line 11 old',
    });
    expect(hunk1.lines[2]).toEqual({
      type: 'add',
      newLineNumber: 11,
      content: 'line 11 new',
    });

    const hunk2 = file.hunks[1]!;
    expect(hunk2.oldStart).toBe(50);
    expect(hunk2.newStart).toBe(50);
    expect(hunk2.lines[1]).toEqual({
      type: 'add',
      newLineNumber: 51,
      content: 'line 50.5 added',
    });
  });

  it('parses multiple files with status modified, added, or deleted and tracks addition/deletion counts', () => {
    const rawDiff = `diff --git a/new_file.ts b/new_file.ts
new file mode 100644
--- /dev/null
+++ b/new_file.ts
@@ -0,0 +1,2 @@
+export const x = 1;
+export const y = 2;
diff --git a/removed.ts b/removed.ts
deleted file mode 100644
--- a/removed.ts
+++ /dev/null
@@ -1,2 +0,0 @@
-line 1
-line 2
`;
    const files = parseGitDiff(rawDiff);
    expect(files).toHaveLength(2);

    const addedFile = files[0]!;
    expect(addedFile.status).toBe('added');
    expect(addedFile.oldPath).toBe('/dev/null');
    expect(addedFile.newPath).toBe('new_file.ts');
    expect(addedFile.additions).toBe(2);
    expect(addedFile.deletions).toBe(0);

    const deletedFile = files[1]!;
    expect(deletedFile.status).toBe('deleted');
    expect(deletedFile.oldPath).toBe('removed.ts');
    expect(deletedFile.newPath).toBe('/dev/null');
    expect(deletedFile.additions).toBe(0);
    expect(deletedFile.deletions).toBe(2);
  });
});
