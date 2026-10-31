import { z } from 'zod';
import type { TaskPlannerDatabase } from '../../db';
import { buildWizardIdempotencyKey } from '../ai/wizardSchemas';
import { persistConfirmedPack, type PersistedPackResult } from './artifactRepo';
import {
  ChangePackValidationError,
  validateChangePack,
  type ChangePackManifest,
} from './changePack';
import {
  ReconciliationResultSchema,
  reconcileSolutionWithPack,
  type ReconciliationInput,
  type ReconciliationResult,
} from './reconciliation';

export interface HubPackConfirmInput {
  db: TaskPlannerDatabase;
  projectId: string;
  threadId: string;
  sessionId: string;
  inputRevision: number;
  manifest: Readonly<ChangePackManifest>;
  solution: { noteId: string; version: number; hash: string };
  confirmedAt: string;
}

export interface HubPackConfirmResult {
  persisted: PersistedPackResult;
  reconciliation: ReconciliationResult;
}

const nonEmpty = z.string().trim().min(1).max(500);

/** Narrow view of a SOLUTION body's `exportPayload`; anything else is ignored, never coerced. */
const HubSolutionPayloadSchema = z.object({
  requirements: z
    .array(
      z.strictObject({
        id: nonEmpty,
        category: nonEmpty,
        summary: nonEmpty,
        evidencePaths: z.array(nonEmpty).max(512),
      }),
    )
    .max(1_024),
  approvedDesign: z.strictObject({
    currentSystem: z.string().max(100_000),
    affectedScreens: z.array(nonEmpty).max(500),
    affectedApis: z.array(nonEmpty).max(500),
    affectedTables: z.array(nonEmpty).max(500),
    regressionMatrix: z.array(z.strictObject({ scenario: nonEmpty, expected: nonEmpty })).max(500),
  }),
});

type HubSolutionPayload = z.infer<typeof HubSolutionPayloadSchema>;

function parseSolutionBody(body: string): { markdown: string; exportPayload: unknown } {
  try {
    const parsed = JSON.parse(body) as { markdown?: unknown; exportPayload?: unknown };
    if (typeof parsed?.markdown === 'string') return { markdown: parsed.markdown, exportPayload: parsed.exportPayload };
  } catch {
    // Not a structured body: treat the whole Note body as Markdown.
  }
  return { markdown: body, exportPayload: undefined };
}

/**
 * Validates a change-pack against the hub's own CR. The identity always comes from the
 * pack's `meta.json`; the hub only decides whether that CR is the one it is working on.
 */
export async function validateHubChangePack(
  file: Blob,
  expectedCr: string,
): Promise<Readonly<ChangePackManifest>> {
  const manifest = await validateChangePack(file);
  if (manifest.identity.cr !== expectedCr.trim()) throw new ChangePackValidationError('PACK_IDENTITY_MISMATCH');
  return manifest;
}

/**
 * Persists the pack entries and reconciles them against the pinned SOLUTION.
 *
 * Replay rule (do not "simplify" this back to a counter): the idempotency key is
 * content-addressed by `manifest.packHash`, so re-confirming the same zip finds the rows
 * it already wrote instead of writing a second entry set. A `draftRevision` in the key
 * would advance after the first commit and turn every repeat into 2N duplicate Notes.
 * `draftRevision` is passed to `persistConfirmedPack` only because its signature is
 * frozen; it mirrors `inputRevision` and carries no addressing meaning here.
 */
