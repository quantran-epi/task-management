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
    const fetchSpy = vi.fn().mockRejectedValue(new Error('daemon offline'));
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
});
