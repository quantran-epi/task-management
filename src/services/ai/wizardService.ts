import { z, type ZodIssue } from 'zod';
import { completeJson, probeStructuredOutputCapability } from './nineRouterClient';
import { createDefaultGroundedTurnDeps, executeGroundedTurn } from './groundedTurnDeps';
import type { GroundedTurnDeps } from './groundedTurn';
import { runLocalGroundedRetrieval, type LocalGroundedResult } from '../search/localGroundedRetrieval';
import { createPhaseLogger } from './log';
import {
  buildGapPrompt,
  buildProposalPrompt,
  buildRepairPrompt,
  WIZARD_GAP_JSON_SCHEMA,
  WIZARD_PROMPT_VERSION,
  WIZARD_STABLE_SYSTEM_PREFIX,
  WIZARD_STAGE_JSON_SCHEMAS,
  WizardCabProposalSchema,
  WizardGapResultSchema,
  WizardPl03ProposalSchema,
  WizardPl07ProposalSchema,
  WizardSolutionProposalSchema,
  type WizardGapResult,
} from './wizardPrompts';
import type { WizardSkill } from './wizardSchemas';

export type WizardDegradedCode = 'REMOTE_UNAVAILABLE' | 'REMOTE_DISABLED' | 'MCP_UNAVAILABLE';

export interface WizardEvidenceItem {
  id: string;
  source: 'local' | 'remote' | 'mcp';
  documentId: string;
  documentTitle?: string;
  contentHash: string;
  lineStart: number;
  lineEnd: number;
  startOffset: number;
  endOffset: number;
  excerpt: string;
}

export interface WizardEvidence {
  items: WizardEvidenceItem[];
  coverage: 'EMPTY_SCOPE' | 'PARTIAL' | 'COMPLETE';
  degraded: WizardDegradedCode[];
}

export interface WizardEvidenceInput {
  projectId: string;
  threadId: string;
  sessionId: string;
  inputRevision: number;
  query: string;
  resolvedSetIds: readonly string[];
  prioritizedDocIds?: readonly string[];
  signal?: AbortSignal;
}

export interface WizardEvidenceDeps {
  runLocalBm25: (input: {
    query: string;
    resolvedSetIds: readonly string[];
    prioritizedDocIds?: readonly string[];
  }) => Promise<LocalGroundedResult>;
  retrieveRemote?: (input: WizardEvidenceInput, signal: AbortSignal) => Promise<WizardEvidenceItem[]>;
  retrieveMcp?: (input: WizardEvidenceInput, signal: AbortSignal) => Promise<WizardEvidenceItem[]>;
}

export interface WizardModelRequest {
  endpoint: string;
  apiKey?: string;
  model: string;
  messages: Array<{ role: 'system' | 'user'; content: string }>;
  maxTokens: number;
  signal: AbortSignal;
  responseFormat?: {
    type: 'json_schema';
    json_schema: { name: string; strict: true; schema: Record<string, unknown> };
  };
  tools: readonly [];
}

export interface WizardModel {
  endpoint: string;
  apiKey?: string;
  model: string;
  complete?: (request: WizardModelRequest) => Promise<unknown>;
  probe?: (signal: AbortSignal) => Promise<{ ok: true; strictJsonSchema: boolean } | { ok: false; reason: string }>;
}

export class WizardStageError extends Error {
  constructor(
    public readonly code:
    | 'ABORTED'
    | 'STALE_RESULT'
    | 'DEADLINE_EXCEEDED'
    | 'INVALID_OUTPUT'
    | 'AUTH'
    | 'UNSUPPORTED'
    | 'REMOTE_ERROR',
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'WizardStageError';
  }
}

const MAX_ATTEMPTS = 3;
const STAGE_DEADLINE_MS = 180_000;
const INITIAL_TIMEOUT_MS = 90_000;
const REPAIR_TIMEOUT_MS = 45_000;

function throwIfCancelled(signal: AbortSignal): void {
  if (signal.aborted) throw new WizardStageError('ABORTED');
}

function makeDeadlineSignal(parent: AbortSignal, timeoutMs: number, deadline: number): AbortSignal {
  const controller = new AbortController();
  const abort = () => controller.abort(parent.reason);
  if (parent.aborted) abort();
  else parent.addEventListener('abort', abort, { once: true });
  const remaining = Math.min(timeoutMs, Math.max(0, deadline - Date.now()));
  const timer = setTimeout(() => controller.abort('deadline'), remaining);
  controller.signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
  return controller.signal;
}

function issueCode(issue: ZodIssue): { path: string; code: string } {
  return { path: issue.path.join('.') || '$', code: issue.code };
}

