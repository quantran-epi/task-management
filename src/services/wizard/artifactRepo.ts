import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import { getOrCreateCrSdlcSetInTransaction } from '../../db/repositories/documentSetRepo';
import type { ChatMessage, Note } from '../../types/models';
import { generateId } from '../../utils/uuid';
import {
  ChangePackIdentitySchema,
  ChangePackManifestSchema,
  type ChangePackIdentity,
  type ChangePackManifest,
} from './changePack';
import {
  SdlcArtifactMetadataSchema,
  buildWizardIdempotencyKey,
  type SdlcArtifactMetadata,
} from '../ai/wizardSchemas';

export interface ArtifactCommitResult {
  note: Note;
  created: boolean;
}

interface SourceArtifactIdentity {
  id: string;
  hash: string;
}

interface ArtifactCommitInput {
  projectId: string;
  threadId: string;
  sessionId: string;
  inputRevision: number;
  draftRevision: number;
  inputHash: string;
  markdown: string;
  exportPayload: unknown;
  approvedAt: string;
  sourceArtifacts?: readonly SourceArtifactIdentity[];
}

export type SaveSolutionVersionInput = ArtifactCommitInput;

export interface SaveApprovedArtifactInput extends ArtifactCommitInput {
  kind: 'PL02' | 'PL03B' | 'PL07' | 'CAB';
}

export interface PersistConfirmedPackInput {
  projectId: string;
  threadId: string;
  sessionId: string;
  inputRevision: number;
  draftRevision: number;
  idempotencyKey: string;
  manifest: ChangePackManifest;
  confirmation: ChangePackIdentity;
  solution: { noteId: string; version: number; hash: string };
  confirmedAt: string;
  failAfterWrites?: number | undefined;
}

export interface PersistedPackResult {
  notes: Note[];
  created: boolean;
}

class ArtifactPersistenceError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'ArtifactPersistenceError';
  }
}

function fail(code: string): never {
  throw new ArtifactPersistenceError(code);
}

function artifactBody(markdown: string, exportPayload: unknown): string {
  if (!markdown.trim()) fail('ARTIFACT_MARKDOWN_REQUIRED');
  if (exportPayload === undefined || exportPayload instanceof Blob) fail('ARTIFACT_EXPORT_PAYLOAD_INVALID');
  try {
    return JSON.stringify({ markdown, exportPayload });
  } catch {
    fail('ARTIFACT_EXPORT_PAYLOAD_INVALID');
  }
}

function artifactTitle(kind: SdlcArtifactMetadata['kind'], version: number): string {
  return kind === 'SOLUTION' ? `SOLUTION v${version}` : `${kind} v${version}`;
}

/**
 * Binds every artifact write to a project-scoped thread. Replaces the removed wizard
 * snapshot gate: the thread itself is the identity anchor for a Note.
 */
async function assertProjectThread(
  projectId: string,
  threadId: string,
  db: TaskPlannerDatabase,
): Promise<void> {
  const thread = await db.chatThreads.get(threadId);
  if (!thread || thread.scopeType !== 'project') fail('WIZARD_THREAD_MISMATCH');
  if (thread.entityId !== projectId) fail('WIZARD_PROJECT_MISMATCH');
}

function assertCommitIdentity(input: {
  sessionId: string;
  inputRevision: number;
  draftRevision: number;
  inputHash: string;
  approvedAt: string;
}): void {
  if (typeof input.sessionId !== 'string' || !input.sessionId.trim()) fail('ARTIFACT_SESSION_REQUIRED');
  if (!Number.isInteger(input.inputRevision) || input.inputRevision < 0) fail('ARTIFACT_REVISION_INVALID');
  if (!Number.isInteger(input.draftRevision) || input.draftRevision < 0) fail('ARTIFACT_REVISION_INVALID');
  if (!/^[a-f0-9]{64}$/.test(input.inputHash)) fail('ARTIFACT_HASH_INVALID');
  if (typeof input.approvedAt !== 'string' || !input.approvedAt.trim()) fail('ARTIFACT_APPROVAL_REQUIRED');
}

async function validatedSources(
  input: ArtifactCommitInput,
  db: TaskPlannerDatabase,
): Promise<{ ids: string[]; hashes: string[] }> {
  const ids: string[] = [];
  const hashes: string[] = [];
  for (const source of input.sourceArtifacts ?? []) {
    const note = await db.notes.get(source.id);
    const artifact = note?.sdlcArtifact;
    if (!artifact || note.entityType !== 'project' || note.entityId !== input.projectId) fail('ARTIFACT_SOURCE_MISMATCH');
    if (artifact.projectId !== input.projectId || artifact.threadId !== input.threadId || artifact.inputHash !== source.hash) {
      fail('ARTIFACT_SOURCE_MISMATCH');
    }
    ids.push(source.id);
    hashes.push(source.hash);
  }
  return { ids, hashes };
}

