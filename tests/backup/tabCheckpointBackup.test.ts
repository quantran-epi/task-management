// @vitest-environment node
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db';
import { exportBackupPayload } from '../../src/services/backup/exportBackup';
import { validateBackupPayload } from '../../src/services/backup/validateBackup';
import type { ChatTab, ChatThread, Note, Project } from '../../src/types/models';

const projectId = '11111111-1111-4111-8111-111111111111';
const threadId = '22222222-2222-4222-8222-222222222222';
const tabId = '33333333-3333-4333-8333-333333333333';
const sourceNoteId = '44444444-4444-4444-8444-444444444444';
const sessionId = '55555555-5555-4555-8555-555555555555';
const requestId = '66666666-6666-4666-8666-666666666666';
const now = '2026-10-30T12:00:00.000Z';
const hash = 'a'.repeat(64);

const project: Project = {
  id: projectId,
  name: 'Backup project',
  status: 'Open',
  createdAt: now,
  updatedAt: now,
};

const thread: ChatThread = {
  id: threadId,
  scopeKey: `project:${projectId}:sdlc`,
  scopeType: 'project',
  entityId: projectId,
  title: 'SDLC',
  createdAt: now,
  updatedAt: now,
};

const sourceNote: Note = {
  id: sourceNoteId,
  type: 'document',
  entityType: 'project',
  entityId: projectId,
  title: 'PL01 source',
  body: '# Requirement',
  isPinned: false,
  createdAt: now,
  updatedAt: now,
};

const workflowState = {
  schemaVersion: 1,
  sessionId,
  projectId,
  threadId,
  currentStep: 'SOLUTION',
  metadata: {
    cr: 'CR-1',
    featureName: 'Backup contract',
    author: 'Dev',
    requestingUnit: 'IT',
    date: '2026-10-30',
  },
  artifacts: {
    pl01: {
      noteId: sourceNoteId,
      kind: 'PL01',
      version: 2,
      hash,
      title: 'PL01 source',
      content: '# Requirement',
      sourceHashes: [],
      updatedAt: now,
    },
  },
  staleSteps: [],
  checkpoint: {
    requestId,
    step: 'SOLUTION',
    status: 'interrupted',
    startedAt: now,
  },
  createdAt: now,
  updatedAt: now,
};

