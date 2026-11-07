import type { TaskPlannerDatabase } from '../../db';
import type { Note } from '../../types/models';
import type { DownloadBlobResult } from '../../utils/fileExport';
import { downloadBlob } from '../../utils/fileExport';
import type { Pl02DocxPayload } from '../export/pl02Docx';
import { buildWizardDocx } from '../export/wizardDocx';
import { saveApprovedArtifact } from './artifactRepo';
import { defaultSha256 } from './workflowCoordinator';
import type { SdlcWorkflowMetadata, SdlcWorkflowState } from './workflowSchemas';

export type HubExportKind = 'PL02' | 'PL03B' | 'PL07' | 'CAB';

export interface HubExportResult {
  status: 'saved' | 'saved_download_failed' | 'failed';
  noteId?: string;
  version?: number;
  filename?: string;
  sizeBytes?: number;
  errorCode?: string;
}

/**
 * Carries no `inputRevision`/`draftRevision`: the only writer here is `ensurePl02ArtifactNote`,
 * which derives both from `state.artifacts.pl02.version`, and exporting an existing
 * PL03B/PL07/CAB Note writes nothing at all.
 */
export interface HubExportInput {
  db: TaskPlannerDatabase;
  kind: HubExportKind;
  changeRequestId: string;
  threadId: string;
  sessionId: string;
  metadata: SdlcWorkflowMetadata;
  state: SdlcWorkflowState;
  saveNote?: typeof saveApprovedArtifact;
  buildDocx?: typeof buildWizardDocx;
  downloadFile?: (blob: Blob, filename: string) => Promise<DownloadBlobResult>;
}

export interface EnsurePl02ArtifactNoteInput {
  db: TaskPlannerDatabase;
  changeRequestId: string;
  threadId: string;
  sessionId: string;
  markdown: string;
  metadata: SdlcWorkflowMetadata;
  state: SdlcWorkflowState;
  saveNote?: typeof saveApprovedArtifact;
}

const ARTIFACT_KEY = { PL02: 'pl02', PL03B: 'pl03b', PL07: 'pl07', CAB: 'cab' } as const;

/** Mirrors the wizard's `normalizeApprovedExportPayload` so the produced document stays byte-shape-identical. */
export function toPl02DocxPayload(
  metadata: SdlcWorkflowMetadata,
  markdown: string,
  inputRevision: number,
  draftRevision: number,
): Pl02DocxPayload {
  return {
    schemaVersion: 1,
    kind: 'PL02',
    status: 'approved',
    inputRevision,
    draftRevision,
    approvedRevision: draftRevision,
    metadata: {
      crCode: metadata.cr,
      featureName: metadata.featureName,
      requestingUnit: metadata.requestingUnit,
      author: metadata.author,
      createdDate: metadata.date,
    },
    introduction: {
      purpose: markdown,
      users: '(chưa cung cấp)',
      deploymentScope: '(chưa cung cấp)',
      risks: [],
      glossary: [],
    },
    features: [{
      name: metadata.featureName,
      description: markdown,
      fileLayout: [],
      inputRules: [],
      processingRules: [],
      flowSteps: [],
    }],
    permissions: [],
    notifications: [],
    apiContracts: [],
    staffing: [],
  };
}

/**
 * The PL02 Note source for both the INTAKE export row and the CAB chain.
 *
 * `state.artifacts.pl02.noteId` is `undefined` on the typed-text path (`startOrUpdateIntake` only
 * copies the picked note id), so this function must never require it. The hash is
 * `defaultSha256(markdown.trim())` — the same value the workflow recorded and the same value
 * `validatedSources` compares — never a hash of the payload.
 *
 * Revisions derive from the workflow's PL02 chain: identical content replays to the same Note via
 * the content-addressed idempotency key `${sessionId}:PL02:${hash}`.
 */
