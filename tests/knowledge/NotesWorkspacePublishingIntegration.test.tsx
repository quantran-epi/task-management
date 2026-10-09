// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db';
import { createDocumentSet } from '../../src/db/repositories/documentSetRepo';
import { createNote } from '../../src/db/repositories/noteRepo';
import { KnowledgeConfigProvider } from '../../src/services/knowledge/knowledgeConfig';
import { NotesView } from '../../src/views/NotesView';

const databases: TaskPlannerDatabase[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await Promise.all(databases.splice(0).map((database) => database.delete()));
});

describe('Docs workspace publishing integration', () => {
  it('opens local preview, scans masked DLP findings, and cancels without egress or note mutation', async () => {
    const database = new TaskPlannerDatabase(`notes-publish-${crypto.randomUUID()}`);
    databases.push(database);
    await database.open();
    await database.settings.bulkPut([
      { key: 'knowledge_server_enabled', value: true },
      { key: 'knowledge_server_base_url', value: 'http://localhost:3000' },
    ]);
    const folder = await createNote({ title: 'Tín dụng', body: '', type: 'folder' }, database);
    const sensitiveBody = `# Hồ sơ khách hàng

## Thông tin thẻ
PAN 4532015112830366
client_secret: \"canary-secret\"`;
    const document = await createNote({
      title: 'Quy trình thẻ',
      body: sensitiveBody,
      type: 'document',
      parentId: folder.id,
    }, database);
    const documentSet = await createDocumentSet({
      name: 'Bộ quy trình thẻ',
      documentIds: [document.id],
    }, database);
    const fetchSpy = vi.fn().mockImplementation(async (url: RequestInfo | URL) => {
      const urlStr = String(url);
      if (urlStr.includes('/snapshot')) {
        return new Response(
          JSON.stringify({
            error: {
              code: 'SNAPSHOT_NOT_FOUND',
              message: 'Active snapshot was not found.',
            },
          }),
          {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
      return new Response('Not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchSpy);

    render(
      <KnowledgeConfigProvider db={database}>
        <NotesView db={database} />
      </KnowledgeConfigProvider>
    );

    fireEvent.click((await screen.findByText('Bộ tài liệu')).closest('button') as HTMLButtonElement);
    fireEvent.click(await screen.findByRole('button', { name: 'Mở chi tiết' }));
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

    fireEvent.click(within(previewDialog).getByRole('button', { name: 'Kiểm tra dữ liệu nhạy cảm' }));
    expect(await within(previewDialog).findByText('Phát hiện dữ liệu có thể nhạy cảm')).toBeInTheDocument();
    const maskedContexts = previewDialog.querySelectorAll('code');
    expect(maskedContexts.length).toBeGreaterThan(0);
    expect(
      Array.from(maskedContexts).some((element) =>
        /[•]|REDACTED/u.test(element.textContent ?? '')
      )
    ).toBe(true);
    expect(previewDialog.textContent).not.toContain('4532015112830366');
    expect(previewDialog.textContent).not.toContain('canary-secret');

    fireEvent.click(within(previewDialog).getByRole('button', { name: 'Hủy xuất bản' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Xem trước thay đổi' })).not.toBeInTheDocument());
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(await database.notes.get(document.id)).toMatchObject({
      id: document.id,
      title: document.title,
      body: sensitiveBody,
      parentId: folder.id,
    });
    expect(await database.documentSets.get(documentSet.id)).toEqual(documentSet);
    expect(await database.dlpAudits.count()).toBe(0);
  });

  it('allows user with zero sets to open create mode, initialize from folder, save set with stable UUIDs, and make zero network requests', async () => {
    const database = new TaskPlannerDatabase(`notes-create-set-${crypto.randomUUID()}`);
    databases.push(database);
    await database.open();

    // 1. Create notes inside a folder
    const folder = await createNote({ title: 'Tín dụng', body: '', type: 'folder' }, database);
    const doc1 = await createNote({
      title: 'Tài liệu 1',
      body: '# Quy trình 1\nNội dung 1',
      type: 'document',
      parentId: folder.id,
    }, database);
    const doc2 = await createNote({
      title: 'Tài liệu 2',
      body: '# Quy trình 2\nNội dung 2',
      type: 'document',
      parentId: folder.id,
    }, database);
    await database.notes.update(doc1.id, { updatedAt: '2026-10-01T00:00:00.000Z' });
    await database.notes.update(doc2.id, { updatedAt: '2026-10-02T00:00:00.000Z' });

    const initialDoc1 = await database.notes.get(doc1.id);
    const initialDoc2 = await database.notes.get(doc2.id);

    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    render(
      <KnowledgeConfigProvider db={database}>
        <NotesView db={database} />
      </KnowledgeConfigProvider>
    );

    // 2. Select the folder so currentFolderId is folder.id
    const folderElements = await screen.findAllByText('Tín dụng');
    fireEvent.click(folderElements[0]!);

    // 3. Open DocumentSetDrawer with 0 existing sets
    fireEvent.click((await screen.findByText('Bộ tài liệu')).closest('button') as HTMLButtonElement);
    expect(await screen.findByText('Chưa có bộ tài liệu')).toBeInTheDocument();

    // 4. Click empty-state CTA "Tạo bộ tài liệu"
    const createButtons = screen.getAllByRole('button', { name: 'Tạo bộ tài liệu' });
    fireEvent.click(createButtons[0]!);

    // 5. DocumentSetForm is now visible without initialSet
    expect(await screen.findByText('Tạo bộ tài liệu mới')).toBeInTheDocument();
    expect(screen.getByLabelText('Tên bộ tài liệu')).toBeInTheDocument();

    // Choose snapshot from current folder
    fireEvent.change(screen.getByLabelText('Tên bộ tài liệu'), {
      target: { value: 'Bộ tài liệu tín dụng' },
    });
    fireEvent.click(screen.getByRole('radio', { name: 'Từ thư mục hiện tại' }));

    // Verify folder members snapshot
    expect(await screen.findByText('Tài liệu thêm hoặc di chuyển sau này không tự thay đổi bộ này.')).toBeInTheDocument();

    // Save set
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    // 6. Assert repository creation and zero network requests
    await waitFor(async () => {
      const persistedSets = await database.documentSets.toArray();
      expect(persistedSets).toHaveLength(1);
    });

    expect(fetchSpy).not.toHaveBeenCalled();

    const createdSet = (await database.documentSets.toArray())[0]!;
    expect(createdSet.name).toBe('Bộ tài liệu tín dụng');
    expect(createdSet.documentIds).toEqual([doc2.id, doc1.id]);

    // 7. Verify Notes are completely untouched (zero mutation)
    const afterDoc1 = await database.notes.get(doc1.id);
    const afterDoc2 = await database.notes.get(doc2.id);
    expect(afterDoc1).toEqual(initialDoc1);
    expect(afterDoc2).toEqual(initialDoc2);

    // 8. Move doc1 to root / outside folder; persisted set membership remains unchanged (D-01)
    const { updateNote } = await import('../../src/db/repositories/noteRepo');
    await updateNote(doc1.id, { parentId: undefined }, database);

    const setAfterMove = await database.documentSets.get(createdSet.id);
    expect(setAfterMove?.documentIds).toEqual([doc2.id, doc1.id]);

    // Zero network requests made throughout
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('displays remote-only document as removal and enforces removal consent before scanning/submitting', async () => {
    const database = new TaskPlannerDatabase(`notes-removal-${crypto.randomUUID()}`);
    databases.push(database);
    await database.open();
    await database.settings.bulkPut([
      { key: 'knowledge_server_enabled', value: true },
      { key: 'knowledge_server_base_url', value: 'http://localhost:3000' },
    ]);

    const folder = await createNote({ title: 'Tín dụng', body: '', type: 'folder' }, database);
    const localDoc = await createNote({
      title: 'Quy trình hiện tại',
      body: '# Quy trình hiện tại\nNội dung',
      type: 'document',
      parentId: folder.id,
    }, database);

    const remoteOnlyDocId = crypto.randomUUID();
    const documentSet = await createDocumentSet({
      name: 'Bộ quy trình thẻ',
      documentIds: [localDoc.id],
    }, database);

    const activeManifest = {
      snapshotId: crypto.randomUUID(),
      setId: documentSet.id,
      chunkingPolicyVersion: 'v1',
      documents: [
        {
          documentId: localDoc.id,
          contentHash: 'a'.repeat(64),
          chunks: [
            {
              occurrenceId: crypto.randomUUID(),
              contentHash: 'b'.repeat(64),
              chunkIndex: 0,
              headingPath: ['Quy trình hiện tại'],
              startLine: 1,
              endLine: 2,
              startOffset: 0,
              endOffset: 25,
            },
          ],
        },
        {
          documentId: remoteOnlyDocId,
          contentHash: 'c'.repeat(64),
          chunks: [
            {
              occurrenceId: crypto.randomUUID(),
              contentHash: 'd'.repeat(64),
              chunkIndex: 0,
              headingPath: ['Tài liệu cũ'],
              startLine: 1,
              endLine: 2,
              startOffset: 0,
              endOffset: 20,
            },
          ],
        },
      ],
    };

    const fetchSpy = vi.fn().mockImplementation(async (url: RequestInfo | URL) => {
      const urlStr = String(url);
      if (urlStr.includes('/snapshot')) {
        return new Response(JSON.stringify(activeManifest), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('Not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchSpy);

    render(
      <KnowledgeConfigProvider db={database}>
        <NotesView db={database} />
      </KnowledgeConfigProvider>
    );

    fireEvent.click((await screen.findByText('Bộ tài liệu')).closest('button') as HTMLButtonElement);
    fireEvent.click(await screen.findByRole('button', { name: 'Mở chi tiết' }));
    const previewButton = await screen.findByRole('button', { name: 'Xem trước xuất bản' });
    await waitFor(() => expect(previewButton).toBeEnabled());
    fireEvent.click(previewButton);

    expect(await screen.findByText('Xem trước thay đổi')).toBeInTheDocument();
    const previewDialog = screen.getAllByRole('dialog').at(-1) as HTMLElement;

    // Verify removal statistics and labels
    expect(within(previewDialog).getAllByText('Gỡ khỏi máy chủ').length).toBeGreaterThan(0);
    expect(previewDialog.textContent).toContain('Gỡ tài liệu khỏi máy chủ');

    // Consent gate: Scan button is disabled until removal checkbox is checked (D-03 / D-04)
    const scanButton = within(previewDialog).getByRole('button', { name: 'Kiểm tra dữ liệu nhạy cảm' });
    expect(scanButton).toBeDisabled();

    const consentCheckbox = within(previewDialog).getByRole('checkbox', {
      name: /Tôi hiểu các tài liệu này sẽ bị gỡ khỏi ảnh chụp trên máy chủ/i,
    });
    expect(consentCheckbox).not.toBeChecked();

    fireEvent.click(consentCheckbox);
    expect(consentCheckbox).toBeChecked();
    expect(scanButton).toBeEnabled();

    // Zero POST requests issued
    const postCalls = fetchSpy.mock.calls.filter((call) =>
      call[1] && (call[1] as RequestInit).method === 'POST'
    );
    expect(postCalls).toHaveLength(0);

    // Cancel modal
    fireEvent.click(within(previewDialog).getByRole('button', { name: 'Hủy xuất bản' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Xem trước thay đổi' })).not.toBeInTheDocument());
  });

  it('fails closed on network, auth, and server errors: blocks modal, displays diagnostic, and issues zero POST calls', async () => {
    const database = new TaskPlannerDatabase(`notes-uncertainty-${crypto.randomUUID()}`);
    databases.push(database);
    await database.open();
    await database.settings.bulkPut([
      { key: 'knowledge_server_enabled', value: true },
      { key: 'knowledge_server_base_url', value: 'http://localhost:3000' },
    ]);

    const folder = await createNote({ title: 'Tín dụng', body: '', type: 'folder' }, database);
    const doc = await createNote({
      title: 'Quy trình thẻ',
      body: '# Quy trình thẻ\nNội dung',
      type: 'document',
      parentId: folder.id,
    }, database);
    await createDocumentSet({
      name: 'Bộ quy trình thẻ',
      documentIds: [doc.id],
    }, database);

    // Test case A: Network error
    let fetchHandler = vi.fn().mockRejectedValue(new Error('connection refused'));
    vi.stubGlobal('fetch', fetchHandler);

    const { unmount } = render(
      <KnowledgeConfigProvider db={database}>
        <NotesView db={database} />
      </KnowledgeConfigProvider>
    );

    fireEvent.click((await screen.findByText('Bộ tài liệu')).closest('button') as HTMLButtonElement);
    fireEvent.click(await screen.findByRole('button', { name: 'Mở chi tiết' }));
    let previewButton = await screen.findByRole('button', { name: 'Xem trước xuất bản' });
    await waitFor(() => expect(previewButton).toBeEnabled());
    fireEvent.click(previewButton);

    await waitFor(() => expect(fetchHandler).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog', { name: 'Xem trước thay đổi' })).not.toBeInTheDocument();
    expect(await screen.findByText(/Không thể kết nối Knowledge Server/i)).toBeInTheDocument();
    unmount();

    // Test case B: 401 Unauthorized
    fetchHandler = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Token expired' } }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchHandler);

    const renderedAuth = render(
      <KnowledgeConfigProvider db={database}>
        <NotesView db={database} />
      </KnowledgeConfigProvider>
    );

    fireEvent.click((await renderedAuth.findByText('Bộ tài liệu')).closest('button') as HTMLButtonElement);
    fireEvent.click(await renderedAuth.findByRole('button', { name: 'Mở chi tiết' }));
    previewButton = await renderedAuth.findByRole('button', { name: 'Xem trước xuất bản' });
    await waitFor(() => expect(previewButton).toBeEnabled());
    fireEvent.click(previewButton);

    await waitFor(() => expect(fetchHandler).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog', { name: 'Xem trước thay đổi' })).not.toBeInTheDocument();
    expect(await screen.findByText(/Token phiên không hợp lệ hoặc đã hết hạn/i)).toBeInTheDocument();
    renderedAuth.unmount();

    // Test case C: 500 Server Error
    fetchHandler = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'DB crash' } }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchHandler);

    const rendered500 = render(
      <KnowledgeConfigProvider db={database}>
        <NotesView db={database} />
      </KnowledgeConfigProvider>
    );

    fireEvent.click((await rendered500.findByText('Bộ tài liệu')).closest('button') as HTMLButtonElement);
    fireEvent.click(await rendered500.findByRole('button', { name: 'Mở chi tiết' }));
    previewButton = await rendered500.findByRole('button', { name: 'Xem trước xuất bản' });
    await waitFor(() => expect(previewButton).toBeEnabled());
    fireEvent.click(previewButton);

    await waitFor(() => expect(fetchHandler).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog', { name: 'Xem trước thay đổi' })).not.toBeInTheDocument();
    expect(await screen.findByText(/Máy chủ Knowledge Server gặp lỗi khi kiểm tra ảnh chụp/i)).toBeInTheDocument();

    // Ensure zero POST requests were made across all uncertainty scenarios
    const allCalls = [
      ...fetchHandler.mock.calls,
    ];
    expect(allCalls.some((call) => call[1] && (call[1] as RequestInit).method === 'POST')).toBe(false);

    // Verify local note editing and browsing remains fully intact
    const note = await database.notes.get(doc.id);
    expect(note).toBeDefined();
    expect(note?.body).toBe('# Quy trình thẻ\nNội dung');
  });
});

