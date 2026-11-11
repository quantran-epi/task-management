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

  it('validates a correct version-13 backup envelope successfully', () => {
    const result = validateBackupPayload(validPayload);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.envelope).toBeDefined();
    expect(result.envelope?.app).toBe(APP_MARKER);
    expect(result.envelope?.schemaVersion).toBe(13);
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

  it('rejects a version-12 envelope with the existing legacy message and names schemaVersion', () => {
    const result = validateBackupPayload({ ...validPayload, schemaVersion: 12 });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.field).toBe('schemaVersion');
    expect(result.errors[0]?.message).toContain(LEGACY_MESSAGE);
  });

  describe('IN-08 — no unreachable phase value', () => {
    it('refuses phaseAtEnd "error", which no writer ever produces', async () => {
      const { BackupAiTeamBatchRecordSchema } = await import(
        '../../../src/validation/backupSchemas'
      );
      const row = {
        id: 'aeaeaeae-aeae-4aea-8aea-aeaeaeaeaeae',
        teamId: '11111111-1111-4111-8111-111111111111',
        threadId: '22222222-2222-4222-8222-222222222222',
        batchIndex: 1,
        userRequest: 'x',
        leadId: '33333333-3333-4333-8333-333333333333',
        planSnapshot: { original: [] },
        planDecision: 'auto' as const,
        startedAt: '2026-09-27T10:00:00.000Z',
        abortedBy: 'none' as const,
      };

      expect(BackupAiTeamBatchRecordSchema.safeParse(row).success).toBe(true);
      expect(
        BackupAiTeamBatchRecordSchema.safeParse({ ...row, phaseAtEnd: 'ready' }).success
      ).toBe(true);
      // IN-08: the phase union dropped `error`; the schema must agree or a hand-crafted
      // payload could restore a state the app can never enter.
      expect(
        BackupAiTeamBatchRecordSchema.safeParse({ ...row, phaseAtEnd: 'error' }).success
      ).toBe(false);
    });
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

  it('rejects a chat tab whose type is sdlc', () => {
    const CR_ID = '22222222-2222-4222-8222-222222222222';
    const THREAD_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const TAB_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const result = validateBackupPayload({
      ...validPayload,
      tables: {
        ...validPayload.tables,
        chatThreads: [{
          id: THREAD_ID,
          scopeKey: `cr:${CR_ID}`,
          scopeType: 'cr',
          entityId: CR_ID,
          createdAt: '2026-09-27T10:00:00.000Z',
          updatedAt: '2026-09-27T10:00:00.000Z',
        }],
        chatTabs: [{
          id: TAB_ID,
          threadId: THREAD_ID,
          scopeKey: `cr:${CR_ID}`,
          type: 'sdlc',
          title: 'SDLC Workflow',
          order: 0,
          createdAt: '2026-09-27T10:00:00.000Z',
          updatedAt: '2026-09-27T10:00:00.000Z',
        }],
      },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.table === 'chatTabs')).toBe(true);
  });

  it('accepts a chat tab whose type is chat', () => {
    const CR_ID = '22222222-2222-4222-8222-222222222222';
    const THREAD_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const TAB_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const result = validateBackupPayload({
      ...validPayload,
      tables: {
        ...validPayload.tables,
        chatThreads: [{
          id: THREAD_ID,
          scopeKey: `cr:${CR_ID}`,
          scopeType: 'cr',
          entityId: CR_ID,
          createdAt: '2026-09-27T10:00:00.000Z',
          updatedAt: '2026-09-27T10:00:00.000Z',
        }],
        chatTabs: [{
          id: TAB_ID,
          threadId: THREAD_ID,
          scopeKey: `cr:${CR_ID}`,
          type: 'chat',
          title: 'Chat',
          order: 0,
          createdAt: '2026-09-27T10:00:00.000Z',
          updatedAt: '2026-09-27T10:00:00.000Z',
        }],
      },
    });
    expect(result.valid).toBe(true);
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

  it('validates document-scoped chat thread and rejects broken or missing document reference', () => {    const NOTE_UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
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

  describe('Phase 36 AI Office live references (D-05, D-09, D-14, D-25, T-36-07)', () => {
    const LEAD_ID = '11111111-1111-4111-8111-aaaaaaaaaaaa';
    const OTHER_LEAD_ID = '11111111-1111-4111-8111-bbbbbbbbbbbb';
    const EMPLOYEE_ID = '22222222-2222-4222-8222-aaaaaaaaaaaa';
    const TEAM_ID = '33333333-3333-4333-8333-aaaaaaaaaaaa';
    const LEAD_ROW_ID = '44444444-4444-4444-8444-aaaaaaaaaaaa';
    const EMPLOYEE_ROW_ID = '55555555-5555-4555-8555-aaaaaaaaaaaa';
    const SKILL_ID = '66666666-6666-4666-8666-aaaaaaaaaaaa';
    const VERSION_ID = '77777777-7777-4777-8777-aaaaaaaaaaaa';
    const THREAD_ID = '88888888-8888-4888-8888-aaaaaaaaaaaa';
    const MESSAGE_ID = '99999999-9999-4999-8999-aaaaaaaaaaaa';
    const NOW = '2026-11-08T12:00:00.000Z';

    const lead = { id: LEAD_ID, name: 'An', role: 'Lead', capability: 'c', persona: 'p', model: 'm', createdAt: NOW, updatedAt: NOW };
    const employee = { id: EMPLOYEE_ID, name: 'Bảo', role: 'Dev', capability: 'c', persona: 'p', model: 'm', createdAt: NOW, updatedAt: NOW };
    const skill = { id: SKILL_ID, name: 'Review', description: 'd', body: 'b', createdAt: NOW, updatedAt: NOW };
    const team = { id: TEAM_ID, name: 'Squad', leadId: LEAD_ID, status: 'active', budgetTokens: 0, createdAt: NOW, updatedAt: NOW };
    const leadRow = { id: LEAD_ROW_ID, teamId: TEAM_ID, agentId: LEAD_ID, role: 'lead', budgetTokens: 0, usedTokens: 0 };
    const employeeRow = { id: EMPLOYEE_ROW_ID, teamId: TEAM_ID, agentId: EMPLOYEE_ID, role: 'employee', budgetTokens: 0, usedTokens: 0 };
    const teamThread = { id: THREAD_ID, scopeKey: `team:${TEAM_ID}`, scopeType: 'team', entityId: TEAM_ID, createdAt: NOW, updatedAt: NOW };
    const version = { id: VERSION_ID, skillId: SKILL_ID, version: 1, status: 'approved', name: 'Review', description: 'd', body: 'b', createdAt: NOW };

    function officePayload(overrides: Record<string, unknown[]> = {}) {
      return {
        ...validPayload,
        tables: {
          ...validPayload.tables,
          aiEmployees: [employee],
          aiLeads: [lead],
          aiSkills: [skill],
          aiTeams: [team],
          aiTeamMembers: [leadRow, employeeRow],
          chatThreads: [teamThread],
          aiSkillVersions: [version],
          ...overrides,
        },
      };
    }

    it('accepts a valid AI Office payload and an empty group', () => {
      expect(validateBackupPayload(officePayload()).valid).toBe(true);

      const emptyGroup = { id: TEAM_ID, name: 'Nhóm rỗng', status: 'idle', budgetTokens: 0, createdAt: NOW, updatedAt: NOW };
      const result = validateBackupPayload(
        officePayload({ aiTeams: [emptyGroup], aiTeamMembers: [], chatThreads: [] })
      );
      expect(result.errors).toEqual([]);
      expect(result.valid).toBe(true);
    });

    it('accepts an envelope with no aiSkillVersions key', () => {
      const payload = officePayload();
      delete (payload.tables as Record<string, unknown>).aiSkillVersions;
      expect(validateBackupPayload(payload).valid).toBe(true);
    });

    it('rejects a leadId naming a missing lead', () => {
      const result = validateBackupPayload(
        officePayload({ aiLeads: [], aiTeamMembers: [], aiTeams: [{ ...team, leadId: OTHER_LEAD_ID }] })
      );
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.table === 'aiTeams' && e.field === 'leadId')).toBe(true);
    });

    it('rejects leaderLockedAt with no lead row', () => {
      const result = validateBackupPayload(
        officePayload({ aiTeamMembers: [employeeRow], aiTeams: [{ ...team, leaderLockedAt: NOW }] })
      );
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.table === 'aiTeams' && e.field === 'leadId')).toBe(true);
    });

    it('rejects a leader-locked group with no leadId', () => {
      const result = validateBackupPayload(
        officePayload({
          aiTeams: [{ id: TEAM_ID, name: 'Squad', status: 'idle', budgetTokens: 0, leaderLockedAt: NOW, createdAt: NOW, updatedAt: NOW }],
          aiTeamMembers: [],
          chatThreads: [],
        })
      );
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.table === 'aiTeams' && e.field === 'leaderLockedAt')).toBe(true);
    });

    it('rejects a member naming an unknown agent', () => {
      const result = validateBackupPayload(
        officePayload({
          aiTeamMembers: [leadRow, { ...employeeRow, agentId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }],
        })
      );
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.table === 'aiTeamMembers' && e.field === 'agentId')).toBe(true);
    });

    it('rejects a skill version naming a missing skill', () => {
      const result = validateBackupPayload(
        officePayload({ aiSkillVersions: [{ ...version, skillId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }] })
      );
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.table === 'aiSkillVersions' && e.field === 'skillId')).toBe(true);
    });

    it('rejects duplicate (skillId, version)', () => {
      const result = validateBackupPayload(
        officePayload({ aiSkillVersions: [version, { ...version, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }] })
      );
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.table === 'aiSkillVersions' && e.field === 'version')).toBe(true);
    });

    it('rejects a team thread whose scope key is not exactly team:<entityId>', () => {
      const result = validateBackupPayload(
        officePayload({ chatThreads: [{ ...teamThread, scopeKey: `team:${TEAM_ID}:chat:${THREAD_ID}` }] })
      );
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.table === 'chatThreads' && e.field === 'scopeKey')).toBe(true);
    });

    it('accepts a message whose targetAgentId names a deleted employee (D-14 historical ref)', () => {
      const result = validateBackupPayload(
        officePayload({
          aiEmployees: [],
          aiTeamMembers: [leadRow],
          chatMessages: [{
            id: MESSAGE_ID,
            threadId: THREAD_ID,
            role: 'assistant',
            content: 'Instruction for a deleted employee.',
            createdAt: NOW,
            agentId: LEAD_ID,
            agentName: 'An',
            agentKind: 'lead',
            messageKind: 'instruction',
            targetAgentId: EMPLOYEE_ID,
          }],
        })
      );
      expect(result.errors).toEqual([]);
      expect(result.valid).toBe(true);
    });
  });
});
