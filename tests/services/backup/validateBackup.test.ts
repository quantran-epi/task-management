// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { validateBackupPayload } from '../../../src/services/backup/validateBackup';
import { APP_MARKER, CURRENT_SCHEMA_VERSION } from '../../../src/services/backup/exportBackup';

const LEGACY_MESSAGE = 'Backup phiên bản cũ không còn được hỗ trợ';

describe('validateBackupPayload', () => {
  const validPayload = {
    app: APP_MARKER,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt: '2026-09-27T10:00:00.000Z',
    tables: {
      systems: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          name: 'Core System',
          code: 'CORE_SYS',
          parentId: null,
          type: 'SERVICE',
          createdAt: '2026-09-27T10:00:00.000Z',
          updatedAt: '2026-09-27T10:00:00.000Z',
        },
      ],
      changeRequests: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          name: 'CR Alpha',
          code: 'CR-ALPHA',
          status: 'Open',
          type: 'NEW_FEATURE',
          targets: [{ systemId: '11111111-1111-4111-8111-111111111111' }],
          createdAt: '2026-09-27T10:00:00.000Z',
          updatedAt: '2026-09-27T10:00:00.000Z',
        },
      ],
      tasks: [
        {
          id: '33333333-3333-4333-8333-333333333333',
          crId: '22222222-2222-4222-8222-222222222222',
          name: 'Task 1',
          status: 'Open',
          progress: 0,
          priority: 'Medium',
          estimateMinutes: 60,
          createdAt: '2026-09-27T10:00:00.000Z',
          updatedAt: '2026-09-27T10:00:00.000Z',
        },
      ],
      capacityRules: [
        {
          id: '44444444-4444-4444-8444-444444444444',
          dayOfWeek: 1,
          workMinutes: 480,
        },
      ],
      capacityOverrides: [
        {
          id: '55555555-5555-4555-8555-555555555555',
          date: '2026-09-28',
          workMinutes: 0,
          note: 'Holiday',
        },
      ],
      plannedAllocations: [
        {
          id: '66666666-6666-4666-8666-666666666666',
          taskId: '33333333-3333-4333-8333-333333333333',
          date: '2026-09-28',
          allocatedMinutes: 60,
        },
      ],
    },
    counts: {
      systems: 1,
      changeRequests: 1,
      tasks: 1,
      capacityRules: 1,
      capacityOverrides: 1,
      plannedAllocations: 1,
    },
  };

  it('validates a correct version-11 backup envelope successfully', () => {
    const result = validateBackupPayload(validPayload);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.envelope).toBeDefined();
    expect(result.envelope?.app).toBe(APP_MARKER);
    expect(result.envelope?.schemaVersion).toBe(11);
  });

  it('rejects non-object or null payloads', () => {
    expect(validateBackupPayload(null).valid).toBe(false);
    expect(validateBackupPayload('string').valid).toBe(false);
    expect(validateBackupPayload([]).valid).toBe(false);
  });

  it('rejects payloads with wrong app marker', () => {
    const result = validateBackupPayload({ ...validPayload, app: 'wrong-app' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'app')).toBe(true);
  });

  it('rejects payloads with future/newer schemaVersion', () => {
    const result = validateBackupPayload({ ...validPayload, schemaVersion: 999 });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'schemaVersion')).toBe(true);
  });

  describe('D-49 legacy rejection', () => {
    it('rejects a payload carrying a projects table before any table validation', () => {
      const result = validateBackupPayload({
        ...validPayload,
        tables: { ...validPayload.tables, projects: [] },
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.table).toBe('envelope');
      expect(result.errors[0]?.message).toContain(LEGACY_MESSAGE);
      expect(result.envelope).toBeUndefined();
    });

    it('rejects a payload carrying a milestones table', () => {
      const result = validateBackupPayload({
        ...validPayload,
        tables: { ...validPayload.tables, milestones: [] },
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]?.message).toContain(LEGACY_MESSAGE);
    });

    it('rejects a version-10 envelope with the legacy message', () => {
      const result = validateBackupPayload({ ...validPayload, schemaVersion: 10 });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.message.includes(LEGACY_MESSAGE))).toBe(true);
    });
  });

  it('rejects records with invalid fields (e.g. invalid UUID, bad status)', () => {
    const invalid = {
      ...validPayload,
      tables: {
        ...validPayload.tables,
        changeRequests: [
          {
            ...validPayload.tables.changeRequests[0],
            id: 'not-a-uuid',
            status: 'UnknownStatus',
          },
        ],
      },
    };
    const result = validateBackupPayload(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.table === 'changeRequests' && e.field === 'id')).toBe(true);
    expect(result.errors.some((e) => e.table === 'changeRequests' && e.field === 'status')).toBe(true);
  });

  it('rejects a task record with no crId', () => {
    const { crId: _crId, ...withoutCrId } = validPayload.tables.tasks[0]!;
    const result = validateBackupPayload({
      ...validPayload,
      tables: { ...validPayload.tables, tasks: [withoutCrId] },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.table === 'tasks' && e.field === 'crId')).toBe(true);
  });

  it('rejects orphaned plannedAllocation referring to non-existent task', () => {
    const invalid = {
      ...validPayload,
      tables: {
        ...validPayload.tables,
        plannedAllocations: [
          {
            ...validPayload.tables.plannedAllocations[0],
            taskId: '99999999-9999-4999-8999-999999999999',
          },
        ],
      },
    };
    const result = validateBackupPayload(invalid);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.table === 'plannedAllocations' && e.field === 'taskId')
    ).toBe(true);
  });

  it('rejects a note pointing at a CR that is not in the payload', () => {
    const result = validateBackupPayload({
      ...validPayload,
      tables: {
        ...validPayload.tables,
        notes: [
          {
            id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            entityType: 'cr',
            entityId: '99999999-9999-4999-8999-999999999999',
            body: 'body',
            isPinned: false,
            createdAt: '2026-09-27T10:00:00.000Z',
            updatedAt: '2026-09-27T10:00:00.000Z',
          },
        ],
      },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.table === 'notes' && e.field === 'entityId')).toBe(true);
  });

  it('validates document-scoped chat thread and rejects broken or missing document reference', () => {
    const NOTE_UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const THREAD_UUID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

    const validDocChat = {
      ...validPayload,
      tables: {
        ...validPayload.tables,
        notes: [
          {
            id: NOTE_UUID,
            title: 'Doc Note',
            body: '# Hello',
            isPinned: false,
            createdAt: '2026-09-27T10:00:00.000Z',
            updatedAt: '2026-09-27T10:00:00.000Z',
          },
        ],
        chatThreads: [
          {
            id: THREAD_UUID,
            scopeKey: `document:${NOTE_UUID}`,
            scopeType: 'document',
            entityId: NOTE_UUID,
            createdAt: '2026-09-27T10:00:00.000Z',
            updatedAt: '2026-09-27T10:00:00.000Z',
          },
        ],
      },
    };
    const validRes = validateBackupPayload(validDocChat);
    expect(validRes.valid).toBe(true);

    const missingEntityId = {
      ...validPayload,
      tables: {
        ...validPayload.tables,
        notes: [
          {
            id: NOTE_UUID,
            title: 'Doc Note',
            body: '# Hello',
            isPinned: false,
            createdAt: '2026-09-27T10:00:00.000Z',
            updatedAt: '2026-09-27T10:00:00.000Z',
          },
        ],
        chatThreads: [
          {
            id: THREAD_UUID,
            scopeKey: `document:${NOTE_UUID}`,
            scopeType: 'document',
            createdAt: '2026-09-27T10:00:00.000Z',
            updatedAt: '2026-09-27T10:00:00.000Z',
          },
        ],
      },
    };
    const missingEntityRes = validateBackupPayload(missingEntityId);
    expect(missingEntityRes.valid).toBe(false);
    expect(
      missingEntityRes.errors.some((e) => e.table === 'chatThreads' && e.field === 'entityId')
    ).toBe(true);

    const absentDocRef = {
      ...validPayload,
      tables: {
        ...validPayload.tables,
        notes: [
          {
            id: NOTE_UUID,
            title: 'Doc Note',
            body: '# Hello',
            isPinned: false,
            createdAt: '2026-09-27T10:00:00.000Z',
            updatedAt: '2026-09-27T10:00:00.000Z',
          },
        ],
        chatThreads: [
          {
            id: THREAD_UUID,
            scopeKey: 'document:cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            scopeType: 'document',
            entityId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            createdAt: '2026-09-27T10:00:00.000Z',
            updatedAt: '2026-09-27T10:00:00.000Z',
          },
        ],
      },
    };
    const absentDocRes = validateBackupPayload(absentDocRef);
    expect(absentDocRes.valid).toBe(false);
    expect(
      absentDocRes.errors.some((e) => e.table === 'chatThreads' && e.field === 'entityId')
    ).toBe(true);
  });
});
