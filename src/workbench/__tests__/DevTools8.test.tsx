import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { UtilityToolPanel } from '../toolwindows/UtilityToolPanel';
import { useUtilityToolContent } from '../toolwindows/utilityToolContentStore';
import type { EditorViewType } from '../store/layoutStore';

vi.mock('../../services/ai/nineRouterTokenService', () => ({
  getNineRouterConfig: vi.fn(async () => ({ endpoint: 'http://x', defaultModel: 'gpt-4o', charLimit: 12000, contextWindowTokens: 200000 })),
  getNineRouterApiKey: vi.fn(async () => 'test-key'),
  DEFAULT_NINEROUTER_MODEL: 'gpt-4o',
}));
vi.mock('../../services/ai/nineRouterClient', () => ({ stripThinkingBlocks: (s: string) => s, streamChatCompletion: vi.fn() }));
vi.mock('../../db/repositories/noteRepo', () => ({ createNote: vi.fn() }));

// jsdom has no Worker; behavior under test is "only run on explicit click", not Worker internals.
vi.mock('../toolwindows/utilityToolHelpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../toolwindows/utilityToolHelpers')>();
  return {
    ...actual,
    runRegex: vi.fn(async (pattern: string, _flags: string, input: string) => {
      const matches = [...input.matchAll(new RegExp(pattern, 'g'))].map((m) => ({ index: m.index ?? 0, value: m[0], groups: [] as string[] }));
      return { matches, count: matches.length, truncated: false, error: null };
    }),
  };
});

beforeEach(() => useUtilityToolContent.getState().resetAll());
afterEach(() => cleanup());

type Case = {
  view: EditorViewType;
  input: [label: string, value: string];
  options?: (input: HTMLElement) => void;
  outputLabel: string;
  expect: RegExp | string;
  runLabel?: string | RegExp;
};

const cases: Case[] = [
  { view: 'encoder_decoder', input: ['Encoder input', 'Xin chào'], outputLabel: 'Encoder output', expect: 'WGluIGNow6Bv' },
  { view: 'timestamp_converter', input: ['Timestamp input', '1700000000000'], outputLabel: 'Timestamp output', expect: /2023/ },
  { view: 'date_calculation', input: ['Date input', '2024-01-10'], outputLabel: 'Date result', expect: '2024-01-11' },
  { view: 'text_utilities', input: ['Text utilities input', 'hello world-foo'], options: () => fireEvent.change(screen.getByLabelText('Phép biến đổi'), { target: { value: 'camel' } }), outputLabel: 'Text utilities output', expect: 'helloWorldFoo' },
  { view: 'cron_expression', input: ['Cron expression', '*/15 9 * * 1-5'], outputLabel: 'Cron runs', expect: /T\d\d:/, runLabel: '5 lần chạy tiếp' },
  { view: 'hash_uuid', input: ['Hash input', 'hello'], outputLabel: 'Hash output', expect: '2cf24d', runLabel: 'Hash' },
  { view: 'jwt_decoder', input: ['JWT token', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.sig'], outputLabel: 'JWT decoded', expect: '123' },
];

describe('8 newly-added dev tools — behavior-level regression', () => {
  it.each(cases)('$view: output stays empty until explicit Run, then correct', async ({ view, input, options, outputLabel, expect: expected, runLabel }) => {
    render(<UtilityToolPanel viewType={view} />);
    fireEvent.change(screen.getByLabelText(input[0]), { target: { value: input[1] } });
    options?.(screen.getByLabelText(input[0]));
    const output = screen.getByLabelText(outputLabel);
    expect(output.textContent).toBe('');
    fireEvent.click(screen.getByRole('button', { name: runLabel ?? 'Chạy' }));
    await waitFor(() => expect(output.textContent).toMatch(expected as string | RegExp));
  });

  it('shows a visible, meaningful label for the UUID count field', () => {
    render(<UtilityToolPanel viewType="hash_uuid" />);
    const label = screen.getByText('Số lượng UUID (1–100)');
    expect(label).toBeDefined();
    expect(label.closest('label')?.querySelector('input')).toBe(screen.getByLabelText('Số lượng UUID'));
  });

  it('shows per-tool usage guidance for each of the 8 tools', () => {
    const all: EditorViewType[] = ['encoder_decoder', 'regex_tester', 'timestamp_converter', 'date_calculation', 'text_utilities', 'cron_expression', 'hash_uuid', 'jwt_decoder'];
    for (const view of all) {
      cleanup();
      render(<UtilityToolPanel viewType={view} />);
      expect(screen.getAllByText(/Nhập|Chọn|chạy/).length).toBeGreaterThan(0);
    }
  });

  it('regex tester runs only on explicit Run (no worker auto-run on input)', async () => {
    render(<UtilityToolPanel viewType="regex_tester" />);
    fireEvent.change(screen.getByLabelText('Pattern'), { target: { value: '[a-z]+' } });
    fireEvent.change(screen.getByLabelText('Regex test input'), { target: { value: 'abc123' } });
    const output = screen.getByLabelText('Regex matches');
    expect(output.textContent).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Chạy' }));
    await waitFor(() => expect(output.textContent).toContain('abc'));
  });
});
