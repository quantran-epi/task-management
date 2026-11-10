import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TaskPlannerDatabase } from '../../src/db';
import { createEmployee, createLead, createSkill, updateLead } from '../../src/db/repositories/aiOfficeRepo';
import { createTeam, getTeam, listTeamMembers, listTeams } from '../../src/db/repositories/aiTeamRepo';
import { TeamsView } from '../../src/views/TeamsView';
import { useLayoutStore } from '../../src/workbench/store/layoutStore';
import type { AiEmployee, AiLead, AiTeam } from '../../src/types/aiOffice';

/**
 * Phase 34 plan 10 — the team page (AIO-UI-01, AIO-TEAM-01, AIO-TEAM-04, AIO-BG-01,
 * AIO-BUDGET-01, AIO-LINK-01, AIO-EMP-02).
 *
 * Rendered directly rather than through `EditorArea` so the suite does not depend on
 * the routing switch; the routing itself is asserted from the source in Task 3.
 */
describe('TeamsView — team page (AIO-TEAM-01, D-15/D-16/D-19/D-26)', () => {
  let db: TaskPlannerDatabase;
  let lead: AiLead;
  let employees: AiEmployee[];
  let activeTeam: AiTeam;
  let idleTeam: AiTeam;

  beforeEach(async () => {
    db = new TaskPlannerDatabase('test-teams-view-' + Math.random().toString(36).slice(2));
    await db.open();
    useLayoutStore.getState().resetLayout();

    lead = await createLead(
      {
        name: 'Bình Trần',
        role: 'Lead điều phối',
        capability: 'Chia việc và tổng hợp kết quả.',
        persona: 'Bạn là lead điều phối.',
        model: 'claude-opus-4',
      },
      db
    );
    employees = [
      await createEmployee(
        {
          name: 'An Nguyễn',
          role: 'Chuyên viên phân tích',
          capability: 'Phân tích nghiệp vụ.',
          persona: 'Bạn là An.',
          model: 'claude-sonnet-4',
        },
        db
      ),
      await createEmployee(
        {
          name: 'Chi Lê',
          role: 'Kỹ sư kiểm thử',
          capability: 'Viết kiểm thử.',
          persona: 'Bạn là Chi.',
          model: 'claude-sonnet-4',
        },
        db
      ),
      await createEmployee(
        {
          name: 'Dung Phạm',
          role: 'Chuyên viên tài liệu',
          capability: 'Viết tài liệu.',
          persona: 'Bạn là Dung.',
          model: 'claude-sonnet-4',
        },
        db
      ),
    ];
    await createSkill(
      { name: 'Viết đặc tả', description: 'Quy trình viết đặc tả.', body: '# Quy trình' },
      db
    );

    activeTeam = await createTeam(
      {
        name: 'Nhóm Thanh Toán',
        leadId: lead.id,
        status: 'active',
        budgetTokens: 4000,
        employeeIds: [employees[0]!.id, employees[1]!.id],
      },
      db
    );
    idleTeam = await createTeam(
      {
        name: 'Nhóm Báo Cáo',
        leadId: lead.id,
        status: 'idle',
        budgetTokens: 2000,
        employeeIds: [employees[2]!.id],
      },
      db
    );
  });

  afterEach(async () => {
    await db.delete();
    vi.restoreAllMocks();
  });

  function renderView() {
    return render(<TeamsView db={db} />);
  }

  it('renders the view wrapper and one card per seeded team', async () => {
    renderView();

    expect(await screen.findByTestId('teams-view')).toBeInTheDocument();
    expect(await screen.findByTestId(`team-card-${activeTeam.id}`)).toBeInTheDocument();
    expect(screen.getByTestId(`team-card-${idleTeam.id}`)).toBeInTheDocument();
  });

  it('shows the active counter tag without a denominator', async () => {
    renderView();

    expect(await screen.findByText('Đang hoạt động 1')).toBeInTheDocument();
    expect(screen.queryByText(/Đang hoạt động 1\/3/)).not.toBeInTheDocument();
  });

  it('shows the lead name, roster avatars and the budget caption on a card', async () => {
    renderView();

    const card = await screen.findByTestId(`team-card-${activeTeam.id}`);
    expect(card).toHaveTextContent('Nhóm Thanh Toán');
    expect(card).toHaveTextContent('Bình Trần');
    expect(card).toHaveTextContent('0/4000 token');
    expect(card.querySelectorAll('.ant-avatar').length).toBeGreaterThanOrEqual(3);
  });

  it('activates an idle team and pauses an active one', async () => {
    renderView();

    fireEvent.click(await screen.findByTestId(`team-activate-${idleTeam.id}`));
    await waitFor(async () => {
      const teams = await listTeams(db);
      expect(teams.find((team) => team.id === idleTeam.id)?.status).toBe('active');
    });

    fireEvent.click(await screen.findByTestId(`team-pause-${idleTeam.id}`));
    await waitFor(async () => {
      const teams = await listTeams(db);
      expect(teams.find((team) => team.id === idleTeam.id)?.status).toBe('idle');
    });
  });

  it('keeps activation enabled with four active teams and shows no cap copy', async () => {
    await createTeam(
      { name: 'Nhóm Ba', leadId: lead.id, status: 'active', budgetTokens: 1000 },
      db
    );
    await createTeam(
      { name: 'Nhóm Bốn', leadId: lead.id, status: 'active', budgetTokens: 1000 },
      db
    );

    renderView();

    const activate = await screen.findByTestId(`team-activate-${idleTeam.id}`);
    expect(activate).toBeEnabled();
    expect(screen.queryByText(/Đã có 3 nhóm đang hoạt động/)).not.toBeInTheDocument();
    expect(screen.queryByText(/tối đa ba nhân viên/)).not.toBeInTheDocument();
  });

  it('allows pausing the last active team — no minimum-active rule exists', async () => {
    renderView();

    // WR-10: pausing the last active team is a legal transition.
    expect(await screen.findByTestId(`team-pause-${activeTeam.id}`)).toBeEnabled();
  });

  it('creates a group from a name alone — no lead, no members, zero budget', async () => {
    renderView();

    fireEvent.click((await screen.findAllByRole('button', { name: /Tạo nhóm/ }))[0]!);
    expect(await screen.findByTestId('team-editor-drawer')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Tên nhóm'), { target: { value: 'Nhóm Rỗng' } });

    await waitFor(() => {
      expect(screen.getByTestId('team-editor-save')).toBeEnabled();
    });
    fireEvent.click(screen.getByTestId('team-editor-save'));

    await waitFor(async () => {
      const teams = await listTeams(db);
      expect(teams.some((team) => team.name === 'Nhóm Rỗng')).toBe(true);
    });

    const created = (await listTeams(db)).find((team) => team.name === 'Nhóm Rỗng')!;
    expect(created.leadId).toBeUndefined();
    expect(created.budgetTokens).toBe(0);
    expect(await listTeamMembers(created.id, db)).toHaveLength(0);
  });

  it('stores four selected employees without a cap complaint', async () => {
    const fourth = await createEmployee(
      {
        name: 'Em Võ',
        role: 'Chuyên viên hỗ trợ',
        capability: 'Hỗ trợ chung.',
        persona: 'Bạn là Em.',
        model: 'claude-sonnet-4',
      },
      db
    );

    renderView();

    fireEvent.click((await screen.findAllByRole('button', { name: /Tạo nhóm/ }))[0]!);
    expect(await screen.findByTestId('team-editor-drawer')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Tên nhóm'), { target: { value: 'Nhóm Mới' } });

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Lead' }));
    fireEvent.click(await screen.findByTitle('Bình Trần · Lead điều phối'));

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Nhân viên' }));
    fireEvent.click(await screen.findByTitle('An Nguyễn · Chuyên viên phân tích'));
    fireEvent.click(await screen.findByTitle('Chi Lê · Kỹ sư kiểm thử'));
    fireEvent.click(await screen.findByTitle('Dung Phạm · Chuyên viên tài liệu'));
    fireEvent.click(await screen.findByTitle('Em Võ · Chuyên viên hỗ trợ'));

    fireEvent.change(screen.getByLabelText('Tổng ngân sách nhóm'), { target: { value: '3000' } });

    await waitFor(() => {
      expect(screen.getByTestId('team-editor-save')).toBeEnabled();
    });
    fireEvent.click(screen.getByTestId('team-editor-save'));

    await waitFor(async () => {
      const teams = await listTeams(db);
      expect(teams.some((team) => team.name === 'Nhóm Mới')).toBe(true);
    });

    const created = (await listTeams(db)).find((team) => team.name === 'Nhóm Mới')!;
    const members = await listTeamMembers(created.id, db);
    expect(members).toHaveLength(5);
    expect(members.filter((row) => row.role === 'employee').map((row) => row.agentId)).toContain(
      fourth.id
    );
    expect(members.reduce((sum, row) => sum + row.budgetTokens, 0)).toBe(3000);
    const leadRow = members.find((row) => row.role === 'lead')!;
    expect(leadRow.budgetTokens).toBe(600);
  });

  it('renders the linked-items empty state and rows', async () => {
    const { LinkedItemsList } = await import('../../src/components/ai/office/LinkedItemsList');

    const { unmount } = render(<LinkedItemsList items={[]} />);
    expect(screen.getByText('Chưa liên kết mục nào.')).toBeInTheDocument();
    unmount();

    render(
      <LinkedItemsList
        items={[{ id: 'link-1', itemType: 'task', name: 'Việc A' }]}
        onRemove={vi.fn()}
      />
    );
    expect(screen.getByTestId('linked-item-link-1')).toHaveTextContent('Việc A');
  });

  it('adds an item from the picker and keeps the modal open', async () => {
    const { LinkedItemPicker } = await import('../../src/components/ai/office/LinkedItemPicker');
    await db.changeRequests.add({
      id: 'cr-1',
      code: 'CR-101',
      name: 'Nghiệp vụ thanh toán',
      status: 'In Progress',
      type: 'ENHANCEMENT',
      targets: [],
      createdAt: '2026-10-01',
      updatedAt: '2026-10-01',
    } as any);

    const onAdd = vi.fn();
    render(<LinkedItemPicker open db={db} onCancel={vi.fn()} onAdd={onAdd} />);

    fireEvent.click(await screen.findByTestId('linked-picker-add-cr-1'));
    expect(onAdd).toHaveBeenCalledWith({
      id: 'cr-1',
      itemType: 'cr',
      name: 'CR-101 · Nghiệp vụ thanh toán',
    });
    expect(screen.getByTestId('linked-item-picker')).toBeInTheDocument();
  });

  it('renders the workspace with the sidebar and the transcript region', async () => {
    renderView();

    fireEvent.click(await screen.findByTestId(`team-open-${activeTeam.id}`));

    expect(await screen.findByTestId('team-sidebar')).toBeInTheDocument();
    expect(await screen.findByTestId('team-transcript-region')).toBeInTheDocument();
    expect(screen.getByTestId('team-workspace')).toBeInTheDocument();
  });

  it('creates exactly one team thread on open and reuses it after a pause', async () => {
    renderView();

    fireEvent.click(await screen.findByTestId(`team-open-${activeTeam.id}`));
    await screen.findByTestId('team-transcript-region');

    const first = await waitFor(async () => {
      const rows = await db.chatThreads.where('scopeType').equals('team').toArray();
      expect(rows).toHaveLength(1);
      return rows;
    });
    expect(first[0]!.entityId).toBe(activeTeam.id);

    fireEvent.click(screen.getByTestId('team-workspace-back'));
    fireEvent.click(await screen.findByTestId(`team-open-${activeTeam.id}`));
    await screen.findByTestId('team-transcript-region');

    const second = await db.chatThreads.where('scopeType').equals('team').toArray();
    expect(second).toHaveLength(1);
    expect(second[0]!.id).toBe(first[0]!.id);
  });

  it('makes the transcript region a single focus stop', async () => {
    renderView();

    fireEvent.click(await screen.findByTestId(`team-open-${activeTeam.id}`));
    const region = await screen.findByTestId('team-transcript-region');
    expect(region).toHaveAttribute('tabindex', '0');
    expect(region).toHaveAttribute('role', 'region');
  });

  it('renders the sidebar budget, links and mode sections', async () => {
    renderView();

    fireEvent.click(await screen.findByTestId(`team-open-${activeTeam.id}`));
    await screen.findByTestId('team-sidebar');

    expect(screen.getByTestId('team-budget-panel')).toBeInTheDocument();
    expect(screen.getByTestId('team-linked-items')).toBeInTheDocument();
    expect(screen.getByTestId('team-mode-toggles')).toBeInTheDocument();
  });

  it('keeps the settings split table rows summing to the team total', async () => {
    const { TeamSettingsDrawer, evenSplitRows } = await import(
      '../../src/components/ai/office/TeamSettingsDrawer'
    );
    const members = await listTeamMembers(activeTeam.id, db);
    const rows = evenSplitRows(
      5000,
      members.map((member) => ({
        memberId: member.id,
        agentId: member.agentId,
        name: member.agentId,
        role: member.role,
        usedTokens: member.usedTokens,
      }))
    );
    expect(rows.reduce((sum, row) => sum + row.budgetTokens, 0)).toBe(5000);
    expect(rows.find((row) => row.role === 'lead')!.budgetTokens).toBe(1668);

    render(
      <TeamSettingsDrawer
        open
        team={activeTeam}
        members={members}
        lead={lead}
        employees={employees}
        leads={[lead]}
        links={[]}
        onCancel={vi.fn()}
        onAssignLeader={vi.fn()}
        onAddMember={vi.fn()}
        onRemoveMember={vi.fn()}
        onSave={vi.fn()}
      />
    );
    expect(await screen.findByTestId('team-settings-drawer')).toBeInTheDocument();
    expect(screen.getByText('Lưu cài đặt')).toBeInTheDocument();
  });

  it('uses the lead model for a bare message and the employee model for a mention', async () => {
    await db.settings.put({ key: 'ninerouter_api_key', value: 'sk-test' });
    await db.settings.put({ key: 'ninerouter_endpoint', value: 'https://example.invalid/v1' });

    const seenModels: string[] = [];
    const createRuntimeDeps = () => ({
      runLoop: (async (loopOptions: any) => {
        seenModels.push(loopOptions.model);
        return {
          fullResponse: 'Xong.',
          cleanResponse: 'Xong.',
          messages: [],
          tokenUsage: {},
          generatedFiles: [],
          truncated: false,
          loopLimitReached: false,
        };
      }) as any,
    });

    render(<TeamsView db={db} createRuntimeDeps={createRuntimeDeps} />);

    fireEvent.click(await screen.findByTestId(`team-open-${activeTeam.id}`));
    const composer = await screen.findByLabelText('Nội dung tin nhắn trò chuyện AI');

    fireEvent.change(composer, { target: { value: 'Yêu cầu chung' } });
    fireEvent.click(screen.getByLabelText('Gửi tin nhắn'));
    await waitFor(() => expect(seenModels).toContain('claude-opus-4'));
    // The composer swaps Gửi for Dừng while a turn runs; wait for it to settle.
    await screen.findByLabelText('Gửi tin nhắn');

    fireEvent.change(composer, {
      target: { value: `@[An Nguyễn](agent:${employees[0]!.id}) làm giúp` },
    });
    fireEvent.click(screen.getByLabelText('Gửi tin nhắn'));
    await waitFor(() => expect(seenModels).toContain('claude-sonnet-4'));
  });

  it('uses a lead persona/model edited between two sends on the second turn (D-03)', async () => {
    await db.settings.put({ key: 'ninerouter_api_key', value: 'sk-test' });
    await db.settings.put({ key: 'ninerouter_endpoint', value: 'https://example.invalid/v1' });

    const seen: Array<{ model: string; system: string }> = [];
    const createRuntimeDeps = () => ({
      runLoop: (async (loopOptions: any) => {
        seen.push({
          model: loopOptions.model,
          system: (loopOptions.messages ?? [])
            .filter((message: any) => message.role === 'system')
            .map((message: any) => String(message.content))
            .join('\n'),
        });
        return {
          fullResponse: 'Xong.',
          cleanResponse: 'Xong.',
          messages: [],
          tokenUsage: {},
          generatedFiles: [],
          truncated: false,
          loopLimitReached: false,
        };
      }) as any,
    });

    render(<TeamsView db={db} createRuntimeDeps={createRuntimeDeps} />);

    fireEvent.click(await screen.findByTestId(`team-open-${activeTeam.id}`));
    const composer = await screen.findByLabelText('Nội dung tin nhắn trò chuyện AI');

    fireEvent.change(composer, { target: { value: 'Lượt một' } });
    fireEvent.click(screen.getByLabelText('Gửi tin nhắn'));
    await waitFor(() => expect(seen).toHaveLength(1));
    await screen.findByLabelText('Gửi tin nhắn');

    // Production edit path: the persisted lead row changes, no remount.
    await updateLead(
      lead.id,
      { persona: 'Bạn là lead phiên bản hai.', model: 'claude-opus-5' },
      db
    );

    fireEvent.change(composer, { target: { value: 'Lượt hai' } });
    fireEvent.click(screen.getByLabelText('Gửi tin nhắn'));
    await waitFor(() => expect(seen).toHaveLength(2));

    expect(seen[0]!.model).toBe('claude-opus-4');
    expect(seen[0]!.system).toContain('Bạn là lead điều phối.');
    expect(seen[1]!.model).toBe('claude-opus-5');
    expect(seen[1]!.system).toContain('Bạn là lead phiên bản hai.');
  });

  it('lists roster members with role and removes an employee without touching the lead row', async () => {
    renderView();

    fireEvent.click(await screen.findByTestId(`team-open-${activeTeam.id}`));
    fireEvent.click(await screen.findByTestId('team-header-settings'));

    const members = await listTeamMembers(activeTeam.id, db);
    const employeeRow = members.find((row) => row.role === 'employee')!;
    const leadRow = members.find((row) => row.role === 'lead')!;

    expect(await screen.findByTestId(`team-member-row-${employeeRow.id}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`team-member-remove-${leadRow.id}`)).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId(`team-member-remove-${employeeRow.id}`));
    fireEvent.click(await screen.findByText('Gỡ'));

    await waitFor(async () => {
      const after = await listTeamMembers(activeTeam.id, db);
      expect(after.some((row) => row.id === employeeRow.id)).toBe(false);
      expect(after.some((row) => row.role === 'lead')).toBe(true);
    });
  });

  it('adds an agent from the settings drawer, excluding agents already on the roster', async () => {
    renderView();

    fireEvent.click(await screen.findByTestId(`team-open-${activeTeam.id}`));
    fireEvent.click(await screen.findByTestId('team-header-settings'));
    await screen.findByTestId('team-roster-block');

    // Dung Phạm belongs to the other team, so she is the only addable agent.
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Thêm nhân viên' }));
    expect(screen.queryByTitle('An Nguyễn · Chuyên viên phân tích')).not.toBeInTheDocument();
    fireEvent.click(await screen.findByTitle('Dung Phạm · Chuyên viên tài liệu'));

    await waitFor(async () => {
      const after = await listTeamMembers(activeTeam.id, db);
      expect(after.some((row) => row.agentId === employees[2]!.id)).toBe(true);
      expect(after.find((row) => row.agentId === employees[2]!.id)?.budgetTokens).toBe(0);
    });
  });

  it('offers every persisted lead and locks the leader control once leaderLockedAt is set', async () => {
    const secondLead = await createLead(
      {
        name: 'Cường Vũ',
        role: 'Lead dự phòng',
        capability: 'Điều phối dự phòng.',
        persona: 'Bạn là lead dự phòng.',
        model: 'claude-opus-4',
      },
      db
    );

    renderView();
    fireEvent.click(await screen.findByTestId(`team-open-${activeTeam.id}`));
    fireEvent.click(await screen.findByTestId('team-header-settings'));

    const leaderSelect = await screen.findByRole('combobox', { name: 'Leader' });
    expect(leaderSelect).toBeEnabled();
    fireEvent.mouseDown(leaderSelect);
    fireEvent.click(await screen.findByTitle('Cường Vũ · Lead dự phòng'));

    await waitFor(async () => {
      const row = await getTeam(activeTeam.id, db);
      expect(row?.leadId).toBe(secondLead.id);
    });

    await db.aiTeams.update(activeTeam.id, { leaderLockedAt: new Date().toISOString() });
    await waitFor(async () => {
      expect(screen.getByRole('combobox', { name: 'Leader' })).toBeDisabled();
    });
    expect(
      screen.getByText(/Leader đã khóa từ lượt chạy đầu tiên và cố định suốt đời nhóm/)
    ).toBeInTheDocument();
  });

  it('renders an empty group workspace without crashing', async () => {
    const empty = await createTeam({ name: 'Nhóm Rỗng' }, db);

    renderView();
    fireEvent.click(await screen.findByTestId(`team-open-${empty.id}`));

    expect(await screen.findByTestId('team-workspace')).toBeInTheDocument();
    expect(screen.getByTestId('team-header-no-lead')).toHaveTextContent('Chưa chọn lead');
  });

  it('locks the leader on the first send only', async () => {
    await db.settings.put({ key: 'ninerouter_api_key', value: 'sk-test' });
    await db.settings.put({ key: 'ninerouter_endpoint', value: 'https://example.invalid/v1' });

    const createRuntimeDeps = () => ({
      runLoop: (async () => ({
        fullResponse: 'Xong.',
        cleanResponse: 'Xong.',
        messages: [],
        tokenUsage: {},
        generatedFiles: [],
        truncated: false,
        loopLimitReached: false,
      })) as any,
    });

    render(<TeamsView db={db} createRuntimeDeps={createRuntimeDeps} />);

    fireEvent.click(await screen.findByTestId(`team-open-${activeTeam.id}`));
    const composer = await screen.findByLabelText('Nội dung tin nhắn trò chuyện AI');

    fireEvent.change(composer, { target: { value: 'Lượt một' } });
    fireEvent.click(screen.getByLabelText('Gửi tin nhắn'));
    await screen.findByLabelText('Gửi tin nhắn');

    const first = await waitFor(async () => {
      const row = await getTeam(activeTeam.id, db);
      expect(row?.leaderLockedAt).toBeTruthy();
      return row!.leaderLockedAt;
    });

    fireEvent.change(composer, { target: { value: 'Lượt hai' } });
    fireEvent.click(screen.getByLabelText('Gửi tin nhắn'));
    await screen.findByLabelText('Gửi tin nhắn');

    const second = await getTeam(activeTeam.id, db);
    expect(second?.leaderLockedAt).toBe(first);
  });

  it('runs the assigned lead after mount and locks it (assign-then-first-send)', async () => {
    await db.settings.put({ key: 'ninerouter_api_key', value: 'sk-test' });
    await db.settings.put({ key: 'ninerouter_endpoint', value: 'https://example.invalid/v1' });

    const assignedLead = await createLead(
      {
        name: 'Cường Vũ',
        role: 'Lead dự phòng',
        capability: 'Điều phối dự phòng.',
        persona: 'Bạn là lead dự phòng.',
        model: 'claude-opus-5',
      },
      db
    );
    const empty = await createTeam({ name: 'Nhóm Rỗng' }, db);

    const seen: Array<{ agentId: string; model: string; system: string }> = [];
    const createRuntimeDeps = (agentId: string) => ({
      runLoop: (async (loopOptions: any) => {
        seen.push({
          agentId,
          model: loopOptions.model,
          system: (loopOptions.messages ?? [])
            .filter((message: any) => message.role === 'system')
            .map((message: any) => String(message.content))
            .join('\n'),
        });
        return {
          fullResponse: 'Xong.',
          cleanResponse: 'Xong.',
          messages: [],
          tokenUsage: {},
          generatedFiles: [],
          truncated: false,
          loopLimitReached: false,
        };
      }) as any,
    });

    render(<TeamsView db={db} createRuntimeDeps={createRuntimeDeps} />);

    fireEvent.click(await screen.findByTestId(`team-open-${empty.id}`));
    fireEvent.click(await screen.findByTestId('team-header-settings'));

    fireEvent.mouseDown(await screen.findByRole('combobox', { name: 'Leader' }));
    fireEvent.click(await screen.findByTitle('Cường Vũ · Lead dự phòng'));
    await waitFor(async () => {
      expect((await getTeam(empty.id, db))?.leadId).toBe(assignedLead.id);
    });
    fireEvent.click(screen.getByText('Hủy'));

    const composer = await screen.findByLabelText('Nội dung tin nhắn trò chuyện AI');
    fireEvent.change(composer, { target: { value: 'Bắt đầu' } });
    fireEvent.click(screen.getByLabelText('Gửi tin nhắn'));

    await waitFor(() => expect(seen).toHaveLength(1));
    expect(seen[0]!.agentId).toBe(assignedLead.id);
    expect(seen[0]!.model).toBe('claude-opus-5');
    expect(seen[0]!.system).toContain('Bạn là lead dự phòng.');
    await waitFor(async () => {
      expect((await getTeam(empty.id, db))?.leaderLockedAt).toBeTruthy();
    });
  });

  it('renders the team composer placeholder', async () => {
    renderView();

    fireEvent.click(await screen.findByTestId(`team-open-${activeTeam.id}`));
    expect(
      await screen.findByPlaceholderText('Nhắn cho lead hoặc @ một nhân viên...')
    ).toBeInTheDocument();
  });

  it('routes a bare message to the lead and a mention to that employee', async () => {
    await db.settings.put({ key: 'ninerouter_api_key', value: 'sk-test' });
    await db.settings.put({ key: 'ninerouter_endpoint', value: 'https://example.invalid/v1' });

    const routedTo: string[] = [];
    const createRuntimeDeps = (agentId: string) => ({
      runLoop: (async () => {
        routedTo.push(agentId);
        return {
          fullResponse: 'Xong.',
          cleanResponse: 'Xong.',
          messages: [],
          tokenUsage: {},
          generatedFiles: [],
          truncated: false,
          loopLimitReached: false,
        };
      }) as any,
    });

    render(<TeamsView db={db} createRuntimeDeps={createRuntimeDeps} />);

    fireEvent.click(await screen.findByTestId(`team-open-${activeTeam.id}`));
    const composer = await screen.findByLabelText('Nội dung tin nhắn trò chuyện AI');

    fireEvent.change(composer, { target: { value: 'Yêu cầu chung' } });
    fireEvent.click(screen.getByLabelText('Gửi tin nhắn'));
    await waitFor(() => expect(routedTo).toContain(lead.id));
    await screen.findByLabelText('Gửi tin nhắn');

    fireEvent.change(composer, {
      target: { value: `@[An Nguyễn](agent:${employees[0]!.id}) làm giúp` },
    });
    fireEvent.click(screen.getByLabelText('Gửi tin nhắn'));
    await waitFor(() => expect(routedTo).toContain(employees[0]!.id));
  });

  it('offers the team lead as the first @ option in the composer', async () => {
    renderView();

    fireEvent.click(await screen.findByTestId(`team-open-${activeTeam.id}`));
    const composer = (await screen.findByLabelText(
      'Nội dung tin nhắn trò chuyện AI'
    )) as HTMLTextAreaElement;
    composer.focus();
    fireEvent.change(composer, { target: { value: '@', selectionStart: 1, selectionEnd: 1 } });
    fireEvent.keyUp(composer, { key: '@', keyCode: 50 });

    await waitFor(() => {
      expect(document.querySelector('.ant-mentions-dropdown')).toBeInTheDocument();
    });
    const items = Array.from(
      document.querySelectorAll<HTMLElement>('.ant-mentions-dropdown li[role="menuitem"]')
    );
    expect(items[0]!.textContent).toContain('Bình Trần');
  });

  it('opens a team workspace tab from the AI Office explorer', async () => {
    // Phase 35 moved the AI Office launch point from TitleBar to the left tool-window
    // stripe (Alt+7). The explorer is the surface that actually opens a team.
    const { AiOfficeExplorer } = await import('../../src/workbench/toolwindows/AiOfficeExplorer');

    render(<AiOfficeExplorer db={db} />);

    fireEvent.click(await screen.findByTestId(`ai-office-team-${activeTeam.id}`));

    const tab = useLayoutStore.getState().openTabs.find((t) => t.viewType === 'team_workspace');
    expect(tab).toBeDefined();
    expect(tab?.params).toMatchObject({ teamId: activeTeam.id });
  });

  it('routes both the agents and teams views in renderViewContent', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const source = readFileSync(
      resolve(process.cwd(), 'src', 'workbench', 'EditorArea.tsx'),
      'utf8'
    );
    expect(source).toContain('<AiOfficeView {...dbProp} />');
    expect(source).toContain('<TeamsView {...dbProp} />');
  });

  it('renders the lead approval card and routes the decision to the coordinator', async () => {
    await db.settings.put({ key: 'ninerouter_api_key', value: 'sk-test' });
    await db.settings.put({ key: 'ninerouter_endpoint', value: 'https://example.invalid/v1' });

    let approvalSeen = false;
    const createRuntimeDeps = () => ({
      runLoop: (async (loopOptions: any) => {
        const check = await loopOptions.onMutationCheck?.('update_task', { id: 't1' });
        approvalSeen = true;
        return {
          fullResponse: check?.proceed ? 'Đã cập nhật.' : 'Đã hủy.',
          cleanResponse: '',
          messages: [],
          tokenUsage: {},
          generatedFiles: [],
          truncated: false,
          loopLimitReached: false,
        };
      }) as any,
    });

    render(<TeamsView db={db} createRuntimeDeps={createRuntimeDeps} />);

    fireEvent.click(await screen.findByTestId(`team-open-${activeTeam.id}`));
    const composer = await screen.findByLabelText('Nội dung tin nhắn trò chuyện AI');
    fireEvent.change(composer, { target: { value: 'Cập nhật việc A' } });
    fireEvent.click(screen.getByLabelText('Gửi tin nhắn'));

    expect(await screen.findByTestId('ai-mutation-approval')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Chấp thuận'));

    await waitFor(() => expect(approvalSeen).toBe(true));
    await waitFor(() => {
      expect(screen.queryByTestId('ai-mutation-approval')).not.toBeInTheDocument();
    });
  });
});