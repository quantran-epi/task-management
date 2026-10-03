import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import type { Task, Project, Milestone, Note, NoteAttachment } from '../../types/models';
import { isLocalPath, normalizeLocalPath } from '../../utils/documentLinks';
import { isTauriApp } from '../../utils/timerPopout';

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
 * Serializes a Project model into XML with structured markdown
 */
export function serializeProjectContext(project: Project): string {
  const lines: string[] = [];
  lines.push(`<item_context type="project" id="${project.id}">`);
  lines.push(`## Project: ${project.name}`);
  if (project.description?.trim()) {
    lines.push(`**Description:** ${project.description.trim()}`);
  }
  lines.push(`- **Status:** ${project.status}`);
  if (project.jiraEpicKey) {
    lines.push(`- **Jira Epic:** ${project.jiraEpicKey}`);
  }
  if (project.opsOwners && project.opsOwners.length > 0) {
    lines.push(`- **Ops Owners:** ${project.opsOwners.join(', ')}`);
  }
  if (project.businessAnalysts && project.businessAnalysts.length > 0) {
    lines.push(`- **Business Analysts:** ${project.businessAnalysts.join(', ')}`);
  }
  if (project.deadline) {
    lines.push(`- **Deadline:** ${project.deadline}`);
  }
  if (project.notes?.trim()) {
    lines.push('\n### Project Notes');
    lines.push(project.notes.trim());
  }
  lines.push('</item_context>');
  return lines.join('\n');
}

/**
 * Serializes a Milestone model into XML with structured markdown
 */
export function serializeMilestoneContext(milestone: Milestone): string {
  const lines: string[] = [];
  lines.push(`<item_context type="milestone" id="${milestone.id}">`);
  lines.push(`## Milestone: ${milestone.name}`);
  if (milestone.description?.trim()) {
    lines.push(`**Description:** ${milestone.description.trim()}`);
  }
  lines.push(`- **Status:** ${milestone.status}`);
  if (milestone.opsOwners && milestone.opsOwners.length > 0) {
    lines.push(`- **Ops Owners:** ${milestone.opsOwners.join(', ')}`);
  }
  if (milestone.businessAnalysts && milestone.businessAnalysts.length > 0) {
    lines.push(`- **Business Analysts:** ${milestone.businessAnalysts.join(', ')}`);
  }
  if (milestone.deadline) {
    lines.push(`- **Deadline:** ${milestone.deadline}`);
  }
  if (milestone.notes?.trim()) {
    lines.push('\n### Milestone Notes');
    lines.push(milestone.notes.trim());
  }
  lines.push('</item_context>');
  return lines.join('\n');
}

export interface BuildItemContextPromptOptions {
  entityType: 'task' | 'project' | 'milestone';
  item: Task | Project | Milestone;
  db?: TaskPlannerDatabase;
  fileReader?: (filePath: string, maxLines?: number) => Promise<string | null>;
}

/**
 * Builds comprehensive item context prompt with notes and document grounding
 * strictly clamped at 12,000 characters per D-10 and T-13.2-06.
 */
