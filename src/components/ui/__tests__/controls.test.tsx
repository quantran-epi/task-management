import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigProvider } from 'antd';
import { AntdThemeAdapter } from '../../../workbench/AntdThemeAdapter';
import { THEME_STORAGE_KEY } from '../../../workbench/themeBroadcast';
import { getAntdTheme, statusColorMap, type ThemeMode } from '../../../styles/tokens';
import { StatusTag } from '../tag';
import { Badge } from '../badge';
import { StatusDot } from '../status-dot';
import { Input } from '../input';
import { Textarea, DEFAULT_TEXTAREA_MIN_ROWS } from '../textarea';
import { Select } from '../select';
import { InputNumber } from '../input-number';
import { Modal, getOverlayWidth, useTaskMateModal } from '../modal';
import { Drawer } from '../drawer';
import { Popconfirm } from '../popconfirm';
import { ThemeAppHolder, useMessage } from '../message';
import { useNotification } from '../notification';
import { getSharedControlTokens, type StatusKind } from '../tokens.contract';
import { CheckCircleFilled } from '../icon';
import { Spin } from '../spin';
import { Form } from '../form';

vi.mock('@tauri-apps/api/event', () => ({
  emitTo: vi.fn(async () => {}),
  listen: vi.fn(async () => () => {}),
}));

const metrics = getSharedControlTokens();
const modes = ['light', 'dark'] as const;

beforeEach(() => {
  window.localStorage.clear();
});

function shell(mode: (typeof modes)[number], children: React.ReactNode) {
  window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  return render(<AntdThemeAdapter>{children}</AntdThemeAdapter>);
}

describe('input-family policy', () => {
  it.each(modes)('applies shared metrics in %s mode', (mode) => {
    shell(mode, <Input placeholder="Tìm kiếm" />);
    const input = screen.getByPlaceholderText('Tìm kiếm');
    const style = input.getAttribute('style') ?? '';
    expect(style).toContain(`--ui-control-height: ${metrics.controlHeight}px`);
    expect(style).toContain(`--ui-control-radius: ${metrics.borderRadius}px`);
    expect(style).toContain(`--ui-control-font-size: ${metrics.fontSize}px`);
    expect(style).not.toMatch(/(^|;\s*)font-size:/);
    expect(style).toContain('width: 100%');
  });

  it('maps aria-invalid to error status and keeps disabled/value passthrough', () => {
    render(<Input aria-invalid aria-label="Code" value="ABC" disabled onChange={() => {}} />);
    const input = screen.getByLabelText('Code');
    expect(input).toBeDisabled();
    expect(input).toHaveValue('ABC');
    expect(input).toHaveAttribute('data-oi-control', 'input');
    expect(input).toHaveAttribute('data-state', 'invalid');
  });

  it('applies Textarea policy with a token-derived default minRows', () => {
    render(<Textarea placeholder="Ghi chú" />);
    const textarea = screen.getByPlaceholderText('Ghi chú');
    expect(DEFAULT_TEXTAREA_MIN_ROWS).toBeGreaterThanOrEqual(2);
    expect(textarea).toHaveAttribute('data-oi-control', 'input');
  });

  it('keeps Select allowClear default and InputNumber min/max passthrough', () => {
    const { container } = render(
      <>
        <Select options={[{ value: 'a', label: 'A' }]} value="a" onChange={() => {}} />
        <InputNumber min={1} max={9} precision={2} value={2.5} onChange={() => {}} aria-label="Amount" />
      </>,
    );
    expect(container.querySelector('.ant-select-clear')).not.toBeNull();
    expect(screen.getByLabelText('Amount')).toHaveValue('2.50');
  });
});

