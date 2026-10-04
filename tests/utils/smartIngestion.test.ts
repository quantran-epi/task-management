import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { TaskPlannerDatabase } from '../../src/db';
import {
  extractMarkdownMetadata,
  detectReferencedEntities,
} from '../../src/utils/smartIngestion';
import {
  linkEntitiesToDoc,
  unlinkEntityFromDoc,
  getBacklinksForDoc,
} from '../../src/db/repositories/documentLinkRepo';
import type { Task, Project, Milestone } from '../../src/types/models';

describe('smartIngestion utils', () => {
  describe('extractMarkdownMetadata', () => {
    it('extracts the first H1 line as title and leaves clean body', () => {
      const markdown = '# Kiến trúc hệ thống\n\nNội dung tài liệu ở đây.';
      const result = extractMarkdownMetadata(markdown);
      expect(result.title).toBe('Kiến trúc hệ thống');
      expect(result.tags).toEqual([]);
      expect(result.cleanBody).toContain('Nội dung tài liệu ở đây.');
    });

    it('extracts inline hashtags as tags while ignoring markdown headings', () => {
      const markdown = '# Tài liệu API\n\nĐây là tài liệu về #backend và #auth_v2.\n## Section con không phải tag\nThêm tag #microservice-core';
      const result = extractMarkdownMetadata(markdown);
      expect(result.title).toBe('Tài liệu API');
      expect(result.tags).toEqual(['backend', 'auth_v2', 'microservice-core']);
    });

    it('handles markdown without headings gracefully', () => {
      const markdown = 'Chỉ có nội dung không có tiêu đề H1. Nhưng có #notes.';
      const result = extractMarkdownMetadata(markdown);
      expect(result.title).toBeUndefined();
      expect(result.tags).toEqual(['notes']);
    });
  });

  describe('detectReferencedEntities', () => {
    const mockTasks: Task[] = [
      {
        id: 'task-1',
        name: 'Viết unit test cho auth',
        jiraKey: 'PROJ-101',
        status: 'Open',
        progress: 0,
        priority: 'Medium',
        estimateMinutes: 60,
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
      },
      {
        id: 'task-2',
        name: 'Tối ưu hoá database query',
        status: 'Open',
        progress: 0,
        priority: 'High',
        estimateMinutes: 120,
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
      },
    ];

    const mockProjects: Project[] = [
      {
        id: 'proj-1',
        name: 'Core Banking Replatform',
        status: 'Open',
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
      },
    ];

    const mockMilestones: Milestone[] = [
      {
        id: 'ms-1',
        projectId: 'proj-1',
        name: 'Giai đoạn 1 MVP',
        status: 'Open',
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
      },
    ];

    it('detects Jira issue keys matching regex', () => {
      const markdown = 'Tài liệu liên quan đến ticket PROJ-101 và SHB-9999.';
      const detected = detectReferencedEntities(markdown, mockTasks, mockProjects, mockMilestones);
      const matchedJira = detected.find((d) => d.id === 'task-1');
      expect(matchedJira).toBeDefined();
      expect(matchedJira?.type).toBe('task');
      expect(matchedJira?.matchReason).toContain('Jira PROJ-101');
    });

    it('matches task and project titles present in markdown body', () => {
      const markdown = 'Cần làm cho Core Banking Replatform, đặc biệt là Tối ưu hoá database query.';
      const detected = detectReferencedEntities(markdown, mockTasks, mockProjects, mockMilestones);
      expect(detected.some((d) => d.id === 'proj-1' && d.type === 'project')).toBe(true);
      expect(detected.some((d) => d.id === 'task-2' && d.type === 'task')).toBe(true);
    });
  });
});