export async function buildItemContextPrompt(options: BuildItemContextPromptOptions): Promise<string> {
  const { entityType, item, db = defaultDb, fileReader = defaultFileReader } = options;

  let baseXml = '';
  if (entityType === 'task') {
    baseXml = serializeTaskContext(item as Task);
  } else if (entityType === 'project') {
    baseXml = serializeProjectContext(item as Project);
  } else {
    baseXml = serializeMilestoneContext(item as Milestone);
  }

  // Strip closing tag to append additional sections before budget clamping
  const openTagMatch = baseXml.match(/^<item_context[^>]*>/);
  const openTag = openTagMatch ? openTagMatch[0] : `<item_context type="${entityType}" id="${item.id}">`;
  const innerContent = baseXml.replace(/^<item_context[^>]*>\n?/, '').replace(/\n?<\/item_context>$/, '');

  const sections: string[] = [innerContent];

  // Hierarchy relationships (child milestones & tasks for projects, parent for tasks/milestones)
  try {
    if (entityType === 'project' && db.milestones && db.tasks) {
      const milestones = await db.milestones.where('projectId').equals(item.id).toArray();
      if (milestones.length > 0) {
        sections.push(`### Milestones (${milestones.length})`);
        for (const ms of milestones) {
          sections.push(`- [${ms.status}] **${ms.name}**${ms.deadline ? ` (Deadline: ${ms.deadline})` : ''}`);
        }
      } else {
        sections.push('### Milestones: 0');
      }

      const tasks = await db.tasks.where('projectId').equals(item.id).toArray();
      const openTasks = tasks.filter((t) => t.status !== 'Done' && t.status !== 'Cancelled');
      sections.push(`### Tasks (${tasks.length} total, ${openTasks.length} open)`);
      for (const t of tasks) {
        const msName = milestones.find((m) => m.id === t.milestoneId)?.name;
        sections.push(
          `- [${t.status}] [${t.priority}] **${t.name}** (${t.progress}%)${
            msName ? ` [Milestone: ${msName}]` : ''
          }${t.deadline ? ` (Deadline: ${t.deadline})` : ''}${t.jiraKey ? ` [Jira: ${t.jiraKey}]` : ''}`
        );
      }
    } else if (entityType === 'milestone') {
      const milestone = item as Milestone;
      if (milestone.projectId && db.projects) {
        const proj = await db.projects.get(milestone.projectId);
        if (proj) {
          sections.push(`- **Parent Project:** ${proj.name} (Status: ${proj.status})`);
        }
      }
      if (db.tasks) {
        const tasks = await db.tasks.where('milestoneId').equals(milestone.id).toArray();
        const openTasks = tasks.filter((t) => t.status !== 'Done' && t.status !== 'Cancelled');
        sections.push(`### Tasks in this Milestone (${tasks.length} total, ${openTasks.length} open)`);
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
      if (task.projectId && db.projects) {
        const proj = await db.projects.get(task.projectId);
        if (proj) {
          sections.push(`- **Project:** ${proj.name}`);
        }
      }
      if (task.milestoneId && db.milestones) {
        const ms = await db.milestones.get(task.milestoneId);
        if (ms) {
          sections.push(`- **Milestone:** ${ms.name}`);
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
        let noteStr = `#### ${note.title || 'Untitled Note'}${note.isPinned ? ' (Pinned)' : ''}\n${note.body}`;
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
  const maxBodyLength = MAX_CONTEXT_CHAR_LIMIT - fullPrefix.length - fullSuffix.length;

  if (combinedBody.length <= maxBodyLength) {
    return `${fullPrefix}${combinedBody}${fullSuffix}`;
  }

  // Strict truncation clamping
  const truncationNotice = '\n... [Truncated at 12,000 character limit]';
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
    const projects = db.projects ? await db.projects.toArray() : [];
    const openProjects = projects.filter((p) => p.status !== 'Done' && p.status !== 'Cancelled');
    const tasks = db.tasks ? await db.tasks.toArray() : [];
    const openTasks = tasks.filter((t) => t.status !== 'Done' && t.status !== 'Cancelled');

    sections.push(`- **Projects:** ${projects.length} total (${openProjects.length} active)`);
    sections.push(`- **Tasks:** ${tasks.length} total (${openTasks.length} open)`);

    if (projects.length > 0) {
      sections.push('\n### Active Projects');
      for (const p of openProjects.slice(0, 10)) {
        const pTasks = tasks.filter((t) => t.projectId === p.id);
        sections.push(
          `- **${p.name}** [${p.status}] (${pTasks.length} tasks)${
            p.deadline ? ` - Deadline: ${p.deadline}` : ''
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
  projectIds: string[];
}

/**
 * Extracts task and project entity IDs from text containing mentions.
 * Supports @[Task Name](task:<id>), #[Project Name](project:<id>),
 * @task:<id>, and #project:<id>.
 */
export function extractMentionedEntityIds(text: string): ExtractedMentions {
  const taskIds = new Set<string>();
  const projectIds = new Set<string>();

  const taskRegex = /@\[(?:[^\]]*)\]\(task:([a-zA-Z0-9_-]+)\)|@task:([a-zA-Z0-9_-]+)/g;
  let match: RegExpExecArray | null;
  while ((match = taskRegex.exec(text)) !== null) {
    const id = match[1] || match[2];
    if (id) taskIds.add(id);
  }

  const projRegex = /#\[(?:[^\]]*)\]\(project:([a-zA-Z0-9_-]+)\)|#project:([a-zA-Z0-9_-]+)/g;
  while ((match = projRegex.exec(text)) !== null) {
    const id = match[1] || match[2];
    if (id) projectIds.add(id);
  }

  return {
    taskIds: Array.from(taskIds),
    projectIds: Array.from(projectIds),
  };
}
