import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TaskPlannerDatabase } from '../../../src/db';
import { LocalSqlitePersistenceCard } from '../../../src/components/settings/LocalSqlitePersistenceCard';
import { SQLITE_SETTING_KEYS } from '../../../src/services/localSqlitePersistence';

const invokeMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

describe('LocalSqlitePersistenceCard', () => {
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    db = new TaskPlannerDatabase(`test-local-sqlite-card-${Date.now()}-${Math.random()}`);
    await db.open();
    invokeMock.mockReset();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('shows missing-path recovery state without clearing local data', async () => {
    await db.tasks.add({
      id: 'task-1',
      name: 'Keep me',
      status: 'Open',
      progress: 0,
      priority: 'Medium',
      estimateMinutes: 30,
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    });
    await db.settings.bulkPut([
      { key: SQLITE_SETTING_KEYS.path, value: 'missing.sqlite' },
      { key: SQLITE_SETTING_KEYS.enabled, value: true },
      { key: SQLITE_SETTING_KEYS.missingPath, value: true },
    ]);

    render(<LocalSqlitePersistenceCard db={db} />);

    expect(await screen.findByText(/Không tìm thấy tệp SQLite/)).toBeInTheDocument();
    await expect(db.tasks.count()).resolves.toBe(1);
  });

  it('selects and initializes a SQLite path from native dialog', async () => {
    invokeMock.mockResolvedValueOnce('C:/Users/me/tasks.sqlite').mockResolvedValueOnce(undefined);

    render(<LocalSqlitePersistenceCard db={db} />);

    fireEvent.click(await screen.findByRole('button', { name: /Chọn tệp SQLite/i }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('select_sqlite_path');
      expect(invokeMock).toHaveBeenCalledWith('sqlite_init', { path: 'C:/Users/me/tasks.sqlite' });
    });
    await expect(db.settings.get(SQLITE_SETTING_KEYS.path)).resolves.toMatchObject({
      value: 'C:/Users/me/tasks.sqlite',
    });
  });
});
