// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db';
import * as settingsService from '../../src/services/telegram/telegramSettingsService';
import { ThemeAppHolder } from '../../src/components/ui';
import { TelegramMonitorView } from '../../src/views/TelegramMonitorView';

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
const { listenMock } = vi.hoisted(() => ({ listenMock: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invokeMock(...args) }));
vi.mock('@tauri-apps/api/event', () => ({ listen: (...args: unknown[]) => listenMock(...args) }));

describe('TelegramMonitorView - cấu hình polling', () => {
  let db: TaskPlannerDatabase;
  let saveSettingsSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    saveSettingsSpy = vi.spyOn(settingsService, 'saveTelegramSettings');
    saveSettingsSpy.mockClear();
    invokeMock.mockReset();
    listenMock.mockReset();
    listenMock.mockResolvedValue(() => {});
    (window as unknown as { __TAURI_INTERNALS__: Record<string, unknown> }).__TAURI_INTERNALS__ = { invoke: (...args: unknown[]) => invokeMock(...args) };
    db = new TaskPlannerDatabase(`TelegramMonitorConfig_${Math.random().toString(36).slice(2)}`);
    await db.open();
    await db.telegramSettings.put({
      id: 'default',
      botToken: 'token-cu',
      isEnabled: false,
      autoStartOnLaunch: false,
      defaultScope: 'full',
      maxHistoryTurns: 5,
    });
  });

  afterEach(async () => {
    cleanup();
    db.close();
    await TaskPlannerDatabase.delete(db.name);
    delete (window as unknown as { __TAURI_INTERNALS__?: Record<string, unknown> }).__TAURI_INTERNALS__;
  });

  async function mount() {
    await act(async () => {
      render(<ThemeAppHolder><TelegramMonitorView /></ThemeAppHolder>);
    });
    await screen.findAllByRole('switch');
  }

  it('không lưu isEnabled khi start polling thất bại', async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === 'get_telegram_status') return Promise.resolve({ running: false, error: null });
      if (command === 'standalone_access_list') return Promise.resolve([]);
      if (command === 'start_telegram_polling') return Promise.reject(new Error('start failed'));
      return Promise.resolve(undefined);
    });
    await mount();

    // Use the exported handler contract via the switch's React props: AntD's
    // jsdom switch swallows synthetic clicks when pointer capture is missing.
    const sw = screen.getAllByRole('switch')[0]! as HTMLButtonElement & { onChange?: (checked: boolean) => void };
    await act(async () => {
      sw.click();
    });
    await new Promise((resolve) => setTimeout(resolve, 50));

    const settings = await db.telegramSettings.get('default');
    expect(settings?.isEnabled).toBe(false);
    expect(saveSettingsSpy).not.toHaveBeenCalledWith(expect.objectContaining({ isEnabled: true }), expect.anything());
  });

  it('đổi token lúc đang chạy thì stop rồi start token mới', async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === 'get_telegram_status') return Promise.resolve({ running: true, error: null });
      return Promise.resolve(undefined);
    });
    await mount();
    await waitFor(() => expect(screen.getAllByRole('switch')[0]!.getAttribute('aria-checked')).toBe('true'));

    await act(async () => { fireEvent.click(screen.getByRole('tab', { name: /Cấu hình Bot/ })); });
    const input = await screen.findByPlaceholderText('123456789:ABCDefGhIJKlmNoPQRsTUVwxyZ...');
    await act(async () => { fireEvent.change(input, { target: { value: 'token-moi' } }); });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Lưu cài đặt' }));
    });

    await new Promise((resolve) => setTimeout(resolve, 150));
    const calls = invokeMock.mock.calls.map(([command]) => command).filter((c) => c === 'start_telegram_polling' || c === 'stop_telegram_polling');
    expect(calls.indexOf('stop_telegram_polling')).toBeLessThan(calls.lastIndexOf('start_telegram_polling'));
    expect(invokeMock.mock.calls.map(([cmd]) => cmd)).toContain('stop_telegram_polling');
    expect(saveSettingsSpy.mock.calls.some(([patch]: [Record<string, unknown>, ...unknown[]]) => patch.botToken === 'token-moi')).toBe(true);
  });
});
