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
vi.mock('../../components/knowledge/DocumentSetDeleteDialog', () => ({
  DocumentSetDeleteDialog: ({ open }: { open: boolean }) => (
    <div data-testid="shared-delete-dialog" data-open={String(open)} />
  ),
}));

describe('Docs workspace + doc_set tabs (D-06, D-07, D-08)', () => {
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    db = new TaskPlannerDatabase(`DocsWorkspace_${Math.random()}`);
    localStorage.clear();
    act(() => {
      useLayoutStore.getState().resetLayout();
      useLayoutStore.setState({ openTabs: [], activeTabId: null });
    });
    // Zustand persists on every set; rehydrate from the cleared storage so a case
    // cannot inherit the previous case's tabs (or another test file's session).
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
    const set = await createDocumentSet({ name, documentIds: noteIds }, db);
    return set;
  }

  function renderWorkspace() {
    return render(
      <>
        <DocsExplorer db={db} />
        <EditorArea db={db} />
      </>
    );
  }

  it('opens exactly one doc_set tab carrying the setId when a set is clicked', async () => {
    const set = await seedSet('Bộ A', 1);
    renderWorkspace();

    fireEvent.click(await screen.findByRole('button', { name: `Mở bộ tài liệu ${set.name}` }, { timeout: 5000 }));

    await waitFor(() => {
      const tabs = useLayoutStore.getState().openTabs.filter((tab) => tab.viewType === 'doc_set');
      expect(tabs).toHaveLength(1);
      expect(tabs[0]?.id).toBe(`doc_set-${set.id}`);
      expect(tabs[0]?.params?.setId).toBe(set.id);
    });
    expect(await screen.findByTestId('doc-set-detail')).toBeInTheDocument();
  });

  it('keeps multiple sets open as separate in-app tabs', async () => {
    const first = await seedSet('Bộ A', 1);
    const second = await seedSet('Bộ B', 1);
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    renderWorkspace();

    fireEvent.click(await screen.findByRole('button', { name: `Mở bộ tài liệu ${first.name}` }, { timeout: 5000 }));
    fireEvent.click(await screen.findByRole('button', { name: `Mở bộ tài liệu ${second.name}` }, { timeout: 5000 }));

    await waitFor(() => {
      const tabs = useLayoutStore.getState().openTabs.filter((tab) => tab.viewType === 'doc_set');
      expect(tabs.map((tab) => tab.id)).toEqual([
        `doc_set-${first.id}`,
        `doc_set-${second.id}`,
      ]);
    });
    expect(openSpy).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });

  it('survives a layout persist -> rehydrate cycle without a storage key bump', async () => {
    const set = await seedSet('Bộ A', 1);
    renderWorkspace();
    fireEvent.click(await screen.findByRole('button', { name: `Mở bộ tài liệu ${set.name}` }, { timeout: 5000 }));
    await waitFor(() =>
      expect(useLayoutStore.getState().openTabs.some((tab) => tab.viewType === 'doc_set')).toBe(true)
    );

    await useLayoutStore.persist.rehydrate();

    const tab = useLayoutStore
      .getState()
      .openTabs.find((candidate) => candidate.viewType === 'doc_set');
    expect(tab?.id).toBe(`doc_set-${set.id}`);
    expect(tab?.params?.setId).toBe(set.id);
    expect(useLayoutStore.getState().activeTabId).toBe(`doc_set-${set.id}`);
  });

  it('renders only one bounded page plus pagination when a set has many documents', async () => {
    const set = await seedSet('Bộ lớn', 25);
    renderWorkspace();
    fireEvent.click(await screen.findByRole('button', { name: `Mở bộ tài liệu ${set.name}` }, { timeout: 5000 }));
    await screen.findByTestId('doc-set-detail');

    const detail = screen.getByTestId('doc-set-detail');
    const documentsTable = within(detail).getByTestId('doc-set-documents');
    await waitFor(() =>
      expect(documentsTable.querySelectorAll('table tbody tr')).toHaveLength(10)
    );
    const rows = Array.from(documentsTable.querySelectorAll('table tbody tr'));
    // Exactly one page of 10 data rows rendered, never the full 25-document array.
    expect(rows).toHaveLength(10);
    expect(rows[0]?.textContent).toContain('Bộ lớn tài liệu 1');
    expect(documentsTable.textContent).not.toContain('Bộ lớn tài liệu 25');
    expect(document.querySelector('.ant-pagination')).not.toBeNull();
  });

  it('mounts the shared DocumentSetDeleteDialog from the doc_set detail', async () => {
    const set = await seedSet('Bộ xóa', 1);
    renderWorkspace();
    fireEvent.click(await screen.findByRole('button', { name: `Mở bộ tài liệu ${set.name}` }, { timeout: 5000 }));
    await screen.findByTestId('doc-set-detail');

    expect(screen.getByTestId('shared-delete-dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: `Xóa bộ tài liệu ${set.name}` }));
    expect(screen.getByTestId('shared-delete-dialog')).toHaveAttribute('data-open', 'true');
  });

  it('has no long-scroll drawer trigger left in the Docs workspace', async () => {
    await seedSet('Bộ A', 1);
    renderWorkspace();

    expect(screen.queryByText('Bộ tài liệu xuất bản')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bộ tài liệu' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tạo bộ tài liệu' })).toBeInTheDocument();
    expect(screen.getByTestId('docs-set-workspace')).toBeInTheDocument();
  });
});
