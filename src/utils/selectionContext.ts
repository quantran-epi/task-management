import { db as defaultDb, type TaskPlannerDatabase } from '../db';
import type { ChangeRequest, Note, System, Task } from '../types/models';
import {
  serializeTaskContext,
  serializeDocumentContext,
} from '../services/ai/contextGrounding';

export type AIContextEntityType = 'doc' | 'note' | 'task' | 'cr' | 'system' | 'unknown';

export interface ResolvedHierarchyContext {
  targetType: AIContextEntityType;
  targetId?: string | undefined;
  targetTitle?: string | undefined;
  parentTask?: { id: string; name: string } | undefined;
  parentCr?: { id: string; name: string; code: string } | undefined;
  system?: { id: string; name: string; code: string } | undefined;
  hierarchyPath: string; // e.g. 'CR "CR-2026-001" > Tác vụ "Auth" > Tài liệu "Spec"'
  fullContextText?: string | undefined; // Full markdown / XML serialization of the source entities
}

export interface SelectionContextPayload extends ResolvedHierarchyContext {
  selectedText: string;
}

/**
 * Compact CR block. The retired legacy serializer is gone with the old model,
 * so the CR/system blocks are built here rather than importing a symbol that
 * only exists after the AI-surface plan lands.
 */
function serializeCrContext(cr: ChangeRequest): string {
  const lines: string[] = [`<item_context type="cr" id="${cr.id}">`, `## CR: ${cr.code} — ${cr.name}`];
  if (cr.description?.trim()) lines.push(`**Description:** ${cr.description.trim()}`);
  lines.push(`- **Status:** ${cr.status}`);
  lines.push(`- **Type:** ${cr.type}`);
  if (cr.deadline) lines.push(`- **Deadline:** ${cr.deadline}`);
  if (cr.opsOwners && cr.opsOwners.length > 0) lines.push(`- **Ops Owners:** ${cr.opsOwners.join(', ')}`);
  if (cr.businessAnalysts && cr.businessAnalysts.length > 0) {
    lines.push(`- **Business Analysts:** ${cr.businessAnalysts.join(', ')}`);
  }
  lines.push('</item_context>');
  return lines.join('\n');
}

