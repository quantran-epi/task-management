// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskPlannerDatabase } from '../../db';
import { createDocumentSet } from '../../db/repositories/documentSetRepo';
import { createNote } from '../../db/repositories/noteRepo';
import { DocsExplorer } from '../toolwindows/DocsExplorer';
import { EditorArea } from '../EditorArea';
import { useLayoutStore } from '../store/layoutStore';

vi.mock('../../views/TasksView', () => ({ TasksView: () => <div data-testid="mock-tasks-view" /> }));
vi.mock('../../views/NotesView', () => ({ NotesView: () => <div data-testid="mock-notes-view" /> }));
vi.mock('../../views/PlannerView', () => ({ PlannerView: () => <div data-testid="mock-planner-view" /> }));
vi.mock('../../views/AnalyticsView', () => ({ AnalyticsView: () => <div data-testid="mock-analytics-view" /> }));
vi.mock('../../views/SettingsView', () => ({ SettingsView: () => <div data-testid="mock-settings-view" /> }));
vi.mock('../../views/ChangeRequestDetailView', () => ({
  ChangeRequestDetailView: () => <div data-testid="mock-cr-view" />,
}));
vi.mock('../../services/knowledge/knowledgeConfig', () => ({
  useOptionalKnowledgeConfig: () => ({
    ready: true, enabled: true, baseUrl: 'http://127.0.0.1:3001', token: 'test-token',
    loopbackHttpWarning: false, setToken: () => {}, savePersistedConfig: async () => {},
  }),
  validateKnowledgeBaseUrl: (value: string) => ({ baseUrl: value, loopbackHttpWarning: false }),
}));
vi.mock('../../components/knowledge/DocumentSetDeleteDialog', () => ({
  DocumentSetDeleteDialog: ({ open }: { open: boolean }) => (
    <div data-testid="shared-delete-dialog" data-open={String(open)} />
  ),
}));

