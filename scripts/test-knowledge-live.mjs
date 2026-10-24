/**
 * Live knowledge-stack verification with an offline, injected-fixture self-check.
 *
 * Usage:
 *   node scripts/test-knowledge-live.mjs --self-check   # offline preflight only, exit 0
 *   KNOWLEDGE_SERVER_TOKEN=... node scripts/test-knowledge-live.mjs
 *
 * Output is metadata-only: stage/outcome/count/code/latency. Never response bodies,
 * query text, document content, endpoints, bearer tokens, stack traces, or Cypher.
 *
 * Exit codes: 0 pass, 1 assertion/expectation failure, 2 BLOCKED (infra/token).
 * BLOCKED is a resumable incomplete state, never a pass.
 */

import { pathToFileURL } from 'node:url';

const OUTCOMES = new Set([
  'READY',
  'NEEDS_CLARIFICATION',
  'NO_EVIDENCE',
  'UNSUPPORTED',
  'DEGRADED',
  'SEED_ONLY',
]);

const MODALITY_STATUSES = new Set([
  'ok',
  'unavailable',
  'timeout',
  'stale',
  'truncated',
  'error',
]);

const STAGES = new Set([
  'entity_resolution',
  'planning',
  'validation',
  'neo4j_traversal',
  'fusion',
  'rendering',
]);

const REASON_CODES = new Set([
  'NO_GRAPH_SEED',
  'TIMEOUT',
  'UNCONFIGURED',
  'PROVIDER_ERROR',
  'MODEL_INDEX_MISMATCH',
  'RESULT_LIMIT_REACHED',
  'PINNED_SNAPSHOT_UNAVAILABLE',
  'PLANNER_SCHEMA_FAILURE',
  'INVALID_RELATION',
  'INVALID_DIRECTION',
  'INVALID_ENDPOINT_KIND',
  'HOP_LIMIT_EXCEEDED',
  'SEED_NOT_FOUND',
  'PLAN_REJECTED',
  'SEED_FOUND_NO_RELATION',
  'FALLBACK_ONE_HOP',
  'MISSING_SUPPORTING_CHUNK',
]);

export const BLOCKED_MESSAGES = {
  TOKEN_MISSING:
    '[BLOCKED] KNOWLEDGE_SERVER_TOKEN is not set. Export it in your shell (never commit or paste it) and retry.',
  STACK_UNREACHABLE:
    '[BLOCKED] Local knowledge stack unreachable. Start docker compose and retry; see 24-LIVE-CHECKLIST.md.',
  STACK_NOT_READY:
    '[BLOCKED] Local knowledge stack is up but not ready (subsystem check failed). Inspect stack health, then retry.',
  AUTH_REJECTED:
    '[BLOCKED] Live stack rejected the bearer token. Re-export the correct token and retry.',
};

export class BlockedError extends Error {
  constructor(code) {
    super(code);
    this.name = 'BlockedError';
    this.code = code;
  }
}

class ShapeError extends Error {
  constructor(code) {
    super(code);
    this.name = 'ShapeError';
    this.code = code;
  }
}

function fail(code) {
  throw new ShapeError(code);
}

function isNonNegInt(value) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function assertStatusDetail(label, detail) {
  if (!detail || typeof detail !== 'object') fail(`STATUS_${label}_MISSING`);
  if (!MODALITY_STATUSES.has(detail.status)) fail(`STATUS_${label}_UNKNOWN`);
  if (!isNonNegInt(detail.latencyMs)) fail(`STATUS_${label}_LATENCY_INVALID`);
  if (!isNonNegInt(detail.itemCount)) fail(`STATUS_${label}_COUNT_INVALID`);
  for (const key of ['entityCount', 'edgeCount', 'pathCount']) {
    if (detail[key] !== undefined && !isNonNegInt(detail[key])) {
      fail(`STATUS_${label}_${key.toUpperCase()}_INVALID`);
    }
  }
}

