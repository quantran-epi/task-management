import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ToolExplorerPanel } from '../toolwindows/ToolExplorerPanel';

describe('ToolExplorerPanel', () => {
  it('keeps the search box inside a narrow container and still filters tools', () => {
    const container = document.createElement('div');
    container.style.width = '220px';
    document.body.appendChild(container);

    try {
      render(<ToolExplorerPanel />, { container });
      const input = screen.getByPlaceholderText('Tìm công cụ...') as HTMLInputElement;
      const search = input.closest('.ant-input-search') as HTMLElement;
      const wrapper = search.parentElement as HTMLElement;

      expect(wrapper.style.maxWidth).toBe('100%');
      expect(wrapper.style.boxSizing).toBe('border-box');
      expect(search.style.width).toBe('100%');
      expect(search.style.maxWidth).toBe('100%');
      expect(search.style.boxSizing).toBe('border-box');

      fireEvent.change(input, { target: { value: 'json' } });
      expect(screen.getByRole('button', { name: 'Open JSON Formatter' })).toBeDefined();
      expect(screen.queryByRole('button', { name: 'Open XML Formatter' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Open Text Compare' })).toBeNull();
    } finally {
      container.remove();
    }
  });
});
