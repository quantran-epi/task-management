import type { TaskPlannerDatabase } from '../../db';
import type { CabDocxPayload } from '../export/cabDocx';
import {
  runWizardStage,
  type WizardEvidence,
  type WizardEvidenceInput,
  type WizardModel,
} from '../ai/wizardService';
import { WizardCabProposalSchema } from '../ai/wizardPrompts';
import { saveApprovedArtifact } from './artifactRepo';
import { ensurePl02ArtifactNote } from './hubExport';
import { defaultSha256 } from './workflowCoordinator';
import type { SdlcWorkflowMetadata, SdlcWorkflowState } from './workflowSchemas';

/** The shape `requirePin`/`validateCabSources` and `cabSourceSchema` both require. Build once, reuse. */
export interface CabSourcePin {
  artifactId: string;
  kind: 'PL02' | 'PL03B' | 'PL07';
  changeRequestId: string;
  threadId: string;
  version: number;
  hash: string;
  approved: true;
}

type CabSourceKind = CabSourcePin['kind'];

export interface HubCabInput {
  db: TaskPlannerDatabase;
  changeRequestId: string;
  threadId: string;
  sessionId: string;
  draftRevision: number;
  metadata: SdlcWorkflowMetadata;
  state: SdlcWorkflowState;
  model: WizardModel;
  collectEvidence: (input: WizardEvidenceInput) => Promise<WizardEvidence>;
  /** Published SDLC sets for the project. Must not default to `[]` — an empty scope strips every citation. */
  resolveSetIds: (changeRequestId: string) => Promise<readonly string[]>;
  runStage?: typeof runWizardStage;
  signal?: AbortSignal;
  isCurrent?: () => boolean;
}

export interface HubCabResult {
  markdown: string;
  payload: CabDocxPayload;
  noteId: string;
  /** The PL02 pin this call resolved and used. Diagnostics/tests only — no caller persists it. */
  pl02: { noteId: string; version: number; hash: string };
}

/** D-17: reviewable draft. Nothing here has been persisted or approved. */
export interface HubCabDraftResult {
  markdown: string;
  payload: CabDocxPayload;
  pl02: { noteId: string; version: number; hash: string };
  /** The three real, approved source pins the draft was generated against. */
  sources: CabSourcePin[];
}

export interface CabPayloadContext {
  metadata: SdlcWorkflowMetadata;
  changeRequestId: string;
  threadId: string;
  inputRevision: number;
  draftRevision: number;
  sources: CabSourcePin[];
}

const MAX_CHANGE_CHARS = 600;
const MAX_CHANGE_ITEMS = 12;
const MAX_TEXT_CHARS = 1000;

function pinRecord<T>(sources: readonly CabSourcePin[], pick: (pin: CabSourcePin) => T): Record<CabSourceKind, T> {
  const find = (kind: CabSourceKind) => sources.find((pin) => pin.kind === kind)!;
  return { PL02: pick(find('PL02')), PL03B: pick(find('PL03B')), PL07: pick(find('PL07')) };
}

export function toCabDocxPayload(proposal: unknown, ctx: CabPayloadContext): CabDocxPayload {
  const parsed = WizardCabProposalSchema.safeParse(proposal);
  if (!parsed.success) throw new Error('CAB_PROPOSAL_INVALID');
  const data = parsed.data;
  const [first, ...rest] = data.sections;

  return {
    schemaVersion: 1,
    kind: 'CAB',
    status: 'approved',
    inputRevision: ctx.inputRevision,
    draftRevision: ctx.draftRevision,
    approvedRevision: ctx.draftRevision,
    changeRequestId: ctx.changeRequestId,
    threadId: ctx.threadId,
    sourceArtifactIds: pinRecord(ctx.sources, (pin) => pin.artifactId),
    sources: ctx.sources,
    expectedVersions: pinRecord(ctx.sources, (pin) => pin.version),
    expectedHashes: pinRecord(ctx.sources, (pin) => pin.hash),
    title: data.title,
    contextObjective: (first?.body ?? '').slice(0, 4000),
    // The CAB proposal schema has no test-result fields; inventing SIT/UAT results would fabricate.
    businessChanges: [],
    technicalChanges: rest
      .slice(0, MAX_CHANGE_ITEMS)
      .map((section) => `${section.heading}: ${section.body}`.slice(0, MAX_CHANGE_CHARS)),
    sit: null,
    uat: null,
    risks: data.risks.slice(0, 50),
    unresolvedDrift: data.unresolvedDrift.slice(0, 50),
    rollback: data.rollback,
    caveats: [...data.missingTests, ...data.caveats].slice(0, 50).map((item) => item.slice(0, MAX_TEXT_CHARS)),
  };
}

