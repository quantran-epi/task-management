import { db as defaultDb, type TaskPlannerDatabase } from '../index';
import type { Task, ChangeRequest, Note } from '../../types/models';
import type { DetectedEntity } from '../../utils/smartIngestion';

export interface BacklinksResult {
  tasks: Task[];
  changeRequests: ChangeRequest[];
  referencingNotes: Note[];
}

export interface LinkableEntityItem {
  id: string;
  type: 'task' | 'cr' | 'system' | 'doc' | string;
  title: string;
}

export interface LinkEntitiesOptions {
  skipDocBodyUpdate?: boolean;
}

/**
 * Persists bidirectional links between a document and selected entities in a single Dexie transaction (D-06, D-08).
 * 1. For each selected task/CR/doc:
 *    - Appends `[[doc:${docId}|${docTitle}]]` to `notes` or `body` field if not already present.
 *    - For tasks: ensures `docId` is in `task.documentLinks`; for CRs: in `cr.documentLinks`.
 * 2. In the document:
 *    - Appends `[[${entity.type}:${entity.id}|${entity.title}]]` to doc's `body` if not already present (unless skipDocBodyUpdate is true).
 */
export async function linkEntitiesToDoc(
  docId: string,
  docTitle: string,
  selectedEntities: LinkableEntityItem[] | DetectedEntity[],
  db: TaskPlannerDatabase = defaultDb,
  options?: LinkEntitiesOptions
): Promise<void> {
  if (selectedEntities.length === 0) return;

  await db.transaction('rw', [db.notes, db.tasks, db.changeRequests], async () => {
    const doc = await db.notes.get(docId);
    let docBody = doc?.body || '';
    const now = new Date().toISOString();
    const docWikiLink = `[[doc:${docId}|${docTitle}]]`;

    for (const entity of selectedEntities) {
      // 1. Link entity -> doc
      if (entity.type === 'task') {
        const task = await db.tasks.get(entity.id);
        if (task) {
          const currentNotes = task.notes || '';
          const needsDocLink = !currentNotes.includes(`[[doc:${docId}`);
          const newNotes = needsDocLink
            ? currentNotes ? `${currentNotes}\n${docWikiLink}` : docWikiLink
            : currentNotes;

          const currentDocLinks = task.documentLinks || [];
          const newDocLinks = currentDocLinks.includes(docId)
            ? currentDocLinks
            : [...currentDocLinks, docId];

          await db.tasks.update(task.id, {
            notes: newNotes,
            documentLinks: newDocLinks,
            updatedAt: now,
          });
        }
      } else if (entity.type === 'cr') {
        const cr = await db.changeRequests.get(entity.id);
        if (cr) {
          const currentDocLinks = cr.documentLinks || [];
          if (!currentDocLinks.includes(docId)) {
            await db.changeRequests.update(cr.id, {
              documentLinks: [...currentDocLinks, docId],
              updatedAt: now,
            });
          }
        }
      } else if (entity.type === 'doc') {
        const targetDoc = await db.notes.get(entity.id);
        if (targetDoc) {
          const currentBody = targetDoc.body || '';
          const needsDocLink = !currentBody.includes(`[[doc:${docId}`);
          if (needsDocLink) {
            const newBody = currentBody ? `${currentBody}\n${docWikiLink}` : docWikiLink;
            await db.notes.update(targetDoc.id, {
              body: newBody,
              updatedAt: now,
            });
          }
        }
      }

      // 2. Link doc -> entity (skipped if doc body was already formatted by caller)
      if (!options?.skipDocBodyUpdate) {
        const entityWikiLink = `[[${entity.type}:${entity.id}|${entity.title}]]`;
        if (!docBody.includes(`[[${entity.type}:${entity.id}`)) {
          docBody = docBody ? `${docBody}\n${entityWikiLink}` : entityWikiLink;
        }
      }
    }

    // Persist updated document body
    if (!options?.skipDocBodyUpdate && doc && docBody !== doc.body) {
      await db.notes.update(docId, {
        body: docBody,
        updatedAt: now,
      });
    }
  });
}

/**
 * Removes bidirectional references between a document and a specific entity (D-08).
 */
export async function unlinkEntityFromDoc(
  docId: string,
  entityType: string,
  entityId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  await db.transaction('rw', [db.notes, db.tasks, db.changeRequests], async () => {
    const now = new Date().toISOString();
    const doc = await db.notes.get(docId);

    // 1. Remove entity link from doc body
    if (doc) {
      const entityLinkPattern = new RegExp(`\\[\\[${entityType}:${entityId}(?:\\|[^\\]]+)?\\]\\]\\s*\\n?`, 'g');
      const updatedBody = doc.body.replace(entityLinkPattern, '').trimEnd();
      if (updatedBody !== doc.body) {
        await db.notes.update(docId, {
          body: updatedBody,
          updatedAt: now,
        });
      }
    }

    // 2. Remove doc link from entity
    const docLinkPattern = new RegExp(`\\[\\[doc:${docId}(?:\\|[^\\]]+)?\\]\\]\\s*\\n?`, 'g');
    if (entityType === 'task') {
      const task = await db.tasks.get(entityId);
      if (task) {
        const updatedNotes = (task.notes || '').replace(docLinkPattern, '').trimEnd();
        const updatedDocLinks = (task.documentLinks || []).filter((id) => id !== docId);
        await db.tasks.update(entityId, {
          notes: updatedNotes,
          documentLinks: updatedDocLinks,
          updatedAt: now,
        });
      }
    } else if (entityType === 'cr') {
      const cr = await db.changeRequests.get(entityId);
      if (cr) {
        const updatedDocLinks = (cr.documentLinks || []).filter((id) => id !== docId);
        await db.changeRequests.update(entityId, {
          documentLinks: updatedDocLinks,
          updatedAt: now,
        });
      }
    }
  });
}

/**
 * Returns all active tasks, change requests, and notes that contain a reference to target doc ID (D-08).
 */
export async function getBacklinksForDoc(
  docId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<BacklinksResult> {
  const [allTasks, allChangeRequests, allNotes] = await Promise.all([
    db.tasks.toArray(),
    db.changeRequests.toArray(),
    db.notes.toArray(),
  ]);

  const docWikiPattern = `[[doc:${docId}`;

  const tasks = allTasks.filter((t) => {
    const hasWikiNote = t.notes && t.notes.includes(docWikiPattern);
    const hasDocLink = t.documentLinks && t.documentLinks.includes(docId);
    return Boolean(hasWikiNote || hasDocLink);
  });

  const changeRequests = allChangeRequests.filter((cr) => {
    return Boolean(cr.documentLinks && cr.documentLinks.includes(docId));
  });

  const currentDoc = allNotes.find((n) => n.id === docId);
  if (currentDoc?.entityType && currentDoc?.entityId) {
    if (currentDoc.entityType === 'task') {
      const parentTask = allTasks.find((t) => t.id === currentDoc.entityId);
      if (parentTask && !tasks.some((t) => t.id === parentTask.id)) {
        tasks.unshift(parentTask);
      }
    } else if (currentDoc.entityType === 'cr') {
      const parentCr = allChangeRequests.find((cr) => cr.id === currentDoc.entityId);
      if (parentCr && !changeRequests.some((cr) => cr.id === parentCr.id)) {
        changeRequests.unshift(parentCr);
      }
    }
  }

  const referencingNotes = allNotes.filter((n) => {
    return n.id !== docId && !n.deletedAt && n.body.includes(docWikiPattern);
  });

  return { tasks, changeRequests, referencingNotes };
}
