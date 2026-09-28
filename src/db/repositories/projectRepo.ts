import { db as defaultDb, type TaskPlannerDatabase } from '../index';
import type { Project } from '../../types/models';
import { generateId } from '../../utils/uuid';
import {
  ProjectInputSchema,
  ProjectUpdateSchema,
  type ProjectInput,
  type ProjectUpdate,
} from '../../validation/schemas';

export async function createProject(
  input: ProjectInput,
  db: TaskPlannerDatabase = defaultDb
): Promise<Project> {
  const validated = ProjectInputSchema.parse(input);
  const now = new Date().toISOString();

  const project: Project = {
    id: generateId(),
    name: validated.name,
    status: validated.status,
    createdAt: now,
    updatedAt: now,
  };

  if (validated.description !== undefined) project.description = validated.description;
  if (validated.deadline !== undefined) project.deadline = validated.deadline;
  if (validated.notes !== undefined) project.notes = validated.notes;
  if (validated.opsOwners !== undefined) project.opsOwners = validated.opsOwners;
  if (validated.businessAnalysts !== undefined) project.businessAnalysts = validated.businessAnalysts;
  if (validated.documentLinks !== undefined) project.documentLinks = validated.documentLinks;
  if (validated.reminderDate !== undefined) project.reminderDate = validated.reminderDate;
  if (validated.reminderNote !== undefined) project.reminderNote = validated.reminderNote;

  await db.projects.add(project);
  return project;
}

export async function updateProject(
  id: string,
  patch: ProjectUpdate,
  db: TaskPlannerDatabase = defaultDb
): Promise<Project> {
  const validated = ProjectUpdateSchema.parse(patch);
  const existing = await db.projects.get(id);
  if (!existing) {
    throw new Error(`Project not found: ${id}`);
  }

  const now = new Date().toISOString();
  const updated: Project = {
    ...existing,
    updatedAt: now,
  };

  if (validated.name !== undefined) updated.name = validated.name;
  if (validated.description !== undefined) updated.description = validated.description;
  if (validated.deadline !== undefined) updated.deadline = validated.deadline;
  if (validated.notes !== undefined) updated.notes = validated.notes;
  if (validated.status !== undefined) updated.status = validated.status;
  if (validated.opsOwners !== undefined) updated.opsOwners = validated.opsOwners;
  if (validated.businessAnalysts !== undefined) updated.businessAnalysts = validated.businessAnalysts;
  if (validated.documentLinks !== undefined) updated.documentLinks = validated.documentLinks;
  if ('reminderDate' in patch) {
    if (validated.reminderDate !== undefined) {
      updated.reminderDate = validated.reminderDate;
    } else {
      delete updated.reminderDate;
    }
  }
  if ('reminderNote' in patch) {
    if (validated.reminderNote !== undefined) {
      updated.reminderNote = validated.reminderNote;
    } else {
      delete updated.reminderNote;
    }
  }

  await db.projects.put(updated);
  return updated;
}

export async function getProject(
  id: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<Project | undefined> {
  return db.projects.get(id);
}

export async function getAllProjects(
  db: TaskPlannerDatabase = defaultDb
): Promise<Project[]> {
  return db.projects.toArray();
}

export async function deleteProjectDirect(
  id: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  await db.projects.delete(id);
}