interface CabMarkdownContext {
  /** Rollback evidence recorded by the reconciliation. Empty means the claim is unsupported. */
  rollbackEvidenceIds: readonly string[];
  /** Explicit gaps derived from the reconciliation result and the proposal's own caveats. */
  gaps: readonly string[];
}

/**
 * D-15: a `verified` rollback claim with zero recorded evidence is not evidence. Say so rather
 * than printing a bare "đã kiểm chứng".
 */
function rollbackLine(payload: CabDocxPayload, evidenceIds: readonly string[]): string {
  if (!payload.rollback.verified) return 'chưa kiểm chứng';
  return evidenceIds.length > 0 ? 'đã kiểm chứng' : 'chưa có bằng chứng kiểm chứng';
}

function cabMarkdown(payload: CabDocxPayload, sources: readonly CabSourcePin[], ctx: CabMarkdownContext): string {
  const bullets = [
    `- Nguồn: ${sources.map((pin) => `${pin.kind} v${pin.version}`).join(', ')}`,
    ...payload.technicalChanges.map((change) => `- ${change}`),
    `- Rollback: ${rollbackLine(payload, ctx.rollbackEvidenceIds)}${payload.rollback.summary ? ` — ${payload.rollback.summary}` : ''}`,
  ];
  const gaps = ctx.gaps.length > 0
    ? `\n## Khoảng trống bằng chứng\n${ctx.gaps.map((gap) => `- ${gap}`).join('\n')}\n`
    : '\n## Khoảng trống bằng chứng\n- Không có khoảng trống được ghi nhận từ kết quả đối chiếu.\n';
  return `# Tờ trình CAB v${payload.draftRevision} — ${payload.title}\n\n${bullets.join('\n')}\n${gaps}`;
}

/** D-15: gaps come from recorded evidence only — never a "risk is controlled" assertion. */
function evidenceGaps(state: SdlcWorkflowState, payload: CabDocxPayload): string[] {
  const drift = state.artifacts.driftResult;
  const gaps: string[] = [];
  if (!drift) {
    gaps.push('Chưa có kết quả đối chiếu Change Pack.');
  } else {
    if (drift.status !== 'NO_DRIFT_COMPLETE') gaps.push(`Kết quả đối chiếu: ${drift.status}.`);
    const uncovered = drift.coverage.filter((entry) => entry.state !== 'included');
    if (uncovered.length > 0) gaps.push(`Coverage chưa đầy đủ ở ${uncovered.length} mục.`);
    gaps.push(...drift.drift.map((tuple) => `Drift chưa xử lý: ${tuple.requirementId} (${tuple.category})`));
  }
  gaps.push(...payload.unresolvedDrift, ...payload.caveats);
  return [...new Set(gaps)];
}

/**
 * Read-only PL02 resolution for the draft path. `ensurePl02ArtifactNote` writes an approved Note,
 * which generation must never do (D-17) — so when no approved PL02 Note exists yet the draft
 * refuses with the same code the persisting path uses.
 */
function resolvePl02ReadOnly(state: SdlcWorkflowState): { noteId: string; version: number; hash: string } {
  const pl02 = state.artifacts.pl02;
  if (!pl02?.noteId || !pl02.content?.trim()) throw new Error('CAB_SOURCE_CHAIN_REQUIRED');
  return { noteId: pl02.noteId, version: pl02.version, hash: pl02.hash };
}

interface GeneratedCab {
  markdown: string;
  payload: CabDocxPayload;
  sources: CabSourcePin[];
  inputRevision: number;
}

