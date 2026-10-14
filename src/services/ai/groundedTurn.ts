import type {
  ChatMessageGrounding,
  GroundedAnswer,
  PersistedCitation,
  PersistedConflictGroup,
  PersistedPath,
} from './groundedAnswerSchemas';
import type { SetCatalogEntry, ResolvedScope } from './semanticScopeRouter';
import type {
  ConflictGroup,
  FederatedRetrievalRequest,
  FederatedRetrievalResponse,
  ModalityStatus,
  RetrievalContextHints,
} from '../knowledge/retrievalProtocol';
import {
  KnowledgeClientError,
  isFallbackAllowed,
} from '../knowledge/knowledgeClient';
import type {
  LocalGroundedResult,
  LocalGroundedRetrievalInput,
  LocalGroundedRetrievalDeps,
} from '../search/localGroundedRetrieval';
import type {
  EvidencePack,
  PackEvidenceOptions,
  SourceRecord,
} from './evidencePack';
import {
  GroundedSynthesisError,
  type SynthesisInput,
} from './groundedSynthesis';
import type { RouteIntentResult, RouteIntentDeps, IntentLabel } from './intentRouter';
import type { completeJson as defaultCompleteJson } from './nineRouterClient';
import type { KnowledgeLink, TaskMateEntityType } from '../../types/models';

export interface GroundedTurnInput {
  query: string;
  recentTurns: readonly { role: 'user' | 'assistant'; content: string }[];
  signal: AbortSignal;
  capabilities: {
    serverEnabled: boolean;
    modelConfigured: boolean;
  };
  config: {
    endpoint: string;
    apiKey: string;
    model: string;
    promptVersion: string;
    routerVersion: string;
  };
  catalog: readonly SetCatalogEntry[];
  recentSessionId: string;
  scopedEntity?: {
    type: TaskMateEntityType;
    id: string;
  };
}

export interface CandidateRef {
  urn: string;
  canonicalName: string;
  kind: string;
}

export type GroundedTurnResult =
  | { kind: 'operational'; routedQuery: string }
  | { kind: 'clarify_intent'; clarifyQuestion?: string }
  | {
      kind: 'clarify_entity';
      candidates: readonly CandidateRef[];
      outcome: 'NEEDS_CLARIFICATION';
    }
  | {
      kind: 'refine';
      outcome: 'NO_EVIDENCE' | 'UNSUPPORTED';
      refinementChips: readonly string[];
    }
  | {
      kind: 'grounded_answer';
      grounding: ChatMessageGrounding;
      requiresOperationalContinuation?: boolean;
    }
  | { kind: 'local_fallback_results'; grounding: ChatMessageGrounding }
  | { kind: 'evidence_only'; grounding: ChatMessageGrounding }
  | {
      kind: 'error';
      code:
        | 'ERROR_AUTH'
        | 'ERROR_CONFIG'
        | 'ERROR_INVALID_RESPONSE'
        | 'INVALID_GROUNDED_OUTPUT';
      grounding: ChatMessageGrounding;
    };

export interface GroundedTurnDeps {
  routeIntent(
    query: string,
    deps?: RouteIntentDeps
  ): Promise<RouteIntentResult> | RouteIntentResult;
  routeScope(
    input: { query: string; routedIntent?: IntentLabel },
    deps: {
      catalog: readonly SetCatalogEntry[];
      completeJson?: typeof defaultCompleteJson;
      completeJsonArgs?: { endpoint: string; apiKey?: string; model: string };
      signal: AbortSignal;
    }
  ): Promise<ResolvedScope>;
  retrieveFederated(
    request: FederatedRetrievalRequest,
    signal?: AbortSignal
  ): Promise<FederatedRetrievalResponse>;
  runLocalBm25(
    input: LocalGroundedRetrievalInput,
    deps: LocalGroundedRetrievalDeps
  ): Promise<LocalGroundedResult>;
  localBm25Deps: LocalGroundedRetrievalDeps;
  packEvidence(
    input: {
      authority: 'server' | 'local';
      serverResponse?: FederatedRetrievalResponse;
      localResult?: LocalGroundedResult;
    },
    options?: PackEvidenceOptions
  ): EvidencePack;
  synthesizeGroundedAnswer(input: SynthesisInput): Promise<{
    answer: GroundedAnswer;
    attempts: readonly unknown[];
    responseLanguage: 'vi' | 'en';
  }>;
  loadKnowledgeLinks?(
    entityType: TaskMateEntityType,
    entityId: string
  ): Promise<KnowledgeLink[]>;
  now?(): string;
  generateTurnId?(): string;
}