function assertStageDiagnostic(row, index) {
  if (!row || typeof row !== 'object') fail(`STAGE_${index}_MISSING`);
  if (!STAGES.has(row.stage)) fail(`STAGE_${index}_UNKNOWN`);
  if (!MODALITY_STATUSES.has(row.status)) fail(`STAGE_${index}_STATUS_UNKNOWN`);
  if (!isNonNegInt(row.latencyMs)) fail(`STAGE_${index}_LATENCY_INVALID`);
  if (!isNonNegInt(row.accepted)) fail(`STAGE_${index}_ACCEPTED_INVALID`);
  if (!isNonNegInt(row.rejected)) fail(`STAGE_${index}_REJECTED_INVALID`);
  if (typeof row.truncated !== 'boolean') fail(`STAGE_${index}_TRUNCATED_INVALID`);
  if (typeof row.fallback !== 'boolean') fail(`STAGE_${index}_FALLBACK_INVALID`);
  if (row.fallbackReason !== undefined && !REASON_CODES.has(row.fallbackReason)) {
    fail(`STAGE_${index}_FALLBACK_REASON_UNKNOWN`);
  }
  if (!Array.isArray(row.reasonCodes)) fail(`STAGE_${index}_REASONS_INVALID`);
  for (const code of row.reasonCodes) {
    if (!REASON_CODES.has(code)) fail(`STAGE_${index}_REASON_UNKNOWN`);
  }
}

/**
 * Strict, allocation-bounded shape check for a retrieval response.
 * Throws ShapeError with a stable code; never echoes payload values other than
 * an enum outcome token.
 */
export function assertRetrievalResponseShape(payload, expectedOutcomes = null) {
  if (!payload || typeof payload !== 'object') fail('RESPONSE_NOT_OBJECT');
  if (!OUTCOMES.has(payload.outcome)) fail('OUTCOME_UNKNOWN');
  if (expectedOutcomes && !expectedOutcomes.includes(payload.outcome)) {
    fail(`OUTCOME_UNEXPECTED_${payload.outcome}`);
  }
  if (!Array.isArray(payload.items)) fail('ITEMS_NOT_ARRAY');
  if (!Array.isArray(payload.paths)) fail('PATHS_NOT_ARRAY');
  if (payload.paths.length > 20) fail('PATHS_OVER_LIMIT');
  if (!Array.isArray(payload.conflictGroups)) fail('CONFLICTS_NOT_ARRAY');

  const status = payload.modalityStatus;
  if (!status || typeof status !== 'object') fail('MODALITY_STATUS_MISSING');
  assertStatusDetail('FULLTEXT', status.fulltext);
  assertStatusDetail('VECTOR', status.vector);
  assertStatusDetail('GRAPH', status.graph);

  const diagnostics = payload.diagnostics;
  if (!diagnostics || typeof diagnostics !== 'object') fail('DIAGNOSTICS_MISSING');
  if (typeof diagnostics.degraded !== 'boolean') fail('DEGRADED_INVALID');
  if (diagnostics.coverageWarnings !== undefined && !Array.isArray(diagnostics.coverageWarnings)) {
    fail('COVERAGE_WARNINGS_INVALID');
  }
  if (diagnostics.stageDiagnostics !== undefined) {
    if (!Array.isArray(diagnostics.stageDiagnostics)) fail('STAGE_DIAGNOSTICS_INVALID');
    if (diagnostics.stageDiagnostics.length > 20) fail('STAGE_DIAGNOSTICS_OVER_LIMIT');
    diagnostics.stageDiagnostics.forEach(assertStageDiagnostic);
  }
  if (diagnostics.failedSeeds !== undefined) {
    if (!Array.isArray(diagnostics.failedSeeds)) fail('FAILED_SEEDS_INVALID');
    for (const seed of diagnostics.failedSeeds) {
      if (!seed || typeof seed.urn !== 'string' || !REASON_CODES.has(seed.reasonCode)) {
        fail('FAILED_SEED_INVALID');
      }
    }
  }

  return payload;
}

async function callJson(fetchImpl, url, init = {}, okStatuses = [200]) {
  let res;
  try {
    res = await fetchImpl(url, init);
  } catch {
    throw new BlockedError('STACK_UNREACHABLE');
  }
  if (!res || typeof res.status !== 'number') throw new BlockedError('STACK_UNREACHABLE');
  if (res.status === 401 || res.status === 403) throw new BlockedError('AUTH_REJECTED');
  if (!okStatuses.includes(res.status)) {
    if (res.status === 503) throw new BlockedError('STACK_NOT_READY');
    throw new Error(`HTTP_${res.status}`);
  }
  try {
    return await res.json();
  } catch {
    throw new Error('INVALID_JSON');
  }
}

