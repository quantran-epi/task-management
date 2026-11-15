import { db as defaultDb, type TaskPlannerDatabase } from '../index';
import type { Table } from 'dexie';
import type { Note, NoteAttachment, NoteEntityType } from '../../types/models';
import {
  NoteInputSchema,
  NoteUpdateSchema,
  NoteAttachmentSchema,
  type NoteInput,
  type NoteUpdate,
} from '../../validation/schemas';
import { generateId } from '../../utils/uuid';

/**
 * The `ai-` namespace is the ownership proof for a team's docs tree, so only the app may write it.
 * Lives here (not in `teamDocsRepo`) because `teamDocsRepo` imports this module — the reverse
 * import would be a cycle.
 */
export const RESERVED_SLUG_PREFIX = 'ai-';

/** True only for a slug in the reserved namespace. */
export function isReservedSlug(slug: string | null | undefined): boolean {
  return slug?.trim().startsWith(RESERVED_SLUG_PREFIX) ?? false;
}

export interface NoteWithAttachments {
  note: Note;
  attachments: NoteAttachment[];
}

/**
 * The `ai-` namespace is the ownership proof for a team's docs tree, so only the app may write it.
 * Enforced at every path that accepts a slug from outside — `createNote`/`batchCreateNotes`
 * (unless the caller opts in), `updateNote`, and `validateBackup` on import.
 *
 * Ceiling: a direct `db.notes.put` (SQLite hydration) bypasses this. That path is a local file
 * the owner controls, and the app's own writes never produce a reserved slug there. A slugless
 * folder it produces is NOT repaired by `ensureTeamDocsReady` — `resolveMemberFolder` rejects it
 * and a fresh zone is minted, so the folder keeps its documents but is no longer the member's
 * write target. The team delete is a soft delete for the same reason: a wrong guess about which
 * folder is whose costs a Trash restore, never the documents.
 */
export function assertSlugNamespaceFree(slug: string | null | undefined): void {
  if (isReservedSlug(slug)) {
    throw new Error('Slug bắt đầu bằng "ai-" được dành riêng cho thư mục của nhóm AI.');
  }
}

export async function createNote(
  input: NoteInput,
  db: TaskPlannerDatabase = defaultDb,
  opts?: { allowReservedSlug?: boolean }
): Promise<Note> {
  const validated = NoteInputSchema.parse(input);
  if (!opts?.allowReservedSlug) assertSlugNamespaceFree(validated.slug);
  const now = new Date().toISOString();

  const note: Note = {
    id: generateId(),
    type: validated.type,
    ...(validated.parentId ? { parentId: validated.parentId } : {}),
    ...(validated.tags ? { tags: validated.tags } : { tags: [] }),
    ...(validated.slug?.trim() ? { slug: validated.slug.trim() } : {}),
    ...(validated.entityType ? { entityType: validated.entityType } : {}),
    ...(validated.entityId ? { entityId: validated.entityId } : {}),
    ...(validated.title?.trim() ? { title: validated.title.trim() } : {}),
    body: validated.body,
    isPinned: validated.isPinned ?? false,
    createdAt: now,
    updatedAt: now,
  };

  await db.notes.add(note);
  return note;
}

export async function batchCreateNotes(
  inputs: NoteInput[],
  db: TaskPlannerDatabase = defaultDb
): Promise<Note[]> {
  if (inputs.length === 0) return [];
  const now = new Date().toISOString();
  const notes: Note[] = inputs.map((input) => {
    const validated = NoteInputSchema.parse(input);
    assertSlugNamespaceFree(validated.slug);
    return {
      id: generateId(),
      type: validated.type,
      ...(validated.parentId ? { parentId: validated.parentId } : {}),
      ...(validated.tags ? { tags: validated.tags } : { tags: [] }),
      ...(validated.slug?.trim() ? { slug: validated.slug.trim() } : {}),
      ...(validated.entityType ? { entityType: validated.entityType } : {}),
      ...(validated.entityId ? { entityId: validated.entityId } : {}),
      ...(validated.title?.trim() ? { title: validated.title.trim() } : {}),
      body: validated.body,
      isPinned: validated.isPinned ?? false,
      createdAt: now,
      updatedAt: now,
    };
  });

  await db.notes.bulkAdd(notes);
  return notes;
}