function collectCitationIds(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(collectCitationIds);
  if (!value || typeof value !== 'object') return [];
  const entries = Object.entries(value as Record<string, unknown>);
  return entries.flatMap(([key, nested]) =>
    key === 'citationIds' && Array.isArray(nested)
      ? nested.filter((id): id is string => typeof id === 'string')
      : collectCitationIds(nested));
}

function isAuthError(error: unknown): boolean {
  const code = (error as { code?: unknown })?.code;
  const status = (error as { status?: unknown })?.status;
  return code === 'AUTH' || status === 401 || status === 403;
}

function toLocalEvidence(result: LocalGroundedResult): WizardEvidenceItem[] {
  return result.ranges.map((range, index) => ({
    id: `local-${range.documentId}-${range.lineStart}-${range.lineEnd}-${index}`,
    source: 'local',
    documentId: range.documentId,
    ...(range.documentTitle ? { documentTitle: range.documentTitle } : {}),
    contentHash: range.contentHash,
    lineStart: range.lineStart,
    lineEnd: range.lineEnd,
    startOffset: range.startOffset,
    endOffset: range.endOffset,
    excerpt: range.rawSnippet,
  }));
}

export async function collectWizardEvidence(
  input: WizardEvidenceInput,
  deps: WizardEvidenceDeps,
): Promise<WizardEvidence> {
  const signal = input.signal ?? new AbortController().signal;
  throwIfCancelled(signal);
  if (input.resolvedSetIds.length === 0) {
    return { items: [], coverage: 'EMPTY_SCOPE', degraded: [] };
  }

  const local = await deps.runLocalBm25({
    query: input.query,
    resolvedSetIds: input.resolvedSetIds,
    ...(input.prioritizedDocIds ? { prioritizedDocIds: input.prioritizedDocIds } : {}),
  });
  throwIfCancelled(signal);
  const items = toLocalEvidence(local);
  const degraded: WizardDegradedCode[] = [];

  const collectOptional = async (
    fn: ((input: WizardEvidenceInput, signal: AbortSignal) => Promise<WizardEvidenceItem[]>) | undefined,
    code: WizardDegradedCode,
  ): Promise<WizardEvidenceItem[]> => {
    if (!fn) {
      degraded.push(code === 'REMOTE_UNAVAILABLE' ? 'REMOTE_DISABLED' : code);
      return [];
    }
    try {
      return await fn(input, signal);
    } catch (error) {
      if (isAuthError(error)) throw error;
      degraded.push(code);
      return [];
    }
  };

  const remote = await collectOptional(deps.retrieveRemote, 'REMOTE_UNAVAILABLE');
  const mcp = await collectOptional(deps.retrieveMcp, 'MCP_UNAVAILABLE');
  const combined = [...items, ...remote, ...mcp];
  const unique = Array.from(new Map(combined.map((item) => [item.id, item])).values());
  return {
    items: unique,
    coverage: degraded.length > 0 ? 'PARTIAL' : 'COMPLETE',
    degraded,
  };
}

export interface RunValidatedStageInput<T> {
  stage: string;
  schema: z.ZodType<T>;
  jsonSchema: Record<string, unknown>;
  evidenceIds: readonly string[];
  frozenPrompt: string;
  maxTokens: number;
  model: WizardModel;
  signal?: AbortSignal;
  isCurrent: () => boolean;
  onUsage?: (usage: unknown) => void;
}

