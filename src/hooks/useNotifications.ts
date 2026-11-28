import { useSyncExternalStore } from 'react';
import { liveQuery, type Subscription } from 'dexie';
import dayjs from 'dayjs';
import { db as defaultDb, type TaskPlannerDatabase } from '../db';
import { getTodayDateString } from '../utils/date';
import { evaluateNotifications } from '../utils/notifications';
import { DISMISSED_ALERTS_KEY } from '../db/repositories/notificationRepo';
import {
  NOTIFICATION_SETTINGS_KEY,
  DEFAULT_NOTIFICATION_SETTINGS,
  type NotificationState,
  type AlertCategory,
  type NotificationSettings,
} from '../types/notifications';

const DEFAULT_CATEGORY_COUNTS: Record<AlertCategory, number> = {
  overdue: 0,
  overload: 0,
  'due-soon': 0,
  stale: 0,
  reminder: 0,
};

const LOADING_STATE: NotificationState = {
  items: [],
  activeCount: 0,
  categoryCounts: { ...DEFAULT_CATEGORY_COUNTS },
  isLoading: true,
};

const CLOCK_INTERVAL_MS = 60_000;

interface Clock {
  todayDate: string;
  currentTime: string;
}

function readClock(): Clock {
  return {
    todayDate: getTodayDateString(),
    currentTime: dayjs().format('HH:mm'),
  };
}

async function buildSnapshot(
  targetDb: TaskPlannerDatabase,
  clock: Clock
): Promise<NotificationState> {
  const maxOverloadDate = dayjs(clock.todayDate, 'YYYY-MM-DD')
    .add(14, 'day')
    .format('YYYY-MM-DD');

  const [
    tasks,
    changeRequests,
    rules,
    overrides,
    allocations,
    workSessions,
    dismissedSetting,
    notificationSettingsRecord,
  ] = await Promise.all([
    targetDb.tasks.toArray(),
    targetDb.changeRequests.toArray(),
    targetDb.capacityRules.toArray(),
    targetDb.capacityOverrides
      .where('date')
      .between(clock.todayDate, maxOverloadDate, true, true)
      .toArray(),
    targetDb.plannedAllocations
      .where('date')
      .between(clock.todayDate, maxOverloadDate, true, true)
      .toArray(),
    targetDb.workSessions
      .where('date')
      .between(clock.todayDate, maxOverloadDate, true, true)
      .toArray(),
    targetDb.settings.get(DISMISSED_ALERTS_KEY),
    targetDb.settings.get(NOTIFICATION_SETTINGS_KEY),
  ]);

  const dismissedMap =
    dismissedSetting &&
    typeof dismissedSetting.value === 'object' &&
    dismissedSetting.value !== null
      ? (dismissedSetting.value as Record<string, string>)
      : {};

  const rawSettings =
    notificationSettingsRecord &&
    typeof notificationSettingsRecord.value === 'object' &&
    notificationSettingsRecord.value !== null
      ? (notificationSettingsRecord.value as Partial<NotificationSettings>)
      : undefined;

  const resolvedSettings: NotificationSettings = {
    ...DEFAULT_NOTIFICATION_SETTINGS,
    ...rawSettings,
    enabledCategories: {
      ...DEFAULT_NOTIFICATION_SETTINGS.enabledCategories,
      ...(rawSettings?.enabledCategories ?? {}),
    },
  };

  const items = evaluateNotifications({
    tasks,
    changeRequests,
    rules,
    overrides,
    allocations,
    workSessions,
    dismissedMap,
    todayDate: clock.todayDate,
    currentTime: clock.currentTime,
    settings: resolvedSettings,
  });

  const categoryCounts: Record<AlertCategory, number> = {
    overdue: 0,
    overload: 0,
    'due-soon': 0,
    stale: 0,
    reminder: 0,
  };
  for (const item of items) {
    categoryCounts[item.category]++;
  }

  return {
    items,
    activeCount: items.length,
    categoryCounts,
    isLoading: false,
  };
}

/**
 * One Dexie live query and one clock per database, shared by every caller.
 * Refcounted so the last unmount tears down the interval and query.
 */
class SharedNotificationStore {
  private readonly listeners = new Set<() => void>();
  private subscription: Subscription | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  private snapshot: NotificationState = LOADING_STATE;
  private clock: Clock = readClock();
  private generation = 0;

  constructor(private readonly targetDb: TaskPlannerDatabase) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    if (this.listeners.size === 1) {
      this.start();
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        this.stop();
      }
    };
  };

  getSnapshot = (): NotificationState => this.snapshot;

  private start(): void {
    this.clock = readClock();
    this.bind();
    this.timer = setInterval(() => {
      const next = readClock();
      if (
        next.todayDate === this.clock.todayDate &&
        next.currentTime === this.clock.currentTime
      ) {
        return;
      }
      this.clock = next;
      this.bind();
    }, CLOCK_INTERVAL_MS);
  }

  private bind(): void {
    this.subscription?.unsubscribe();
    this.subscription = undefined;
    const generation = ++this.generation;
    const clock = this.clock;
    this.subscription = liveQuery(() => buildSnapshot(this.targetDb, clock)).subscribe({
      next: (snapshot) => {
        if (generation !== this.generation) return;
        this.snapshot = snapshot;
        this.emit();
      },
      error: (error: unknown) => {
        if (generation !== this.generation) return;
        console.warn('Notification aggregation failed:', error);
        this.snapshot = LOADING_STATE;
        this.emit();
      },
    });
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private stop(): void {
    this.generation += 1;
    this.subscription?.unsubscribe();
    this.subscription = undefined;
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    this.snapshot = LOADING_STATE;
  }
}

const stores = new WeakMap<TaskPlannerDatabase, SharedNotificationStore>();

function getStore(targetDb: TaskPlannerDatabase): SharedNotificationStore {
  let store = stores.get(targetDb);
  if (!store) {
    store = new SharedNotificationStore(targetDb);
    stores.set(targetDb, store);
  }
  return store;
}

/**
 * Reactive multi-domain alerts (NOTIF-02, D-01, D-05). All callers on the same
 * database share one query and one wall-clock tick.
 */
export function useNotifications(
  targetDb: TaskPlannerDatabase = defaultDb
): NotificationState {
  const store = getStore(targetDb);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
