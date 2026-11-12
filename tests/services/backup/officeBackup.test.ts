import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TaskPlannerDatabase } from '../../../src/db';
import {
  APP_MARKER,
  CURRENT_SCHEMA_VERSION,
  exportBackupPayload,
} from '../../../src/services/backup/exportBackup';
import { restoreBackupPayload } from '../../../src/services/backup/restoreBackup';
import { validateBackupPayload } from '../../../src/services/backup/validateBackup';
import type { BackupEnvelope } from '../../../src/types/backup';
import type {
  AiEmployee,
  AiLead,
  AiSkill,
  AiSkillVersion,
  AiTeam,
  AiTeamAssignment,
  AiTeamBatch,
  AiTeamLink,
  AiTeamMember,
} from '../../../src/types/aiOffice';
import type { ChatMessage, ChatThread } from '../../../src/types/models';

const NOW = '2026-11-08T12:00:00.000Z';

const SKILL_ID = '11111111-1111-4111-8111-111111111111';
const EMPLOYEE_ID = '22222222-2222-4222-8222-222222222222';
const LEAD_ID = '33333333-3333-4333-8333-333333333333';
const TEAM_ID = '44444444-4444-4444-8444-444444444444';
const MEMBER_LEAD_ID = '55555555-5555-4555-8555-555555555555';
const MEMBER_EMPLOYEE_ID = '66666666-6666-4666-8666-666666666666';
const LINK_ID = '77777777-7777-4777-8777-777777777777';
const THREAD_ID = '88888888-8888-4888-8888-888888888888';
const MESSAGE_ID = '99999999-9999-4999-8999-999999999999';
const CR_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PENDING_VERSION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const APPROVED_VERSION_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const ASSIGNED_MESSAGE_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const EMPTY_TEAM_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const BATCH_ID = '12121212-1212-4212-8212-121212121212';
const ASSIGNMENT_1_ID = '13131313-1313-4313-8313-131313131313';
const ASSIGNMENT_2_ID = '14141414-1414-4414-8414-141414141414';
const STEER_MESSAGE_ID = '15151515-1515-4515-8515-151515151515';
const AMENDED_MESSAGE_ID = '17171717-1717-4717-8717-171717171717';
const AMENDED_ASSIGNMENT_ID = '18181818-1818-4818-8818-181818181818';
const LOCKED_AT = '2026-11-09T08:00:00.000Z';

const skill: AiSkill = {
  id: SKILL_ID,
  name: 'Code review',
  description: 'Reviews diffs for correctness',
  body: '# Code review\n\nCheck tests.',
  createdAt: NOW,
  updatedAt: NOW,
};

const employee: AiEmployee = {
  id: EMPLOYEE_ID,
  name: 'Bảo',
  role: 'Backend engineer',
  capability: 'Writes and reviews service code',
  persona: 'Careful and terse.',
  model: 'claude-sonnet-4',
  skillId: SKILL_ID,
  createdAt: NOW,
  updatedAt: NOW,
};

const lead: AiLead = {
  id: LEAD_ID,
  name: 'An',
  role: 'Tech lead',
  capability: 'Splits work and synthesizes reports',
  persona: 'Direct, evidence-first.',
  model: 'claude-opus-4',
  createdAt: NOW,
  updatedAt: NOW,
};

const team: AiTeam = {
  id: TEAM_ID,
  name: 'Squad Alpha',
  leadId: LEAD_ID,
  status: 'active',
  budgetTokens: 200000,
  autoSplitEnabled: true,
  autoApproveMutations: false,
  createdAt: NOW,
  updatedAt: NOW,
};

const leadMember: AiTeamMember = {
  id: MEMBER_LEAD_ID,
  teamId: TEAM_ID,
  agentId: LEAD_ID,
  role: 'lead',
  budgetTokens: 80000,
  usedTokens: 1200,
};

const employeeMember: AiTeamMember = {
  id: MEMBER_EMPLOYEE_ID,
  teamId: TEAM_ID,
  agentId: EMPLOYEE_ID,
  role: 'employee',
  budgetTokens: 120000,
  usedTokens: 3400,
};

const teamLink: AiTeamLink = {
  id: LINK_ID,
  teamId: TEAM_ID,
  itemType: 'cr',
  itemId: CR_ID,
  createdAt: NOW,
};

