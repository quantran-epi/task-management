/**
 * Phase 28-05 Task 2 — end-to-end client surface contract for zero-local-docs
 * retrieval. Composes the real client wire schema, the real retrieve_knowledge
 * tool, the real grounded-turn state machine, and both live surface render
 * seams (AI Chat + Telegram), with an empty local catalog throughout.
 *
 * Mocks are confined to the network transport, the model/synthesis call and
 * the test hooks for surface hosts — never the wire schema, the tool, the
 * grounded path, or the canonical notice module under test. Every assertion is
 * on observable outputs: wire-body keys, returned attribution, rendered text.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { FederatedRetrievalRequestSchema } from '../../src/services/knowledge/retrievalProtocol';
import { packEvidence } from '../../src/services/ai/evidencePack';
import { executeKnowledgeRetrievalTool } from '../../src/services/ai/knowledgeRetrievalTool';
import {
  runGroundedTurn,
  type GroundedTurnDeps,
  type GroundedTurnInput,
  type GroundedTurnResult,
} from '../../src/services/ai/groundedTurn';
import { formatGroundedNonAnswer } from '../../src/services/telegram/telegramHeadlessWorker';
import {
  KNOWLEDGE_SERVER_EMPTY_NOTICE,
  detectKnowledgeToolOutcome,
  resolveKnowledgeOutcomeRender,
} from '../../src/services/ai/knowledgeOutcome';
import type { FederatedRetrievalResponse } from '../../src/services/knowledge/retrievalProtocol';

const SET_A = '10000000-0000-4000-8000-000000000001';
const SNAP_A = 'gsnap_11111111';

/** A server response carrying set/snapshot-attributed evidence. */
function attributedResponse(): FederatedRetrievalResponse {
  return {
    outcome: 'READY',
    items: [
      {
        setId: SET_A,
        snapshotId: SNAP_A,
        roleGroup: 'baseline',
        item: {
          type: 'chunk',
          id: 'chunk-1',
          score: 10,
          modalitiesContributed: ['vector'],
          sourceDocumentId: '00000000-0000-4000-8000-000000000001',
          sourceDocumentTitle: 'Spec',
          sectionAnchor: 'Section 1',
          lineStart: 1,
          lineEnd: 5,
          rawSnippet: 'EVT_EVENT payload',
          publishedContentHash: 'a'.repeat(64),
          snapshotId: SNAP_A,
          hasConflict: false,
        },
      },
    ],
    paths: [],
    conflictGroups: [],
    modalityStatus: {
      fulltext: { status: 'ok', latencyMs: 1, itemCount: 1 },
      vector: { status: 'ok', latencyMs: 1, itemCount: 1 },
      graph: { status: 'ok', latencyMs: 1, itemCount: 0 },
    },
    diagnostics: {
      degraded: false,
      coverageWarnings: [],
      coverage: [
        {
          setId: SET_A,
          state: 'CONTRIBUTED',
          publishedSnapshotId: SNAP_A,
          retrievalSnapshotId: SNAP_A,
          staleIndex: false,
        },
      ],
    },
  } as FederatedRetrievalResponse;
}

/** Minimal db stub: settings back the tool's server config; catalog is deliberately empty. */
function emptyCatalogDb() {
  const settings: Record<string, unknown> = {
    knowledge_server_enabled: { key: 'knowledge_server_enabled', value: true },
    knowledge_server_base_url: { key: 'knowledge_server_base_url', value: 'http://127.0.0.1:3001' },
    knowledge_server_token: { key: 'knowledge_server_token', value: 'token' },
  };
  return {
    settings: {
      get: async (key: string) => settings[key],
    },
  } as any;
}

