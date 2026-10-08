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
});