async function commitArtifact(
  kind: SaveApprovedArtifactInput['kind'] | 'SOLUTION',
  input: ArtifactCommitInput,
  db: TaskPlannerDatabase,
): Promise<ArtifactCommitResult> {
  const body = artifactBody(input.markdown, input.exportPayload);
  const idempotencyKey = buildWizardIdempotencyKey({
    sessionId: input.sessionId,
    draftRevision: input.draftRevision,
    artifactKind: kind,
    inputHash: input.inputHash,
  });

  return db.transaction('rw', [db.notes, db.documentSets, db.chatMessages, db.chatThreads], async () => {
    await assertProjectThread(input.projectId, input.threadId, db);
    assertCommitIdentity(input);
    const projectArtifacts = await db.notes
      .where('entityId')
      .equals(input.projectId)
      .filter((note) => note.entityType === 'project' && note.sdlcArtifact?.projectId === input.projectId)
      .toArray();
    const existing = projectArtifacts.find((note) => note.sdlcArtifact?.idempotencyKey === idempotencyKey);
    if (existing) {
      if (
        existing.sdlcArtifact?.kind !== kind ||
        existing.sdlcArtifact.threadId !== input.threadId ||
        existing.sdlcArtifact.inputHash !== input.inputHash ||
        existing.body !== body
      ) fail('ARTIFACT_IDEMPOTENCY_CONFLICT');
      return { note: existing, created: false };
    }

    const sources = await validatedSources(input, db);
    const version = projectArtifacts
      .filter((note) => note.sdlcArtifact?.kind === kind && note.sdlcArtifact.threadId === input.threadId)
      .reduce((max, note) => Math.max(max, note.sdlcArtifact?.version ?? 0), 0) + 1;
    const metadata = SdlcArtifactMetadataSchema.parse({
      kind,
      projectId: input.projectId,
      threadId: input.threadId,
      sessionId: input.sessionId,
      version,
      inputHash: input.inputHash,
      sourceArtifactIds: sources.ids,
      sourceArtifactHashes: sources.hashes,
      approvedAt: input.approvedAt,
      idempotencyKey,
    });
    const now = new Date().toISOString();
    const note: Note = {
      id: generateId(),
      type: 'document',
      tags: ['sdlc', kind.toLowerCase()],
      entityType: 'project',
      entityId: input.projectId,
      title: artifactTitle(kind, version),
      body,
      isPinned: false,
      sdlcArtifact: metadata,
      createdAt: now,
      updatedAt: now,
    };
    const set = await getOrCreateCrSdlcSetInTransaction(input.projectId, now, db);
    await db.notes.add(note);
    await db.documentSets.update(set.id, {
      documentIds: set.documentIds.includes(note.id) ? set.documentIds : [...set.documentIds, note.id],
      updatedAt: now,
    });

    const event: ChatMessage = {
      id: generateId(),
      threadId: input.threadId,
      role: 'assistant',
      content: `Saved ${kind} v${version}: note:${note.id}`,
      createdAt: now,
    };
    await db.chatMessages.add(event);
    await db.chatThreads.update(input.threadId, { updatedAt: now });
    return { note, created: true };
  });
}

export function saveSolutionVersion(
  input: SaveSolutionVersionInput,
  db: TaskPlannerDatabase = defaultDb,
): Promise<ArtifactCommitResult> {
  return commitArtifact('SOLUTION', input, db);
}

export function saveApprovedArtifact(
  input: SaveApprovedArtifactInput,
  db: TaskPlannerDatabase = defaultDb,
): Promise<ArtifactCommitResult> {
  return commitArtifact(input.kind, input, db);
}

function samePackIdentity(left: ChangePackIdentity, right: ChangePackIdentity): boolean {
  return left.cr === right.cr && left.base === right.base && left.head === right.head && left.branch === right.branch;
}

function packEntryBody(entry: ChangePackManifest['entries'][number]): string {
  return typeof entry.content === 'string'
    ? entry.content
    : JSON.stringify({
        binary: true,
        sizeBytes: entry.sizeBytes,
        coverage: entry.coverage,
      });
}

