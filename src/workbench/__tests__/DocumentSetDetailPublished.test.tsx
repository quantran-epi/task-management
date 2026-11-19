// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TaskPlannerDatabase } from '../../db';
import { createDocumentSet } from '../../db/repositories/documentSetRepo';
import type { PublishAttemptCache } from '../../types/models';
import { DocumentSetDetail } from '../DocumentSetDetail';

/**
 * WR-02 regression: `published` in DocumentSetDetail must be derived from BOTH
 * publishedDocuments and publishAttempts. A set that has a publish attempt but no
 * publishedDocuments row must still take the gated (type-to-confirm) delete path.
 */
describe('DocumentSetDetail published detection (WR-02)', () => {
  let db: TaskPlannerDatabase;

  beforeEach(() => {
    db = new TaskPlannerDatabase(`DocSetDetailPublished_${Math.random()}`);
  });

  afterEach(async () => {
    cleanup();
    await db.delete();
  });

  async function seedSet() {
    return createDocumentSet({ name: 'Bộ đã xuất bản', documentIds: [] }, db);
  }

  const makeAttempt = (setId: string): PublishAttemptCache => ({
    id: '11111111-1111-4111-8111-111111111111',
    setId,
    startedAt: '2026-01-02T03:04:05.000Z',
    completedAt: '2026-01-02T03:05:05.000Z',
    status: 'In sync',
    addedCount: 1,
    changedCount: 0,
    removedCount: 0,
    unchangedCount: 0,
    warningCount: 0,
  });

  it('treats a set with only a publishAttempt (no publishedDocuments row) as published', async () => {
    const set = await seedSet();
    await db.publishAttempts.add(makeAttempt(set.id));
    // Deliberately NO publishedDocuments row.

    await act(async () => {
      render(<DocumentSetDetail setId={set.id} db={db} />);
    });

    // Open the shared delete dialog.
    await screen.findByTestId('doc-set-detail');
    fireEvent.click(screen.getByRole('button', { name: `Xóa bộ tài liệu ${set.name}` }));

    // The gated published path offers full delete + type-to-confirm local-only; it must NOT
    // offer the un-gated plain "Xóa cục bộ" button.
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Xóa toàn bộ (Cục bộ & Remote)' })
      ).toBeInTheDocument()
    );
    const localOnly = screen.getByRole('button', { name: 'Chỉ xóa cục bộ (Giữ remote)' });
    expect(localOnly).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Gõ đúng tên bộ tài liệu/), {
      target: { value: set.name },
    });
    expect(localOnly).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Xóa cục bộ' })).not.toBeInTheDocument();
  });
});
