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
  projectId: string;
  threadId: string;
  version: number;
  hash: string;
  approved: true;
}

type CabSourceKind = CabSourcePin['kind'];

export interface HubCabInput {
  db: TaskPlannerDatabase;
  projectId: string;
  threadId: string;
  sessionId: string;
  draftRevision: number;
  metadata: SdlcWorkflowMetadata;
  state: SdlcWorkflowState;
  model: WizardModel;
  collectEvidence: (input: WizardEvidenceInput) => Promise<WizardEvidence>;
  /** Published SDLC sets for the project. Must not default to `[]` — an empty scope strips every citation. */
  resolveSetIds: (projectId: string) => Promise<readonly string[]>;
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

export interface CabPayloadContext {
  metadata: SdlcWorkflowMetadata;
  projectId: string;
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
    projectId: ctx.projectId,
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

function cabMarkdown(payload: CabDocxPayload, sources: readonly CabSourcePin[]): string {
  const bullets = [
    `- Nguồn: ${sources.map((pin) => `${pin.kind} v${pin.version}`).join(', ')}`,
    ...payload.technicalChanges.map((change) => `- ${change}`),
    `- Rollback: ${payload.rollback.verified ? 'đã kiểm chứng' : 'chưa kiểm chứng'}`,
  ];
  return `# Tờ trình CAB v${payload.draftRevision} — ${payload.title}\n\n${bullets.join('\n')}\n`;
}

/**
 * Generates the CAB from hub state alone and persists it with three pinned sources.
 *
 * PL02 is resolved through `ensurePl02ArtifactNote`, never from `state.artifacts.pl02.noteId`: that
 * field is `undefined` on the typed-text path (`startOrUpdateIntake` only copies the picked note id),
 * which is why CAB used to be unreachable. `ensurePl02ArtifactNote` hashes with
 * `defaultSha256(markdown.trim())` — the value `validatedSources` compares — so the pin validates.
 */
export async function generateHubCab(input: HubCabInput): Promise<HubCabResult> {
  const pl03b = input.state.artifacts.pl03b;
  const pl07 = input.state.artifacts.pl07;
  if (!pl03b?.noteId || !pl07?.noteId) throw new Error('CAB_SOURCE_CHAIN_REQUIRED');
  if (!input.state.artifacts.pl02) throw new Error('CAB_SOURCE_CHAIN_REQUIRED');

  const pl02 = await ensurePl02ArtifactNote({
    db: input.db,
    projectId: input.projectId,
    threadId: input.threadId,
    sessionId: input.sessionId,
    markdown: input.state.artifacts.pl02.content ?? '',
    metadata: input.metadata,
    state: input.state,
  });

  const pins: CabSourcePin[] = [
    { artifactId: pl02.noteId, kind: 'PL02', projectId: input.projectId, threadId: input.threadId, version: pl02.version, hash: pl02.hash, approved: true },
    { artifactId: pl03b.noteId, kind: 'PL03B', projectId: input.projectId, threadId: input.threadId, version: pl03b.version, hash: pl03b.hash, approved: true },
    { artifactId: pl07.noteId, kind: 'PL07', projectId: input.projectId, threadId: input.threadId, version: pl07.version, hash: pl07.hash, approved: true },
  ];
  const inputRevision = (input.state.artifacts.cab?.version ?? 0) + 1;
  const isCurrent = input.isCurrent ?? (() => true);

  const resolvedSetIds = await input.resolveSetIds(input.projectId);
  const evidence = await input.collectEvidence({
    projectId: input.projectId,
    threadId: input.threadId,
    sessionId: input.sessionId,
    inputRevision,
    query: `${input.metadata.cr} ${input.metadata.featureName} CAB`,
    resolvedSetIds,
  });

  const proposal = await (input.runStage ?? runWizardStage)({
    kind: 'CAB',
    projectId: input.projectId,
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
    projectId: input.projectId,
    threadId: input.threadId,
    inputRevision,
    draftRevision: input.draftRevision,
    sources: pins,
  });
  const markdown = cabMarkdown(payload, pins);

  const saved = await saveApprovedArtifact({
    kind: 'CAB',
    projectId: input.projectId,
    threadId: input.threadId,
    sessionId: input.sessionId,
    inputRevision,
    draftRevision: input.draftRevision,
    inputHash: await defaultSha256(markdown),
    markdown,
    exportPayload: payload,
    approvedAt: new Date().toISOString(),
    // `artifactId` is the Note id, so `validatedSources` can load each source and re-compare hashes.
    sourceArtifacts: pins.map((pin) => ({ id: pin.artifactId, hash: pin.hash })),
  }, input.db);

  return { markdown, payload, noteId: saved.note.id, pl02 };
}
