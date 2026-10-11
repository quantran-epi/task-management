import { normalizeVietnamese, tokenize } from '../../utils/bm25';

export const DEFAULT_OPERATIONAL_VERBS = [
  'tạo',
  'cập nhật',
  'xóa',
  'đánh dấu',
  'log worklog',
  'pause',
  'resume',
  'finish',
  'assign',
  'move to',
  'set status',
] as const;

export const DEFAULT_KNOWLEDGE_HINTS = [
  'là gì',
  'cách',
  'flow',
  'luồng',
  'phụ thuộc',
  'impact',
  'tra cứu',
  'tìm',
  'theo môi trường',
  'có khác biệt',
] as const;

export type IntentRoute = 'knowledge' | 'operational' | 'mixed' | 'clarify';

export interface RouteIntentResult {
  route: IntentRoute;
  confidence: number;
}

export interface RouteIntentDeps {
  operationalVerbs?: readonly string[];
  knowledgeHints?: readonly string[];
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchTerms(
  normQuery: string,
  terms: readonly string[]
): { matchCount: number; matchedTokens: number } {
  let matchCount = 0;
  let matchedTokens = 0;

  for (const term of terms) {
    const normTerm = normalizeVietnamese(term);
    if (!normTerm) continue;
    const termTokens = tokenize(normTerm);
    if (termTokens.length === 0) continue;

    const regex = new RegExp(`(?:^|\\s)${escapeRegex(normTerm)}(?:$|\\s)`, 'i');
    if (regex.test(normQuery)) {
      matchCount += 1;
      matchedTokens += termTokens.length;
    }
  }

  return { matchCount, matchedTokens };
}

export function routeIntent(
  query: string,
  deps?: RouteIntentDeps
): RouteIntentResult {
  const normQuery = normalizeVietnamese(query);
  const queryTokens = tokenize(query);

  if (!normQuery || queryTokens.length === 0) {
    return { route: 'clarify', confidence: 0 };
  }

  const operationalVerbs = deps?.operationalVerbs ?? DEFAULT_OPERATIONAL_VERBS;
  const knowledgeHints = deps?.knowledgeHints ?? DEFAULT_KNOWLEDGE_HINTS;

  const opMatch = matchTerms(normQuery, operationalVerbs);
  const knMatch = matchTerms(normQuery, knowledgeHints);

  const opScore =
    opMatch.matchCount > 0
      ? Math.min(1, opMatch.matchCount * 0.35 + (opMatch.matchedTokens / queryTokens.length) * 0.3)
      : 0;

  const knScore =
    knMatch.matchCount > 0
      ? Math.min(1, knMatch.matchCount * 0.35 + (knMatch.matchedTokens / queryTokens.length) * 0.3)
      : 0;

  // Rule: If both scores > threshold (0.3) -> 'mixed'
  if (opScore > 0.3 && knScore > 0.3) {
    const confidence = Number(((opScore + knScore) / 2).toFixed(2));
    return { route: 'mixed', confidence };
  }

  // Rule: If one score dominates by ratio >= 2 -> that route, confidence proportional
  if (opScore > 0 && (knScore === 0 || opScore / knScore >= 2)) {
    const confidence =
      knScore === 0
        ? Number(Math.min(1, opScore).toFixed(2))
        : Number((opScore / (opScore + knScore)).toFixed(2));
    return { route: 'operational', confidence };
  }

  if (knScore > 0 && (opScore === 0 || knScore / opScore >= 2)) {
    const confidence =
      opScore === 0
        ? Number(Math.min(1, knScore).toFixed(2))
        : Number((knScore / (opScore + knScore)).toFixed(2));
    return { route: 'knowledge', confidence };
  }

  // Else -> 'clarify' with confidence 0
  return { route: 'clarify', confidence: 0 };
}
