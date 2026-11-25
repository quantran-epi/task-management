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
});
