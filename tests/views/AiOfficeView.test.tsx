import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TaskPlannerDatabase } from '../../src/db';
import {
  createEmployee,
  createLead,
  createSkill,
} from '../../src/db/repositories/aiOfficeRepo';
import { AiOfficeView } from '../../src/views/AiOfficeView';
import { useLayoutStore } from '../../src/workbench/store/layoutStore';

/**
 * Phase 34 plan 09 — the employee tab (`EditorViewType 'agents'`).
 *
 * Rendered directly rather than through `EditorArea` so this suite does not depend on
 * plan 34-10's `renderViewContent` wiring.
 */
describe('AiOfficeView — employee tab shell (AIO-UI-01)', () => {
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    db = new TaskPlannerDatabase('test-ai-office-' + Math.random().toString(36).slice(2));
    await db.open();
    useLayoutStore.getState().resetLayout();
  });

  afterEach(async () => {
    await db.delete();
    vi.restoreAllMocks();
  });

  function renderView() {
    return render(<AiOfficeView db={db} />);
  }

  async function seedEmployee(overrides: Partial<{ name: string; role: string; model: string }> = {}) {
    return createEmployee(
      {
        name: overrides.name ?? 'An Nguyễn',
        role: overrides.role ?? 'Chuyên viên phân tích nghiệp vụ',
        capability: 'Phân rã yêu cầu nghiệp vụ thành đặc tả kỹ thuật.',
        persona: 'Bạn là một BA kỹ tính.',
        model: overrides.model ?? 'claude-sonnet-4',
      },
      db
    );
  }

  it('renders the shell with Văn phòng AI as the default segment', async () => {
    renderView();

    expect(await screen.findByTestId('ai-office-view')).toBeInTheDocument();
    expect(screen.getByText('Nhân viên AI, lead và kỹ năng dùng chung cho mọi nhóm')).toBeInTheDocument();
    // Ghost Dev is behind the second segment, so its surface is not mounted by default.
    expect(screen.queryByText('Chưa có phiên Ghost Dev nào được chọn')).not.toBeInTheDocument();
  });

  it('exposes the three inner segment testids and switches the rendered card type', async () => {
    const employee = await seedEmployee();
    const lead = await createLead(
      {
        name: 'Bình Trần',
        role: 'Lead điều phối',
        capability: 'Chia việc và tổng hợp kết quả.',
        persona: 'Bạn là lead điều phối.',
        model: 'claude-opus-4',
      },
      db
    );
    const skill = await createSkill(
      { name: 'Viết đặc tả', description: 'Quy trình viết đặc tả nghiệp vụ.', body: '# Quy trình' },
      db
    );

    renderView();

    expect(await screen.findByTestId('ai-office-segment-employees')).toBeInTheDocument();
    expect(screen.getByTestId('ai-office-segment-leads')).toBeInTheDocument();
    expect(screen.getByTestId('ai-office-segment-skills')).toBeInTheDocument();

    expect(await screen.findByTestId(`employee-card-${employee.id}`)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('ai-office-segment-leads'));
    expect(await screen.findByTestId(`lead-card-${lead.id}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`employee-card-${employee.id}`)).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('ai-office-segment-skills'));
    expect(await screen.findByTestId(`skill-card-${skill.id}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`lead-card-${lead.id}`)).not.toBeInTheDocument();
  });

  it('renders an employee card with its model tag and the no-skill tag', async () => {
    const employee = await seedEmployee({ model: 'claude-sonnet-4' });

    renderView();

    const card = await screen.findByTestId(`employee-card-${employee.id}`);
    expect(card).toHaveTextContent('An Nguyễn');
    expect(card).toHaveTextContent('claude-sonnet-4');
    expect(card).toHaveTextContent('Không dùng kỹ năng');
    expect(card).toHaveTextContent('0 nhóm');
  });

  it('renders a lead card with a Lead tag', async () => {
    const lead = await createLead(
      {
        name: 'Bình Trần',
        role: 'Lead điều phối',
        capability: 'Chia việc và tổng hợp kết quả.',
        persona: 'Bạn là lead điều phối.',
        model: 'claude-opus-4',
      },
      db
    );

    renderView();
    fireEvent.click(await screen.findByTestId('ai-office-segment-leads'));

    const card = await screen.findByTestId(`lead-card-${lead.id}`);
    expect(card).toHaveTextContent('Bình Trần');
    expect(card).toHaveTextContent('Lead');
  });

  it('renders a skill card with its description', async () => {
    const skill = await createSkill(
      { name: 'Viết đặc tả', description: 'Quy trình viết đặc tả nghiệp vụ.', body: '# Quy trình' },
      db
    );

    renderView();
    fireEvent.click(await screen.findByTestId('ai-office-segment-skills'));

    const card = await screen.findByTestId(`skill-card-${skill.id}`);
    expect(card).toHaveTextContent('Viết đặc tả');
    expect(card).toHaveTextContent('Quy trình viết đặc tả nghiệp vụ.');
    expect(card).toHaveTextContent('Đang dùng bởi 0 nhân viên');
  });

  it('renders the copywriting empty state for each segment', async () => {
    renderView();

    expect(
      await screen.findByText(
        'Tạo nhân viên đầu tiên với tên, vai trò và persona. Nhân viên dùng chung được cho nhiều nhóm.'
      )
    ).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('ai-office-segment-leads'));
    expect(
      await screen.findByText(
        'Lead phân rã yêu cầu, chia việc và tổng hợp kết quả cho nhóm. Tạo lead trước khi lập nhóm.'
      )
    ).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('ai-office-segment-skills'));
    expect(
      await screen.findByText(
        'Kỹ năng là mẫu prompt gồm tên, mô tả và nội dung Markdown, gán cho một nhân viên. Tạo kỹ năng để nhân viên làm theo quy trình chuẩn.'
      )
    ).toBeInTheDocument();
  });

  it('filters the employee list by name and role', async () => {
    const match = await seedEmployee({ name: 'An Nguyễn', role: 'Chuyên viên phân tích' });
    const other = await seedEmployee({ name: 'Cường Lê', role: 'Kỹ sư kiểm thử' });

    renderView();
    await screen.findByTestId(`employee-card-${match.id}`);

    fireEvent.change(screen.getByPlaceholderText('Tìm nhân viên theo tên, vai trò...'), {
      target: { value: 'kiểm thử' },
    });

    await waitFor(() => {
      expect(screen.queryByTestId(`employee-card-${match.id}`)).not.toBeInTheDocument();
    });
    expect(screen.getByTestId(`employee-card-${other.id}`)).toBeInTheDocument();
  });

  it('exposes the three create buttons', async () => {
    renderView();

    // The header CTA and the empty-state CTA share the same label.
    expect((await screen.findAllByRole('button', { name: /Tạo nhân viên/ })).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByTestId('ai-office-segment-leads'));
    expect((await screen.findAllByRole('button', { name: /Tạo lead/ })).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByTestId('ai-office-segment-skills'));
    expect((await screen.findAllByRole('button', { name: /Tạo kỹ năng/ })).length).toBeGreaterThan(0);
  });

  it('keeps Ghost Dev reachable from the second segment', async () => {
    renderView();

    fireEvent.click(await screen.findByText('Ghost Dev'));

    expect(await screen.findByText('Chưa có phiên Ghost Dev nào được chọn')).toBeInTheDocument();
    expect(screen.queryByTestId('ai-office-segment-employees')).not.toBeInTheDocument();
  });
});
