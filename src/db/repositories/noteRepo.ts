import { db as defaultDb, type TaskPlannerDatabase } from '../index';
import type { Note, NoteAttachment, NoteEntityType } from '../../types/models';
import {
  NoteInputSchema,
  NoteUpdateSchema,
  NoteAttachmentSchema,
  type NoteInput,
  type NoteUpdate,
} from '../../validation/schemas';
import { generateId } from '../../utils/uuid';

export interface NoteWithAttachments {
  note: Note;
  attachments: NoteAttachment[];
}

export async function createNote(
  input: NoteInput,
  db: TaskPlannerDatabase = defaultDb
): Promise<Note> {
  const validated = NoteInputSchema.parse(input);
  const now = new Date().toISOString();

  const note: Note = {
    id: generateId(),
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

export async function updateNote(
  id: string,
  updates: NoteUpdate,
  db: TaskPlannerDatabase = defaultDb
): Promise<Note | null> {
  const validated = NoteUpdateSchema.parse(updates);
  const existing = await db.notes.get(id);
  if (!existing) return null;

  const now = new Date().toISOString();
  const updated: Note = {
    ...existing,
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

  await db.notes.put(updated);
  return updated;
}

export async function deleteNote(
  id: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  await db.transaction('rw', [db.notes, db.noteAttachments], async () => {
    const attachments = await db.noteAttachments.where('noteId').equals(id).toArray();
    if (attachments.length > 0) {
      await db.noteAttachments.bulkDelete(attachments.map((a) => a.id));
    }
    await db.notes.delete(id);
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