describe('overlay policy', () => {
  it.each(modes)('applies token-derived width, default footer and close policy in %s mode', (mode) => {
    shell(mode, <Modal open title="Xác nhận" onCancel={() => {}} />);
    const dialog = document.querySelector('.ant-modal') as HTMLElement;
    expect(dialog).not.toBeNull();
    expect(dialog.style.width).toBe(`${getOverlayWidth('md')}px`);
    expect(document.querySelector('.ant-modal-footer')).not.toBeNull();
    expect(document.querySelector('.ant-modal-close')).not.toBeNull();
  });

  it('honours an explicit mask={false} on Modal and Drawer (WR-04)', () => {
    const { unmount } = render(<Modal open title="No mask" mask={false} onCancel={() => {}} />);
    expect(document.querySelector('.ant-modal-mask')).toBeNull();
    unmount();
    render(<Drawer open title="No mask" mask={false} onClose={() => {}} />);
    expect(document.querySelector('.ant-drawer-mask')).toBeNull();
  });

  it('passes a raw CSS width straight through to Drawer (WR-04)', () => {
    // jsdom rejects min()/clamp() in inline styles; calc() proves raw CSS reaches AntD
    // (previously the wrapper coerced it through the numeric size scale).
    const cssWidth = 'calc(100vw - 32px)';
    render(<Drawer open title="Wide" width={cssWidth} onClose={() => {}} />);
    const panel = document.querySelector('.ant-drawer-content-wrapper') as HTMLElement;
    expect(panel.style.width).toBe(cssWidth);
  });

  it('supports silent close and no-footer policies', () => {
    render(<Modal open title="Chỉ đọc" footerPolicy="none" closePolicy="silent" onCancel={() => {}} />);
    expect(document.querySelector('.ant-modal-footer')).toBeNull();
    expect(document.querySelector('.ant-modal-close')).toBeNull();
  });

  it('uses the sm/lg width scale supplied by the contract', () => {
    expect(getOverlayWidth('sm')).toBe(metrics.controlHeight * 10);
    expect(getOverlayWidth('lg')).toBe(metrics.controlHeight * 28);
    const { unmount } = render(<Modal open title="Nhỏ" widthScale="sm" onCancel={() => {}} />);
    expect((document.querySelector('.ant-modal') as HTMLElement).style.width).toBe(`${getOverlayWidth('sm')}px`);
    unmount();
    render(<Drawer open title="Lớn" widthScale="lg" onClose={() => {}} />);
    expect(screen.getByText('Lớn')).toBeInTheDocument();
    expect((document.querySelector('.ant-drawer-content-wrapper') as HTMLElement).style.width).toBe(`${getOverlayWidth('lg')}px`);
  });

  it('gives Popconfirm a shared danger-tone policy', () => {
    const onConfirm = vi.fn();
    render(
      <Popconfirm open tone="danger" title="Xóa?" onConfirm={onConfirm}>
        <button type="button">Xóa</button>
      </Popconfirm>,
    );
    expect(screen.getByText('Xác nhận').closest('button')).toHaveClass('ant-btn-dangerous');
    fireEvent.click(screen.getByText('Xác nhận'));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('exposes imperative APIs from the holder, not static methods', () => {
    function Consumer() {
      const messageApi = useMessage();
      const notificationApi = useNotification();
      const { modal, contextHolder } = useTaskMateModal();
      const notify = () => notificationApi.open({ title: 'thông báo' });
      const showMessage = () => messageApi.success('ok');
      const confirm = () => modal.confirm({ title: 'chắc chứ' });
      return (
        <div>
          <button type="button" onClick={showMessage}>message</button>
          <button type="button" onClick={notify}>notification</button>
          <button type="button" onClick={confirm}>confirm</button>
          {contextHolder}
        </div>
      );
    }
    const { container } = render(
      <ConfigProvider theme={getAntdTheme('dark')}>
        <ThemeAppHolder>
          <Consumer />
        </ThemeAppHolder>
      </ConfigProvider>,
    );
    expect(container.querySelector('.ant-app')).not.toBeNull();
    fireEvent.click(screen.getByText('message'));
    expect(screen.getByText('ok')).toBeInTheDocument();
    fireEvent.click(screen.getByText('notification'));
    expect(screen.getByText('thông báo')).toBeInTheDocument();
    fireEvent.click(screen.getByText('confirm'));
    expect(screen.getAllByText('chắc chứ').length).toBeGreaterThan(1);
  });
});

describe('Form wrapper layout policy', () => {
  function formClass(ui: React.ReactElement): string {
    const { container, unmount } = render(ui);
    const cls = (container.querySelector('form') as HTMLElement | null)?.className ?? '';
    unmount();
    return cls;
  }

  it('uses the labelPolicy default when caller omits layout', () => {
    expect(formClass(<Form labelPolicy="top" />)).toContain('ant-form-vertical');
    expect(formClass(<Form labelPolicy="left" />)).toContain('ant-form-horizontal');
    expect(formClass(<Form labelPolicy="inline" />)).toContain('ant-form-inline');
  });

  it('honours an explicit caller layout over labelPolicy (WR-01)', () => {
    // Regression: GitHubSyncCard passes layout="inline"; the wrapper used to
    // overwrite it with the vertical policy default.
    expect(formClass(<Form layout="inline" />)).toContain('ant-form-inline');
    expect(formClass(<Form labelPolicy="left" layout="inline" />)).toContain('ant-form-inline');
    expect(formClass(<Form labelPolicy="inline" layout="vertical" />)).toContain('ant-form-vertical');
  });
});

describe('status-aware wrappers follow the active mode (WR-01)', () => {
  it.each(modes)('uses the %s accent for Icon tone and Spin accent', (mode) => {
    const { container, unmount } = shell(mode, (
      <div>
        <CheckCircleFilled tone="accent" aria-label="ok" />
        <Spin aria-label="loading" />
      </div>
    ));
    const expected = statusColorMap[mode as ThemeMode].accent;
    const icon = container.querySelector('[aria-label="ok"]') as HTMLElement;
    expect(icon.style.color.replace(/\s/g, '')).toBe(hexToRgb(expected));
    const spin = container.querySelector('.ant-spin') as HTMLElement;
    expect(spin.style.getPropertyValue('--ui-spin-accent').trim()).toBe(expected);
    unmount();
  });

  it.each(modes)('uses the %s danger hex for the Popconfirm danger tone', (mode) => {
    shell(mode, (
      <Popconfirm open tone="danger" title="Xóa?">
        <button type="button">Xóa</button>
      </Popconfirm>
    ));
    const expected = statusColorMap[mode as ThemeMode].danger;
    const ok = screen.getByText('Xác nhận').closest('button') as HTMLElement;
    expect(ok.style.getPropertyValue('--ui-status-color').trim()).toBe(expected);
  });
});

const statuses = Object.keys(statusColorMap.light) as StatusKind[];

/** jsdom keeps custom properties verbatim but normalizes color values to `rgb()`. */
function styleOf(element: Element): CSSStyleDeclaration {
  return (element as HTMLElement).style;
}

function hexToRgb(hex: string): string {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgb(${r},${g},${b})`;
}

describe('D-12 status-map parity across three surfaces', () => {
  it.each(modes)('renders the exact %s hex on StatusTag, Badge and StatusDot', (mode) => {
    const { container } = shell(
      mode,
      <div>
        {statuses.map((status) => (
          <div key={status} data-status={status}>
            <StatusTag status={status}>{status}</StatusTag>
            <Badge status={status} count={status} />
            <StatusDot status={status} label={status} />
          </div>
        ))}
      </div>,
    );

    for (const status of statuses) {
      const expected = statusColorMap[mode as ThemeMode][status];
      const expectedRgb = hexToRgb(expected);
      const row = container.querySelector(`[data-status="${status}"]`);
      expect(row).not.toBeNull();

      const tag = row!.querySelector('[data-oi-control="chip"][data-state="' + status + '"]') as HTMLElement;
      expect(styleOf(tag).color.replace(/\s/g, '')).toBe(expectedRgb);
      expect(styleOf(tag).borderColor.replace(/\s/g, '')).toBe(expectedRgb);
      expect(styleOf(tag).getPropertyValue('--ui-status-color').trim()).toBe(expected);

      const chipSurface = row!.querySelector('[data-oi-control="chip"][data-state="' + status + '"]') as HTMLElement;
      const badgeDot = row!.querySelector('[data-oi-control="badge-dot"]') as HTMLElement | null;
      expect(styleOf(chipSurface).getPropertyValue('--ui-status-color').trim()).toBe(expected);
      if (badgeDot) {
        expect(styleOf(badgeDot).backgroundColor.replace(/\s/g, '')).toBe(expectedRgb);
      }

      const dot = row!.querySelector('[role="img"]') as HTMLElement;
      expect(styleOf(dot).backgroundColor.replace(/\s/g, '')).toBe(expectedRgb);
      expect(styleOf(dot).getPropertyValue('--ui-status-color').trim()).toBe(expected);
    }
  });

  it('keeps all three surfaces on the single map with no literal status hex in source', () => {
    const ROOT = resolve(__dirname, '../../../..');
    const surfaces = ['tag.tsx', 'badge.tsx', 'status-dot.tsx'];
    for (const file of surfaces) {
      const code = readFileSync(resolve(ROOT, 'src/components/ui', file), 'utf8');
      const executable = code
        .split('\n')
        .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))
        .join('\n');
      expect(executable).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(executable).toMatch(/getStatusTokens/);
    }
  });
});
