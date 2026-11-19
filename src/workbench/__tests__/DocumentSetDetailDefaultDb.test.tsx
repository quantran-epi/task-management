// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { db as defaultDb } from '../../db';
import { createDocumentSet } from '../../db/repositories/documentSetRepo';
import { DocumentSetDetail } from '../DocumentSetDetail';

/**
 * Regression: the doc_set tab opens through the production shell which renders
 * <WorkbenchLayout /> without a db prop. DocumentSetDetail must fall back to the
 * default IndexedDB singleton (like every other detail view) or its query returns
 * null and shows the false "Không tìm thấy bộ tài liệu" empty state.
 */
describe('DocumentSetDetail default db (doc_set tab empty state)', () => {
  afterEach(async () => {
    cleanup();
    await defaultDb.documentSets.clear();
  });

  it('renders a set from the local default DB when no db prop is passed', async () => {
    const set = await createDocumentSet(
      { name: 'Bộ local không truyền db', documentIds: [] },
      defaultDb
    );

    await act(async () => {
      // Intentionally NO db prop — mirrors EditorArea on the production path.
      render(<DocumentSetDetail setId={set.id} />);
    });

    await screen.findByTestId('doc-set-detail');
    expect(screen.getByText(set.name)).toBeInTheDocument();
    expect(
      screen.queryByText(/Không tìm thấy bộ tài liệu/)
    ).not.toBeInTheDocument();
  });
});
