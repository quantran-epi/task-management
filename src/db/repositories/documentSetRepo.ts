import { db as defaultDb, type TaskPlannerDatabase } from '../index';
import type { DocumentSet, PublishPrimaryState } from '../../types/models';
import { DocumentSetSchema } from '../../validation/knowledgeSchemas';
import { generateId, isValidUuid } from '../../utils/uuid';
import { z } from 'zod';

export interface CreateDocumentSetInput {
  name: string;
  description?: string;
  documentIds?: string[];
}

export interface UpdateDocumentSetInput {
  name?: string;
  description?: string | null;
  documentIds?: string[];
}

export interface DocumentSetMemberStatus {
  setId: string;
  setName: string;
  state: PublishPrimaryState;
}

export interface DocumentPublishStatus {
  documentId: string;
  aggregateState: PublishPrimaryState;
  containingSets: DocumentSetMemberStatus[];
}

const PRIMARY_STATE_PRIORITY: Record<PublishPrimaryState, number> = {
  Failed: 1,
  Warning: 2,
  Publishing: 3,
  'Local changes': 4,
  'In sync': 5,
  'Never published': 6,
};

/**
 * Normalizes CRLF and CR to LF only per D-22.
 * Preserves all other spaces, blank lines, case, and Markdown syntax.
 */
export function normalizeMarkdownForHash(markdown: string): string {
  return markdown.replace(/\r\n|\r/g, '\n');
}

/**
 * Computes hexadecimal SHA-256 hash using native Web Crypto API with Node fallback.
 */
