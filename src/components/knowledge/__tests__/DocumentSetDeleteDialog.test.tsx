// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TaskPlannerDatabase } from '../../../db';
import { deleteDocumentSet } from '../../../db/repositories/documentSetRepo';
import {
  DocumentSetDeleteDialog,
  type DocumentSetDeleteDialogProps,
} from '../DocumentSetDeleteDialog';

vi.mock('../../../db/repositories/documentSetRepo', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../db/repositories/documentSetRepo')>();
  return { ...original, deleteDocumentSet: vi.fn().mockResolvedValue(undefined) };
});

const purgeDocumentSet = vi.fn();
const client = { purgeDocumentSet } as never;
const set = {
  id: 'set-a',
  name: 'Bộ nghiệp vụ',
  documentIds: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function renderDialog(overrides: Partial<DocumentSetDeleteDialogProps> = {}) {
  return render(
    <DocumentSetDeleteDialog
      open
      set={set}
      database={{} as TaskPlannerDatabase}
      client={client}
      published
      onClose={vi.fn()}
      {...overrides}
    />
  );
}

describe('DocumentSetDeleteDialog (D-01, D-02)', () => {
  beforeEach(() => {
    purgeDocumentSet.mockReset();
    vi.mocked(deleteDocumentSet).mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows one plain local-delete button for an unpublished set', () => {
    renderDialog({ published: false });
    expect(screen.getByRole('button', { name: 'Xóa cục bộ' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Xóa toàn bộ (Cục bộ & Remote)' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Chỉ xóa cục bộ (Giữ remote)' })).not.toBeInTheDocument();
  });

  it('keeps local-only disabled until the exact set name is typed', () => {
    renderDialog();
    const localOnly = screen.getByRole('button', { name: 'Chỉ xóa cục bộ (Giữ remote)' });
    expect(localOnly).toBeDisabled();
    const input = screen.getByLabelText(/Gõ đúng tên bộ tài liệu/);
    fireEvent.change(input, { target: { value: 'Bộ nghiệp vụ ' } });
    expect(localOnly).toBeDisabled();
    fireEvent.change(input, { target: { value: 'Bộ nghiệp vụ' } });
    expect(localOnly).toBeEnabled();
  });

  it('purges remote first then deletes local on full delete', async () => {
    const order: string[] = [];
    purgeDocumentSet.mockImplementation(async () => {
      order.push('purge');
    });
    vi.mocked(deleteDocumentSet).mockImplementation(async () => {
      order.push('local');
    });
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Xóa toàn bộ (Cục bộ & Remote)' }));
    await waitFor(() => expect(order).toEqual(['purge', 'local']));
    expect(purgeDocumentSet).toHaveBeenCalledWith(set.id);
    expect(deleteDocumentSet).toHaveBeenCalledWith(set.id, expect.anything());
  });

  it('never purges remote on confirmed local-only delete', async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText(/Gõ đúng tên bộ tài liệu/), {
      target: { value: set.name },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Chỉ xóa cục bộ (Giữ remote)' }));
    await waitFor(() => expect(deleteDocumentSet).toHaveBeenCalledWith(set.id, expect.anything()));
    expect(purgeDocumentSet).not.toHaveBeenCalled();
  });
});