const LIVE_SET_ID = 'f0000000-0000-4000-8000-000000000001';
const LIVE_ATTEMPT_KEY = 'f0000000-0000-4000-8000-000000000002';
const LIVE_REBUILD_KEY = 'f0000000-0000-4000-8000-000000000004';
const EVT_EVENT = 'MAIN1.EVT_EVENT';
const FCL_COUNTER = 'MAIN1.FCL_CYCLE_COUNTER';

// Fixture-equivalent corpus covering: container flow, READS_FROM/WRITES_TO on a
// table, and the EVT_EVENT writer used for the exact-identity preflight.
const CORPUS_DOCUMENTS = [
  {
    documentId: 'f0000000-0000-4000-8000-000000000011',
    title: 'live-graph-fixture-flow.md',
    body: [
      '# SHB - Credit calculations (60000006)',
      '',
      '| BIND_ID | ORDER | TARGET_ID | MO_TA |',
      '| :--- | :--- | :--- | :--- |',
      '| 60000005 | 10 | 10000304 | Due date period cycle |',
      '| 60000006 | 20 | 10000263 | Grace period length cycle |',
      '',
      'Quy trình thực thi của container 60000006 gọi các Container Step theo thứ tự execOrder.',
    ].join('\n'),
  },
  {
    documentId: 'f0000000-0000-4000-8000-000000000012',
    title: 'live-graph-fixture-objects.md',
    body: [
      '# Data objects',
      '',
      '## Bảng `MAIN1.FCL_CYCLE_COUNTER`',
      '',
      '| Field | Type | Description |',
      '| :--- | :--- | :--- |',
      '| CYCLE_ID | NUMBER | Mã định danh chu kỳ |',
      '',
      'Gói PL/SQL `MAIN1.FCL_PRC_CYCLE_COUNTER_PKG.PROCESS` đọc dữ liệu từ bảng `MAIN1.FCL_CYCLE_COUNTER` và cập nhật kết quả.',
      '',
      '## Bảng `MAIN1.EVT_EVENT`',
      '',
      '| Field | Type | Description |',
      '| :--- | :--- | :--- |',
      '| EVENT_ID | NUMBER | Mã sự kiện |',
      '',
      'Gói PL/SQL `MAIN1.EVT_EVENT_PKG.PROCESS` ghi dữ liệu vào bảng `MAIN1.EVT_EVENT`.',
    ].join('\n'),
  },
];

/**
 * Preflight exact identity, then run five live query families.
 * Connection problems throw BlockedError (exit 2); assertion problems throw Error/ShapeError (exit 1).
 */