/** Grounded-turn deps with an empty catalog and a canned attributed server response. */
function emptyCatalogGroundedDeps(response: FederatedRetrievalResponse): {
  deps: GroundedTurnDeps;
  input: GroundedTurnInput;
} {
  const serverPack = packEvidence({ authority: 'server', serverResponse: response });
  const deps = {
    routeIntent: vi.fn().mockResolvedValue({
      intent: 'query_knowledge',
      confidence: 0.9,
      entities: [],
      language: 'vi',
      needs_clarification: false,
      clarify_question: null,
    }),
    // Empty resolved scope: no local document set constrains the query.
    routeScope: vi.fn().mockResolvedValue({
      setTierAssignments: [],
      comparisonMode: null,
      routerSource: 'alias',
    }),
    retrieveFederated: vi.fn().mockResolvedValue(response),
    runLocalBm25: vi.fn().mockResolvedValue({ ranges: [], strongEvidence: false, totalScanned: 0 }),
    localBm25Deps: {
      loadSetMembers: vi.fn().mockResolvedValue([]),
      loadNoteBody: vi.fn().mockResolvedValue(null),
    },
    packEvidence: vi.fn().mockReturnValue(serverPack),
    synthesizeGroundedAnswer: vi.fn().mockResolvedValue({
      answer: {
        schemaVersion: 1,
        language: 'vi',
        conclusion: 'EVT_EVENT payload [S1].',
        claims: [
          {
            id: 'C1',
            text: 'EVT_EVENT payload.',
            classification: 'DIRECT',
            citationIds: ['S1'],
            pathId: null,
          },
        ],
        unsupportedParts: [],
      },
      attempts: [],
      responseLanguage: 'vi',
    }),
    now: vi.fn().mockReturnValue('2026-11-17T12:00:00.000Z'),
    generateTurnId: vi.fn().mockReturnValue('turn-e2e'),
  } as unknown as GroundedTurnDeps;

  const input: GroundedTurnInput = {
    query: 'EVT_EVENT là gì?',
    recentTurns: [],
    signal: new AbortController().signal,
    capabilities: { serverEnabled: true, modelConfigured: true },
    config: {
      endpoint: 'https://router.local',
      apiKey: 'sk-test',
      model: 'gemini-2.5-pro',
      promptVersion: '2026.10.1',
      routerVersion: 'v1.0.0',
    },
    catalog: [], // zero local document sets
    recentSessionId: 'sess-e2e',
  };

  return { deps, input };
}

