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
      const search = input.closest('.ant-input-affix-wrapper') as HTMLElement;
      const wrapper = search.parentElement as HTMLElement;

      expect(wrapper.style.maxWidth).toBe('100%');
      expect(wrapper.style.boxSizing).toBe('border-box');
      expect(search.style.width).toBe('100%');
      // AntD 6 sets max-width/border-box on the shared control class, not inline.
      expect(search.className).toContain('css-var-root');
      expect(wrapper.style.maxWidth).toBe('100%');

      fireEvent.change(input, { target: { value: 'json' } });
      expect(screen.getByRole('button', { name: 'Open JSON Formatter' })).toBeDefined();
      expect(screen.queryByRole('button', { name: 'Open XML Formatter' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Open Text Compare' })).toBeNull();
    } finally {
      container.remove();
    }
  });

  it('shows curly-bracket icon for JSON Formatter and no file-text icon', () => {
    render(<ToolExplorerPanel />);
    const jsonButton = screen.getByRole('button', { name: 'Open JSON Formatter' });

    const bracket = Array.from(jsonButton.querySelectorAll('span')).find(
      (span) => span.textContent === '{}'
    );
    expect(bracket).toBeDefined();
    expect(bracket?.style.color).toContain('var(--accent');
    expect(jsonButton.querySelector('.anticon-file-text')).toBeNull();
  });

  it('groups tools into five categories and filters new tools by search', () => {
    render(<ToolExplorerPanel />);
    for (const category of ['Format & Transform', 'Encode & Decode', 'Developer Utilities', 'Date & Time', 'Crypto & Tokens']) {
      expect(screen.getByText(category)).toBeDefined();
    }
    expect(screen.getByRole('button', { name: 'Open JWT Decoder' })).toBeDefined();

    fireEvent.change(screen.getByPlaceholderText('Tìm công cụ...'), { target: { value: 'jwt' } });
    expect(screen.getByRole('button', { name: 'Open JWT Decoder' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Open JSON Formatter' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open Regex Tester' })).toBeNull();
  });
});