function toPersistedCitations(
  citationsRecord: Readonly<Record<string, SourceRecord>>
): PersistedCitation[] {
  return Object.values(citationsRecord).map((source) => ({
    citationId: source.citationId,
    documentId: source.documentId,
    documentTitle: source.documentTitle,
    sectionAnchor: source.sectionAnchor,
    lineStart: source.lineStart,
    lineEnd: source.lineEnd,
    authority: source.authority,
    evidenceClass: source.evidenceClass,
    snapshotId: source.snapshotId,
    publishedContentHash: source.publishedContentHash,
    citedExcerpt: source.citedExcerpt,
    evidenceKind: source.evidenceKind,
  }));
}

function toPersistedPaths(
  pathsRecord: Readonly<Record<string, {
    pathId: string;
    snapshotId: string;
    nodeUrns: readonly string[];
    edgeFactKeys: readonly string[];
    hopClassifications: readonly string[];
    hopCitationIds: readonly (readonly string[])[];
    classification: string;
    hasConflict: boolean;
  }>>
): PersistedPath[] {
  return Object.values(pathsRecord).map((path) => ({
    pathId: path.pathId,
    snapshotId: path.snapshotId,
    nodeUrns: [...path.nodeUrns],
    edgeFactKeys: [...path.edgeFactKeys],
    hopClassifications: [...path.hopClassifications] as ('OBSERVED' | 'INFERRED' | 'BUSINESS_APPROVED')[],
    hopCitationIds: path.hopCitationIds.map((hop) => [...hop]),
    hasConflict: path.hasConflict,
    classification: path.classification as 'OBSERVED' | 'INFERRED' | 'BUSINESS_APPROVED',
  }));
}

function toPersistedConflicts(
  conflicts: readonly ConflictGroup[],
  citations: readonly PersistedCitation[]
): PersistedConflictGroup[] {
  const allCitationIds = citations.map((c) => c.citationId);
  return conflicts.map((cg) => ({
    conflictId: cg.conflictGroupId,
    dimension: cg.dimension,
    branches: [
      {
        factKey: '1'.repeat(64),
        claimIds: [],
        citationIds: allCitationIds.slice(0, 1).length > 0 ? allCitationIds.slice(0, 1) : ['S1'],
      },
      {
        factKey: '2'.repeat(64),
        claimIds: [],
        citationIds: allCitationIds.slice(0, 1).length > 0 ? allCitationIds.slice(0, 1) : ['S1'],
      },
    ],
    scopeProof: cg.scopeProof
      ? {
          dimension: cg.scopeProof.dimension ?? cg.dimension,
          environment: cg.scopeProof.environment ?? null,
          version: cg.scopeProof.version ?? null,
          overrideRelation: cg.scopeProof.overrideRelation ?? null,
        }
      : null,
  }));
}

function defaultModalityDiagnostics(): ModalityStatus {
  return {
    fulltext: { status: 'ok', latencyMs: 0, itemCount: 0 },
    vector: { status: 'ok', latencyMs: 0, itemCount: 0 },
    graph: { status: 'ok', latencyMs: 0, itemCount: 0 },
  };
}

