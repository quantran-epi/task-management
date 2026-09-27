import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import {
  AriaLiveRegion,
  announceToScreenReader,
} from '../../../src/components/common/AriaLiveRegion';

describe('AriaLiveRegion', () => {
  it('renders with role="status", aria-live="polite", and aria-atomic="true"', () => {
    render(<AriaLiveRegion />);
    const region = screen.getByRole('status');
    expect(region).toBeInTheDocument();
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveAttribute('aria-atomic', 'true');
    expect(region).toHaveTextContent('');
  });

  it('updates text content when announceToScreenReader is called', () => {
    render(<AriaLiveRegion />);
    const region = screen.getByRole('status');

    act(() => {
      announceToScreenReader('Đang tạo tệp sao lưu...');
    });

    expect(region).toHaveTextContent('Đang tạo tệp sao lưu...');

    act(() => {
      announceToScreenReader('Đã xuất bản sao lưu thành công.');
    });

    expect(region).toHaveTextContent('Đã xuất bản sao lưu thành công.');
  });
});
