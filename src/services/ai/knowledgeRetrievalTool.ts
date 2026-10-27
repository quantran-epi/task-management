import type { TaskPlannerDatabase } from '../../db';
import { createKnowledgeClient } from '../knowledge/knowledgeClient';
import { packEvidence } from './evidencePack';
import { fetchSetCatalog } from '../../db/repositories/documentSetRepo';

export interface KnowledgeRetrievalArgs {
  query?: string;
  setIds?: string[];
  limit?: number;
}

export function getKnowledgeServerConfigFromDb(db: TaskPlannerDatabase) {
  return Promise.all([
    db.settings.get('knowledge_server_enabled'),
    db.settings.get('knowledge_server_base_url'),
    db.settings.get('knowledge_server_token'),
  ]).then(([enabled, baseUrl, token]) => ({
    enabled: enabled?.value === true,
    baseUrl: typeof baseUrl?.value === 'string' ? baseUrl.value : '',
    token: typeof token?.value === 'string' ? token.value : '',
  }));
}

/**
 * Analysis-mode retrieval: federated hybrid retrieval packed into a compact,
 * model-readable evidence payload. Unlike grounded synthesis, nothing is
 * dropped for "relevance" — the model decides what matters.
 */
export async function executeKnowledgeRetrievalTool(
  args: KnowledgeRetrievalArgs,
  db: TaskPlannerDatabase
): Promise<string> {
  const query = typeof args.query === 'string' ? args.query.trim() : '';
  if (!query) return JSON.stringify({ error: 'query string parameter is required' });

  const config = await getKnowledgeServerConfigFromDb(db);
  if (!config.enabled || !config.baseUrl) {
    return JSON.stringify({
      error:
        'Knowledge server chưa được bật hoặc chưa cấu hình base URL. Hãy bật trong Cài đặt tri thức.',
    });
  }

  // FederatedRetrievalRequestSchema requires 10 <= limit <= 50.
  const limit = Math.min(Math.max(10, Number(args.limit) || 20), 50);
  const requestedSetIds = Array.isArray(args.setIds) ? args.setIds.filter(Boolean) : [];
  const catalog = requestedSetIds.length > 0 ? [] : await fetchSetCatalog(db);
  const setIdList =
    requestedSetIds.length > 0 ? requestedSetIds : catalog.map((entry) => entry.setId);
  if (setIdList.length === 0) {
    return JSON.stringify({ error: 'Chưa có bộ tài liệu nào để tra cứu.' });
  }

  try {
    const client = createKnowledgeClient({
      baseUrl: config.baseUrl,
      token: config.token,
      db,
    });
    const response = await client.retrieveFederated({
      query,
      setTierAssignments: setIdList.map((setId) => ({
        setId,
        tier: 'REQUIRED' as const,
        roleGroup: 'baseline' as const,
      })),
      comparisonMode: 'single' as const,
      budgets: {
        concurrency: 4,
        elapsedMs: 60_000,
        maxSets: 10,
        maxItems: 50,
        maxEvidenceChars: 80_000,
      },
      limit,
      includeInferred: true,
      recentTurns: [],
    });

    const pack = packEvidence({ authority: 'server', serverResponse: response });
    return JSON.stringify({
      outcome: response.outcome,
      excerpts: pack.promptEvidence.map((item) => ({
        id: item.id,
        title: item.documentTitle,
        section: item.sectionAnchor ?? null,
        text: item.text,
      })),
      entities: (pack.entities ?? []).map((entity) => ({
        urn: entity.urn,
        name: entity.canonicalName,
        kind: entity.kind,
      })),
      paths: Object.values(pack.paths).map((path) => ({
        pathId: path.pathId,
        nodes: path.nodeUrns,
        classification: path.classification,
      })),
      warnings: [...new Set(pack.coverageWarnings)],
    });
  } catch (err: any) {
    return JSON.stringify({
      error: `Truy vấn tri thức thất bại: ${err?.message || String(err)}`,
    });
  }
}