const teamThread: ChatThread = {
  id: THREAD_ID,
  scopeKey: `team:${TEAM_ID}`,
  scopeType: 'team',
  entityId: TEAM_ID,
  title: 'Squad Alpha run',
  createdAt: NOW,
  updatedAt: NOW,
};

const attributedMessage: ChatMessage = {
  id: MESSAGE_ID,
  threadId: THREAD_ID,
  role: 'assistant',
  content: 'Report: done.',
  createdAt: NOW,
  agentId: EMPLOYEE_ID,
  agentName: 'Bảo',
  agentKind: 'employee',
  messageKind: 'report',
};

const pendingVersion: AiSkillVersion = {
  id: PENDING_VERSION_ID,
  skillId: SKILL_ID,
  version: 2,
  status: 'pending',
  name: 'Code review',
  description: 'Reviews diffs for correctness',
  body: '# Code review v2\n\nCheck tests and coverage.',
  evidence: 'Turn 4',
  createdAt: NOW,
};

const approvedVersion: AiSkillVersion = {
  id: APPROVED_VERSION_ID,
  skillId: SKILL_ID,
  version: 1,
  status: 'approved',
  name: 'Code review',
  description: 'Reviews diffs for correctness',
  body: '# Code review\n\nCheck tests.',
  createdAt: NOW,
  decidedAt: NOW,
};

/** Phase 37 D-22: a batch plus two attempts. Attempt 2 carries the local-only `diagnosticDetail`. */
const batch: AiTeamBatch = {
  id: BATCH_ID,
  teamId: TEAM_ID,
  threadId: THREAD_ID,
  batchIndex: 1,
  userRequest: 'Review the diff and report.',
  leadId: LEAD_ID,
  planSnapshot: {
    original: [{ agentId: EMPLOYEE_ID, agentName: 'Bảo', task: 'Review the diff' }],
  },
  planDecision: 'approved',
  startedAt: NOW,
  abortedBy: 'none',
};

const assignmentAttempt1: AiTeamAssignment = {
  id: ASSIGNMENT_1_ID,
  batchId: BATCH_ID,
  agentId: EMPLOYEE_ID,
  agentName: 'Bảo',
  skillId: SKILL_ID,
  skillVersion: 1,
  model: 'claude-sonnet-4',
  task: 'Review the diff',
  runStatus: 'needs-input',
  stopReason: 'none',
  attemptNo: 1,
  incomplete: true,
  queuedAt: NOW,
};

const assignmentAttempt2: AiTeamAssignment = {
  id: ASSIGNMENT_2_ID,
  batchId: BATCH_ID,
  agentId: EMPLOYEE_ID,
  agentName: 'Bảo',
  model: 'claude-sonnet-4',
  task: 'Review the diff',
  runStatus: 'blocked',
  stopReason: 'tool-limit',
  attemptNo: 2,
  retryOfAssignmentId: ASSIGNMENT_1_ID,
  incomplete: true,
  queuedAt: NOW,
  diagnosticDetail: 'provider stack detail — must never leave the app',
};

async function seedOffice(db: TaskPlannerDatabase): Promise<void> {
  await db.aiSkills.add(skill);
  await db.aiEmployees.add(employee);
  await db.aiLeads.add(lead);
  await db.aiTeams.add(team);
  await db.aiTeamMembers.bulkAdd([leadMember, employeeMember]);
  await db.aiTeamLinks.add(teamLink);
  await db.chatThreads.add(teamThread);
  await db.chatMessages.add(attributedMessage);
  await db.aiSkillVersions.bulkAdd([pendingVersion, approvedVersion]);
  await db.aiTeamBatches.add(batch);
  await db.aiTeamAssignments.bulkAdd([assignmentAttempt1, assignmentAttempt2]);
}

/** D-34: a current-version payload that predates the AI Office tables — every new key absent. */
function v11EnvelopeWithoutOffice(): BackupEnvelope {
  return {
    app: APP_MARKER,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt: NOW,
    tables: {
      tasks: [],
      capacityRules: [],
      capacityOverrides: [],
      plannedAllocations: [],
    },
    counts: {
      tasks: 0,
      capacityRules: 0,
      capacityOverrides: 0,
      plannedAllocations: 0,
    },
  };
}