export async function runGroundedTurn(
  input: GroundedTurnInput,
  deps: GroundedTurnDeps
): Promise<GroundedTurnResult> {
  if (input.signal.aborted) {
    throw new Error('ABORTED');
  }

  const nowIso = deps.now ? deps.now() : new Date().toISOString();

  // 1. Route intent via the LLM-reasoned app contract (Bug 2 / vision hard gate).
  //    operate_taskmate + query_taskmate both drive the TaskMate tool loop (mutate vs read);
  //    query_knowledge + mixed drive knowledge retrieval; clarify asks the user back.
  //    NOTE: no keyword/verb routing — intent is reasoned by the LLM. If the LLM is
  //    unreachable, routeIntent throws (AI feature UNAVAILABLE, no routing fallback).
  const intentDecision = await deps.routeIntent(input.query, {
    completeJsonArgs: {
      endpoint: input.config.endpoint,
      apiKey: input.config.apiKey,
      model: input.config.model,
    },
    signal: input.signal,
  });

  if (
    intentDecision.intent === 'operate_taskmate' ||
    intentDecision.intent === 'query_taskmate'
  ) {
    return { kind: 'operational', routedQuery: input.query };
  }
  if (intentDecision.needs_clarification || intentDecision.intent === 'clarify') {
    return {
      kind: 'clarify_intent',
      ...(intentDecision.clarify_question
        ? { clarifyQuestion: intentDecision.clarify_question }
        : {}),
    };
  }

  // 2. Resolve scope
  // If model is configured, semanticScopeRouter probe/complete can be passed if caller wired it,
  // but if modelConfigured === false, omit completeJson (D-20).
  const resolvedScope = await deps.routeScope(
    { query: input.query, routedIntent: intentDecision.intent },
    {
      catalog: input.catalog,
      signal: input.signal,
    }
  );

  // Load context hints if scoped entity is provided
  let contextHints: RetrievalContextHints | undefined;
  if (input.scopedEntity && deps.loadKnowledgeLinks) {
    try {
      const links = await deps.loadKnowledgeLinks(
        input.scopedEntity.type,
        input.scopedEntity.id
      );
      if (links && links.length > 0) {
        const setIds = Array.from(new Set(links.map((l) => l.setId).filter(Boolean)));
        const urns = Array.from(
          new Set(links.map((l) => l.urn).filter((u): u is string => Boolean(u)))
        );
        const docIds = Array.from(
          new Set(links.map((l) => l.docId).filter((d): d is string => Boolean(d)))
        );
        contextHints = { setIds, urns, docIds };
      }
    } catch {
      // Graceful degradation: failure to load links does not crash the turn
      contextHints = undefined;
    }
  }

  // Helper for step 6: Local BM25 path
  const executeLocalPath = async (
    fallbackReason: 'SERVER_DISABLED' | 'NETWORK_ERROR' | 'TIMEOUT',
    extraCoverageWarnings: readonly string[] = []
  ): Promise<GroundedTurnResult> => {
    if (resolvedScope.setTierAssignments.length === 0) {
      // D-37: scope cannot be resolved safely -> ask user instead of global scan
      return { kind: 'clarify_intent' };
    }

    const localResult = await deps.runLocalBm25(
      {
        query: input.query,
        resolvedSetIds: resolvedScope.setTierAssignments.map((s) => s.setId),
        prioritizedDocIds: contextHints?.docIds,
      },
      deps.localBm25Deps
    );

    const localPack = deps.packEvidence({
      authority: 'local',
      localResult,
    });

    const localCitations = toPersistedCitations(localPack.citations);
    const combinedWarnings = [
      ...extraCoverageWarnings,
      ...localPack.coverageWarnings,
    ];

    if (localResult.strongEvidence && input.capabilities.modelConfigured) {
      try {
        const synthRes = await deps.synthesizeGroundedAnswer({
          query: input.query,
          pack: localPack,
          endpoint: input.config.endpoint,
          apiKey: input.config.apiKey,
          model: input.config.model,
          promptVersion: input.config.promptVersion,
          signal: input.signal,
          capabilityProfile: { strictJsonSchema: true },
        });

        if (input.signal.aborted) {
          throw new Error('ABORTED');
        }

        const grounding: ChatMessageGrounding = {
          schemaVersion: 1,
          authority: 'local',
          outcome: 'LOCAL_FALLBACK_SYNTHESIS',
          answer: synthRes.answer,
          citations: localCitations,
          paths: null,
          conflicts: null,
          scope: null,
          modalityDiagnostics: null,
          coverageWarnings: combinedWarnings,
          fallbackReason,
          routerVersion: null,
          promptVersion: input.config.promptVersion,
          modelId: input.config.model,
          createdAt: nowIso,
        };

        return {
          kind: 'grounded_answer',
          grounding,
          ...(intentDecision.intent === 'mixed' ? { requiresOperationalContinuation: true } : {}),
        };
      } catch (err: unknown) {
        if (err instanceof GroundedSynthesisError && err.code === 'ABORTED') {
          throw err;
        }
        // Fall back to local_fallback_results if synthesis fails or model unavailable
        const grounding: ChatMessageGrounding = {
          schemaVersion: 1,
          authority: 'local',
          outcome: 'LOCAL_FALLBACK_RESULTS',
          answer: null,
          citations: localCitations,
          paths: null,
          conflicts: null,
          scope: null,
          modalityDiagnostics: null,
          coverageWarnings: combinedWarnings,
          fallbackReason,
          routerVersion: null,
          promptVersion: input.config.promptVersion,
          modelId: null,
          createdAt: nowIso,
        };
        return { kind: 'local_fallback_results', grounding };
      }
    }

    // Weak local evidence or model not configured
    const grounding: ChatMessageGrounding = {
      schemaVersion: 1,
      authority: 'local',
      outcome: 'LOCAL_FALLBACK_RESULTS',
      answer: null,
      citations: localCitations,
      paths: null,
      conflicts: null,
      scope: null,
      modalityDiagnostics: null,
      coverageWarnings: combinedWarnings,
      fallbackReason,
      routerVersion: null,
      promptVersion: input.config.promptVersion,
      modelId: null,
      createdAt: nowIso,
    };
    return { kind: 'local_fallback_results', grounding };
  };

  // 3. Branch on server availability
  if (!input.capabilities.serverEnabled) {
    return executeLocalPath('SERVER_DISABLED');
  }

  let serverResponse: FederatedRetrievalResponse;
  try {
    serverResponse = await deps.retrieveFederated(
      {
        query: input.query,
        setTierAssignments: resolvedScope.setTierAssignments.map((s) => ({
          setId: s.setId,
          tier: s.tier,
          roleGroup: s.roleGroup,
        })),
        comparisonMode: resolvedScope.comparisonMode,
        budgets: {
          concurrency: 4,
          elapsedMs: 2500,
          maxSets: 10,
          maxItems: 50,
          maxEvidenceChars: 30000,
        },
        limit: 20,
        includeInferred: false,
        recentTurns: [],
        ...(contextHints ? { contextHints } : {}),
      },
      input.signal
    );
  } catch (error: unknown) {
    // 4. Handle retrieve error (D-41 fallback allowlist, D-21, D-22)
    if (input.signal.aborted) {
      throw error;
    }

    if (error instanceof KnowledgeClientError) {
      if (error.code === 'ABORTED') {
        throw error;
      }
      if (error.code === 'NETWORK_ERROR') {
        return executeLocalPath('NETWORK_ERROR', [
          'Máy chủ tri thức không phản hồi (lỗi kết nối)',
        ]);
      }
      if (error.code === 'TIMEOUT') {
        return executeLocalPath('TIMEOUT', [
          'Máy chủ tri thức quá thời gian phản hồi (timeout)',
        ]);
      }
      if (error.code === 'INVALID_RESPONSE') {
        const errorGrounding: ChatMessageGrounding = {
          schemaVersion: 1,
          authority: 'server',
          outcome: 'ERROR_INVALID_RESPONSE',
          answer: null,
          citations: [],
          paths: [],
          conflicts: [],
          scope: {
            setIds: resolvedScope.setTierAssignments.map((s) => s.setId),
            routedScope: {
              domain: null,
              environment: null,
              version: null,
              comparisonMode: resolvedScope.comparisonMode,
            },
          },
          modalityDiagnostics: defaultModalityDiagnostics(),
          coverageWarnings: ['Phản hồi máy chủ tri thức không hợp lệ'],
          fallbackReason: 'NONE',
          routerVersion: input.config.routerVersion,
          promptVersion: input.config.promptVersion,
          modelId: input.config.model,
          createdAt: nowIso,
        };
        return {
          kind: 'error',
          code: 'ERROR_INVALID_RESPONSE',
          grounding: errorGrounding,
        };
      }
      if (error.code === 'REMOTE_ERROR') {
        if (error.status === 401 || error.status === 403) {
          const authGrounding: ChatMessageGrounding = {
            schemaVersion: 1,
            authority: 'server',
            outcome: 'ERROR_AUTH',
            answer: null,
            citations: [],
            paths: [],
            conflicts: [],
            scope: {
              setIds: resolvedScope.setTierAssignments.map((s) => s.setId),
              routedScope: {
                domain: null,
                environment: null,
                version: null,
                comparisonMode: resolvedScope.comparisonMode,
              },
            },
            modalityDiagnostics: defaultModalityDiagnostics(),
            coverageWarnings: ['Token máy chủ tri thức không hợp lệ (401/403)'],
            fallbackReason: 'NONE',
            routerVersion: input.config.routerVersion,
            promptVersion: input.config.promptVersion,
            modelId: input.config.model,
            createdAt: nowIso,
          };
          return { kind: 'error', code: 'ERROR_AUTH', grounding: authGrounding };
        }
        if (error.status === 400 || error.status === 404) {
          const cfgGrounding: ChatMessageGrounding = {
            schemaVersion: 1,
            authority: 'server',
            outcome: 'ERROR_CONFIG',
            answer: null,
            citations: [],
            paths: [],
            conflicts: [],
            scope: {
              setIds: resolvedScope.setTierAssignments.map((s) => s.setId),
              routedScope: {
                domain: null,
                environment: null,
                version: null,
                comparisonMode: resolvedScope.comparisonMode,
              },
            },
            modalityDiagnostics: defaultModalityDiagnostics(),
            coverageWarnings: [`Lỗi cấu hình yêu cầu (${error.status})`],
            fallbackReason: 'NONE',
            routerVersion: input.config.routerVersion,
            promptVersion: input.config.promptVersion,
            modelId: input.config.model,
            createdAt: nowIso,
          };
          return { kind: 'error', code: 'ERROR_CONFIG', grounding: cfgGrounding };
        }
        if (error.status && error.status >= 500) {
          return executeLocalPath('NETWORK_ERROR', [
            `Máy chủ tri thức gặp sự cố (${error.status})`,
          ]);
        }
      }
    }

    if (isFallbackAllowed(error)) {
      return executeLocalPath('NETWORK_ERROR', [
        'Máy chủ tri thức không phản hồi (lỗi kết nối mạng)',
      ]);
    }

    throw error;
  }

  // 5. Branch on retrieval outcome
  if (serverResponse.outcome === 'NEEDS_CLARIFICATION') {
    const rawCandidates = (serverResponse as unknown as { candidates?: readonly CandidateRef[] }).candidates ?? [];
    return {
      kind: 'clarify_entity',
      candidates: rawCandidates,
      outcome: 'NEEDS_CLARIFICATION',
    };
  }

  if (
    serverResponse.outcome === 'NO_EVIDENCE' ||
    serverResponse.outcome === 'UNSUPPORTED'
  ) {
    const rawRefinements =
      (serverResponse as unknown as { suggestedRefinements?: readonly string[] })
        .suggestedRefinements ?? [];
    const defaultChips =
      serverResponse.outcome === 'NO_EVIDENCE'
        ? ['Thử với tên quy trình khác', 'Mở rộng phạm vi tìm kiếm']
        : ['Đặt câu hỏi cụ thể hơn', 'Kiểm tra tài liệu đã xuất bản'];
    const refinementChips =
      rawRefinements.length > 0 ? rawRefinements : defaultChips;
    return {
      kind: 'refine',
      outcome: serverResponse.outcome,
      refinementChips,
    };
  }

  // 7. Pack + synthesize (server path)
  const serverPack = deps.packEvidence({
    authority: 'server',
    serverResponse,
  });

  const persistedCitations = toPersistedCitations(serverPack.citations);
  const persistedPaths = toPersistedPaths(serverPack.paths);
  const persistedConflicts = toPersistedConflicts(
    serverPack.conflicts,
    persistedCitations
  );

  const scopePayload = {
    setIds: resolvedScope.setTierAssignments.map((s) => s.setId),
    routedScope: {
      domain: null,
      environment: null,
      version: null,
      comparisonMode: resolvedScope.comparisonMode,
    },
  };

  const coverageWarnings = [
    ...serverResponse.diagnostics.coverageWarnings.map((w) => w.message),
    ...serverPack.coverageWarnings,
  ];

  if (!input.capabilities.modelConfigured) {
    const evidenceOnlyGrounding: ChatMessageGrounding = {
      schemaVersion: 1,
      authority: 'server',
      outcome: 'MODEL_UNAVAILABLE',
      answer: null,
      citations: persistedCitations,
      paths: persistedPaths,
      conflicts: persistedConflicts,
      scope: scopePayload,
      modalityDiagnostics: serverResponse.modalityStatus,
      coverageWarnings,
      fallbackReason: 'NONE',
      routerVersion: input.config.routerVersion,
      promptVersion: input.config.promptVersion,
      modelId: input.config.model,
      createdAt: nowIso,
    };
    return { kind: 'evidence_only', grounding: evidenceOnlyGrounding };
  }

  try {
    const synthResult = await deps.synthesizeGroundedAnswer({
      query: input.query,
      pack: serverPack,
      endpoint: input.config.endpoint,
      apiKey: input.config.apiKey,
      model: input.config.model,
      promptVersion: input.config.promptVersion,
      signal: input.signal,
      capabilityProfile: { strictJsonSchema: true },
    });

    if (input.signal.aborted) {
      throw new Error('ABORTED');
    }

    const grounding: ChatMessageGrounding = {
      schemaVersion: 1,
      authority: 'server',
      outcome: serverResponse.outcome as 'READY' | 'DEGRADED',
      answer: synthResult.answer,
      citations: persistedCitations,
      paths: persistedPaths,
      conflicts: persistedConflicts,
      scope: scopePayload,
      modalityDiagnostics: serverResponse.modalityStatus,
      coverageWarnings,
      fallbackReason: 'NONE',
      routerVersion: input.config.routerVersion,
      promptVersion: input.config.promptVersion,
      modelId: input.config.model,
      createdAt: nowIso,
    };

    return {
      kind: 'grounded_answer',
      grounding,
      ...(intentDecision.intent === 'mixed' ? { requiresOperationalContinuation: true } : {}),
    };
  } catch (synthErr: unknown) {
    if (synthErr instanceof GroundedSynthesisError) {
      if (synthErr.code === 'ABORTED') {
        throw synthErr;
      }
      if (synthErr.code === 'INVALID_GROUNDED_OUTPUT') {
        const errorGrounding: ChatMessageGrounding = {
          schemaVersion: 1,
          authority: 'server',
          outcome: 'INVALID_GROUNDED_OUTPUT',
          answer: null,
          citations: persistedCitations,
          paths: persistedPaths,
          conflicts: persistedConflicts,
          scope: scopePayload,
          modalityDiagnostics: serverResponse.modalityStatus,
          coverageWarnings: [...coverageWarnings, 'Không thể tạo phản hồi hợp lệ'],
          fallbackReason: 'NONE',
          routerVersion: input.config.routerVersion,
          promptVersion: input.config.promptVersion,
          modelId: input.config.model,
          createdAt: nowIso,
        };
        return {
          kind: 'error',
          code: 'INVALID_GROUNDED_OUTPUT',
          grounding: errorGrounding,
        };
      }
      if (synthErr.code === 'MODEL_UNAVAILABLE') {
        const evidenceOnlyGrounding: ChatMessageGrounding = {
          schemaVersion: 1,
          authority: 'server',
          outcome: 'MODEL_UNAVAILABLE',
          answer: null,
          citations: persistedCitations,
          paths: persistedPaths,
          conflicts: persistedConflicts,
          scope: scopePayload,
          modalityDiagnostics: serverResponse.modalityStatus,
          coverageWarnings: [...coverageWarnings, 'Mô hình AI hiện không khả dụng'],
          fallbackReason: 'NONE',
          routerVersion: input.config.routerVersion,
          promptVersion: input.config.promptVersion,
          modelId: input.config.model,
          createdAt: nowIso,
        };
        return { kind: 'evidence_only', grounding: evidenceOnlyGrounding };
      }
    }
    throw synthErr;
  }
}

