import {
  ClarificationCandidate,
  ConversationTurn,
} from '../types/retrievalProtocol.js';
import { GraphRetrievalGateway, OperationOptions } from './contracts.js';
import { URN_REGEX } from '../types/graphProtocol.js';

/**
 * Technical identifier regexes:
 * 1. Qualified dot-separated identifiers (Oracle table/package/procedure, Java package.Class)
 * 2. Unqualified uppercase/underscore technical tokens or numeric identifiers (length >= 3, or exact numbers)
 */
const QUALIFIED_IDENTIFIER_REGEX = /^[A-Za-z0-9_#$]+(\.[A-Za-z0-9_#$]+)+$/;
const TOKEN_IDENTIFIER_REGEX = /^[A-Z0-9_]{3,}$/;
const NUMERIC_IDENTIFIER_REGEX = /^\d{4,}$/;

/**
 * Natural language markers, particles, question words, relational verbs, or pronouns.
 * If any of these are present, query is natural language and cannot use fast path.
 */
const NL_EXCLUSION_WORDS = new Set([
  'gì',
  'nào',
  'sao',
  'đâu',
  'ai',
  'cái',
  'này',
  'đó',
  'nó',
  'bước',
  'quy',
  'trình',
  'thủ',
  'tục',
  'bảng',
  'hàm',
  'gọi',
  'tạo',
  'đổi',
  'tên',
  'ảnh',
  'hưởng',
  'chạy',
  'trước',
  'sau',
  'đọc',
  'ghi',
  'chứa',
  'what',
  'which',
  'who',
  'where',
  'why',
  'how',
  'is',
  'are',
  'does',
  'do',
  'calls',
  'called',
  'reads',
  'writes',
  'updated',
  'contains',
  'step',
  'process',
  'table',
  'it',
  'this',
  'that',
]);

const PRONOUN_TOKENS = new Set(['cái này', 'nó', 'đó', 'it', 'this', 'that']);

/**
 * Evaluates whether query is a pure whole-query technical identifier (D-03).
 * Strips optional markdown backticks and trims whitespace.
 * Must match qualified identifier, uppercase token, numeric ID, or URN,
 * and contain NO whitespace or natural-language phrases.
 */
export function isPureIdentifierQuery(rawQuery: string): boolean {
  if (!rawQuery) return false;
  let cleaned = rawQuery.trim();

  // Strip enclosing backticks
  if (cleaned.startsWith('`') && cleaned.endsWith('`') && cleaned.length > 2) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  if (!cleaned) return false;

  // If query contains whitespace, it's not a pure whole-query identifier
  if (/\s/.test(cleaned)) {
    return false;
  }

  // Pure URN check
  if (URN_REGEX.test(cleaned)) {
    return true;
  }

  // Check against technical patterns
  const isQualified = QUALIFIED_IDENTIFIER_REGEX.test(cleaned);
  const isToken = TOKEN_IDENTIFIER_REGEX.test(cleaned);
  const isNumeric = NUMERIC_IDENTIFIER_REGEX.test(cleaned);

  if (!isQualified && !isToken && !isNumeric) {
    return false;
  }

  // Reject if matches any exclusion word in lower case
  const lower = cleaned.toLowerCase();
  if (NL_EXCLUSION_WORDS.has(lower)) {
    return false;
  }

  return true;
}

export type EntityResolutionResult =
  | { readonly status: 'resolved'; readonly resolved: ClarificationCandidate; readonly candidates: readonly ClarificationCandidate[] }
  | { readonly status: 'ambiguous'; readonly candidates: readonly ClarificationCandidate[] }
  | { readonly status: 'needsClarification'; readonly candidates: readonly ClarificationCandidate[] };

/**
 * Extracts searchable candidate tokens from query text.
 */
function extractQueryTokens(query: string): string[] {
  // Strip backticks and common punctuation, keep alphanumeric, dots, underscores
  const cleaned = query.replace(/[`"'?,;:!()]/g, ' ');
  const words = cleaned.split(/\s+/).filter(Boolean);
  const tokens: string[] = [];

  for (const w of words) {
    const trimmed = w.trim();
    if (trimmed.length >= 2) {
      tokens.push(trimmed);
      // If qualified dot-separated, also push parts
      if (trimmed.includes('.')) {
        tokens.push(...trimmed.split('.').filter((p) => p.length >= 2));
      }
    }
  }

  // Deduplicate case-insensitively
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const t of tokens) {
    const lower = t.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      unique.push(t);
    }
  }

  return unique;
}

/**
 * Detects whether the query text refers to an ungrounded pronoun.
 */
function queryHasPronoun(query: string): boolean {
  const lower = query.toLowerCase().trim();
  for (const p of PRONOUN_TOKENS) {
    if (lower === p || lower.includes(p)) {
      return true;
    }
  }
  return false;
}

/**
 * Resolves candidate entities against pinned graph snapshot (D-04, D-05).
 * Enforces recent turns bounded to at most 3, and URNs bounded to 5 per turn.
 */
export async function resolveQueryEntities(
  gateway: GraphRetrievalGateway,
  pinnedSnapshotId: string,
  query: string,
  recentTurns: readonly ConversationTurn[] = [],
  options?: OperationOptions
): Promise<EntityResolutionResult> {
  // 1. Bound recent turns to at most 3
  const boundedTurns = recentTurns.slice(-3);

  // 2. Check recent turns for previously resolved URNs
  const contextUrns: string[] = [];
  for (const turn of boundedTurns) {
    const urns = (turn.resolvedUrns || []).slice(0, 5);
    contextUrns.push(...urns);
  }

  // 3. Check for pronoun reference
  const hasPronoun = queryHasPronoun(query);

  if (hasPronoun && contextUrns.length > 0) {
    // Resolve entity from context URN
    const contextCandidates = await gateway.resolveEntities(
      pinnedSnapshotId,
      contextUrns,
      options
    );
    if (contextCandidates.length === 1) {
      return {
        status: 'resolved',
        resolved: contextCandidates[0]!,
        candidates: contextCandidates,
      };
    }
    if (contextCandidates.length > 1) {
      return {
        status: 'ambiguous',
        candidates: contextCandidates,
      };
    }
  } else if (hasPronoun && contextUrns.length === 0) {
    // Unresolvable pronoun without context -> NEEDS_CLARIFICATION per D-04
    return {
      status: 'needsClarification',
      candidates: [],
    };
  }

  // 4. Extract tokens from query
  const tokens = extractQueryTokens(query);
  if (tokens.length === 0) {
    return {
      status: 'needsClarification',
      candidates: [],
    };
  }

  const rawCandidates = await gateway.resolveEntities(
    pinnedSnapshotId,
    tokens,
    options
  );

  if (rawCandidates.length === 0) {
    return {
      status: 'needsClarification',
      candidates: [],
    };
  }

  // 5. Check if query text provides kind context to disambiguate collisions
  const lowerQuery = query.toLowerCase();
  const processKeywords = ['quy trình', 'process', 'scheduledprocess'];
  const stepKeywords = ['bước', 'step', 'container', 'processstep'];

  const mentionsProcess = processKeywords.some((k) => lowerQuery.includes(k));
  const mentionsStep = stepKeywords.some((k) => lowerQuery.includes(k));

  let filtered = [...rawCandidates];
  if (mentionsProcess && !mentionsStep) {
    const onlyProcess = rawCandidates.filter((c) => c.kind === 'ScheduledProcess');
    if (onlyProcess.length > 0) {
      filtered = onlyProcess;
    }
  } else if (mentionsStep && !mentionsProcess) {
    const onlyStep = rawCandidates.filter((c) => c.kind === 'ProcessStep');
    if (onlyStep.length > 0) {
      filtered = onlyStep;
    }
  }

  if (filtered.length === 1) {
    return {
      status: 'resolved',
      resolved: filtered[0]!,
      candidates: filtered,
    };
  }

  // Multiple candidates -> Ambiguous per D-04
  return {
    status: 'ambiguous',
    candidates: filtered,
  };
}