export async function ensurePl02ArtifactNote(
  input: EnsurePl02ArtifactNoteInput,
): Promise<{ noteId: string; version: number; hash: string }> {
  const stateContent = input.state.artifacts.pl02?.content?.trim() ?? '';
  const text = input.markdown.trim() || stateContent;
  if (!text) throw new Error('PL02_CONTENT_MISSING');
  const hash = await defaultSha256(text);
  const inputRevision = (input.state.artifacts.pl02?.version ?? 0) + 1;
  const draftRevision = inputRevision;

  const pinnedId = input.state.artifacts.pl02?.noteId;
  if (pinnedId) {
    const pinned = await input.db.notes.get(pinnedId);
    if (
      pinned?.entityType === 'cr' &&
      pinned.entityId === input.changeRequestId &&
      pinned.sdlcArtifact?.kind === 'PL02' &&
      pinned.sdlcArtifact.inputHash === hash
    ) {
      return { noteId: pinned.id, version: pinned.sdlcArtifact.version, hash };
    }
  }

  const saved = await (input.saveNote ?? saveApprovedArtifact)({
    kind: 'PL02',
    changeRequestId: input.changeRequestId,
    threadId: input.threadId,
    sessionId: input.sessionId,
    inputRevision,
    draftRevision,
    inputHash: hash,
    markdown: text,
    exportPayload: toPl02DocxPayload(input.metadata, text, inputRevision, draftRevision),
    approvedAt: new Date().toISOString(),
  }, input.db);

  return { noteId: saved.note.id, version: saved.note.sdlcArtifact!.version, hash };
}

function parseNoteBody(note: Note): { markdown: string; exportPayload: unknown } | undefined {
  try {
    const body = JSON.parse(note.body) as { markdown?: unknown; exportPayload?: unknown };
    if (typeof body.markdown !== 'string' || body.exportPayload === undefined) return undefined;
    return { markdown: body.markdown, exportPayload: body.exportPayload };
  } catch {
    return undefined;
  }
}

function filenameFor(kind: HubExportKind, cr: string, version: number): string {
  const base = `${kind}-${cr}-v${version}`.replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  return `${base || kind}.docx`;
}

function failed(errorCode: string): HubExportResult {
  return { status: 'failed', errorCode };
}

export async function exportHubArtifact(input: HubExportInput): Promise<HubExportResult> {
  const ref = input.state.artifacts[ARTIFACT_KEY[input.kind]];
  if (!ref) return failed('ARTIFACT_NOT_READY');

  const buildDocx = input.buildDocx ?? buildWizardDocx;
  let payload: unknown;
  /** PL02 resolves its Note only after a successful build, so a build failure writes nothing. */
  let resolveNote: (() => Promise<{ noteId: string; version: number; hash: string }>) | undefined;
  let noteId: string | undefined;
  let version: number;

  if (input.kind === 'PL02') {
    const text = ref.content?.trim() ?? '';
    if (!text) return failed('PL02_CONTENT_MISSING');
    const inputRevision = (ref.version ?? 0) + 1;
    payload = toPl02DocxPayload(input.metadata, text, inputRevision, inputRevision);
    version = inputRevision;
    resolveNote = () => ensurePl02ArtifactNote({
      db: input.db,
      changeRequestId: input.changeRequestId,
      threadId: input.threadId,
      sessionId: input.sessionId,
      markdown: text,
      metadata: input.metadata,
      state: input.state,
      ...(input.saveNote ? { saveNote: input.saveNote } : {}),
    });
  } else {
    if (!ref.noteId) return failed('ARTIFACT_PAYLOAD_INVALID');
    const note = await input.db.notes.get(ref.noteId);
    const body = note ? parseNoteBody(note) : undefined;
    if (!body) return failed('ARTIFACT_PAYLOAD_INVALID');
    payload = body.exportPayload;
    noteId = ref.noteId;
    version = note!.sdlcArtifact?.version ?? ref.version;
  }

  let blob: Blob;
  try {
    blob = await buildDocx(input.kind, payload);
  } catch (error) {
    return failed((error as { code?: string }).code ?? 'WIZARD_DOCX_BUILD_FAILED');
  }

  if (resolveNote) {
    const pin = await resolveNote();
    noteId = pin.noteId;
    version = pin.version;
  }

  // Never report an export before the Note id is known.
  if (!noteId) return failed('ARTIFACT_PAYLOAD_INVALID');

  const filename = filenameFor(input.kind, input.metadata.cr, version);
  const download = await (input.downloadFile ?? downloadBlob)(blob, filename);
  if (download.kind === 'cancelled') {
    return { status: 'saved_download_failed', noteId, version, filename, sizeBytes: blob.size, errorCode: 'WIZARD_EXPORT_DOWNLOAD_CANCELLED' };
  }
  if (download.kind === 'failed') {
    return { status: 'saved_download_failed', noteId, version, filename, sizeBytes: blob.size, errorCode: download.errorCode };
  }
  return { status: 'saved', noteId, version, filename, sizeBytes: blob.size };
}
