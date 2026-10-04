import { db as defaultDb, type TaskPlannerDatabase } from '../index';
import type { Task, Project, Note } from '../../types/models';
import type { DetectedEntity } from '../../utils/smartIngestion';

export interface BacklinksResult {
  tasks: Task[];
  projects: Project[];
  referencingNotes: Note[];
}

/**
 * Persists bidirectional links between a document and selected entities in a single Dexie transaction (D-06, D-08).
 * 1. For each selected task/project:
 *    - Appends `[[doc:${docId}|${docTitle}]]` to `notes` field if not already present.
 *    - For tasks: ensures `docId` is in `task.documentLinks`.
 * 2. In the document:
 *    - Appends `[[${entity.type}:${entity.id}|${entity.title}]]` to doc's `body` if not already present.
 */
export async function linkEntitiesToDoc(
  docId: string,
  docTitle: string,
  selectedEntities: DetectedEntity[],
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  if (selectedEntities.length === 0) return;

  await db.transaction('rw', [db.notes, db.tasks, db.projects], async () => {
    const doc = await db.notes.get(docId);
    if (!doc) return;

    let docBody = doc.body;
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
      } else if (entity.type === 'project') {
        const project = await db.projects.get(entity.id);
        if (project) {
          const currentNotes = project.notes || '';
          const needsDocLink = !currentNotes.includes(`[[doc:${docId}`);
          const newNotes = needsDocLink
            ? currentNotes ? `${currentNotes}\n${docWikiLink}` : docWikiLink
            : currentNotes;

          await db.projects.update(project.id, {
            notes: newNotes,
            updatedAt: now,
          });
        }
      }

      // 2. Link doc -> entity
      const entityWikiLink = `[[${entity.type}:${entity.id}|${entity.title}]]`;
      if (!docBody.includes(`[[${entity.type}:${entity.id}`)) {
        docBody = docBody ? `${docBody}\n${entityWikiLink}` : entityWikiLink;
      }
    }

    // Persist updated document body
    if (docBody !== doc.body) {
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
  await db.transaction('rw', [db.notes, db.tasks, db.projects], async () => {
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
    } else if (entityType === 'project') {
      const project = await db.projects.get(entityId);
      if (project) {
        const updatedNotes = (project.notes || '').replace(docLinkPattern, '').trimEnd();
        await db.projects.update(entityId, {
          notes: updatedNotes,
          updatedAt: now,
        });
      }
    }
  });
}

/**
 * Returns all active tasks, projects, and notes that contain a reference to target doc ID (D-08).
 */
export async function getBacklinksForDoc(
  docId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<BacklinksResult> {
  const [allTasks, allProjects, allNotes] = await Promise.all([
    db.tasks.toArray(),
    db.projects.toArray(),
    db.notes.toArray(),
  ]);

  const docWikiPattern = `[[doc:${docId}`;

  const tasks = allTasks.filter((t) => {
    const hasWikiNote = t.notes && t.notes.includes(docWikiPattern);
    const hasDocLink = t.documentLinks && t.documentLinks.includes(docId);
    return Boolean(hasWikiNote || hasDocLink);
  });

  const projects = allProjects.filter((p) => {
    return Boolean(p.notes && p.notes.includes(docWikiPattern));
  });

  const referencingNotes = allNotes.filter((n) => {
    return n.id !== docId && !n.deletedAt && n.body.includes(docWikiPattern);
  });

  return { tasks, projects, referencingNotes };
}
