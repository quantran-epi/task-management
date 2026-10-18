import {
  ClarificationCandidate,
  ConversationTurn,
  LogicalQueryPlan,
  LogicalQueryPlanSchema,
  PlanTrace,
  RetrievalRequest,
  TraversalStep,
} from '../types/retrievalProtocol.js';
import {
  GraphRetrievalGateway,
  OperationOptions,
  QueryPlanner,
} from './contracts.js';
import { URN_REGEX } from '../types/graphProtocol.js';
import {
  NODE_KINDS,
  RELATION_TYPES,
  RETRIEVAL_ONTOLOGY_REGISTRY,
} from '../graph/ontology.js';
import { removeVietnameseDiacritics } from '../graph/extraction.js';
import { randomUUID } from 'node:crypto';

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

/**
 * Normalizes plan semantics where planner output remains non-deterministic (e.g. IMPACT_ANALYSIS on DatabaseObject).
 */
export function normalizePlanSemantics(
  plan: LogicalQueryPlan,
  candidates: readonly ClarificationCandidate[]
): LogicalQueryPlan {
  if (plan.queryIntent === 'IMPACT_ANALYSIS') {
    const candidateMap = new Map(candidates.map((c) => [c.urn, c]));
    const seedCandidates = plan.seedUrns.map((urn) => candidateMap.get(urn)).filter(Boolean);
    const hasDbObjectSeed = seedCandidates.some((c) => c?.kind === 'DatabaseObject');

    if (hasDbObjectSeed) {
      // DatabaseObject is only targeted by READS_FROM/WRITES_TO. Always canonicalize
      // impact traversal so a schema-valid but incomplete model plan cannot skip callers.
      const normalizedSteps: TraversalStep[] = [
        {
          relationType: 'READS_FROM',
          direction: 'INCOMING',
          maxHops: 1,
          targetKind: 'SoftwareComponent',
        },
      ];
      return {
        ...plan,
        traversalSteps: normalizedSteps,
        overallMaxDepth: 1,
      };
    }
  }
  return plan;
}

/**
 * Validates logical plan against server-resolved allowlists and ontology registry bounds.
 */
