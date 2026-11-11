import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as backupSchemas from '../../src/validation/backupSchemas';
import { TaskPlannerDatabase } from '../../src/db';
import { exportBackupPayload } from '../../src/services/backup/exportBackup';

/**
 * Wave 0 contract for plan 31.2-09 (ENT-NORM-01, D-49).
 *
 * Written against the post-change backup contract: version 11, no project/milestone
 * tables, `crId` required on task records, and an envelope-stage legacy guard.
 * RED until plan 09 lands — the symbols it asserts do not exist yet, so every lookup
 * goes through the module namespace and fails as an assertion, never as a collection error.
 */
const mod = backupSchemas as unknown as Record<string, any>;

const CR_ID = '22222222-2222-4222-8222-222222222222';
const TASK_ID = '11111111-1111-4111-8111-111111111111';
const NOTE_ID = '33333333-3333-4333-8333-333333333333';
const THREAD_ID = '44444444-4444-4444-8444-444444444444';
const NOW = '2026-01-01T00:00:00.000Z';
const LEGACY_MESSAGE = 'Backup phiên bản cũ không còn được hỗ trợ';

function taskRecord(): Record<string, unknown> {
  return {
    id: TASK_ID,
    crId: CR_ID,
    name: 'Task',
    status: 'Open',
    progress: 0,
    priority: 'Medium',
    estimateMinutes: 0,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function noteRecord(entityType: string): Record<string, unknown> {
  return {
    id: NOTE_ID,
    entityType,
    entityId: CR_ID,
    body: 'body',
    isPinned: false,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function chatThreadRecord(scopeType: string): Record<string, unknown> {
  return {
    id: THREAD_ID,
    scopeKey: `cr:${CR_ID}`,
    scopeType,
    entityId: CR_ID,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

describe('backupSchemas — version-11 CR-centric envelope (ENT-NORM-01)', () => {
  it('drops the project and milestone record schemas', () => {
    expect('BackupProjectRecordSchema' in mod).toBe(false);
    expect('BackupMilestoneRecordSchema' in mod).toBe(false);
  });

  it('accepts a version-11 envelope with no projects or milestones tables', () => {
    expect(typeof mod.BackupEnvelopeSchema?.parse).toBe('function');
    const parsed = mod.BackupEnvelopeSchema.parse({
      app: 'personal-task-planner',
      schemaVersion: 12,
      exportedAt: NOW,
      tables: { tasks: [], systems: [], changeRequests: [] },
      counts: { tasks: 0, systems: 0, changeRequests: 0 },
    });
    expect(parsed.schemaVersion).toBe(12);
  });

  it('rejects a version-10 envelope', () => {
    expect(typeof mod.BackupEnvelopeSchema?.safeParse).toBe('function');
    const result = mod.BackupEnvelopeSchema.safeParse({
      app: 'personal-task-planner',
      schemaVersion: 10,
      exportedAt: NOW,
      tables: {},
      counts: {},
    });
    expect(result.success).toBe(false);
  });

  it('rejects a task record with no crId', () => {
    const { crId: _crId, ...withoutCrId } = taskRecord();
    expect(mod.BackupTaskRecordSchema.safeParse(withoutCrId).success).toBe(false);
  });

  it('accepts a task record with crId and no systemId', () => {
    expect(mod.BackupTaskRecordSchema.safeParse(taskRecord()).success).toBe(true);
  });

  it('narrows note entityType to cr and system', () => {
    expect(mod.BackupNoteRecordSchema.safeParse(noteRecord('cr')).success).toBe(true);
    expect(mod.BackupNoteRecordSchema.safeParse(noteRecord('system')).success).toBe(true);
    expect(mod.BackupNoteRecordSchema.safeParse(noteRecord('project')).success).toBe(false);
    expect(mod.BackupNoteRecordSchema.safeParse(noteRecord('milestone')).success).toBe(false);
  });

  it('narrows chat thread scopeType to cr and system', () => {
    expect(mod.BackupChatThreadRecordSchema.safeParse(chatThreadRecord('cr')).success).toBe(true);
    expect(mod.BackupChatThreadRecordSchema.safeParse(chatThreadRecord('system')).success).toBe(true);
    expect(mod.BackupChatThreadRecordSchema.safeParse(chatThreadRecord('project')).success).toBe(false);
    expect(mod.BackupChatThreadRecordSchema.safeParse(chatThreadRecord('milestone')).success).toBe(false);
  });
});

describe('assertNoLegacyTables — envelope-stage legacy rejection (D-49)', () => {
  it('is exported as a function', () => {
    expect(typeof mod.assertNoLegacyTables).toBe('function');
  });

  it('throws the UI-SPEC message for a payload carrying a projects table', () => {
    expect(() => mod.assertNoLegacyTables({ tables: { projects: [] } })).toThrow(LEGACY_MESSAGE);
  });

  it('throws the UI-SPEC message for a payload carrying a milestones table', () => {
    expect(() => mod.assertNoLegacyTables({ tables: { milestones: [] } })).toThrow(LEGACY_MESSAGE);
  });

  it('does not throw for a version-11 payload', () => {
    expect(() =>
      mod.assertNoLegacyTables({ tables: { tasks: [], systems: [], changeRequests: [] } })
    ).not.toThrow();
  });
});

describe('exportBackupPayload — version 11 without project/milestone tables', () => {
  let testDb: TaskPlannerDatabase;

  beforeEach(async () => {
    testDb = new TaskPlannerDatabase('TestBackupSchemas_' + Math.random().toString(36).slice(2));
    await testDb.open();
  });

  afterEach(async () => {
    await testDb.delete();
  });

  it('reports schemaVersion 11 and exports systems and changeRequests', async () => {
    const envelope = await exportBackupPayload(testDb);
    expect(envelope.schemaVersion).toBe(12);
    expect(Object.keys(envelope.tables)).toContain('systems');
    expect(Object.keys(envelope.tables)).toContain('changeRequests');
  });

  it('has no projects or milestones table', async () => {
    const envelope = await exportBackupPayload(testDb);
    expect(Object.keys(envelope.tables)).not.toContain('projects');
    expect(Object.keys(envelope.tables)).not.toContain('milestones');
  });
});

describe('BackupAiSkillVersionRecordSchema evidence cap (WR-09)', () => {
  const base = {
    id: TASK_ID,
    skillId: CR_ID,
    version: 1,
    status: 'pending' as const,
    name: 'Viết đặc tả',
    description: 'Quy trình.',
    body: '# Body',
    createdAt: NOW,
  };

  it('accepts 2000 characters and rejects 2001', () => {
    expect(
      backupSchemas.BackupAiSkillVersionRecordSchema.parse({
        ...base,
        evidence: 'x'.repeat(2000),
      }).evidence
    ).toHaveLength(2000);
    expect(() =>
      backupSchemas.BackupAiSkillVersionRecordSchema.parse({
        ...base,
        evidence: 'x'.repeat(2001),
      })
    ).toThrow(/2000/);
  });
});
