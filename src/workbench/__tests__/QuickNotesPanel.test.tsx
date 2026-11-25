// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeAppHolder } from '../../components/ui';
import { QuickNotesPanel } from '../../components/notes/QuickNotesPanel';
import { TaskPlannerDatabase } from '../../db';
import { generateId } from '../../utils/uuid';
import { WorkbenchLayout } from '../WorkbenchLayout';
import { useLayoutStore } from '../store/layoutStore';

vi.mock('../../views/TasksView', () => ({ TasksView: () => <div data-testid="mock-tasks-view" /> }));
vi.mock('../toolwindows/CRExplorer', () => ({ CRExplorer: () => <div data-testid="mock-cr-explorer" /> }));
vi.mock('../toolwindows/DocsExplorer', () => ({ DocsExplorer: () => <div data-testid="mock-docs-explorer" /> }));
vi.mock('../../hooks/useTeamChatNotifications', () => ({ useTeamChatNotifications: vi.fn() }));

describe('QuickNotesPanel', () => {
  let db: TaskPlannerDatabase;
  let crId: string;
  let taskId: string;
  let systemId: string;

  beforeEach(async () => {
    db = new TaskPlannerDatabase(`TestDB_QuickNotes_${Math.random()}`);
    crId = generateId();
    taskId = generateId();
    systemId = generateId();
    const now = new Date().toISOString();
    await db.changeRequests.add({
      id: crId,
      name: 'CR Thanh toán',
      code: 'CR-001',
      status: 'Open',
      type: 'NEW_FEATURE',
      targets: [],
      createdAt: now,
      updatedAt: now,
    });
    await db.tasks.add({
      id: taskId,
      crId,
      name: 'Task kiểm thử',
      status: 'Open',
      progress: 0,
      priority: 'Medium',
      estimateMinutes: 60,
      createdAt: now,
      updatedAt: now,
    });
    await db.systems.add({
      id: systemId,
      name: 'Hệ thống Core',
      code: 'CORE',
      parentId: null,
      type: 'SERVICE',
      createdAt: now,
      updatedAt: now,
    });
  });

  afterEach(async () => {
    cleanup();
    await db.delete();
  });

  it('lưu note nhanh không gắn thực thể', async () => {
    render(<ThemeAppHolder><QuickNotesPanel db={db} /></ThemeAppHolder>);

    fireEvent.change(screen.getByPlaceholderText('Ghi chú nhanh...'), {
      target: { value: 'Ý tưởng độc lập' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Lưu/ }));

    await waitFor(async () => {
      const notes = await db.notes.toArray();
      expect(notes).toHaveLength(1);
      expect(notes[0]?.body).toBe('Ý tưởng độc lập');
      expect(notes[0]?.type).toBe('quick_note');
      expect(notes[0]?.entityType).toBeUndefined();
      expect(notes[0]?.entityId).toBeUndefined();
    });
  });

  it('gắn note vào CR được chọn qua ô tìm kiếm', async () => {
    render(<ThemeAppHolder><QuickNotesPanel db={db} /></ThemeAppHolder>);

    fireEvent.click(screen.getByText('CR'));
    const select = screen.getByTestId('quick-notes-entity-select');
    fireEvent.mouseDown(select.querySelector('.ant-select-selector') ?? select);
    fireEvent.click(await screen.findByTitle('CR-001'));

    fireEvent.change(screen.getByPlaceholderText('Ghi chú nhanh...'), {
      target: { value: 'Ghi chú CR' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Lưu/ }));

    await waitFor(async () => {
      const notes = await db.notes.toArray();
      expect(notes).toHaveLength(1);
      expect(notes[0]?.entityType).toBe('cr');
      expect(notes[0]?.entityId).toBe(crId);
    });
  });

  it('xóa liên kết khi đổi về Không liên kết', async () => {
    render(<ThemeAppHolder><QuickNotesPanel db={db} /></ThemeAppHolder>);

    fireEvent.click(screen.getByText('Task'));
    const select = screen.getByTestId('quick-notes-entity-select');
    fireEvent.mouseDown(select.querySelector('.ant-select-selector') ?? select);
    fireEvent.click(await screen.findByTitle('Task kiểm thử'));
    fireEvent.click(screen.getByText('Không liên kết'));

    expect(
      screen.getByTestId('quick-notes-entity-select').closest('.ant-select')?.className
    ).toContain('ant-select-disabled');

    fireEvent.change(screen.getByPlaceholderText('Ghi chú nhanh...'), {
      target: { value: 'Ghi chú không liên kết' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Lưu/ }));

    await waitFor(async () => {
      const notes = await db.notes.toArray();
      expect(notes).toHaveLength(1);
      expect(notes[0]?.entityType).toBeUndefined();
      expect(notes[0]?.entityId).toBeUndefined();
    });
  });

  it('hiện note vừa tạo trong danh sách gần đây', async () => {
    render(<ThemeAppHolder><QuickNotesPanel db={db} /></ThemeAppHolder>);

    expect(screen.getByText('Chưa có ghi chú nào')).toBeDefined();

    fireEvent.change(screen.getByPlaceholderText('Ghi chú nhanh...'), {
      target: { value: 'Nội dung xuất hiện trong danh sách' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Lưu/ }));

    await waitFor(() => {
      expect(screen.getByText(/Nội dung xuất hiện trong danh sách/)).toBeDefined();
    });
  });

  it('danh sách chỉ hiện quick note, không hiện note document', async () => {
    const now = new Date().toISOString();
    await db.notes.add({
      id: generateId(),
      type: 'quick_note',
      body: 'Nội dung quick note duy nhất',
      isPinned: false,
      createdAt: now,
      updatedAt: now,
    });
    await db.notes.add({
      id: generateId(),
      type: 'document',
      body: 'Nội dung document không được hiện',
      isPinned: false,
      createdAt: now,
      updatedAt: now,
    });

    render(<ThemeAppHolder><QuickNotesPanel db={db} /></ThemeAppHolder>);

    await waitFor(() => {
      expect(screen.getByText(/Nội dung quick note duy nhất/)).toBeDefined();
    });
    expect(screen.queryByText(/Nội dung document không được hiện/)).toBeNull();
  });

  it('row hiện tag entity và tiêu đề note', async () => {
    const noteId = generateId();
    const now = new Date().toISOString();
    await db.notes.add({
      id: noteId,
      type: 'quick_note',
      title: 'Tiêu đề ghi chú CR',
      entityType: 'cr',
      entityId: crId,
      body: 'Body ghi chú CR',
      isPinned: false,
      createdAt: now,
      updatedAt: now,
    });

    const { container } = render(<ThemeAppHolder><QuickNotesPanel db={db} /></ThemeAppHolder>);

    await waitFor(() => {
      expect(screen.getByText(/Body ghi chú CR/)).toBeDefined();
    });
    const row = container.querySelector(`[data-ai-context-id="${noteId}"]`);
    expect(row?.textContent).toContain('CR-001');
    expect(row?.textContent).toContain('Tiêu đề ghi chú CR');
    expect(row?.textContent).toContain('Body ghi chú CR');
  });

  it('row body dùng clamp 2 dòng, không có ô scroll', async () => {
    const noteId = generateId();
    const now = new Date().toISOString();
    await db.notes.add({
      id: noteId,
      type: 'quick_note',
      body: 'Nội dung clamp hai dòng',
      isPinned: false,
      createdAt: now,
      updatedAt: now,
    });

    const { container } = render(<ThemeAppHolder><QuickNotesPanel db={db} /></ThemeAppHolder>);

    await waitFor(() => {
      expect(screen.getByText(/Nội dung clamp hai dòng/)).toBeDefined();
    });
    const bodyNode = container.querySelector(`[data-ai-context-id="${noteId}"] p`)?.parentElement;
    const style = bodyNode?.getAttribute('style') ?? '';
    expect(style).toContain('-webkit-line-clamp: 2');
    expect(style).toContain('-webkit-box-orient: vertical');
    expect(style).toContain('overflow: hidden');
    expect(style).not.toContain('overflow-y: auto');
    expect(style).not.toContain('max-height');
  });

  const seedQuickNotesForFilter = async (): Promise<{ crNoteBody: string; taskNoteBody: string; plainBody: string }> => {
    const now = new Date().toISOString();
    const bodies = {
      crNoteBody: 'Ghi chú filter CR',
      taskNoteBody: 'Ghi chú filter Task',
      plainBody: 'Ghi chú filter không gắn entity',
    };
    await db.notes.add({
      id: generateId(),
      type: 'quick_note',
      entityType: 'cr',
      entityId: crId,
      body: bodies.crNoteBody,
      isPinned: false,
      createdAt: now,
      updatedAt: new Date(Date.now() + 3000).toISOString(),
    });
    await db.notes.add({
      id: generateId(),
      type: 'quick_note',
      entityType: 'task',
      entityId: taskId,
      body: bodies.taskNoteBody,
      isPinned: false,
      createdAt: now,
      updatedAt: new Date(Date.now() + 2000).toISOString(),
    });
    await db.notes.add({
      id: generateId(),
      type: 'quick_note',
      body: bodies.plainBody,
      isPinned: false,
      createdAt: now,
      updatedAt: now,
    });
    return bodies;
  };

  it('filter chỉ liệt kê entity đã có note link', async () => {
    await seedQuickNotesForFilter();
    render(<ThemeAppHolder><QuickNotesPanel db={db} /></ThemeAppHolder>);

    const filter = await screen.findByTestId('quick-notes-list-filter');
    fireEvent.mouseDown(filter.querySelector('.ant-select-selector') ?? filter);

    expect(await screen.findByTitle('CR-001')).toBeDefined();
    expect(await screen.findByTitle('Task kiểm thử')).toBeDefined();
    expect(screen.queryByTitle('Hệ thống Core')).toBeNull();
    expect(screen.getAllByText('Tất cả').length).toBeGreaterThan(0);
  });

  it('chọn entity thì danh sách chỉ hiện note của entity đó', async () => {
    const bodies = await seedQuickNotesForFilter();
    render(<ThemeAppHolder><QuickNotesPanel db={db} /></ThemeAppHolder>);

    const filter = await screen.findByTestId('quick-notes-list-filter');
    fireEvent.mouseDown(filter.querySelector('.ant-select-selector') ?? filter);
    fireEvent.click(await screen.findByTitle('Task kiểm thử'));

    await waitFor(() => {
      expect(screen.getByText(new RegExp(bodies.taskNoteBody))).toBeDefined();
      expect(screen.queryByText(new RegExp(bodies.crNoteBody))).toBeNull();
      expect(screen.queryByText(new RegExp(bodies.plainBody))).toBeNull();
    });
  });

  it('chọn lại Tất cả thì hiện lại mọi quick note', async () => {
    const bodies = await seedQuickNotesForFilter();
    render(<ThemeAppHolder><QuickNotesPanel db={db} /></ThemeAppHolder>);

    const filter = await screen.findByTestId('quick-notes-list-filter');
    fireEvent.mouseDown(filter.querySelector('.ant-select-selector') ?? filter);
    fireEvent.click(await screen.findByTitle('Task kiểm thử'));
    await waitFor(() => {
      expect(screen.queryByText(new RegExp(bodies.crNoteBody))).toBeNull();
    });

    fireEvent.mouseDown(filter.querySelector('.ant-select-selector') ?? filter);
    fireEvent.click(await screen.findByTitle('Tất cả'));

    await waitFor(() => {
      expect(screen.getByText(new RegExp(bodies.crNoteBody))).toBeDefined();
      expect(screen.getByText(new RegExp(bodies.taskNoteBody))).toBeDefined();
      expect(screen.getByText(new RegExp(bodies.plainBody))).toBeDefined();
    });
  });

  it('tích hợp: stripe mở panel, lưu note có entity, click lại đóng panel', async () => {
    localStorage.clear();
    act(() => {
      useLayoutStore.getState().resetLayout();
    });

    render(<ThemeAppHolder><WorkbenchLayout db={db} /></ThemeAppHolder>);

    const stripeButton = screen.getByTestId('stripe-btn-quick_notes');
    expect(stripeButton.getAttribute('aria-label')).toBe('Ghi chú nhanh');

    fireEvent.click(stripeButton);
    expect(useLayoutStore.getState().rightActiveId).toBe('quick_notes');
    expect(screen.getByTestId('quick-notes-entity-select')).toBeDefined();
    expect(screen.getAllByText('Ghi chú nhanh').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByText('CR'));
    const select = screen.getByTestId('quick-notes-entity-select');
    fireEvent.mouseDown(select.querySelector('.ant-select-selector') ?? select);
    fireEvent.click(await screen.findByTitle('CR-001'));

    fireEvent.change(screen.getByPlaceholderText('Ghi chú nhanh...'), {
      target: { value: 'Ghi chú từ workbench' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Lưu/ }));

    await waitFor(async () => {
      const notes = await db.notes.toArray();
      expect(notes).toHaveLength(1);
      expect(notes[0]?.body).toBe('Ghi chú từ workbench');
      expect(notes[0]?.entityType).toBe('cr');
      expect(notes[0]?.entityId).toBe(crId);
    });

    fireEvent.click(stripeButton);
    expect(useLayoutStore.getState().rightActiveId).toBeNull();
    expect(screen.queryByTestId('quick-notes-entity-select')).toBeNull();
  });

  it('Select chỉ liệt kê CR khi Segmented chọn CR', async () => {
    render(<ThemeAppHolder><QuickNotesPanel db={db} /></ThemeAppHolder>);

    fireEvent.click(screen.getByText('CR'));
    const select = screen.getByTestId('quick-notes-entity-select');
    fireEvent.mouseDown(select.querySelector('.ant-select-selector') ?? select);

    expect(await screen.findByTitle('CR-001')).toBeDefined();
    expect(screen.queryByTitle('Task kiểm thử')).toBeNull();
    expect(screen.queryByTitle('Hệ thống Core')).toBeNull();
  });

  it('Select đổi option theo Task rồi Hệ thống', async () => {
    render(<ThemeAppHolder><QuickNotesPanel db={db} /></ThemeAppHolder>);

    fireEvent.click(screen.getByText('Task'));
    let select = screen.getByTestId('quick-notes-entity-select');
    fireEvent.mouseDown(select.querySelector('.ant-select-selector') ?? select);
    expect(await screen.findByTitle('Task kiểm thử')).toBeDefined();
    expect(screen.queryByTitle('CR-001')).toBeNull();
    expect(screen.queryByTitle('Hệ thống Core')).toBeNull();

    fireEvent.click(screen.getByText('Hệ thống'));
    select = screen.getByTestId('quick-notes-entity-select');
    fireEvent.mouseDown(select.querySelector('.ant-select-selector') ?? select);
    expect(await screen.findByTitle('Hệ thống Core')).toBeDefined();
    expect(screen.queryByTitle('CR-001')).toBeNull();
    expect(screen.queryByTitle('Task kiểm thử')).toBeNull();
  });

  it('đổi loại xóa lựa chọn cũ và note lưu sau đó không giữ type/id cũ', async () => {
    render(<ThemeAppHolder><QuickNotesPanel db={db} /></ThemeAppHolder>);

    fireEvent.click(screen.getByText('CR'));
    let select = screen.getByTestId('quick-notes-entity-select');
    fireEvent.mouseDown(select.querySelector('.ant-select-selector') ?? select);
    fireEvent.click(await screen.findByTitle('CR-001'));

    fireEvent.click(screen.getByText('Task'));
    select = screen.getByTestId('quick-notes-entity-select');
    expect(select.querySelector('.ant-select-selection-item')).toBeNull();

    fireEvent.mouseDown(select.querySelector('.ant-select-selector') ?? select);
    expect(await screen.findByTitle('Task kiểm thử')).toBeDefined();
    expect(screen.queryByTitle('CR-001')).toBeNull();

    fireEvent.change(screen.getByPlaceholderText('Ghi chú nhanh...'), {
      target: { value: 'Ghi chú sau đổi loại' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Lưu/ }));

    await waitFor(async () => {
      const notes = await db.notes.toArray();
      expect(notes).toHaveLength(1);
      expect(notes[0]?.entityType).toBe('task');
      expect(notes[0]?.entityId).toBeUndefined();
      expect(notes.some((note) => note.entityType === 'cr')).toBe(false);
    });
  });
});
