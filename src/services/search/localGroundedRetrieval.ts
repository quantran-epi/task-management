/**
 * Scoped Local Grounded Retrieval (BM25 Offline Fallback)
 * D-18, D-21, D-37, D-38, D-39, D-40, D-42, ANSWER-06, ANSWER-07
 */

import { tokenize, rankBM25, type BM25Document } from '../../utils/bm25';
import { normalizeMarkdownForHash, computeSha256 } from '../../db/repositories/documentSetRepo';

export interface LocalEvidenceRange {
  readonly documentId: string;
  readonly documentTitle: string;
  readonly sectionAnchor: string | null;
  readonly lineStart: number;
  readonly lineEnd: number;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly rawSnippet: string;
  readonly contentHash: string;
  readonly score: number;
  readonly matchedTerms: readonly string[];
  readonly setMemberships: readonly { readonly setId: string; readonly setName: string }[];
}

export interface LocalGroundedResult {
  readonly ranges: readonly LocalEvidenceRange[];
  readonly strongEvidence: boolean;
  readonly totalScanned: number;
}

export interface MemberEntry {
  readonly setId: string;
  readonly setName: string;
  readonly documentId: string;
}

export interface LocalGroundedRetrievalInput {
  readonly query: string;
  readonly resolvedSetIds: readonly string[];
  readonly maxResults?: number;
  readonly maxSnippetChars?: number;
}

export interface LocalGroundedRetrievalDeps {
  loadSetMembers(setIds: readonly string[]): Promise<MemberEntry[]>;
  loadNoteBody(documentId: string): Promise<{ title?: string | undefined; body: string; updatedAt?: string | undefined } | null>;
}

export function tokenizeQuery(query: string): string[] {
  return tokenize(query);
}

export function isStrongEvidence(
  ranges: readonly LocalEvidenceRange[],
  queryTokens: readonly string[]
): boolean {
  if (ranges.length === 0) return false;
  const topRange = ranges[0];
  if (!topRange || topRange.score <= 0) return false;

  const distinctMatches = new Set(topRange.matchedTerms);
  if (distinctMatches.size >= 2) return true;

  // Exact identifier or whole-word title match against any query token
  const titleTokens = new Set(tokenize(topRange.documentTitle));
  for (const token of queryTokens) {
    if (titleTokens.has(token)) {
      return true;
    }
  }

  return false;
}

export function strongEvidenceVerdict(result: LocalGroundedResult, queryTokens?: readonly string[]): boolean {
  if (!result.strongEvidence || result.ranges.length === 0) return false;
  if (!queryTokens) {
    return result.ranges.length > 0 && (result.ranges[0]?.score ?? 0) > 0;
  }
  return isStrongEvidence(result.ranges, queryTokens);
}

interface ScoredLineWindow {
  lineStart: number;
  lineEnd: number;
  startOffset: number;
  endOffset: number;
  rawSnippet: string;
  sectionAnchor: string | null;
}