describe('AI Office backup lifecycle (AIO-BACKUP-01, AIO-MEM-01)', () => {
  let sourceDb: TaskPlannerDatabase;
  let restoredDb: TaskPlannerDatabase;

  beforeEach(async () => {
    sourceDb = new TaskPlannerDatabase(`OfficeBackupSource_${crypto.randomUUID()}`);
    restoredDb = new TaskPlannerDatabase(`OfficeBackupRestore_${crypto.randomUUID()}`);
    await Promise.all([sourceDb.open(), restoredDb.open()]);
  });

  afterEach(async () => {
    await Promise.all([sourceDb.delete(), restoredDb.delete()]);
  });

  it('exports the AI Office tables at schemaVersion 13', async () => {
    await seedOffice(sourceDb);

    const envelope = await exportBackupPayload(sourceDb);

    expect(envelope.schemaVersion).toBe(13);
    expect(envelope.tables.aiEmployees).toEqual([employee]);
    expect(envelope.tables.aiLeads).toEqual([lead]);
    expect(envelope.tables.aiSkills).toEqual([skill]);
    expect(envelope.tables.aiTeams).toEqual([team]);
    expect(envelope.tables.aiTeamMembers).toEqual([leadMember, employeeMember]);
    expect(envelope.tables.aiTeamLinks).toEqual([teamLink]);
    expect(envelope.tables.aiSkillVersions).toEqual([pendingVersion, approvedVersion]);
    expect(envelope.tables.aiTeamBatches).toEqual([batch]);
    expect(envelope.tables.aiTeamAssignments).toHaveLength(2);
    expect(envelope.counts).toMatchObject({
      aiEmployees: 1,
      aiLeads: 1,
      aiSkills: 1,
      aiTeams: 1,
      aiTeamMembers: 2,
      aiTeamLinks: 1,
      aiSkillVersions: 2,
      aiTeamBatches: 1,
      aiTeamAssignments: 2,
    });
  });

  it('round-trips the ledger and never exports diagnosticDetail (D-17, T-37-14)', async () => {
    await seedOffice(sourceDb);

    const envelope = await exportBackupPayload(sourceDb);

    expect(envelope.schemaVersion).toBe(13);
    expect(envelope.counts.aiTeamAssignments).toBe(2);
    // The local row carries the field; the artifact must not.
    expect((await sourceDb.aiTeamAssignments.get(ASSIGNMENT_2_ID))?.diagnosticDetail).toBeDefined();
    expect(JSON.stringify(envelope.tables.aiTeamAssignments)).not.toContain('diagnosticDetail');

    expect(validateBackupPayload(envelope)).toMatchObject({ valid: true, errors: [] });
    await restoreBackupPayload(envelope, restoredDb);

    expect(await restoredDb.aiTeamBatches.get(BATCH_ID)).toEqual(batch);
    expect(await restoredDb.aiTeamAssignments.get(ASSIGNMENT_1_ID)).toEqual({
      ...assignmentAttempt1,
    });
    const restoredRetry = await restoredDb.aiTeamAssignments.get(ASSIGNMENT_2_ID);
    expect(restoredRetry?.retryOfAssignmentId).toBe(ASSIGNMENT_1_ID);
    expect(restoredRetry?.attemptNo).toBe(2);
    expect(restoredRetry?.diagnosticDetail).toBeUndefined();
    // D-24: states with no runtime yet still round-trip.
    expect(restoredRetry?.runStatus).toBe('blocked');
    expect((await restoredDb.aiTeamAssignments.get(ASSIGNMENT_1_ID))?.runStatus).toBe('needs-input');
  });

  it('round-trips every AI Office row and the four message attribution fields', async () => {
    await seedOffice(sourceDb);
    const envelope = await exportBackupPayload(sourceDb);

    expect(validateBackupPayload(envelope)).toMatchObject({ valid: true, errors: [] });

    await restoreBackupPayload(envelope, restoredDb);

    expect(await restoredDb.aiSkills.get(SKILL_ID)).toEqual(skill);
    expect(await restoredDb.aiEmployees.get(EMPLOYEE_ID)).toEqual(employee);
    expect(await restoredDb.aiLeads.get(LEAD_ID)).toEqual(lead);
    expect(await restoredDb.aiTeams.get(TEAM_ID)).toEqual(team);
    expect(await restoredDb.aiTeamMembers.get(MEMBER_LEAD_ID)).toEqual(leadMember);
    expect(await restoredDb.aiTeamMembers.get(MEMBER_EMPLOYEE_ID)).toEqual(employeeMember);
    expect(await restoredDb.aiTeamLinks.get(LINK_ID)).toEqual(teamLink);
    expect(await restoredDb.chatThreads.get(THREAD_ID)).toEqual(teamThread);

    const restoredMessage = await restoredDb.chatMessages.get(MESSAGE_ID);
    expect(restoredMessage).toEqual(attributedMessage);
    expect(restoredMessage?.agentId).toBe(EMPLOYEE_ID);
    expect(restoredMessage?.agentName).toBe('Bảo');
    expect(restoredMessage?.agentKind).toBe('employee');
    expect(restoredMessage?.messageKind).toBe('report');

    expect(await restoredDb.aiSkillVersions.get(PENDING_VERSION_ID)).toEqual(pendingVersion);
    expect(await restoredDb.aiSkillVersions.get(APPROVED_VERSION_ID)).toEqual(approvedVersion);
  });

  it('round-trips targetAgentId so a restored instruction keeps its assignee (D-18, AIO-DATA-02)', async () => {
    await seedOffice(sourceDb);
    const assigned: ChatMessage = {
      id: ASSIGNED_MESSAGE_ID,
      threadId: THREAD_ID,
      role: 'assistant',
      content: 'Instruction for Bảo.',
      createdAt: NOW,
      agentId: LEAD_ID,
      agentName: 'An',
      agentKind: 'lead',
      messageKind: 'instruction',
      targetAgentId: EMPLOYEE_ID,
    };
    await sourceDb.chatMessages.add(assigned);

    const envelope = await exportBackupPayload(sourceDb);
    expect(validateBackupPayload(envelope)).toMatchObject({ valid: true, errors: [] });
    await restoreBackupPayload(envelope, restoredDb);

    const restored = await restoredDb.chatMessages.get(ASSIGNED_MESSAGE_ID);
    expect(restored?.targetAgentId).toBe(EMPLOYEE_ID);
  });

  it('round-trips leaderLockedAt (D-09)', async () => {
    await seedOffice(sourceDb);
    await sourceDb.aiTeams.update(TEAM_ID, { leaderLockedAt: LOCKED_AT });

    const envelope = await exportBackupPayload(sourceDb);
    expect(validateBackupPayload(envelope)).toMatchObject({ valid: true, errors: [] });
    await restoreBackupPayload(envelope, restoredDb);

    expect((await restoredDb.aiTeams.get(TEAM_ID))?.leaderLockedAt).toBe(LOCKED_AT);
  });

  it('round-trips an empty group with no leadId and no member rows (D-05)', async () => {
    await seedOffice(sourceDb);
    const emptyTeam: AiTeam = {
      id: EMPTY_TEAM_ID,
      name: 'Nhóm rỗng',
      status: 'idle',
      budgetTokens: 0,
      createdAt: NOW,
      updatedAt: NOW,
    };
    await sourceDb.aiTeams.add(emptyTeam);

    const envelope = await exportBackupPayload(sourceDb);
    expect(validateBackupPayload(envelope)).toMatchObject({ valid: true, errors: [] });
    await restoreBackupPayload(envelope, restoredDb);

    const restored = await restoredDb.aiTeams.get(EMPTY_TEAM_ID);
    expect(restored).toEqual(emptyTeam);
    expect(restored?.leadId).toBeUndefined();
    expect(await restoredDb.aiTeamMembers.where('teamId').equals(EMPTY_TEAM_ID).count()).toBe(0);
  });

  it('keeps a restored pending skill version pending (D-22)', async () => {
    await seedOffice(sourceDb);
    const envelope = await exportBackupPayload(sourceDb);

    await restoreBackupPayload(envelope, restoredDb);

    const restored = await restoredDb.aiSkillVersions.get(PENDING_VERSION_ID);
    expect(restored?.status).toBe('pending');
    expect(restored?.decidedAt).toBeUndefined();
  });

  it('restores the same envelope twice with identical counts (no accumulation)', async () => {
    await seedOffice(sourceDb);
    const envelope = await exportBackupPayload(sourceDb);

    await restoreBackupPayload(envelope, restoredDb);
    const firstCounts = {
      versions: await restoredDb.aiSkillVersions.count(),
      skills: await restoredDb.aiSkills.count(),
      teams: await restoredDb.aiTeams.count(),
    };

    await restoreBackupPayload(envelope, restoredDb);
    const secondCounts = {
      versions: await restoredDb.aiSkillVersions.count(),
      skills: await restoredDb.aiSkills.count(),
      teams: await restoredDb.aiTeams.count(),
    };

    expect(secondCounts).toEqual(firstCounts);
    expect(secondCounts.versions).toBe(2);
  });

  it('never exports a runtime buffer, secret or forbidden key, and keeps recorded token usage (D-19)', async () => {
    await seedOffice(sourceDb);
    await sourceDb.chatMessages.update(MESSAGE_ID, {
      tokenUsage: { promptTokens: 120, completionTokens: 80, totalTokens: 200 },
    });

    const envelope = await exportBackupPayload(sourceDb);

    const forbidden = ['partialBuffer', 'streamingText', 'runtime', 'error', 'stack'];
    const seen: string[] = [];
    const walk = (value: unknown): void => {
      if (!value || typeof value !== 'object') return;
      if (Array.isArray(value)) {
        value.forEach(walk);
        return;
      }
      for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
        seen.push(key);
        walk(nested);
      }
    };
    walk(envelope.tables);
    for (const key of forbidden) expect(seen).not.toContain(key);

    await restoreBackupPayload(envelope, restoredDb);
    const restored = await restoredDb.chatMessages.get(MESSAGE_ID);
    expect(restored?.tokenUsage).toEqual({ promptTokens: 120, completionTokens: 80, totalTokens: 200 });
  });

  it('validates a payload without AI Office keys and leaves local rows untouched', async () => {
    await seedOffice(restoredDb);

    const payload = v11EnvelopeWithoutOffice();
    expect(validateBackupPayload(payload)).toMatchObject({ valid: true, errors: [] });

    await restoreBackupPayload(payload, restoredDb);

    // Absent means "payload predates the tables", not "delete them".
    expect(await restoredDb.aiEmployees.toArray()).toEqual([employee]);
    expect(await restoredDb.aiLeads.toArray()).toEqual([lead]);
    expect(await restoredDb.aiSkills.toArray()).toEqual([skill]);
    expect(await restoredDb.aiTeams.toArray()).toEqual([team]);
    expect(await restoredDb.aiTeamMembers.count()).toBe(2);
    expect(await restoredDb.aiTeamLinks.toArray()).toEqual([teamLink]);
  });

  it('refuses a partial AI Office payload before any clear (WR-10, D-20)', async () => {
    await seedOffice(restoredDb);

    // Carries one of the nine AI Office keys and omits the rest: the old `.some()` trigger
    // wiped the whole group and restored nothing in its place.
    const partial: BackupEnvelope = {
      ...v11EnvelopeWithoutOffice(),
      tables: { ...v11EnvelopeWithoutOffice().tables, aiTeamBatches: [] },
      counts: { ...v11EnvelopeWithoutOffice().counts, aiTeamBatches: 0 },
    };
    expect(validateBackupPayload(partial)).toMatchObject({ valid: true, errors: [] });

    await expect(restoreBackupPayload(partial, restoredDb)).rejects.toThrow(
      /thiếu bảng AI Office/
    );

    expect(await restoredDb.aiEmployees.toArray()).toEqual([employee]);
    expect(await restoredDb.aiLeads.toArray()).toEqual([lead]);
    expect(await restoredDb.aiTeams.toArray()).toEqual([team]);
    expect(await restoredDb.aiSkills.toArray()).toEqual([skill]);
    expect(await restoredDb.aiTeamMembers.count()).toBe(2);
    expect(await restoredDb.aiSkillVersions.count()).toBe(2);
  });

  it('rejects an aiTeamMembers row whose teamId names no team', async () => {
    await seedOffice(sourceDb);
    const envelope = await exportBackupPayload(sourceDb);

    const dangling = {
      ...envelope,
      tables: {
        ...envelope.tables,
        aiTeams: [],
        aiTeamLinks: [],
        aiTeamMembers: [{ ...employeeMember, teamId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }],
      },
    };

    const result = validateBackupPayload(dangling);

    expect(result.valid).toBe(false);
    expect(
      result.errors.some((error) => error.table === 'aiTeamMembers' && error.field === 'teamId')
    ).toBe(true);
  });

  it('refuses the whole payload before any write (D-20)', async () => {
    await seedOffice(restoredDb);
    const before = {
      teams: await restoredDb.aiTeams.toArray(),
      members: await restoredDb.aiTeamMembers.toArray(),
      messages: await restoredDb.chatMessages.toArray(),
    };

    await expect(
      restoreBackupPayload(
        {
          ...v11EnvelopeWithoutOffice(),
          tables: {
            ...v11EnvelopeWithoutOffice().tables,
            aiTeams: [{ ...team, leadId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }],
          },
        },
        restoredDb
      )
    ).rejects.toThrow(/validation/i);

    expect(await restoredDb.aiTeams.toArray()).toEqual(before.teams);
    expect(await restoredDb.aiTeamMembers.toArray()).toEqual(before.members);
    expect(await restoredDb.chatMessages.toArray()).toEqual(before.messages);
  });

  it('rejects a message whose agentKind is outside lead/employee', async () => {
    await seedOffice(sourceDb);
    const envelope = await exportBackupPayload(sourceDb);

    const invalid = {
      ...envelope,
      tables: {
        ...envelope.tables,
        chatMessages: [{ ...attributedMessage, agentKind: 'manager' }],
      },
    };

    const result = validateBackupPayload(invalid);

    expect(result.valid).toBe(false);
    expect(
      result.errors.some((error) => error.table === 'chatMessages' && error.field === 'agentKind')
    ).toBe(true);
  });

  // 37.1 §1.1: a pre-37.1 backup may still hold `messageKind: 'steer'` and the
  // `steerMessageIds` marker. Restoring must not fail, and the label must be normalized away
  // because nothing in the app reads it any more.
  it('restores a legacy steer row as an ordinary instruction', async () => {
    await seedOffice(sourceDb);
    const steerMessage: ChatMessage = {
      id: STEER_MESSAGE_ID,
      threadId: THREAD_ID,
      role: 'user',
      content: 'Chỉ đạo: ưu tiên kiểm tra migration.',
      createdAt: NOW,
      // A legacy row: the type no longer allows this, which is exactly what is under test.
      messageKind: 'steer' as ChatMessage['messageKind'],
      targetAgentId: EMPLOYEE_ID,
      batchId: BATCH_ID,
    };
    await sourceDb.chatMessages.add(steerMessage);

    const envelope = await exportBackupPayload(sourceDb);
    expect(validateBackupPayload(envelope)).toMatchObject({ valid: true, errors: [] });

    await restoreBackupPayload(envelope, restoredDb);

    const restoredMessage = await restoredDb.chatMessages.get(STEER_MESSAGE_ID);
    expect(restoredMessage?.messageKind).toBe('instruction');
    expect(restoredMessage?.targetAgentId).toBe(EMPLOYEE_ID);
    expect(restoredMessage?.batchId).toBe(BATCH_ID);
  });

  it('accepts leader-amend as a stop reason on both schemas', async () => {
    await seedOffice(sourceDb);
    const amendedMessage: ChatMessage = {
      ...attributedMessage,
      id: AMENDED_MESSAGE_ID,
      messageKind: 'report',
      runStatus: 'skipped',
      stopReason: 'leader-amend',
    };
    const amendedAssignment: AiTeamAssignment = {
      ...assignmentAttempt2,
      id: AMENDED_ASSIGNMENT_ID,
      runStatus: 'skipped',
      stopReason: 'leader-amend',
    };
    await sourceDb.chatMessages.add(amendedMessage);
    await sourceDb.aiTeamAssignments.add(amendedAssignment);

    const envelope = await exportBackupPayload(sourceDb);
    expect(validateBackupPayload(envelope)).toMatchObject({ valid: true, errors: [] });

    await restoreBackupPayload(envelope, restoredDb);

    expect((await restoredDb.chatMessages.get(AMENDED_MESSAGE_ID))?.stopReason).toBe(
      'leader-amend'
    );
    const restoredAssignment = await restoredDb.aiTeamAssignments.get(AMENDED_ASSIGNMENT_ID);
    expect(restoredAssignment?.stopReason).toBe('leader-amend');
    expect(restoredAssignment?.runStatus).toBe('skipped');
  });
});
