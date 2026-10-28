// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db';
import { saveMessage } from '../../src/db/repositories/chatRepo';
import { exportBackupPayload } from '../../src/services/backup/exportBackup';
import { restoreBackupPayload } from '../../src/services/backup/restoreBackup';
import { validateBackupPayload } from '../../src/services/backup/validateBackup';
import type { Note, Project } from '../../src/types/models';

const projectId = '11111111-1111-4111-8111-111111111111';
const threadId = '22222222-2222-4222-8222-222222222222';
const sessionId = '33333333-3333-4333-8333-333333333333';
const noteId = '44444444-4444-4444-8444-444444444444';
const setId = '55555555-5555-4555-8555-555555555555';
const artifactHash = 'a'.repeat(64);
const now = '2026-10-28T12:00:00.000Z';

const project: Project = {
  id: projectId,
  name: 'Wizard project',
  status: 'Open',
  createdAt: now,
  updatedAt: now,
};

const note: Note = {
  id: noteId,
  type: 'document',
  entityType: 'project',
  entityId: projectId,
  title: 'SOLUTION v1',
  body: '# Solution',
  isPinned: false,
  createdAt: now,
  updatedAt: now,
  sdlcArtifact: {
    kind: 'SOLUTION',
    projectId,
    threadId,
    sessionId,
    version: 1,
    inputHash: artifactHash,
    sourceArtifactIds: [],
    sourceArtifactHashes: [],
    approvedAt: now,
    idempotencyKey: `${sessionId}:1:SOLUTION`,
  },
};

const wizard = {
  schemaVersion: 1 as const,
  sessionId,
  projectId,
  threadId,
  skill: 'SOLUTION' as const,
  status: 'completed' as const,
  inputRevision: 1,
  draftRevision: 1,
  approvedAt: now,
  artifactId: noteId,
  artifactHash,
  renderPayload: { title: 'SOLUTION', featureMode: 'new' as const },
  createdAt: now,
  updatedAt: now,
};

describe('wizard backup parity and references', () => {
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    db = new TaskPlannerDatabase(`wizard-backup-${Date.now()}-${Math.random()}`);
    await db.open();
  });

  it('round-trips wizard, artifact, and exact SDLC set metadata', async () => {
    await db.projects.add(project);
    await db.notes.add(note);
    await db.documentSets.add({
      id: setId,
      name: 'Project SDLC set',
      documentIds: [noteId],
      sdlc: { projectId, purpose: 'sdlc' },
      createdAt: now,
      updatedAt: now,
    });
    await db.chatThreads.add({
      id: threadId,
      scopeKey: `project:${projectId}`,
      scopeType: 'project',
      entityId: projectId,
      createdAt: now,
      updatedAt: now,
    });
    await saveMessage({
      threadId,
      role: 'assistant',
      content: 'Approved solution',
      wizard,
    }, db);

    const backup = await exportBackupPayload(db);
    const validation = validateBackupPayload(backup);
    expect(validation.valid).toBe(true);

    const restored = new TaskPlannerDatabase(`wizard-backup-restore-${Date.now()}-${Math.random()}`);
    await restored.open();
    try {
      await restoreBackupPayload(backup, restored);
      expect(await restored.notes.get(noteId)).toEqual(note);
      expect(await restored.documentSets.get(setId)).toMatchObject({
        sdlc: { projectId, purpose: 'sdlc' },
      });
      expect((await restored.chatMessages.get((await db.chatMessages.toArray())[0]!.id))?.wizard).toEqual(wizard);
    } finally {
      await restored.delete();
    }
  });

  it('rejects orphan wizard project and duplicate project SDLC mapping before restore', async () => {
    const backup = {
      app: 'personal-task-planner' as const,
      schemaVersion: 10,
      exportedAt: now,
      tables: {
        projects: [project],
        milestones: [],
        tasks: [],
        capacityRules: [],
        capacityOverrides: [],
        plannedAllocations: [],
        chatThreads: [{
          id: threadId,
          scopeKey: `project:${projectId}`,
          scopeType: 'project' as const,
          entityId: projectId,
          createdAt: now,
          updatedAt: now,
        }],
        chatMessages: [{
          id: '66666666-6666-4666-8666-666666666666',
          threadId,
          role: 'assistant' as const,
          content: 'bad',
          createdAt: now,
          wizard: { ...wizard, projectId: '77777777-7777-4777-8777-777777777777' },
        }],
        notes: [],
        documentSets: [
          { id: setId, name: 'one', documentIds: [], sdlc: { projectId, purpose: 'sdlc' }, createdAt: now, updatedAt: now },
          { id: '88888888-8888-4888-8888-888888888888', name: 'two', documentIds: [], sdlc: { projectId, purpose: 'sdlc' }, createdAt: now, updatedAt: now },
        ],
      },
      counts: {
        projects: 1, milestones: 0, tasks: 0, capacityRules: 0, capacityOverrides: 0,
        plannedAllocations: 0, chatThreads: 1, chatMessages: 1, notes: 0, documentSets: 2,
      },
    };

    const result = validateBackupPayload(backup);
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.message.toLowerCase().includes('wizard'))).toBe(true);
    expect(result.errors.some((error) => error.message.includes('SDLC'))).toBe(true);
  });
});