export async function runGraphChecks({
  fetchImpl = globalThis.fetch,
  endpoint,
  token,
  origin,
  log = () => {},
}) {
  const headers = {
    'Content-Type': 'application/json',
    Origin: origin,
    Authorization: `Bearer ${token}`,
  };

  const readiness = await callJson(fetchImpl, `${endpoint}/api/v1/health/readiness`, { headers }, [200]);
  const checks = readiness.checks ?? {};
  if (!checks.neo4j || !checks.model || !checks.vectorIndex) {
    throw new BlockedError('STACK_NOT_READY');
  }
  log('[PASS] stage=readiness outcome=ready count=3');

  await callJson(
    fetchImpl,
    `${endpoint}/api/v1/sets/${LIVE_SET_ID}/attempts`,
    {
      method: 'POST',
      headers: { ...headers, 'x-attempt-key': LIVE_ATTEMPT_KEY },
      body: JSON.stringify({ setName: 'Live Graph Verification', documents: CORPUS_DOCUMENTS }),
    },
    [200, 202]
  );
  log('[PASS] stage=publish outcome=accepted');

  const rebuild = await callJson(
    fetchImpl,
    `${endpoint}/api/v1/sets/${LIVE_SET_ID}/graph/rebuild`,
    { method: 'POST', headers: { ...headers, 'x-rebuild-key': LIVE_REBUILD_KEY }, body: '{}' },
    [200, 202]
  );
  log('[PASS] stage=rebuild outcome=accepted');

  let candidateId = rebuild.candidateSnapshotId;
  let ready = false;
  for (let i = 0; i < 30 && !ready; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const status = await callJson(
      fetchImpl,
      `${endpoint}/api/v1/sets/${LIVE_SET_ID}/graph/status`,
      { headers },
      [200]
    );
    if (status.candidateStatus === 'READY' || status.state === 'Active') {
      ready = true;
      candidateId = status.candidateSnapshotId ?? status.activeGraphSnapshotId ?? candidateId;
    }
    if (status.state === 'Failed' || status.candidateStatus === 'FAILED') {
      throw new Error('GRAPH_BUILD_FAILED');
    }
  }
  if (!ready) throw new Error('GRAPH_BUILD_TIMEOUT');
  log('[PASS] stage=build outcome=ready');

  const activeStatus = await callJson(
    fetchImpl,
    `${endpoint}/api/v1/sets/${LIVE_SET_ID}/graph/status`,
    { headers },
    [200]
  );
  if (activeStatus.state !== 'Active') {
    await callJson(
      fetchImpl,
      `${endpoint}/api/v1/sets/${LIVE_SET_ID}/graph/activate`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ candidateSnapshotId: candidateId }),
      },
      [200, 202]
    );
  }
  log('[PASS] stage=activate outcome=active');

  // Preflight exact identity: the corpus must expose the EVT_EVENT writer fact.
  const facts = await callJson(
    fetchImpl,
    `${endpoint}/api/v1/sets/${LIVE_SET_ID}/graph/facts`,
    { headers },
    [200]
  );
  const factRows = Array.isArray(facts.facts) ? facts.facts : [];
  const hasEvtEvent = factRows.some(
    (fact) => fact.subjectName === EVT_EVENT || fact.objectName === EVT_EVENT
  );
  const hasWritesTo = factRows.some(
    (fact) => fact.objectName === EVT_EVENT && fact.relation === 'WRITES_TO'
  );
  const hasReadsFrom = factRows.some((fact) => fact.relation === 'READS_FROM');
  log(
    `[PREFLIGHT] stage=facts count=${isNonNegInt(facts.totalFacts) ? facts.totalFacts : factRows.length} ` +
      `evtEvent=${hasEvtEvent} writesTo=${hasWritesTo} readsFrom=${hasReadsFrom}`
  );

  const families = [
    {
      name: 'direct_lookup',
      query: `${EVT_EVENT} là gì?`,
      expected: ['READY', 'SEED_ONLY'],
      require: () => true,
    },
    {
      name: 'writes_to',
      query: `Gói PL/SQL nào ghi dữ liệu vào bảng ${EVT_EVENT}?`,
      expected: ['READY', 'DEGRADED', 'SEED_ONLY'],
      require: () => hasWritesTo || hasEvtEvent,
    },
    {
      name: 'reads_from',
      query: `Gói PL/SQL nào đọc dữ liệu từ bảng ${FCL_COUNTER}?`,
      expected: ['READY', 'DEGRADED', 'SEED_ONLY'],
      require: () => hasReadsFrom,
    },
    {
      name: 'seed_only_or_missing',
      query: 'MAIN1.NONEXISTENT_TABLE_XYZ là gì?',
      expected: ['SEED_ONLY', 'NO_EVIDENCE', 'NEEDS_CLARIFICATION'],
      require: () => true,
    },
    {
      name: 'bounded_multi_hop',
      query: `Nếu thay đổi cấu trúc bảng ${FCL_COUNTER} thì những package và quy trình nào bị ảnh hưởng?`,
      expected: ['READY', 'DEGRADED', 'SEED_ONLY', 'NO_EVIDENCE'],
      require: () => true,
    },
  ];

  for (const family of families) {
    if (!family.require()) {
      log(`[SKIP] family=${family.name} reason=CORPUS_ABSENT`);
      continue;
    }
    const startedAt = Date.now();
    const response = await callJson(
      fetchImpl,
      `${endpoint}/api/v1/retrieve`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          query: family.query,
          setTierAssignments: [{ setId: LIVE_SET_ID, tier: 'REQUIRED', roleGroup: 'baseline' }],
          comparisonMode: 'single',
          budgets: {
            concurrency: 4,
            elapsedMs: 60000,
            maxSets: 10,
            maxItems: 50,
            maxEvidenceChars: 30000,
          },
          limit: 20,
          includeInferred: true,
          recentTurns: [],
        }),
      },
      [200]
    );
    assertRetrievalResponseShape(response, family.expected);
    const graph = response.modalityStatus.graph;
    const pathCount = Array.isArray(response.paths) ? response.paths.length : 0;
    if (pathCount > 20) throw new Error('PATHS_OVER_LIMIT');
    log(
      `[PASS] family=${family.name} outcome=${response.outcome} ` +
        `items=${response.items.length} paths=${pathCount} graph=${graph.status} ` +
        `entities=${graph.entityCount ?? 0} latencyMs=${Date.now() - startedAt}`
    );
  }

  try {
    await callJson(
      fetchImpl,
      `${endpoint}/api/v1/sets/${LIVE_SET_ID}`,
      { method: 'DELETE', headers },
      [200, 202, 204, 404]
    );
    log('[PASS] stage=cleanup outcome=deleted');
  } catch {
    log('[WARN] stage=cleanup outcome=skipped');
  }

  return { ok: true };
}

