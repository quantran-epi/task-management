// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TaskPlannerDatabase } from '../../db';
import { NotesView } from '../NotesView';
import { useLayoutStore } from '../../workbench/store/layoutStore';

describe('NotesView workbench compact toolbar', () => {
  let db: TaskPlannerDatabase;

  beforeEach(() => {
    db = new TaskPlannerDatabase(`TestDB_${Math.random()}`);
    useLayoutStore.getState().resetLayout();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('renders the compact toolbar with Bộ tài liệu / Nhập Zip / Prompt AI and hides the PageHeader', async () => {
    render(<NotesView db={db} hideFolderTree />);

    const toolbar = await screen.findByTestId('docs-compact-toolbar');
    expect(toolbar).toBeInTheDocument();

    expect(screen.getByRole('button', { name: /Bộ tài liệu/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Nhập Zip/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Prompt AI/ })).toBeInTheDocument();

    expect(screen.queryByText('Ghi chú & Tài liệu')).toBeNull();
  });

  it('opens the Document Sets drawer from the workbench toolbar', async () => {
    render(<NotesView db={db} hideFolderTree />);

    fireEvent.click(screen.getByRole('button', { name: /Bộ tài liệu/ }));

    expect(await screen.findByText('Bộ tài liệu xuất bản')).toBeInTheDocument();
  });

  it('triggers the hidden .zip file input from Nhập Zip', async () => {
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click');

    const { container } = render(<NotesView db={db} hideFolderTree />);
    fireEvent.click(screen.getByRole('button', { name: /Nhập Zip/ }));

    const zipInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(zipInput).not.toBeNull();
    expect(zipInput.accept).toBe('.zip');

    await waitFor(() => {
      expect(clickSpy.mock.contexts).toContain(zipInput);
    });

    clickSpy.mockRestore();
  });

  it('keeps the PageHeader and omits the compact toolbar outside the workbench', async () => {
    render(<NotesView db={db} />);

    expect(await screen.findByText('Ghi chú & Tài liệu')).toBeInTheDocument();
    expect(screen.queryByTestId('docs-compact-toolbar')).toBeNull();
  });
});