export async function confirmHubChangePack(input: HubPackConfirmInput): Promise<HubPackConfirmResult> {
  const manifest = input.manifest;
  const persisted = await persistConfirmedPack(
    {
      projectId: input.projectId,
      threadId: input.threadId,
      sessionId: input.sessionId,
      inputRevision: input.inputRevision,
      draftRevision: input.inputRevision,
      idempotencyKey: buildWizardIdempotencyKey({
        sessionId: input.sessionId,
        artifactKind: 'CHANGE_PACK_ENTRY',
        inputHash: manifest.packHash,
      }),
      manifest: manifest as ChangePackManifest,
      confirmation: manifest.identity,
      solution: input.solution,
      confirmedAt: input.confirmedAt,
    },
    input.db,
  );

  const reconciliation = await buildHubReconciliation({
    db: input.db,
    projectId: input.projectId,
    threadId: input.threadId,
    manifest,
    solutionNoteId: input.solution.noteId,
    solutionVersion: input.solution.version,
    solutionHash: input.solution.hash,
  });

  return { persisted, reconciliation };
}

export interface BuildHubReconciliationInput {
  db: TaskPlannerDatabase;
  projectId: string;
  threadId: string;
  manifest: Readonly<ChangePackManifest>;
  solutionNoteId: string;
  solutionVersion: number;
  solutionHash: string;
}

function fail(code: 'PACK_SOLUTION_MISMATCH'): never {
  throw new Error(code);
}

/**
 * Reconciles the pack against the pinned SOLUTION Note.
 *
 * Mandatory fallback: `saveHubSolution` stores `exportPayload: {}`, so the narrow parse
 * fails on the production path every time. The result is then an empty requirement set
 * plus a minimal approved design taken from the Markdown itself — never fabricated
 * screens/APIs/tables, and never a throw. The truthfulness guard below turns that into
 * `PARTIAL_COVERAGE`, because coverage alone must not claim "không phát hiện drift".
 */
export async function buildHubReconciliation(
  input: BuildHubReconciliationInput,
): Promise<ReconciliationResult> {
  const note = await input.db.notes.get(input.solutionNoteId);
  const artifact = note?.sdlcArtifact;
  if (
    !note ||
    note.entityType !== 'project' ||
    note.entityId !== input.projectId ||
    artifact?.kind !== 'SOLUTION' ||
    artifact.projectId !== input.projectId ||
    artifact.threadId !== input.threadId ||
    artifact.version !== input.solutionVersion ||
    artifact.inputHash !== input.solutionHash
  ) {
    fail('PACK_SOLUTION_MISMATCH');
  }

  const { markdown, exportPayload } = parseSolutionBody(note.body);
  const parsed = HubSolutionPayloadSchema.safeParse(exportPayload);
  const solutionPayload: HubSolutionPayload = parsed.success
    ? parsed.data
    : {
        requirements: [],
        approvedDesign: {
          currentSystem: markdown.trim(),
          affectedScreens: [],
          affectedApis: [],
          affectedTables: [],
          regressionMatrix: [],
        },
      };

  const manifest = input.manifest;
  const reconciliationInput: ReconciliationInput = {
    projectId: input.projectId,
    threadId: input.threadId,
    solutionNoteId: input.solutionNoteId,
    solutionVersion: input.solutionVersion,
    solutionHash: input.solutionHash,
    packHash: manifest.packHash,
    cr: manifest.identity.cr,
    base: manifest.identity.base,
    head: manifest.identity.head,
    solution: {
      projectId: input.projectId,
      threadId: input.threadId,
      noteId: input.solutionNoteId,
      version: input.solutionVersion,
      hash: input.solutionHash,
      requirements: solutionPayload.requirements,
      approvedDesign: solutionPayload.approvedDesign,
    },
    pack: {
      packHash: manifest.packHash,
      identity: manifest.identity,
      entries: manifest.entries.map((entry) => ({
        path: entry.path,
        status: entry.status,
        coverage: entry.coverage,
        hunks: [],
      })),
    },
    evidence: [],
    proposedDrift: [],
  };

  const result = reconcileSolutionWithPack(reconciliationInput);
  if (solutionPayload.requirements.length === 0) {
    // No requirement baseline: a clean coverage pass proves nothing about drift.
    return ReconciliationResultSchema.parse({ ...result, status: 'PARTIAL_COVERAGE' });
  }
  return result;
}
