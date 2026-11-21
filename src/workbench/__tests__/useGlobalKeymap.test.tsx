import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useGlobalKeymap } from '../hooks/useGlobalKeymap';
import { executeAction } from '../actions/actionRegistry';

const messageMock = vi.hoisted(() => ({ current: { success: vi.fn(), error: vi.fn() } as Record<string, (...a: unknown[]) => void> }));

vi.mock('../actions/actionRegistry', () => ({
  executeAction: vi.fn(),
}));

vi.mock('../../components/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../components/ui')>();
  return { ...actual, useMessage: () => messageMock.current };
});

function Harness() {
  useGlobalKeymap();
  return <input data-testid="typing-target" aria-label="typing target" />;
}

function keydown(init: KeyboardEventInit, target: EventTarget): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

describe('useGlobalKeymap — no global Find shortcut (261120-vcb)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    messageMock.current = { success: vi.fn(), error: vi.fn() };
    messageMock.current.success = vi.fn();
    messageMock.current.error = vi.fn();
  });

  it('Ctrl+Shift+F (key F) is inert and never dispatches find.inPath', () => {
    render(<Harness />);
    const input = screen.getByTestId('typing-target');
    input.focus();

    const event = keydown({ key: 'F', ctrlKey: true, shiftKey: true }, input);

    expect(event.defaultPrevented).toBe(false);
    expect(executeAction).not.toHaveBeenCalled();
  });

  it('Cmd+Shift+F (key f, metaKey) is inert and never dispatches find.inPath', () => {
    render(<Harness />);
    const input = screen.getByTestId('typing-target');
    input.focus();

    const event = keydown({ key: 'f', metaKey: true, shiftKey: true }, input);

    expect(event.defaultPrevented).toBe(false);
    expect(executeAction).not.toHaveBeenCalled();
  });

  it('plain Ctrl+F does NOT dispatch find.inPath', () => {
    render(<Harness />);
    const input = screen.getByTestId('typing-target');
    input.focus();

    keydown({ key: 'f', ctrlKey: true }, input);

    expect(executeAction).not.toHaveBeenCalledWith('find.inPath');
  });

  it('Ctrl+K still dispatches search.everywhere (Search Everywhere stays intact)', () => {
    render(<Harness />);
    const input = screen.getByTestId('typing-target');

    keydown({ key: 'k', ctrlKey: true }, input);

    expect(executeAction).toHaveBeenCalledWith('search.everywhere', expect.any(Function));
  });

  it('uses the latest message instance after the holder returns a new one (WR-02)', () => {
    const { rerender } = render(<Harness />);
    const input = screen.getByTestId('typing-target');

    // Simulate ThemeAppHolder re-mounting with a fresh AntD message instance.
    const freshInfo = vi.fn();
    messageMock.current = { success: vi.fn(), info: freshInfo, error: vi.fn() };
    rerender(<Harness />);

    keydown({ key: 'k', ctrlKey: true }, input);
    const notify = vi.mocked(executeAction).mock.calls[0]?.[1];
    expect(notify).toBeTypeOf('function');
    notify?.('info', 'hello');

    // With the old stale closure this called the ORIGINAL message.info.
    expect(freshInfo).toHaveBeenCalledWith('hello');
  });
});
