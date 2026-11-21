import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigProvider } from 'antd';
import { AntdThemeAdapter } from '../../../workbench/AntdThemeAdapter';
import { THEME_STORAGE_KEY } from '../../../workbench/themeBroadcast';
import { getAntdTheme } from '../../../styles/tokens';
import { Input } from '../input';
import { Textarea, DEFAULT_TEXTAREA_MIN_ROWS } from '../textarea';
import { Select } from '../select';
import { InputNumber } from '../input-number';
import { Modal, getOverlayWidth, useTaskMateModal } from '../modal';
import { Drawer } from '../drawer';
import { Popconfirm } from '../popconfirm';
import { ThemeAppHolder, useMessage } from '../message';
import { useNotification } from '../notification';
import { getSharedControlTokens } from '../tokens.contract';

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
    expect(input.closest('.ant-input-affix-wrapper, .ant-input')).toHaveClass('ant-input-status-error');
  });

  it('applies Textarea policy with a token-derived default minRows', () => {
    render(<Textarea placeholder="Ghi chú" />);
    const textarea = screen.getByPlaceholderText('Ghi chú');
    expect(DEFAULT_TEXTAREA_MIN_ROWS).toBeGreaterThanOrEqual(2);
    expect(textarea.closest('.ant-input')).not.toBeNull();
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
