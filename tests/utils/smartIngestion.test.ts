import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { TaskPlannerDatabase } from '../../src/db';
import {
  extractMarkdownMetadata,
  detectReferencedEntities,
  isPlaceholderTitle,
} from '../../src/utils/smartIngestion';
import {
  linkEntitiesToDoc,
  unlinkEntityFromDoc,
  getBacklinksForDoc,
} from '../../src/db/repositories/documentLinkRepo';
import type { ChangeRequest, System, Task } from '../../src/types/models';

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

    it('extracts H1 headings with formatting or no space after # and cleans title', () => {
      const markdown1 = '#**Thiết kế Database**\n\nNội dung chi tiết';
      expect(extractMarkdownMetadata(markdown1).title).toBe('Thiết kế Database');

      const markdown2 = '# Tài liệu Hướng dẫn #\n\nNội dung';
      expect(extractMarkdownMetadata(markdown2).title).toBe('Tài liệu Hướng dẫn');
    });

    it('correctly identifies placeholder titles', () => {
      expect(isPlaceholderTitle('')).toBe(true);
      expect(isPlaceholderTitle(null)).toBe(true);
      expect(isPlaceholderTitle('   ')).toBe(true);
      expect(isPlaceholderTitle('Tài liệu mới')).toBe(true);
      expect(isPlaceholderTitle('tài liệu không có tiêu đề')).toBe(true);
      expect(isPlaceholderTitle('Untitled')).toBe(true);
      expect(isPlaceholderTitle('New Document')).toBe(true);
      expect(isPlaceholderTitle('Kiến trúc Microservices')).toBe(false);
    });
  });

  describe('detectReferencedEntities', () => {
    const mockTasks: Task[] = [
      {
        id: 'task-1',
        crId: 'cr-seed',
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
        crId: 'cr-seed',
        name: 'Tối ưu hoá database query',
        status: 'Open',
        progress: 0,
        priority: 'High',
        estimateMinutes: 120,
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
      },
    ];

    const mockChangeRequests: ChangeRequest[] = [
      {
        id: 'cr-1',
        code: 'CR-2026-001',
        name: 'Core Banking Replatform',
        status: 'Open',
        type: 'NEW_FEATURE',
        targets: [{ systemId: 'sys-1' }],
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
      },
    ];

    const mockSystems: System[] = [
      {
        id: 'sys-1',
        code: 'CORE_SVC',
        name: 'Giai đoạn 1 MVP',
        parentId: null,
        type: 'SERVICE',
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
      },
    ];

    it('detects Jira issue keys matching regex', () => {
      const markdown = 'Tài liệu liên quan đến ticket PROJ-101 và SHB-9999.';
      const detected = detectReferencedEntities(markdown, mockTasks, mockChangeRequests, mockSystems);
      const matchedJira = detected.find((d) => d.id === 'task-1');
      expect(matchedJira).toBeDefined();
      expect(matchedJira?.type).toBe('task');
      expect(matchedJira?.matchReason).toContain('Jira PROJ-101');
    });

    it('matches task and CR titles present in markdown body', () => {
      const markdown = 'Cần làm cho Core Banking Replatform, đặc biệt là Tối ưu hoá database query.';
      const detected = detectReferencedEntities(markdown, mockTasks, mockChangeRequests, mockSystems);
      expect(detected.some((d) => d.id === 'cr-1' && d.type === 'cr')).toBe(true);
      expect(detected.some((d) => d.id === 'task-2' && d.type === 'task')).toBe(true);
    });

    it('matches a CR by its code and a subsystem by its code', () => {
      const markdown = 'Theo CR-2026-001 thì CORE_SVC cần đổi.';
      const detected = detectReferencedEntities(markdown, [], mockChangeRequests, mockSystems);
      expect(detected.some((d) => d.id === 'cr-1' && d.type === 'cr')).toBe(true);
      expect(detected.some((d) => d.id === 'sys-1' && d.type === 'system')).toBe(true);
    });

    it('does not falsely match short CR names (e.g. MPA) inside arbitrary words like company or impact', () => {
      const crsWithMPA: ChangeRequest[] = [
        ...mockChangeRequests,
        {
          id: 'cr-mpa',
          code: 'CR-MPA',
          name: 'MPA',
          status: 'Open',
          type: 'ENHANCEMENT',
          targets: [],
          createdAt: '2026-10-01T00:00:00Z',
          updatedAt: '2026-10-01T00:00:00Z',
        },
      ];

      // Contains "company", "campaign", "impact", "compact" — all contain "mpa" as substring
      const unrelatedText = 'Our company launched an advertising campaign that had tremendous impact on compact devices.';
      const detectedFalse = detectReferencedEntities(unrelatedText, mockTasks, crsWithMPA, mockSystems);
      expect(detectedFalse.some((d) => d.id === 'cr-mpa')).toBe(false);

      // Distinct word MPA should match
      const relatedText = 'Họp kỹ thuật dự án MPA với team frontend.';
      const detectedTrue = detectReferencedEntities(relatedText, mockTasks, crsWithMPA, mockSystems);
      expect(detectedTrue.some((d) => d.id === 'cr-mpa')).toBe(true);
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
      crId: 'cr-1',
      name: 'Task 1',
      notes: 'Ghi chú task 1',
      status: 'Open',
      progress: 0,
      priority: 'Medium',
      estimateMinutes: 30,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    });

    await db.changeRequests.add({
      id: 'cr-1',
      code: 'CR-1',
      name: 'CR 1',
      status: 'Open',
      type: 'NEW_FEATURE',
      targets: [],
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
        id: 'cr-1',
        type: 'cr' as const,
        title: 'CR 1',
        matchReason: 'matched title',
        matchedText: 'CR 1',
      },
    ];

    await linkEntitiesToDoc(docId, docTitle, selectedEntities, db);

    // Check task has doc wiki-link and documentLinks entry
    const updatedTask = await db.tasks.get('task-1');
    expect(updatedTask?.notes).toContain(`[[doc:${docId}|${docTitle}]]`);
    expect(updatedTask?.documentLinks).toContain(docId);

    // Check CR has a documentLinks entry
    const updatedCr = await db.changeRequests.get('cr-1');
    expect(updatedCr?.documentLinks).toContain(docId);

    // Check document body has references to task and CR
    const updatedDoc = await db.notes.get(docId);
    expect(updatedDoc?.body).toContain(`[[task:task-1|Task 1]]`);
    expect(updatedDoc?.body).toContain(`[[cr:cr-1|CR 1]]`);
  });

  it('getBacklinksForDoc returns all tasks, CRs, and notes referencing target doc ID', async () => {
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
      crId: 'cr-ref',
      name: 'Referencing Task',
      notes: `Refer to [[doc:${docId}|Target Doc]]`,
      status: 'Open',
      progress: 0,
      priority: 'High',
      estimateMinutes: 45,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    });

    await db.changeRequests.add({
      id: 'p-ref',
      code: 'CR-REF',
      name: 'Referencing CR',
      status: 'Open',
      type: 'ENHANCEMENT',
      targets: [],
      documentLinks: [docId],
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
    expect(backlinks.changeRequests.map((cr) => cr.id)).toEqual(['p-ref']);
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
      crId: 'cr-u',
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
