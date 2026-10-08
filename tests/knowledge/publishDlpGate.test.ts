// @vitest-environment node
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db';
import type { KnowledgeClient } from '../../src/services/knowledge/knowledgeClient';
import { PublishSession } from '../../src/services/knowledge/publishOrchestrator';
import type { DocumentSet, Note } from '../../src/types/models';
import { generateId } from '../../src/utils/uuid';

function note(id = generateId(), body = '# Pilot\n\nSafe body'): Note {
  const now = '2026-10-08T00:00:00.000Z';
  return {
    id,
    type: 'document',
    title: 'Process 60000006',
    body,
    tags: ['pilot'],
    isPinned: false,
    createdAt: now,
    updatedAt: now,
  };
}

function setFor(document: Note): DocumentSet {
  return {
    id: generateId(),
    name: 'Pilot set',
    documentIds: [document.id],
    createdAt: '2026-10-08T00:00:00.000Z',
    updatedAt: '2026-10-08T00:00:00.000Z',
  };
}

function client() {
  return {
    createPublishAttempt: vi.fn(async (snapshot, attemptKey) => ({
      attemptId: attemptKey,
      setId: snapshot.setId,
      status: 'Publishing' as const,
      startedAt: '2026-10-08T00:00:00.000Z',
      metrics: {
        addedCount: 1,
        changedCount: 0,
        removedCount: 0,
        unchangedCount: 0,
        warningCount: 0,
      },
    })),
    pollAttempt: vi.fn(async (attemptId) => ({
      attemptId,
      setId: generateId(),
      status: 'Publishing' as const,
      startedAt: '2026-10-08T00:00:00.000Z',
      metrics: {
        addedCount: 1,
        changedCount: 0,
        removedCount: 0,
        unchangedCount: 0,
        warningCount: 0,
      },
      uncertain: true,
    })),
  } as unknown as KnowledgeClient;
}

