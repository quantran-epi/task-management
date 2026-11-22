import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
