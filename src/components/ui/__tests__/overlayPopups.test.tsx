import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { Dropdown, DropdownButton } from '../dropdown';
import { Tooltip } from '../tooltip';
import { Popover, WIDTH_SCALE } from '../popover';

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  expect(errorSpy).not.toHaveBeenCalled();
  errorSpy.mockRestore();
});

function anchor(label = 'Mở'): ReactElement {
  return <button type="button">{label}</button>;
}

function installedPopup(): HTMLElement | null {
  return document.body.querySelector('[data-positioned]');
}

function stubRect(rect: Partial<DOMRect>) {
  Element.prototype.getBoundingClientRect = () => ({
    x: 0, y: 0, width: 180, height: 28, top: 0, left: 0, right: 180, bottom: 28,
    ...rect,
    toJSON: () => ({}),
  }) as DOMRect;
}

const originalRect = Element.prototype.getBoundingClientRect;
afterEach(() => {
  Element.prototype.getBoundingClientRect = originalRect;
});

describe('native popup placement contract', () => {
  it('uses BODY portal, fixed position, 4px offset and flips near viewport bottom', () => {
    stubRect({ left: 100, top: window.innerHeight - 60, bottom: window.innerHeight - 32, right: 280 });
    const view = render(<Popover trigger={['click']} title="Tiêu đề" content="Nội dung">{anchor()}</Popover>);
    fireEvent.click(view.getByText('Mở'));
    const popup = installedPopup() as HTMLElement;
    expect(popup.parentElement).toBe(document.body);
    expect(popup.style.position).toBe('fixed');
    // popup offset 4 from the anchor rect, clamped so the whole popup stays in
    // the viewport (flip when there is room above, shift otherwise).
    const top = Number.parseFloat(popup.style.top);
    expect(top).toBeGreaterThanOrEqual(6);
    expect(top + popup.offsetHeight).toBeLessThanOrEqual(window.innerHeight - 6);
    expect(Math.abs(top - (window.innerHeight - 32 + 4))).toBeLessThan(6);
    view.unmount();
  });

  it('shifts a popup anchored past the right viewport edge', () => {
    stubRect({ left: window.innerWidth - 40, right: window.innerWidth + 140 });
    const view = render(<Popover trigger={['click']} content="Nội dung">{anchor()}</Popover>);
    fireEvent.click(view.getByText('Mở'));
    const popup = installedPopup() as HTMLElement;
    expect(Number.parseFloat(popup.style.left)).toBeLessThanOrEqual(window.innerWidth - 6);
    view.unmount();
  });

  it('closes on outside pointer and Escape and restores anchor focus', () => {
    const view = render(<Popover trigger={['click']} content="Nội dung">{anchor()}</Popover>);
    const trigger = view.getByText('Mở');
    const anchorNode = trigger.parentElement as HTMLElement;
    anchorNode.tabIndex = 0;
    anchorNode.focus();
    fireEvent.click(trigger);
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    fireEvent.pointerDown(outside);
    expect(installedPopup()).toBeNull();
    expect(document.activeElement).toBe(anchorNode);
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(installedPopup()).toBeNull();
    expect(document.activeElement).toBe(anchorNode);
    outside.remove();
    view.unmount();
  });

  it('lets only the topmost popup handle Escape', () => {
    const outer = vi.fn();
    const inner = vi.fn();
    const view = render(
      <>
        <Popover open onOpenChange={outer} content="Ngoài">{anchor('Ngoài')}</Popover>
        <Popover open onOpenChange={inner} content="Trong">{anchor('Trong')}</Popover>
      </>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(inner).toHaveBeenCalledWith(false);
    expect(outer).not.toHaveBeenCalled();
    view.unmount();
  });
});

describe('S-TT native tooltip', () => {
  it('opens only for non-empty title after the default delay', () => {
    vi.useFakeTimers();
    try {
      const view = render(<Tooltip title="Gợi ý">{anchor()}</Tooltip>);
      fireEvent.mouseEnter(view.getByText('Mở'));
      expect(installedPopup()).toBeNull();
      act(() => { vi.advanceTimersByTime(150); });
      const popup = installedPopup() as HTMLElement;
      expect(popup.getAttribute('data-oi-control')).toBe('tooltip');
      expect(popup.parentElement).toBe(document.body);
      expect(popup.querySelector('[data-placed]')?.className).toContain('text');
      view.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps empty title closed and caller overlayStyle winning', () => {
    vi.useFakeTimers();
    try {
      const view = render(<Tooltip title="">{anchor()}</Tooltip>);
      fireEvent.mouseEnter(view.getByText('Mở'));
      act(() => { vi.advanceTimersByTime(1000); });
      expect(installedPopup()).toBeNull();
      view.unmount();
      const styled = render(<Tooltip title="Gợiý" overlayStyle={{ maxWidth: '321px' }}>{anchor()}</Tooltip>);
      fireEvent.focus(styled.getByText('Mở'));
      act(() => { vi.advanceTimersByTime(150); });
      const popup = installedPopup() as HTMLElement;
      expect(popup.textContent).toContain('Gợiý');
      expect((popup.querySelector('[data-placed]') as HTMLElement).style.maxWidth).toBe('321px');
      styled.unmount();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('S-MNU/Dropdown native popup', () => {
  it('opens on click and contextMenu, calls item onClick with a live native event', () => {
    const onClick = vi.fn();
    const view = render(
      <Dropdown trigger={['click']} menu={{ items: [{ key: 'edit', label: 'Sửa', onClick }, { type: 'divider' }] }}>
        {anchor()}
      </Dropdown>,
    );
    fireEvent.click(view.getByText('Mở'));
    const item = Array.from(document.querySelectorAll('[data-oi-control="menu-item"]'))
      .find((node) => node.textContent === 'Sửa') as HTMLElement;
    expect(item).toBeDefined();
    expect(document.querySelector('[data-oi-control="menu-divider"]')).not.toBeNull();
    fireEvent.click(item);
    expect(onClick).toHaveBeenCalledTimes(1);
    const info = onClick.mock.calls[0]![0];
    expect(info.key).toBe('edit');
    expect(typeof info.stopPropagation).toBe('function');
    expect(info.nativeEvent).toBeDefined();
    expect(() => info.stopPropagation()).not.toThrow();
    view.unmount();

    const context = render(
      <Dropdown trigger={['contextMenu']} menu={{ items: [{ key: 'open', label: 'Mở' }] }}>
        {anchor('Danh mục')}
      </Dropdown>,
    );
    fireEvent.contextMenu(context.getByText('Danh mục'));
    expect(installedPopup()).not.toBeNull();
    context.unmount();
  });

  it('keeps DropdownButton self-built and widths scaled', () => {
    expect(typeof DropdownButton).toBe('function');
    expect(WIDTH_SCALE).toEqual({ md: 18, lg: 28 });
  });
});
