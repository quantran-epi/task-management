import { generateId } from '../../utils/uuid';
import { DLP_RULESET_VERSION } from '../../types/dlp';
import type { DlpAuditInput } from '../../types/dlp';
import type { DlpAuditRecord } from '../../types/models';

/**
 * Builds a content-free DlpAuditRecord from already-computed hashes and categories (D-18, T-16-10).
 * Never accepts or returns raw text, titles, bodies, tags, or matched secret excerpts.
 */
export function buildDlpAuditRecord(input: DlpAuditInput): DlpAuditRecord {
  const categoryCounts: Record<string, number> = {};
  for (const cat of input.findingCategories) {
    categoryCounts[cat] = (categoryCounts[cat] ?? 0) + 1;
  }

  return {
    id: generateId(),
    setId: input.setId,
    attemptId: input.attemptId,
    ruleSetVersion: DLP_RULESET_VERSION,
    timestamp: new Date().toISOString(),
    documentIds: [...input.documentIds],
    contentHashes: [...input.contentHashes],
    findingCountsByCategory: categoryCounts,
    userAction: input.userAction,
  };
}
