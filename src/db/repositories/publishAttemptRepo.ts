import { db as defaultDb, type TaskPlannerDatabase } from '../index';
import type {
  PublishAttemptCache,
  PublishedDocumentMetadata,
} from '../../types/models';
import {
  PublishAttemptCacheSchema,
  PublishedDocumentMetadataSchema,
} from '../../validation/knowledgeSchemas';

export interface ReconcileAttemptInput {
  attempt: PublishAttemptCache;
  publishedDocuments?: PublishedDocumentMetadata[];
}

/**
 * Reconciles remote attempt outcome into local IndexedDB cache atomically.
 * Follows D-08, D-27, D-29, T-16-05, T-16-06, T-16-07:
 * - Strict-Zod parses all inputs before opening write transaction.
 * - Updates attempt cache, published-document metadata in one transaction.
 * - Prunes attempt history for the set to exactly newest 10 by server timestamp.
 * - Never accepts or persists Markdown body, tokens, request payload, or DLP excerpts.
 */
export async function reconcileRemoteAttempt(
  input: ReconcileAttemptInput,
  db: TaskPlannerDatabase = defaultDb
): Promise<PublishAttemptCache> {
  // 1. Strict validation before opening transaction (T-16-05, T-16-06)
  const validatedAttempt = PublishAttemptCacheSchema.parse(input.attempt);
  const validatedDocs = (input.publishedDocuments ?? []).map((doc) =>
    PublishedDocumentMetadataSchema.parse(doc)
  );

  const setId = validatedAttempt.setId;

  // 2. Atomic write transaction
  return await db.transaction(
    'rw',
    [db.publishAttempts, db.publishedDocuments, db.documentSets],
    async () => {
      // Retrieve existing stored attempt to check manifest
      const existing = await db.publishAttempts.get(validatedAttempt.id);

      // Determine durable frozen manifest: either from incoming attempt or existing stored attempt
      const manifest = validatedAttempt.submittedDocuments ?? existing?.submittedDocuments;

      let attemptToStore = validatedAttempt;
      if (!validatedAttempt.submittedDocuments && manifest) {
        attemptToStore = {
          ...validatedAttempt,
          submittedDocuments: manifest,
        };
      }

      // If status is terminal 'In sync', replacement validation and atomic replacement apply
      // only when publishedDocuments is explicitly supplied or manifest is present
      if (validatedAttempt.status === 'In sync') {
        if (input.publishedDocuments !== undefined) {
          if (manifest) {
            // Replacement rows must exactly match the frozen manifest one-to-one
            if (validatedDocs.length !== manifest.length) {
              throw new Error(
                `Replacement publishedDocuments count (${validatedDocs.length}) does not match submitted manifest count (${manifest.length})`
              );
            }

            // Check each doc in manifest has exact correspondence in validatedDocs
            const docMap = new Map(validatedDocs.map((d) => [d.documentId, d]));
            for (const item of manifest) {
              const doc = docMap.get(item.documentId);
              if (!doc) {
                throw new Error(`Replacement publishedDocuments missing documentId ${item.documentId}`);
              }
              if (doc.publishedContentHash !== item.submittedContentHash) {
                throw new Error(
                  `Replacement document ${item.documentId} hash ${doc.publishedContentHash} does not match submitted hash ${item.submittedContentHash}`
                );
              }
              if (!doc.activeSnapshotId) {
                throw new Error(
                  `Replacement document ${item.documentId} requires activeSnapshotId`
                );
              }
            }
          }

          // Delete all old rows for set (removes stale rows)
          await db.publishedDocuments.where('setId').equals(setId).delete();

          // BulkPut replacement rows
          if (validatedDocs.length > 0) {
            await db.publishedDocuments.bulkPut(validatedDocs);
          }

          // Retire frozen manifest on terminal success only when replacement succeeds
          if (attemptToStore.submittedDocuments) {
            const { submittedDocuments: _, ...retired } = attemptToStore;
            attemptToStore = retired as PublishAttemptCache;
          }
        }
      }

      // Put attempt
      await db.publishAttempts.put(attemptToStore);

      // Bound history: keep exactly newest 10 attempts for this set (D-29)
      const allAttemptsForSet = await db.publishAttempts
        .where('setId')
        .equals(setId)
        .toArray();

      if (allAttemptsForSet.length > 10) {
        // Sort descending by startedAt (newest first)
        allAttemptsForSet.sort(
          (a, b) =>
            new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
        );

        const toPrune = allAttemptsForSet.slice(10);
        if (toPrune.length > 0) {
          await db.publishAttempts.bulkDelete(toPrune.map((a) => a.id));
        }
      }

      return attemptToStore;
    }
  );
}

/**
 * Marks an ongoing attempt with polling uncertainty (D-13).
 * Status remains exactly 'Publishing' per D-27 (never becomes 'Failed' or a 7th state).
 * Annotates subordinate errorMessage to describe connection loss.
 */
export async function markPollingUncertain(
  attemptId: string,
  uncertainReason: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<PublishAttemptCache | null> {
  return await db.transaction('rw', [db.publishAttempts], async () => {
    const existing = await db.publishAttempts.get(attemptId);
    if (!existing) return null;

    const updated: PublishAttemptCache = {
      ...existing,
      status: 'Publishing', // Preserve exact primary state
      errorMessage: uncertainReason,
    };

    const validated = PublishAttemptCacheSchema.parse(updated);
    await db.publishAttempts.put(validated);
    return validated;
  });
}

/**
 * Lists the recent attempts for a document set, sorted newest first (max 10).
 */
export async function listRecentAttempts(
  setId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<PublishAttemptCache[]> {
  const attempts = await db.publishAttempts
    .where('setId')
    .equals(setId)
    .toArray();

  return attempts
    .sort(
      (a, b) =>
        new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    )
    .slice(0, 10);
}

/**
 * Retrieves a cached publish attempt by attempt ID.
 * Follows D-08, D-10, D-13:
 * Returns the raw attempt row including durable content-free frozen submittedDocuments manifest if present.
 */
export async function getCachedPublishAttempt(
  attemptId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<PublishAttemptCache | undefined> {
  return await db.publishAttempts.get(attemptId);
}
