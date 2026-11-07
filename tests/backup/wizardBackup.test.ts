// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db';
import { saveMessage } from '../../src/db/repositories/chatRepo';
import { exportBackupPayload } from '../../src/services/backup/exportBackup';
import { restoreBackupPayload } from '../../src/services/backup/restoreBackup';
import { validateBackupPayload } from '../../src/services/backup/validateBackup';
import { saveSolutionVersion } from '../../src/services/wizard/artifactRepo';
import type { Note, ChangeRequest } from '../../src/types/models';

const changeRequestId = '11111111-1111-4111-8111-111111111111';
const threadId = '22222222-2222-4222-8222-222222222222';
const sessionId = '33333333-3333-4333-8333-333333333333';
const noteId = '44444444-4444-4444-8444-444444444444';
const setId = '55555555-5555-4555-8555-555555555555';
const artifactHash = 'a'.repeat(64);
const now = '2026-10-28T12:00:00.000Z';

const changeRequest: ChangeRequest = {
  id: changeRequestId,
  name: 'Wizard CR',
  code: 'CR-WIZ',
  status: 'Open',
  type: 'ENHANCEMENT',
  targets: [],
  createdAt: now,
  updatedAt: now,
};

const note: Note = {
  id: noteId,
  type: 'document',
  entityType: 'cr',
  entityId: changeRequestId,
  title: 'SOLUTION v1',
  body: '# Solution',
  isPinned: false,
  createdAt: now,
  updatedAt: now,
  sdlcArtifact: {
    kind: 'SOLUTION',
    changeRequestId,
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
  changeRequestId,
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
    await db.changeRequests.add(changeRequest);
    await db.notes.add(note);
    await db.documentSets.add({
      id: setId,
      name: 'CR SDLC set',
      documentIds: [noteId],
      sdlc: { changeRequestId, purpose: 'sdlc' },
      createdAt: now,
      updatedAt: now,
    });
    await db.chatThreads.add({
      id: threadId,
      scopeKey: `cr:${changeRequestId}`,
      scopeType: 'cr',
      entityId: changeRequestId,
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
        sdlc: { changeRequestId, purpose: 'sdlc' },
      });
      expect((await restored.chatMessages.get((await db.chatMessages.toArray())[0]!.id))?.wizard).toEqual(wizard);
    } finally {
      await restored.delete();
    }
  });

  it('round-trips canonical Markdown and export payload created by atomic save', async () => {
    await db.changeRequests.add(changeRequest);
    await db.chatThreads.add({
      id: threadId,
      scopeKey: `cr:${changeRequestId}`,
      scopeType: 'cr',
      entityId: changeRequestId,
      createdAt: now,
      updatedAt: now,
    });
    await db.chatMessages.add({
      id: '99999999-9999-4999-8999-999999999999',
      threadId,
      role: 'assistant',
      content: 'Approved solution preview',
      createdAt: now,
      wizard: {
        ...wizard,
        status: 'approved',
        artifactId: null,
      },
    });
    const saved = await saveSolutionVersion({
      changeRequestId,
      threadId,
      sessionId,
      inputRevision: 1,
      draftRevision: 1,
      inputHash: artifactHash,
      markdown: '# Solution\n\nCanonical body',
      exportPayload: { schemaVersion: 1, sections: [{ id: 'scope', text: 'Canonical body' }] },
      approvedAt: now,
    }, db);

    const backup = await exportBackupPayload(db);
    const restored = new TaskPlannerDatabase(`wizard-artifact-restore-${Date.now()}-${Math.random()}`);
    await restored.open();
    try {
      await restoreBackupPayload(backup, restored);
      expect(await restored.notes.get(saved.note.id)).toEqual(saved.note);
      expect(JSON.parse((await restored.notes.get(saved.note.id))!.body)).toEqual({
        markdown: '# Solution\n\nCanonical body',
        exportPayload: { schemaVersion: 1, sections: [{ id: 'scope', text: 'Canonical body' }] },
      });
    } finally {
      await restored.delete();
    }
  });

  it('rejects a legacy pre-31.2 envelope before restore', async () => {
    const backup = {
      app: 'personal-task-planner' as const,
      schemaVersion: 10,
      exportedAt: now,
      tables: {
        projects: [changeRequest],
        milestones: [],
        tasks: [],
        capacityRules: [],
        capacityOverrides: [],
        plannedAllocations: [],
        chatThreads: [],
        chatMessages: [],
        notes: [],
        documentSets: [],
      },
      counts: {
        projects: 1, milestones: 0, tasks: 0, capacityRules: 0, capacityOverrides: 0,
        plannedAllocations: 0, chatThreads: 0, chatMessages: 0, notes: 0, documentSets: 0,
      },
    };

    const result = validateBackupPayload(backup);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((error) => error.message.includes('Backup phiên bản cũ không còn được hỗ trợ'))
    ).toBe(true);
  });
});
