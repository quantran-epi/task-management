import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useGlobalKeymap } from '../hooks/useGlobalKeymap';
import { executeAction } from '../actions/actionRegistry';

vi.mock('../actions/actionRegistry', () => ({
  executeAction: vi.fn(),
}));

function Harness() {
  useGlobalKeymap();
  return <input data-testid="typing-target" aria-label="typing target" />;
}

function keydown(init: KeyboardEventInit, target: EventTarget): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

describe('useGlobalKeymap — find.inPath shortcut (D-04 / T-46.1-05)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Ctrl+Shift+F (key F) dispatches find.inPath and prevents default while typing in an input', () => {
    render(<Harness />);
    const input = screen.getByTestId('typing-target');
    input.focus();

    const event = keydown({ key: 'F', ctrlKey: true, shiftKey: true }, input);

    expect(event.defaultPrevented).toBe(true);
    expect(executeAction).toHaveBeenCalledWith('find.inPath');
  });

  it('Cmd+Shift+F (key f, metaKey) dispatches find.inPath and prevents default', () => {
    render(<Harness />);
    const input = screen.getByTestId('typing-target');
    input.focus();

    const event = keydown({ key: 'f', metaKey: true, shiftKey: true }, input);

    expect(event.defaultPrevented).toBe(true);
    expect(executeAction).toHaveBeenCalledWith('find.inPath');
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

    expect(executeAction).toHaveBeenCalledWith('search.everywhere');
  });
});
