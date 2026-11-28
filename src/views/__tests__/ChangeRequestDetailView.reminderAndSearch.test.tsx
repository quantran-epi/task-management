// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ThemeAppHolder } from '../../components/ui';
import { TaskPlannerDatabase } from '../../db';
import { createChangeRequest } from '../../db/repositories/changeRequestRepo';
import { createTask } from '../../db/repositories/taskRepo';
import { ChangeRequestDetailView } from '../ChangeRequestDetailView';

async function renderDetail(db: TaskPlannerDatabase, crId: string) {
  const result = render(
    <ThemeAppHolder>
      <ChangeRequestDetailView changeRequestId={crId} db={db} />
    </ThemeAppHolder>
  );
  await screen.findByRole('columnheader', { name: 'Subsystem' });
  return result;
}

describe('ChangeRequestDetailView reminder and search', () => {
  let db: TaskPlannerDatabase;

  beforeEach(() => {
    db = new TaskPlannerDatabase(`TestDB_cpo_${Math.random()}`);
  });

  afterEach(async () => {
    await db.delete();
  });

  it('dùng SearchInput chuẩn, không có nút search tách rời', async () => {
    const cr = await createChangeRequest(
      { name: 'CR CPO', code: 'CPO', status: 'Open', type: 'ENHANCEMENT', targets: [] },
      db
    );
    await createTask({ crId: cr.id, name: 'Task CPO' }, db);

    await renderDetail(db, cr.id);

    const search = screen.getByTestId('cr-detail-task-search');
    const wrapper = search.closest('.ant-input-affix-wrapper');
    expect(search.querySelector('.ant-input-search-button')).toBeNull();
    expect(wrapper?.querySelector('.ant-input-prefix .anticon-search') ?? null).not.toBeNull();
    expect(search.getAttribute('placeholder')).toBe('Tìm tác vụ');
  });

  it('thêm nhắc nhở nhanh cho CR', async () => {
    const cr = await createChangeRequest(
      { name: 'CR CPO', code: 'CPOR', status: 'Open', type: 'ENHANCEMENT', targets: [] },
      db
    );
    await createTask({ crId: cr.id, name: 'Task CPO' }, db);

    await renderDetail(db, cr.id);

    fireEvent.click(screen.getByTestId('cr-detail-reminder-add'));
    await waitFor(() => {
      expect(screen.getByRole('dialog').textContent).toContain('Thêm nhắc nhở: CR');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Lưu nhắc nhở' }));

    await waitFor(async () => {
      const updated = await db.changeRequests.get(cr.id);
      expect(updated?.reminders).toHaveLength(1);
      expect(updated?.reminders?.[0]?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });
});
