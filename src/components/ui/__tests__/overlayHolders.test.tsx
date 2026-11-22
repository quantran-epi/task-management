import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App, useApp } from '../app';
import { ThemeConfigProvider } from '../config-provider';
import { Layout, LayoutContent, LayoutFooter, LayoutHeader, LayoutSider } from '../layout';
import { UPLOAD_LIST_IGNORE, Upload, UploadDragger } from '../upload';
import { ThemeAppHolder, messageChannel, useMessage } from '../message';
import {
  notificationChannel,
  useNotification,
  useNotificationConfig,
} from '../notification';

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  messageChannel.clear();
  notificationChannel.clear();
});

afterEach(() => {
  expect(errorSpy).not.toHaveBeenCalled();
  errorSpy.mockRestore();
});

function Consumer() {
  const message = useMessage();
  const notification = useNotification();
  return (
    <>
      <button type="button" onClick={() => message.error('lỗi')}>message-string</button>
      <button type="button" onClick={() => message.success({ content: 'xong', duration: 60 })}>message-object</button>
      <button type="button" onClick={() => message.loading({ content: 'Đang xử lý', key: 'retry-chunks', duration: 0 })}>message-loading</button>
      <button type="button" onClick={() => message.success({ content: 'Đã xong', key: 'retry-chunks' })}>message-keyed</button>
      <button type="button" onClick={() => notification.success({ key: 'k', message: 'x', description: 'y' })}>notify</button>
      <button type="button" onClick={() => notification.success({ key: 'k', message: 'đổi', description: 'mới' })}>notify-keyed</button>
      <button type="button" onClick={() => notification.info({ message: 'hover', duration: 0.05 })}>notify-timer</button>
      <button type="button" onClick={() => notification.info({ message: 'hover-2', duration: 0.05 })}>notify-timer-2</button>
      <ConfigProbe />
    </>
  );
}

function ConfigProbe() {
  const config = useNotificationConfig();
  return <span data-testid="notify-config">{JSON.stringify(config)}</span>;
}

describe('native App, ConfigProvider and Layout', () => {
  it('keeps --ui-app-font-size and exposes bound message/notification/modal via useApp', () => {
    function BoundConsumer() {
      const app = useApp();
      expect(typeof app.message.success).toBe('function');
      expect(typeof app.notification.success).toBe('function');
      expect(typeof app.modal.confirm).toBe('function');
      return <span>bound</span>;
    }
    const { container } = render(
      <App style={{ padding: 4 }}>
        <BoundConsumer />
      </App>,
    );
    const app = container.querySelector('[data-oi-control="app"]') as HTMLElement;
    expect(app.style.getPropertyValue('--ui-app-font-size')).toBe('13px');
    expect(app.style.padding).toBe('4px');
    expect(screen.getByText('bound')).toBeInTheDocument();
  });

  it('injects the accent on wrapper and documentElement for both modes', () => {
    const { container, unmount } = render(
      <ThemeConfigProvider><span>light</span></ThemeConfigProvider>,
    );
    const wrapper = container.querySelector('.taskmate-theme-context') as HTMLElement;
    expect(wrapper).toHaveAttribute('data-theme', 'light');
    expect(wrapper.style.getPropertyValue('--accent')).toBe('#3871e1');
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#3871e1');
    unmount();

    render(
      <ThemeConfigProvider theme={{ token: { colorBgBase: '#11151d' } } as never}>
        <span>dark</span>
      </ThemeConfigProvider>,
    );
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#3871e1');
  });

  it('renders landmarks and collapses the sider with the caller callback', () => {
    const onCollapse = vi.fn();
    const { container } = render(
      <Layout>
        <LayoutHeader>Header</LayoutHeader>
        <LayoutSider onCollapse={onCollapse} width={220}>Sider</LayoutSider>
        <LayoutContent>Content</LayoutContent>
        <LayoutFooter>Footer</LayoutFooter>
      </Layout>,
    );
    expect(container.querySelector('header')).toBeInTheDocument();
    expect(container.querySelector('main')).toBeInTheDocument();
    expect(container.querySelector('footer')).toBeInTheDocument();
    const sider = container.querySelector('[data-oi-control="layout-sider"]') as HTMLElement;
    expect(sider.style.width).toBe('220px');
    fireEvent.click(screen.getByLabelText('Thu gọn thanh bên'));
    expect(onCollapse).toHaveBeenCalledWith(true, 'clickTrigger');
    expect(sider).toHaveAttribute('data-state', 'collapsed');
  });
});

