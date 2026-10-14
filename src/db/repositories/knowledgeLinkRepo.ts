import { db as defaultDb, type TaskPlannerDatabase } from '../index';
import type { KnowledgeLink, TaskMateEntityType } from '../../types/models';
import { generateId } from '../../utils/uuid';

export interface CreateKnowledgeLinkInput {
  taskMateEntityType: TaskMateEntityType;
  taskMateEntityId: string;
  setId: string;
  urn?: string | undefined;
  docId?: string | undefined;
  displayLabel: string;
}

export interface UpdateKnowledgeLinkInput {
  displayLabel?: string | undefined;
}

export function buildKnowledgeLinkKey(
  taskMateEntityType: TaskMateEntityType,
  taskMateEntityId: string,
  setId: string,
  target: string
): string {
  return `${taskMateEntityType}:${taskMateEntityId}:${setId}:${target}`;
}

export async function createKnowledgeLink(
  input: CreateKnowledgeLinkInput,
  db: TaskPlannerDatabase = defaultDb
): Promise<KnowledgeLink> {
  const target = input.urn || input.docId;
  if (!target) {
    throw new Error('KnowledgeLink must contain at least one of urn or docId');
  }

  const now = new Date().toISOString();
  const linkKey = buildKnowledgeLinkKey(
    input.taskMateEntityType,
    input.taskMateEntityId,
    input.setId,
    target
  );

  const link: KnowledgeLink = {
    id: generateId(),
    linkKey,
    taskMateEntityType: input.taskMateEntityType,
    taskMateEntityId: input.taskMateEntityId,
    setId: input.setId,
    urn: input.urn,
    docId: input.docId,
    displayLabel: input.displayLabel,
    createdAt: now,
    updatedAt: now,
  };

  await db.knowledgeLinks.add(link);
  return link;
}

export async function getKnowledgeLink(
  id: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<KnowledgeLink | undefined> {
  return db.knowledgeLinks.get(id);
}

export async function getKnowledgeLinksForEntity(
  entityType: TaskMateEntityType,
  entityId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<KnowledgeLink[]> {
  return db.knowledgeLinks
    .where('taskMateEntityId')
    .equals(entityId)
    .filter((l) => l.taskMateEntityType === entityType)
    .toArray();
}

export async function getKnowledgeLinksForSet(
  setId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<KnowledgeLink[]> {
  return db.knowledgeLinks.where('setId').equals(setId).toArray();
}

export async function deleteKnowledgeLink(
  id: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  await db.knowledgeLinks.delete(id);
}

export async function deleteLinksForTaskMateEntity(
  entityType: TaskMateEntityType,
  entityId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  const links = await getKnowledgeLinksForEntity(entityType, entityId, db);
  if (links.length > 0) {
    await db.knowledgeLinks.bulkDelete(links.map((l) => l.id));
  }
}
