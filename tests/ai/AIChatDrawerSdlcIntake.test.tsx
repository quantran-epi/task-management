import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AIChatDrawer } from '../../src/components/ai/AIChatDrawer';
// The Note picker reads the app-wide db singleton, so the drawer is mounted on the same instance.
import { db } from '../../src/db';
import * as nineRouterTokenService from '../../src/services/ai/nineRouterTokenService';
import * as nineRouterClient from '../../src/services/ai/nineRouterClient';

vi.mock('../../src/utils/pptxExport', () => ({ exportPresentationAsFile: vi.fn() }));

const TS = '2026-10-30T00:00:00.000Z';
const PROJECT_A = '11111111-1111-4111-8111-111111111111';
const PROJECT_B = '22222222-2222-4222-8222-222222222222';
const NOTE_A1 = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001';
const NOTE_A2 = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002';
const NOTE_A3 = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000003';
const NOTE_A4 = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000004';

const scopeA = { type: 'project' as const, id: PROJECT_A, title: 'Project A' };
const scopeB = { type: 'project' as const, id: PROJECT_B, title: 'Project B' };

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function note(id: string, entityId: string, title: string, body: string, version = 1) {
  return {
    id,
    title,
    body,
    entityType: 'project',
    entityId,
    isPinned: false,
    sdlcArtifact: {
      kind: 'PL01' as const,
      projectId: entityId,
      threadId: '33333333-3333-4333-8333-333333333333',
      sessionId: '44444444-4444-4444-8444-444444444444',
      version,
      inputHash: '00'.repeat(32),
      sourceArtifactIds: [],
      sourceArtifactHashes: [],
      approvedAt: TS,
      idempotencyKey: `key-${id}`,
    },
    createdAt: TS,
    updatedAt: TS,
  };
}

const AGREE_PL01 = '# PL01\n\nKênh phân phối: Mobile banking.';
const AGREE_PL02 = '# PL02\n\nKênh phân phối: Mobile banking.';
const CONFLICT_PL01 = '# PL01\n\nHạn mức chuyển tiền: 500 triệu.';
const CONFLICT_PL02 = '# PL02\n\nHạn mức chuyển tiền: 1000 triệu.';

