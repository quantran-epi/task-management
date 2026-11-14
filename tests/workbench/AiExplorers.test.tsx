import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { TaskPlannerDatabase } from '../../src/db';
import { createEmployee, createLead, createSkill } from '../../src/db/repositories/aiOfficeRepo';
import { createSkillVersion } from '../../src/db/repositories/aiSkillVersionRepo';
import { createTeam } from '../../src/db/repositories/aiTeamRepo';
import { AiStaffExplorer } from '../../src/workbench/toolwindows/AiStaffExplorer';
import { AiOfficeExplorer } from '../../src/workbench/toolwindows/AiOfficeExplorer';
import { useLayoutStore } from '../../src/workbench/store/layoutStore';

// Mock model fetching to avoid network calls
vi.mock('../../src/services/ai/nineRouterTokenService', () => ({
  fetchAvailableModels: async () => ['claude-sonnet-4', 'claude-opus-4'],
}));

describe('AiStaffExplorer and AiOfficeExplorer tool windows', () => {
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    db = new TaskPlannerDatabase('test-ai-explorers-' + Math.random().toString(36).slice(2));
    await db.open();
    useLayoutStore.getState().resetLayout();
  });

  afterEach(async () => {
    await db.delete();
    vi.restoreAllMocks();
  });

  describe('AiStaffExplorer', () => {
    it('renders staff list and opens staff_detail tab on click', async () => {
      const emp = await createEmployee(
        {
          name: 'Lan Kỹ Sư',
          role: 'Frontend Dev',
          capability: 'Viết UI React sạch đẹp.',
          persona: 'Bạn là Senior Frontend.',
          model: 'claude-sonnet-4',
        },
        db
      );

      const lead = await createLead(
        {
          name: 'Trí Lead',
          role: 'Tech Lead',
          capability: 'Điều phối kiến trúc.',
          persona: 'Bạn là Tech Lead kiến trúc.',
          model: 'claude-opus-4',
        },
        db
      );

      render(<AiStaffExplorer db={db} />);

      // Verify names rendered
      expect(await screen.findByText('Lan Kỹ Sư')).toBeInTheDocument();
      expect(await screen.findByText('Trí Lead')).toBeInTheDocument();

      // Click employee
      const empRow = screen.getByTestId(`ai-staff-employee-${emp.id}`);
      fireEvent.click(empRow);

      const openTabsAfterEmp = useLayoutStore.getState().openTabs;
      const empTab = openTabsAfterEmp.find((t) => t.id === `staff_detail:${emp.id}`);
      expect(empTab).toBeDefined();
      expect(empTab?.title).toBe('Lan Kỹ Sư');
      expect(empTab?.viewType).toBe('staff_detail');
      expect(empTab?.params).toEqual({ staffId: emp.id, role: 'employee' });

      // Click lead
      const leadRow = screen.getByTestId(`ai-staff-lead-${lead.id}`);
      fireEvent.click(leadRow);

      const openTabsAfterLead = useLayoutStore.getState().openTabs;
      const leadTab = openTabsAfterLead.find((t) => t.id === `staff_detail:${lead.id}`);
      expect(leadTab).toBeDefined();
      expect(leadTab?.title).toBe('Trí Lead');
      expect(leadTab?.viewType).toBe('staff_detail');
      expect(leadTab?.params).toEqual({ staffId: lead.id, role: 'lead' });
    });

    it('filters staff list by search query', async () => {
      await createEmployee(
        {
          name: 'Lan Kỹ Sư',
          role: 'Frontend Dev',
          capability: 'React UI',
          persona: 'Senior Frontend',
          model: 'claude-sonnet-4',
        },
        db
      );

      await createEmployee(
        {
          name: 'Hải Backend',
          role: 'Golang Engineer',
          capability: 'Microservices',
          persona: 'Backend Engineer',
          model: 'claude-sonnet-4',
        },
        db
      );

      render(<AiStaffExplorer db={db} />);
      expect(await screen.findByText('Lan Kỹ Sư')).toBeInTheDocument();
      expect(await screen.findByText('Hải Backend')).toBeInTheDocument();

      const searchInput = screen.getByPlaceholderText('Tìm lead, nhân viên, kỹ năng...');
      fireEvent.change(searchInput, { target: { value: 'Golang' } });

      await waitFor(() => {
        expect(screen.queryByText('Lan Kỹ Sư')).not.toBeInTheDocument();
        expect(screen.getByText('Hải Backend')).toBeInTheDocument();
      });
    });

    it('refuses to delete a lead in a team, naming the team and never an id', async () => {
      const lead = await createLead(
        {
          name: 'Trí Lead',
          role: 'Tech Lead',
          capability: 'Điều phối.',
          persona: 'Lead.',
          model: 'claude-opus-4',
        },
        db
      );
      await createTeam({ name: 'Nhóm Alpha', leadId: lead.id }, db);

      render(<AiStaffExplorer db={db} />);
      const leadRow = await screen.findByTestId(`ai-staff-lead-${lead.id}`);

      // D-10: the delete lives on the row's context menu.
      fireEvent.contextMenu(leadRow, { clientX: 200, clientY: 300 });
      await waitFor(() => {
        expect(document.querySelector('.ant-dropdown-menu')).not.toBeNull();
      });
      const leadMenu = document.querySelector('.ant-dropdown-menu') as HTMLElement;
      const leadDelete = [...leadMenu.querySelectorAll('.ant-dropdown-menu-item')].find((el) =>
        el.textContent?.includes('Xóa')
      ) as HTMLElement;
      fireEvent.click(leadDelete);

      // Modal.confirm, then the repo refuses inside its own transaction.
      fireEvent.click(await screen.findByRole('button', { name: 'Xóa' }));

      const alert = await screen.findByTestId('ai-staff-delete-error');
      expect(alert.textContent).toContain('Nhóm Alpha');
      expect(alert.textContent).not.toContain(lead.id);
      // No row disappears on a refusal.
      expect(screen.getByText('Trí Lead')).toBeInTheDocument();
      expect(await db.aiLeads.get(lead.id)).toBeDefined();
    });

    it('deletes an unreferenced employee from the context menu', async () => {
      const emp = await createEmployee(
        {
          name: 'Lan Rảnh',
          role: 'Frontend Dev',
          capability: 'React UI',
          persona: 'Senior Frontend',
          model: 'claude-sonnet-4',
        },
        db
      );

      render(<AiStaffExplorer db={db} />);
      fireEvent.contextMenu(await screen.findByTestId(`ai-staff-employee-${emp.id}`), {
        clientX: 200,
        clientY: 300,
      });
      await waitFor(() => {
        expect(document.querySelector('.ant-dropdown-menu')).not.toBeNull();
      });
      const empMenu = document.querySelector('.ant-dropdown-menu') as HTMLElement;
      const empDelete = [...empMenu.querySelectorAll('.ant-dropdown-menu-item')].find((el) =>
        el.textContent?.includes('Xóa')
      ) as HTMLElement;
      fireEvent.click(empDelete);
      fireEvent.click(await screen.findByRole('button', { name: 'Xóa' }));

      await waitFor(async () => {
        expect(await db.aiEmployees.get(emp.id)).toBeUndefined();
      });
      expect(screen.queryByTestId('ai-staff-delete-error')).not.toBeInTheDocument();
    });
  });

  describe('AiStaffExplorer — Kỹ năng (AIO-SKILL-01, D-31, D-33)', () => {
    const seedSkill = (overrides: Partial<{ name: string; description: string; body: string }> = {}) =>
      createSkill(
        {
          name: overrides.name ?? 'Viết đặc tả',
          description: overrides.description ?? 'Quy trình viết đặc tả nghiệp vụ.',
          body: overrides.body ?? '# Quy trình\nBước 1: đọc yêu cầu.',
        },
        db
      );

    const seedEmployee = (overrides: Partial<{ name: string; skillId: string }> = {}) =>
      createEmployee(
        {
          name: overrides.name ?? 'Lan Kỹ Sư',
          role: 'Frontend Dev',
          capability: 'Viết UI React sạch đẹp.',
          persona: 'Bạn là Senior Frontend.',
          model: 'claude-sonnet-4',
          ...(overrides.skillId !== undefined ? { skillId: overrides.skillId } : {}),
        },
        db
      );

    /** The card button and the Popconfirm's OK button share the label "Xóa". */
    const confirmPopconfirm = async () => {
      const popconfirm = await waitFor(() => {
        const node = document.querySelector('.ant-popconfirm');
        expect(node).toBeInTheDocument();
        return node as HTMLElement;
      });
      fireEvent.click(within(popconfirm).getByRole('button', { name: 'Xóa' }));
    };

    it('renders the Kỹ năng section with its empty state', async () => {
      render(<AiStaffExplorer db={db} />);

      expect(await screen.findByTestId('ai-staff-skills-section')).toBeInTheDocument();
      expect(screen.getByTestId('ai-staff-skills-section')).toHaveTextContent('Kỹ năng (0)');
      expect(screen.getByText('Chưa có kỹ năng nào')).toBeInTheDocument();
      expect(screen.getByTestId('ai-staff-skill-create')).toHaveAttribute(
        'aria-label',
        'Thêm Kỹ năng'
      );
    });

    it('creates a skill through the drawer and shows it in the section', async () => {
      render(<AiStaffExplorer db={db} />);

      fireEvent.click(await screen.findByTestId('ai-staff-skill-create'));

      fireEvent.change(await screen.findByLabelText('Tên'), {
        target: { value: 'Viết đặc tả' },
      });
      fireEvent.change(screen.getByLabelText('Mô tả (nhân viên chỉ thấy phần này)'), {
        target: { value: 'Quy trình viết đặc tả nghiệp vụ.' },
      });
      fireEvent.change(screen.getByLabelText('Nội dung'), {
        target: { value: '# Quy trình\nBước 1: đọc yêu cầu.' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Lưu kỹ năng' }));

      await waitFor(async () => expect(await db.aiSkills.count()).toBe(1));
      const stored = (await db.aiSkills.toArray())[0]!;
      expect(await screen.findByTestId(`ai-staff-skill-${stored.id}`)).toBeInTheDocument();
      expect(screen.getByTestId('ai-staff-skills-section')).toHaveTextContent('Kỹ năng (1)');
    });

    it('edits a skill and the card updates live', async () => {
      const skill = await seedSkill();
      render(<AiStaffExplorer db={db} />);

      const wrapper = await screen.findByTestId(`ai-staff-skill-${skill.id}`);
      // A card body click is inert — only `Sửa` opens the drawer (UI-SPEC §5).
      fireEvent.click(wrapper);
      expect(screen.queryByTestId('skill-editor-drawer')).not.toBeInTheDocument();

      fireEvent.click(within(wrapper).getByRole('button', { name: 'Sửa' }));
      fireEvent.change(await screen.findByLabelText('Tên'), {
        target: { value: 'Viết đặc tả v2' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Lưu kỹ năng' }));

      await waitFor(async () => expect((await db.aiSkills.get(skill.id))?.name).toBe('Viết đặc tả v2'));
      expect(await screen.findByText('Viết đặc tả v2')).toBeInTheDocument();
    });

    it('deletes an unreferenced skill after the card Popconfirm', async () => {
      const skill = await seedSkill();
      render(<AiStaffExplorer db={db} />);

      const wrapper = await screen.findByTestId(`ai-staff-skill-${skill.id}`);
      fireEvent.click(within(wrapper).getByRole('button', { name: 'Xóa' }));
      await confirmPopconfirm();

      await waitFor(async () => expect(await db.aiSkills.get(skill.id)).toBeUndefined());
      await waitFor(() =>
        expect(screen.queryByTestId(`ai-staff-skill-${skill.id}`)).not.toBeInTheDocument()
      );
      expect(screen.queryByTestId('ai-staff-delete-error')).not.toBeInTheDocument();
    });

    it('refuses to delete a skill assigned to an agent and names the agent', async () => {
      const skill = await seedSkill();
      await seedEmployee({ name: 'Lan Kỹ Sư', skillId: skill.id });
      render(<AiStaffExplorer db={db} />);

      const wrapper = await screen.findByTestId(`ai-staff-skill-${skill.id}`);
      fireEvent.click(within(wrapper).getByRole('button', { name: 'Xóa' }));
      await confirmPopconfirm();

      const alert = await screen.findByTestId('ai-staff-delete-error');
      expect(alert.textContent).toContain('Lan Kỹ Sư');
      expect(alert.textContent).not.toContain(skill.id);
      expect(screen.getByTestId(`ai-staff-skill-${skill.id}`)).toBeInTheDocument();
      expect(await db.aiSkills.get(skill.id)).toBeDefined();
    });

    it('filters all three sections with one query', async () => {
      await createLead(
        {
          name: 'Trí Lead',
          role: 'Tech Lead',
          capability: 'Điều phối kiến trúc.',
          persona: 'Bạn là Tech Lead.',
          model: 'claude-opus-4',
        },
        db
      );
      await seedEmployee({ name: 'Lan Kỹ Sư' });
      const skill = await seedSkill({ name: 'Viết đặc tả' });

      render(<AiStaffExplorer db={db} />);
      expect(await screen.findByText('Trí Lead')).toBeInTheDocument();
      expect(await screen.findByText('Lan Kỹ Sư')).toBeInTheDocument();
      expect(await screen.findByTestId(`ai-staff-skill-${skill.id}`)).toBeInTheDocument();

      fireEvent.change(screen.getByPlaceholderText('Tìm lead, nhân viên, kỹ năng...'), {
        target: { value: 'đặc tả' },
      });

      await waitFor(() => {
        expect(screen.queryByText('Trí Lead')).not.toBeInTheDocument();
        expect(screen.queryByText('Lan Kỹ Sư')).not.toBeInTheDocument();
        expect(screen.getByTestId(`ai-staff-skill-${skill.id}`)).toBeInTheDocument();
      });
    });

    it('shows the pending-count badge on a skill card', async () => {
      const skill = await seedSkill();
      await createSkillVersion(
        {
          skillId: skill.id,
          name: skill.name,
          description: skill.description,
          body: '# Quy trình\nBước 2: viết đặc tả.',
        },
        db
      );

      render(<AiStaffExplorer db={db} />);

      const badge = await screen.findByTestId(`skill-card-pending-${skill.id}`);
      expect(badge).toHaveTextContent('1 chờ duyệt');
    });
  });

  describe('AiOfficeExplorer', () => {
    it('renders teams list and opens team_workspace tab on click', async () => {
      const lead = await createLead(
        {
          name: 'Huy Lead',
          role: 'Scrum Lead',
          capability: 'Quản lý sprint',
          persona: 'Lead sprint',
          model: 'claude-opus-4',
        },
        db
      );

      const emp = await createEmployee(
        {
          name: 'Minh Dev',
          role: 'Fullstack',
          capability: 'Fullstack coding',
          persona: 'Dev',
          model: 'claude-sonnet-4',
        },
        db
      );

      const team = await createTeam(
        {
          name: 'Alpha Team',
          leadId: lead.id,
          employeeIds: [emp.id],
          budgetTokens: 50000,
          },
        db
      );

      render(<AiOfficeExplorer db={db} />);

      expect(await screen.findByText('Alpha Team')).toBeInTheDocument();
      expect(screen.getByText('Lead: Huy Lead')).toBeInTheDocument();

      // Click team
      const teamRow = screen.getByTestId(`ai-office-team-${team.id}`);
      fireEvent.click(teamRow);

      const openTabs = useLayoutStore.getState().openTabs;
      const teamTab = openTabs.find((t) => t.id === `team_workspace:${team.id}`);
      expect(teamTab).toBeDefined();
      expect(teamTab?.title).toBe('Alpha Team');
      expect(teamTab?.viewType).toBe('team_workspace');
      expect(teamTab?.params).toEqual({ teamId: team.id });
    });

    it('shows a no-leader label on a group with no lead', async () => {
      const team = await createTeam({ name: 'Beta Team' }, db);

      render(<AiOfficeExplorer db={db} />);

      const row = await screen.findByTestId(`ai-office-team-${team.id}`);
      expect(row).toHaveTextContent('Chưa chọn lead');
    });
  });
});
