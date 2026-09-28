import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NotificationBell } from '../../../src/components/notifications/NotificationBell';

describe('NotificationBell', () => {
  it('renders bell icon and hides count badge when count is 0', () => {
    const handleClick = vi.fn();
    render(<NotificationBell count={0} onClick={handleClick} />);

    const button = screen.getByRole('button', { name: /thông báo/i });
    expect(button).toBeDefined();

    // Badge should not display count 0
    expect(screen.queryByText('0')).toBeNull();
  });

  it('renders active red badge with exact count when count > 0', () => {
    const handleClick = vi.fn();
    render(<NotificationBell count={5} onClick={handleClick} />);

    expect(screen.getByText('5')).toBeDefined();
    const button = screen.getByRole('button', { name: /5 cảnh báo/i });
    expect(button).toBeDefined();

    fireEvent.click(button);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('caps count display at overflowCount 99', () => {
    render(<NotificationBell count={120} onClick={vi.fn()} />);

    expect(screen.getByText('99+')).toBeDefined();
  });
});