/** Shared generation body: evidence + stage + payload mapping. Writes nothing, approves nothing. */
async function generateCabBody(
  input: HubCabInput,
  pl02: { noteId: string; version: number; hash: string },
): Promise<GeneratedCab> {
  const pl03b = input.state.artifacts.pl03b;
  const pl07 = input.state.artifacts.pl07;
  if (!pl03b?.noteId || !pl07?.noteId) throw new Error('CAB_SOURCE_CHAIN_REQUIRED');

  const pins: CabSourcePin[] = [
    { artifactId: pl02.noteId, kind: 'PL02', changeRequestId: input.changeRequestId, threadId: input.threadId, version: pl02.version, hash: pl02.hash, approved: true },
    { artifactId: pl03b.noteId, kind: 'PL03B', changeRequestId: input.changeRequestId, threadId: input.threadId, version: pl03b.version, hash: pl03b.hash, approved: true },
    { artifactId: pl07.noteId, kind: 'PL07', changeRequestId: input.changeRequestId, threadId: input.threadId, version: pl07.version, hash: pl07.hash, approved: true },
  ];
  const inputRevision = (input.state.artifacts.cab?.version ?? 0) + 1;
  const isCurrent = input.isCurrent ?? (() => true);

  const resolvedSetIds = await input.resolveSetIds(input.changeRequestId);
  const evidence = await input.collectEvidence({
    changeRequestId: input.changeRequestId,
    threadId: input.threadId,
    sessionId: input.sessionId,
    inputRevision,
    query: `${input.metadata.cr} ${input.metadata.featureName} CAB`,
    resolvedSetIds,
  });

  const proposal = await (input.runStage ?? runWizardStage)({
    kind: 'CAB',
    changeRequestId: input.changeRequestId,
    threadId: input.threadId,
    sessionId: input.sessionId,
    inputRevision,
    model: input.model,
    isCurrent,
    payload: {
      evidence,
      sources: pins,
      expectedVersions: pinRecord(pins, (pin) => pin.version),
      expectedHashes: pinRecord(pins, (pin) => pin.hash),
    },
    ...(input.signal ? { signal: input.signal } : {}),
  });

  const payload = toCabDocxPayload(proposal, {
    metadata: input.metadata,
    changeRequestId: input.changeRequestId,
    threadId: input.threadId,
    inputRevision,
    draftRevision: input.draftRevision,
    sources: pins,
  });
  const markdown = cabMarkdown(payload, pins, {
    rollbackEvidenceIds: input.state.artifacts.driftResult?.dbChangesRollback.rollback.evidenceIds ?? [],
    gaps: evidenceGaps(input.state, payload),
  });

  return { markdown, payload, sources: pins, inputRevision };
}

/**
 * D-17: produces a reviewable CAB draft. Writes no Note, records no `approvedAt`, and touches no
 * PL02 artifact — the PL02 pin is resolved read-only from workflow state.
 */
export async function generateHubCabDraft(input: HubCabInput): Promise<HubCabDraftResult> {
  const pl02 = resolvePl02ReadOnly(input.state);
  const generated = await generateCabBody(input, pl02);
  return { markdown: generated.markdown, payload: generated.payload, pl02, sources: generated.sources };
}

/**
 * Generates the CAB from hub state alone and persists it with three pinned sources.
 *
 * PL02 is resolved through `ensurePl02ArtifactNote`, never from `state.artifacts.pl02.noteId`: that
 * field is `undefined` on the typed-text path (`startOrUpdateIntake` only copies the picked note id),
 * which is why CAB used to be unreachable. `ensurePl02ArtifactNote` hashes with
 * `defaultSha256(markdown.trim())` — the value `validatedSources` compares — so the pin validates.
 *
 * The write lives here and only here: the shared body above is reusable by the draft path.
 */
export async function generateHubCab(input: HubCabInput): Promise<HubCabResult> {
  if (!input.state.artifacts.pl03b?.noteId || !input.state.artifacts.pl07?.noteId) throw new Error('CAB_SOURCE_CHAIN_REQUIRED');
  if (!input.state.artifacts.pl02) throw new Error('CAB_SOURCE_CHAIN_REQUIRED');

  const pl02 = await ensurePl02ArtifactNote({
    db: input.db,
    changeRequestId: input.changeRequestId,
    threadId: input.threadId,
    sessionId: input.sessionId,
    markdown: input.state.artifacts.pl02.content ?? '',
    metadata: input.metadata,
    state: input.state,
  });

  const generated = await generateCabBody(input, pl02);

  const saved = await saveApprovedArtifact({
    kind: 'CAB',
    changeRequestId: input.changeRequestId,
    threadId: input.threadId,
    sessionId: input.sessionId,
    inputRevision: generated.inputRevision,
    draftRevision: input.draftRevision,
    inputHash: await defaultSha256(generated.markdown),
    markdown: generated.markdown,
    exportPayload: generated.payload,
    approvedAt: new Date().toISOString(),
    // `artifactId` is the Note id, so `validatedSources` can load each source and re-compare hashes.
    sourceArtifacts: generated.sources.map((pin) => ({ id: pin.artifactId, hash: pin.hash })),
  }, input.db);

  return { markdown: generated.markdown, payload: generated.payload, noteId: saved.note.id, pl02 };
}
