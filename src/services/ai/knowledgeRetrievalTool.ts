import type { TaskPlannerDatabase } from '../../db';
import { createKnowledgeClient } from '../knowledge/knowledgeClient';
import { packEvidence } from './evidencePack';

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
  db: TaskPlannerDatabase,
  signal?: AbortSignal
): Promise<string> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
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

  try {
    const client = createKnowledgeClient({
      baseUrl: config.baseUrl,
      token: config.token,
      db,
    });
    const response = await client.retrieveFederated(
      {
        query,
        limit,
        includeInferred: true,
        recentTurns: [],
        ...(requestedSetIds.length > 0 ? { setIds: requestedSetIds } : {}),
      },
      signal
    );

    const pack = packEvidence({ authority: 'server', serverResponse: response });
    const coverage = response.diagnostics.coverage ?? [];
    const excerpts = pack.promptEvidence.map((item) => {
      const citation = pack.citations[item.id] ?? pack.citations[item.id.replace(/^[SLM]/, '')];
      return {
        id: item.id,
        title: item.documentTitle,
        section: item.sectionAnchor ?? null,
        text: item.text,
        setId: citation?.setMemberships[0]?.setId ?? null,
        snapshotId: citation?.snapshotId ?? null,
      };
    });
    const searchedSetCount = new Set(excerpts.map((e) => e.setId).filter(Boolean)).size;
    return JSON.stringify({
      outcome: response.outcome,
      excerpts,
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
      sets: coverage.map((entry) => ({
        setId: entry.setId,
        state: entry.state,
        publishedSnapshotId: entry.publishedSnapshotId,
        retrievalSnapshotId: entry.retrievalSnapshotId,
        staleIndex: entry.staleIndex,
      })),
      status: {
        code: response.outcome,
        publishedSetCount: coverage.length,
        searchedSetCount,
        contributedSetCount: coverage.filter((entry) => entry.state === 'CONTRIBUTED').length,
      },
    });
  } catch (err: any) {
    if (err?.name === 'AbortError' || signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    return JSON.stringify({
      error: `Truy vấn tri thức thất bại: ${err?.message || String(err)}`,
    });
  }
}
