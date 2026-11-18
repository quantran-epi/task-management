import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import type { Task, ChangeRequest, System, Note, NoteAttachment } from '../../types/models';
import { isLocalPath, normalizeLocalPath } from '../../utils/documentLinks';
import { isTauriApp } from '../../utils/timerPopout';
import { readNoteMarkdown } from '../../utils/noteBody';

export const MAX_CONTEXT_CHAR_LIMIT = 12000;
export const MAX_FILE_LINES_LIMIT = 2000;

// Common text/source file extensions permitted for head extraction
const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'json', 'yaml', 'yml', 'toml', 'xml', 'csv', 'tsv',
  'js', 'jsx', 'ts', 'tsx', 'html', 'css', 'scss', 'sass', 'less',
  'rs', 'py', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'go', 'rb', 'php', 'swift', 'kt',
  'sh', 'bash', 'zsh', 'sql', 'env.example', 'log',
]);

export function isTextFile(filePath: string): boolean {
  const clean = filePath.split('?')[0]?.split('#')[0] || '';
  const lastDot = clean.lastIndexOf('.');
  if (lastDot === -1) return false;
  const ext = clean.slice(lastDot + 1).toLowerCase();
  return TEXT_EXTENSIONS.has(ext);
}

/**
 * Invoke Tauri IPC command to read head of a local file
 */
async function defaultFileReader(filePath: string, maxLines: number = MAX_FILE_LINES_LIMIT): Promise<string | null> {
  if (!isTauriApp()) return null;
  try {
    const api = await import('@tauri-apps/api/core');
    const cleanPath = normalizeLocalPath(filePath);
    return await api.invoke<string>('read_local_file_text_head', {
      filePath: cleanPath,
      maxLines,
    });
  } catch (err) {
    console.warn(`[contextGrounding] Failed to read local file head: ${filePath}`, err);
    return null;
  }
}

/**
 * Serializes a Task model into XML with structured markdown
 */
export function serializeTaskContext(task: Task): string {
  const lines: string[] = [];
  lines.push(`<item_context type="task" id="${task.id}">`);
  lines.push(`## Task: ${task.name}`);
  if (task.description?.trim()) {
    lines.push(`**Description:** ${task.description.trim()}`);
  }
  lines.push(`- **Status:** ${task.status}`);
  lines.push(`- **Priority:** ${task.priority}`);
  lines.push(`- **Progress:** ${task.progress}%`);
  if (task.jiraKey) {
    lines.push(`- **Jira:** ${task.jiraKey}`);
  }
  if (task.workType) {
    lines.push(`- **Work Type:** ${task.workType}`);
  }
  if (task.opsOwners && task.opsOwners.length > 0) {
    lines.push(`- **Ops Owners:** ${task.opsOwners.join(', ')}`);
  }
  if (task.businessAnalysts && task.businessAnalysts.length > 0) {
    lines.push(`- **Business Analysts:** ${task.businessAnalysts.join(', ')}`);
  }
  if (task.deadline) {
    lines.push(`- **Deadline:** ${task.deadline}`);
  }
  if (task.actualStartDate || task.actualEndDate) {
    lines.push(`- **Actual Dates:** ${task.actualStartDate || 'N/A'} -> ${task.actualEndDate || 'N/A'}`);
  }
  if (task.estimateMinutes) {
    const hours = (task.estimateMinutes / 60).toFixed(1).replace(/\.0$/, '');
    lines.push(`- **Estimate:** ${task.estimateMinutes}m (${hours}h)`);
  }

  // Checklist
  if (task.checklist && task.checklist.length > 0) {
    lines.push('\n### Checklist');
    for (const item of task.checklist) {
      lines.push(`- [${item.done ? 'x' : ' '}] ${item.text}`);
    }
  }

  // Notes
  if (task.notes?.trim()) {
    lines.push('\n### Task Notes');
    lines.push(task.notes.trim());
  }

  lines.push('</item_context>');
  return lines.join('\n');
}

/**
 * Serializes a ChangeRequest model into XML with structured markdown
 */
export function serializeChangeRequestContext(cr: ChangeRequest): string {
  const lines: string[] = [];
  lines.push(`<item_context type="cr" id="${cr.id}">`);
  lines.push(`## CR: ${cr.code} — ${cr.name}`);
  if (cr.description?.trim()) {
    lines.push(`**Description:** ${cr.description.trim()}`);
  }
  lines.push(`- **Type:** ${cr.type}`);
  lines.push(`- **Status:** ${cr.status}`);
  if (cr.jiraEpicKey) {
    lines.push(`- **Jira Epic:** ${cr.jiraEpicKey}`);
  }
  if (cr.opsOwners && cr.opsOwners.length > 0) {
    lines.push(`- **Ops Owners:** ${cr.opsOwners.join(', ')}`);
  }
  if (cr.businessAnalysts && cr.businessAnalysts.length > 0) {
    lines.push(`- **Business Analysts:** ${cr.businessAnalysts.join(', ')}`);
  }
  if (cr.deadline) {
    lines.push(`- **Deadline:** ${cr.deadline}`);
  }
  lines.push('</item_context>');
  return lines.join('\n');
}