describe('Docs workspace + doc_set library tab (D-06, D-07, D-08)', () => {
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    db = new TaskPlannerDatabase(`DocsWorkspace_${Math.random()}`);
    localStorage.clear();
    act(() => {
      useLayoutStore.getState().resetLayout();
      useLayoutStore.setState({ openTabs: [], activeTabId: null });
    });
    await useLayoutStore.persist.rehydrate();
    act(() => {
      useLayoutStore.setState({ openTabs: [], activeTabId: null });
    });
  });

  afterEach(async () => {
    cleanup();
    await db.delete();
  });

  async function seedSet(name: string, documentCount: number) {
    const noteIds: string[] = [];
    for (let i = 1; i <= documentCount; i += 1) {
      const note = await createNote({ title: `${name} tài liệu ${i}`, body: `# ${i}`, type: 'document' }, db);
      noteIds.push(note.id);
    }
    return createDocumentSet({ name, documentIds: noteIds }, db);
  }

  function renderWorkspace() {
    return render(
      <>
        <DocsExplorer db={db} />
        <EditorArea db={db} />
      </>
    );
  }

  async function openLibrary() {
    fireEvent.click(await screen.findByRole('button', { name: 'Bộ tài liệu' }, { timeout: 5000 }));
    await screen.findByTestId('doc-set-library');
  }

  it('opens exactly one reusable library tab with left list and right detail', async () => {
    const set = await seedSet('Bộ A', 1);
    renderWorkspace();

    await openLibrary();
    fireEvent.click(await screen.findByRole('button', { name: `Mở bộ tài liệu ${set.name}` }));

    await waitFor(() => {
      const tabs = useLayoutStore.getState().openTabs.filter((tab) => tab.viewType === 'doc_set_library');
      expect(tabs).toHaveLength(1);
      expect(tabs[0]?.id).toBe('doc_set_library');
    });
    expect(screen.getByTestId('doc-set-library-list')).toBeInTheDocument();
    expect(screen.getByTestId('doc-set-library-detail')).toBeInTheDocument();
    expect(await screen.findByTestId('doc-set-detail')).toBeInTheDocument();
  });

  it('keeps one tab when selecting multiple sets from the library list', async () => {
    await seedSet('Bộ A', 1);
    await seedSet('Bộ B', 1);
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    renderWorkspace();

    await openLibrary();
    fireEvent.click(await screen.findByRole('button', { name: 'Mở bộ tài liệu Bộ A' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Mở bộ tài liệu Bộ B' }));

    await waitFor(() => {
      const tabs = useLayoutStore.getState().openTabs.filter((tab) => tab.viewType === 'doc_set_library');
      expect(tabs).toHaveLength(1);
      expect(tabs[0]?.params?.selectedSetId).toBeTruthy();
    });
    expect(openSpy).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });

  it('creates a set from the library tab form and selects it', async () => {
    await createNote({ title: 'Tài liệu nguồn', body: '# 1', type: 'document' }, db);
    renderWorkspace();
    await openLibrary();

    fireEvent.click(screen.getByRole('button', { name: /Tạo bộ tài liệu/ }));
    fireEvent.change(await screen.findByLabelText('Tên bộ tài liệu'), {
      target: { value: 'Bộ tạo từ tab' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    await waitFor(async () => {
      const sets = await db.documentSets.toArray();
      expect(sets.map((set) => set.name)).toEqual(['Bộ tạo từ tab']);
    });
    expect(await screen.findByRole('button', { name: 'Mở bộ tài liệu Bộ tạo từ tab' })).toBeInTheDocument();
  });

  it('survives a layout persist -> rehydrate cycle without a storage key bump', async () => {
    const set = await seedSet('Bộ A', 1);
    renderWorkspace();
    await openLibrary();
    fireEvent.click(await screen.findByRole('button', { name: `Mở bộ tài liệu ${set.name}` }));
    await waitFor(() =>
      expect(useLayoutStore.getState().openTabs.some((tab) => tab.viewType === 'doc_set_library')).toBe(true)
    );

    await useLayoutStore.persist.rehydrate();

    const tab = useLayoutStore
      .getState()
      .openTabs.find((candidate) => candidate.viewType === 'doc_set_library');
    expect(tab?.id).toBe('doc_set_library');
    expect(tab?.params?.selectedSetId).toBe(set.id);
    expect(useLayoutStore.getState().activeTabId).toBe('doc_set_library');
  });

  it('renders a bounded virtual window with live filter count when a set has many documents', async () => {
    await seedSet('Bộ lớn', 60);
    renderWorkspace();
    await openLibrary();
    fireEvent.click(await screen.findByRole('button', { name: 'Mở bộ tài liệu Bộ lớn' }));
    await screen.findByTestId('doc-set-detail');

    const detail = screen.getByTestId('doc-set-detail');
    const documents = within(detail).getByTestId('doc-set-documents');
    await waitFor(() =>
      expect(documents.querySelectorAll('[role="option"]').length).toBeGreaterThan(0)
    );
    const rows = Array.from(documents.querySelectorAll('[role="option"]'));
    expect(rows.length).toBeLessThanOrEqual(25);
    // WR-01: default "Mới nhất" sort is updatedAt descending; newest (last seeded) first.
    expect(rows[0]?.textContent).toContain('Bộ lớn tài liệu 60');
    expect(documents.textContent).not.toContain('Bộ lớn tài liệu 1');
    const count = within(documents).getByTestId('doc-set-filter-count');
    expect(count.textContent).toBe('60 / 60');
    expect(document.querySelector('.ant-pagination')).toBeNull();
    fireEvent.change(within(documents).getByRole('textbox', { name: 'Tìm tài liệu trong bộ' }), {
      target: { value: 'Bộ lớn tài liệu 6' },
    });
    await waitFor(() => expect(within(documents).getByTestId('doc-set-filter-count').textContent).not.toBe('60 / 60'));
  });

  it('mounts the shared DocumentSetDeleteDialog from the library detail', async () => {
    const set = await seedSet('Bộ xóa', 1);
    renderWorkspace();
    await openLibrary();
    fireEvent.click(await screen.findByRole('button', { name: `Mở bộ tài liệu ${set.name}` }));
    await screen.findByTestId('doc-set-detail');

    expect(screen.getByTestId('shared-delete-dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: `Xóa bộ tài liệu ${set.name}` }));
    expect(screen.getByTestId('shared-delete-dialog')).toHaveAttribute('data-open', 'true');
  });

  it('opens a library detail with publish preview, graph section, and attempt history', async () => {
    await seedSet('Bộ đầy đủ', 2);
    act(() => {
      useLayoutStore.getState().openTab({
        id: 'doc_set_library', title: 'Bộ tài liệu', viewType: 'doc_set_library', closable: true,
      });
    });
    render(<EditorArea db={db} />);

    const detail = await screen.findByTestId('doc-set-detail');
    expect(screen.getByRole('button', { name: 'Xem trước xuất bản' })).toBeInTheDocument();
    expect(within(detail).getByRole('heading', { name: /Đồ thị tri thức/ })).toBeInTheDocument();
    expect(within(detail).getByRole('heading', { name: 'Lịch sử xuất bản' })).toBeInTheDocument();
    for (const label of ['Xây dựng lại đồ thị', 'Xem bằng chứng', 'Kiểm tra trạng thái', 'Tiến trình từng phần']) {
      expect(within(detail).getByRole('button', { name: new RegExp(label) })).toBeInTheDocument();
    }
  }, 30000);

  it('gates graph rebuild on a published snapshot and confirms via modal', async () => {
    const set = await seedSet('Bộ rebuild', 1);
    await act(async () => {
      useLayoutStore.getState().openTab({
        id: 'doc_set_library', title: 'Bộ tài liệu', viewType: 'doc_set_library', closable: true,
        params: { selectedSetId: set.id },
      });
    });
    const { unmount } = render(<EditorArea db={db} />);
    const detail = await screen.findByTestId('doc-set-detail');

    const rebuild = within(detail).getByRole('button', { name: /Xây dựng lại đồ thị/ });
    expect(rebuild).toBeDisabled();

    await db.publishedDocuments.add({
      setId: set.id, documentId: set.documentIds[0]!, lastKnownRemoteAt: new Date().toISOString(),
      publishedContentHash: 'a'.repeat(64), lastPrimaryState: 'In sync',
    });
    await waitFor(() => expect(rebuild).toBeEnabled(), { timeout: 5000 });

    fireEvent.click(rebuild);
    expect(screen.getByText('Xác nhận xây dựng lại đồ thị tri thức')).toBeInTheDocument();
    unmount();
  });

  it('has no bulky Docs-space block; Bộ tài liệu opens the dedicated library tab', async () => {
    renderWorkspace();

    expect(screen.queryByText('Không gian Docs')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bộ tài liệu' })).toBeInTheDocument();
    await openLibrary();
    expect(screen.getByTestId('doc-set-library')).toBeInTheDocument();
    expect(useLayoutStore.getState().openTabs.some((tab) => tab.viewType === 'doc_set_library')).toBe(true);
  });
});
