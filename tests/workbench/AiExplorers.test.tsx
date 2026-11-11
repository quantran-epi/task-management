import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TaskPlannerDatabase } from '../../src/db';
import { createEmployee, createLead } from '../../src/db/repositories/aiOfficeRepo';
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

      const searchInput = screen.getByPlaceholderText('Tìm staff...');
      fireEvent.change(searchInput, { target: { value: 'Golang' } });

      await waitFor(() => {
        expect(screen.queryByText('Lan Kỹ Sư')).not.toBeInTheDocument();
        expect(screen.getByText('Hải Backend')).toBeInTheDocument();
      });
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
          status: 'active',
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

    it('shows the Vietnamese idle label instead of the raw enum (IN-08a)', async () => {
      const team = await createTeam({ name: 'Beta Team', status: 'idle' }, db);

      render(<AiOfficeExplorer db={db} />);

      const row = await screen.findByTestId(`ai-office-team-${team.id}`);
      expect(row).toHaveTextContent('Nhàn rỗi');
      expect(row).not.toHaveTextContent('idle');
    });
  });
});
