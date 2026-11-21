import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { Dropdown, DropdownButton } from '../dropdown';
import { Tooltip } from '../tooltip';
import { Popover, WIDTH_SCALE } from '../popover';
import { Popconfirm } from '../popconfirm';
import { AutoComplete, AutoCompleteOption } from '../auto-complete';
import { TreeSelect, TreeSelectNode, TreeSelectSHOW_ALL, TreeSelectSHOW_CHILD, TreeSelectSHOW_PARENT } from '../tree-select';
import { DatePicker, DateRangePicker } from '../date-picker';
import dayjs from 'dayjs';

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

describe('Popconfirm native confirm bubble', () => {
  it('keeps Vietnamese copy, danger tone and live native event payload', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const view = render(
      <Popconfirm open tone="danger" title="Xóa?" onConfirm={onConfirm} onCancel={onCancel}>
        {anchor('Xóa')}
      </Popconfirm>,
    );
    const ok = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Xác nhận')!;
    const cancel = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Hủy')!;
    expect(ok.className).toContain('danger');
    expect(ok.style.getPropertyValue('--ui-status-color')).not.toBe('');
    const info = { nativeEvent: undefined as unknown };
    ok.addEventListener('click', (event) => { info.nativeEvent = event; });
    fireEvent.click(ok);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    const payload = onConfirm.mock.calls[0]![0];
    expect(typeof payload.stopPropagation).toBe('function');
    expect(payload.key).toBeUndefined();
    expect(payload.domEvent).toBeDefined();
    expect(() => payload.preventDefault()).not.toThrow();
    fireEvent.click(cancel);
    expect(onCancel).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it('calls onCancel on Escape and restores the trigger anchor', () => {
    const onCancel = vi.fn();
    const view = render(
      <Popconfirm title="Chắc chứ?" onCancel={onCancel}>
        {anchor('Xóa')}
      </Popconfirm>,
    );
    const trigger = view.getByText('Xóa');
    fireEvent.click(trigger);
    const anchorNode = trigger.parentElement as HTMLElement;
    anchorNode.tabIndex = 0;
    anchorNode.focus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
    expect(document.activeElement).toBe(anchorNode);
    view.unmount();
  });
});

describe('S-SEL native AutoComplete', () => {
  it('moves ArrowDown lead without resetting and commits onChange/onSelect payloads', () => {
    const onChange = vi.fn();
    const onSelect = vi.fn();
    const view = render(
      <AutoComplete
        options={[{ value: 'a1', label: 'Alpha one' }, { value: 'a2', label: 'Alpha two' }, { value: 'b1', label: 'Beta' }]}
        onChange={onChange}
        onSelect={onSelect}
      />,
    );
    const input = view.container.querySelector('input')!;
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    const rows = document.querySelectorAll('[data-oi-control="list-row"]');
    expect(rows.length).toBe(3);
    const lead = document.querySelector('[data-lead]') as HTMLElement;
    expect(lead.textContent).toBe('Beta');
    expect(lead.style.height).toBe('24px');
    expect(input.getAttribute('aria-activedescendant')).toBe(lead.id);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('b1', expect.objectContaining({ value: 'b1' }));
    expect(onSelect).toHaveBeenCalledWith('b1', expect.objectContaining({ value: 'b1' }));
    view.unmount();
  });

  it('keeps caller styles.root, disabled suppression and self-built option static', () => {
    expect(typeof AutoCompleteOption).toBe('function');
    const view = render(<AutoComplete disabled styles={{ root: { maxWidth: '222px' } }} options={[{ value: 'a' }]} />);
    const input = view.container.querySelector('input') as HTMLInputElement;
    expect(input.disabled).toBe(true);
    expect(input.style.maxWidth).toBe('222px');
    fireEvent.focus(input);
    expect(installedPopup()).toBeNull();
    view.unmount();
  });
});

describe('S-SEL/S-TR native TreeSelect', () => {
  it('keeps wrapper-defined SHOW_* statics and emits checked keys with SHOW_CHILD', () => {
    const onChange = vi.fn();
    const view = render(
      <TreeSelect
        treeCheckable
        showCheckedStrategy={TreeSelectSHOW_CHILD}
        treeDefaultExpandAll
        treeData={[
          { key: 'root', title: 'Root', value: 'root', children: [
            { key: 'child', title: 'Child', value: 'child' },
          ] },
        ]}
        value={['root', 'child']}
        onChange={onChange}
      />,
    );
    expect(TreeSelectSHOW_ALL).toBe('SHOW_ALL');
    expect(TreeSelectSHOW_CHILD).toBe('SHOW_CHILD');
    expect(TreeSelectSHOW_PARENT).toBe('SHOW_PARENT');
    expect(typeof TreeSelectNode).toBe('function');
    const trigger = view.container.querySelector('[data-oi-control="tree-select"]') as HTMLInputElement;
    fireEvent.click(trigger);
    const checkbox = document.querySelector('input[data-oi-control="checkbox"]') as HTMLInputElement;
    expect(checkbox).not.toBeNull();
    fireEvent.click(checkbox);
    expect(onChange).toHaveBeenCalled();
    const value = onChange.mock.calls.at(-1)![0];
    expect(Array.isArray(value)).toBe(true);
    expect(value).not.toContain('root');
    view.unmount();
  });
});

describe('N-08 native DatePicker', () => {
  it('uses select-popup hook, blocks disabled dates and emits a Dayjs tuple for ranges', () => {
    const onChange = vi.fn();
    const view = render(
      <DateRangePicker
        value={[dayjs('2026-01-05'), dayjs('2026-01-07')]}
        onChange={onChange}
        disabledDate={(date) => date.date() === 6}
      />,
    );
    const inputs = view.container.querySelectorAll('[data-oi-control="date-picker"]');
    expect(inputs).toHaveLength(2);
    fireEvent.click(inputs[0]!);
    const popup = document.querySelector('[data-oi-control="select-popup"]') as HTMLElement;
    expect(popup).not.toBeNull();
    expect(popup.parentElement).toBe(document.body);
    expect(popup.style.position).toBe('fixed');
    const disabled = Array.from(popup.querySelectorAll('[aria-disabled="true"]')) as HTMLElement[];
    expect(disabled.length).toBeGreaterThan(0);
    const cells = Array.from(popup.querySelectorAll('[data-oi-control="list-row"]')) as HTMLElement[];
    const selectable = cells.find((cell) => cell.textContent === '5')!;
    fireEvent.click(selectable);
    expect(onChange).toHaveBeenCalledTimes(1);
    const [dates, strings] = onChange.mock.calls[0]!;
    expect(Array.isArray(dates)).toBe(true);
    expect(dates[0]).toBeInstanceOf(Object);
    expect(strings).toHaveLength(2);
    expect(typeof strings[0]).toBe('string');
    view.unmount();
  });

  it('keeps the single-value Dayjs signature and full-width default', () => {
    const onChange = vi.fn();
    const view = render(<DatePicker value={dayjs('2026-01-05')} onChange={onChange} />);
    const input = view.container.querySelector('[data-oi-control="date-picker"]') as HTMLInputElement;
    expect(input.value).toBe('2026-01-05');
    expect(input.style.width).toBe('100%');
    fireEvent.click(input);
    const popup = document.querySelector('[data-oi-control="select-popup"]') as HTMLElement;
    expect(popup).not.toBeNull();
    const cell = Array.from(popup.querySelectorAll('[data-oi-control="list-row"]'))
      .find((node) => node.textContent === '5') as HTMLElement;
    fireEvent.click(cell);
    expect(onChange).toHaveBeenCalledWith(expect.anything(), expect.any(String));
    expect(onChange.mock.calls[0]![1]).toBe('2026-01-05');
    view.unmount();
  });
});

describe('controlled value regressions', () => {
  it('lets a controlled AutoComplete keep a typed draft for custom values', () => {
    const onChange = vi.fn();
    const view = render(<AutoComplete value="" onChange={onChange} options={[{ value: 'a1', label: 'Alpha' }]} />);
    const input = view.container.querySelector('input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'flux-dev' } });
    expect(input.value).toBe('flux-dev');
    expect(onChange).toHaveBeenCalledWith('flux-dev', expect.objectContaining({ value: 'flux-dev' }));
    view.unmount();
  });

  it('syncs DatePicker display when value changes externally', () => {
    const view = render(<DatePicker value={dayjs('2026-01-05')} />);
    view.rerender(<DatePicker value={dayjs('2026-02-09')} />);
    const input = view.container.querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('2026-02-09');
    view.unmount();
  });
});
