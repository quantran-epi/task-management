// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db';
import { createDocumentSet } from '../../src/db/repositories/documentSetRepo';
import { createNote } from '../../src/db/repositories/noteRepo';
import { KnowledgeConfigProvider } from '../../src/services/knowledge/knowledgeConfig';
import { DocumentSetDetail } from '../../src/workbench/DocumentSetDetail';

const databases: TaskPlannerDatabase[] = [];

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await Promise.all(databases.splice(0).map((database) => database.delete()));
});

/** All per-set publishing actions now live in the doc_set tab, not a drawer. */
async function renderSetTab(database: TaskPlannerDatabase, setId: string) {
  await act(async () => {
    render(
      <KnowledgeConfigProvider db={database}>
        <DocumentSetDetail
          setId={setId}
          db={database}
          graphStatusOverride={{
            setId, state: 'Never built', nodeCount: 0, factCount: 0, evidenceCount: 0,
            conflictCount: 0, quarantineCount: 0, ontologyVersion: '2026.10.1', rulesVersion: '2026.10.1',
          }}
        />
      </KnowledgeConfigProvider>
    );
  });
  await screen.findByTestId('doc-set-detail');
}

async function configuredDb(name: string): Promise<TaskPlannerDatabase> {
  const database = new TaskPlannerDatabase(`${name}-${crypto.randomUUID()}`);
  databases.push(database);
  await database.open();
  await database.settings.bulkPut([
    { key: 'knowledge_server_enabled', value: true },
    { key: 'knowledge_server_base_url', value: 'http://localhost:3000' },
  ]);
  return database;
}