function makeTab(overrides: Partial<ChatTab> = {}): ChatTab {
  return {
    id: tabId,
    threadId,
    scopeKey: `project:${projectId}`,
    type: 'sdlc',
    title: 'SDLC Workflow',
    order: 0,
    active: true,
    config: {
      model: 'model-a',
      analysisMode: true,
      mcpEnabled: false,
      knowledgeEnabled: true,
      promptContextOptions: { maxChars: 12000 },
    },
    workflowState,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function baseTables() {
  return {
    projects: [project],
    milestones: [],
    tasks: [],
    capacityRules: [],
    capacityOverrides: [],
    plannedAllocations: [],
    notes: [sourceNote],
    chatThreads: [thread],
    chatMessages: [],
    chatTabs: [makeTab()],
  };
}

function basePayload() {
  const tables = baseTables();
  return {
    app: 'personal-task-planner' as const,
    schemaVersion: 10,
    exportedAt: now,
    tables,
    counts: {
      projects: 1,
      milestones: 0,
      tasks: 0,
      capacityRules: 0,
      capacityOverrides: 0,
      plannedAllocations: 0,
      notes: 1,
      chatThreads: 1,
      chatMessages: 0,
      chatTabs: 1,
    },
  };
}

describe('Phase 25.1 backup tab/checkpoint contract', () => {
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    db = new TaskPlannerDatabase(`tab-backup-${Date.now()}-${Math.random()}`);
    await db.open();
    await db.projects.add(project);
    await db.notes.add(sourceNote);
    await db.chatThreads.add(thread);
    await db.chatTabs.add(makeTab());
  });

  afterEach(async () => {
    await db.delete();
  });

  it('round-trips durable tab, active pointer, safe config, checkpoint, workflow, and valid history', async () => {
    await db.chatMessages.add({
      id: '77777777-7777-4777-8777-777777777777',
      threadId,
      role: 'user',
      content: 'Continue workflow',
      createdAt: now,
    });

    const backup = await exportBackupPayload(db);

    expect(backup.tables.chatTabs).toHaveLength(1);
    expect(backup.counts.chatTabs).toBe(1);
    expect(backup.tables.chatTabs?.[0]).toMatchObject({
      id: tabId,
      threadId,
      active: true,
      config: { model: 'model-a', analysisMode: true },
      workflowState: { checkpoint: { requestId, status: 'interrupted' } },
    });
    expect(JSON.stringify(backup)).not.toContain('apiKey');
    expect(JSON.stringify(backup)).not.toContain('passphrase');

    const validation = validateBackupPayload(backup);
    expect(validation.valid).toBe(true);
    expect(validation.envelope?.tables.chatTabs?.[0]?.workflowState).toEqual(workflowState);
    expect(validation.envelope?.tables.chatMessages).toHaveLength(1);
  });

  it('omits nested secrets, partial buffers, runtime errors, prompts, and raw responses from export', async () => {
    await db.chatTabs.update(tabId, {
      config: {
        ...makeTab().config,
        apiKey: 'secret-api-key',
        passphrase: 'secret-passphrase',
      } as ChatTab['config'],
      workflowState: {
        ...workflowState,
        runtime: {
          partialBuffer: 'partial output',
          error: { stack: 'secret stack' },
          prompt: 'private prompt',
          rawModelResponse: 'raw provider response',
        },
      },
    });

    const backup = await exportBackupPayload(db);
    const serialized = JSON.stringify(backup);
    expect(serialized).not.toContain('secret-api-key');
    expect(serialized).not.toContain('secret-passphrase');
    expect(serialized).not.toContain('partial output');
    expect(serialized).not.toContain('secret stack');
    expect(serialized).not.toContain('private prompt');
    expect(serialized).not.toContain('raw provider response');
    expect(validateBackupPayload(backup).valid).toBe(true);
  });

  it('normalizes missing source Note to blocked interrupted recovery without side effects', () => {
    const payload = basePayload();
    payload.tables.notes = [];

    const result = validateBackupPayload(payload);

    expect(result.valid).toBe(true);
    expect(result.recovery?.missingSources).toEqual([expect.objectContaining({ id: sourceNoteId, title: 'PL01 source', version: 2, hash })]);
    expect(result.recovery?.blockedTabs).toEqual([
      expect.objectContaining({ tabId, threadId, missingSourceIds: [sourceNoteId] }),
    ]);
    expect(result.envelope?.tables.chatTabs?.[0]?.workflowState).toMatchObject({
      checkpoint: expect.objectContaining({ status: 'interrupted', step: 'SOLUTION' }),
    });
    expect(result.envelope?.tables.chatTabs?.[0]?.workflowState).not.toHaveProperty('runtime');
  });

  it('rejects duplicate SDLC tabs, orphan pointers, stale thread links, and forbidden nested keys', () => {
    const duplicate = basePayload();
    duplicate.tables.chatTabs = [makeTab(), makeTab({ id: '88888888-8888-4888-8888-888888888888' })];
    expect(validateBackupPayload(duplicate).valid).toBe(false);

    const orphan = basePayload();
    orphan.tables.chatTabs = [makeTab({ threadId: '99999999-9999-4999-8999-999999999999' })];
    expect(validateBackupPayload(orphan).valid).toBe(false);

    const forbidden = basePayload();
    forbidden.tables.chatTabs = [makeTab({ workflowState: { ...workflowState, nested: { bearerToken: 'x' } } })];
    const forbiddenResult = validateBackupPayload(forbidden);
    expect(forbiddenResult.valid).toBe(false);
    expect(forbiddenResult.errors.some((error) => error.table === 'chatTabs' && (error.message.includes('FORBIDDEN_FIELD') || error.field.includes('workflowState')))).toBe(true);
  });

  it('accepts pre-25.1 payloads without chatTabs or new workflow fields', () => {
    const legacy = basePayload();
    delete (legacy.tables as Partial<typeof legacy.tables>).chatTabs;
    delete (legacy.counts as Partial<typeof legacy.counts>).chatTabs;

    const result = validateBackupPayload(legacy);

    expect(result.valid).toBe(true);
    expect(result.envelope?.tables.chatTabs).toBeUndefined();
  });
});