export async function synthesizeFromStoredEvidence(
  storedGrounding: ChatMessageGrounding,
  deps: GroundedTurnDeps,
  options?: {
    query?: string;
    endpoint?: string;
    apiKey?: string;
    model?: string;
    promptVersion?: string;
    signal?: AbortSignal;
  }
): Promise<GroundedTurnResult> {
  const signal = options?.signal ?? new AbortController().signal;
  if (signal.aborted) {
    throw new Error('ABORTED');
  }

  // Rehydrate citations
  const citations: Record<string, SourceRecord> = {};
  for (const c of storedGrounding.citations) {
    citations[c.citationId] = {
      citationId: c.citationId,
      documentId: c.documentId,
      documentTitle: c.documentTitle,
      sectionAnchor: c.sectionAnchor,
      lineStart: c.lineStart,
      lineEnd: c.lineEnd,
      authority: c.authority,
      evidenceClass: c.evidenceClass as 'OBSERVED' | 'INFERRED' | 'BUSINESS_APPROVED' | 'LOCAL',
      snapshotId: c.snapshotId,
      publishedContentHash: c.publishedContentHash,
      citedExcerpt: c.citedExcerpt,
      setMemberships: [],
      evidenceKind: c.evidenceKind,
    };
  }

  // Rehydrate paths
  const paths: Record<string, any> = {};
  if (storedGrounding.paths) {
    for (const p of storedGrounding.paths) {
      paths[p.pathId] = {
        pathId: p.pathId,
        snapshotId: p.snapshotId,
        nodeUrns: p.nodeUrns,
        edgeFactKeys: p.edgeFactKeys,
        hopClassifications: p.hopClassifications,
        hopCitationIds: p.hopCitationIds,
        classification: p.classification,
        hasConflict: p.hasConflict,
      };
    }
  }

  // Build promptEvidence from each citation's citedExcerpt
  const promptEvidence = storedGrounding.citations.map((c) => ({
    id: c.citationId,
    text: c.citedExcerpt,
  }));

  const rebuiltPack: EvidencePack = {
    authority: storedGrounding.authority,
    citations,
    paths,
    conflicts: (storedGrounding.conflicts ?? []).map((cg) => ({
      conflictGroupId: cg.conflictId,
      dimension: cg.dimension,
      scopeProof: cg.scopeProof,
    })),
    promptEvidence,
    contextTruncated: false,
    coverageWarnings: storedGrounding.coverageWarnings,
  };

  const endpoint = options?.endpoint ?? '';
  const apiKey = options?.apiKey ?? '';
  const model = options?.model ?? storedGrounding.modelId ?? 'default-model';
  const promptVersion = options?.promptVersion ?? storedGrounding.promptVersion;

  const synthResult = await deps.synthesizeGroundedAnswer({
    query: options?.query ?? '',
    pack: rebuiltPack,
    endpoint,
    apiKey,
    model,
    promptVersion,
    signal,
    capabilityProfile: { strictJsonSchema: true },
  });

  if (signal.aborted) {
    throw new Error('ABORTED');
  }

  const nowIso = deps.now ? deps.now() : new Date().toISOString();

  const newGrounding: ChatMessageGrounding = {
    ...storedGrounding,
    outcome:
      storedGrounding.authority === 'server'
        ? 'READY'
        : 'LOCAL_FALLBACK_SYNTHESIS',
    answer: synthResult.answer,
    modelId: model,
    createdAt: nowIso,
  };

  return {
    kind: 'grounded_answer',
    grounding: newGrounding,
  };
}

export function createFreshLookupTurn(
  prevGrounding: ChatMessageGrounding,
  newInput: GroundedTurnInput,
  _deps?: GroundedTurnDeps
): GroundedTurnInput {
  // Fresh retrieval turn preserving prevGrounding completely unchanged (D-49)
  return {
    ...newInput,
    query: newInput.query,
    recentTurns: [
      ...newInput.recentTurns,
      ...(prevGrounding.answer
        ? [
            {
              role: 'assistant' as const,
              content: prevGrounding.answer.conclusion,
            },
          ]
        : []),
    ],
  };
}
