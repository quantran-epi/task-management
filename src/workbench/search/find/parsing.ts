import type { RemoteGrepHit } from '../../../types/gitRemote';

export interface MatchOptions {
  literal: boolean;
  matchCase: boolean;
  words: boolean;
}

/** UTF-16 [start,end] range in one text line. Indices only — remote text is never markup. */
export interface MatchRow {
  path: string;
  line: number;
  text: string;
  ranges: Array<[number, number]>;
  /** Files/Folders roster count from the tree entry; content hits leave it undefined. */
  count?: number;
}

export interface PreviewMark {
  line: number;
  ranges: Array<[number, number]>;
}

interface MatchableOptions extends MatchOptions {
  regex?: boolean;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Compute UTF-16 match ranges for one text string. The single source of match positions used by
 * both result rows and preview; literal/regex + word options are supported. Non-matching pattern
 * yields []. No raw stdout is consumed — callers pass committed hit text only.
 */
export function matchRanges(text: string, pattern: string, options: MatchableOptions): Array<[number, number]> {
  if (!pattern) return [];
  const regexMode = options.regex === true || options.literal === false;
  let source = regexMode ? pattern : escapeRegExp(pattern);
  if (options.words) {
    const boundary = String.fromCharCode(92) + 'b';
    source = `${boundary}(?:${source})${boundary}`;
  }
  let re: RegExp;
  try {
    re = new RegExp(source, options.matchCase ? 'g' : 'gi');
  } catch {
    return []; // malformed user regex must never crash the renderer; truthful empty result
  }
  const ranges: Array<[number, number]> = [];
  for (const m of text.matchAll(re)) {
    if (m[0].length === 0) continue; // zero-width match would produce broken <mark> markup
    const start = m.index ?? 0;
    ranges.push([start, start + m[0].length]);
  }
  return ranges;
}

/**
 * Map the RemoteGrepHit[] already committed by FindSession into display rows — one row per hit,
 * with path/line/text preserved and ranges derived from each hit's text. No second stdout parser.
 */
export function hitsToMatchRows(
  hits: readonly RemoteGrepHit[],
  pattern: string,
  options: MatchOptions
): MatchRow[] {
  return hits.map((hit) => ({
    path: hit.path,
    line: hit.line,
    text: hit.text,
    ranges: matchRanges(hit.text, pattern, options),
  }));
}

/** Per-line match ranges for the whole loaded preview file (all occurrences, not just active). */
export function previewMatchRanges(
  content: string,
  pattern: string,
  options: MatchOptions
): PreviewMark[] {
  const lines = content.split('\n');
  const marks: PreviewMark[] = [];
  lines.forEach((line, i) => {
    const ranges = matchRanges(line, pattern, { ...options, regex: false });
    if (ranges.length) marks.push({ line: i + 1, ranges });
  });
  return marks;
}
