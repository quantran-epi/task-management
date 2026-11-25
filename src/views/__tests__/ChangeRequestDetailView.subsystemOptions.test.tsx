// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ThemeAppHolder } from '../../components/ui';
import { TaskPlannerDatabase } from '../../db';
import { createChangeRequest } from '../../db/repositories/changeRequestRepo';
import { createSystem } from '../../db/repositories/systemRepo';
import { createTask } from '../../db/repositories/taskRepo';
import { generateId } from '../../utils/uuid';
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

function openSubsystemSelect(taskId: string): HTMLElement {
  const cell = screen.getByTestId(`subsystem-cell-${taskId}`);
  const combobox = cell.querySelector('[role="combobox"]');
  if (!combobox) throw new Error('Subsystem Select combobox not found');
  fireEvent.mouseDown(combobox);
  return combobox as HTMLElement;
}

describe('ChangeRequestDetailView subsystem options', () => {
  let db: TaskPlannerDatabase;

  beforeEach(() => {
    db = new TaskPlannerDatabase(`TestDB_ffm_${Math.random()}`);
  });

  afterEach(async () => {
    await db.delete();
  });

  it('shows system name alongside code and still writes systemId', async () => {
    const system = await createSystem({ name: 'Web app', code: 'WEB', parentId: null, type: 'SERVICE' }, db);
    const cr = await createChangeRequest(
      { name: 'CR FF', code: 'FF', status: 'Open', type: 'ENHANCEMENT', targets: [{ systemId: system.id }] },
      db
    );
    const task = await createTask(
      { crId: cr.id, systemId: system.id, name: 'Task FF' },
      db
    );

    await renderDetail(db, cr.id);
    openSubsystemSelect(task.id);

    expect(
      screen.getByText('Web app (WEB)', { selector: '.ant-select-item-option-content' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('Chung (không gắn)', { selector: '.ant-select-item-option-content' })
    ).toBeInTheDocument();
    expect(document.querySelectorAll('.ant-select-item-option-content')).toHaveLength(2);

    fireEvent.click(screen.getByText('Chung (không gắn)', { selector: '.ant-select-item-option-content' }));
    await waitFor(async () => {
      expect((await db.tasks.get(task.id))?.systemId).toBeUndefined();
    });

    openSubsystemSelect(task.id);
    fireEvent.click(screen.getByText('Web app (WEB)', { selector: '.ant-select-item-option-content' }));
    await waitFor(async () => {
      expect((await db.tasks.get(task.id))?.systemId).toBe(system.id);
    });
  });

  it('falls back to raw systemId when no system row exists for a target', async () => {
    const unknownId = generateId();
    await db.changeRequests.add({
      id: generateId(),
      name: 'CR unknown target',
      code: 'FFU',
      status: 'Open',
      type: 'ENHANCEMENT',
      targets: [{ systemId: unknownId, featureBranch: 'feature/FFU' }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const cr = (await db.changeRequests.where('code').equals('FFU').first())!;
    const task = await createTask({ crId: cr.id, name: 'Task unknown' }, db);

    await renderDetail(db, cr.id);
    openSubsystemSelect(task.id);

    expect(
      screen.getByText(unknownId, { selector: '.ant-select-item-option-content' })
    ).toBeInTheDocument();
  });
});