/**
 * Serializes a System (subsystem) model into XML with structured markdown
 */
export function serializeSystemContext(system: System): string {
  const lines: string[] = [];
  lines.push(`<item_context type="system" id="${system.id}">`);
  lines.push(`## System: ${system.code} — ${system.name}`);
  if (system.description?.trim()) {
    lines.push(`**Description:** ${system.description.trim()}`);
  }
  lines.push(`- **Type:** ${system.type}`);
  if (system.parentId) {
    lines.push(`- **Parent System ID:** ${system.parentId}`);
  }
  if (system.remoteRepoPath) {
    lines.push(`- **Remote Repo Path:** ${system.remoteRepoPath}`);
  }
  lines.push('</item_context>');
  return lines.join('\n');
}

/**
 * Serializes a Document/Note model into XML with structured markdown and relevant snippet
 */
export function serializeDocumentContext(doc: Note, snippet?: string): string {
  const lines: string[] = [];
  lines.push(`<item_context type="document" id="${doc.id}">`);
  lines.push(`## Document: ${doc.title || 'Untitled Document'}`);
  if (doc.tags && doc.tags.length > 0) {
    lines.push(`- **Tags:** ${doc.tags.join(', ')}`);
  }
  if (doc.slug) {
    lines.push(`- **Slug:** ${doc.slug}`);
  }
  if (doc.updatedAt) {
    lines.push(`- **Updated:** ${doc.updatedAt}`);
  }

  const content = snippet?.trim() || doc.body?.trim();
  if (content) {
    lines.push('\n### Relevant Content');
    lines.push(content);
  }

  lines.push('</item_context>');
  return lines.join('\n');
}

export interface BuildItemContextPromptOptions {
  entityType: 'task' | 'cr' | 'system';
  item: Task | ChangeRequest | System;
  db?: TaskPlannerDatabase | undefined;
  fileReader?: ((filePath: string, maxLines?: number) => Promise<string | null>) | undefined;
  charLimit?: number | undefined;
}

/**
 * Builds comprehensive item context prompt with notes and document grounding
 * strictly clamped at charLimit (default 12,000 characters) per D-10 and T-13.2-06.
 */