export async function persistConfirmedPack(
  input: PersistConfirmedPackInput,
  db: TaskPlannerDatabase = defaultDb,
): Promise<PersistedPackResult> {
  const manifest = ChangePackManifestSchema.parse(input.manifest);
  const confirmation = ChangePackIdentitySchema.parse(input.confirmation);
  if (!samePackIdentity(manifest.identity, confirmation)) fail('PACK_IDENTITY_MISMATCH');
  if (!input.idempotencyKey.trim()) fail('PACK_IDEMPOTENCY_KEY_REQUIRED');

  return db.transaction('rw', [db.notes, db.documentSets, db.chatMessages, db.chatThreads], async () => {
    await assertProjectThread(input.projectId, input.threadId, db);
    assertCommitIdentity({
      sessionId: input.sessionId,
      inputRevision: input.inputRevision,
      draftRevision: input.draftRevision,
      inputHash: manifest.packHash,
      approvedAt: input.confirmedAt,
    });

    const solution = await db.notes.get(input.solution.noteId);
    if (
      solution?.entityType !== 'project' ||
      solution.entityId !== input.projectId ||
      solution.sdlcArtifact?.kind !== 'SOLUTION' ||
      solution.sdlcArtifact.projectId !== input.projectId ||
      solution.sdlcArtifact.threadId !== input.threadId ||
      solution.sdlcArtifact.version !== input.solution.version ||
      solution.sdlcArtifact.inputHash !== input.solution.hash
    ) fail('PACK_SOLUTION_MISMATCH');

    const projectNotes = await db.notes
      .where('entityId')
      .equals(input.projectId)
      .filter((note) => note.entityType === 'project')
      .toArray();
    const existing = projectNotes.filter((note): note is Note & {
      sdlcArtifact: Extract<SdlcArtifactMetadata, { kind: 'CHANGE_PACK_ENTRY' }>;
    } =>
      note.sdlcArtifact?.kind === 'CHANGE_PACK_ENTRY' &&
      note.sdlcArtifact.packHash === manifest.packHash &&
      note.sdlcArtifact.idempotencyKey.startsWith(`${input.idempotencyKey}:`)
    ).sort((left, right) => left.sdlcArtifact.path.localeCompare(right.sdlcArtifact.path));
    if (existing.length > 0) {
      if (existing.length !== manifest.entries.length) fail('PACK_IDEMPOTENCY_CONFLICT');
      return { notes: existing, created: false };
    }

    const now = new Date().toISOString();
    const set = await getOrCreateCrSdlcSetInTransaction(input.projectId, now, db);
    let writes = 0;
    const injectFailure = () => {
      writes += 1;
      if (input.failAfterWrites !== undefined && writes >= input.failAfterWrites) {
        throw new Error('INJECTED_PACK_WRITE_FAILURE');
      }
    };
    const notes = manifest.entries.map((entry, index): Note => ({
      id: generateId(),
      type: 'document',
      tags: ['sdlc', 'change-pack'],
      entityType: 'project',
      entityId: input.projectId,
      title: `Change pack: ${entry.path}`,
      body: packEntryBody(entry),
      isPinned: false,
      sdlcArtifact: SdlcArtifactMetadataSchema.parse({
        kind: 'CHANGE_PACK_ENTRY',
        projectId: input.projectId,
        threadId: input.threadId,
        sessionId: input.sessionId,
        version: index + 1,
        inputHash: manifest.packHash,
        sourceArtifactIds: [solution.id],
        sourceArtifactHashes: [input.solution.hash],
        approvedAt: input.confirmedAt,
        idempotencyKey: `${input.idempotencyKey}:${entry.path}`,
        packHash: manifest.packHash,
        path: entry.path,
      }),
      createdAt: now,
      updatedAt: now,
    }));
    for (const note of notes) {
      await db.notes.add(note);
      injectFailure();
    }
    await db.documentSets.update(set.id, {
      documentIds: [...set.documentIds, ...notes.map((note) => note.id)],
      updatedAt: now,
    });
    injectFailure();
    await db.chatMessages.add({
      id: generateId(),
      threadId: input.threadId,
      role: 'assistant',
      content: `Confirmed change pack ${manifest.packHash}; SOLUTION v${input.solution.version} note:${solution.id}`,
      createdAt: now,
    });
    injectFailure();
    await db.chatThreads.update(input.threadId, { updatedAt: now });
    injectFailure();
    return { notes, created: true };
  });
}

export async function listArtifactVersions(
  projectId: string,
  threadId: string,
  kind: SdlcArtifactMetadata['kind'],
  db: TaskPlannerDatabase = defaultDb,
): Promise<Note[]> {
  const notes = await loadCanonicalArtifactChain(projectId, threadId, db);
  return notes.filter((note) => note.sdlcArtifact?.kind === kind);
}

export async function getActiveArtifact(
  projectId: string,
  threadId: string,
  kind: SdlcArtifactMetadata['kind'],
  activeVersion: number,
  db: TaskPlannerDatabase = defaultDb,
): Promise<Note | undefined> {
  const versions = await listArtifactVersions(projectId, threadId, kind, db);
  return versions.find((note) => note.sdlcArtifact?.version === activeVersion);
}

export async function loadCanonicalArtifactChain(
  projectId: string,
  threadId: string,
  db: TaskPlannerDatabase = defaultDb,
): Promise<Note[]> {
  const thread = await db.chatThreads.get(threadId);
  if (!thread || thread.scopeType !== 'project' || thread.entityId !== projectId) fail('WIZARD_PROJECT_MISMATCH');
  const notes = await db.notes
    .where('entityId')
    .equals(projectId)
    .filter((note) =>
      note.entityType === 'project' &&
      note.sdlcArtifact?.projectId === projectId &&
      note.sdlcArtifact.threadId === threadId
    )
    .toArray();
  return notes.sort((left, right) =>
    left.sdlcArtifact!.kind.localeCompare(right.sdlcArtifact!.kind) ||
    left.sdlcArtifact!.version - right.sdlcArtifact!.version
  );
}
