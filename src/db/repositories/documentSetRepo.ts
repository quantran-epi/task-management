import { db as defaultDb, type TaskPlannerDatabase } from '../index';
import type {
  DocumentSet,
  DocumentSetPreset,
  DocumentSetRelation,
  DocumentSetScope,
  PublishPrimaryState,
} from '../../types/models';
import type { SetCatalogEntry } from '../../services/ai/semanticScopeRouter';
import { DocumentSetSchema } from '../../validation/knowledgeSchemas';
import { generateId } from '../../utils/uuid';

export interface CreateDocumentSetInput {
  name: string;
  description?: string | undefined;
  documentIds?: string[] | undefined;
  scope?: DocumentSetScope | undefined;
  aliases?: readonly string[] | undefined;
  relations?: readonly DocumentSetRelation[] | undefined;
  isBase?: boolean | undefined;
  presentationRevision?: number | undefined;
  preset?: DocumentSetPreset | undefined;
  sdlc?: DocumentSet['sdlc'];
}

export interface UpdateDocumentSetInput {
  name?: string | undefined;
  description?: string | null | undefined;
  documentIds?: string[] | undefined;
  scope?: DocumentSetScope | undefined;
  aliases?: readonly string[] | undefined;
  relations?: readonly DocumentSetRelation[] | undefined;
  isBase?: boolean | undefined;
  presentationRevision?: number | undefined;
  preset?: DocumentSetPreset | undefined;
  sdlc?: DocumentSet['sdlc'];
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

/**
 * Resolves one project SDLC set by structured metadata while an outer transaction owns atomicity.
 * Set names are display-only and never participate in identity.
 */
export async function getOrCreateProjectSdlcSetInTransaction(
  projectId: string,
  now: string,
  db: TaskPlannerDatabase = defaultDb,
): Promise<DocumentSet> {
  const matches = await db.documentSets
    .filter((set) => set.sdlc?.projectId === projectId && set.sdlc.purpose === 'sdlc')
    .toArray();
  if (matches.length > 1) throw new Error('DUPLICATE_PROJECT_SDLC_SET');
  const existing = matches[0];
  if (existing) return existing;

  const set = DocumentSetSchema.parse({
    id: generateId(),
    name: 'SDLC artifacts',
    description: 'Canonical project SDLC artifacts',
    documentIds: [],
    createdAt: now,
    updatedAt: now,
    scope: { domain: 'SDLC', environment: null, version: null },
    aliases: [],
    relations: [],
    isBase: false,
    presentationRevision: 0,
    preset: 'TuyChinh',
    sdlc: { projectId, purpose: 'sdlc' },
  });
  await db.documentSets.add(set);
  return set;
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
 * Extended with scope presets, aliases, relations, presentationRevision (D-17, D-18, D-32, D-35).
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
    scope: input.scope ?? {
      domain: 'General',
      environment: null,
      version: null,
    },
    aliases: input.aliases ?? [],
    relations: input.relations ?? [],
    isBase: input.isBase ?? false,
    presentationRevision: input.presentationRevision ?? 0,
    preset: input.preset ?? 'TuyChinh',
    ...(input.sdlc ? { sdlc: input.sdlc } : {}),
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
      ...(updates.scope !== undefined ? { scope: updates.scope } : {}),
      ...(updates.aliases !== undefined ? { aliases: updates.aliases } : {}),
      ...(updates.relations !== undefined ? { relations: updates.relations } : {}),
      ...(updates.isBase !== undefined ? { isBase: updates.isBase } : {}),
      ...(updates.presentationRevision !== undefined
        ? { presentationRevision: updates.presentationRevision }
        : {}),
      ...(updates.preset !== undefined ? { preset: updates.preset } : {}),
      ...(updates.sdlc !== undefined ? { sdlc: updates.sdlc } : {}),
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
  const tables = [
    db.documentSets,
    db.publishedDocuments,
    db.publishAttempts,
    db.dlpAudits,
    ...(db.knowledgeLinks ? [db.knowledgeLinks] : []),
  ];

  await db.transaction('rw', tables, async () => {
    await db.documentSets.delete(id);
    await db.publishedDocuments.where('setId').equals(id).delete();
    await db.publishAttempts.where('setId').equals(id).delete();
    await db.dlpAudits.where('setId').equals(id).delete();
    if (db.knowledgeLinks) {
      await db.knowledgeLinks.where('setId').equals(id).delete();
    }
  });
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

/**
 * Updates presentation ordering of documents in a document set (D-32, D-33).
 * Increments presentationRevision by 1 inside a Dexie transaction.
 * MUST NOT touch graphSnapshotId, publishedContentHash, or publish state.
 * No legacy migration from pre-19 shape; existing sets may be deleted/rebuilt (D-35).
 */
export async function updatePresentationOrder(
  setId: string,
  orderedDocumentIds: readonly string[],
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  await db.transaction('rw', [db.documentSets], async () => {
    const existing = await db.documentSets.get(setId);
    if (!existing) return;

    const nextRevision = (existing.presentationRevision ?? 0) + 1;
    const now = new Date().toISOString();

    const updated: DocumentSet = {
      ...existing,
      documentIds: [...orderedDocumentIds],
      presentationRevision: nextRevision,
      updatedAt: now,
    };

    const validated = DocumentSetSchema.parse(updated);
    await db.documentSets.put(validated);
  });
}

/**
 * Fetches lightweight set catalog entries consumed by semanticScopeRouter.routeScope (D-19, D-20).
 * Fetches directly from IndexedDB without network requests.
 * Safely defaults missing/pre-19 fields to safe values without schema migration (D-35).
 */
export async function fetchSetCatalog(
  db: TaskPlannerDatabase = defaultDb
): Promise<SetCatalogEntry[]> {
  const sets = await db.documentSets.toArray();
  return sets.map((s) => {
    const relationFirst = s.relations && s.relations.length > 0 ? s.relations[0]?.kind ?? null : null;
    return {
      setId: s.id,
      canonicalName: s.name,
      domain: s.scope?.domain ?? 'General',
      environment: s.scope?.environment ?? null,
      version: s.scope?.version ?? null,
      aliases: s.aliases ?? [],
      relation: relationFirst,
      isBase: Boolean(s.isBase),
    };
  });
}
