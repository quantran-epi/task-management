import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { TaskPlannerDatabase } from '../../../../src/db';
import { createSkill, updateSkill } from '../../../../src/db/repositories/aiOfficeRepo';
import * as aiSkillVersionRepo from '../../../../src/db/repositories/aiSkillVersionRepo';
import {
  createSkillVersion,
  decideSkillVersion,
  STALE_VERSION_MESSAGE,
} from '../../../../src/db/repositories/aiSkillVersionRepo';
import { SkillEditorDrawer } from '../../../../src/components/ai/office/SkillEditorDrawer';
import type { AiSkill } from '../../../../src/types/aiOffice';

const BODY = '# Quy trình\nBước 1: đọc yêu cầu.\nBước 2: viết đặc tả.';
const NEXT_BODY = `${BODY}\nBước 3: kiểm thử.`;

describe('SkillEditorDrawer — pending queue and version history (AIO-SKILL-01/03)', () => {
  let db: TaskPlannerDatabase;
  let skill: AiSkill;

  beforeEach(async () => {
    db = new TaskPlannerDatabase('TestSkillEditorDrawer_' + Math.random().toString(36).slice(2));
    await db.open();
    skill = await createSkill(
      { name: 'Viết đặc tả', description: 'Quy trình viết đặc tả.', body: BODY },
      db
    );
  });

  afterEach(async () => {
    cleanup();
    await db.delete();
  });

  const renderDrawer = (target: AiSkill | null, onSaved = vi.fn()) =>
    render(
      <SkillEditorDrawer
        open
        skill={target}
        onCancel={vi.fn()}
        onSaved={onSaved}
        db={db}
      />
    );

  const seedPending = (overrides: { name?: string; body?: string } = {}) =>
    createSkillVersion(
      {
        skillId: skill.id,
        name: overrides.name ?? skill.name,
        description: skill.description,
        body: overrides.body ?? NEXT_BODY,
      },
      db
    );

  it('create mode renders no pending section, no history and no save hint', async () => {
    renderDrawer(null);
    expect(await screen.findByTestId('skill-editor-drawer')).toBeInTheDocument();
    expect(screen.queryByTestId('skill-pending-section')).not.toBeInTheDocument();
    expect(screen.queryByTestId('skill-version-history')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Lưu thay đổi (nếu có) sẽ tạo một phiên bản mới trong lịch sử.')
    ).not.toBeInTheDocument();
  });

  it('edit mode shows an empty-history line for a skill with no versions (D-10)', async () => {
    renderDrawer(skill);
    expect(await screen.findByTestId('skill-version-history')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Chưa có phiên bản nào — lần lưu đầu tiên sẽ lưu nội dung hiện tại thành phiên bản 1.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByTestId('skill-pending-section')).not.toBeInTheDocument();
    expect(
      screen.getByText('Lưu thay đổi (nếu có) sẽ tạo một phiên bản mới trong lịch sử.')
    ).toBeInTheDocument();
  });

  // IN-02: the caption promises a version, and a no-op save writes none — so the button that
  // would break the promise is unreachable.
  it('disables Save until the form actually changed (IN-02)', async () => {
    renderDrawer(skill);
    const save = await screen.findByTestId('skill-editor-save');
    expect(save).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Tên'), { target: { value: 'Viết đặc tả v2' } });
    expect(save).not.toBeDisabled();

    // Typing back to the stored value is not a change either.
    fireEvent.change(screen.getByLabelText('Tên'), { target: { value: skill.name } });
    expect(save).toBeDisabled();
  });

  it('saving an edit produces an approved version row and a history entry (D-09)', async () => {
    renderDrawer(skill);
    fireEvent.change(await screen.findByLabelText('Tên'), { target: { value: 'Viết đặc tả v2' } });
    fireEvent.click(screen.getByTestId('skill-editor-save'));

    // CR-02: v1 is the create-time snapshot, so the save itself is v2.
    await waitFor(() =>
      expect(screen.getByTestId('skill-version-history')).toHaveTextContent('Lịch sử phiên bản (2)')
    );
    expect(await db.aiSkillVersions.where('skillId').equals(skill.id).count()).toBe(2);
    const history = screen.getByTestId('skill-version-history');
    expect(history).toHaveTextContent('v1');
    expect(history).toHaveTextContent('v2');
    expect(history).toHaveTextContent('Đã duyệt');
    // CR-02: the create-time body stays retrievable as v1.
    const baseline = (await db.aiSkillVersions.where('skillId').equals(skill.id).toArray()).find(
      (row) => row.version === 1
    );
    expect(baseline?.body).toBe(BODY);
  });

  it('a pending proposal renders a card and approving it keeps the card with its decision line (D-25)', async () => {
    const row = await seedPending();
    renderDrawer(skill);

    expect(await screen.findByTestId('skill-pending-section')).toBeInTheDocument();
    expect(screen.getByTestId('skill-editor-pending-badge')).toHaveTextContent('1 chờ duyệt');

    const card = screen.getByTestId(`skill-pending-card-${row.id}`);
    fireEvent.click(within(card).getByRole('button', { name: 'Chấp thuận' }));

    await waitFor(() =>
      expect(
        within(screen.getByTestId(`skill-pending-card-${row.id}`)).getByRole('status')
      ).toHaveTextContent('Đã chấp thuận — kỹ năng đã cập nhật sang bản mới.')
    );
    expect(screen.getByTestId(`skill-pending-card-${row.id}`)).toBeInTheDocument();

    const stored = await db.aiSkillVersions.get(row.id);
    expect(stored?.status).toBe('approved');
    // CR-03: the pre-approval content is snapshotted as v1, so the proposal takes v2.
    expect(stored?.version).toBe(2);
    expect((await db.aiSkills.get(skill.id))?.body).toBe(NEXT_BODY);
  });

  it('a rejected history row shows no version number (D-14)', async () => {
    const row = await seedPending();
    await decideSkillVersion(row.id, 'rejected', db);

    renderDrawer(skill);

    const history = await screen.findByTestId('skill-version-history');
    await waitFor(() => expect(history).toHaveTextContent('Đề xuất bị từ chối'));
    expect(history).toHaveTextContent('Đã từ chối');
    expect(history).not.toHaveTextContent('v0');
    expect(history).not.toHaveTextContent('vundefined');
  });

  it('history is view-only (D-12)', async () => {
    await updateSkill(skill.id, { body: NEXT_BODY }, db);
    const row = await seedPending();
    await decideSkillVersion(row.id, 'rejected', db);

    renderDrawer(skill);

    const history = await screen.findByTestId('skill-version-history');
    // CR-02: v1 (create-time) + v2 (the save) + the rejected proposal.
    await waitFor(() => expect(history).toHaveTextContent('Lịch sử phiên bản (3)'));
    expect(within(history).queryByRole('button', { name: /khôi phục|restore/i })).toBeNull();
    expect(within(history).queryByRole('button', { name: /sửa|edit/i })).toBeNull();
  });

  it('a row decided in this session is not duplicated into history', async () => {
    const row = await seedPending();
    renderDrawer(skill);

    const card = await screen.findByTestId(`skill-pending-card-${row.id}`);
    fireEvent.click(within(card).getByRole('button', { name: 'Chấp thuận' }));

    await waitFor(() =>
      expect(
        within(screen.getByTestId(`skill-pending-card-${row.id}`)).getByRole('status')
      ).toHaveTextContent('Đã chấp thuận')
    );
    expect(screen.getByTestId(`skill-pending-card-${row.id}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`skill-version-row-${row.id}`)).toBeNull();
    // CR-03: the approval snapshotted the pre-approval content as v1, so history is not empty.
    expect(screen.getByTestId('skill-version-history')).toHaveTextContent('Lịch sử phiên bản (1)');
    expect(screen.getByTestId('skill-version-history')).toHaveTextContent('v1');
  });

  it('a stale proposal in the durable queue disables Approve but keeps Reject enabled (D-16)', async () => {
    const stale = await seedPending({ body: `${BODY}\nBước 3: bản cũ.` });
    const newer = await seedPending({ body: `${BODY}\nBước 3: bản mới.` });
    await decideSkillVersion(newer.id, 'approved', db);

    renderDrawer(skill);

    const card = await screen.findByTestId(`skill-pending-card-${stale.id}`);
    expect(within(card).getByRole('button', { name: 'Chấp thuận' })).toBeDisabled();
    expect(within(card).getByRole('button', { name: 'Từ chối' })).not.toBeDisabled();
    expect(within(card).getByRole('alert')).toHaveTextContent(
      'Kỹ năng đã có bản mới được duyệt sau khi đề xuất này được tạo.'
    );
  });

  // WR-01: approving raises `highestApproved` to the row's own number, so the stale check
  // would fire on the card the user just approved.
  it('a just-approved card shows no stale warning (WR-01)', async () => {
    const row = await seedPending();
    renderDrawer(skill);

    const card = await screen.findByTestId(`skill-pending-card-${row.id}`);
    fireEvent.click(within(card).getByRole('button', { name: 'Chấp thuận' }));

    await waitFor(() =>
      expect(
        within(screen.getByTestId(`skill-pending-card-${row.id}`)).getByRole('status')
      ).toHaveTextContent('Đã chấp thuận')
    );
    const decided = screen.getByTestId(`skill-pending-card-${row.id}`);
    expect(within(decided).queryByRole('alert')).toBeNull();
    expect(decided).not.toHaveTextContent('đề xuất lại');
  });

  // WR-02: D-25 keeps the decided card visible, but the badge and the header count only
  // what is still pending — `SkillCard` reads 0 at the same moment.
  it('the pending badge and header count only still-pending proposals (WR-02)', async () => {
    const row = await seedPending();
    renderDrawer(skill);

    expect(await screen.findByTestId('skill-editor-pending-badge')).toHaveTextContent(
      '1 chờ duyệt'
    );

    const card = screen.getByTestId(`skill-pending-card-${row.id}`);
    fireEvent.click(within(card).getByRole('button', { name: 'Chấp thuận' }));

    await waitFor(() =>
      expect(screen.queryByTestId('skill-editor-pending-badge')).not.toBeInTheDocument()
    );
    // The card itself stays (D-25), only the count drops.
    expect(screen.getByTestId(`skill-pending-card-${row.id}`)).toBeInTheDocument();
    expect(screen.getByTestId('skill-pending-section')).not.toHaveTextContent('Chờ duyệt (1)');
  });

  // WR-02: a restored backup can carry a pending whose `baseVersion` resolves to no approved
  // row. It renders no card, so it must still be counted and surfaced — `SkillCard` reads the
  // raw DB count and the two surfaces may not disagree.
  it('counts and surfaces a pending proposal whose base cannot resolve (WR-02)', async () => {
    await db.aiSkillVersions.add({
      id: 'dangling-pending',
      skillId: skill.id,
      status: 'pending',
      name: skill.name,
      description: skill.description,
      body: NEXT_BODY,
      baseVersion: 9,
      createdAt: new Date().toISOString(),
    });

    renderDrawer(skill);

    expect(await screen.findByTestId('skill-editor-pending-badge')).toHaveTextContent(
      '1 chờ duyệt'
    );
    const section = screen.getByTestId('skill-pending-section');
    expect(section).toHaveTextContent('Chờ duyệt (1)');
    expect(screen.queryByTestId('skill-pending-card-dangling-pending')).toBeNull();
    expect(screen.getByTestId('skill-pending-unresolved')).toHaveTextContent(
      'Còn 1 đề xuất không xem được bản diff — hãy từ chối hoặc đề xuất lại.'
    );
  });

  // WR-03: the disabled Approve button reads a live query, so it is an affordance. The repo
  // refuses the stale approval, and the card must say why instead of the generic retry copy.
  it('surfaces the repo refusal when a stale approval is attempted (WR-03)', async () => {
    const row = await seedPending();
    const spy = vi
      .spyOn(aiSkillVersionRepo, 'decideSkillVersion')
      .mockRejectedValueOnce(new Error(STALE_VERSION_MESSAGE));

    renderDrawer(skill);

    const card = await screen.findByTestId(`skill-pending-card-${row.id}`);
    fireEvent.click(within(card).getByRole('button', { name: 'Chấp thuận' }));

    await waitFor(() =>
      expect(within(screen.getByTestId(`skill-pending-card-${row.id}`)).getByRole('alert'))
        .toHaveTextContent('Kỹ năng đã có bản mới được duyệt sau khi đề xuất này được tạo.')
    );
    // The reviewed base is handed to the repo — the guard is not UI-only.
    expect(spy).toHaveBeenCalledWith(row.id, 'approved', db, 0);
    spy.mockRestore();
  });

  it('the pending card subtitle names the skill without inventing a proposer', async () => {
    const row = await seedPending();
    renderDrawer(skill);

    const card = await screen.findByTestId(`skill-pending-card-${row.id}`);
    expect(within(card).getByText(`Kỹ năng · ${skill.name}`)).toBeInTheDocument();
    expect(card).not.toHaveTextContent('đề xuất bởi');
  });
});