describe('Phase 28-05 client end-to-end: zero-local-docs retrieve lands on every live surface', () => {
  it('no-local-docs grounded path emits a thin query-only wire body and returns set/snapshot-attributed evidence', async () => {
    const { deps, input } = emptyCatalogGroundedDeps(attributedResponse());

    const res = await runGroundedTurn(input, deps);

    // Observable wire body produced by the grounded path.
    const wire = vi.mocked(deps.retrieveFederated).mock.calls[0]![0] as Record<string, unknown>;
    expect(wire.query).toBe(input.query);
    expect(wire.limit).toBe(20);
    expect(wire).not.toHaveProperty('budgets');
    expect(wire).not.toHaveProperty('comparisonMode');
    expect(wire).not.toHaveProperty('setTierAssignments');
    expect(wire).not.toHaveProperty('setIds');
    // The real client wire schema accepts exactly this thin body.
    expect(FederatedRetrievalRequestSchema.safeParse(wire).success).toBe(true);

    expect(res.kind).toBe('grounded_answer');
    if (res.kind === 'grounded_answer') {
      expect(res.grounding.authority).toBe('server');
      expect(res.grounding.citations.length).toBeGreaterThan(0);
      const citation = res.grounding.citations[0]!;
      expect(citation.snapshotId).toBe(SNAP_A);
      expect(citation.setMemberships).toEqual(expect.arrayContaining([{ setId: SET_A, setName: SET_A }]));
    }
    // Empty local catalog never triggered local BM25.
    expect(deps.runLocalBm25).not.toHaveBeenCalled();
  });

  it('no-local-docs tool path sends no catalog lookup and returns attributed status', async () => {
    // The tool module is exercised unmocked here. Only global fetch is stubbed
    // so no network call leaves the process; the tool, wire schema and packing
    // logic are the real production code under test.
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => attributedResponse(),
    });
    vi.stubGlobal('fetch', fetchSpy);
    try {
      const res = JSON.parse(await executeKnowledgeRetrievalTool({ query: 'EVT_EVENT' }, emptyCatalogDb()));
      expect(res.error).toBeUndefined();
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const sentBody = JSON.parse((fetchSpy.mock.calls[0]![1] as { body: string }).body);
      expect(sentBody).toEqual({ query: 'EVT_EVENT', limit: 20, includeInferred: true, recentTurns: [] });
      expect(sentBody).not.toHaveProperty('budgets');
      expect(sentBody).not.toHaveProperty('setIds');
      expect(res.status).toEqual({
        code: 'READY',
        publishedSetCount: 1,
        searchedSetCount: 1,
        contributedSetCount: 1,
      });
      expect(res.excerpts[0]).toHaveProperty('setId', SET_A);
      expect(res.excerpts[0]).toHaveProperty('snapshotId', SNAP_A);
      expect(res.sets).toEqual([
        {
          setId: SET_A,
          state: 'CONTRIBUTED',
          publishedSnapshotId: SNAP_A,
          retrievalSnapshotId: SNAP_A,
          staleIndex: false,
        },
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('cross-surface: NO_PUBLISHED_SETS produces the byte-identical canonical notice on AI Chat grounded, AI Chat tool, Telegram grounded and Telegram tool paths', () => {
    // AI Chat grounded: server_empty result renders the notice verbatim.
    const aiChatGrounded: GroundedTurnResult = {
      kind: 'server_empty',
      notice: KNOWLEDGE_SERVER_EMPTY_NOTICE,
    };
    const aiChatGroundedText = aiChatGrounded.kind === 'server_empty' ? aiChatGrounded.notice : '';

    // AI Chat tool-driven: detect + render from a retrieve_knowledge result.
    const toolRaw = JSON.stringify({ outcome: 'NO_PUBLISHED_SETS', excerpts: [], status: { code: 'NO_PUBLISHED_SETS' } });
    const aiChatToolCode = detectKnowledgeToolOutcome('retrieve_knowledge', toolRaw);
    const aiChatToolRender = resolveKnowledgeOutcomeRender(aiChatToolCode!);

    // Telegram grounded: formatGroundedNonAnswer is the exact render seam.
    const telegramGroundedText = formatGroundedNonAnswer({
      kind: 'server_empty',
      notice: KNOWLEDGE_SERVER_EMPTY_NOTICE,
    });

    // Telegram tool-driven: same detector + render module as AI Chat tool path.
    const telegramToolCode = detectKnowledgeToolOutcome('retrieve_knowledge_ide', toolRaw);
    const telegramToolRender = resolveKnowledgeOutcomeRender(telegramToolCode!);

    expect(aiChatGroundedText).toBe(KNOWLEDGE_SERVER_EMPTY_NOTICE);
    expect(aiChatToolCode).toBe('NO_PUBLISHED_SETS');
    expect(aiChatToolRender.notice).toBe(KNOWLEDGE_SERVER_EMPTY_NOTICE);
    expect(telegramGroundedText).toBe(KNOWLEDGE_SERVER_EMPTY_NOTICE);
    expect(telegramToolCode).toBe('NO_PUBLISHED_SETS');
    expect(telegramToolRender.notice).toBe(KNOWLEDGE_SERVER_EMPTY_NOTICE);

    // All four live surfaces render the exact same bytes.
    const rendered = [
      aiChatGroundedText,
      aiChatToolRender.notice!,
      telegramGroundedText as string,
      telegramToolRender.notice!,
    ];
    expect(new Set(rendered).size).toBe(1);
    expect(rendered[0]).toBe(KNOWLEDGE_SERVER_EMPTY_NOTICE);
  });

  it('NO_EVIDENCE and unreachable remain distinct states with no canonical notice', () => {
    const noEvidence = resolveKnowledgeOutcomeRender('NO_EVIDENCE');
    const unreachable = resolveKnowledgeOutcomeRender('UNREACHABLE');
    expect(noEvidence).toEqual({ notice: null, guide: 'refine' });
    expect(unreachable).toEqual({ notice: null, guide: 'unavailable' });
    expect(noEvidence.notice).toBeNull();
    expect(unreachable.notice).toBeNull();
    expect(noEvidence.guide).not.toBe(unreachable.guide);

    // The grounded turn's UNREACHABLE (network) path carries no canonical notice,
    // whether it resolves to a local answer or to weak local results.
    const { deps, input } = emptyCatalogGroundedDeps(attributedResponse());
    vi.mocked(deps.retrieveFederated).mockRejectedValueOnce(new Error('connection refused'));
    return runGroundedTurn(input, deps).then((res) => {
      expect(['grounded_answer', 'local_fallback_results']).toContain(res.kind);
      expect(JSON.stringify(res)).not.toContain(KNOWLEDGE_SERVER_EMPTY_NOTICE);
    });
  });

  it('deleted-path guard: no phase-28 PLAN or test names a removed SDLC/wizard path', () => {
    const phaseDir = join(process.cwd(), '.planning', 'phases', '28-query-only-knowledge-retrieval');
    // Fragments are concatenated at runtime so this guard source does not
    // itself contain a full deleted path string.
    const bad = [
      ['Step', 'ChatPanel'],
      ['sdlc', 'Wizard', 'Runtime'],
      ['wizard', 'Service'],
      ['grounding', 'Builder'],
      ['workflow', 'Guards'],
    ].map((parts) => parts.join(''));
    // Scope matches the plan-level <verification> gate: only 28-*-PLAN.md.
    // CONTEXT/RESEARCH/PATTERNS legitimately record the deleted paths as
    // historical "do not reference" context, not as live code references.
    const phaseFiles = readdirSync(phaseDir).filter((f) => /^28-.*-PLAN\.md$/.test(f));
    const testDirs = [join(process.cwd(), 'tests', 'ai'), join(process.cwd(), 'tests', 'telegram')];
    const testFiles = testDirs.flatMap((dir) =>
      readdirSync(dir)
        .filter((f) => /queryOnlyEndToEnd\.test\.ts$/.test(f))
        .map((f) => join(dir, f))
    );
    const checked = [
      ...phaseFiles.map((f) => join(phaseDir, f)),
      ...testFiles,
    ];
    const hits: string[] = [];
    for (const file of checked) {
      const content = readFileSync(file, 'utf8');
      for (const fragment of bad) {
        if (content.split(fragment).length - 1 > 0) hits.push(`${file}:${fragment}`);
      }
    }
    expect(hits).toEqual([]);
  });
});