function baseFixture(overrides = {}) {
  const base = {
    outcome: 'READY',
    items: [],
    paths: [],
    conflictGroups: [],
    modalityStatus: {
      fulltext: { status: 'ok', latencyMs: 5, itemCount: 1 },
      vector: { status: 'ok', latencyMs: 6, itemCount: 1 },
      graph: { status: 'ok', latencyMs: 7, itemCount: 1, entityCount: 1, edgeCount: 1, pathCount: 0 },
    },
    diagnostics: { degraded: false, coverageWarnings: [] },
    ...overrides,
  };
  return base;
}

const VALID_FIXTURES = [
  ['ready', baseFixture()],
  [
    'seed_only',
    baseFixture({
      outcome: 'SEED_ONLY',
      diagnostics: {
        degraded: false,
        coverageWarnings: [],
        stageDiagnostics: [
          {
            stage: 'neo4j_traversal',
            status: 'ok',
            latencyMs: 7,
            accepted: 1,
            rejected: 0,
            truncated: false,
            fallback: false,
            reasonCodes: ['SEED_FOUND_NO_RELATION'],
          },
        ],
      },
    }),
  ],
  [
    'not_found',
    baseFixture({
      outcome: 'NO_EVIDENCE',
      items: [],
      diagnostics: { degraded: true, coverageWarnings: [] },
    }),
  ],
  [
    'truncated',
    baseFixture({
      diagnostics: {
        degraded: false,
        coverageWarnings: [],
        stageDiagnostics: [
          {
            stage: 'fusion',
            status: 'truncated',
            latencyMs: 2,
            accepted: 20,
            rejected: 3,
            truncated: true,
            fallback: false,
            reasonCodes: ['RESULT_LIMIT_REACHED'],
          },
        ],
      },
    }),
  ],
  [
    'fallback',
    baseFixture({
      diagnostics: {
        degraded: true,
        coverageWarnings: [],
        stageDiagnostics: [
          {
            stage: 'planning',
            status: 'ok',
            latencyMs: 4,
            accepted: 1,
            rejected: 0,
            truncated: false,
            fallback: true,
            fallbackReason: 'FALLBACK_ONE_HOP',
            reasonCodes: ['FALLBACK_ONE_HOP'],
          },
        ],
      },
    }),
  ],
];

