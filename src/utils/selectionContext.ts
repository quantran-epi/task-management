import { db as defaultDb, type TaskPlannerDatabase } from '../db';
import type { Task, Project, Note } from '../types/models';

export type AIContextEntityType = 'doc' | 'note' | 'task' | 'project' | 'unknown';

export interface ResolvedHierarchyContext {
  targetType: AIContextEntityType;
  targetId?: string | undefined;
  targetTitle?: string | undefined;
  parentTask?: { id: string; name: string } | undefined;
  parentProject?: { id: string; name: string } | undefined;
  hierarchyPath: string; // e.g., 'Project: "App" > Task: "Auth" > Document: "Spec"'
}

export interface SelectionContextPayload extends ResolvedHierarchyContext {
  selectedText: string;
}

/**
 * Traverses upwards from an anchor DOM element to extract AI context attributes.
 */
export function getDomContextFromNode(node: Node | null): { entityType: AIContextEntityType; entityId?: string | undefined } {
  if (!node) return { entityType: 'unknown' };

  let element: HTMLElement | null = node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement;

  while (element) {
    const contextType = element.getAttribute('data-ai-context-type');
    const contextId = element.getAttribute('data-ai-context-id');

    if (contextType) {
      const normalizedType: AIContextEntityType =
        contextType === 'doc' || contextType === 'document'
          ? 'doc'
          : contextType === 'note'
          ? 'note'
          : contextType === 'task'
          ? 'task'
          : contextType === 'project'
          ? 'project'
          : 'unknown';

      return {
        entityType: normalizedType,
        entityId: contextId || undefined,
      };
    }

    element = element.parentElement;
  }

  return { entityType: 'unknown' };
}

/**
 * Resolves full hierarchy information for an entity from IndexedDB.
 */
export async function resolveEntityHierarchy(
  entityType: AIContextEntityType,
  entityId?: string | undefined,
  db: TaskPlannerDatabase = defaultDb
): Promise<ResolvedHierarchyContext> {
  if (!entityId || entityType === 'unknown') {
    return {
      targetType: 'unknown',
      hierarchyPath: 'Toàn cục',
    };
  }

  try {
    if (entityType === 'doc' || entityType === 'note') {
      const note: Note | undefined = await db.notes?.get(entityId);
      const title = note?.title || (entityType === 'doc' ? 'Tài liệu không tên' : 'Ghi chú');

      let parentTask: { id: string; name: string } | undefined = undefined;
      let parentProject: { id: string; name: string } | undefined = undefined;

      // Check explicit task relation
      const taskId = note?.entityType === 'task' ? note.entityId : undefined;
      if (taskId) {
        const task: Task | undefined = await db.tasks?.get(taskId);
        if (task) {
          parentTask = { id: task.id, name: task.name };
          if (task.projectId) {
            const project: Project | undefined = await db.projects?.get(task.projectId);
            if (project) {
              parentProject = { id: project.id, name: project.name };
            }
          }
        }
      }

      // Check explicit project relation if not resolved via task
      if (!parentProject) {
        const projectId = note?.entityType === 'project' ? note.entityId : undefined;
        if (projectId) {
          const project: Project | undefined = await db.projects?.get(projectId);
          if (project) {
            parentProject = { id: project.id, name: project.name };
          }
        }
      }

      // Build breadcrumb
      const parts: string[] = [];
      if (parentProject) parts.push(`Dự án "${parentProject.name}"`);
      if (parentTask) parts.push(`Tác vụ "${parentTask.name}"`);
      parts.push(`${entityType === 'doc' ? 'Tài liệu' : 'Ghi chú'} "${title}"`);

      return {
        targetType: entityType,
        targetId: entityId,
        targetTitle: title,
        parentTask,
        parentProject,
        hierarchyPath: parts.join(' > '),
      };
    }

    if (entityType === 'task') {
      const task: Task | undefined = await db.tasks?.get(entityId);
      const title = task?.name || 'Tác vụ không tên';
      let parentProject: { id: string; name: string } | undefined = undefined;

      if (task?.projectId) {
        const project: Project | undefined = await db.projects?.get(task.projectId);
        if (project) {
          parentProject = { id: project.id, name: project.name };
        }
      }

      const parts: string[] = [];
      if (parentProject) parts.push(`Dự án "${parentProject.name}"`);
      parts.push(`Tác vụ "${title}"`);

      return {
        targetType: 'task',
        targetId: entityId,
        targetTitle: title,
        parentProject,
        hierarchyPath: parts.join(' > '),
      };
    }

    if (entityType === 'project') {
      const project: Project | undefined = await db.projects?.get(entityId);
      const title = project?.name || 'Dự án không tên';

      return {
        targetType: 'project',
        targetId: entityId,
        targetTitle: title,
        hierarchyPath: `Dự án "${title}"`,
      };
    }
  } catch (err) {
    console.warn('[selectionContext] Error resolving hierarchy:', err);
  }

  return {
    targetType: entityType,
    targetId: entityId,
    hierarchyPath: `${entityType} [${entityId}]`,
  };
}

/**
 * Formats quote and context for insertion into AI Chat Drawer.
 */
export function formatSelectionMentionPrompt(payload: SelectionContextPayload, userQuery?: string): string {
  const quote = payload.selectedText.trim();
  const contextHeader = `[Trích đoạn từ ${payload.hierarchyPath}]`;

  const quotedBlock = quote
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');

  if (userQuery && userQuery.trim()) {
    return `${contextHeader}\n${quotedBlock}\n\n${userQuery.trim()}`;
  }

  return `${contextHeader}\n${quotedBlock}\n\n`;
}
