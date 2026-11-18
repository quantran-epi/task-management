import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChatInputBar } from '../../src/components/ai/ChatInputBar';
import { TaskPlannerDatabase } from '../../src/db';

const LEAD = { id: '11111111-1111-4111-8111-111111111111', name: 'Bình Trần', role: 'Lead điều phối', isLead: true };
const EMP_A = { id: '22222222-2222-4222-8222-222222222222', name: 'An Nguyễn', role: 'Chuyên viên phân tích', isLead: false };
const EMP_B = { id: '33333333-3333-4333-8333-333333333333', name: 'Chi Lê', role: 'Kỹ sư kiểm thử', isLead: false };

/**
 * Phase 34 plan 10 — the team composer `@agent` surface (AIO-TEAM-01, D-08).
 * Selected values must be `@[Name](agent:<id>)`, the exact form the coordinator's
 * router parses; a wrong shape silently routes every mention to the lead.
 */
describe('ChatInputBar — agent mentions (D-08)', () => {
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    db = new TaskPlannerDatabase('test-agent-mentions-' + Math.random().toString(36).slice(2));
    await db.open();
    await db.tasks.add({
      id: 'task-1',
      name: 'Việc A',
      status: 'Open',
      priority: 'High',
      progress: 0,
      estimateMinutes: 60,
      createdAt: '2026-10-01',
      updatedAt: '2026-10-01',
    } as any);
  });

  afterEach(async () => {
    await db.delete();
    vi.restoreAllMocks();
  });

  function typeAt() {
    const textarea = screen.getByLabelText('Nội dung tin nhắn trò chuyện AI') as HTMLTextAreaElement;
    textarea.focus();
    fireEvent.change(textarea, { target: { value: '@', selectionStart: 1, selectionEnd: 1 } });
    fireEvent.keyUp(textarea, { key: '@', keyCode: 50 });
    return textarea;
  }

  async function dropdownItems(): Promise<HTMLElement[]> {
    await waitFor(() => {
      expect(document.querySelector('.ant-mentions-dropdown')).toBeInTheDocument();
    });
    return Array.from(
      document.querySelectorAll<HTMLElement>('.ant-mentions-dropdown li[role="menuitem"]')
    );
  }

  /** antd carries the option key on `data-menu-id`, not the value; read the key suffix. */
  function menuKeyOf(item: HTMLElement): string {
    return item.getAttribute('data-menu-id') ?? '';
  }

  it('offers the lead first, then employees by name', async () => {
    render(
      <ChatInputBar
        onSubmit={vi.fn()}
        db={db}
        agentOptions={[EMP_B, LEAD, EMP_A]}
      />
    );

    typeAt();

    const texts = (await dropdownItems()).map((item) => item.textContent ?? '');
    expect(texts[0]).toContain('Bình Trần');
    expect(texts[1]).toContain('An Nguyễn');
    expect(texts[2]).toContain('Chi Lê');
  });
  it('uses the @[Name](agent:<id>) selected value', async () => {
    const onSubmit = vi.fn();
    render(<ChatInputBar onSubmit={onSubmit} db={db} agentOptions={[LEAD, EMP_A]} />);

    const textarea = typeAt();
    const items = await dropdownItems();
    expect(menuKeyOf(items[0]!)).toContain(`agent-${LEAD.id}`);
    expect(menuKeyOf(items[1]!)).toContain(`agent-${EMP_A.id}`);

    // Selecting writes the value verbatim — the exact form the coordinator router parses.
    fireEvent.click(items[0]!);
    fireEvent.change(textarea, { target: { value: `@[Bình Trần](agent:${LEAD.id}) xem giúp` } });
    fireEvent.click(screen.getByLabelText('Gửi tin nhắn'));
    expect(onSubmit).toHaveBeenCalledWith(`@[Bình Trần](agent:${LEAD.id}) xem giúp`);
  });

  it('keeps the task options in the same list', async () => {
    render(<ChatInputBar onSubmit={vi.fn()} db={db} agentOptions={[LEAD]} />);

    typeAt();

    const texts = (await dropdownItems()).map((item) => item.textContent ?? '');
    expect(texts.some((text) => text.includes('Việc A'))).toBe(true);
  });

  it('renders no agent option when agentOptions is absent', async () => {
    render(<ChatInputBar onSubmit={vi.fn()} db={db} />);

    typeAt();

    const keys = (await dropdownItems()).map(menuKeyOf);
    expect(keys.some((key) => key.includes('agent-'))).toBe(false);
  });
});
