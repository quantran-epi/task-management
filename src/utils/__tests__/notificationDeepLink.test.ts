import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  deeplinkForAlert,
  isSafeHashRoute,
  applyNotificationDeepLink,
  NotificationDeepLink,
  NOTIFICATION_DEEPLINK_EVENT,
} from '../notificationDeepLink';
import type { AlertNotificationItem } from '../../types/notifications';

function makeItem(overrides: Partial<AlertNotificationItem>): AlertNotificationItem {
  return {
    id: 'alert-1',
    category: 'reminder',
    title: 'Test',
    tagColor: 'gold',
    tagLabel: 'Nhắc nhở',
    entityType: 'task',
    canDismiss: true,
    priorityOrder: 5,
    ...overrides,
  };
}

describe('deeplinkForAlert', () => {
  it('routes a task alert to the task insight page', () => {
    const item = makeItem({ entityType: 'task', entityId: 'task-123' });
    expect(deeplinkForAlert(item)).toBe('#/insight?type=task&id=task-123');
  });

  it('routes a CR alert to the CR insight page', () => {
    const item = makeItem({ entityType: 'cr', entityId: 'cr-456' });
    expect(deeplinkForAlert(item)).toBe('#/insight?type=cr&id=cr-456');
  });

  it('routes a system alert to the system insight page', () => {
    const item = makeItem({ entityType: 'system', entityId: 'sys-1' });
    expect(deeplinkForAlert(item)).toBe('#/insight?type=system&id=sys-1');
  });

  it('routes a capacity alert to the planner on its date', () => {
    const item = makeItem({ entityType: 'capacity', date: '2026-11-17' });
    expect(deeplinkForAlert(item)).toBe('#/planner?date=2026-11-17');
  });

  it('falls back to the tasks list when a task alert has no entity id', () => {
    const item = makeItem({ entityType: 'task', entityId: undefined });
    expect(deeplinkForAlert(item)).toBe('#/tasks');
  });
});

describe('isSafeHashRoute', () => {
  it('accepts valid in-app hash routes', () => {
    expect(isSafeHashRoute('#/tasks')).toBe(true);
    expect(isSafeHashRoute('#/planner?date=2026-11-17')).toBe(true);
    expect(isSafeHashRoute('#/insight?type=task&id=abc')).toBe(true);
  });

  it('rejects javascript URLs and external routes', () => {
    expect(isSafeHashRoute('javascript:alert(1)')).toBe(false);
    expect(isSafeHashRoute('#/javascript:alert(1)')).toBe(false);
    expect(isSafeHashRoute('https://evil.example')).toBe(false);
    expect(isSafeHashRoute('')).toBe(false);
  });
});

describe('applyNotificationDeepLink', () => {
  const originalHash = window.location.hash;
  let received: Array<CustomEvent<{ route?: string }>>;

  const listener = (event: Event) => {
    received.push(event as CustomEvent<{ route?: string }>);
  };

  beforeEach(() => {
    received = [];
    window.addEventListener(NOTIFICATION_DEEPLINK_EVENT, listener);
  });

  afterEach(() => {
    window.removeEventListener(NOTIFICATION_DEEPLINK_EVENT, listener);
    window.location.hash = originalHash;
  });

  it('sets the hash and dispatches the deep-link event for a valid route', () => {
    applyNotificationDeepLink('#/planner?date=2026-11-17');
    expect(window.location.hash).toBe('#/planner?date=2026-11-17');
    expect(received).toHaveLength(1);
    expect(received[0]?.detail?.route).toBe('#/planner?date=2026-11-17');
  });

  it('does nothing for an unsafe route', () => {
    const before = window.location.hash;
    applyNotificationDeepLink('javascript:alert(1)');
    expect(window.location.hash).toBe(before);
    expect(received).toHaveLength(0);
  });
});

describe('NotificationDeepLink constants', () => {
  it('URL-encodes ids in insight routes', () => {
    expect(NotificationDeepLink.task('a b/c')).toBe('#/insight?type=task&id=a%20b%2Fc');
  });
});
