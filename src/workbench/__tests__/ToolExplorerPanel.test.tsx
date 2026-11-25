import { render, screen, fireEvent } from '@testing-library/react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { ToolExplorerPanel } from '../toolwindows/ToolExplorerPanel';
import { useLayoutStore } from '../store/layoutStore';

afterEach(() => {
  vi.unstubAllGlobals();
  useLayoutStore.getState().resetLayout();
});

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

  it('opens two independent tabs when the same utility tool is clicked twice', () => {
    const uuids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
    const randomUUID = vi.fn().mockReturnValueOnce(uuids[0]).mockReturnValueOnce(uuids[1]);
    vi.stubGlobal('crypto', { ...globalThis.crypto, randomUUID });

    render(<ToolExplorerPanel />);
    const button = screen.getByRole('button', { name: 'Open JSON Formatter' });
    fireEvent.click(button);
    fireEvent.click(button);

    const tabs = useLayoutStore.getState().openTabs.filter((t) => t.viewType === 'json_formatter');
    expect(tabs).toHaveLength(2);
    expect(tabs.map((t) => t.id)).toEqual([`utility-${uuids[0]}`, `utility-${uuids[1]}`]);
    expect(randomUUID).toHaveBeenCalledTimes(2);
    expect(useLayoutStore.getState().activeTabId).toBe(`utility-${uuids[1]}`);
  });
});
