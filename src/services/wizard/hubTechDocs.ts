import type { TaskPlannerDatabase } from '../../db';
import type { Pl03bDocxPayload, Pl03bReconciliationEvidence } from '../export/pl03bDocx';
import type { Pl07DocxPayload } from '../export/pl07Docx';
import { PL07_BASELINE } from '../export/pl07Baseline';
import {
  runWizardStage,
  type WizardEvidence,
  type WizardEvidenceInput,
  type WizardModel,
} from '../ai/wizardService';
import { WizardPl03ProposalSchema, WizardPl07ProposalSchema } from '../ai/wizardPrompts';
import { saveApprovedArtifact } from './artifactRepo';
import type { ReconciliationResult } from './reconciliation';
import { defaultSha256 } from './workflowCoordinator';
import type { SdlcWorkflowMetadata } from './workflowSchemas';

const MISSING = '(chưa cung cấp)';

/** Sections the PL07 bank template ships. `pl07MarkSchema.sectionId` is the same five-value enum. */
const PL07_SECTION_ITEM = /^(I|II|III|IV|V)\.(\d+)$/;



export interface HubTechDocsInput {
  db: TaskPlannerDatabase;
  projectId: string;
  threadId: string;
  sessionId: string;
  inputRevision: number;
  draftRevision: number;
  metadata: SdlcWorkflowMetadata;
  solution: { noteId: string; version: number; hash: string };
  reconciliation: ReconciliationResult;
  /** Full model config: the optional `complete`/`probe` seams are what the real stage runs on. */
  model: WizardModel;
  collectEvidence: (input: WizardEvidenceInput) => Promise<WizardEvidence>;
  /** Published SDLC sets for the project. Must not default to `[]` — an empty scope strips every citation. */
  resolveSetIds: (projectId: string) => Promise<readonly string[]>;
  runStage?: typeof runWizardStage;
  isCurrent?: () => boolean;
  signal?: AbortSignal;
}

export interface HubTechDocsResult {
  pl03b: { markdown: string; payload: Pl03bDocxPayload; noteId: string };
  pl07: { markdown: string; payload: Pl07DocxPayload; noteId: string };
}

/** D-16/D-17: a reviewable draft. Nothing here has been persisted or approved. */
export interface HubTechDocsDraft {
  pl03b: { markdown: string; payload: Pl03bDocxPayload };
  pl07: { markdown: string; payload: Pl07DocxPayload };
}

export interface HubTechDocsPayloadContext {
  metadata: SdlcWorkflowMetadata;
  inputRevision: number;
  draftRevision: number;
  reconciliation: ReconciliationResult;
}

function approvedEnvelope(ctx: HubTechDocsPayloadContext) {
  return {
    schemaVersion: 1 as const,
    status: 'approved' as const,
    inputRevision: ctx.inputRevision,
    draftRevision: ctx.draftRevision,
    approvedRevision: ctx.draftRevision,
  };
}

export function toPl03bDocxPayload(proposal: unknown, ctx: HubTechDocsPayloadContext): Pl03bDocxPayload {
  const parsed = WizardPl03ProposalSchema.safeParse(proposal);
  if (!parsed.success) throw new Error('PL03B_PROPOSAL_INVALID');
  const proposalData = parsed.data;
  // D-14: the document describes the implemented system only. The proposal's approved-design,
  // drift and status fields are deliberately not read here — the comparison lives in DriftMatrixView.
  const implementationLines = proposalData.actualImplementation;
  return {
    ...approvedEnvelope(ctx),
    kind: 'PL03B',
    metadata: {
      crCode: ctx.metadata.cr,
      featureName: ctx.metadata.featureName,
      author: ctx.metadata.author,
      createdDate: ctx.metadata.date,
      version: String(ctx.draftRevision),
    },
    introduction: {
      purpose: implementationLines[0] ?? MISSING,
      users: MISSING,
      databases: [...ctx.reconciliation.dbChangesRollback.affectedTables],
      k8sServices: [],
    },
    technical: {
      overview: implementationLines.join('\n'),
      techStack: MISSING,
      flows: [],
      services: [],
      databases: [],
      integrations: [],
      notifications: [],
    },
    reconciliationEvidence: toPl03bReconciliationEvidence(ctx.reconciliation),
  };
}

/** Narrow the full reconciliation result down to the implemented-system evidence the document may carry. */
export function toPl03bReconciliationEvidence(reconciliation: ReconciliationResult): Pl03bReconciliationEvidence {
  return {
    actualImplementation: { ...reconciliation.actualImplementation },
    coverage: reconciliation.coverage,
    dbChangesRollback: reconciliation.dbChangesRollback,
    regressionMatrix: reconciliation.regressionMatrix,
  };
}

function stringIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    .map((id) => id.trim());
}

export function toPl07DocxPayload(proposal: unknown, ctx: HubTechDocsPayloadContext): Pl07DocxPayload {
  if (!proposal || typeof proposal !== 'object') throw new Error('PL07_PROPOSAL_INVALID');
  const raw = proposal as Record<string, unknown>;

  const rawMarks = Array.isArray(raw.marks) ? raw.marks : [];

  const sanitizedMarks = rawMarks.flatMap((entry): unknown[] => {
    if (!entry || typeof entry !== 'object') return [];
    const mark = entry as { itemId?: unknown; note?: unknown; evidenceIds?: unknown };
    if (typeof mark.itemId !== 'string') return [];
    // `pl07MarkSchema.sectionId` is z.enum(['I','II','III','IV','V']), so an over-permissive
    // character class admits 'VI.1'/'VII.1' and the dispatcher then rejects the whole payload.
    // Exact allowlist: anything else is dropped.
    if (!PL07_SECTION_ITEM.test(mark.itemId)) return [];
    const evidenceIds = stringIds(mark.evidenceIds);
    // D-14: the AI never answers the checklist it generates. Whatever verdict the model claims is
    // discarded and the reviewer answers; only the item id, the model's note, and its citations
    // survive so the reviewer has something to start from.
    return [{
      itemId: mark.itemId,
      status: 'UNKNOWN',
      note: typeof mark.note === 'string' ? mark.note : '',
      evidenceIds,
    }];
  });

  const parsed = WizardPl07ProposalSchema.safeParse({ ...raw, marks: sanitizedMarks });
  if (!parsed.success) throw new Error('PL07_PROPOSAL_INVALID');

  const marks: Pl07DocxPayload['marks'] = parsed.data.marks.map((mark) => {
    const match = PL07_SECTION_ITEM.exec(mark.itemId)!;
    return {
      sectionId: match[1] as Pl07DocxPayload['marks'][number]['sectionId'],
      itemNumber: match[2] as string,
      status: 'unknown',
      evidenceIds: mark.evidenceIds,
      note: mark.note,
    };
  });

  const findings: Pl07DocxPayload['findings'] = [];
  for (const section of parsed.data.sectionVI) {
    const evidenceIds = stringIds(section.evidenceIds);
    // `WizardPl07ProposalSchema` puts no min(1) on sectionVI[].evidenceIds, but the docx schema
    // requires it. Backfilling would invent a citation, so an evidence-less finding is dropped.
    if (evidenceIds.length === 0) continue;
    for (const text of section.findings) {
      findings.push({
        number: String(findings.length + 1),
        text: text.trim(),
        evidenceIds,
        file: MISSING,
        hunk: MISSING,
      });
    }
  }

  return {
    ...approvedEnvelope(ctx),
    kind: 'PL07',
    metadata: {
      applicationName: ctx.metadata.featureName,
      applicationVersion: String(ctx.draftRevision),
      summary: MISSING,
      reviewDate: ctx.metadata.date,
      developer: ctx.metadata.author,
      approver: MISSING,
    },
    marks,
    findings,
  };
}

function pl03bMarkdown(payload: Pl03bDocxPayload): string {
  // D-14: implementation statements and changed tables only — no drift status, no comparison.
  const bullets = [
    ...payload.technical.overview.split('\n').filter((line) => line.trim()).map((line) => `- ${line.trim()}`),
    `- Bảng thay đổi: ${payload.introduction.databases.join(', ') || MISSING}`,
  ];
  return `# PL03B v${payload.draftRevision} — ${payload.metadata.featureName}\n\n${bullets.join('\n')}\n`;
}

/**
 * D-14: a blank reviewer checklist. Baseline question text only — no verdict word, because the
 * AI must not answer the questions it is asking the reviewer to answer. Section-VI findings are
 * carried as review prompts, never as conclusions.
 */
function pl07Markdown(payload: Pl07DocxPayload): string {
  const questions = PL07_BASELINE.sections.flatMap((section) =>
    section.items.map((item) => `- ${section.id}.${item.number}. ${item.text}`));
  const findings = payload.findings.map((finding) => `- Cần review: ${finding.text}`);
  return `# PL07 v${payload.draftRevision} — ${payload.metadata.applicationName}\n\n${[...questions, ...findings].join('\n')}\n`;
}