describe('native Upload', () => {
  function chooseFile(container: HTMLElement, file: File) {
    const input = container.querySelector('[data-oi-control="upload-input"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    fireEvent.change(input, { target: { files: [file] } });
  }

  it('blocks on beforeUpload=false, honours LIST_IGNORE and emits the AntD-shaped payload', () => {
    const beforeUpload = vi.fn((file: File) => file.name === 'ok.txt' || UPLOAD_LIST_IGNORE);
    const onChange = vi.fn();
    const customRequest = vi.fn(({ onSuccess }: { onSuccess: (value?: unknown) => void }) => onSuccess());
    const { container } = render(
      <Upload beforeUpload={beforeUpload as never} onChange={onChange} customRequest={customRequest as never} />,
    );
    expect(container.querySelector('[data-oi-control="upload"]')).toHaveAttribute('data-state', 'empty');
    chooseFile(container, new File(['x'], 'blocked.txt', { type: 'text/plain' }));
    expect(beforeUpload).toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
    expect(container.querySelectorAll('[data-oi-control="upload-row"]')).toHaveLength(0);

    chooseFile(container, new File(['x'], 'ok.txt', { type: 'text/plain' }));
    expect(customRequest).toHaveBeenCalledWith(
      expect.objectContaining({ file: expect.any(File), onSuccess: expect.any(Function), onError: expect.any(Function), onProgress: expect.any(Function) }),
      expect.anything(),
    );
    const info = onChange.mock.calls.at(-1)?.[0] as { file: { name: string }; fileList: unknown[]; event?: unknown };
    expect(info.file.name).toBe('ok.txt');
    expect(info.fileList).toHaveLength(1);
    expect(info.event).toBeUndefined();
    expect(container.querySelectorAll('[data-oi-control="upload-row"]')).toHaveLength(1);
    expect(container.querySelector('[data-oi-control="upload-row"]')).toHaveAttribute('data-state', 'success');
  });

  it('exposes dragover/disabled states and renders dragger children', () => {
    const { container } = render(
      <UploadDragger disabled><span>Kéo thả</span></UploadDragger>,
    );
    expect(screen.getByText('Kéo thả')).toBeInTheDocument();
    expect(container.querySelector('[data-oi-control="upload-dragger"]')).toHaveAttribute('data-state', 'disabled');
    const { container: active } = render(<UploadDragger><span>Kéo thả 2</span></UploadDragger>);
    const dragger = active.querySelector('[data-oi-control="upload-dragger"]') as HTMLElement;
    fireEvent.dragOver(dragger);
    expect(dragger).toHaveAttribute('data-state', 'dragover');
    fireEvent.dragLeave(dragger);
    expect(dragger).toHaveAttribute('data-state', 'empty');
  });
});

describe('native message holder', () => {
  it('renders string and object args and preserves hook shape', () => {
    render(<ThemeAppHolder><Consumer /></ThemeAppHolder>);
    fireEvent.click(screen.getByText('message-string'));
    expect(screen.getByText('lỗi')).toBeInTheDocument();
    fireEvent.click(screen.getByText('message-object'));
    expect(screen.getByText('xong')).toBeInTheDocument();
    expect(document.querySelectorAll('[data-oi-control="message-item"]')).toHaveLength(2);
  });

  it('updates a keyed loading toast in place without reload or duplicate item', () => {
    const { container } = render(<ThemeAppHolder><Consumer /></ThemeAppHolder>);
    fireEvent.click(screen.getByText('message-loading'));
    expect(container.querySelector('[data-oi-control="message-item"]')).toHaveAttribute('data-state', 'loading');
    fireEvent.click(screen.getByText('message-keyed'));
    const items = container.querySelectorAll('[data-oi-control="message-item"]');
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveAttribute('data-state', 'success');
    expect(items[0]).toHaveTextContent('Đã xong');
  });
});

describe('native notification holder', () => {
  it('renders title/description and updates the same key in place', () => {
    const { container } = render(<ThemeAppHolder><Consumer /></ThemeAppHolder>);
    fireEvent.click(screen.getByText('notify'));
    expect(screen.getByText('x')).toBeInTheDocument();
    expect(screen.getByText('y')).toBeInTheDocument();
    fireEvent.click(screen.getByText('notify-keyed'));
    const items = container.querySelectorAll('[data-oi-control="notification-item"]');
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent('đổi');
    expect(items[0]).toHaveTextContent('mới');
  });

  it('keeps the config contract and pauses auto-dismiss on hover', async () => {
    vi.useFakeTimers();
    try {
      const { container } = render(<ThemeAppHolder><Consumer /></ThemeAppHolder>);
      expect(JSON.parse(screen.getByTestId('notify-config').textContent ?? '{}')).toMatchObject({
        duration: 4.5,
        placement: 'topRight',
        pauseOnHover: true,
        iconSize: expect.any(String),
      });
      fireEvent.click(screen.getByText('notify-timer'));
      expect(container.querySelectorAll('[data-oi-control="notification-item"]')).toHaveLength(1);
      fireEvent.mouseOver(container.querySelector('[data-oi-control="notification-item"]')!);
      await act(async () => { vi.advanceTimersByTime(500); });
      expect(container.querySelectorAll('[data-oi-control="notification-item"]')).toHaveLength(1);
      fireEvent.mouseOut(container.querySelector('[data-oi-control="notification-item"]')!);
      await act(async () => { vi.advanceTimersByTime(500); });
      expect(container.querySelectorAll('[data-oi-control="notification-item"]')).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