export async function runValidatedStage<T>(input: RunValidatedStageInput<T>): Promise<T> {
  const parent = input.signal ?? new AbortController().signal;
  const deadline = Date.now() + STAGE_DEADLINE_MS;
  const logger = createPhaseLogger('RETRIEVE');
  let previousRaw: unknown = undefined;
  let issues: { path: string; code: string }[] = [];
  let strictSupported = false;

  try {
    const probe = input.model.probe
      ? await input.model.probe(parent)
      : await probeStructuredOutputCapability(input.model.endpoint, input.model.model, input.model.apiKey, parent);
    strictSupported = probe.ok && probe.strictJsonSchema;
  } catch (error) {
    if (isAuthError(error)) throw new WizardStageError('AUTH');
    strictSupported = false;
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    throwIfCancelled(parent);
    if (!input.isCurrent()) throw new WizardStageError('STALE_RESULT');
    if (Date.now() >= deadline) throw new WizardStageError('DEADLINE_EXCEEDED');

    const signal = makeDeadlineSignal(parent, attempt === 0 ? INITIAL_TIMEOUT_MS : REPAIR_TIMEOUT_MS, deadline);
    const prompt = attempt === 0
      ? input.frozenPrompt
      : buildRepairPrompt(issues);
    const request: WizardModelRequest = {
      endpoint: input.model.endpoint,
      ...(input.model.apiKey !== undefined ? { apiKey: input.model.apiKey } : {}),
      model: input.model.model,
      maxTokens: input.maxTokens,
      signal,
      tools: [],
      messages: [
        { role: 'system', content: WIZARD_STABLE_SYSTEM_PREFIX },
        { role: 'user', content: prompt },
      ],
      ...(strictSupported ? {
        responseFormat: {
          type: 'json_schema' as const,
          json_schema: { name: `${input.stage.replace(/[^a-z0-9]+/gi, '_')}_v1`, strict: true as const, schema: input.jsonSchema },
        },
      } : {}),
    };

    try {
      const raw = await (input.model.complete ?? completeJson)(request);
      previousRaw = raw;
      throwIfCancelled(parent);
      if (!input.isCurrent()) throw new WizardStageError('STALE_RESULT');
      const parsed = input.schema.safeParse(raw);
      if (parsed.success) {
        const allowedEvidenceIds = new Set(input.evidenceIds);
        const citedIds = collectCitationIds(parsed.data);
        const unknownCitation = citedIds.find((id) => !allowedEvidenceIds.has(id));
        if (!unknownCitation) {
          logger.info('wizard_stage_complete', {
            stage: input.stage,
            outcome: 'VALID',
            attempts: attempt + 1,
            toolCount: 0,
            degraded: false,
          });
          return parsed.data;
        }
        issues = [{ path: 'citationIds', code: 'UNKNOWN_CITATION_ID' }];
      } else {
        issues = parsed.error.issues.map(issueCode);
      }
      logger.warn('wizard_stage_validation_failed', {
        stage: input.stage,
        outcome: 'INVALID_OUTPUT',
        attempts: attempt + 1,
        issueCount: issues.length,
      });
    } catch (error) {
      if (error instanceof WizardStageError) throw error;
      if (isAuthError(error)) throw new WizardStageError('AUTH');
      const code = (error as { code?: unknown })?.code;
      if (code === 'ABORTED' || code === 'TIMEOUT') {
        throw new WizardStageError(code === 'TIMEOUT' ? 'DEADLINE_EXCEEDED' : 'ABORTED');
      }
      if (code === 'UNSUPPORTED') throw new WizardStageError('UNSUPPORTED');
      issues = [{ path: '$', code: 'MODEL_ERROR' }];
      logger.warn('wizard_stage_model_failed', {
        stage: input.stage,
        outcome: 'REMOTE_ERROR',
        attempts: attempt + 1,
      });
    }
  }

  void previousRaw;
  throw new WizardStageError('INVALID_OUTPUT');
}

export interface DetectWizardGapsInput {
  projectId: string;
  threadId: string;
  sessionId: string;
  inputRevision: number;
  skill: WizardSkill;
  knownFieldIds: readonly string[];
  skippedFieldIds: readonly string[];
  evidence: WizardEvidence;
  model: WizardModel;
  signal?: AbortSignal;
  isCurrent: () => boolean;
}

export async function detectWizardGaps(input: DetectWizardGapsInput): Promise<WizardGapResult> {
  const evidenceIds = input.evidence?.items?.map((item) => item.id) ?? [];
  const result = await runValidatedStage({
    stage: 'gap-detection',
    schema: WizardGapResultSchema,
    jsonSchema: WIZARD_GAP_JSON_SCHEMA,
    evidenceIds,
    frozenPrompt: buildGapPrompt({
      skill: input.skill,
      knownFieldIds: input.knownFieldIds,
      skippedFieldIds: input.skippedFieldIds,
      evidence: input.evidence.items,
    }),
    maxTokens: 2500,
    model: input.model,
    ...(input.signal ? { signal: input.signal } : {}),
    isCurrent: input.isCurrent,
  });

  const allowedIds = new Set(evidenceIds);
  const known = new Set([...input.knownFieldIds, ...input.skippedFieldIds]);
  const gaps = result.gaps.filter((gap) => !known.has(gap.fieldId));
  if (gaps.some((gap) => gap.citationIds.some((id) => !allowedIds.has(id)))) {
    throw new WizardStageError('INVALID_OUTPUT', 'UNKNOWN_CITATION_ID');
  }
  return { ...result, gaps, unknowns: Array.from(new Set([...result.unknowns, ...input.skippedFieldIds])) };
}

export interface WizardStageInput {
  kind: WizardSkill;
  projectId: string;
  threadId: string;
  sessionId: string;
  inputRevision: number;
  model: WizardModel;
  signal?: AbortSignal;
  isCurrent: () => boolean;
  payload: unknown;
}

interface ArtifactPin {
  artifactId: string;
  version: number;
  hash: string;
  projectId: string;
  threadId: string;
}

