import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TaskPlannerDatabase } from '../../../src/db';
import { createChangeRequest, getChangeRequest } from '../../../src/db/repositories/changeRequestRepo';
import {
  SubsystemProposalCard,
  isProposalDismissed,
  proposalDismissedKey,
} from '../../../src/components/sdlc/common/SubsystemProposalCard';
import type { ChangeRequest } from '../../../src/types/models';
import type { SubsystemProposalResult } from '../../../src/services/ai/sdlcArtifactTools';

const PARENT_ID = '11111111-1111-4111-8111-111111111111';
const SERVICE_ID = '22222222-2222-4222-8222-222222222222';
const SCHEMA_ID = '33333333-3333-4333-8333-333333333333';

const proposal: SubsystemProposalResult = {
  items: [
    { systemId: SERVICE_ID, code: 'PAY-SVC', name: 'Payment Service', confidence: 'high', reason: 'Solution touches the payment repo.' },
    { systemId: SCHEMA_ID, code: 'BILL-DB', name: 'Billing Schema', confidence: 'medium', reason: 'Migration file listed in the pack.' },
  ],
  evidence: ['SOLUTION §2.1', 'manifest src/pay.ts'],
};

describe('SubsystemProposalCard', () => {
  let db: TaskPlannerDatabase;
  let cr: ChangeRequest;

  beforeEach(async () => {
    db = new TaskPlannerDatabase(`proposal-card-${crypto.randomUUID()}`);
    await db.open();
    const now = '2026-11-08T00:00:00.000Z';
    await db.systems.bulkAdd([
      { id: PARENT_ID, name: 'Core Banking', code: 'CORE', parentId: null, type: 'LOGICAL_GROUP', createdAt: now, updatedAt: now },
      { id: SERVICE_ID, name: 'Payment Service', code: 'PAY-SVC', parentId: PARENT_ID, type: 'SERVICE', createdAt: now, updatedAt: now },
      { id: SCHEMA_ID, name: 'Billing Schema', code: 'BILL-DB', parentId: PARENT_ID, type: 'SCHEMA', createdAt: now, updatedAt: now },
    ]);
    cr = await createChangeRequest({ name: 'Payments revamp', code: 'CR-1', type: 'ENHANCEMENT' as const, status: 'Open' as const, targets: [] }, db);
  });

  afterEach(async () => {
    await db.delete();
  });

  it('renders one checked checkbox per item with code, name, confidence and reason', async () => {
    render(<SubsystemProposalCard proposal={proposal} changeRequest={cr} db={db} onApprove={vi.fn()} onSkip={vi.fn()} />);
    const boxes = await screen.findAllByRole('checkbox');
    expect(boxes).toHaveLength(2);
    for (const box of boxes) expect(box).toBeChecked();
    expect(screen.getByText('PAY-SVC')).toBeInTheDocument();
    expect(screen.getByText('Payment Service')).toBeInTheDocument();
    expect(screen.getByText('Cao')).toBeInTheDocument();
    expect(screen.getByText('Trung bình')).toBeInTheDocument();
    expect(screen.getByText('Solution touches the payment repo.')).toBeInTheDocument();
    expect(screen.getByText('Bằng chứng (2)')).toBeInTheDocument();
  });

  it('titles the card by whether the CR already has targets', async () => {
    const { unmount } = render(
      <SubsystemProposalCard proposal={proposal} changeRequest={cr} db={db} onApprove={vi.fn()} onSkip={vi.fn()} />
    );
    expect(await screen.findByText('Đề xuất subsystem ảnh hưởng')).toBeInTheDocument();
    unmount();

    const withTargets = await createChangeRequest({
      name: 'Existing', code: 'CR-2', type: 'ENHANCEMENT' as const, status: 'Open' as const,
      targets: [{ systemId: SERVICE_ID }],
    }, db);
    render(<SubsystemProposalCard proposal={proposal} changeRequest={withTargets} db={db} onApprove={vi.fn()} onSkip={vi.fn()} />);
    expect(await screen.findByText('Đề xuất bổ sung subsystem')).toBeInTheDocument();
    expect(screen.getByText('CR đã có 1 subsystem — chỉ liệt kê phần còn thiếu.')).toBeInTheDocument();
  });

  it('disables the add button with a tooltip when nothing is ticked', async () => {
    render(<SubsystemProposalCard proposal={proposal} changeRequest={cr} db={db} onApprove={vi.fn()} onSkip={vi.fn()} />);
    const boxes = await screen.findAllByRole('checkbox');
    for (const box of boxes) fireEvent.click(box);
    const add = screen.getByRole('button', { name: 'Thêm vào CR' });
    expect(add).toBeDisabled();
    fireEvent.mouseEnter(add.parentElement!);
    expect(await screen.findByText('Chọn ít nhất một subsystem')).toBeInTheDocument();
  });

  it('reports the ticked ids on confirm and collapses to a success strip', async () => {
    const onApprove = vi.fn();
    render(<SubsystemProposalCard proposal={proposal} changeRequest={cr} db={db} onApprove={onApprove} onSkip={vi.fn()} />);
    const boxes = await screen.findAllByRole('checkbox');
    fireEvent.click(boxes[1]!);
    fireEvent.click(screen.getByRole('button', { name: 'Thêm vào CR' }));
    expect(onApprove).toHaveBeenCalledWith([SERVICE_ID]);
    expect(await screen.findByText('Đã thêm 1 subsystem vào CR')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('persists dismissal so the same CR never shows the card again', async () => {
    const onSkip = vi.fn();
    const { unmount } = render(
      <SubsystemProposalCard proposal={proposal} changeRequest={cr} db={db} onApprove={vi.fn()} onSkip={onSkip} />
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Bỏ qua' }));
    await waitFor(async () => expect(await isProposalDismissed(cr.id, db)).toBe(true));
    expect(onSkip).toHaveBeenCalled();
    expect((await db.settings.get(proposalDismissedKey(cr.id)))?.value).toBeTruthy();
    unmount();

    render(<SubsystemProposalCard proposal={proposal} changeRequest={cr} db={db} onApprove={vi.fn()} onSkip={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText('Đề xuất subsystem ảnh hưởng')).not.toBeInTheDocument());
  });

  it('lists only subsystems the CR does not already target', async () => {
    const additive = await createChangeRequest({
      name: 'Existing', code: 'CR-3', type: 'ENHANCEMENT' as const, status: 'Open' as const,
      targets: [{ systemId: SERVICE_ID }],
    }, db);
    render(<SubsystemProposalCard proposal={proposal} changeRequest={additive} db={db} onApprove={vi.fn()} onSkip={vi.fn()} />);
    expect(await screen.findByText('BILL-DB')).toBeInTheDocument();
    expect(screen.queryByText('PAY-SVC')).not.toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
  });

  it('never writes cr.targets without a click', async () => {
    render(<SubsystemProposalCard proposal={proposal} changeRequest={cr} db={db} onApprove={vi.fn()} onSkip={vi.fn()} />);
    await screen.findAllByRole('checkbox');
    expect((await getChangeRequest(cr.id, db))!.targets).toEqual([]);
  });
});
