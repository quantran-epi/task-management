import type { DiffFile, DiffHunk, DiffLine } from '../types/agent';

export function parseGitDiff(rawDiff: string): DiffFile[] {
  if (!rawDiff || !rawDiff.trim()) {
    return [];
  }

  const lines = rawDiff.split('\n');
  const files: DiffFile[] = [];

  let currentFile: DiffFile | null = null;
  let currentHunk: DiffHunk | null = null;
  let oldLineCursor = 0;
  let newLineCursor = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    if (line.startsWith('diff --git ')) {
      if (currentHunk && currentFile) {
        currentFile.hunks.push(currentHunk);
        currentHunk = null;
      }
      if (currentFile) {
        files.push(currentFile);
      }

      const match = line.match(/^diff --git a\/(.+) b\/(.+)$/);
      const oldPath = match ? match[1]! : '';
      const newPath = match ? match[2]! : '';

      currentFile = {
        oldPath,
        newPath,
        status: 'modified',
        hunks: [],
        additions: 0,
        deletions: 0,
      };
      continue;
    }

    if (!currentFile) {
      continue;
    }

    if (line.startsWith('new file mode ')) {
      currentFile.status = 'added';
      continue;
    }

    if (line.startsWith('deleted file mode ')) {
      currentFile.status = 'deleted';
      continue;
    }

    if (line.startsWith('--- ')) {
      const pathPart = line.slice(4).trim();
      if (pathPart === '/dev/null') {
        currentFile.oldPath = '/dev/null';
        currentFile.status = 'added';
      } else if (pathPart.startsWith('a/')) {
        currentFile.oldPath = pathPart.slice(2);
      }
      continue;
    }

    if (line.startsWith('+++ ')) {
      const pathPart = line.slice(4).trim();
      if (pathPart === '/dev/null') {
        currentFile.newPath = '/dev/null';
        currentFile.status = 'deleted';
      } else if (pathPart.startsWith('b/')) {
        currentFile.newPath = pathPart.slice(2);
      }
      continue;
    }

    if (line.startsWith('@@ ')) {
      if (currentHunk) {
        currentFile.hunks.push(currentHunk);
      }

      // @@ -oldStart[,oldCount] +newStart[,newCount] @@ optional header
      const hunkHeaderMatch = line.match(
        /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/
      );
      if (hunkHeaderMatch) {
        const oldStart = parseInt(hunkHeaderMatch[1]!, 10);
        const oldCount = hunkHeaderMatch[2] !== undefined ? parseInt(hunkHeaderMatch[2], 10) : 1;
        const newStart = parseInt(hunkHeaderMatch[3]!, 10);
        const newCount = hunkHeaderMatch[4] !== undefined ? parseInt(hunkHeaderMatch[4], 10) : 1;
        const header = (hunkHeaderMatch[5] || '').trim();

        oldLineCursor = oldStart;
        newLineCursor = newStart;

        currentHunk = {
          oldStart,
          oldCount,
          newStart,
          newCount,
          header,
          lines: [],
        };
      }
      continue;
    }

    if (!currentHunk) {
      continue;
    }

    if (line.startsWith('\\ No newline at end of file')) {
      continue;
    }

    if (line.startsWith('+')) {
      const content = line.slice(1);
      const diffLine: DiffLine = {
        type: 'add',
        newLineNumber: newLineCursor++,
        content,
      };
      currentHunk.lines.push(diffLine);
      currentFile.additions++;
    } else if (line.startsWith('-')) {
      const content = line.slice(1);
      const diffLine: DiffLine = {
        type: 'delete',
        oldLineNumber: oldLineCursor++,
        content,
      };
      currentHunk.lines.push(diffLine);
      currentFile.deletions++;
    } else if (line.startsWith(' ')) {
      // Context line
      const content = line.slice(1);
      const diffLine: DiffLine = {
        type: 'context',
        oldLineNumber: oldLineCursor++,
        newLineNumber: newLineCursor++,
        content,
      };
      currentHunk.lines.push(diffLine);
    }
  }

  if (currentHunk && currentFile) {
    currentFile.hunks.push(currentHunk);
  }
  if (currentFile) {
    files.push(currentFile);
  }

  return files;
}

/**
 * Reconstructs a valid unified git patch string for a single hunk.
 * Compatible with `git apply` / `git apply --reverse`.
 */
export function formatHunkPatch(filePath: string, hunk: DiffHunk): string {
  const cleanPath = filePath.replace(/\\/g, '/').replace(/^\.\//, '');
  const lines: string[] = [
    `diff --git a/${cleanPath} b/${cleanPath}`,
    `--- a/${cleanPath}`,
    `+++ b/${cleanPath}`,
    `@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@${hunk.header ? ' ' + hunk.header : ''}`,
  ];

  for (const line of hunk.lines) {
    if (line.type === 'add') {
      lines.push(`+${line.content}`);
    } else if (line.type === 'delete') {
      lines.push(`-${line.content}`);
    } else {
      lines.push(` ${line.content}`);
    }
  }

  return lines.join('\n') + '\n';
}