export async function computeSha256(text: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(text);
  const subtle =
    (typeof window !== 'undefined' && window.crypto?.subtle) ||
    globalThis.crypto?.subtle;

  if (subtle) {
    const hashBuffer = await subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Creates a new document set with explicit ordered UUID membership (D-01).
 */
export async function createDocumentSet(
  input: CreateDocumentSetInput,
  db: TaskPlannerDatabase = defaultDb
): Promise<DocumentSet> {
  const now = new Date().toISOString();
  const id = generateId();

  const candidate: DocumentSet = {
    id,
    name: input.name,
    ...(input.description?.trim() ? { description: input.description.trim() } : {}),
    documentIds: input.documentIds ?? [],
    createdAt: now,
    updatedAt: now,
  };

  const validated = DocumentSetSchema.parse(candidate);
  await db.documentSets.add(validated);
  return validated;
}

/**
 * Creates a new document set from a snapshot of notes in a folder (D-01).
 * Excludes subfolders and deleted notes, preserving selected order.
 * Captures explicit snapshot once; later folder moves do not alter it.
 */
export async function createDocumentSetFromFolder(
  folderId: string | undefined,
  name: string,
  description?: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<DocumentSet> {
  const notes = await db.notes
    .filter((n) => {
      if (n.deletedAt) return false;
      if (n.type === 'folder') return false;
      if (folderId === undefined) {
        return !n.parentId;
      }
      return n.parentId === folderId;
    })
    .toArray();

  notes.sort((a, b) => {
    if (a.isPinned !== b.isPinned) {
      return a.isPinned ? -1 : 1;
    }
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  const documentIds = notes.map((n) => n.id);

  return createDocumentSet(
    {
      name,
      description,
      documentIds,
    },
    db
  );
}

/**
 * Atomically updates document set metadata or membership.
 * Never modifies or deletes records in db.notes.
 */
export async function updateDocumentSet(
  id: string,
  updates: UpdateDocumentSetInput,
  db: TaskPlannerDatabase = defaultDb
): Promise<DocumentSet | null> {
  return await db.transaction('rw', [db.documentSets], async () => {
    const existing = await db.documentSets.get(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const updatedCandidate: DocumentSet = {
      ...existing,
      ...(updates.name !== undefined ? { name: updates.name } : {}),
      ...(updates.description !== undefined
        ? updates.description
          ? { description: updates.description.trim() }
          : { description: undefined }
        : {}),
      ...(updates.documentIds !== undefined
        ? { documentIds: updates.documentIds }
        : {}),
      updatedAt: now,
    };

    if (updates.description === null || updates.description === '') {
      delete updatedCandidate.description;
    }

    const validated = DocumentSetSchema.parse(updatedCandidate);
    await db.documentSets.put(validated);
    return validated;
  });
}

/**
 * Deletes document set and associated remote cache metadata.
 * Leaves canonical Note records byte-for-byte untouched (T-16-04).
 */
export async function deleteDocumentSet(
  id: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  await db.transaction(
    'rw',
    [db.documentSets, db.publishedDocuments, db.publishAttempts, db.dlpAudits],
    async () => {
      await db.documentSets.delete(id);
      await db.publishedDocuments.where('setId').equals(id).delete();
      await db.publishAttempts.where('setId').equals(id).delete();
      await db.dlpAudits.where('setId').equals(id).delete();
    }
  );
}

/**
 * Returns all document sets sorted by updatedAt descending.
 */
export async function listDocumentSets(
  db: TaskPlannerDatabase = defaultDb
): Promise<DocumentSet[]> {
  const sets = await db.documentSets.toArray();
  return sets.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

/**
 * Fetches a single document set by ID.
 */
export async function getDocumentSet(
  id: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<DocumentSet | null> {
  const set = await db.documentSets.get(id);
  return set ?? null;
}

/**
 * Derives aggregate publish state following D-27 priority and lists containing sets (D-27, D-28).
 * Priority: Failed > Warning > Publishing > Local changes > In sync > Never published.
 */
export async function getDocumentPublishStatuses(
  documentIds: string[],
  db: TaskPlannerDatabase = defaultDb
): Promise<Record<string, DocumentPublishStatus>> {
  const result: Record<string, DocumentPublishStatus> = {};
  if (documentIds.length === 0) return result;

  const allSets = await db.documentSets.toArray();
  const setMap = new Map(allSets.map((s) => [s.id, s]));

  // Active publishing attempts check per set
  const publishingAttempts = await db.publishAttempts
    .where('status')
    .equals('Publishing')
    .toArray();
  const publishingSetIds = new Set(publishingAttempts.map((a) => a.setId));

  await Promise.all(
    documentIds.map(async (docId) => {
      const note = await db.notes.get(docId);
      const containingSets = allSets.filter((s) => s.documentIds.includes(docId));

      if (containingSets.length === 0) {
        result[docId] = {
          documentId: docId,
          aggregateState: 'Never published',
          containingSets: [],
        };
        return;
      }

      let currentNormalizedHash: string | null = null;
      if (note && note.body !== undefined) {
        currentNormalizedHash = await computeSha256(
          normalizeMarkdownForHash(note.body)
        );
      }

      const memberStatuses: DocumentSetMemberStatus[] = [];

      for (const set of containingSets) {
        let state: PublishPrimaryState;

        if (publishingSetIds.has(set.id)) {
          state = 'Publishing';
        } else {
          const publishedMeta = await db.publishedDocuments.get([set.id, docId]);
          if (!publishedMeta) {
            state = 'Never published';
          } else if (publishedMeta.lastPrimaryState === 'Failed') {
            state = 'Failed';
          } else if (publishedMeta.lastPrimaryState === 'Warning') {
            state = 'Warning';
          } else if (
            currentNormalizedHash !== null &&
            currentNormalizedHash !== publishedMeta.publishedContentHash
          ) {
            state = 'Local changes';
          } else {
            state = publishedMeta.lastPrimaryState || 'In sync';
          }
        }

        memberStatuses.push({
          setId: set.id,
          setName: set.name,
          state,
        });
      }

      // Aggregate priority: Failed > Warning > Publishing > Local changes > In sync > Never published
      memberStatuses.sort(
        (a, b) =>
          PRIMARY_STATE_PRIORITY[a.state] - PRIMARY_STATE_PRIORITY[b.state]
      );

      const aggregateState =
        memberStatuses[0]?.state ?? ('Never published' as PublishPrimaryState);

      result[docId] = {
        documentId: docId,
        aggregateState,
        containingSets: memberStatuses,
      };
    })
  );

  return result;
}