export async function updateNote(
  id: string,
  updates: NoteUpdate,
  db: TaskPlannerDatabase = defaultDb
): Promise<Note | null> {
  const validated = NoteUpdateSchema.parse(updates);
  const existing = await db.notes.get(id);
  if (!existing) return null;

  // CR-04: a reserved slug is the ownership proof for a team's docs tree, so the generic note
  // path must not be able to break it. Clearing the slug stranded the tree; overwriting it or
  // flipping `type` did the same one field over, and the lead's `update_note` tool reaches both.
  // The tree's own writers (`ensureDocsRoot`, `createTeamDocsTree`) use `db.notes.update`
  // directly, so this guard never blocks them.
  if (isReservedSlug(existing.slug)) {
    if (validated.slug !== undefined || validated.type !== undefined) {
      throw new Error(
        'Không thể đổi slug hoặc loại của thư mục tài liệu nhóm AI.'
      );
    }
  } else {
    assertSlugNamespaceFree(validated.slug);
  }

  const now = new Date().toISOString();
  const updated: Note = {
    ...existing,
    ...(validated.type !== undefined ? { type: validated.type } : {}),
    ...(validated.tags !== undefined ? { tags: validated.tags } : {}),
    ...(validated.slug !== undefined
      ? validated.slug ? { slug: validated.slug.trim() } : {}
      : existing.slug ? { slug: existing.slug } : {}),
    ...(validated.parentId !== undefined
      ? validated.parentId ? { parentId: validated.parentId } : {}
      : existing.parentId ? { parentId: existing.parentId } : {}),
    ...(validated.deletedAt !== undefined
      ? validated.deletedAt ? { deletedAt: validated.deletedAt } : {}
      : existing.deletedAt ? { deletedAt: existing.deletedAt } : {}),
    ...(validated.entityType !== undefined
      ? validated.entityType ? { entityType: validated.entityType } : {}
      : existing.entityType ? { entityType: existing.entityType } : {}),
    ...(validated.entityId !== undefined
      ? validated.entityId ? { entityId: validated.entityId } : {}
      : existing.entityId ? { entityId: existing.entityId } : {}),
    ...(validated.title !== undefined
      ? validated.title.trim() ? { title: validated.title.trim() } : {}
      : existing.title ? { title: existing.title } : {}),
    ...(validated.body !== undefined ? { body: validated.body } : {}),
    ...(validated.isPinned !== undefined ? { isPinned: validated.isPinned } : {}),
    updatedAt: now,
  };

  // If entityType or entityId was set to empty/undefined in updates, remove the property
  if (validated.entityType === undefined && 'entityType' in updates && !updates.entityType) {
    delete updated.entityType;
  }
  if (validated.entityId === undefined && 'entityId' in updates && !updates.entityId) {
    delete updated.entityId;
  }
  if (validated.title === undefined && 'title' in updates && !updates.title) {
    delete updated.title;
  }
  if (validated.parentId === null || ('parentId' in updates && !updates.parentId)) {
    delete updated.parentId;
  }
  if (validated.slug === null || ('slug' in updates && !updates.slug)) {
    delete updated.slug;
  }
  if (validated.deletedAt === null || ('deletedAt' in updates && !updates.deletedAt)) {
    delete updated.deletedAt;
  }

  await db.notes.put(updated);
  return updated;
}

/**
 * CR-04/CR-08: every row that references a note must be deleted or detached before the note
 * goes, or `validateBackup` rejects the app's own next export. One helper, because the two
 * permanent delete paths (`deleteNote`, `bulkPermanentDeleteNotes`) and the team tree delete
 * (`deleteTeamDocsTree`) share exactly this list — a fourth copy would drift.
 *
 * CR-08: the team handles (`aiTeams.docsFolderId`, `aiTeamMembers.docsFolderId`) are cleared
 * here too. They are validated references, and the lazy repair only runs on a team's next turn —
 * a team that never runs again would leave the app's own export invalid, and push does not
 * validate, so the only remote backup would become unimportable.
 *
 * Runs inside the caller's transaction; it opens none of its own.
 */
