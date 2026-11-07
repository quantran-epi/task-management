import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TaskPlannerDatabase } from '../../../src/db/index';
import { ImportPreviewModal } from '../../../src/components/settings/ImportPreviewModal';
import { APP_MARKER, CURRENT_SCHEMA_VERSION } from '../../../src/services/backup/exportBackup';

describe('ImportPreviewModal', () => {
  let testDb: TaskPlannerDatabase;

  beforeEach(async () => {
    testDb = new TaskPlannerDatabase('TestImportModal_' + Math.random().toString(36).slice(2));
    await testDb.open();
  });

  afterEach(async () => {
    await testDb.delete();
  });

  // D-49: v11 envelopes are CR-centric. A `projects`/`milestones` table is a pre-31.2 backup
  // and is rejected at the envelope stage, so the fixture must not carry one.
  const validPayload = {
    app: APP_MARKER,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt: '2026-09-27T10:00:00.000Z',
    tables: {
      changeRequests: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          name: 'Imported CR',
          code: 'CR-IMPORT-01',
          status: 'Open',
          type: 'ENHANCEMENT',
          targets: [],
          createdAt: '2026-09-27T10:00:00.000Z',
          updatedAt: '2026-09-27T10:00:00.000Z',
        },
      ],
      systems: [],
      tasks: [],
      capacityRules: [],
      capacityOverrides: [],
      plannedAllocations: [],
    },
    counts: {
      changeRequests: 1,
      systems: 0,
      tasks: 0,
      capacityRules: 0,
      capacityOverrides: 0,
      plannedAllocations: 0,
    },
  };

  it('renders envelope metadata and 4-column comparison table for valid backup', async () => {
    render(
      <ImportPreviewModal
        open={true}
        payload={validPayload}
        rawFileName="test-backup.json"
        db={testDb}
        onClose={vi.fn()}
        onRestoreSuccess={vi.fn()}
      />
    );

    expect(screen.getByText('test-backup.json')).toBeInTheDocument();
    expect(screen.getByText(/Phiên bản/)).toBeInTheDocument();
    // 4-column table headers
    expect(screen.getByText('Bảng dữ liệu')).toBeInTheDocument();
    expect(screen.getByText('Hiện tại trong máy')).toBeInTheDocument();
    expect(screen.getByText('Tệp nhập vào')).toBeInTheDocument();
    expect(screen.getByText('Chênh lệch')).toBeInTheDocument();
  });

  it('disables confirm button until exact keyword RESTORE is typed', async () => {
    const handleRestoreSuccess = vi.fn();
    const handleClose = vi.fn();

    render(
      <ImportPreviewModal
        open={true}
        payload={validPayload}
        rawFileName="test-backup.json"
        db={testDb}
        onClose={handleClose}
        onRestoreSuccess={handleRestoreSuccess}
      />
    );

    const okButton = screen.getByRole('button', { name: /Xác nhận khôi phục/i });
    expect(okButton).toBeDisabled();

    const input = screen.getByPlaceholderText('RESTORE');
    fireEvent.change(input, { target: { value: 'restore' } });
    expect(okButton).toBeDisabled();

    fireEvent.change(input, { target: { value: 'RESTORE' } });
    expect(okButton).not.toBeDisabled();

    fireEvent.click(okButton);
    await waitFor(() => {
      expect(handleRestoreSuccess).toHaveBeenCalled();
    });
  });

  it('renders error list and blocks confirm button when payload is invalid', async () => {
    const invalidPayload = {
      app: 'wrong-app',
      schemaVersion: 1,
      tables: {},
      counts: {},
    };

    render(
      <ImportPreviewModal
        open={true}
        payload={invalidPayload}
        rawFileName="invalid-backup.json"
        db={testDb}
        onClose={vi.fn()}
        onRestoreSuccess={vi.fn()}
      />
    );

    expect(screen.getByText(/Tệp sao lưu không hợp lệ/i)).toBeInTheDocument();
    const okButton = screen.getByRole('button', { name: /Xác nhận khôi phục/i });
    expect(okButton).toBeDisabled();
  });
});
