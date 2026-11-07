import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TaskPlannerDatabase } from '../../../src/db';
import { createSystem } from '../../../src/db/repositories/systemRepo';
import { ChangeRequestModal } from '../../../src/components/changeRequests/ChangeRequestModal';

/**
 * Wave 0 contract for plan 31.2-12 Task 3 (ENT-NORM-02, D-25/D-34/D-46).
 *
 * `ChangeRequestModal` gains `initialTargets?: CrTarget[]` (pre-filled, soft-locked) and
 * submits `targets: CrTarget[]` instead of `targetSystemIds: string[]`. The `feature/{code}`
 * default is applied by the CR repo, not the modal. RED until plan 12 lands.
 */
describe('ChangeRequestModal — pre-filled targets and targets payload (ENT-NORM-02)', () => {
  let db: TaskPlannerDatabase;
  let subsystemId: string;

  beforeEach(async () => {
    db = new TaskPlannerDatabase('test-cr-modal-targets-' + Math.random().toString(36).slice(2));
    await db.open();
    const parent = await createSystem(
      { name: 'SmartCard Core', code: 'SC-CORE', type: 'LOGICAL_GROUP' },
      db
    );
    const subsystem = await createSystem(
      { name: 'Card Auth API', code: 'SC-AUTH-API', parentId: parent.id, type: 'SERVICE' },
      db
    );
    subsystemId = subsystem.id;
  });

  afterEach(async () => {
    await db.delete();
  });

  function renderModal(props: Record<string, unknown> = {}) {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <ChangeRequestModal
        open={true}
        onClose={vi.fn()}
        onSave={onSave}
        db={db}
        {...props}
      />
    );
    return { onSave };
  }

  it('accepts an initialTargets prop and renders the subsystem as preselected', async () => {
    renderModal({ initialTargets: [{ systemId: subsystemId }] });

    await waitFor(() => {
      expect(screen.getByTestId('target-systems-selector').textContent).toContain('SC-AUTH-API');
    });
  });

  it('marks a preselected subsystem as preselected without hard-locking it', async () => {
    renderModal({ initialTargets: [{ systemId: subsystemId }] });

    const selector = await waitFor(() => screen.getByTestId('target-systems-selector'));
    // Soft lock: the selection is removable via the tag close affordance.
    expect(selector.querySelector('.ant-select-selection-item-remove, .ant-select-content-item-remove')).not.toBeNull();
  });

  it('submits targets as CrTarget[] and leaves featureBranch to the repo', async () => {
    const { onSave } = renderModal({ initialTargets: [{ systemId: subsystemId }] });

    fireEvent.change(screen.getByPlaceholderText('vd: Tích hợp xác thực SmartCard và hoàn tiền tự động'), {
      target: { value: 'Tokenization' },
    });
    fireEvent.change(screen.getByPlaceholderText('vd: CR-2026-001'), {
      target: { value: 'CR-9' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo Change Request' }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalled();
    });
    const payload = onSave.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.targets).toEqual([{ systemId: subsystemId }]);
    expect(payload).not.toHaveProperty('targetSystemIds');
    expect(payload).not.toHaveProperty('projectId');
  });

  it('blocks saving with zero targets', async () => {
    const { onSave } = renderModal();

    fireEvent.change(screen.getByPlaceholderText('vd: Tích hợp xác thực SmartCard và hoàn tiền tự động'), {
      target: { value: 'Tokenization' },
    });
    fireEvent.change(screen.getByPlaceholderText('vd: CR-2026-001'), {
      target: { value: 'CR-9' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo Change Request' }));

    await waitFor(() => {
      expect(screen.getByText('Vui lòng chọn ít nhất 1 subsystem chịu ảnh hưởng.')).toBeInTheDocument();
    });
    expect(onSave).not.toHaveBeenCalled();
  });
});