function serializeSystemContext(system: System): string {
  const lines: string[] = [
    `<item_context type="system" id="${system.id}">`,
    `## Subsystem: ${system.code} — ${system.name}`,
  ];
  if (system.description?.trim()) lines.push(`**Description:** ${system.description.trim()}`);
  lines.push(`- **Type:** ${system.type}`);
  if (system.remoteRepoPath) lines.push(`- **Repo:** ${system.remoteRepoPath}`);
  lines.push('</item_context>');
  return lines.join('\n');
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
          : contextType === 'cr'
          ? 'cr'
          : contextType === 'system'
          ? 'system'
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
 * Resolves full hierarchy information and eager context data for an entity from IndexedDB.
 * Grounding always follows the entity's own `crId`/`systemId`, so a turn can never be
 * grounded on another CR's data (T-31.2-19).
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
      let parentCr: { id: string; name: string; code: string } | undefined = undefined;
      let system: { id: string; name: string; code: string } | undefined = undefined;
      const contextBlocks: string[] = [];

      if (note) {
        contextBlocks.push(serializeDocumentContext(note));
      }

      // Check explicit task relation
      const taskId = note?.entityType === 'task' ? note.entityId : undefined;
      if (taskId) {
        const task: Task | undefined = await db.tasks?.get(taskId);
        if (task) {
          parentTask = { id: task.id, name: task.name };
          contextBlocks.push(serializeTaskContext(task));

          const cr: ChangeRequest | undefined = await db.changeRequests.get(task.crId);
          if (cr) {
            parentCr = { id: cr.id, name: cr.name, code: cr.code };
            contextBlocks.push(serializeCrContext(cr));
          }
          if (task.systemId) {
            const sys: System | undefined = await db.systems.get(task.systemId);
            if (sys) {
              system = { id: sys.id, name: sys.name, code: sys.code };
              contextBlocks.push(serializeSystemContext(sys));
            }
          }
        }
      }

      // Check explicit CR relation if not resolved via task
      if (!parentCr) {
        const crId = note?.entityType === 'cr' ? note.entityId : undefined;
        if (crId) {
          const cr: ChangeRequest | undefined = await db.changeRequests.get(crId);
          if (cr) {
            parentCr = { id: cr.id, name: cr.name, code: cr.code };
            contextBlocks.push(serializeCrContext(cr));
          }
        }
      }

      // Check explicit system relation if not resolved via task
      if (!system) {
        const systemId = note?.entityType === 'system' ? note.entityId : undefined;
        if (systemId) {
          const sys: System | undefined = await db.systems.get(systemId);
          if (sys) {
            system = { id: sys.id, name: sys.name, code: sys.code };
            contextBlocks.push(serializeSystemContext(sys));
          }
        }
      }

      // Build breadcrumb
      const parts: string[] = [];
      if (parentCr) parts.push(`CR "${parentCr.code}"`);
      if (system) parts.push(`Subsystem "${system.code}"`);
      if (parentTask) parts.push(`Tác vụ "${parentTask.name}"`);
      parts.push(`${entityType === 'doc' ? 'Tài liệu' : 'Ghi chú'} "${title}"`);

      return {
        targetType: entityType,
        targetId: entityId,
        targetTitle: title,
        parentTask,
        parentCr,
        system,
        hierarchyPath: parts.join(' > '),
        fullContextText: contextBlocks.join('\n\n'),
      };
    }

    if (entityType === 'task') {
      const task: Task | undefined = await db.tasks?.get(entityId);
      const title = task?.name || 'Tác vụ không tên';
      let parentCr: { id: string; name: string; code: string } | undefined = undefined;
      let system: { id: string; name: string; code: string } | undefined = undefined;
      const contextBlocks: string[] = [];

      if (task) {
        contextBlocks.push(serializeTaskContext(task));

        const cr: ChangeRequest | undefined = await db.changeRequests.get(task.crId);
        if (cr) {
          parentCr = { id: cr.id, name: cr.name, code: cr.code };
          contextBlocks.push(serializeCrContext(cr));
        }
        if (task.systemId) {
          const sys: System | undefined = await db.systems.get(task.systemId);
          if (sys) {
            system = { id: sys.id, name: sys.name, code: sys.code };
            contextBlocks.push(serializeSystemContext(sys));
          }
        }
      }

      const parts: string[] = [];
      if (parentCr) parts.push(`CR "${parentCr.code}"`);
      if (system) parts.push(`Subsystem "${system.code}"`);
      parts.push(`Tác vụ "${title}"`);

      return {
        targetType: 'task',
        targetId: entityId,
        targetTitle: title,
        parentCr,
        system,
        hierarchyPath: parts.join(' > '),
        fullContextText: contextBlocks.join('\n\n'),
      };
    }

    if (entityType === 'cr') {
      const cr: ChangeRequest | undefined = await db.changeRequests.get(entityId);
      const title = cr?.name || 'CR không tên';
      const contextBlocks: string[] = [];

      if (cr) {
        contextBlocks.push(serializeCrContext(cr));
      }

      return {
        targetType: 'cr',
        targetId: entityId,
        targetTitle: title,
        ...(cr ? { parentCr: { id: cr.id, name: cr.name, code: cr.code } } : {}),
        hierarchyPath: `CR "${cr?.code ?? title}"`,
        fullContextText: contextBlocks.join('\n\n'),
      };
    }

    if (entityType === 'system') {
      const sys: System | undefined = await db.systems.get(entityId);
      const title = sys?.name || 'Subsystem không tên';
      const contextBlocks: string[] = [];

      if (sys) {
        contextBlocks.push(serializeSystemContext(sys));
      }

      return {
        targetType: 'system',
        targetId: entityId,
        targetTitle: title,
        ...(sys ? { system: { id: sys.id, name: sys.name, code: sys.code } } : {}),
        hierarchyPath: `Subsystem "${sys?.code ?? title}"`,
        fullContextText: contextBlocks.join('\n\n'),
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
