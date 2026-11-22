import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useThemeMode } from '../../hooks/useThemeMode';
import { NotificationHolder } from './notification';
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
import { getStatusTokens, type StatusKind } from './tokens.contract';

/** Imperative message kinds preserved from the holder API. */
export type MessageKind = 'success' | 'error' | 'warning' | 'info' | 'loading';

/** Config object form accepted alongside the legacy string argument. */
export interface MessageConfig {
  content?: ReactNode;
  message?: ReactNode;
  key?: string | number;
  duration?: number;
  type?: MessageKind;
  placement?: string;
  [key: string]: unknown;
}

export type MessageArg = ReactNode | MessageConfig;

/** AntD's loading callers invoke the returned handle as a hide function. */
export interface HolderHandle {
  (): void;
  key: string;
  destroy(): void;
}

/** One record rendered by the native message stack. */
export interface MessagePayload {
  kind: MessageKind;
  content: ReactNode;
  duration: number;
  pauseOnHover: boolean;
}

export interface MessageApi {
  success(arg: MessageArg, duration?: number): HolderHandle;
  error(arg: MessageArg, duration?: number): HolderHandle;
  warning(arg: MessageArg, duration?: number): HolderHandle;
  warn(arg: MessageArg, duration?: number): HolderHandle;
  info(arg: MessageArg, duration?: number): HolderHandle;
  loading(arg: MessageArg, duration?: number): HolderHandle;
  open(config: MessageConfig): HolderHandle;
  destroy(): void;
}

/** This module owns its channel; notification owns a separate one. */
export const messageChannel = createImperativeChannel<MessagePayload>();

/** React elements carry `$$typeof`; exclude them before treating an argument as config. */
export function isHolderConfig(arg: MessageArg): arg is MessageConfig {
  if (arg === null || typeof arg !== 'object' || Array.isArray(arg)) return false;
  const candidate = arg as Record<string, unknown>;
  if ('$$typeof' in candidate) return false;
  return ['content', 'message', 'key', 'duration', 'type', 'placement']
    .some((name) => name in candidate);
}

function makeHandle(key: string, remove: (key: string) => void): HolderHandle {
  const handle = (() => remove(key)) as HolderHandle;
  handle.key = key;
  handle.destroy = handle;
  return handle;
}

function pushMessage(
  kind: MessageKind,
  arg: MessageArg,
  explicitDuration?: number,
  forcedKind?: MessageKind,
): HolderHandle {
  const config = isHolderConfig(arg) ? arg : undefined;
  const content = config ? (config.content ?? config.message) : (arg as ReactNode);
  const resolvedKind = forcedKind ?? config?.type ?? kind;
  const key = config?.key === undefined ? crypto.randomUUID() : String(config.key);
  messageChannel.push({
    kind: resolvedKind,
    content,
    duration: explicitDuration ?? config?.duration ?? (resolvedKind === 'loading' ? 0 : 3),
    pauseOnHover: true,
  }, key);
  return makeHandle(key, messageChannel.remove);
}

/** Bound receiver, never a static `message.*` call (D-05/D-07). */
export function useMessage(): MessageApi {
  const apiRef = useRef<MessageApi | null>(null);
  if (apiRef.current === null) {
    const push = (kind: MessageKind) => (arg: MessageArg, duration?: number) =>
      pushMessage(kind, arg, duration);
    apiRef.current = {
      success: push('success'),
      error: push('error'),
      warning: push('warning'),
      warn: push('warning'),
      info: push('info'),
      loading: push('loading'),
      open: (config) => pushMessage(config.type ?? 'info', config, undefined, config.type),
      destroy: () => messageChannel.clear(),
    };
  }
  return apiRef.current;
}

const STATUS_BY_KIND: Record<MessageKind, StatusKind> = {
  success: 'success',
  error: 'danger',
  warning: 'warning',
  info: 'info',
  loading: 'accent',
};

const ICON_BY_KIND = {
  success: CheckCircleOutlined,
  error: CloseCircleOutlined,
  warning: WarningOutlined,
  info: InfoCircleOutlined,
  loading: LoadingOutlined,
} as const;

/** D-12 status tone is rendered as a CSS var; colors stay owned by tokens. */
export function holderToneStyle(kind: MessageKind, mode: 'light' | 'dark'): CSSProperties {
  return { color: getStatusTokens(STATUS_BY_KIND[kind], mode) } as CSSProperties;
}

function MessageItem({ record, onDismiss }: {
  record: ImperativeRecord<MessagePayload>;
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
      data-oi-control="message-item"
      data-state={record.payload.kind}
      role="status"
      {...hover}
    >
      <span className={feedbackStyles.toastIcon} style={holderToneStyle(record.payload.kind, mode)}>
        <Icon />
      </span>
      <div className={feedbackStyles.toastMain}>
        <div className={feedbackStyles.toastHead}>
          <span className={feedbackStyles.toastTitle}>{record.payload.content}</span>
        </div>
      </div>
      <button
        type="button"
        aria-label="Đóng"
        data-oi-control="message-close"
        className={`${buttonStyles.iconButton} ${buttonStyles['is-small']} ${feedbackStyles.toastClose}`}
        onClick={onDismiss}
      >
        <CloseOutlined />
      </button>
    </div>
  );
}

/** Message stack subscribing with useSyncExternalStore; keyed updates render in place. */
export function MessageHolder() {
  const records = useImperativeChannel(messageChannel);
  const style = {
    position: 'fixed',
    top: 16,
    right: 368,
    zIndex: 'var(--z-tooltip)',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    maxWidth: 'calc(100vw - 32px)',
  } as CSSProperties;
  return (
    <div data-oi-control="message" data-state={records.length === 0 ? 'empty' : 'active'} style={style}>
      {records.map((record) => (
        <MessageItem key={record.key} record={record} onDismiss={() => messageChannel.remove(record.key)} />
      ))}
    </div>
  );
}

/**
 * Single shell mount point for imperative holders. `App`/`ThemeConfigProvider`
 * supply context; both stacks live in this tree so updates never need reload.
 */
export function ThemeAppHolder({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <MessageHolder />
      <NotificationHolder />
    </>
  );
}
