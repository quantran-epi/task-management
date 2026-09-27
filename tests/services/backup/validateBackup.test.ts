import { describe, it, expect } from 'vitest';
import { validateBackupPayload } from '../../../src/services/backup/validateBackup';
import { APP_MARKER, CURRENT_SCHEMA_VERSION } from '../../../src/services/backup/exportBackup';

describe('validateBackupPayload', () => {
  const validPayload = {
    app: APP_MARKER,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt: '2026-09-27T10:00:00.000Z',
    tables: {
      projects: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          name: 'Project Alpha',
          status: 'Open',
          createdAt: '2026-09-27T10:00:00.000Z',
          updatedAt: '2026-09-27T10:00:00.000Z',
        },
      ],
      milestones: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          projectId: '11111111-1111-4111-8111-111111111111',
          name: 'Milestone 1',
          status: 'Open',
          createdAt: '2026-09-27T10:00:00.000Z',
          updatedAt: '2026-09-27T10:00:00.000Z',
        },
      ],
      tasks: [
        {
          id: '33333333-3333-4333-8333-333333333333',
          projectId: '11111111-1111-4111-8111-111111111111',
          milestoneId: '22222222-2222-4222-8222-222222222222',
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
      projects: 1,
      milestones: 1,
      tasks: 1,
      capacityRules: 1,
      capacityOverrides: 1,
      plannedAllocations: 1,
    },
  };

  it('validates a correct backup envelope successfully', () => {
    const result = validateBackupPayload(validPayload);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.envelope).toBeDefined();
    expect(result.envelope?.app).toBe(APP_MARKER);
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

  it('rejects records with invalid fields (e.g. invalid UUID, bad status)', () => {
    const invalid = {
      ...validPayload,
      tables: {
        ...validPayload.tables,
        projects: [
          {
            ...validPayload.tables.projects[0],
            id: 'not-a-uuid',
            status: 'UnknownStatus',
          },
        ],
      },
    };
    const result = validateBackupPayload(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.table === 'projects' && e.field === 'id')).toBe(true);
    expect(result.errors.some((e) => e.table === 'projects' && e.field === 'status')).toBe(true);
  });

  it('rejects orphaned milestone referring to non-existent project', () => {
    const invalid = {
      ...validPayload,
      tables: {
        ...validPayload.tables,
        milestones: [
          {
            ...validPayload.tables.milestones[0],
            projectId: '99999999-9999-4999-8999-999999999999',
          },
        ],
      },
    };
    const result = validateBackupPayload(invalid);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some(
        (e) => e.table === 'milestones' && e.field === 'projectId' && e.message.includes('not found')
      )
    ).toBe(true);
  });

  it('rejects orphaned task referring to non-existent project or milestone', () => {
    const invalidProj = {
      ...validPayload,
      tables: {
        ...validPayload.tables,
        tasks: [
          {
            ...validPayload.tables.tasks[0],
            projectId: '99999999-9999-4999-8999-999999999999',
          },
        ],
      },
    };
    const resProj = validateBackupPayload(invalidProj);
    expect(resProj.valid).toBe(false);
    expect(resProj.errors.some((e) => e.table === 'tasks' && e.field === 'projectId')).toBe(true);

    const invalidMs = {
      ...validPayload,
      tables: {
        ...validPayload.tables,
        tasks: [
          {
            ...validPayload.tables.tasks[0],
            milestoneId: '99999999-9999-4999-8999-999999999999',
          },
        ],
      },
    };
    const resMs = validateBackupPayload(invalidMs);
    expect(resMs.valid).toBe(false);
    expect(resMs.errors.some((e) => e.table === 'tasks' && e.field === 'milestoneId')).toBe(true);
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
});