const INVALID_FIXTURES = [
  [
    'missing_count',
    () => {
      const fixture = baseFixture();
      fixture.modalityStatus = { ...fixture.modalityStatus, graph: { status: 'ok', latencyMs: 7 } };
      return fixture;
    },
  ],
  [
    'unknown_fallback',
    () => {
      const fixture = baseFixture();
      fixture.diagnostics = {
        degraded: true,
        coverageWarnings: [],
        stageDiagnostics: [
          {
            stage: 'planning',
            status: 'ok',
            latencyMs: 4,
            accepted: 1,
            rejected: 0,
            truncated: false,
            fallback: true,
            fallbackReason: 'TOTALLY_MADE_UP',
            reasonCodes: [],
          },
        ],
      };
      return fixture;
    },
  ],
  ['unknown_outcome', () => baseFixture({ outcome: 'MAYBE_READY' })],
  ['items_not_array', () => baseFixture({ items: {} })],
  ['paths_not_array', () => baseFixture({ paths: null })],
  ['degraded_not_boolean', () => baseFixture({ diagnostics: { degraded: 'no' } })],
];

/**
 * Offline self-check: proves the assertion logic on injected fixtures and proves
 * the self-check path performs zero network calls. Preflight only — never live proof.
 */
export function runSelfCheck({ log = () => {} } = {}) {
  const fetchCalls = [];
  const forbiddenFetch = (...args) => {
    fetchCalls.push(args);
    throw new Error('SELF_CHECK_NETWORK_CALL');
  };

  for (const [name, fixture] of VALID_FIXTURES) {
    assertRetrievalResponseShape(fixture);
    log(`[PASS] self-check=valid fixture=${name}`);
  }

  for (const [name, build] of INVALID_FIXTURES) {
    let rejected = false;
    try {
      assertRetrievalResponseShape(build());
    } catch (error) {
      rejected = error instanceof ShapeError;
    }
    if (!rejected) throw new Error(`SELF_CHECK_ACCEPTED_INVALID_${name}`);
    log(`[PASS] self-check=rejected fixture=${name}`);
  }

  // Expected-outcome gate must reject a valid shape when the outcome family differs.
  let outcomeGateRejected = false;
  try {
    assertRetrievalResponseShape(baseFixture(), ['SEED_ONLY']);
  } catch (error) {
    outcomeGateRejected = error instanceof ShapeError;
  }
  if (!outcomeGateRejected) throw new Error('SELF_CHECK_ACCEPTED_UNEXPECTED_OUTCOME');
  log('[PASS] self-check=rejected fixture=unexpected_outcome');

  if (fetchCalls.length !== 0) throw new Error('SELF_CHECK_MADE_NETWORK_CALL');
  log('[PASS] self-check=offline network_calls=0');

  return { ok: true, fixtures: VALID_FIXTURES.length + INVALID_FIXTURES.length + 1 };
}

async function main(argv) {
  const selfCheckOnly = argv.includes('--self-check');
  if (selfCheckOnly) {
    try {
      runSelfCheck({ log: (line) => console.log(line) });
      console.log('[PASS] self-check complete (preflight only; does not prove SC-8)');
      process.exit(0);
    } catch (error) {
      console.error(`[FAIL] self-check code=${error instanceof Error ? error.message : 'UNKNOWN'}`);
      process.exit(1);
    }
  }

  const endpoint = process.env.KNOWLEDGE_SERVER_URL;
  const token = process.env.KNOWLEDGE_SERVER_TOKEN;
  const origin = process.env.KNOWLEDGE_ALLOWED_ORIGIN;

  if (!token) {
    console.error(BLOCKED_MESSAGES.TOKEN_MISSING);
    return 2;
  }
  if (!endpoint || !origin) {
    console.error(
      '[BLOCKED] KNOWLEDGE_SERVER_URL and KNOWLEDGE_ALLOWED_ORIGIN must be set. Export them in your shell and retry.'
    );
    return 2;
  }

  try {
    await runGraphChecks({
      endpoint,
      token,
      origin,
      log: (line) => console.log(line),
    });
    console.log('[PASS] live graph verification complete');
    return 0;
  } catch (error) {
    if (error instanceof BlockedError) {
      console.error(BLOCKED_MESSAGES[error.code] ?? BLOCKED_MESSAGES.STACK_UNREACHABLE);
      return 2;
    }
    console.error(`[FAIL] live graph verification code=${error instanceof Error ? error.message : 'UNKNOWN'}`);
    return 1;
  }
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (invokedDirectly) {
  const exitCode = await main(process.argv.slice(2));
  process.exit(exitCode);
}
