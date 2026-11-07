import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { SdlcWorkspace, SDLC_CHAT_WIDTH_KEY } from '../../../src/components/sdlc/SdlcWorkspace';

vi.mock('../../../src/components/sdlc/chat/StepChatPanel', () => ({
  StepChatPanel: ({ stepId }: { stepId: string }) => <div data-testid="mock-step-chat">{stepId}</div>,
}));

describe('SdlcWorkspace chat width', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const renderWorkspace = () =>
    render(
      <SdlcWorkspace
        projectId="project-1"
        crId="cr-1"
        selectedStep="INTAKE"
        stepViewNode={<div>step content</div>}
      />
    );

  it('starts at the default width and keeps the splitter accessible', () => {
    renderWorkspace();

    expect(screen.getByTestId('sdlc-chat-pane')).toHaveStyle({ width: '380px', flex: '0 0 380px' });
    expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '380');
  });

  it('clamps pointer, keyboard, and reset changes to the supported bounds', () => {
    renderWorkspace();
    const splitter = screen.getByRole('separator');
    splitter.setPointerCapture = vi.fn();
    splitter.releasePointerCapture = vi.fn();

    fireEvent.pointerDown(splitter, { button: 0, clientX: 500, pointerId: 1 });
    fireEvent(window, new PointerEvent('pointermove', { clientX: 0, pointerId: 1 }));
    expect(screen.getByTestId('sdlc-chat-pane')).toHaveStyle({ width: '480px' });

    fireEvent.keyDown(splitter, { key: 'Home' });
    expect(screen.getByTestId('sdlc-chat-pane')).toHaveStyle({ width: '320px' });
    fireEvent.keyDown(splitter, { key: 'End' });
    expect(screen.getByTestId('sdlc-chat-pane')).toHaveStyle({ width: '480px' });
    fireEvent.doubleClick(splitter);
    expect(screen.getByTestId('sdlc-chat-pane')).toHaveStyle({ width: '380px' });
  });

  it('persists the exact device-level preference and reuses clamped values on remount', () => {
    const first = renderWorkspace();
    const splitter = screen.getByRole('separator');
    fireEvent.keyDown(splitter, { key: 'ArrowLeft' });
    expect(localStorage.getItem(SDLC_CHAT_WIDTH_KEY)).toBe('396');
    first.unmount();

    renderWorkspace();
    expect(screen.getByTestId('sdlc-chat-pane')).toHaveStyle({ width: '396px' });

    localStorage.setItem(SDLC_CHAT_WIDTH_KEY, '9999');
    screen.getByRole('separator').focus();
    cleanup();
    renderWorkspace();
    expect(screen.getByTestId('sdlc-chat-pane')).toHaveStyle({ width: '480px' });
    expect(localStorage.getItem(SDLC_CHAT_WIDTH_KEY)).toBe('9999');

    fireEvent.doubleClick(screen.getByRole('separator'));
    expect(localStorage.getItem(SDLC_CHAT_WIDTH_KEY)).toBe('380');
  });

  it('falls back to the default for malformed stored width', () => {
    localStorage.setItem(SDLC_CHAT_WIDTH_KEY, 'not-a-width');
    renderWorkspace();

    expect(screen.getByTestId('sdlc-chat-pane')).toHaveStyle({ width: '380px' });
  });
});
