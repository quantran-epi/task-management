import type { Task, Project, Milestone } from '../types/models';

export interface ExtractedMarkdownMetadata {
  title?: string | undefined;
  tags: string[];
  cleanBody: string;
}

export interface DetectedEntity {
  id: string;
  type: 'task' | 'project' | 'milestone';
  title: string;
  matchReason: string;
  matchedText: string;
}

/**
 * Checks whether a document title is considered an empty or default placeholder
 * (e.g. "Tài liệu mới", "Untitled", "New Document").
 */
export function isPlaceholderTitle(title?: string | null): boolean {
  if (!title || !title.trim()) return true;
  const lower = title.trim().toLowerCase();
  return [
    'tài liệu mới',
    'tài liệu không có tiêu đề',
    'không có tiêu đề',
    'untitled',
    'untitled document',
    'new document',
    'new doc',
  ].includes(lower);
}

/**
 * Extracts first `# Heading` line as document title and extracts inline `#tag` tokens.
 * Ignores markdown headings (`# `, `## `, etc.) when collecting tags.
 * Bounded input slicing avoids potential ReDoS on huge pastes (T-14-04).
 */
export function extractMarkdownMetadata(markdown: string): ExtractedMarkdownMetadata {
  if (!markdown) {
    return { tags: [], cleanBody: '' };
  }

  // Cap initial scanning window for heading to prevent ReDoS on massive files
  const lines = markdown.split(/\r?\n/);
  let title: string | undefined;
  const tagsSet = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i] ?? '';
    const trimmed = rawLine.trim();

    // 1. Detect first H1 heading (# Title or #Title with optional trailing #)
    if (!title && /^#(?![#])\s*(.*)$/.test(trimmed)) {
      const match = trimmed.match(/^#\s*(.*?)(?:\s*#+)?$/);
      if (match && match[1]) {
        const cleanTitle = match[1].replace(/[*_`~]/g, '').trim();
        if (cleanTitle) {
          title = cleanTitle;
        }
      }
      continue;
    }

    // 2. Ignore lines that are headings (#, ##, ###, ...) from tag extraction
    if (/^#{1,6}\s+/.test(trimmed)) {
      continue;
    }

    // 3. Extract inline hashtags (#tag) using Unicode letter/number support
    // Must be preceded by space or line start, followed by alphanumeric/underscore/unicode letters
    const tagMatches = rawLine.matchAll(/(?:^|\s)#([a-zA-Z0-9_\p{L}]+(?:-[a-zA-Z0-9_\p{L}]+)*)/gu);
    for (const m of tagMatches) {
      const tag = m[1]?.trim();
      if (tag && tag.length > 0 && tag.length <= 50) {
        tagsSet.add(tag);
      }
    }
  }

  return {
    ...(title ? { title } : {}),
    tags: Array.from(tagsSet),
    cleanBody: markdown,
  };
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Checks whether a phrase occurs in text as a distinct word or boundary-delimited phrase,
 * preventing false substring matches (e.g. project "MPA" matching inside "company" or "impact").
 */
export function matchesWholePhrase(text: string, phrase: string): boolean {
  const trimmed = phrase.trim();
  if (!trimmed || !text) return false;
  const escaped = escapeRegex(trimmed);
  try {
    return new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, 'iu').test(text);
  } catch {
    return text.toLowerCase().includes(trimmed.toLowerCase());
  }
}

/**
 * Detects referenced tasks, projects, and milestones from markdown content per D-06:
 * - Jira issue keys (`[A-Z][A-Z0-9]+-[0-9]+`) matching task.jiraKey or name
 * - Known Task titles (whole-phrase matched)
 * - Known Project titles (whole-phrase matched)
 * - Known Milestone titles (whole-phrase matched)
 */
export function detectReferencedEntities(
  markdown: string,
  tasks: Task[] = [],
  projects: Project[] = [],
  milestones: Milestone[] = []
): DetectedEntity[] {
  if (!markdown || !markdown.trim()) return [];

  const detected: DetectedEntity[] = [];
  const seenEntityIds = new Set<string>();

  // 1. Scan for Jira issue keys (e.g. PROJ-123, SHB-4567)
  const jiraKeyRegex = /\b([A-Z][A-Z0-9]+-[0-9]+)\b/g;
  const jiraMatches = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = jiraKeyRegex.exec(markdown)) !== null) {
    if (match[1]) {
      jiraMatches.add(match[1]);
    }
  }

  if (jiraMatches.size > 0) {
    for (const task of tasks) {
      if (task.jiraKey && jiraMatches.has(task.jiraKey)) {
        if (!seenEntityIds.has(task.id)) {
          seenEntityIds.add(task.id);
          detected.push({
            id: task.id,
            type: 'task',
            title: task.name,
            matchReason: `Khớp Jira ${task.jiraKey}`,
            matchedText: task.jiraKey,
          });
        }
      }
    }
  }

  // 2. Scan for Project names (whole phrase)
  for (const proj of projects) {
    const projName = proj.name.trim();
    if (projName.length >= 3 && matchesWholePhrase(markdown, projName)) {
      if (!seenEntityIds.has(proj.id)) {
        seenEntityIds.add(proj.id);
        detected.push({
          id: proj.id,
          type: 'project',
          title: proj.name,
          matchReason: 'Khớp tên dự án',
          matchedText: proj.name,
        });
      }
    }
  }

  // 3. Scan for Milestone names (whole phrase)
  for (const ms of milestones) {
    const msName = ms.name.trim();
    if (msName.length >= 3 && matchesWholePhrase(markdown, msName)) {
      if (!seenEntityIds.has(ms.id)) {
        seenEntityIds.add(ms.id);
        detected.push({
          id: ms.id,
          type: 'milestone',
          title: ms.name,
          matchReason: 'Khớp tên cột mốc',
          matchedText: ms.name,
        });
      }
    }
  }

  // 4. Scan for Task names (whole phrase)
  for (const task of tasks) {
    const taskName = task.name.trim();
    if (taskName.length >= 4 && matchesWholePhrase(markdown, taskName)) {
      if (!seenEntityIds.has(task.id)) {
        seenEntityIds.add(task.id);
        detected.push({
          id: task.id,
          type: 'task',
          title: task.name,
          matchReason: 'Khớp tên tác vụ',
          matchedText: task.name,
        });
      }
    }
  }

  return detected;
}