export async function detachNoteReferences(
  ids: readonly string[],
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  if (ids.length === 0) return;
  const doomed = new Set(ids);

  const attachments = await db.noteAttachments.where('noteId').anyOf(ids).toArray();
  if (attachments.length > 0) {
    await db.noteAttachments.bulkDelete(attachments.map((attachment) => attachment.id));
  }

  // A document set is a snapshot: drop the dead ids, never the whole set.
  const sets = await db.documentSets.toArray();
  for (const set of sets) {
    if (!set.documentIds.some((documentId) => doomed.has(documentId))) continue;
    await db.documentSets.update(set.id, {
      documentIds: set.documentIds.filter((documentId) => !doomed.has(documentId)),
      updatedAt: new Date().toISOString(),
    });
  }

  // WR-04: a `publishedDocuments` row is keyed by `[setId, documentId]`; leaving it behind makes
  // the set read `Local changes` forever, because the status rule counts metadata vs ids.
  const published = await db.publishedDocuments.toArray();
  const doomedPublished = published.filter((row) => doomed.has(row.documentId));
  for (const row of doomedPublished) {
    await db.publishedDocuments.delete([row.setId, row.documentId]);
  }

  // WR-04: a knowledge link naming a gone document is a dangling reference too.
  const links = await db.knowledgeLinks.toArray();
  const doomedLinks = links.filter((link) => link.docId !== undefined && doomed.has(link.docId));
  if (doomedLinks.length > 0) {
    await db.knowledgeLinks.bulkDelete(doomedLinks.map((link) => link.id));
  }

  // A document-scoped thread has no meaning without its document — same rule as a team thread.
  const threads = await db.chatThreads.where('scopeType').equals('document').toArray();
  const doomedThreads = threads.filter(
    (thread) => thread.entityId !== undefined && doomed.has(thread.entityId)
  );
  if (doomedThreads.length > 0) {
    const threadIds = doomedThreads.map((thread) => thread.id);
    await db.chatMessages.where('threadId').anyOf(threadIds).delete();
    await db.chatTabs.where('threadId').anyOf(threadIds).delete();
    await db.chatThreads.bulkDelete(threadIds);
  }

  // CR-08: clear the team handles that named a dying folder. The next turn's backfill re-mints.
  const teams = await db.aiTeams.toArray();
  for (const team of teams) {
    if (team.docsFolderId !== undefined && doomed.has(team.docsFolderId)) {
      await db.aiTeams.update(team.id, { docsFolderId: undefined });
    }
  }
  const members = await db.aiTeamMembers.toArray();
  for (const member of members) {
    if (member.docsFolderId !== undefined && doomed.has(member.docsFolderId)) {
      await db.aiTeamMembers.update(member.id, { docsFolderId: undefined });
    }
  }
}

/**
 * WR-02: the stores `detachNoteReferences` reads or writes, in one list. Callers derive their
 * transaction scope from it, so a store added to the helper can never be forgotten by a caller
 * and surface as a `SubTransactionError` at runtime.
 */
export const NOTE_REFERENCE_STORE_NAMES = [
  'notes',
  'noteAttachments',
  'documentSets',
  'publishedDocuments',
  'knowledgeLinks',
  'chatThreads',
  'chatMessages',
  'chatTabs',
  'aiTeams',
  'aiTeamMembers',
] as const;

/** The same list as Dexie table handles, for `db.transaction('rw', ...)`. */
export function noteReferenceStores(db: TaskPlannerDatabase): Table[] {
  return NOTE_REFERENCE_STORE_NAMES.map((name) => db.table(name));
}

export async function deleteNote(
  id: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  await db.transaction('rw', noteReferenceStores(db), async () => {
    await detachNoteReferences([id], db);
    await db.notes.delete(id);
  });
}

