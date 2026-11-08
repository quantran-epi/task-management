import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ActiveAiTurnIndicator } from '../../src/components/ai/ActiveAiTurnIndicator';
import { aiTurnManager } from '../../src/services/ai/aiTurnManager';

describe('ActiveAiTurnIndicator', () => {
  beforeEach(() => {
    aiTurnManager.abortAll();
  });

  it('renders nothing when no turns are active', () => {
    const { container } = render(<ActiveAiTurnIndicator />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a single active turn capsule with spinner, title, and abort button', () => {
    const abortFn = vi.fn();
    act(() => {
      aiTurnManager.registerTurn({
        id: 'turn-1',
        scopeKey: 'global',
        title: 'Tra cứu tài liệu',
        status: 'streaming',
        streamingStatusLabel: 'Đang phản hồi...',
        abort: abortFn,
      });
    });

    render(<ActiveAiTurnIndicator />);

    const capsule = screen.getByTestId('active-ai-turn-capsule');
    expect(capsule).toBeInTheDocument();
    expect(screen.getByText('Tra cứu tài liệu')).toBeInTheDocument();
    expect(screen.getByTestId('ai-turn-spinner')).toBeInTheDocument();

    const abortBtn = screen.getByTestId('abort-ai-turn-btn');
    expect(abortBtn).toBeInTheDocument();

    fireEvent.click(abortBtn);
    expect(abortFn).toHaveBeenCalledTimes(1);
  });

  it('renders multi-capsule badge when multiple turns are active', () => {
    act(() => {
      aiTurnManager.registerTurn({
        id: 'turn-1',
        scopeKey: 'global',
        title: 'Task 1',
        status: 'streaming',
        streamingStatusLabel: 'Đang phản hồi',
        abort: vi.fn(),
      });
      aiTurnManager.registerTurn({
        id: 'turn-2',
        scopeKey: 'sdlc:intake',
        title: 'Task 2',
        status: 'tool',
        streamingStatusLabel: 'Truy xuất',
        abort: vi.fn(),
      });
    });

    render(<ActiveAiTurnIndicator />);

    const multiCapsule = screen.getByTestId('active-ai-turns-multi-capsule');
    expect(multiCapsule).toBeInTheDocument();
    expect(screen.getByText('2 tiến trình AI')).toBeInTheDocument();
  });
});
