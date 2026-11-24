// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TaskPlannerDatabase } from '../../db';
import { computeSha256, createDocumentSet, normalizeMarkdownForHash } from '../../db/repositories/documentSetRepo';
import type { Note, PublishAttemptCache } from '../../types/models';
import { DocSetLibrary } from '../DocSetLibrary';
import { DocumentSetDetail } from '../DocumentSetDetail';

// jsdom không có layout engine: điều khiển width qua ResizeObserver để test layout narrow/wide.
interface ObservedElement {
  testId: string;
  notify: (width: number) => void;
}
let observedElements: ObservedElement[] = [];
const baseResizeObserver = globalThis.ResizeObserver;

async function setObservedWidth(testId: string, width: number) {
  await act(async () => {
    observedElements
      .filter((item) => item.testId === testId)
      .forEach((item) => item.notify(width));
    await Promise.resolve();
  });
}

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

describe('doc-set layout ở center hẹp/rộng', () => {
  let db: TaskPlannerDatabase;

  beforeEach(() => {
    observedElements = [];
    globalThis.ResizeObserver = class MockResizeObserver {
      private readonly callback: ResizeObserverCallback;

      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
      }

      observe(target: Element) {
        const testId = target.getAttribute('data-testid') ?? target.closest('[data-testid]')?.getAttribute('data-testid') ?? '';
        Object.defineProperty(target, 'clientWidth', { configurable: true, value: testId === 'doc-set-detail' ? 479 : 900 });
        observedElements.push({
          testId,
          notify: (width) => {
            Object.defineProperty(target, 'clientWidth', { configurable: true, value: width });
            this.callback(
              [{ target, contentRect: { width } } as unknown as ResizeObserverEntry],
              this as unknown as ResizeObserver
            );
          },
        });
      }

      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    db = new TaskPlannerDatabase(`DocSetLayout_${Math.random()}`);
  });

  afterEach(async () => {
    globalThis.ResizeObserver = baseResizeObserver;
    cleanup();
    await db.delete();
  });

  it('co rail về 160px và giảm padding detail khi container hẹp', async () => {
    await createDocumentSet({ name: 'Bộ hẹp', documentIds: [] }, db);
    await act(async () => {
      render(<DocSetLibrary db={db} embedded />);
    });

    const rail = screen.getByTestId('doc-set-library-list');
    const detail = screen.getByTestId('doc-set-library-detail');
    await setObservedWidth('doc-set-library', 479);

    await waitFor(() => expect(rail.querySelector('[role="button"]')).toBeInTheDocument());
    expect(rail.style.width).toBe('160px');
    expect(detail.style.padding).toBe('8px');

    await setObservedWidth('doc-set-library', 1100);
    expect(rail.style.width).toBe('248px');
    expect(detail.style.padding).toBe('16px');
  });

  it('giữ toolbar dùng được, ẩn inspector và hiển thị dòng chọn rút gọn ở narrow width', async () => {
    const set = await seedLayoutSet(db, 60);
    await act(async () => {
      render(<DocumentSetDetail setId={set.id} db={db} />);
    });
    await screen.findByTestId('doc-set-detail');
    await waitFor(() => expect(observedElements.some((item) => item.testId === 'doc-set-detail')).toBe(true));
    await setObservedWidth('doc-set-detail', 479);

    const documents = await screen.findByTestId('doc-set-documents');
    await waitFor(() =>
      expect(documents.querySelectorAll('[data-testid^="doc-row-"]').length).toBeGreaterThan(0)
    );
    for (const label of ['Tìm tài liệu trong bộ', 'Lọc trạng thái', 'Sắp xếp']) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    expect(documents.querySelector('aside')).not.toBeInTheDocument();

    const firstRow = documents.querySelector('[data-testid^="doc-row-"]') as HTMLElement;
    const selectedTitle = firstRow.getAttribute('aria-label');
    await act(async () => {
      fireEvent.click(firstRow);
    });
    expect(selectedTitle).toBeTruthy();
    expect(documents.textContent).toContain(selectedTitle as string);
    expect(documents.querySelectorAll('[data-testid^="doc-row-"]').length).toBeLessThanOrEqual(25);

    await setObservedWidth('doc-set-detail', 900);
    await waitFor(() => expect(documents.querySelector('aside')).toBeInTheDocument());
  });
});

async function seedLayoutSet(db: TaskPlannerDatabase, count: number) {
  const noteIds: string[] = [];
  for (let i = 1; i <= count; i += 1) {
    noteIds.push(await db.notes.add({
      id: `22222222-3333-4444-8555-${String(i).padStart(12, '0')}`,
      title: `Tài liệu lớn ${i}`,
      body: `# Nội dung bí mật ${i}`,
      type: 'document',
      isPinned: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
    }));
  }
  return createDocumentSet({ name: 'Bộ layout', documentIds: noteIds }, db);
}