describe('PublishSession exact-preview DLP gate', () => {
  let dbName: string;
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    dbName = `PublishDlpGate_${generateId()}`;
    db = new TaskPlannerDatabase(dbName);
    await db.open();
  });

  afterEach(async () => {
    db.close();
    await Dexie.delete(dbName);
    vi.restoreAllMocks();
  });

  it('builds exact preview first with zero fetch and cannot scan or submit before preview', async () => {
    const remote = client();
    const session = new PublishSession({ client: remote, db });
    await expect(session.scan()).rejects.toThrow('preview');
    await expect(session.submitConfirmedAttempt('missing')).rejects.toThrow('preview');
    expect(remote.createPublishAttempt).not.toHaveBeenCalled();

    const document = note();
    const preview = await session.buildPreview({
      documentSet: setFor(document),
      notes: [document],
      activeManifest: null,
    });
    expect(preview.snapshot.documents[0]?.body).toBe(document.body);
    expect(remote.createPublishAttempt).not.toHaveBeenCalled();
  });

  it('requires removal consent, completed scan, and finding confirmation with zero bypass', async () => {
    const remote = client();
    const session = new PublishSession({ client: remote, db });
    const document = note(undefined, '# Pilot\n\nPAN 4111111111111111');
    const documentSet = setFor(document);
    const removedId = generateId();
    await session.buildPreview({
      documentSet,
      notes: [document],
      activeManifest: {
        snapshotId: generateId(),
        setId: documentSet.id,
        chunkingPolicyVersion: '2026.10.1',
        documents: [
          { documentId: removedId, title: 'Removed', contentHash: '1'.repeat(64), chunks: [] },
        ],
      },
    });
    await expect(session.scan()).rejects.toThrow('removal');
    session.cancelRemoval();
    expect(remote.createPublishAttempt).not.toHaveBeenCalled();

    session.confirmRemoval();
    const findings = await session.scan();
    expect(findings.length).toBeGreaterThan(0);
    await expect(session.submitConfirmedAttempt('missing')).rejects.toThrow('confirmation');
    expect(remote.createPublishAttempt).not.toHaveBeenCalled();

    const confirmation = await session.confirmFindings();
    session.closePreview();
    await expect(session.submitConfirmedAttempt(confirmation.nonce)).rejects.toThrow(
      'preview'
    );
    expect(remote.createPublishAttempt).not.toHaveBeenCalled();
  });

  it('writes content-free audit immediately before one exact frozen POST and asks again next attempt', async () => {
    const events: string[] = [];
    const remote = client();
    vi.mocked(remote.createPublishAttempt).mockImplementation(async (snapshot, attemptKey) => {
      events.push('post');
      expect(await db.dlpAudits.count()).toBe(1);
      expect(snapshot.documents[0]?.body).toContain('4111111111111111');
      return {
        attemptId: attemptKey,
        setId: snapshot.setId,
        status: 'Publishing',
        startedAt: '2026-10-08T00:00:00.000Z',
        metrics: {
          addedCount: 1,
          changedCount: 0,
          removedCount: 0,
          unchangedCount: 0,
          warningCount: 1,
        },
      };
    });
    const document = note(undefined, '# Pilot\n\nPAN 4111111111111111');
    const session = new PublishSession({ client: remote, db });
    await session.buildPreview({ documentSet: setFor(document), notes: [document], activeManifest: null });
    await session.scan();
    const confirmation = await session.confirmFindings();
    const result = await session.submitConfirmedAttempt(confirmation.nonce);
    expect(result.status).toBe('Publishing');
    expect(events).toEqual(['post']);
    expect(remote.createPublishAttempt).toHaveBeenCalledTimes(1);
    const serializedAudit = JSON.stringify(await db.dlpAudits.toArray());
    expect(serializedAudit).not.toContain('4111111111111111');
    await expect(session.submitConfirmedAttempt(confirmation.nonce)).rejects.toThrow('confirmation');
  });

  it('binds nonce to attempt, payload, manifest, and invalidates on rescan or mutation', async () => {
    const remote = client();
    const document = note(undefined, '# Pilot\n\npassword="secret-value"');
    const documentSet = setFor(document);
    const session = new PublishSession({ client: remote, db });
    const preview = await session.buildPreview({ documentSet, notes: [document], activeManifest: null });
    await session.scan();
    const first = await session.confirmFindings();
    await session.scan();
    await expect(session.submitConfirmedAttempt(first.nonce)).rejects.toThrow('confirmation');

    const second = await session.confirmFindings();
    expect(() => {
      (preview.snapshot.documents[0] as { title: string }).title = 'mutated';
    }).toThrow();
    await expect(session.submitConfirmedAttempt(`${second.nonce}-stale`)).rejects.toThrow(
      'confirmation'
    );
    expect(remote.createPublishAttempt).not.toHaveBeenCalled();
  });

  it('maps same-set conflict to current status and close after POST aborts polling only', async () => {
    const remote = client();
    vi.mocked(remote.createPublishAttempt).mockRejectedValueOnce(
      Object.assign(new Error('active'), { code: 'SET_PUBLISH_IN_PROGRESS', status: 409 })
    );
    const document = note();
    const session = new PublishSession({ client: remote, db });
    await session.buildPreview({ documentSet: setFor(document), notes: [document], activeManifest: null });
    await session.scan();
    const confirmation = await session.confirmFindings();
    await expect(session.submitConfirmedAttempt(confirmation.nonce)).resolves.toMatchObject({
      status: 'Publishing',
      conflict: true,
    });

    const second = new PublishSession({ client: remote, db });
    await second.buildPreview({ documentSet: setFor(document), notes: [document], activeManifest: null });
    await second.scan();
    const approval = await second.confirmFindings();
    await second.submitConfirmedAttempt(approval.nonce);
    const polling = second.pollAcceptedAttempt();
    second.closePreview();
    await polling;
    expect(remote.pollAttempt).toHaveBeenCalledOnce();
  });
});
