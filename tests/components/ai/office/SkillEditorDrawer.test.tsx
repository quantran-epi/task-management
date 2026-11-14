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

  // UAT item 2: a skill accumulates a row per save and per approval, so the history list must
  // scroll inside the drawer rather than growing it without bound. jsdom has no layout, so this
  // asserts the scroll container exists and holds every row — the visual check is the ceiling.
  it('scrolls the version history instead of growing the drawer (UAT)', async () => {
    for (let i = 0; i < 12; i += 1) {
      await updateSkill(skill.id, { body: `${BODY}\nBước phụ ${i}.` }, db);
    }
    renderDrawer(skill);

    const history = await screen.findByTestId('skill-version-history');
    await waitFor(() => expect(history).toHaveTextContent('Lịch sử phiên bản (13)'));
    expect(await db.aiSkillVersions.where('skillId').equals(skill.id).count()).toBe(13);

    // The scrolling wrapper must actually bound and scroll — assert the values, not the names.
    const scroller = history.querySelector('div[style*="overflow-y"]') as HTMLElement | null;
    expect(scroller, 'scroll container').not.toBeNull();
    expect(scroller!.style.maxHeight).toMatch(/^\d+px$/);
    expect(Number.parseInt(scroller!.style.maxHeight, 10)).toBeGreaterThan(0);
    expect(['auto', 'scroll']).toContain(scroller!.style.overflowY);

    // Every version must be INSIDE that scroller and reachable — a row rendered outside it
    // would not scroll with the list. Counting document-wide would miss that.
    const rows = within(scroller!).getAllByTestId(/^skill-version-row-/);
    expect(rows).toHaveLength(13);
    expect(new Set(rows.map((r) => r.getAttribute('data-testid'))).size).toBe(13);
    // Each row shows its number (or the rejected label) and a DD/MM/YYYY HH:mm timestamp.
    expect(scroller).toHaveTextContent('v1');
    expect(scroller).toHaveTextContent('v13');
    expect(scroller!.textContent).toMatch(/\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/);
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
  // row. It renders no diff card, so it must still be counted and surfaced — `SkillCard` reads
  // the raw DB count and the two surfaces may not disagree.
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
    expect(screen.getByTestId('skill-pending-unresolved-dangling-pending')).toHaveTextContent(
      'Đề xuất này không xem được bản diff — hãy từ chối để dọn hàng chờ.'
    );
  });

  // WR-02: the unresolved row used to be a text line with no action, so the badge and the
  // header stayed forever. Rejection is not blocked by the stale guard, so it gets a control.
  it('rejects an unresolved pending proposal so the queue can be cleared (WR-02)', async () => {
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

    const row = await screen.findByTestId('skill-pending-unresolved-dangling-pending');
    fireEvent.click(within(row).getByRole('button', { name: 'Từ chối' }));

    await waitFor(() =>
      expect(screen.queryByTestId('skill-editor-pending-badge')).not.toBeInTheDocument()
    );
    expect(screen.queryByTestId('skill-pending-unresolved-dangling-pending')).toBeNull();
    expect((await db.aiSkillVersions.get('dangling-pending'))?.status).toBe('rejected');
    // It lands in history, which is where a decided row belongs.
    expect(screen.getByTestId('skill-version-history')).toHaveTextContent('Đề xuất bị từ chối');
  });

  // CR-02: the drawer is also the approval queue (D-26). Approving overwrites `aiSkills`; the
  // form used to stay seeded from the frozen `skill` prop, so the next save wrote the
  // pre-approval body back over the approved version.
  it('never writes a body older than the version approved in the drawer (CR-02)', async () => {
    const row = await seedPending({ body: NEXT_BODY });
    renderDrawer(skill);

    const card = await screen.findByTestId(`skill-pending-card-${row.id}`);
    fireEvent.click(within(card).getByRole('button', { name: 'Chấp thuận' }));
    await waitFor(() =>
      expect(
        within(screen.getByTestId(`skill-pending-card-${row.id}`)).getByRole('status')
      ).toHaveTextContent('Đã chấp thuận')
    );

    // The form re-seeds from the approved copy, so an untouched form is not dirty.
    expect(screen.getByLabelText('Nội dung')).toHaveValue(NEXT_BODY);

    // Edit only the name and save — the approved body must survive.
    fireEvent.change(screen.getByLabelText('Tên'), { target: { value: 'Viết đặc tả v2' } });
    fireEvent.click(screen.getByTestId('skill-editor-save'));

    await waitFor(async () =>
      expect((await db.aiSkills.get(skill.id))?.name).toBe('Viết đặc tả v2')
    );
    expect((await db.aiSkills.get(skill.id))?.body).toBe(NEXT_BODY);
  });

  // CR-02/WR-05: the same shape without touching the drawer — a save built from a draft whose
  // row moved underneath is refused at the state owner, not silently applied. The copy no
  // longer promises a reload: WR-05 keeps the draft and offers the reload instead.
  it('surfaces the moved-row refusal when the underlying skill changed (CR-02)', async () => {
    renderDrawer(skill);
    fireEvent.change(await screen.findByLabelText('Tên'), { target: { value: 'Bản nháp' } });

    // Another surface writes a newer body while the draft is open.
    await updateSkill(skill.id, { body: NEXT_BODY }, db);

    fireEvent.click(screen.getByTestId('skill-editor-save'));

    await waitFor(() =>
      expect(screen.getByTestId('skill-editor-save-error')).toHaveTextContent(
        'Kỹ năng vừa được cập nhật ở nơi khác. Tải lại nội dung mới, kiểm tra rồi lưu lại.'
      )
    );
    // The newer body is intact; the draft did not overwrite it.
    expect((await db.aiSkills.get(skill.id))?.body).toBe(NEXT_BODY);
  });

  // WR-02: a failed reject on an unresolved row used to write into the `error` map that this
  // row never read — the click looked dead. Mirror the card and surface it.
  it('surfaces a failed reject on an unresolved pending proposal (WR-02)', async () => {
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
    const spy = vi
      .spyOn(aiSkillVersionRepo, 'decideSkillVersion')
      .mockRejectedValueOnce(new Error('write failed'));

    renderDrawer(skill);

    const row = await screen.findByTestId('skill-pending-unresolved-dangling-pending');
    fireEvent.click(within(row).getByRole('button', { name: 'Từ chối' }));

    await waitFor(() =>
      expect(
        within(screen.getByTestId('skill-pending-unresolved-dangling-pending')).getByRole('alert')
      ).toHaveTextContent(
        'Không duyệt được đề xuất. Đề xuất vẫn còn trong danh sách chờ duyệt — thử lại.'
      )
    );
    // The row stays pending — the safe state.
    expect((await db.aiSkillVersions.get('dangling-pending'))?.status).toBe('pending');
    spy.mockRestore();
  });

  // WR-01: approving a base-0 proposal overwrites `aiSkills`, so that same row's diff collapses
  // to NO_CHANGES and it loses its patch. Without the `recentlyDecided` filter it rendered as a
  // decided card AND as a stray unresolved row whose `Từ chối` reported a failure on a
  // successful approval. The write is held open so the window is observable.
  it('never shows a just-decided row in the unresolved list (WR-01)', async () => {
    const row = await seedPending({ body: NEXT_BODY });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const real = aiSkillVersionRepo.decideSkillVersion;
    const spy = vi
      .spyOn(aiSkillVersionRepo, 'decideSkillVersion')
      .mockImplementation(async (...args) => {
        // The approval's first effect: `aiSkills` now holds the proposal body. Written
        // directly so no extra version row shifts `latestApproved` and makes the row stale.
        const current = await db.aiSkills.get(skill.id);
        await db.aiSkills.put({
          ...current!,
          name: row.name,
          description: row.description,
          body: row.body,
          updatedAt: new Date().toISOString(),
        });
        await gate;
        return real(...args);
      });

    renderDrawer(skill);

    const card = await screen.findByTestId(`skill-pending-card-${row.id}`);
    fireEvent.click(within(card).getByRole('button', { name: 'Chấp thuận' }));

    // `aiSkills` moved, the version row is still pending: the diff is empty, so the row would
    // fall into `unresolvedRows` while the snapshot still renders its card.
    await waitFor(() =>
      expect(screen.getByTestId(`skill-pending-card-${row.id}`)).toBeInTheDocument()
    );
    expect(screen.queryByTestId(`skill-pending-unresolved-${row.id}`)).toBeNull();

    release();
    await waitFor(() =>
      expect(
        within(screen.getByTestId(`skill-pending-card-${row.id}`)).getByRole('status')
      ).toHaveTextContent('Đã chấp thuận')
    );
    expect(screen.queryByTestId(`skill-pending-unresolved-${row.id}`)).toBeNull();
    spy.mockRestore();
  });

  // WR-05: the seed effect is keyed on `updatedAt`, so an external write re-seeded the form and
  // silently discarded a typed draft — and `dirty` flipped to false, disabling Save, so the
  // user could think their edit was saved. Keep the draft and say so.
  it('keeps a typed draft when another surface writes, and offers a reload (WR-05)', async () => {
    renderDrawer(skill);
    const bodyField = await screen.findByLabelText('Nội dung');
    fireEvent.change(bodyField, { target: { value: 'BẢN NHÁP TÔI VỪA GÕ' } });

    await updateSkill(skill.id, { body: NEXT_BODY }, db);

    expect(
      await screen.findByTestId('skill-editor-reload-notice')
    ).toHaveTextContent('Bản nháp của bạn vẫn được giữ.');
    // The draft survives, and Save stays enabled because it is still a real change.
    expect(screen.getByLabelText('Nội dung')).toHaveValue('BẢN NHÁP TÔI VỪA GÕ');
    expect(screen.getByTestId('skill-editor-save')).toBeEnabled();

    // The user takes the new content explicitly.
    fireEvent.click(screen.getByRole('button', { name: 'Tải lại nội dung mới' }));
    await waitFor(() => expect(screen.getByLabelText('Nội dung')).toHaveValue(NEXT_BODY));
    expect(screen.queryByTestId('skill-editor-reload-notice')).toBeNull();
  });

  // WR-01: `decide()` snapshots the row before awaiting the write, while the live query still
  // carries it. Both lists contributed the same row for one refresh tick — a duplicate React
  // key, and a second Approve click that reached an already-decided row. The write is held
  // open here so the window is observable.
  it('never renders the same pending row twice while the decision lands (WR-01)', async () => {
    const row = await seedPending();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const real = aiSkillVersionRepo.decideSkillVersion;
    const spy = vi
      .spyOn(aiSkillVersionRepo, 'decideSkillVersion')
      .mockImplementation(async (...args) => {
        await gate;
        return real(...args);
      });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    renderDrawer(skill);

    const card = await screen.findByTestId(`skill-pending-card-${row.id}`);
    fireEvent.click(within(card).getByRole('button', { name: 'Chấp thuận' }));

    // Write in flight: the snapshot is in `recentlyDecided` and the live query still has the
    // row. It must render once.
    await waitFor(() =>
      expect(screen.getAllByTestId(`skill-pending-card-${row.id}`)).toHaveLength(1)
    );
    expect(
      consoleError.mock.calls.some((args) => String(args[0]).includes('same key'))
    ).toBe(false);

    release();
    await waitFor(() =>
      expect(
        within(screen.getByTestId(`skill-pending-card-${row.id}`)).getByRole('status')
      ).toHaveTextContent('Đã chấp thuận')
    );
    expect(screen.getAllByTestId(`skill-pending-card-${row.id}`)).toHaveLength(1);
    spy.mockRestore();
    consoleError.mockRestore();
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
