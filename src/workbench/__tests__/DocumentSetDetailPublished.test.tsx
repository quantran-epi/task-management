// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TaskPlannerDatabase } from '../../db';
import { computeSha256, createDocumentSet, normalizeMarkdownForHash } from '../../db/repositories/documentSetRepo';
import type { Note, PublishAttemptCache } from '../../types/models';
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

  async function seedLargeSet() {
    const noteIds: string[] = [];
    for (let i = 1; i <= 60; i += 1) {
      const note = await db.notes.add({
        id: `11111111-2222-4333-8444-${String(i).padStart(12, '0')}`,
        title: `Tài liệu lớn ${i}`,
        body: `# Nội dung bí mật ${i} ${'markdown dài '.repeat(40)}`,
        type: 'document',
        isPinned: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
      });
      noteIds.push(note);
    }
    return createDocumentSet({ name: 'Bộ lớn', documentIds: noteIds }, db);
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

  it('renders a bounded virtual list with metadata-only rows and a live filter count', async () => {
    const set = await seedLargeSet();
    await act(async () => {
      render(<DocumentSetDetail setId={set.id} db={db} />);
    });

    const documents = await screen.findByTestId('doc-set-documents');
    await waitFor(() =>
      expect(documents.querySelectorAll('[data-testid^="doc-row-"]').length).toBeGreaterThan(0)
    );
    const rows = documents.querySelectorAll('[data-testid^="doc-row-"]');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(25);
    expect(document.body.textContent).not.toContain('Nội dung bí mật');
    expect(documents.querySelector('[data-testid="doc-set-filter-count"]')?.textContent).toBe('60 / 60');

    fireEvent.change(documents.querySelector('input') as HTMLInputElement, {
      target: { value: 'Tài liệu lớn 6' },
    });
    await waitFor(() =>
      expect(documents.querySelector('[data-testid="doc-set-filter-count"]')?.textContent).not.toBe('60 / 60')
    );
  });

  it('does not flash "Có thay đổi cục bộ" on first render of an in-sync published set', async () => {
    const noteId = '11111111-2222-4333-8444-000000000001';
    const note: Note = {
      id: noteId,
      type: 'document',
      title: 'Tài liệu đã đồng bộ',
      body: '# đã đồng bộ',
      isPinned: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const set = await createDocumentSet({ name: 'Bộ đồng bộ', documentIds: [noteId] }, db);
    await db.notes.add(note);
    await db.publishedDocuments.add({
      setId: set.id,
      documentId: noteId,
      lastKnownRemoteAt: '2026-01-02T00:00:00.000Z',
      publishedContentHash: await computeSha256(normalizeMarkdownForHash(note.body)),
      lastPrimaryState: 'In sync',
    });

    await act(async () => {
      render(<DocumentSetDetail setId={set.id} db={db} />);
    });

    expect(screen.queryByText('Có thay đổi cục bộ')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Đã đồng bộ')).toBeInTheDocument());
    expect(screen.queryByText('Có thay đổi cục bộ')).not.toBeInTheDocument();
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