function validatePlanSemantics(
  plan: LogicalQueryPlan,
  allowedUrnSet: ReadonlySet<string>
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  // Check seed URNs against server-resolved allowlist
  for (const seed of plan.seedUrns) {
    if (!allowedUrnSet.has(seed)) {
      issues.push(`Seed URN ${seed} is not in server-resolved candidate allowlist`);
    }
  }

  // Traversal steps bounds: max 5
  if (plan.traversalSteps.length > 5) {
    issues.push(`Traversal steps count ${plan.traversalSteps.length} exceeds maximum 5`);
  }

  // Overall max depth 1..3
  if (plan.overallMaxDepth < 1 || plan.overallMaxDepth > 3) {
    issues.push(`Overall max depth ${plan.overallMaxDepth} outside permitted range 1..3`);
  }

  // Traversal steps relation and direction checks
  for (let i = 0; i < plan.traversalSteps.length; i++) {
    const step = plan.traversalSteps[i]!;
    const registryEntry = RETRIEVAL_ONTOLOGY_REGISTRY[step.relationType];
    if (!registryEntry) {
      issues.push(`Unknown relation type ${step.relationType} at step ${i}`);
      continue;
    }

    if (step.maxHops < 1 || step.maxHops > 3) {
      issues.push(`Step ${i} maxHops ${step.maxHops} outside range 1..3`);
    }
    if (step.maxHops > registryEntry.maxHops) {
      issues.push(`Step ${i} maxHops ${step.maxHops} exceeds ontology ceiling ${registryEntry.maxHops}`);
    }

    if (step.targetKind && !NODE_KINDS.includes(step.targetKind)) {
      issues.push(`Step ${i} targetKind ${step.targetKind} not in allowed NODE_KINDS`);
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

/**
 * Builds a deterministic degraded fallback plan (D-06, D-16).
 */
export function buildDeterministicFallbackPlan(
  rawQuery: string,
  resolvedSeeds: readonly ClarificationCandidate[],
  reasonCode: string = 'PLANNER_SCHEMA_FAILURE'
): { plan: LogicalQueryPlan; planTrace: PlanTrace } {
  const hasSeeds = resolvedSeeds.length > 0;
  const seedUrns = hasSeeds
    ? resolvedSeeds.slice(0, 5).map((c) => c.urn)
    : [];

  // If seeds exist, generate a single one-hop BOTH traversal step matching overallMaxDepth = 1
  const traversalSteps: TraversalStep[] = [];
  if (hasSeeds) {
    traversalSteps.push({
      relationType: 'CONTAINS_STEP',
      direction: 'BOTH',
      maxHops: 1,
    });
  }

  const keywords = hasSeeds
    ? [rawQuery.trim(), ...resolvedSeeds.map((s) => s.canonicalName)]
    : [rawQuery.trim()];

  const fallbackPlan: LogicalQueryPlan = {
    planId: randomUUID(),
    queryIntent: hasSeeds ? 'LOOKUP' : 'LOOKUP',
    seedUrns: seedUrns.length > 0 ? seedUrns : ['urn:plannermate:fallback:none:none'], // placeholder if empty, but seedUrns validated with min 1
    traversalSteps,
    overallMaxDepth: 1,
    includeInferred: false,
    fulltextKeywords: keywords.filter(Boolean),
    semanticQuery: rawQuery.trim(),
  };

  const planTrace: PlanTrace = {
    fastPath: false,
    degradedFallback: true,
    intent: 'LOOKUP',
    resolvedUrns: seedUrns.length > 0 ? seedUrns : undefined,
    depth: 1,
    reasonCode,
  };

  return { plan: fallbackPlan, planTrace };
}

/**
 * Builds default fast-path execution plan for a uniquely resolved entity identifier.
 */
function buildFastPathPlan(
  rawQuery: string,
  resolvedEntity: ClarificationCandidate
): { plan: LogicalQueryPlan; planTrace: PlanTrace } {
  const traversalSteps: TraversalStep[] = [
    {
      relationType: 'CONTAINS_STEP',
      direction: 'BOTH',
      maxHops: 1,
    },
  ];

  const plan: LogicalQueryPlan = {
    planId: randomUUID(),
    queryIntent: 'LOOKUP',
    seedUrns: [resolvedEntity.urn],
    traversalSteps,
    overallMaxDepth: 1,
    includeInferred: false,
    fulltextKeywords: [rawQuery.trim(), resolvedEntity.canonicalName],
    semanticQuery: rawQuery.trim(),
  };

  const planTrace: PlanTrace = {
    fastPath: true,
    degradedFallback: false,
    intent: 'LOOKUP',
    resolvedUrns: [resolvedEntity.urn],
    depth: 1,
  };

  return { plan, planTrace };
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
  const allowedUrnSet = new Set(resolvedCandidates.map((c) => c.urn));

  // Step 4: Invoke QueryPlanner
  const plannerContext = {
    resolvedCandidates,
    registeredNodeKinds: NODE_KINDS,
    registeredRelationTypes: RELATION_TYPES,
  };

  // Helper to validate a returned plan
  const validateResultPlan = (candidatePlan: any): { valid: boolean; plan?: LogicalQueryPlan; issues: string[] } => {
    // 1. Zod schema validation
    const parsed = LogicalQueryPlanSchema.safeParse(candidatePlan);
    if (!parsed.success) {
      return {
        valid: false,
        issues: parsed.error.issues.map((iss) => `${iss.path.join('.')}: ${iss.message}`),
      };
    }

    // 2. Semantic validation against allowed URNs & registry
    const semanticCheck = validatePlanSemantics(parsed.data, allowedUrnSet);
    if (!semanticCheck.valid) {
      return {
        valid: false,
        issues: semanticCheck.issues,
      };
    }

    return {
      valid: true,
      plan: parsed.data,
      issues: [],
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
      const normalizedPlan = normalizePlanSemantics(firstResult.plan, resolvedCandidates);
      const check = validateResultPlan(normalizedPlan);
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
        };
      }

      // Exactly ONE repair attempt (D-06, D-16, T-18-02)
      // Call planner again with repair feedback (issues codes/paths only, no secrets or raw output)
      const repairRequest: RetrievalRequest = {
        ...request,
        query: `${rawQuery} [REPAIR_VALIDATION_ERRORS: ${check.issues.join('; ')}]`,
      };

      const repairResult = await planner.plan(repairRequest, plannerContext, options);
      if (repairResult.type === 'plan') {
        const normalizedRepairPlan = normalizePlanSemantics(repairResult.plan, resolvedCandidates);
        const repairCheck = validateResultPlan(normalizedRepairPlan);
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
          };
        }
      }
    }
  } catch {
    // If planner throws, proceed to degraded fallback
  }

  // Degraded fallback on planner failure or validation failure
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
  };
}
