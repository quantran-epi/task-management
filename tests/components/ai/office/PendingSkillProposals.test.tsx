import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { TaskPlannerDatabase } from '../../../../src/db';
import { createEmployee, createSkill } from '../../../../src/db/repositories/aiOfficeRepo';
import { createTeam, listTeamMembers } from '../../../../src/db/repositories/aiTeamRepo';
import {
  createSkillVersion,
  decideSkillVersion,
} from '../../../../src/db/repositories/aiSkillVersionRepo';
import { PendingSkillProposals, skillSubtitle } from '../../../../src/components/ai/office/PendingSkillProposals';
import type { AiEmployee, AiSkill, AiTeam, AiTeamMember } from '../../../../src/types/aiOffice';

const BODY = '# Quy trình\nBước 1: đọc yêu cầu.\nBước 2: viết đặc tả.';

describe('PendingSkillProposals (AIO-SKILL-03/04)', () => {
  let db: TaskPlannerDatabase;
  let team: AiTeam;
  let members: AiTeamMember[];
  let skill: AiSkill;
  let skills: AiSkill[];
  let employee: AiEmployee;

  beforeEach(async () => {
    db = new TaskPlannerDatabase('TestPendingSkillProposals_' + Math.random().toString(36).slice(2));
    await db.open();
    skill = await createSkill({ name: 'Viết đặc tả', description: 'Quy trình viết đặc tả.', body: BODY }, db);
    skills = [skill];
    employee = await createEmployee(
      {
        name: 'Lan',
        role: 'Phân tích',
        capability: 'Viết đặc tả.',
        persona: 'Bạn là Lan.',
        model: 'claude-sonnet-4',
        skillId: skill.id,
      },
      db
    );
    team = await createTeam(
      { name: 'Nhóm thử', status: 'active', budgetTokens: 1000, employeeIds: [employee.id] },
      db
    );
    members = await listTeamMembers(team.id, db);
  });

  afterEach(async () => {
    cleanup();
    await db.delete();
  });

  const renderPanel = (overrides: { skills?: AiSkill[]; employees?: AiEmployee[] } = {}) =>
    render(
      <PendingSkillProposals
        members={members}
        employees={overrides.employees ?? [employee]}
        skills={overrides.skills ?? skills}
        db={db}
      />
    );

  const seedPending = (overrides: { body?: string; name?: string; skillId?: string } = {}) =>
    createSkillVersion(
      {
        skillId: overrides.skillId ?? skill.id,
        name: overrides.name ?? 'Viết đặc tả',
        description: 'Quy trình viết đặc tả.',
        body: overrides.body ?? `${BODY}\nBước 3: kiểm thử.`,
      },
      db
    );

  it('renders a card per pending proposal for this team and nothing when empty', async () => {
    const empty = renderPanel();
    await waitFor(() => expect(db.aiSkillVersions.count()).resolves.toBe(0));
    expect(screen.queryByTestId('skill-pending-proposals')).not.toBeInTheDocument();
    empty.unmount();

    const row = await seedPending();
    renderPanel();
    expect(await screen.findByTestId(`skill-pending-card-${row.id}`)).toBeInTheDocument();
    expect(screen.getAllByTestId('patch-diff-approval')).toHaveLength(1);
  });

  it('approving writes the DB and keeps the card with its decision line', async () => {
    const row = await seedPending();
    renderPanel();
    const card = await screen.findByTestId(`skill-pending-card-${row.id}`);

    fireEvent.click(within(card).getByRole('button', { name: 'Chấp thuận' }));

    await waitFor(() =>
      expect(within(screen.getByTestId(`skill-pending-card-${row.id}`)).getByRole('status')).toHaveTextContent(
        'Đã chấp thuận — kỹ năng đã cập nhật sang bản mới.'
      )
    );
    expect(screen.getByTestId(`skill-pending-card-${row.id}`)).toBeInTheDocument();
    expect((await db.aiSkills.get(skill.id))?.body).toBe(`${BODY}\nBước 3: kiểm thử.`);
    const stored = await db.aiSkillVersions.get(row.id);
    expect(stored?.status).toBe('approved');
    // CR-03: approval snapshots the pre-approval content as v1, so the proposal is v2.
    expect(stored?.version).toBe(2);
  });

  it('rejecting leaves aiSkills untouched', async () => {
    const row = await seedPending();
    renderPanel();
    const card = await screen.findByTestId(`skill-pending-card-${row.id}`);

    fireEvent.click(within(card).getByRole('button', { name: 'Từ chối' }));

    await waitFor(() =>
      expect(within(screen.getByTestId(`skill-pending-card-${row.id}`)).getByRole('status')).toHaveTextContent(
        'Đã từ chối đề xuất — kỹ năng không thay đổi.'
      )
    );
    const stored = await db.aiSkillVersions.get(row.id);
    expect(stored?.status).toBe('rejected');
    expect(stored?.version).toBeUndefined();
    expect((await db.aiSkills.get(skill.id))?.body).toBe(BODY);
    expect(await db.aiSkillVersions.where('status').equals('approved').count()).toBe(0);
  });

  it("a proposal for another team's skill is not rendered", async () => {
    const foreign = await createSkill({ name: 'Kỹ năng khác', description: 'Khác.', body: '# Khác' }, db);
    await seedPending({ skillId: foreign.id, name: 'Kỹ năng khác', body: '# Khác\nThêm.' });
    renderPanel({ skills: [...skills, foreign] });

    await waitFor(() => expect(db.aiSkillVersions.count()).resolves.toBe(1));
    expect(screen.queryByTestId('skill-pending-proposals')).not.toBeInTheDocument();
  });

  it('subtitle names the proposing agent, and the unassigned skill leaves the roster', async () => {
    const row = await seedPending();
    const { rerender } = renderPanel();
    expect(await screen.findByText('Kỹ năng · Viết đặc tả · đề xuất bởi Lan')).toBeInTheDocument();

    const unassigned: AiEmployee = { ...employee };
    delete unassigned.skillId;

    rerender(
      <PendingSkillProposals members={members} employees={[unassigned]} skills={skills} db={db} />
    );
    // T-39-21: the roster set is derived from the same employees array, so an unassigned
    // skill is not addressable by this team and its proposal leaves the transcript.
    await waitFor(() =>
      expect(screen.queryByTestId(`skill-pending-card-${row.id}`)).not.toBeInTheDocument()
    );
    expect(screen.queryByTestId('skill-pending-proposals')).not.toBeInTheDocument();
  });

  it('skillSubtitle omits the proposer segment instead of rendering undefined', () => {
    expect(skillSubtitle(skill.id, 'Viết đặc tả', [employee])).toBe('Kỹ năng · Viết đặc tả · đề xuất bởi Lan');
    const unassigned: AiEmployee = { ...employee };
    delete unassigned.skillId;
    expect(skillSubtitle(skill.id, 'Viết đặc tả', [unassigned])).toBe('Kỹ năng · Viết đặc tả');
  });

  it('caps at three cards and shows the overflow line', async () => {
    for (const suffix of ['a', 'b', 'c', 'd']) {
      await seedPending({ body: `${BODY}\nBước 3: kiểm thử ${suffix}.` });
    }
    renderPanel();

    await waitFor(() => expect(screen.getAllByTestId('patch-diff-approval')).toHaveLength(3));
    expect(screen.getByTestId('skill-pending-overflow')).toHaveTextContent(
      'Còn 1 đề xuất chờ duyệt — xem trong AI Staff › Kỹ năng.'
    );
  });

  it('a proposal based on an older version disables approve', async () => {
    // Created first, so its baseVersion is the implicit baseline (0).
    const stale = await seedPending({ body: `${BODY}\nBước 3: bản cũ.` });
    const newer = await seedPending({ body: `${BODY}\nBước 3: bản mới.` });
    await decideSkillVersion(newer.id, 'approved', db);

    renderPanel();

    const card = await screen.findByTestId(`skill-pending-card-${stale.id}`);
    expect(within(card).getByRole('button', { name: 'Chấp thuận' })).toBeDisabled();
    expect(within(card).getByRole('button', { name: 'Từ chối' })).not.toBeDisabled();
    expect(within(card).getByRole('alert')).toHaveTextContent('Kỹ năng đã có bản mới được duyệt');
  });
});
