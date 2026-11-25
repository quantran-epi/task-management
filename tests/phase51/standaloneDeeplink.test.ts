// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BROWSER_NOTIFICATION_CLICK_EVENT,
  NOTIFICATION_DEEPLINK_EVENT,
  NotificationDeepLink,
  isSafeHashRoute,
  startNotificationDeepLinkListener,
} from '../../src/utils/notificationDeepLink';

const readSource = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

describe('phase 51 standalone notification deeplink (WR-05)', () => {
  const originalHash = window.location.hash;

  beforeEach(() => {
    vi.resetModules();
    window.location.hash = '#/original';
  });

  afterEach(() => {
    window.location.hash = originalHash;
  });

  it('legacy listener vẫn áp dụng route từ notification click', async () => {
    const { startNotificationDeepLinkListener: start } = await import('../../src/utils/notificationDeepLink');
    const deeplinks: string[] = [];
    const onDeeplink = (event: Event) => {
      deeplinks.push((event as CustomEvent<{ route: string }>).detail.route);
    };
    window.addEventListener(NOTIFICATION_DEEPLINK_EVENT, onDeeplink);
    const stop = start(false);

    window.dispatchEvent(new CustomEvent(BROWSER_NOTIFICATION_CLICK_EVENT, {
      detail: { route: '#/dashboard' },
    }));

    expect(window.location.hash).toBe('#/dashboard');
    expect(deeplinks).toEqual(['#/dashboard']);

    stop();
    window.removeEventListener(NOTIFICATION_DEEPLINK_EVENT, onDeeplink);
  });

  it('standalone listener bỏ qua mọi notification route', async () => {
    const { startNotificationDeepLinkListener: start } = await import('../../src/utils/notificationDeepLink');
    const deeplinks: string[] = [];
    const onDeeplink = (event: Event) => {
      deeplinks.push((event as CustomEvent<{ route: string }>).detail.route);
    };
    window.addEventListener(NOTIFICATION_DEEPLINK_EVENT, onDeeplink);
    const stop = start(true);

    window.dispatchEvent(new CustomEvent(BROWSER_NOTIFICATION_CLICK_EVENT, {
      detail: { route: '#/dashboard' },
    }));

    expect(window.location.hash).toBe('#/original');
    expect(deeplinks).toEqual([]);

    stop();
    window.removeEventListener(NOTIFICATION_DEEPLINK_EVENT, onDeeplink);
  });

  it('AI turn notification dùng deeplink aiPopout trong standalone', () => {
    expect(NotificationDeepLink.aiPopout).toBe('#/ai-popout');
    expect(isSafeHashRoute(NotificationDeepLink.aiPopout)).toBe(true);

    const source = readSource('src/components/ai/AIChatDrawer.tsx');
    expect(source).toContain(
      'isStandaloneChat ? NotificationDeepLink.aiPopout : NotificationDeepLink.dashboard'
    );
  });
});
