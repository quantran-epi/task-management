import { describe, it, expect, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { Button, theme } from 'antd';
import { AntdThemeAdapter } from '../AntdThemeAdapter';
import { getAntdTheme, lightTokens } from '../../styles/tokens';
import { THEME_MODE_EVENT } from '../themeBroadcast';
import '../../styles/workbench-tokens.css';

const tauri = vi.hoisted(() => {
  let handler: ((event: { payload: unknown }) => void) | null = null;
  const emitTo = vi.fn(async () => {});
  const listen = vi.fn(async (_event: string, next: (event: { payload: unknown }) => void) => {
    handler = next;
    return () => { if (handler === next) handler = null; };
  });
  return { emitTo, listen, handler: () => handler };
});

vi.mock('@tauri-apps/api/event', () => ({ emitTo: tauri.emitTo, listen: tauri.listen }));

function TokenConsumer() {
  const { token } = theme.useToken();
  return (
    <div data-testid="token-consumer">
      <span data-testid="color-primary">{token.colorPrimary}</span>
      <span data-testid="color-bg">{token.colorBgBase}</span>
      <span data-testid="border-radius">{token.borderRadius}</span>
      <span data-testid="font-size">{token.fontSize}</span>
      <span data-testid="control-height">{token.controlHeight}</span>
    </div>
  );
}

describe('AntdThemeAdapter', () => {
  it('renders children with compact light tokens', () => {
    render(
      <AntdThemeAdapter>
        <TokenConsumer />
        <Button>Test Button</Button>
      </AntdThemeAdapter>
    );

    expect(screen.getByTestId('color-primary').textContent).toBe('#2f62d8');
    expect(screen.getByTestId('border-radius').textContent).toBe('4');
    // compactAlgorithm resolves the 13px/30px seeds down to 10px/26px (measured
    // from getDesignToken with defaultAlgorithm + compactAlgorithm).
    expect(screen.getByTestId('font-size').textContent).toBe('10');
    expect(screen.getByTestId('control-height').textContent).toBe('26');
    expect(screen.getByText('Test Button')).toBeInTheDocument();
  });

  it('aligns data-theme and Antd surface tokens with the OS dark preference (IN-01)', () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query.includes('prefers-color-scheme: dark'),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
    try {
      const { container, unmount } = render(
        <AntdThemeAdapter>
          <TokenConsumer />
        </AntdThemeAdapter>
      );
      expect(container.querySelector('[data-theme="dark"]')).not.toBeNull();
      // IN-01: dark palette mirrors workbench-tokens.css dark block, not the light values.
      expect(screen.getByTestId('color-bg').textContent).toBe('#11151d');
      // Dark algorithm derives the resolved primary from the dark seed (#6a9bff), so it differs
      // from the light seed. The source-level visualTokens gate guards the literal #2f62d8.
      expect(screen.getByTestId('color-primary').textContent).not.toBe('#2f62d8');
      unmount();
    } finally {
      window.matchMedia = original;
    }
  });

  it('injects the matching accent CSS variable on the theme wrapper', () => {
    const { container, unmount } = render(
      <AntdThemeAdapter><div /></AntdThemeAdapter>
    );
    const wrapper = container.querySelector('.taskmate-workbench-theme') as HTMLElement;
    expect(wrapper.style.getPropertyValue('--accent')).toBe(getAntdTheme('light').token?.colorPrimary);
    unmount();
  });

  it('writes the palette to the document root so portaled content inherits it (CR-02)', () => {
    const { unmount } = render(<AntdThemeAdapter><div /></AntdThemeAdapter>);
    const root = document.documentElement;
    expect(root.style.getPropertyValue('--bg-island')).toBe(lightTokens.css['--bg-island']);
    expect(root.style.getPropertyValue('--border-strong')).toBe(lightTokens.css['--border-strong']);
    expect(root.style.getPropertyValue('--font-ui')).toBe(lightTokens.css['--font-ui']);
    expect(root.style.colorScheme).toBe('light');
    // Simulated portal appended straight to <body>: the variable is available from :root.
    const portal = document.createElement('div');
    document.body.appendChild(portal);
    expect(getComputedStyle(portal).getPropertyValue('--bg-island').trim()).toBe(lightTokens.css['--bg-island']);
    portal.remove();
    unmount();
  });

  it('re-renders a popout AntdThemeAdapter on a received valid mode without reload', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      value: { invoke: async () => undefined, transformCallback: () => 0 },
      configurable: true,
    });
    window.localStorage.clear();
    tauri.emitTo.mockClear();
    tauri.listen.mockClear();
    try {
      const { container, unmount } = render(
        <AntdThemeAdapter><div /></AntdThemeAdapter>
      );
      const wrapper = container.querySelector('.taskmate-workbench-theme') as HTMLElement;
      expect(wrapper.getAttribute('data-theme')).toBe('light');
      expect(wrapper.style.getPropertyValue('--accent')).toBe('#2f62d8');

      await waitFor(() => expect(tauri.listen).toHaveBeenCalledWith(THEME_MODE_EVENT, expect.any(Function)));
      act(() => { tauri.handler()!({ payload: { mode: 'dark' } }); });

      expect(wrapper.getAttribute('data-theme')).toBe('dark');
      expect(wrapper.style.getPropertyValue('--accent')).toBe('#6a9bff');
      expect(tauri.emitTo).not.toHaveBeenCalled();
      expect(window.localStorage.getItem('taskmate_theme')).toBeNull();
      unmount();
    } finally {
      Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
    }
  });
});