describe('AIChatDrawer SDLC intake through buildMergedSdlcInput (D-18/D-19/SC-5)', () => {
  let payloads: any[];

  const lastUserContent = (): string => {
    const messages = payloads[payloads.length - 1]?.messages ?? [];
    const userMessages = messages.filter((m: any) => m.role === 'user');
    return userMessages[userMessages.length - 1]?.content ?? '';
  };

  const seed = async (pl01Body: string, pl02Body: string) => {
    await db.projects.bulkAdd([
      { id: PROJECT_A, name: 'Project A', status: 'Open', createdAt: TS, updatedAt: TS },
      { id: PROJECT_B, name: 'Project B', status: 'Open', createdAt: TS, updatedAt: TS },
    ]);
    await db.notes.bulkAdd([
      note(NOTE_A1, PROJECT_A, 'Nguồn PL01 Alpha', pl01Body, 2),
      note(NOTE_A2, PROJECT_A, 'Nguồn PL01 Beta', pl01Body, 1),
      note(NOTE_A3, PROJECT_A, 'Nguồn PL02 Gamma', pl02Body, 3),
      note(NOTE_A4, PROJECT_A, 'Nguồn PL02 Delta', pl02Body, 1),
      note('bbbbbbbb-bbbb-4bbb-8bbb-000000000001', PROJECT_B, 'Nguồn dự án B', '# B\n\nNội dung B.', 1),
    ]);
  };

  const SEARCH_PLACEHOLDER = 'Tìm theo tiêu đề tài liệu…';

  const pickerDialog = (): HTMLElement =>
    screen.getByPlaceholderText(SEARCH_PLACEHOLDER).closest('[role="dialog"]') as HTMLElement;

  const pickSources = async (kindIndex: 0 | 1, titles: string[]) => {
    const buttons = await screen.findAllByRole('button', { name: /Chọn nguồn/ });
    fireEvent.click(buttons[kindIndex]!);
    // The picker resets its selection whenever the drawer re-renders, so select + apply is retried.
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await waitFor(() => expect(screen.queryAllByPlaceholderText(SEARCH_PLACEHOLDER)).toHaveLength(1));
      const dialog = pickerDialog();
      for (const title of titles) {
        const option = (await within(dialog).findByText(title)).closest('[role="option"]') as HTMLElement;
        const checkbox = option.querySelector('input[type="checkbox"]') as HTMLInputElement;
        if (!checkbox.checked) fireEvent.click(checkbox);
      }
      const apply = within(dialog).getByRole('button', { name: /Áp dụng \d+ nguồn/ }) as HTMLButtonElement;
      if (apply.disabled) continue;
      fireEvent.click(apply);
      try {
        await waitFor(
          () => expect(screen.queryAllByPlaceholderText(SEARCH_PLACEHOLDER)).toHaveLength(0),
          { timeout: 400, interval: 40 }
        );
        return;
      } catch {
        // selection was cleared mid-apply; retry from the still-open picker
      }
    }
    throw new Error(`picker did not apply sources: ${titles.join(', ')}`);
  };

  const runIntake = async (pl01Titles: string[], pl02Titles: string[]) => {
    fireEvent.click(await screen.findByRole('button', { name: /Khởi tạo SDLC/ }));
    await screen.findByText('Nạp Hồ sơ Đầu vào (PL01 & PL02)');
    await pickSources(0, pl01Titles);
    await pickSources(1, pl02Titles);
    fireEvent.click(screen.getByRole('button', { name: /Bắt đầu Phân tích Solution/ }));
  };

  beforeEach(async () => {
    payloads = [];
    await db.notes.clear();
    await db.projects.clear();
    await db.settings.clear();
    vi.spyOn(nineRouterTokenService, 'getNineRouterApiKey').mockResolvedValue('test-api-key');
    vi.spyOn(nineRouterTokenService, 'getNineRouterConfig').mockResolvedValue({
      endpoint: 'http://localhost:20128',
      defaultModel: 'gpt-4o',
      charLimit: 12000,
    });
    vi.spyOn(nineRouterTokenService, 'fetchAvailableModels').mockResolvedValue(['model-alpha']);
    vi.spyOn(nineRouterClient, 'streamChatEvents').mockImplementation(((options: any) => {
      payloads.push(options.payload);
      return (async function* () {
        yield { type: 'text' as const, delta: 'Phản hồi SDLC' };
      })();
    }) as never);
    vi.spyOn(nineRouterClient, 'streamChatCompletion').mockImplementation((() =>
      (async function* () {
        /* no tokens */
      })()) as never);
  });

  afterEach(async () => {
    cleanup();
    vi.restoreAllMocks();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });

  it('sends merged content with per-source id/version/hash citations resolved through sourceId', async () => {
    await seed(AGREE_PL01, AGREE_PL02);
    render(<AIChatDrawer open onClose={() => {}} db={db} activeScope={scopeA} />);

    await runIntake(
      ['Nguồn PL01 Alpha', 'Nguồn PL01 Beta'],
      ['Nguồn PL02 Gamma', 'Nguồn PL02 Delta']
    );

    await waitFor(() => expect(payloads.length).toBeGreaterThan(0));
    const prompt = lastUserContent();

    expect(prompt).toContain('[Quy trình SDLC - Khởi tạo SOLUTION cho CR:');
    expect(prompt).toContain('[NGUỒN PL01/PL02]');
    expect(prompt).toContain('Kênh phân phối: Mobile banking.');

    const expected = [
      { id: NOTE_A1, title: 'Nguồn PL01 Alpha', version: 2, kind: 'PL01', body: AGREE_PL01 },
      { id: NOTE_A2, title: 'Nguồn PL01 Beta', version: 1, kind: 'PL01', body: AGREE_PL01 },
      { id: NOTE_A3, title: 'Nguồn PL02 Gamma', version: 3, kind: 'PL02', body: AGREE_PL02 },
      { id: NOTE_A4, title: 'Nguồn PL02 Delta', version: 1, kind: 'PL02', body: AGREE_PL02 },
    ];
    for (const source of expected) {
      const hash = (await sha256(source.body)).slice(0, 8);
      expect(prompt).toContain(
        `- ${source.kind} · ${source.title} · id=${source.id} · v${source.version} · hash=${hash}`
      );
    }
  });

  it('emits a conflict block when PL01 and PL02 sources disagree', async () => {
    await seed(CONFLICT_PL01, CONFLICT_PL02);
    render(<AIChatDrawer open onClose={() => {}} db={db} activeScope={scopeA} />);

    await runIntake(['Nguồn PL01 Alpha'], ['Nguồn PL02 Gamma']);

    await waitFor(() => expect(payloads.length).toBeGreaterThan(0));
    const prompt = lastUserContent();
    expect(prompt).toContain('[CẢNH BÁO MÂU THUẪN]');
    expect(prompt).toContain('Hạn mức chuyển tiền');
    expect(prompt).toContain('500 triệu');
    expect(prompt).toContain('1000 triệu');
  });

  it('omits the conflict block when all sources agree', async () => {
    await seed(AGREE_PL01, AGREE_PL02);
    render(<AIChatDrawer open onClose={() => {}} db={db} activeScope={scopeA} />);

    await runIntake(['Nguồn PL01 Alpha'], ['Nguồn PL02 Gamma']);

    await waitFor(() => expect(payloads.length).toBeGreaterThan(0));
    expect(lastUserContent()).not.toContain('[CẢNH BÁO MÂU THUẪN]');
  });

  it('never mutates the seeded source Notes', async () => {
    await seed(AGREE_PL01, AGREE_PL02);
    const before = await db.notes.toArray();
    render(<AIChatDrawer open onClose={() => {}} db={db} activeScope={scopeA} />);

    await runIntake(['Nguồn PL01 Alpha'], ['Nguồn PL02 Gamma']);

    await waitFor(() => expect(payloads.length).toBeGreaterThan(0));
    expect(await db.notes.toArray()).toEqual(before);
  });

  it('ignores citations resolved under a different scope (no cross-project id leak)', async () => {
    await seed(AGREE_PL01, AGREE_PL02);
    const { rerender } = render(
      <AIChatDrawer open onClose={() => {}} db={db} activeScope={scopeA} />
    );

    await runIntake(['Nguồn PL01 Alpha'], ['Nguồn PL02 Gamma']);
    await waitFor(() => expect(payloads.length).toBeGreaterThan(0));

    rerender(<AIChatDrawer open onClose={() => {}} db={db} activeScope={scopeB} />);
    await waitFor(() =>
      expect(screen.getAllByLabelText('Nội dung tin nhắn trò chuyện AI').length).toBeGreaterThan(0)
    );
    payloads.length = 0;
    fireEvent.change(screen.getByLabelText('Nội dung tin nhắn trò chuyện AI'), {
      target: { value: 'Phân tích giải pháp cho dự án B' },
    });
    fireEvent.click(await screen.findByLabelText('Gửi tin nhắn'));

    await waitFor(() => expect(payloads.length).toBeGreaterThan(0));
    const prompt = lastUserContent();
    expect(prompt).not.toContain(NOTE_A1);
    expect(prompt).not.toContain(NOTE_A3);
    expect(prompt).not.toContain('(Nguồn:');
  });
});