function findBestRange(
  body: string,
  matchedTerms: readonly string[],
  maxSnippetChars: number
): ScoredLineWindow {
  const lines = body.split('\n');
  const termSet = new Set(matchedTerms);

  // Compute start character offset for each line
  const lineOffsets: number[] = new Array(lines.length);
  let runningOffset = 0;
  for (let i = 0; i < lines.length; i++) {
    lineOffsets[i] = runningOffset;
    runningOffset += (lines[i]?.length ?? 0) + 1; // +1 for the newline
  }

  // Find line match scores
  let bestScore = -1;
  let bestLineIdx = 0;

  for (let i = 0; i < lines.length; i++) {
    const lineTokens = tokenize(lines[i] ?? '');
    let matches = 0;
    for (const token of lineTokens) {
      if (termSet.has(token)) {
        matches++;
      }
    }
    if (lines[i]?.startsWith('#') && matches > 0) {
      matches += 2;
    }
    if (matches > bestScore) {
      bestScore = matches;
      bestLineIdx = i;
    }
  }

  // Find nearest preceding markdown heading
  let sectionAnchor: string | null = null;
  for (let i = bestLineIdx; i >= 0; i--) {
    const line = lines[i] ?? '';
    const headingMatch = line.match(/^#{1,6}\s+(.+)$/);
    if (headingMatch && headingMatch[1]) {
      sectionAnchor = headingMatch[1].trim();
      break;
    }
  }

  // Window bounds: near-contiguous up to 6 lines centered around best line
  let windowStartLine = Math.max(0, bestLineIdx - 2);
  let windowEndLine = Math.min(lines.length - 1, windowStartLine + 5);

  // Re-adjust window start if at tail
  if (windowEndLine - windowStartLine < 5 && windowStartLine > 0) {
    windowStartLine = Math.max(0, windowEndLine - 5);
  }

  let startOffset = lineOffsets[windowStartLine] ?? 0;
  let endOffset = (lineOffsets[windowEndLine] ?? 0) + (lines[windowEndLine]?.length ?? 0);

  // Ensure snippet does not exceed maxSnippetChars
  if (endOffset - startOffset > maxSnippetChars) {
    // Shrink lines from ends or clamp offset
    while (windowEndLine > windowStartLine && endOffset - startOffset > maxSnippetChars) {
      windowEndLine--;
      endOffset = (lineOffsets[windowEndLine] ?? 0) + (lines[windowEndLine]?.length ?? 0);
    }
    if (endOffset - startOffset > maxSnippetChars) {
      endOffset = startOffset + maxSnippetChars;
    }
  }

  // Exact slice from original body
  const rawSnippet = body.slice(startOffset, endOffset);

  return {
    lineStart: windowStartLine + 1, // 1-based line numbers
    lineEnd: windowEndLine + 1,     // 1-based line numbers
    startOffset,
    endOffset,
    rawSnippet,
    sectionAnchor,
  };
}

export async function runLocalGroundedRetrieval(
  input: LocalGroundedRetrievalInput,
  deps: LocalGroundedRetrievalDeps
): Promise<LocalGroundedResult> {
  const { query, resolvedSetIds, maxResults = 5, maxSnippetChars = 1200 } = input;

  // D-37: Scoped BM25 restricts corpus to current local document members of resolved sets only.
  // Never falls back to global scan when resolvedSetIds is empty.
  if (resolvedSetIds.length === 0) {
    return {
      ranges: [],
      strongEvidence: false,
      totalScanned: 0,
    };
  }

  const members = await deps.loadSetMembers(resolvedSetIds);
  if (members.length === 0) {
    return {
      ranges: [],
      strongEvidence: false,
      totalScanned: 0,
    };
  }

  // Deduplicate document IDs while aggregating set memberships (D-39)
  const docMembershipsMap = new Map<string, Map<string, string>>();
  for (const m of members) {
    let setsForDoc = docMembershipsMap.get(m.documentId);
    if (!setsForDoc) {
      setsForDoc = new Map<string, string>();
      docMembershipsMap.set(m.documentId, setsForDoc);
    }
    setsForDoc.set(m.setId, m.setName);
  }

  const queryTokens = Array.from(new Set(tokenize(query)));
  if (queryTokens.length === 0) {
    return {
      ranges: [],
      strongEvidence: false,
      totalScanned: docMembershipsMap.size,
    };
  }

  // Load canonical note bodies for resolved set members only
  const bm25Docs: BM25Document[] = [];
  const rawBodies = new Map<string, string>();

  for (const documentId of docMembershipsMap.keys()) {
    const note = await deps.loadNoteBody(documentId);
    if (!note || note.body === undefined || note.body === null) {
      continue;
    }
    rawBodies.set(documentId, note.body);
    bm25Docs.push({
      id: documentId,
      title: note.title ?? '',
      tags: [],
      body: note.body,
      updatedAt: note.updatedAt,
    });
  }

  if (bm25Docs.length === 0) {
    return {
      ranges: [],
      strongEvidence: false,
      totalScanned: 0,
    };
  }

  // Rank with BM25 (Title x3, Tags x2, Body x1)
  const ranked = rankBM25(query, bm25Docs, { limit: maxResults });

  const ranges: LocalEvidenceRange[] = [];
  const seenRanges = new Set<string>();

  for (const match of ranked) {
    if (match.score <= 0) continue;
    const body = rawBodies.get(match.doc.id) ?? '';
    const bestRange = findBestRange(body, match.matchedTerms, maxSnippetChars);

    const rangeKey = `${match.doc.id}:${bestRange.lineStart}:${bestRange.lineEnd}`;
    if (seenRanges.has(rangeKey)) continue;
    seenRanges.add(rangeKey);

    const setMemberships = Array.from(
      docMembershipsMap.get(match.doc.id)?.entries() ?? []
    ).map(([setId, setName]) => ({ setId, setName }));

    const contentHash = await computeSha256(normalizeMarkdownForHash(body));

    ranges.push({
      documentId: match.doc.id,
      documentTitle: match.doc.title,
      sectionAnchor: bestRange.sectionAnchor,
      lineStart: bestRange.lineStart,
      lineEnd: bestRange.lineEnd,
      startOffset: bestRange.startOffset,
      endOffset: bestRange.endOffset,
      rawSnippet: bestRange.rawSnippet,
      contentHash,
      score: match.score,
      matchedTerms: match.matchedTerms,
      setMemberships,
    });
  }

  const strong = isStrongEvidence(ranges, queryTokens);

  return {
    ranges,
    strongEvidence: strong,
    totalScanned: bm25Docs.length,
  };
}
