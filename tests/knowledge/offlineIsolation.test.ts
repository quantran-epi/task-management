import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db';
import { createNote, permanentDeleteNote, updateNote } from '../../src/db/repositories/noteRepo';
import { getDocumentPublishStatuses } from '../../src/db/repositories/documentSetRepo';
import { rankBM25 } from '../../src/utils/bm25';
import { createKnowledgeClient, KnowledgeClientError } from '../../src/services/knowledge/knowledgeClient';

const databases: TaskPlannerDatabase[] = [];

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.delete()));
  vi.unstubAllGlobals();
});

describe('optional daemon outage isolation', () => {
  it('keeps local CRUD, autosave-equivalent edits, folder moves, navigation data, BM25, and cached status with zero egress', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('daemon unavailable'));
    vi.stubGlobal('fetch', fetcher);
    const database = new TaskPlannerDatabase(`offline-isolation-${crypto.randomUUID()}`);
    databases.push(database);
    await database.open();

    const folder = await createNote({ title: 'Thư mục nghiệp vụ', body: '', type: 'folder' }, database);
    const document = await createNote({ title: 'Quy trình thẻ', body: '# Quy trình thẻ', type: 'document' }, database);
    await updateNote(document.id, { parentId: folder.id, body: '# Quy trình thẻ\nTra cứu ngoại tuyến' }, database);
    const navigation = await database.notes.where('parentId').equals(folder.id).toArray();
    expect(navigation.map((item) => item.id)).toContain(document.id);

    expect(rankBM25('tra cuu ngoai tuyen', navigation.map((item) => ({
      id: item.id, title: item.title ?? '', body: item.body, tags: item.tags ?? [],
    })))[0]?.doc.id).toBe(document.id);

    await database.documentSets.add({
      id: 'set-a', name: 'Bộ nghiệp vụ', documentIds: [document.id], createdAt: document.createdAt, updatedAt: document.updatedAt,
    });
    await database.publishAttempts.add({
      id: 'attempt-a', setId: 'set-a', startedAt: document.createdAt, status: 'Warning',
      addedCount: 1, changedCount: 0, removedCount: 0, unchangedCount: 0, warningCount: 1,
    });
    await database.publishedDocuments.add({
      setId: 'set-a', documentId: document.id, lastKnownRemoteAt: document.updatedAt,
      publishedContentHash: '0'.repeat(64), lastPrimaryState: 'Warning',
    });
    expect((await getDocumentPublishStatuses([document.id], database))[document.id]).toMatchObject({ aggregateState: 'Warning' });
    expect(await database.publishAttempts.get('attempt-a')).toMatchObject({ status: 'Warning', warningCount: 1 });

    await permanentDeleteNote(document.id, database);
    expect(await database.notes.get(document.id)).toBeUndefined();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('starts local persistence and search without daemon process or configuration', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const database = new TaskPlannerDatabase(`no-daemon-startup-${crypto.randomUUID()}`);
    databases.push(database);
    await database.open();
    const document = await createNote({ title: 'Khởi động cục bộ', body: 'Không cần máy chủ tri thức', type: 'document' }, database);

    expect(await database.notes.get(document.id)).toEqual(document);
    expect(rankBM25('khoi dong cuc bo', [{ id: document.id, title: document.title ?? '', body: document.body, tags: document.tags ?? [] }])).toHaveLength(1);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('gracefully reports NETWORK_ERROR for graph status and rebuild when daemon is offline without throwing unhandled exceptions', async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const client = createKnowledgeClient({
      baseUrl: 'http://127.0.0.1:3001',
      token: 'test-token',
      fetcher,
    });

    await expect(client.getGraphStatus('60000006-0000-4000-8000-000000000000')).rejects.toThrow(KnowledgeClientError);
    await expect(client.getGraphStatus('60000006-0000-4000-8000-000000000000')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });

    await expect(client.triggerGraphRebuild('60000006-0000-4000-8000-000000000000', 'rebuild-1')).rejects.toThrow(KnowledgeClientError);
    await expect(client.triggerGraphRebuild('60000006-0000-4000-8000-000000000000', 'rebuild-1')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });
});
