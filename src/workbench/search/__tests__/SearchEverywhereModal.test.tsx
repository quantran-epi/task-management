import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SearchEverywhereModal } from '../SearchEverywhereModal';
import { useLayoutStore } from '../../store/layoutStore';
import { registerAction, clearCustomActions, initStandardActions } from '../../actions/actionRegistry';

describe('SearchEverywhereModal', () => {
  const mockDb = {
    tasks: {
      toArray: vi.fn().mockResolvedValue([
        { id: 't1', name: 'Implement Auth Flow', title: 'Implement Auth Flow', status: 'in_progress' },
        { id: 't2', name: 'Write Unit Tests', title: 'Write Unit Tests', status: 'todo' },
      ]),
    },
    changeRequests: {
      toArray: vi.fn().mockResolvedValue([
        { id: 'c1', name: 'Mobile App', code: 'CR-2026-001', status: 'In Progress' },
      ]),
    },
    systems: {
      toArray: vi.fn().mockResolvedValue([
        { id: 's1', name: 'Core Service', code: 'CORE_SVC', type: 'SERVICE' },
      ]),
    },
    notes: {
      toArray: vi.fn().mockResolvedValue([
        { id: 'n1', title: 'Architecture RFC' },
      ]),
    },
  } as any;

  beforeEach(() => {
    clearCustomActions();
    initStandardActions();
    useLayoutStore.getState().resetLayout();
  });

  it('renders nothing when open is false', () => {
    render(<SearchEverywhereModal open={false} onClose={vi.fn()} db={mockDb} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders dialog, input, and tabs when open is true', () => {
    render(<SearchEverywhereModal open={true} onClose={vi.fn()} db={mockDb} />);
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByPlaceholderText("Search everywhere, or type '>' for actions...")).toBeDefined();
    expect(screen.getByRole('tab', { name: 'All' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Tasks' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'CR' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Docs' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Systems' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Actions' })).toBeDefined();
  });

  it('switches tabs on Tab key press', () => {
    render(<SearchEverywhereModal open={true} onClose={vi.fn()} db={mockDb} />);
    const input = screen.getByPlaceholderText("Search everywhere, or type '>' for actions...");

    expect(screen.getByRole('tab', { name: 'All' }).getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(input, { key: 'Tab' });
    expect(screen.getByRole('tab', { name: 'Tasks' }).getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(input, { key: 'Tab' });
    expect(screen.getByRole('tab', { name: 'CR' }).getAttribute('aria-selected')).toBe('true');
  });

  it('calls onClose on Escape key press', () => {
    const onClose = vi.fn();
    render(<SearchEverywhereModal open={true} onClose={onClose} db={mockDb} />);
    const input = screen.getByPlaceholderText("Search everywhere, or type '>' for actions...");

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('filters actions when query starts with >', () => {
    render(<SearchEverywhereModal open={true} onClose={vi.fn()} db={mockDb} />);
    const input = screen.getByPlaceholderText("Search everywhere, or type '>' for actions...");

    fireEvent.change(input, { target: { value: '> New Task' } });

    expect(screen.getByText('New Task')).toBeDefined();
  });

  it('executes action on Enter key', () => {
    const onClose = vi.fn();
    const mockPerform = vi.fn();

    registerAction({
      id: 'test.run',
      title: 'Run Specific Test',
      category: 'Test',
      perform: mockPerform,
    });

    render(<SearchEverywhereModal open={true} onClose={onClose} db={mockDb} />);
    const input = screen.getByPlaceholderText("Search everywhere, or type '>' for actions...");

    fireEvent.change(input, { target: { value: '> Run Specific' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(mockPerform).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
