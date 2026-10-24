import {
  ClarificationCandidate,
  ConversationTurn,
  FailedSeed,
  LogicalQueryPlan,
  LogicalQueryPlanSchema,
  PlanTrace,
  RetrievalRequest,
  TraversalStep,
} from '../types/retrievalProtocol.js';
import {
  GraphRetrievalGateway,
  OperationOptions,
  PlanValidationReasonCode,
  QueryPlanner,
} from './contracts.js';
import { URN_REGEX, type NodeKind } from '../types/graphProtocol.js';
import {
  NODE_KINDS,
  RELATION_TYPES,
} from '../graph/ontology.js';
import {
  deriveSeedPlan,
  LooseLogicalQueryPlanSchema,
  TRAVERSAL_PLAN_LIMITS,
  validateOverallDepth,
  validateStepAgainstRegistry,
  type LooseLogicalQueryPlan,
  type LooseTraversalStepCandidate,
} from './retrievalPlanDerivation.js';
import { randomUUID } from 'node:crypto';

/**
 * Strips Vietnamese and Latin diacritics using Unicode NFD decomposition.
 */
function removeVietnameseDiacritics(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

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

const CONVERSATIONAL_STOPWORDS = new Set([
  'cho',
  'toi',
  'tôi',
  'biet',
  'biết',
  'la',
  'là',
  'nhung',
  'những',
  'cua',
  'của',
  'cac',
  'các',
  'co',
  'có',
  'va',
  'và',
  'hay',
  'giúp',
  'giup',
]);

/**
 * Extracts searchable candidate tokens from query text.
 * Generates single tokens, diacritic-stripped variants, and 2-word n-grams (bigrams)
 * to capture natural Vietnamese business terms while mitigating token explosion (max 20).
 */
export function extractQueryTokens(query: string): string[] {
  // Strip backticks and common punctuation, keep alphanumeric, dots, underscores
  const cleaned = query.replace(/[`"'?,;:!()]/g, ' ');
  const rawWords = cleaned.split(/\s+/).filter(Boolean);
  const words: string[] = [];

  for (const w of rawWords) {
    const trimmed = w.trim();
    if (trimmed.length >= 2) {
      words.push(trimmed);
      if (trimmed.includes('.')) {
        words.push(...trimmed.split('.').filter((p) => p.length >= 2));
      }
    }
  }

  const seen = new Set<string>();
  const tokens: string[] = [];

  const addToken = (token: string) => {
    if (tokens.length >= 20) return;
    const lower = token.toLowerCase();
    if (lower.length >= 2 && !seen.has(lower)) {
      seen.add(lower);
      tokens.push(token);
    }
  };

  // 1. Generate bigrams first (both accented and unaccented) as they have high semantic value
  for (let i = 0; i < rawWords.length - 1; i++) {
    const w1 = rawWords[i]!.trim();
    const w2 = rawWords[i + 1]!.trim();
    if (w1.length >= 2 && w2.length >= 2) {
      const bigram = `${w1} ${w2}`;
      addToken(bigram);
      const unaccentedBigram = removeVietnameseDiacritics(bigram);
      if (unaccentedBigram !== bigram) {
        addToken(unaccentedBigram);
      }
    }
  }

  // 2. Generate single words and their unaccented counterparts (skipping conversational stopwords)
  for (const w of words) {
    const lower = w.toLowerCase();
    if (CONVERSATIONAL_STOPWORDS.has(lower)) {
      continue;
    }
    addToken(w);
    const unaccented = removeVietnameseDiacritics(w);
    if (unaccented !== w && !CONVERSATIONAL_STOPWORDS.has(unaccented.toLowerCase())) {
      addToken(unaccented);
    }
  }

  return tokens;
}

/**
 * Detects whether the query text refers to an ungrounded pronoun.
 */
function queryHasPronoun(query: string): boolean {
  const lower = query.toLowerCase().trim();
  const words = lower.split(/\s+/);
  for (const p of PRONOUN_TOKENS) {
    if (p.includes(' ')) {
      if (lower.includes(p)) {
        return true;
      }
    } else {
      if (words.includes(p)) {
        return true;
      }
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

  // 4. Keep pure identifiers intact. Splitting MAIN1.FCL_CYCLE_COUNTER into
  // MAIN1/FCL_CYCLE_COUNTER broadens Neo4j substring matching and creates false ambiguity.
  const trimmedQuery = query.trim();
  const tokens = isPureIdentifierQuery(trimmedQuery)
    ? [trimmedQuery.startsWith('`') && trimmedQuery.endsWith('`') ? trimmedQuery.slice(1, -1).trim() : trimmedQuery]
    : extractQueryTokens(query);
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

  if (rawCandidates.length === 1) {
    return {
      status: 'resolved',
      resolved: rawCandidates[0]!,
      candidates: rawCandidates,
    };
  }

  // Multiple candidate entities -> Ambiguous; forward all candidates without heuristics
  return {
    status: 'ambiguous',
    candidates: rawCandidates,
  };
}

/**
 * Outcome of buildQueryExecutionPlan.
 */
export type QueryExecutionPlanningOutcome =
  | {
      readonly status: 'executable';
      readonly plan: LogicalQueryPlan;
      readonly planTrace: PlanTrace;
      readonly isFastPath: boolean;
      readonly isDegraded: boolean;
      readonly failedSeeds: readonly FailedSeed[];
      /** Resolved seed kinds for downstream kind-aware traversal validation (D-10). */
      readonly seedKinds: Readonly<Record<string, NodeKind>>;
    }
  | {
      readonly status: 'needsClarification';
      readonly semanticOutcome: 'NEEDS_CLARIFICATION';
      readonly safeCandidates: readonly ClarificationCandidate[];
      readonly fulltextKeywords: readonly string[];
      readonly semanticQuery: string;
      readonly seedUrns: readonly string[];
      readonly graphDirective: 'NO_GRAPH_SEED';
      readonly planTrace: PlanTrace;
    }
  | {
      readonly status: 'unsupported';
      readonly semanticOutcome: 'UNSUPPORTED';
      readonly reason: string;
      readonly unsupportedConstructs: readonly string[];
      readonly planTrace: PlanTrace;
    };

export interface PlanSemanticValidation {
  readonly valid: boolean;
  readonly reasonCodes: readonly PlanValidationReasonCode[];
  readonly failedSeeds: readonly FailedSeed[];
  readonly plan?: LooseLogicalQueryPlan | undefined;
}

/**
 * Seed-kind map for downstream kind-aware traversal validation (D-10).
 */
export function seedKindMap(
  candidates: readonly ClarificationCandidate[]
): Readonly<Record<string, NodeKind>> {
  return Object.fromEntries(candidates.map((candidate) => [candidate.urn, candidate.kind]));
}

/**
 * Merges per-seed derived plans into one executable plan, bounded by MAX_STEPS (D-05..D-08).
 */
function mergeSeedPlans(
  seeds: readonly ClarificationCandidate[],
  maxDepth: number
): { steps: TraversalStep[]; failedSeeds: FailedSeed[] } {
  const steps: TraversalStep[] = [];
  const failedSeeds: FailedSeed[] = [];

  for (const seed of seeds.slice(0, TRAVERSAL_PLAN_LIMITS.MAX_SEEDS)) {
    if (steps.length >= TRAVERSAL_PLAN_LIMITS.MAX_STEPS) break;
    const derived = deriveSeedPlan(seed, {
      maxDepth,
      allowAllRelations: true,
      applySafeFallback: true,
    });
    if (derived.steps.length === 0) {
      failedSeeds.push({ urn: seed.urn, reasonCode: 'PLAN_REJECTED' });
      continue;
    }
    steps.push(...derived.steps.slice(0, TRAVERSAL_PLAN_LIMITS.MAX_STEPS - steps.length));
  }

  return { steps, failedSeeds };
}

/**
 * Per-seed semantic validation against server-resolved candidates and the frozen
 * registry. Unknown seeds are reported individually and never erase valid ones
 * (D-13). Returns stable reason codes only — no query text, relation names, or
 * exception messages (D-11, D-14).
 */
export function validatePlanSemantics(
  plan: LooseLogicalQueryPlan,
  candidates: readonly ClarificationCandidate[]
): PlanSemanticValidation {
  const candidateMap = new Map(candidates.map((candidate) => [candidate.urn, candidate]));
  const failedSeeds: FailedSeed[] = [];
  const survivingSeeds: ClarificationCandidate[] = [];

  for (const urn of plan.seedUrns) {
    const candidate = candidateMap.get(urn);
    if (candidate) {
      survivingSeeds.push(candidate);
    } else {
      failedSeeds.push({ urn, reasonCode: 'SEED_NOT_FOUND' });
    }
  }

  if (survivingSeeds.length === 0) {
    return { valid: false, reasonCodes: ['SEED_NOT_FOUND'], failedSeeds };
  }

  const reasonCodes: PlanValidationReasonCode[] = [];
  const depthReason = validateOverallDepth(plan.overallMaxDepth);
  if (depthReason) reasonCodes.push(depthReason);

  if (plan.traversalSteps.length > TRAVERSAL_PLAN_LIMITS.MAX_STEPS) {
    reasonCodes.push('PLAN_REJECTED');
  }

  const survivingUrnSet = new Set(survivingSeeds.map((seed) => seed.urn));
  const survivingKinds = survivingSeeds.map((seed) => seed.kind);
  const validSteps: TraversalStep[] = [];

  for (const looseStep of plan.traversalSteps) {
    const step = {
      relationType: looseStep.relationType,
      direction: looseStep.direction ?? 'OUTGOING',
      maxHops: looseStep.maxHops ?? 1,
      ...(looseStep.targetKind ? { targetKind: looseStep.targetKind } : {}),
      ...(looseStep.seedUrn ? { seedUrn: looseStep.seedUrn } : {}),
    };
    const kindCandidates = step.seedUrn
      ? (() => {
          const seed = candidateMap.get(step.seedUrn);
          return seed ? [seed.kind] : [];
        })()
      : survivingKinds;

    // A step naming a dropped seed is omitted rather than invalidating valid seeds.
    if (step.seedUrn && !survivingUrnSet.has(step.seedUrn)) continue;

    const codes = kindCandidates.map((kind) =>
      validateStepAgainstRegistry(step as LooseTraversalStepCandidate, kind)
    );
    const stepReason = codes.includes(null)
      ? null
      : (codes.find((code) => code !== null) ?? 'PLAN_REJECTED');

    if (stepReason) {
      reasonCodes.push(stepReason);
      continue;
    }
    validSteps.push(step as TraversalStep);
  }

  if (reasonCodes.length > 0) {
    return { valid: false, reasonCodes: [...new Set(reasonCodes)], failedSeeds };
  }

  return {
    valid: true,
    reasonCodes: [],
    failedSeeds,
    plan: {
      ...plan,
      seedUrns: survivingSeeds.map((seed) => seed.urn),
      traversalSteps: validSteps.map((step) => ({ ...step })),
    },
  };
}

/**
 * Builds a deterministic degraded fallback plan using all ontology-valid one-hop
 * relations per seed (D-07, D-12).
 */
export function buildDeterministicFallbackPlan(
  rawQuery: string,
  resolvedSeeds: readonly ClarificationCandidate[],
  reasonCode: string = 'PLANNER_SCHEMA_FAILURE'
): { plan: LogicalQueryPlan; planTrace: PlanTrace; failedSeeds: FailedSeed[] } {
  const boundedSeeds = resolvedSeeds.slice(0, TRAVERSAL_PLAN_LIMITS.MAX_SEEDS);
  const seedUrns = boundedSeeds.map((candidate) => candidate.urn);
  const { steps, failedSeeds } = mergeSeedPlans(
    boundedSeeds,
    TRAVERSAL_PLAN_LIMITS.SAFE_FALLBACK_DEPTH
  );

  const keywords = boundedSeeds.length > 0
    ? [rawQuery.trim(), ...boundedSeeds.map((seed) => seed.canonicalName)]
    : [rawQuery.trim()];

  const fallbackPlan: LogicalQueryPlan = {
    planId: randomUUID(),
    queryIntent: 'LOOKUP',
    seedUrns: seedUrns.length > 0 ? seedUrns : ['urn:plannermate:fallback:none:none'],
    traversalSteps: steps,
    overallMaxDepth: TRAVERSAL_PLAN_LIMITS.SAFE_FALLBACK_DEPTH,
    includeInferred: false,
    fulltextKeywords: keywords.filter(Boolean),
    semanticQuery: rawQuery.trim(),
  };

  const planTrace: PlanTrace = {
    fastPath: false,
    degradedFallback: true,
    intent: 'LOOKUP',
    resolvedUrns: seedUrns.length > 0 ? seedUrns : undefined,
    depth: TRAVERSAL_PLAN_LIMITS.SAFE_FALLBACK_DEPTH,
    reasonCode,
  };

  return { plan: fallbackPlan, planTrace, failedSeeds };
}

/**
 * Builds the fast-path plan for a uniquely resolved entity identifier.
 */
function buildFastPathPlan(
  rawQuery: string,
  resolvedEntity: ClarificationCandidate
): { plan: LogicalQueryPlan; planTrace: PlanTrace; failedSeeds: FailedSeed[] } {
  const { steps, failedSeeds } = mergeSeedPlans(
    [resolvedEntity],
    TRAVERSAL_PLAN_LIMITS.SAFE_FALLBACK_DEPTH
  );

  const plan: LogicalQueryPlan = {
    planId: randomUUID(),
    queryIntent: 'LOOKUP',
    seedUrns: [resolvedEntity.urn],
    traversalSteps: steps,
    overallMaxDepth: TRAVERSAL_PLAN_LIMITS.SAFE_FALLBACK_DEPTH,
    includeInferred: false,
    fulltextKeywords: [rawQuery.trim(), resolvedEntity.canonicalName],
    semanticQuery: rawQuery.trim(),
  };

  const planTrace: PlanTrace = {
    fastPath: true,
    degradedFallback: false,
    intent: 'LOOKUP',
    resolvedUrns: [resolvedEntity.urn],
    depth: TRAVERSAL_PLAN_LIMITS.SAFE_FALLBACK_DEPTH,
  };

  return { plan, planTrace, failedSeeds };
}

export interface BuildPlanParams {
  readonly request: RetrievalRequest;
  readonly pinnedSnapshotId: string;
  readonly gateway: GraphRetrievalGateway;
  readonly planner: QueryPlanner;
  readonly options?: OperationOptions | undefined;
}

/**
 * Coordinator for query planning (18-W0-02B):
 * 1. Pure identifier check: if match and unique resolution, return fast-path plan without calling planner.
 * 2. Natural language / unresolved fast path: resolve candidate entities.
 * 3. If entity resolution is ambiguous or unresolvable pronoun: return NEEDS_CLARIFICATION outcome with safe candidates, raw query text for fulltext/semantic, empty seedUrns, and explicit NO_GRAPH_SEED. Does not short-circuit D-01 fan-out.
 * 4. Otherwise call injected QueryPlanner with bounded query/turns, typed resolved candidates, and registry.
 * 5. Validate output with LogicalQueryPlanSchema and server-side semantic rules (allowed seeds, closed relations, max hops, no cypher).
 * 6. Allow exactly one repair attempt.
 * 7. On second failure, emit deterministic degraded fallback with PLANNER_SCHEMA_FAILURE trace.
 */
export async function buildQueryExecutionPlan(
  params: BuildPlanParams
): Promise<QueryExecutionPlanningOutcome> {
  const { request, pinnedSnapshotId, gateway, planner, options } = params;
  const rawQuery = request.query;

  // Step 1: Check pure identifier fast path (D-03)
  if (isPureIdentifierQuery(rawQuery)) {
    const resolution = await resolveQueryEntities(
      gateway,
      pinnedSnapshotId,
      rawQuery,
      request.recentTurns,
      options
    );

    if (resolution.status === 'resolved') {
      const fastPathResult = buildFastPathPlan(rawQuery, resolution.resolved);
      return {
        status: 'executable',
        plan: fastPathResult.plan,
        planTrace: fastPathResult.planTrace,
        isFastPath: true,
        isDegraded: false,
        failedSeeds: fastPathResult.failedSeeds,
        seedKinds: { [resolution.resolved.urn]: resolution.resolved.kind },
      };
    }
    // If pure identifier is ambiguous or needs clarification, fall through to natural resolution & clarification logic
  }

  // Step 2: Natural language entity resolution
  const resolution = await resolveQueryEntities(
    gateway,
    pinnedSnapshotId,
    rawQuery,
    request.recentTurns,
    options
  );

  // Step 3: Handle unresolvable references (D-04)
  if (resolution.status === 'needsClarification' || resolution.candidates.length === 0) {
    const safeCandidates = resolution.candidates || [];
    return {
      status: 'needsClarification',
      semanticOutcome: 'NEEDS_CLARIFICATION',
      safeCandidates,
      fulltextKeywords: [rawQuery.trim()],
      semanticQuery: rawQuery.trim(),
      seedUrns: [],
      graphDirective: 'NO_GRAPH_SEED',
      planTrace: {
        fastPath: false,
        degradedFallback: false,
        reasonCode: 'NO_GRAPH_SEED',
      },
    };
  }

  // Forward all resolved/ambiguous candidates to QueryPlanner
  const resolvedCandidates = [...resolution.candidates];

  // Step 4: Invoke QueryPlanner
  const plannerContext = {
    resolvedCandidates,
    registeredNodeKinds: NODE_KINDS,
    registeredRelationTypes: RELATION_TYPES,
  };

  // Helper to validate a returned plan (stable codes only)
  const validateResultPlan = (
    candidatePlan: unknown
  ): {
    valid: boolean;
    plan?: LogicalQueryPlan;
    reasonCodes: PlanValidationReasonCode[];
    failedSeeds: FailedSeed[];
  } => {
    // 1. Loose parse so unknown relations and over-depth values reach semantic
    //    validation with stable codes instead of dying as PLAN_REJECTED.
    const loose = LooseLogicalQueryPlanSchema.safeParse(candidatePlan);
    if (!loose.success) {
      return { valid: false, reasonCodes: ['PLAN_REJECTED'], failedSeeds: [] };
    }

    // 2. Per-seed semantic validation against resolved candidates & registry
    const semanticCheck = validatePlanSemantics(loose.data, resolvedCandidates);
    if (!semanticCheck.valid || !semanticCheck.plan) {
      return {
        valid: false,
        reasonCodes: [...semanticCheck.reasonCodes],
        failedSeeds: [...semanticCheck.failedSeeds],
      };
    }

    // 3. Strict parse once semantics pass, producing the typed plan.
    const strict = LogicalQueryPlanSchema.safeParse(semanticCheck.plan);
    if (!strict.success) {
      return {
        valid: false,
        reasonCodes: ['PLAN_REJECTED'],
        failedSeeds: [...semanticCheck.failedSeeds],
      };
    }

    return {
      valid: true,
      plan: strict.data,
      reasonCodes: [],
      failedSeeds: [...semanticCheck.failedSeeds],
    };
  };

  try {
    const firstResult = await planner.plan(request, plannerContext, options);

    if (firstResult.type === 'unsupported') {
      return {
        status: 'unsupported',
        semanticOutcome: 'UNSUPPORTED',
        reason: firstResult.reason,
        unsupportedConstructs: [...firstResult.unsupportedConstructs],
        planTrace: {
          fastPath: false,
          degradedFallback: false,
          reasonCode: 'UNSUPPORTED',
        },
      };
    }

    if (firstResult.type === 'clarification') {
      return {
        status: 'needsClarification',
        semanticOutcome: 'NEEDS_CLARIFICATION',
        safeCandidates: firstResult.candidates,
        fulltextKeywords: [rawQuery.trim()],
        semanticQuery: rawQuery.trim(),
        seedUrns: [],
        graphDirective: 'NO_GRAPH_SEED',
        planTrace: {
          fastPath: false,
          degradedFallback: false,
          reasonCode: 'NO_GRAPH_SEED',
        },
      };
    }

    if (firstResult.type === 'plan') {
      const check = validateResultPlan(firstResult.plan);
      if (check.valid && check.plan) {
        return {
          status: 'executable',
          plan: check.plan,
          planTrace: {
            fastPath: false,
            degradedFallback: false,
            intent: check.plan.queryIntent,
            resolvedUrns: [...check.plan.seedUrns],
            depth: check.plan.overallMaxDepth,
          },
          isFastPath: false,
          isDegraded: false,
          failedSeeds: check.failedSeeds,
          seedKinds: seedKindMap(resolvedCandidates),
        };
      }

      // Exactly ONE repair attempt. The original query is reused unchanged and the
      // context carries stable reason codes only (D-11).
      const repairContext = {
        ...plannerContext,
        repair: { attempt: 1 as const, reasonCodes: check.reasonCodes },
      };
      const repairResult = await planner.plan(request, repairContext, options);
      if (repairResult.type === 'plan') {
        const repairCheck = validateResultPlan(repairResult.plan);
        if (repairCheck.valid && repairCheck.plan) {
          return {
            status: 'executable',
            plan: repairCheck.plan,
            planTrace: {
              fastPath: false,
              degradedFallback: false,
              intent: repairCheck.plan.queryIntent,
              resolvedUrns: [...repairCheck.plan.seedUrns],
              depth: repairCheck.plan.overallMaxDepth,
            },
            isFastPath: false,
            isDegraded: false,
            failedSeeds: repairCheck.failedSeeds,
            seedKinds: seedKindMap(resolvedCandidates),
          };
        }
      }
    }
  } catch (err: unknown) {
    if (options?.signal?.aborted || (err as Error)?.name === 'AbortError') {
      throw err;
    }
    // If planner throws non-abort error, proceed to degraded fallback
  }

  // Degraded fallback on planner failure or validation failure (D-12)
  const fallback = buildDeterministicFallbackPlan(
    rawQuery,
    resolvedCandidates,
    'PLANNER_SCHEMA_FAILURE'
  );

  return {
    status: 'executable',
    plan: fallback.plan,
    planTrace: fallback.planTrace,
    isFastPath: false,
    isDegraded: true,
    failedSeeds: fallback.failedSeeds,
    seedKinds: seedKindMap(resolvedCandidates),
  };
}
