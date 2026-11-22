import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useThemeMode } from '../../hooks/useThemeMode';
import {
  createImperativeChannel,
  useImperativeChannel,
  type ImperativeRecord,
} from './native/imperativeChannel';
import buttonStyles from './openidea/Button.module.css';
import feedbackStyles from './openidea/Feedback.module.css';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  CloseOutlined,
  InfoCircleOutlined,
  LoadingOutlined,
  WarningOutlined,
} from './icon';
import { holderToneStyle, type MessageKind } from './message';
import { getSharedControlTokens } from './tokens.contract';

/** Imperative notification kinds preserved from the holder API. */
export type NotificationKind = 'success' | 'error' | 'warning' | 'info' | 'loading';

/** Caller config accepted by `useNotification()`; `message` maps to title. */
export interface NotificationConfig {
  message?: ReactNode;
  title?: ReactNode;
  content?: ReactNode;
  description?: ReactNode;
  key?: string | number;
  duration?: number;
  placement?: string;
  pauseOnHover?: boolean;
  type?: NotificationKind;
  [key: string]: unknown;
}

export interface NotificationPayload {
  kind: NotificationKind;
  title: ReactNode;
  description: ReactNode | undefined;
  duration: number;
  pauseOnHover: boolean;
  placement: string | undefined;
}

export interface NotificationApi {
  success(config: NotificationConfig): void;
  error(config: NotificationConfig): void;
  warning(config: NotificationConfig): void;
  warn(config: NotificationConfig): void;
  info(config: NotificationConfig): void;
  open(config: NotificationConfig): void;
  destroy(): void;
}

/** Separate channel from message; each holder owns its own store. */
export const notificationChannel = createImperativeChannel<NotificationPayload>();

function pushNotification(kind: NotificationKind, config: NotificationConfig): void {
  const key = config.key === undefined ? crypto.randomUUID() : String(config.key);
  notificationChannel.push({
    kind: config.type ?? kind,
    title: config.message ?? config.title ?? config.content,
    description: config.description,
    duration: config.duration ?? 4.5,
    pauseOnHover: config.pauseOnHover ?? true,
    placement: config.placement,
  }, key);
}

/** Bound receiver; never a static `notification.*` call. */
export function useNotification(): NotificationApi {
  const apiRef = useRef<NotificationApi | null>(null);
  if (apiRef.current === null) {
    const push = (kind: NotificationKind) => (config: NotificationConfig) => pushNotification(kind, config);
    apiRef.current = {
      success: push('success'),
      error: push('error'),
      warning: push('warning'),
      warn: push('warning'),
      info: push('info'),
      open: (config) => pushNotification(config.type ?? 'info', config),
      destroy: () => notificationChannel.clear(),
    };
  }
  return apiRef.current;
}

/** Defaults keep the UI-SPEC contract verbatim; caller overrides per record. */
export function useNotificationConfig() {
  const { iconSize } = getSharedControlTokens();
  return {
    duration: 4.5,
    placement: 'topRight',
    pauseOnHover: true,
    iconSize,
  } as const;
}

const ICON_BY_KIND = {
  success: CheckCircleOutlined,
  error: CloseCircleOutlined,
  warning: WarningOutlined,
  info: InfoCircleOutlined,
  loading: LoadingOutlined,
} as const;

function NotificationItem({ record, onDismiss }: {
  record: ImperativeRecord<NotificationPayload>;
  onDismiss: () => void;
}) {
  const { mode } = useThemeMode();
  const [paused, setPaused] = useState(false);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    const duration = record.payload.duration;
    if (paused || duration <= 0) return;
    const timer = window.setTimeout(() => dismissRef.current(), duration * 1000);
    return () => window.clearTimeout(timer);
  }, [record.payload.duration, paused, record.updatedAt]);

  const Icon = ICON_BY_KIND[record.payload.kind];
  const hover = record.payload.pauseOnHover
    ? { onMouseEnter: () => setPaused(true), onMouseLeave: () => setPaused(false) }
    : {};

  return (
    <div
      className={feedbackStyles.toast}
      data-oi-control="notification-item"
      data-state={record.payload.kind}
      role="alert"
      {...hover}
    >
      <span className={feedbackStyles.toastIcon} style={holderToneStyle(record.payload.kind as MessageKind, mode)}>
        <Icon />
      </span>
      <div className={feedbackStyles.toastMain}>
        <div className={feedbackStyles.toastHead}>
          <span className={feedbackStyles.toastTitle}>{record.payload.title}</span>
        </div>
        {record.payload.description !== undefined && (
          <div className={feedbackStyles.toastBody}>{record.payload.description}</div>
        )}
      </div>
      <button
        type="button"
        aria-label="Đóng"
        data-oi-control="notification-close"
        className={`${buttonStyles.iconButton} ${buttonStyles['is-small']} ${feedbackStyles.toastClose}`}
        onClick={onDismiss}
      >
        <CloseOutlined />
      </button>
    </div>
  );
}

/** Notification stack subscribing with useSyncExternalStore; updates render in place. */
export function NotificationHolder() {
  const records = useImperativeChannel(notificationChannel);
  const style = {
    position: 'fixed',
    top: 16,
    right: 16,
    zIndex: 'var(--z-tooltip)',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    maxWidth: 'calc(100vw - 32px)',
  } as CSSProperties;
  return (
    <div data-oi-control="notification" data-state={records.length === 0 ? 'empty' : 'active'} style={style}>
      {records.map((record) => (
        <NotificationItem key={record.key} record={record} onDismiss={() => notificationChannel.remove(record.key)} />
      ))}
    </div>
  );
}
