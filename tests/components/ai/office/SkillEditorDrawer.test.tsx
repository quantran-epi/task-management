import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { TaskPlannerDatabase } from '../../../../src/db';
import { createSkill, updateSkill } from '../../../../src/db/repositories/aiOfficeRepo';
import {
  createSkillVersion,
  decideSkillVersion,
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
      screen.queryByText('Lưu sẽ tạo một phiên bản mới trong lịch sử.')
    ).not.toBeInTheDocument();
  });

  it('edit mode shows an empty-history line for a skill with no versions (D-10)', async () => {
    renderDrawer(skill);
    expect(await screen.findByTestId('skill-version-history')).toBeInTheDocument();
    expect(
      screen.getByText('Chưa có phiên bản nào — lần lưu đầu tiên sẽ tạo phiên bản 1.')
    ).toBeInTheDocument();
    expect(screen.queryByTestId('skill-pending-section')).not.toBeInTheDocument();
    expect(screen.getByText('Lưu sẽ tạo một phiên bản mới trong lịch sử.')).toBeInTheDocument();
  });

  it('saving an edit produces an approved version row and a history entry (D-09)', async () => {
    renderDrawer(skill);
    fireEvent.change(await screen.findByLabelText('Tên'), { target: { value: 'Viết đặc tả v2' } });
    fireEvent.click(screen.getByTestId('skill-editor-save'));

    await waitFor(() =>
      expect(screen.getByTestId('skill-version-history')).toHaveTextContent('Lịch sử phiên bản (1)')
    );
    expect(await db.aiSkillVersions.where('skillId').equals(skill.id).count()).toBe(1);
    const history = screen.getByTestId('skill-version-history');
    expect(history).toHaveTextContent('v1');
    expect(history).toHaveTextContent('Đã duyệt');
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
    expect(stored?.version).toBe(1);
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
    await waitFor(() => expect(history).toHaveTextContent('Lịch sử phiên bản (2)'));
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
    expect(screen.getByTestId('skill-version-history')).toHaveTextContent(
      'Chưa có phiên bản nào — lần lưu đầu tiên sẽ tạo phiên bản 1.'
    );
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

  it('the pending card subtitle names the skill without inventing a proposer', async () => {
    const row = await seedPending();
    renderDrawer(skill);

    const card = await screen.findByTestId(`skill-pending-card-${row.id}`);
    expect(within(card).getByText(`Kỹ năng · ${skill.name}`)).toBeInTheDocument();
    expect(card).not.toHaveTextContent('đề xuất bởi');
  });
});