export async function buildItemContextPrompt(options: BuildItemContextPromptOptions): Promise<string> {
  const {
    entityType,
    item,
    db = defaultDb,
    fileReader = defaultFileReader,
    charLimit = MAX_CONTEXT_CHAR_LIMIT,
  } = options;

  let baseXml = '';
  if (entityType === 'task') {
    baseXml = serializeTaskContext(item as Task);
  } else if (entityType === 'cr') {
    baseXml = serializeChangeRequestContext(item as ChangeRequest);
  } else {
    baseXml = serializeSystemContext(item as System);
  }

  // Strip closing tag to append additional sections before budget clamping
  const openTagMatch = baseXml.match(/^<item_context[^>]*>/);
  const openTag = openTagMatch ? openTagMatch[0] : `<item_context type="${entityType}" id="${item.id}">`;
  const innerContent = baseXml.replace(/^<item_context[^>]*>\n?/, '').replace(/\n?<\/item_context>$/, '');

  const sections: string[] = [innerContent];

  // Hierarchy relationships (targets & tasks for a CR, parent CR/subsystem for a task)
  try {
    if (entityType === 'cr' && db.tasks) {
      const cr = item as ChangeRequest;
      const targetSystems = db.systems
        ? (await db.systems.toArray()).filter((sys) => cr.targets.some((t) => t.systemId === sys.id))
        : [];
      if (targetSystems.length > 0) {
        sections.push(`### Target Subsystems (${targetSystems.length})`);
        for (const sys of targetSystems) {
          sections.push(`- [${sys.type}] **${sys.code}** ${sys.name}`);
        }
      } else {
        sections.push('### Target Subsystems: 0');
      }

      const tasks = await db.tasks.where('crId').equals(cr.id).toArray();
      const openTasks = tasks.filter((t) => t.status !== 'Done' && t.status !== 'Cancelled');
      sections.push(`### Tasks (${tasks.length} total, ${openTasks.length} open)`);
      for (const t of tasks) {
        const sysName = targetSystems.find((sys) => sys.id === t.systemId)?.name;
        sections.push(
          `- [${t.status}] [${t.priority}] **${t.name}** (${t.progress}%)${
            sysName ? ` [Subsystem: ${sysName}]` : ''
          }${t.deadline ? ` (Deadline: ${t.deadline})` : ''}${t.jiraKey ? ` [Jira: ${t.jiraKey}]` : ''}`
        );
      }
    } else if (entityType === 'system') {
      const system = item as System;
      if (system.parentId && db.systems) {
        const parent = await db.systems.get(system.parentId);
        if (parent) {
          sections.push(`- **Parent System:** ${parent.code} ${parent.name} (Type: ${parent.type})`);
        }
      }
      if (db.tasks) {
        const tasks = await db.tasks.where('systemId').equals(system.id).toArray();
        const openTasks = tasks.filter((t) => t.status !== 'Done' && t.status !== 'Cancelled');
        sections.push(`### Tasks in this Subsystem (${tasks.length} total, ${openTasks.length} open)`);
        for (const t of tasks) {
          sections.push(
            `- [${t.status}] [${t.priority}] **${t.name}** (${t.progress}%)${
              t.deadline ? ` (Deadline: ${t.deadline})` : ''
            }`
          );
        }
      }
    } else if (entityType === 'task') {
      const task = item as Task;
      if (task.crId && db.changeRequests) {
        const cr = await db.changeRequests.get(task.crId);
        if (cr) {
          sections.push(`- **CR:** ${cr.code} ${cr.name} (Type: ${cr.type}, Status: ${cr.status})`);
        }
      }
      if (task.systemId && db.systems) {
        const sys = await db.systems.get(task.systemId);
        if (sys) {
          sections.push(`- **Subsystem:** ${sys.code} ${sys.name} (Type: ${sys.type})`);
          if (sys.remoteRepoPath) {
            sections.push(`- **Remote Repo Path:** ${sys.remoteRepoPath}`);
          }
        }
      }
    }
  } catch (err) {
    console.warn('[contextGrounding] Failed to fetch hierarchy items:', err);
  }

  // 1. Attached Sticky Notes & Screenshot Captions
  try {
    const notes: Note[] = await db.notes
      .where('entityId')
      .equals(item.id)
      .filter((n) => n.entityType === entityType)
      .toArray();

    if (notes.length > 0) {
      sections.push('\n### Sticky Notes');
      for (const note of notes) {
        let noteStr = `#### ${note.title || 'Untitled Note'}${note.isPinned ? ' (Pinned)' : ''}\n${readNoteMarkdown(note.body)}`;
        // Query attachments
        const attachments: NoteAttachment[] = await db.noteAttachments
          .where('noteId')
          .equals(note.id)
          .toArray();

        if (attachments.length > 0) {
          const attStrs: string[] = [];
          for (const att of attachments) {
            if (att.caption?.trim()) {
              attStrs.push(`[Attachment: ${att.fileName} - Caption: ${att.caption.trim()}]`);
            } else {
              attStrs.push(`[Attachment: ${att.fileName}]`);
            }
          }
          noteStr += '\n' + attStrs.join('\n');
        }
        sections.push(noteStr);
      }
    }
  } catch (err) {
    console.warn('[contextGrounding] Failed to fetch notes for context prompt:', err);
  }

  // 2. Document Links & Local Files
  const docLinks = 'documentLinks' in item && Array.isArray(item.documentLinks) ? item.documentLinks : [];
  if (docLinks.length > 0) {
    sections.push('\n### Document & External Links');
    for (const link of docLinks) {
      const trimmed = link.trim();
      if (!trimmed) continue;

      if (isLocalPath(trimmed)) {
        const cleanPath = normalizeLocalPath(trimmed);
        if (isTextFile(cleanPath)) {
          // Attempt reading head
          let content: string | null = null;
          try {
            content = await fileReader(cleanPath, MAX_FILE_LINES_LIMIT);
          } catch {}

          if (content !== null && content !== undefined) {
            sections.push(`#### Local File: ${cleanPath}\n\`\`\`\n${content}\n\`\`\``);
          } else {
            sections.push(`- Local File: ${cleanPath} (Desktop file reference)`);
          }
        } else {
          sections.push(`- Local File: ${cleanPath} [Binary / non-text file]`);
        }
      } else {
        // Web URL metadata only (D-12)
        try {
          const parsed = new URL(trimmed);
          sections.push(`- External URL: ${trimmed} (Domain: ${parsed.hostname})`);
        } catch {
          sections.push(`- External URL: ${trimmed}`);
        }
      }
    }
  }

  // Assemble full text
  const combinedBody = sections.join('\n\n');
  const fullPrefix = `${openTag}\n`;
  const fullSuffix = '\n</item_context>';
  const effectiveLimit = Math.max(500, charLimit);
  const maxBodyLength = effectiveLimit - fullPrefix.length - fullSuffix.length;

  if (combinedBody.length <= maxBodyLength) {
    return `${fullPrefix}${combinedBody}${fullSuffix}`;
  }

  // Strict truncation clamping
  const formattedLimit = effectiveLimit.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const truncationNotice = `\n... [Truncated at ${formattedLimit} character limit]`;
  const allowedLength = maxBodyLength - truncationNotice.length;
  const clampedBody = combinedBody.slice(0, Math.max(0, allowedLength));

  return `${fullPrefix}${clampedBody}${truncationNotice}${fullSuffix}`;
}