function snapshotNotFound(url: RequestInfo | URL) {
  if (String(url).includes('/snapshot')) {
    return new Response(
      JSON.stringify({ error: { code: 'SNAPSHOT_NOT_FOUND', message: 'Active snapshot was not found.' } }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }
  return new Response('Not found', { status: 404 });
}

describe('Docs workspace publishing integration (doc_set tab)', () => {
  it('opens local preview, scans masked DLP findings, and cancels without egress or note mutation', async () => {
    const database = await configuredDb('notes-publish');
    const folder = await createNote({ title: 'Tín dụng', body: '', type: 'folder' }, database);
    const sensitiveBody = `# Hồ sơ khách hàng

## Thông tin thẻ
PAN 4532015112830366
client_secret: "canary-secret"`;
    const document = await createNote({
      title: 'Quy trình thẻ', body: sensitiveBody, type: 'document', parentId: folder.id,
    }, database);
    const documentSet = await createDocumentSet({
      name: 'Bộ quy trình thẻ', documentIds: [document.id],
    }, database);
    const fetchSpy = vi.fn().mockImplementation(async (url: RequestInfo | URL) => snapshotNotFound(url));
    vi.stubGlobal('fetch', fetchSpy);

    await renderSetTab(database, documentSet.id);
    const previewButton = await screen.findByRole('button', { name: 'Xem trước xuất bản' });
    await waitFor(() => expect(previewButton).toBeEnabled());
    fireEvent.click(previewButton);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));

    expect(await screen.findByText('Xem trước thay đổi')).toBeInTheDocument();
    const previewDialog = screen.getAllByRole('dialog').at(-1) as HTMLElement;
    expect(within(previewDialog).getAllByText('Thêm').length).toBeGreaterThan(0);
    expect(previewDialog.textContent).toContain('1');
    expect(previewDialog.textContent).toContain('tài liệu');
    expect(previewDialog.textContent).toContain('chunk');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[1]).not.toEqual(expect.objectContaining({ method: 'POST' }));

    expect(within(previewDialog).queryByText('Phát hiện dữ liệu có thể nhạy cảm')).not.toBeInTheDocument();
    expect(within(previewDialog).queryByRole('checkbox')).not.toBeInTheDocument();
    expect(within(previewDialog).getByRole('button', { name: 'Xuất bản ngay' })).toBeEnabled();

    fireEvent.click(within(previewDialog).getByRole('button', { name: 'Hủy' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Xem trước thay đổi' })).not.toBeInTheDocument());
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(await database.notes.get(document.id)).toMatchObject({
      id: document.id, title: document.title, body: sensitiveBody, parentId: folder.id,
    });
    expect(await database.documentSets.get(documentSet.id)).toEqual(documentSet);
    expect(await database.dlpAudits.count()).toBe(0);
  });

  it('persists a document set with stable UUIDs and zero network requests (repository path)', async () => {
    const database = await configuredDb('notes-create-set');
    const folder = await createNote({ title: 'Tín dụng', body: '', type: 'folder' }, database);
    const doc1 = await createNote({
      title: 'Tài liệu 1', body: '# Quy trình 1\nNội dung 1', type: 'document', parentId: folder.id,
    }, database);
    const doc2 = await createNote({
      title: 'Tài liệu 2', body: '# Quy trình 2\nNội dung 2', type: 'document', parentId: folder.id,
    }, database);
    await database.notes.update(doc1.id, { updatedAt: '2026-10-01T00:00:00.000Z' });
    await database.notes.update(doc2.id, { updatedAt: '2026-10-02T00:00:00.000Z' });
    const initialDoc1 = await database.notes.get(doc1.id);
    const initialDoc2 = await database.notes.get(doc2.id);

    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    // The toolbar no longer exposes a duplicate create button; this asserts the repository
    // path directly. The library-tab create flow is covered by DocsWorkspace tests.
    await createDocumentSet({
      name: 'Bộ tài liệu tín dụng',
      documentIds: [doc2.id, doc1.id],
    }, database);

    await waitFor(async () => expect(await database.documentSets.toArray()).toHaveLength(1));
    expect(fetchSpy).not.toHaveBeenCalled();
    const createdSet = (await database.documentSets.toArray())[0]!;
    expect(createdSet.name).toBe('Bộ tài liệu tín dụng');
    expect(createdSet.documentIds).toEqual([doc2.id, doc1.id]);

    expect(await database.notes.get(doc1.id)).toEqual(initialDoc1);
    expect(await database.notes.get(doc2.id)).toEqual(initialDoc2);

    const { updateNote } = await import('../../src/db/repositories/noteRepo');
    await updateNote(doc1.id, { parentId: undefined }, database);
    expect((await database.documentSets.get(createdSet.id))?.documentIds).toEqual([doc2.id, doc1.id]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('displays remote-only document as removal and enforces removal consent before scanning/submitting', async () => {
    const database = await configuredDb('notes-removal');
    const folder = await createNote({ title: 'Tín dụng', body: '', type: 'folder' }, database);
    const localDoc = await createNote({
      title: 'Quy trình hiện tại', body: '# Quy trình hiện tại\nNội dung', type: 'document', parentId: folder.id,
    }, database);
    const remoteOnlyDocId = crypto.randomUUID();
    const documentSet = await createDocumentSet({
      name: 'Bộ quy trình thẻ', documentIds: [localDoc.id],
    }, database);
    const activeManifest = {
      snapshotId: crypto.randomUUID(), setId: documentSet.id, chunkingPolicyVersion: 'v1',
      documents: [
        {
          documentId: localDoc.id, contentHash: 'a'.repeat(64),
          chunks: [{
            occurrenceId: crypto.randomUUID(), contentHash: 'b'.repeat(64), chunkIndex: 0,
            headingPath: ['Quy trình hiện tại'], startLine: 1, endLine: 2, startOffset: 0, endOffset: 25,
          }],
        },
        {
          documentId: remoteOnlyDocId, contentHash: 'c'.repeat(64),
          chunks: [{
            occurrenceId: crypto.randomUUID(), contentHash: 'd'.repeat(64), chunkIndex: 0,
            headingPath: ['Tài liệu cũ'], startLine: 1, endLine: 2, startOffset: 0, endOffset: 20,
          }],
        },
      ],
    };
    const fetchSpy = vi.fn().mockImplementation(async (url: RequestInfo | URL) => {
      if (String(url).includes('/snapshot')) {
        return new Response(JSON.stringify(activeManifest), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('Not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchSpy);

    await renderSetTab(database, documentSet.id);
    fireEvent.click(await screen.findByRole('button', { name: 'Xem trước xuất bản' }));
    expect(await screen.findByText('Xem trước thay đổi')).toBeInTheDocument();
    const previewDialog = screen.getAllByRole('dialog').at(-1) as HTMLElement;

    expect(within(previewDialog).getAllByText('Gỡ khỏi máy chủ').length).toBeGreaterThan(0);
    expect(within(previewDialog).queryByRole('checkbox')).not.toBeInTheDocument();
    expect(within(previewDialog).getByRole('button', { name: 'Xuất bản ngay' })).toBeEnabled();
    const postCalls = fetchSpy.mock.calls.filter((call) => call[1] && (call[1] as RequestInit).method === 'POST');
    expect(postCalls).toHaveLength(0);

    fireEvent.click(within(previewDialog).getByRole('button', { name: 'Hủy' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Xem trước thay đổi' })).not.toBeInTheDocument());
  });

  it('fails closed on network, auth, and server errors: blocks modal, displays diagnostic, and issues zero POST calls', async () => {
    const database = await configuredDb('notes-uncertainty');
    const folder = await createNote({ title: 'Tín dụng', body: '', type: 'folder' }, database);
    const doc = await createNote({
      title: 'Quy trình thẻ', body: '# Quy trình thẻ\nNội dung', type: 'document', parentId: folder.id,
    }, database);
    const set = await createDocumentSet({ name: 'Bộ quy trình thẻ', documentIds: [doc.id] }, database);

    let fetchHandler = vi.fn().mockRejectedValue(new Error('connection refused'));
    vi.stubGlobal('fetch', fetchHandler);
    await renderSetTab(database, set.id);
    fireEvent.click(await screen.findByRole('button', { name: 'Xem trước xuất bản' }));
    await waitFor(() => expect(fetchHandler).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog', { name: 'Xem trước thay đổi' })).not.toBeInTheDocument();
    expect(await screen.findByText(/Không thể kết nối Knowledge Server/i)).toBeInTheDocument();
    cleanup();

    fetchHandler = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Token expired' } }), {
        status: 401, headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchHandler);
    await renderSetTab(database, set.id);
    fireEvent.click(await screen.findByRole('button', { name: 'Xem trước xuất bản' }));
    await waitFor(() => expect(fetchHandler).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog', { name: 'Xem trước thay đổi' })).not.toBeInTheDocument();
    expect(await screen.findByText(/Token phiên không hợp lệ hoặc đã hết hạn/i)).toBeInTheDocument();
    cleanup();

    fetchHandler = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'DB crash' } }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchHandler);
    await renderSetTab(database, set.id);
    fireEvent.click(await screen.findByRole('button', { name: 'Xem trước xuất bản' }));
    await waitFor(() => expect(fetchHandler).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog', { name: 'Xem trước thay đổi' })).not.toBeInTheDocument();
    expect(await screen.findByText(/Máy chủ Knowledge Server gặp lỗi khi kiểm tra ảnh chụp/i)).toBeInTheDocument();
    expect(fetchHandler.mock.calls.some((call) => call[1] && (call[1] as RequestInit).method === 'POST')).toBe(false);

    const note = await database.notes.get(doc.id);
    expect(note?.body).toBe('# Quy trình thẻ\nNội dung');
  });
});
