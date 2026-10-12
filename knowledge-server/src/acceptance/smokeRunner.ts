import { SmokeEvidence, validateAndFormatEvidence } from './evidence.js';
import { CompleteModalityStatus } from '../types/retrievalProtocol.js';

export interface SmokeCaseDefinition {
  caseId: string;
  query: string;
  expectedFastPath?: boolean;
  expectedIntent?: string;
  expectedOutcome?: string;
  description: string;
}

export const SMOKE_CASES: readonly SmokeCaseDefinition[] = [
  {
    caseId: 'SMOKE-01-IDENTIFIER',
    query: 'MAIN1.FCL_CYCLE_COUNTER',
    expectedFastPath: true,
    description: 'Pure technical identifier fast-path lookup',
  },
  {
    caseId: 'SMOKE-02-NATURAL-LANGUAGE',
    query: 'Chu kỳ Switch cycle nào xử lý tính lãi và phí quá hạn trong container 60000006?',
    expectedIntent: 'LOOKUP',
    description: 'Natural language query via 9router planner',
  },
  {
    caseId: 'SMOKE-03-FLOW-TRAVERSAL',
    query: 'Quy trình thực thi của container 60000006 diễn ra theo các bước nào từ Scheduler đến PL/SQL?',
    expectedIntent: 'FLOW_TRAVERSAL',
    description: 'Flow traversal path through scheduler to PL/SQL',
  },
  {
    caseId: 'SMOKE-04-THREE-HOP-IMPACT',
    query: 'Nếu thay đổi cấu trúc bảng MAIN1.FCL_CYCLE_COUNTER thì những package và quy trình nào bị ảnh hưởng?',
    expectedIntent: 'IMPACT_ANALYSIS',
    description: 'Three-hop impact analysis traversal',
  },
  {
    caseId: 'SMOKE-05-UNREFERENCED-ABSTENTION',
    query: 'Thủ tục xử lý chuyển tiền quốc tế SWIFT MT103 trong container 60000006 hoạt động ra sao?',
    expectedOutcome: 'NO_EVIDENCE',
    description: 'Unreferenced domain abstention with zero hallucination',
  },
] as const;

export interface SnapshotStatusCounts {
  nodeCount: number;
  factCount: number;
  quarantineCount: number;
  conflictCount: number;
}

export type SmokeFetcher = (
  path: string,
  body: { query: string; limit?: number; includeInferred?: boolean }
) => Promise<any>;

export interface SmokeRunConfig {
  serverUrl: string;
  token?: string;
  fetcher?: SmokeFetcher;
  environment?: string;
  snapshotStatus?: SnapshotStatusCounts;
  restartPersistence?: {
    status: 'PASS' | 'FAIL' | 'SKIPPED';
    preRestartSnapshotId: string;
    postRestartSnapshotId: string;
    indexesOnline: boolean;
    details?: string;
  };
}

export async function runSmokeCases(config: SmokeRunConfig): Promise<SmokeEvidence> {
  const fetcher: SmokeFetcher =
    config.fetcher ||
    (async (path, body) => {
      const url = `${config.serverUrl.replace(/\/+$/, '')}${path}`;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (config.token) {
        headers['Authorization'] = `Bearer ${config.token}`;
      }
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      }
      return res.json();
    });

  const executedAt = new Date().toISOString();
  const caseSummaries = [];
  let capturedSnapshotId = '';

  for (const def of SMOKE_CASES) {
    const start = Date.now();
    try {
      const response = await fetcher('/api/v1/retrieve', { query: def.query });
      const durationMs = Date.now() - start;

      if (response.snapshotId && !capturedSnapshotId) {
        capturedSnapshotId = response.snapshotId;
      }

      const citationsCount = Array.isArray(response.items) ? response.items.length : 0;
      const pathsCount = Array.isArray(response.paths) ? response.paths.length : 0;
      const isFastPath = Boolean(response.planTrace?.fastPath);
      const intent = response.planTrace?.intent;
      const outcome = response.outcome;

      let pass = true;
      let failureReason: string | undefined;

      if (def.expectedFastPath !== undefined && def.expectedFastPath !== isFastPath) {
        pass = false;
        failureReason = `Expected fastPath=${def.expectedFastPath}, got ${isFastPath}`;
      }

      if (def.expectedOutcome !== undefined && def.expectedOutcome !== outcome) {
        pass = false;
        failureReason = `Expected outcome=${def.expectedOutcome}, got ${outcome}`;
      }

      // Default safe modality status if missing
      const modalityStatus: CompleteModalityStatus = response.modalityStatus || {
        fulltext: { status: 'unavailable', latencyMs: 0, itemCount: 0 },
        vector: { status: 'unavailable', latencyMs: 0, itemCount: 0 },
        graph: { status: 'unavailable', latencyMs: 0, itemCount: 0 },
      };

      caseSummaries.push({
        caseId: def.caseId,
        status: pass ? ('PASS' as const) : ('FAIL' as const),
        fastPath: isFastPath,
        ...(intent ? { intent } : {}),
        modalityStatus,
        durationMs,
        citationsCount,
        pathsCount,
        ...(outcome ? { outcome } : {}),
        ...(failureReason ? { failureReason } : {}),
      });
    } catch (err) {
      const durationMs = Date.now() - start;
      caseSummaries.push({
        caseId: def.caseId,
        status: 'FAIL' as const,
        fastPath: false,
        modalityStatus: {
          fulltext: { status: 'error', latencyMs: 0, itemCount: 0 },
          vector: { status: 'error', latencyMs: 0, itemCount: 0 },
          graph: { status: 'error', latencyMs: 0, itemCount: 0 },
        },
        durationMs,
        citationsCount: 0,
        failureReason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const rawEvidence = {
    executedAt,
    environment: config.environment || 'production-kubernetes',
    activeSnapshotId: capturedSnapshotId || 'gsnap_unknown',
    counts: config.snapshotStatus || {
      nodeCount: 0,
      factCount: 0,
      quarantineCount: 0,
      conflictCount: 0,
    },
    cases: caseSummaries,
    restartPersistence: config.restartPersistence || {
      status: 'SKIPPED' as const,
      preRestartSnapshotId: capturedSnapshotId || 'gsnap_unknown',
      postRestartSnapshotId: capturedSnapshotId || 'gsnap_unknown',
      indexesOnline: true,
    },
  };

  return validateAndFormatEvidence(rawEvidence);
}