/**
 * Builds high-level global context overview when AI chat is in global scope.
 */
export async function buildGlobalContextPrompt(db: TaskPlannerDatabase = defaultDb): Promise<string> {
  const sections: string[] = [
    '<global_context>',
    '## Workspace Overview',
  ];

  try {
    const changeRequests = db.changeRequests ? await db.changeRequests.toArray() : [];
    const openCrs = changeRequests.filter((c) => c.status !== 'Done' && c.status !== 'Cancelled');
    const tasks = db.tasks ? await db.tasks.toArray() : [];
    const openTasks = tasks.filter((t) => t.status !== 'Done' && t.status !== 'Cancelled');

    sections.push(`- **Change Requests:** ${changeRequests.length} total (${openCrs.length} active)`);
    sections.push(`- **Tasks:** ${tasks.length} total (${openTasks.length} open)`);

    if (changeRequests.length > 0) {
      sections.push('\n### Active Change Requests');
      for (const c of openCrs.slice(0, 10)) {
        const crTasks = tasks.filter((t) => t.crId === c.id);
        sections.push(
          `- **${c.code} ${c.name}** [${c.status}] (${crTasks.length} tasks)${
            c.deadline ? ` - Deadline: ${c.deadline}` : ''
          }`
        );
      }
    }
  } catch (err) {
    console.warn('[contextGrounding] Failed to fetch global context:', err);
  }

  sections.push('</global_context>');
  return sections.join('\n');
}

export interface ExtractedMentions {
  taskIds: string[];
  crIds: string[];
  systemIds: string[];
  filePaths: string[];
  docIds: string[];
}

/**
 * Extracts task, CR, system, file, and document entity references from text containing mentions.
 * Supports @[Task Name](task:<id>), #[CR Code](cr:<id>), #[System Code](system:<id>),
 * [file.txt](file:<path>), @file:<path>, @task:<id>, #cr:<id>, #system:<id>,
 * @doc:<id>, and @[Doc Title](doc:<id>).
 */
export function extractMentionedEntityIds(text: string): ExtractedMentions {
  const taskIds = new Set<string>();
  const crIds = new Set<string>();
  const systemIds = new Set<string>();
  const filePaths = new Set<string>();
  const docIds = new Set<string>();

  const taskRegex = /@?\[(?:[^\]]*)\]\(task:([a-zA-Z0-9_-]+)\)|@task:([a-zA-Z0-9_-]+)/g;
  let match: RegExpExecArray | null;
  while ((match = taskRegex.exec(text)) !== null) {
    const id = match[1] || match[2];
    if (id) taskIds.add(id);
  }

  const crRegex = /#?\[(?:[^\]]*)\]\(cr:([a-zA-Z0-9_-]+)\)|#cr:([a-zA-Z0-9_-]+)/g;
  while ((match = crRegex.exec(text)) !== null) {
    const id = match[1] || match[2];
    if (id) crIds.add(id);
  }

  const systemRegex = /#?\[(?:[^\]]*)\]\(system:([a-zA-Z0-9_-]+)\)|#system:([a-zA-Z0-9_-]+)/g;
  while ((match = systemRegex.exec(text)) !== null) {
    const id = match[1] || match[2];
    if (id) systemIds.add(id);
  }

  const fileRegex = /(?:@?\[(?:[^\]]*)\]\(file:([^)]+)\)|@file:([^\s]+))/g;
  while ((match = fileRegex.exec(text)) !== null) {
    const path = match[1] || match[2];
    if (path) filePaths.add(path.trim());
  }

  const docRegex = /@?\[(?:[^\]]*)\]\(doc:([a-zA-Z0-9_-]+)\)|@doc:([a-zA-Z0-9_-]+)/g;
  while ((match = docRegex.exec(text)) !== null) {
    const id = match[1] || match[2];
    if (id) docIds.add(id);
  }

  return {
    taskIds: Array.from(taskIds),
    crIds: Array.from(crIds),
    systemIds: Array.from(systemIds),
    filePaths: Array.from(filePaths),
    docIds: Array.from(docIds),
  };
}
