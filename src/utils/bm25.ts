/**
 * Offline BM25 Lexical Ranking & Vietnamese Normalization Engine
 * D-10, D-11, REQ-14.2
 */

export interface BM25Document {
  id: string;
  title: string;
  tags: string[];
  body: string;
  updatedAt?: string | undefined;
}

export interface BM25ScoredResult {
  doc: BM25Document;
  score: number;
  matchedTerms: string[];
}

/**
 * Normalizes Vietnamese text by stripping diacritics and converting to lowercase base Latin.
 */
export function normalizeVietnamese(text: string): string {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

/**
 * Tokenizes text into lowercase alpha-numeric words with length > 1.
 * Defense against DoS: regex uses non-backtracking character classes.
 */
export function tokenize(text: string): string[] {
  if (!text) return [];
  const normalized = normalizeVietnamese(text);
  return normalized
    .split(/[^a-z0-9_]+/i)
    .filter((token) => token.length > 1);
}

/**
 * Ranks documents using Okapi BM25 algorithm with field weighting:
 * Title tokens: x3 weight
 * Tag tokens:   x2 weight
 * Body tokens:  x1 weight
 */
export function rankBM25(
  query: string,
  docs: BM25Document[],
  options?: { k1?: number; b?: number; limit?: number }
): BM25ScoredResult[] {
  const queryTokens = Array.from(new Set(tokenize(query)));
  if (queryTokens.length === 0 || docs.length === 0) return [];

  const k1 = options?.k1 ?? 1.2;
  const b = options?.b ?? 0.75;
  const limit = options?.limit ?? 50;

  // Process doc tokens with field weights (Title x3, Tags x2, Body x1)
  const docTokensMap = new Map<string, string[]>();
  let totalLength = 0;

  for (const doc of docs) {
    const titleTokens = tokenize(doc.title);
    const tagTokens = doc.tags.flatMap(tokenize);
    const bodyTokens = tokenize(doc.body);

    const weightedTokens = [
      ...titleTokens,
      ...titleTokens,
      ...titleTokens,
      ...tagTokens,
      ...tagTokens,
      ...bodyTokens,
    ];

    docTokensMap.set(doc.id, weightedTokens);
    totalLength += weightedTokens.length;
  }

  const avgdl = totalLength / docs.length;
  const N = docs.length;

  const results: BM25ScoredResult[] = [];

  for (const doc of docs) {
    const tokens = docTokensMap.get(doc.id) || [];
    const docLen = tokens.length;
    let score = 0;
    const matchedTerms: string[] = [];

    // Pre-calculate frequencies for tokens in this document
    const termCounts = new Map<string, number>();
    for (const token of tokens) {
      termCounts.set(token, (termCounts.get(token) || 0) + 1);
    }

    for (const qTerm of queryTokens) {
      // Document frequency: number of docs containing qTerm
      let df = 0;
      for (const d of docs) {
        const dTokens = docTokensMap.get(d.id);
        if (dTokens && dTokens.includes(qTerm)) {
          df++;
        }
      }

      if (df === 0) continue;

      // Robertson-Spärck Jones IDF with smoothing
      const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);

      const tf = termCounts.get(qTerm) || 0;
      if (tf > 0) {
        matchedTerms.push(qTerm);
        const numerator = tf * (k1 + 1);
        const denominator = tf + k1 * (1 - b + (b * (avgdl > 0 ? docLen / avgdl : 1)));
        score += idf * (numerator / denominator);
      }
    }

    if (score > 0) {
      results.push({ doc, score, matchedTerms });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

/**
 * Extracts a relevant snippet from the document body for context grounding.
 * Locates the heading or paragraph with the highest query match density
 * and extracts context within maxChars limit.
 */
export function extractRelevantSnippet(
  body: string,
  query: string,
  maxChars = 1500
): string {
  if (!body) return '';
  const trimmed = body.trim();
  if (trimmed.length <= maxChars) return trimmed;

  const queryTerms = tokenize(query);
  if (queryTerms.length === 0) {
    if (trimmed.length <= maxChars) return trimmed;
    const truncated = trimmed.slice(0, Math.max(0, maxChars - 3));
    return truncated + '...';
  }

  // Split body by lines or paragraphs
  const lines = trimmed.split('\n');
  let bestScore = -1;
  let bestLineIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const lineTokens = tokenize(lines[i] || '');
    let matches = 0;
    for (const term of queryTerms) {
      if (lineTokens.includes(term)) {
        matches++;
      }
    }
    // Headings get slight boost in snippet priority
    if (lines[i]?.startsWith('#') && matches > 0) {
      matches += 2;
    }
    if (matches > bestScore) {
      bestScore = matches;
      bestLineIndex = i;
    }
  }

  if (bestScore <= 0) {
    if (trimmed.length <= maxChars) return trimmed;
    const truncated = trimmed.slice(0, Math.max(0, maxChars - 3));
    return truncated + '...';
  }

  // Find nearest preceding heading to provide context
  let headingContext = '';
  for (let i = bestLineIndex; i >= 0; i--) {
    if (lines[i]?.startsWith('#')) {
      headingContext = lines[i] + '\n';
      break;
    }
  }

  // Collect lines around bestLineIndex
  const snippetLines: string[] = [];
  let currentLen = headingContext.length;

  const start = Math.max(0, bestLineIndex - 2);
  const end = Math.min(lines.length - 1, bestLineIndex + 8);

  for (let i = start; i <= end; i++) {
    const line = lines[i] ?? '';
    if (currentLen + line.length + 1 > maxChars) break;
    snippetLines.push(line);
    currentLen += line.length + 1;
  }

  const result = (headingContext && !snippetLines[0]?.startsWith('#') ? headingContext : '') + snippetLines.join('\n');
  return result.trim();
}
