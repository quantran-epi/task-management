import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TaskPlannerDatabase } from '../../../src/db/index';
import { SnapshotRollbackCard } from '../../../src/components/settings/SnapshotRollbackCard';
import type { SnapshotData } from '../../../src/types/backup';

describe('SnapshotRollbackCard', () => {
  let testDb: TaskPlannerDatabase;

  beforeEach(async () => {
    testDb = new TaskPlannerDatabase('TestSnapshotCard_' + Math.random().toString(36).slice(2));
    await testDb.open();
  });

  afterEach(async () => {
    await testDb.delete();
  });

  it('renders empty state when no snapshot exists in settings', async () => {
    render(<SnapshotRollbackCard db={testDb} />);
    expect(await screen.findByText(/Chưa có bản snapshot an toàn/i)).toBeInTheDocument();
  });

  it('renders snapshot details and action buttons when snapshot exists', async () => {
    const sampleSnapshot: SnapshotData = {
      timestamp: '2026-09-27T14:30:00.000Z',
      tables: {
        projects: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            name: 'Snapshot Project',
            status: 'Open',
            createdAt: '2026-09-27T10:00:00.000Z',
            updatedAt: '2026-09-27T10:00:00.000Z',
          },
        ],
        milestones: [],
        tasks: [],
        capacityRules: [],
        capacityOverrides: [],
        plannedAllocations: [],
      },
      counts: {
        projects: 1,
        milestones: 0,
        tasks: 0,
        capacityRules: 0,
        capacityOverrides: 0,
        plannedAllocations: 0,
      },
    };

    await testDb.settings.put({
      key: 'last_pre_import_snapshot',
      value: sampleSnapshot,
    });

    render(<SnapshotRollbackCard db={testDb} />);

    expect(await screen.findByText(/Bản an toàn tự động trước khi nhập/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Khôi phục từ bản an toàn này/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tải bản snapshot về máy/i })).toBeInTheDocument();
  });
});