/**
 * Generates both documents as reviewable drafts (D-16/D-17): same stage runs and payload mapping
 * as `generateHubTechDocs`, but writes no Note and performs no approval. The caller decides.
 */
export async function generateHubTechDocDraft(input: HubTechDocsInput): Promise<HubTechDocsDraft> {
  const runStage = input.runStage ?? runWizardStage;
  // Resolve once: `WizardStageInput.isCurrent` is required (`exactOptionalPropertyTypes` is on).
  const isCurrent = input.isCurrent ?? (() => true);

  const resolvedSetIds = await input.resolveSetIds(input.projectId);
  const evidence = await input.collectEvidence({
    projectId: input.projectId,
    threadId: input.threadId,
    sessionId: input.sessionId,
    inputRevision: input.inputRevision,
    query: `${input.metadata.cr} ${input.metadata.featureName} PL03B PL07`,
    resolvedSetIds,
  });

  // `requirePin` compares projectId/threadId and validates hash/version, so the pin must carry identity.
  const pl03Pin = {
    artifactId: input.solution.noteId,
    projectId: input.projectId,
    threadId: input.threadId,
    version: input.solution.version,
    hash: input.solution.hash,
  };

  const stageInput = {
    projectId: input.projectId,
    threadId: input.threadId,
    sessionId: input.sessionId,
    inputRevision: input.inputRevision,
    model: input.model,
    isCurrent,
    payload: { evidence, pinnedSolution: pl03Pin },
    ...(input.signal ? { signal: input.signal } : {}),
  };

  // Sequential, not Promise.all: a failure of one stage must abort before any Note is written.
  const pl03Proposal = await runStage({ ...stageInput, kind: 'PL03' });
  const pl07Proposal = await runStage({ ...stageInput, kind: 'PL07' });

  const ctx: HubTechDocsPayloadContext = {
    metadata: input.metadata,
    inputRevision: input.inputRevision,
    draftRevision: input.draftRevision,
    reconciliation: input.reconciliation,
  };
  const pl03bPayload = toPl03bDocxPayload(pl03Proposal, ctx);
  const pl07Payload = toPl07DocxPayload(pl07Proposal, ctx);
  return {
    pl03b: { markdown: pl03bMarkdown(pl03bPayload), payload: pl03bPayload },
    pl07: { markdown: pl07Markdown(pl07Payload), payload: pl07Payload },
  };
}

/**
 * Generates PL03B and PL07 from hub state alone and persists each as a Project-linked artifact
 * Note carrying its approved DOCX payload.
 *
 * The idempotency key is `${sessionId}:${kind}:${inputHash}` (content-addressed), so
 * `draftRevision` is bookkeeping only: the body hash decides replay vs. new version, which is why
 * a regeneration with changed inputs lands at a new version instead of ARTIFACT_IDEMPOTENCY_CONFLICT.
 */
export async function generateHubTechDocs(input: HubTechDocsInput): Promise<HubTechDocsResult> {
  const draft = await generateHubTechDocDraft(input);
  const pl03bPayload = draft.pl03b.payload;
  const pl07Payload = draft.pl07.payload;
  const pl03bBody = draft.pl03b.markdown;
  const pl07Body = draft.pl07.markdown;

  const approvedAt = new Date().toISOString();
  const sourceArtifacts = [{ id: input.solution.noteId, hash: input.solution.hash }];
  const pl03bSaved = await saveApprovedArtifact({
    projectId: input.projectId,
    threadId: input.threadId,
    sessionId: input.sessionId,
    inputRevision: input.inputRevision,
    draftRevision: input.draftRevision,
    inputHash: await defaultSha256(pl03bBody),
    markdown: pl03bBody,
    exportPayload: pl03bPayload,
    approvedAt,
    kind: 'PL03B',
    sourceArtifacts,
  }, input.db);
  const pl07Saved = await saveApprovedArtifact({
    projectId: input.projectId,
    threadId: input.threadId,
    sessionId: input.sessionId,
    inputRevision: input.inputRevision,
    draftRevision: input.draftRevision,
    inputHash: await defaultSha256(pl07Body),
    markdown: pl07Body,
    exportPayload: pl07Payload,
    approvedAt,
    kind: 'PL07',
    sourceArtifacts,
  }, input.db);

  return {
    pl03b: { markdown: pl03bBody, payload: pl03bPayload, noteId: pl03bSaved.note.id },
    pl07: { markdown: pl07Body, payload: pl07Payload, noteId: pl07Saved.note.id },
  };
}
