// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest';
import Dexie from 'dexie';
import { SCHEMA_V6 } from '../src/db/schema';
import { TaskPlannerDatabase } from '../src/db/index';
import { TimerSegmentSchema, NoteSchema, NoteAttachmentSchema } from '../src/validation/schemas';
import type { TimerSegment, Note, NoteAttachment } from '../src/types/models';

describe('Timer Segments and Schema V7 Migration (Task 1)', () => {
  const dbName = 'TestMigrationV7DB_' + Math.random().toString(36).slice(2);

  afterEach(async () => {
    await Dexie.delete(dbName);
  });

  it('validates TimerSegment, Note, and NoteAttachment Zod schemas', () => {
    const validSegment: TimerSegment = {
      startTime: '2026-10-01T09:00:00.000Z',
      endTime: '2026-10-01T09:45:00.000Z',
    };
    expect(TimerSegmentSchema.parse(validSegment)).toEqual(validSegment);

    const openSegment: TimerSegment = {
      startTime: '2026-10-01T10:00:00.000Z',
    };
    expect(TimerSegmentSchema.parse(openSegment)).toEqual(openSegment);

    // Invalid segment (endTime before startTime)
    expect(() =>
      TimerSegmentSchema.parse({
        startTime: '2026-10-01T10:00:00.000Z',
        endTime: '2026-10-01T09:00:00.000Z',
      })
    ).toThrow();

    // Note schema
    const validNote: Note = {
      id: '11111111-1111-4111-8111-111111111111',
      title: 'Sprint Notes',
      body: 'Important discussion items',
      isPinned: true,
      createdAt: '2026-10-01T08:00:00.000Z',
      updatedAt: '2026-10-01T08:30:00.000Z',
    };
    expect(NoteSchema.parse(validNote)).toEqual(validNote);

    // NoteAttachment schema
    const validAttachment: Omit<NoteAttachment, 'data'> = {
      id: '22222222-2222-4222-8222-222222222222',
      noteId: '11111111-1111-4111-8111-111111111111',
      fileName: 'architecture.png',
      mimeType: 'image/png',
      sizeBytes: 1024,
      createdAt: '2026-10-01T08:00:00.000Z',
    };
    expect(NoteAttachmentSchema.parse(validAttachment)).toEqual(validAttachment);
  });

  it('migrates v6 database to v7, adding notes and noteAttachments stores, and populating segments for legacy activeTimers and workSessions', async () => {
    // 1. Create and populate a v6 database
    const v6Db = new Dexie(dbName);
    v6Db.version(6).stores(SCHEMA_V6);
    await v6Db.open();

    const sampleTaskId = '33333333-3333-4333-8333-333333333333';
    const sampleSessionId = '44444444-4444-4444-8444-444444444444';
    const sampleProjectId = '55555555-5555-4555-8555-555555555555';

    await v6Db.table('projects').add({
      id: sampleProjectId,
      name: 'Alpha Project',
      status: 'In Progress',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    });

    await v6Db.table('activeTimers').add({
      taskId: sampleTaskId,
      status: 'running',
      startedAt: 1790845200000, // 2026-10-01T09:00:00.000Z
      accumulatedMs: 0,
      sessionStartTime: '2026-10-01T09:00:00.000Z',
    });

    await v6Db.table('workSessions').add({
      id: sampleSessionId,
      taskId: sampleTaskId,
      startTime: '2026-10-01T07:00:00.000Z',
      endTime: '2026-10-01T08:00:00.000Z',
      date: '2026-10-01',
      durationMinutes: 60,
      createdAt: '2026-10-01T08:00:00.000Z',
      updatedAt: '2026-10-01T08:00:00.000Z',
    });

    v6Db.close();

    // 2. Open with TaskPlannerDatabase (v7)
    const v7Db = new TaskPlannerDatabase(dbName);
    await v7Db.open();

    expect(v7Db.verno).toBe(8);

    // Verify stores exist
    expect(v7Db.table('notes')).toBeDefined();
    expect(v7Db.table('noteAttachments')).toBeDefined();

    // Verify activeTimer migrated with fallback single segment
    const timer = await v7Db.activeTimers.get(sampleTaskId);
    expect(timer).toBeDefined();
    expect(timer?.segments).toBeDefined();
    expect(timer?.segments).toHaveLength(1);
    expect(timer?.segments?.[0]?.startTime).toBe(new Date(1790845200000).toISOString());

    // Verify workSession migrated with fallback single segment
    const ws = await v7Db.workSessions.get(sampleSessionId);
    expect(ws).toBeDefined();
    expect(ws?.segments).toBeDefined();
    expect(ws?.segments).toHaveLength(1);
    expect(ws?.segments?.[0]?.startTime).toBe('2026-10-01T07:00:00.000Z');
    expect(ws?.segments?.[0]?.endTime).toBe('2026-10-01T08:00:00.000Z');

    // Verify project can accept jiraEpicKey
    await v7Db.projects.update(sampleProjectId, { jiraEpicKey: 'PROJ-10' });
    const project = await v7Db.projects.get(sampleProjectId);
    expect(project?.jiraEpicKey).toBe('PROJ-10');

    v7Db.close();
  });
});
