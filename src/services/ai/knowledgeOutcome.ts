/**
 * Shared, dependency-free knowledge outcome vocabulary and canonical rendering.
 *
 * This module owns the single application-authored notice for the
 * "server has no published sets" outcome (D-12/D-13). It is imported by every
 * live surface — the React AI Chat drawer and the headless Telegram worker —
 * so no surface authors its own copy and the model never owns the copy.
 *
 * No React, no DOM, no browser-only API, no new package: usable from a worker.
 */

/** D-12: the one canonical, verbatim empty-server notice. */
export const KNOWLEDGE_SERVER_EMPTY_NOTICE =
  'Knowledge Server chưa có bộ tài liệu nào được publish. Hãy publish ít nhất một bộ tài liệu từ thiết bị có tài liệu, rồi thử lại.';

export const KNOWLEDGE_OUTCOME_CODES = [
  'NO_PUBLISHED_SETS',
  'NO_EVIDENCE',
  'UNREACHABLE',
] as const;

export type KnowledgeOutcomeCode = (typeof KNOWLEDGE_OUTCOME_CODES)[number];

export type KnowledgeOutcomeGuide = 'publish' | 'refine' | 'unavailable';

const KNOWLEDGE_OUTCOME_CODE_SET: ReadonlySet<string> = new Set(KNOWLEDGE_OUTCOME_CODES);

/**
 * Mirrors `normalizeToolName` from aiTools.ts locally so the headless worker
 * does not pull the full AI tool graph. Kept byte-for-byte equivalent for the
 * wrappers chat surfaces see (9router `_ide`/`_cc`/`_tool`, `proxy_`/`tool_`).
 */
function normalizeToolName(toolName: string): string {
  if (!toolName) return '';
  let name = toolName.trim();
  name = name.replace(/(_ide|_cc|_tool)$/, '');
  name = name.replace(/^(proxy_|tool_)/, '');
  return name;
}

/**
 * Detect a structured knowledge outcome from a `retrieve_knowledge` tool result.
 * Defensive: any non-JSON, non-object, unknown tool, or unrecognized code
 * returns null. No dynamic key access, no throw (T-28-12).
 */
export function detectKnowledgeToolOutcome(
  toolName: string,
  rawResult: string
): KnowledgeOutcomeCode | null {
  if (normalizeToolName(toolName) !== 'retrieve_knowledge') return null;
  if (typeof rawResult !== 'string' || rawResult.length === 0) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawResult);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

  const record = parsed as Record<string, unknown>;
  const candidates: unknown[] = [record.outcome];
  const status = record.status;
  if (status && typeof status === 'object' && !Array.isArray(status)) {
    candidates.push((status as Record<string, unknown>).code);
  }

  for (const candidate of candidates) {
    if (
      typeof candidate === 'string' &&
      KNOWLEDGE_OUTCOME_CODE_SET.has(candidate)
    ) {
      return candidate as KnowledgeOutcomeCode;
    }
  }
  return null;
}

/**
 * Map a detected outcome to the app-owned notice (if any) and the guide id
 * each live surface uses to pick its existing user-facing next-step copy.
 */
export function resolveKnowledgeOutcomeRender(code: KnowledgeOutcomeCode): {
  notice: string | null;
  guide: KnowledgeOutcomeGuide;
} {
  switch (code) {
    case 'NO_PUBLISHED_SETS':
      return { notice: KNOWLEDGE_SERVER_EMPTY_NOTICE, guide: 'publish' };
    case 'NO_EVIDENCE':
      return { notice: null, guide: 'refine' };
    case 'UNREACHABLE':
      return { notice: null, guide: 'unavailable' };
  }
}