export async function permanentDeleteNote(
  id: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  await deleteNote(id, db);
}

export async function softDeleteNote(
  id: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  const existing = await db.notes.get(id);
  if (!existing) return;
  const now = new Date().toISOString();
  await db.notes.update(id, {
    deletedAt: now,
    updatedAt: now,
  });
}

export async function restoreNote(
  id: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  const existing = await db.notes.get(id);
  if (!existing) return;
  const now = new Date().toISOString();
  delete existing.deletedAt;
  existing.updatedAt = now;
  await db.notes.put(existing);
}

export async function getNotesByFolder(
  folderId?: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<Note[]> {
  const collection = db.notes.toCollection();
  const notes = await collection
    .filter((n) => {
      if (n.deletedAt) return false;
      if (folderId === undefined) {
        return !n.parentId;
      }
      return n.parentId === folderId;
    })
    .toArray();

  return notes.sort((a, b) => {
    if (a.isPinned !== b.isPinned) {
      return a.isPinned ? -1 : 1;
    }
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

export async function getTrashNotes(
  db: TaskPlannerDatabase = defaultDb
): Promise<Note[]> {
  const notes = await db.notes
    .filter((n) => n.deletedAt != null && n.deletedAt !== undefined)
    .toArray();

  return notes.sort((a, b) => {
    return new Date(b.deletedAt || b.updatedAt).getTime() - new Date(a.deletedAt || a.updatedAt).getTime();
  });
}

export async function getNoteWithAttachments(
  id: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<NoteWithAttachments | null> {
  const note = await db.notes.get(id);
  if (!note) return null;

  const attachments = await db.noteAttachments.where('noteId').equals(id).toArray();
  return { note, attachments };
}

export async function getNotesForEntity(
  entityType: NoteEntityType,
  entityId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<Note[]> {
  const notes = await db.notes
    .where('entityId')
    .equals(entityId)
    .filter((n) => n.entityType === entityType)
    .toArray();

  // Sort pinned first, then updatedAt descending (D-24)
  return notes.sort((a, b) => {
    if (a.isPinned !== b.isPinned) {
      return a.isPinned ? -1 : 1;
    }
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

export async function addNoteAttachment(
  input: {
    noteId: string;
    fileName: string;
    mimeType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
    sizeBytes: number;
    data: Blob;
    caption?: string | undefined;
    filePath?: string | undefined;
  },
  db: TaskPlannerDatabase = defaultDb
): Promise<NoteAttachment> {
  const now = new Date().toISOString();
  const id = generateId();

  // Validate metadata schema (D-18)
  NoteAttachmentSchema.parse({
    id,
    noteId: input.noteId,
    fileName: input.fileName,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    caption: input.caption,
    filePath: input.filePath,
    createdAt: now,
  });

  return await db.transaction('rw', [db.notes, db.noteAttachments], async () => {
    const note = await db.notes.get(input.noteId);
    if (!note) {
      throw new Error(`Note ${input.noteId} not found`);
    }

    const currentAttachments = await db.noteAttachments
      .where('noteId')
      .equals(input.noteId)
      .toArray();

    if (currentAttachments.length >= 5) {
      throw new Error('Mỗi ghi chú chỉ được đính kèm tối đa 5 ảnh');
    }

    const attachment: NoteAttachment = {
      id,
      noteId: input.noteId,
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      data: input.data,
      ...(input.filePath ? { filePath: input.filePath } : {}),
      ...(input.caption?.trim() ? { caption: input.caption.trim() } : {}),
      createdAt: now,
    };

    await db.noteAttachments.add(attachment);
    return attachment;
  });
}

export async function deleteNoteAttachment(
  attachmentId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  await db.noteAttachments.delete(attachmentId);
}

export async function bulkPermanentDeleteNotes(
  ids: string[],
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  if (ids.length === 0) return;
  await db.transaction('rw', noteReferenceStores(db), async () => {
    await detachNoteReferences(ids, db);
    await db.notes.bulkDelete(ids);
  });
}

