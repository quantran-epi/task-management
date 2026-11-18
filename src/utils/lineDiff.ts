/**
 * Deterministic, bounded unified line diff.
 *
 * Line-based LCS with common prefix/suffix trimming and a hard cell budget, so a
 * model-supplied section can never allocate an unbounded matrix. Inputs are split on
 * the text's own newline convention and re-joined with it, so untouched bytes survive.
 */
export const MAX_DIFF_CELLS = 1_000_000;

export interface UnifiedLineDiff {
  diffText: string;
  addedLines: number;
  removedLines: number;
}

export interface DiffBudgetRefusal {
  refused: true;
  code: 'DIFF_BUDGET_EXCEEDED';
  message: string;
  cells: number;
  cap: number;
}

export interface LineDiffOptions {
  /** Unified headers; pass undefined to emit hunks without file headers. */
  fromLabel?: string;
  toLabel?: string;
  context?: number;
}

type Op = { kind: ' ' | '+' | '-'; line: string };
type Hunk = { baseStart: number; baseCount: number; nextStart: number; nextCount: number; ops: Op[] };

function splitKeepingEol(text: string): { lines: string[]; eol: string } {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  return { lines: text.split(/\r?\n/), eol };
}

/** Longest-common-subsequence walk, deterministic: on a tie a deletion is emitted first. */
function lcsOps(base: string[], next: string[]): Op[] {
  const n = base.length;
  const m = next.length;
  const width = m + 1;
  const table = new Int32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      table[i * width + j] = base[i] === next[j]
        ? table[(i + 1) * width + j + 1]! + 1
        : Math.max(table[(i + 1) * width + j]!, table[i * width + j + 1]!);
    }
  }
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (base[i] === next[j]) {
      ops.push({ kind: ' ', line: base[i]! });
      i += 1;
      j += 1;
    } else if (table[(i + 1) * width + j]! >= table[i * width + j + 1]!) {
      ops.push({ kind: '-', line: base[i]! });
      i += 1;
    } else {
      ops.push({ kind: '+', line: next[j]! });
      j += 1;
    }
  }
  while (i < n) { ops.push({ kind: '-', line: base[i]! }); i += 1; }
  while (j < m) { ops.push({ kind: '+', line: next[j]! }); j += 1; }
  return ops;
}

function buildHunks(ops: Op[], context: number): Hunk[] {
  const hunks: Hunk[] = [];
  const changed = ops.map((op, index) => (op.kind === ' ' ? -1 : index)).filter((index) => index >= 0);
  if (changed.length === 0) return hunks;

  // Boundaries in op-space, merged when the unchanged gap is <= 2 * context.
  let start = Math.max(0, changed[0]! - context);
  let end = Math.min(ops.length, changed[0]! + context + 1);
  const spans: Array<[number, number]> = [];
  for (const index of changed.slice(1)) {
    const nextStart = Math.max(0, index - context);
    if (nextStart <= end) {
      end = Math.min(ops.length, index + context + 1);
    } else {
      spans.push([start, end]);
      start = nextStart;
      end = Math.min(ops.length, index + context + 1);
    }
  }
  spans.push([start, end]);

  for (const [spanStart, spanEnd] of spans) {
    const opsInSpan = ops.slice(spanStart, spanEnd);
    const baseStart = ops.slice(0, spanStart).filter((op) => op.kind !== '+').length;
    const nextStart = ops.slice(0, spanStart).filter((op) => op.kind !== '-').length;
    const baseCount = opsInSpan.filter((op) => op.kind !== '+').length;
    const nextCount = opsInSpan.filter((op) => op.kind !== '-').length;
    hunks.push({ baseStart, baseCount, nextStart, nextCount, ops: opsInSpan });
  }
  return hunks;
}

function formatRange(start: number, count: number): string {
  // Unified convention: a zero-length range starts one line before the boundary.
  return count === 0 ? `${start},0` : `${start + 1},${count}`;
}

export function createUnifiedLineDiff(
  base: string,
  next: string,
  options: LineDiffOptions = {}
): UnifiedLineDiff | DiffBudgetRefusal {
  const { lines: baseLines, eol } = splitKeepingEol(base);
  const { lines: nextLines } = splitKeepingEol(next);

  let prefix = 0;
  while (prefix < baseLines.length && prefix < nextLines.length && baseLines[prefix] === nextLines[prefix]) {
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix < baseLines.length - prefix &&
    suffix < nextLines.length - prefix &&
    baseLines[baseLines.length - 1 - suffix] === nextLines[nextLines.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  const baseMiddle = baseLines.slice(prefix, baseLines.length - suffix);
  const nextMiddle = nextLines.slice(prefix, nextLines.length - suffix);
  const cells = (baseMiddle.length + 1) * (nextMiddle.length + 1);
  if (cells > MAX_DIFF_CELLS) {
    return {
      refused: true,
      code: 'DIFF_BUDGET_EXCEEDED',
      cells,
      cap: MAX_DIFF_CELLS,
      message:
        `Đoạn thay đổi quá lớn để so sánh an toàn (${baseMiddle.length + nextMiddle.length} dòng, ` +
        `giới hạn ${MAX_DIFF_CELLS} ô). Hãy chia nhỏ chỉnh sửa thành nhiều mục.`,
    };
  }

  const ops: Op[] = [
    ...baseLines.slice(0, prefix).map<Op>((line) => ({ kind: ' ', line })),
    ...lcsOps(baseMiddle, nextMiddle),
    ...baseLines.slice(baseLines.length - suffix).map<Op>((line) => ({ kind: ' ', line })),
  ];

  const addedLines = ops.filter((op) => op.kind === '+').length;
  const removedLines = ops.filter((op) => op.kind === '-').length;
  const hunks = buildHunks(ops, options.context ?? 3);

  const out: string[] = [];
  if (hunks.length > 0) {
    if (options.fromLabel !== undefined) out.push(`--- ${options.fromLabel}`);
    if (options.toLabel !== undefined) out.push(`+++ ${options.toLabel}`);
    for (const hunk of hunks) {
      out.push(`@@ -${formatRange(hunk.baseStart, hunk.baseCount)} +${formatRange(hunk.nextStart, hunk.nextCount)} @@`);
      for (const op of hunk.ops) out.push(`${op.kind}${op.line}`);
    }
  }

  return { diffText: out.join(eol), addedLines, removedLines };
}
