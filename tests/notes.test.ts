import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../src/db';
import {
  createNote,
  updateNote,
  deleteNote,
  getNoteWithAttachments,
  getNotesForEntity,
} from '../src/db/repositories/noteRepo';
import {
  deleteTaskWithAllocations,
  deleteMilestoneWithCascade,
  deleteProjectWithCascade,
} from '../src/db/repositories/cascadeRepo';
import { renderSafeMarkdown } from '../src/utils/markdown';

describe('Note Repository & Safe Markdown & Cascade Detach', () => {
  beforeEach(async () => {
    await db.notes.clear();
    await db.noteAttachments.clear();
    await db.tasks.clear();
    await db.milestones.clear();
    await db.projects.clear();
  });

  describe('renderSafeMarkdown', () => {
    it('escapes raw HTML entities while rendering headings, bold, italic, checklists, and code', () => {
      const input = `# Tiêu đề 1
## Tiêu đề 2
**in đậm** và *in nghiêng*
\`const x = 10;\`
- [ ] Chưa làm
- [x] Đã làm
<script>alert('xss')</script>
<img src="x" onerror="alert(1)">
[Trang chủ](https://example.com)
[Mã độc](javascript:alert('malicious'))`;

      const rendered = renderSafeMarkdown(input);

      // Verify no raw script or unescaped HTML tags
      expect(rendered).not.toContain('<script>');
      expect(rendered).not.toContain('<img');
      expect(rendered).toContain('&lt;script&gt;');
      expect(rendered).toContain('&lt;img');

      // Verify markdown transformations
      expect(rendered).toContain('<h1>Tiêu đề 1</h1>');
      expect(rendered).toContain('<h2>Tiêu đề 2</h2>');
      expect(rendered).toContain('<strong>in đậm</strong>');
      expect(rendered).toContain('<em>in nghiêng</em>');
      expect(rendered).toContain('<code>const x = 10;</code>');
      expect(rendered).toContain('type="checkbox"');
      expect(rendered).toContain('rel="noopener noreferrer"');
      expect(rendered).toContain('href="https://example.com"');

      // Verify dangerous javascript: links are neutralised
      expect(rendered).not.toContain('href="javascript:');
    });
  });

  describe('createNote & updateNote & deleteNote CRUD', () => {
    it('creates and updates notes correctly', async () => {
      const note = await createNote({
        title: 'Ghi chú thử nghiệm',
        body: 'Nội dung ghi chú đầu tiên',
        isPinned: true,
      });

      expect(note.id).toBeDefined();
      expect(note.title).toBe('Ghi chú thử nghiệm');
      expect(note.body).toBe('Nội dung ghi chú đầu tiên');
      expect(note.isPinned).toBe(true);

      const fetched = await getNoteWithAttachments(note.id);
      expect(fetched?.note.id).toBe(note.id);
      expect(fetched?.attachments).toHaveLength(0);

      const updated = await updateNote(note.id, {
        body: 'Nội dung đã sửa',
        isPinned: false,
      });

      expect(updated?.body).toBe('Nội dung đã sửa');
      expect(updated?.isPinned).toBe(false);

      await deleteNote(note.id);
      const afterDelete = await getNoteWithAttachments(note.id);
      expect(afterDelete).toBeNull();
    });

    it('retrieves notes for specific entity', async () => {
      const taskId = '00000000-0000-4000-8000-000000000001';
      await createNote({
        entityType: 'task',
        entityId: taskId,
        body: 'Note for task',
      });
      await createNote({
        entityType: 'task',
        entityId: taskId,
        body: 'Second note for task',
        isPinned: true,
      });
      await createNote({
        body: 'Standalone note',
      });

      const taskNotes = await getNotesForEntity('task', taskId);
      expect(taskNotes).toHaveLength(2);
      expect(taskNotes[0]?.isPinned).toBe(true); // Pinned notes first
    });
  });

  describe('Cascade entity detachment (D-25)', () => {
    it('detaches notes to standalone when task is deleted', async () => {
      const taskId = '00000000-0000-4000-8000-000000000002';
      await db.tasks.add({
        id: taskId,
        name: 'Task with attached note',
        status: 'Open',
        priority: 'Medium',
        progress: 0,
        estimateMinutes: 60,
        reminders: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const note = await createNote({
        entityType: 'task',
        entityId: taskId,
        title: 'Tác vụ note',
        body: 'Attached to task',
      });

      // Delete task with cascade
      await deleteTaskWithAllocations(taskId);

      // Verify task deleted
      const taskInDb = await db.tasks.get(taskId);
      expect(taskInDb).toBeUndefined();

      // Verify note detached to standalone, not deleted
      const noteInDb = await db.notes.get(note.id);
      expect(noteInDb).toBeDefined();
      expect(noteInDb?.entityType).toBeUndefined();
      expect(noteInDb?.entityId).toBeUndefined();
      expect(noteInDb?.body).toBe('Attached to task');
    });

    it('detaches notes to standalone when milestone is deleted', async () => {
      const milestoneId = '00000000-0000-4000-8000-000000000003';
      const projectId = '00000000-0000-4000-8000-000000000004';
      await db.milestones.add({
        id: milestoneId,
        projectId,
        name: 'Milestone 1',
        status: 'Open',
        reminders: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const note = await createNote({
        entityType: 'milestone',
        entityId: milestoneId,
        body: 'Attached to milestone',
      });

      await deleteMilestoneWithCascade(milestoneId, 'cascade');

      const noteInDb = await db.notes.get(note.id);
      expect(noteInDb).toBeDefined();
      expect(noteInDb?.entityType).toBeUndefined();
      expect(noteInDb?.entityId).toBeUndefined();
    });

    it('detaches notes to standalone when project is deleted', async () => {
      const projectId = '00000000-0000-4000-8000-000000000005';
      await db.projects.add({
        id: projectId,
        name: 'Project 1',
        status: 'Open',
        reminders: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const note = await createNote({
        entityType: 'project',
        entityId: projectId,
        body: 'Attached to project',
      });

      await deleteProjectWithCascade(projectId, 'cascade');

      const noteInDb = await db.notes.get(note.id);
      expect(noteInDb).toBeDefined();
      expect(noteInDb?.entityType).toBeUndefined();
      expect(noteInDb?.entityId).toBeUndefined();
    });
  });
});