function requirePin(pin: ArtifactPin, input: WizardStageInput): void {
  if (pin.projectId !== input.projectId || pin.threadId !== input.threadId) {
    throw new WizardStageError('INVALID_OUTPUT', 'ARTIFACT_IDENTITY_MISMATCH');
  }
  if (!/^[a-f0-9]{64}$/.test(pin.hash) || pin.version < 1) {
    throw new WizardStageError('INVALID_OUTPUT', 'ARTIFACT_PIN_INVALID');
  }
}

function validateCabSources(input: WizardStageInput, payload: {
  sources: Array<ArtifactPin & { kind: 'PL02' | 'PL03B' | 'PL07'; approved: boolean }>;
  expectedVersions: Record<'PL02' | 'PL03B' | 'PL07', number>;
}): void {
  const required = new Set(['PL02', 'PL03B', 'PL07']);
  if (payload.sources.length !== 3 || payload.sources.some((source) => !required.delete(source.kind))) {
    throw new WizardStageError('INVALID_OUTPUT', 'CAB_SOURCES_REQUIRED');
  }
  for (const source of payload.sources) {
    requirePin(source, input);
    if (!source.approved || payload.expectedVersions[source.kind] !== source.version) {
      throw new WizardStageError('INVALID_OUTPUT', 'CAB_MIXED_OR_UNAPPROVED_REVISION');
    }
  }
}

function proposalContract(kind: Exclude<WizardSkill, 'PL02'>): {
  schema: z.ZodType<unknown>;
  maxTokens: number;
} {
  switch (kind) {
    case 'SOLUTION': return { schema: WizardSolutionProposalSchema, maxTokens: 8000 };
    case 'PL03': return { schema: WizardPl03ProposalSchema, maxTokens: 8000 };
    case 'PL07': return { schema: WizardPl07ProposalSchema, maxTokens: 8000 };
    case 'CAB': return { schema: WizardCabProposalSchema, maxTokens: 8000 };
  }
}

export async function runWizardStage(input: WizardStageInput): Promise<unknown> {
  if (!input.isCurrent()) throw new WizardStageError('STALE_RESULT');
  if (input.kind === 'PL02') {
    const payload = input.payload as { evidence?: WizardEvidence; knownFieldIds?: string[]; skippedFieldIds?: string[] };
    const evidence = payload.evidence ?? { items: [], coverage: 'EMPTY_SCOPE' as const, degraded: [] };
    return detectWizardGaps({
      ...input,
      skill: input.kind,
      evidence,
      knownFieldIds: payload.knownFieldIds ?? [],
      skippedFieldIds: payload.skippedFieldIds ?? [],
    });
  }

  const payload = input.payload as {
    evidence: WizardEvidence;
    pinnedSolution?: ArtifactPin;
    sources?: Array<ArtifactPin & { kind: 'PL02' | 'PL03B' | 'PL07'; approved: boolean }>;
    expectedVersions?: Record<'PL02' | 'PL03B' | 'PL07', number>;
  };
  if (!payload.evidence) throw new WizardStageError('INVALID_OUTPUT', 'EVIDENCE_REQUIRED');
  if (input.kind === 'PL03') {
    if (!payload.pinnedSolution) throw new WizardStageError('INVALID_OUTPUT', 'PINNED_SOLUTION_REQUIRED');
    requirePin(payload.pinnedSolution, input);
  }
  if (input.kind === 'CAB') {
    if (!payload.sources || !payload.expectedVersions) throw new WizardStageError('INVALID_OUTPUT', 'CAB_SOURCES_REQUIRED');
    validateCabSources(input, { sources: payload.sources, expectedVersions: payload.expectedVersions });
  }

  const contract = proposalContract(input.kind);
  const result = await runValidatedStage({
    stage: input.kind,
    schema: contract.schema,
    jsonSchema: WIZARD_STAGE_JSON_SCHEMAS[input.kind] ?? { type: 'object' },
    evidenceIds: payload.evidence.items.map((item) => item.id),
    frozenPrompt: buildProposalPrompt({ kind: input.kind, payload: input.payload, evidence: payload.evidence.items }),
    maxTokens: contract.maxTokens,
    model: input.model,
    ...(input.signal ? { signal: input.signal } : {}),
    isCurrent: input.isCurrent,
  });
  if (input.kind === 'CAB') {
    validateCabSources(input, { sources: payload.sources!, expectedVersions: payload.expectedVersions! });
  }
  return result;
}

export function createWizardGroundedDeps(options: {
  knowledgeBaseUrl: string;
  knowledgeToken: string;
}): GroundedTurnDeps {
  return createDefaultGroundedTurnDeps(options);
}

export { runLocalGroundedRetrieval };
export { WIZARD_PROMPT_VERSION };
export type { GroundedTurnDeps };
export { executeGroundedTurn };