describe('documentLinkRepo bidirectional links and backlinks', () => {
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    db = new TaskPlannerDatabase(`test-doc-links-${Date.now()}-${Math.random()}`);
    await db.open();
  });

  it('linkEntitiesToDoc writes bidirectional links inside a Dexie transaction', async () => {
    const docId = 'doc-100';
    const docTitle = 'Tài liệu Kiến trúc';

    await db.notes.add({
      id: docId,
      title: docTitle,
      type: 'document',
      body: '# Tài liệu Kiến trúc\nNội dung ban đầu',
      isPinned: false,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    });

    await db.tasks.add({
      id: 'task-1',
      name: 'Task 1',
      notes: 'Ghi chú task 1',
      status: 'Open',
      progress: 0,
      priority: 'Medium',
      estimateMinutes: 30,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    });

    await db.projects.add({
      id: 'proj-1',
      name: 'Project 1',
      status: 'Open',
      notes: '',
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    });

    const selectedEntities = [
      {
        id: 'task-1',
        type: 'task' as const,
        title: 'Task 1',
        matchReason: 'matched title',
        matchedText: 'Task 1',
      },
      {
        id: 'proj-1',
        type: 'project' as const,
        title: 'Project 1',
        matchReason: 'matched title',
        matchedText: 'Project 1',
      },
    ];

    await linkEntitiesToDoc(docId, docTitle, selectedEntities, db);

    // Check task has doc wiki-link and documentLinks entry
    const updatedTask = await db.tasks.get('task-1');
    expect(updatedTask?.notes).toContain(`[[doc:${docId}|${docTitle}]]`);
    expect(updatedTask?.documentLinks).toContain(docId);

    // Check project has doc wiki-link
    const updatedProj = await db.projects.get('proj-1');
    expect(updatedProj?.notes).toContain(`[[doc:${docId}|${docTitle}]]`);

    // Check document body has references to task and project
    const updatedDoc = await db.notes.get(docId);
    expect(updatedDoc?.body).toContain(`[[task:task-1|Task 1]]`);
    expect(updatedDoc?.body).toContain(`[[project:proj-1|Project 1]]`);
  });

  it('getBacklinksForDoc returns all tasks, projects, and notes referencing target doc ID', async () => {
    const docId = 'target-doc';

    await db.notes.add({
      id: docId,
      title: 'Target Doc',
      type: 'document',
      body: 'Content',
      isPinned: false,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    });

    await db.tasks.add({
      id: 't-ref',
      name: 'Referencing Task',
      notes: `Refer to [[doc:${docId}|Target Doc]]`,
      status: 'Open',
      progress: 0,
      priority: 'High',
      estimateMinutes: 45,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    });

    await db.projects.add({
      id: 'p-ref',
      name: 'Referencing Project',
      status: 'Open',
      notes: `See [[doc:${docId}]]`,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    });

    await db.notes.add({
      id: 'note-ref',
      title: 'Sibling Doc',
      type: 'document',
      body: `Mentioning [[doc:${docId}|Target Doc]]`,
      isPinned: false,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    });

    const backlinks = await getBacklinksForDoc(docId, db);
    expect(backlinks.tasks.map((t) => t.id)).toEqual(['t-ref']);
    expect(backlinks.projects.map((p) => p.id)).toEqual(['p-ref']);
    expect(backlinks.referencingNotes.map((n) => n.id)).toEqual(['note-ref']);
  });

  it('unlinkEntityFromDoc removes referencing links from both sides', async () => {
    const docId = 'doc-unlink';
    const docTitle = 'Unlink Doc';

    await db.notes.add({
      id: docId,
      title: docTitle,
      type: 'document',
      body: `Doc body with [[task:task-u|Task U]] inside`,
      isPinned: false,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    });

    await db.tasks.add({
      id: 'task-u',
      name: 'Task U',
      notes: `Note with [[doc:${docId}|${docTitle}]]`,
      documentLinks: [docId],
      status: 'Open',
      progress: 0,
      priority: 'Low',
      estimateMinutes: 20,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    });

    await unlinkEntityFromDoc(docId, 'task', 'task-u', db);

    const updatedTask = await db.tasks.get('task-u');
    expect(updatedTask?.notes).not.toContain(`[[doc:${docId}`);
    expect(updatedTask?.documentLinks).toEqual([]);

    const updatedDoc = await db.notes.get(docId);
    expect(updatedDoc?.body).not.toContain('[[task:task-u');
  });
});
