import type { AppProps as AntAppProps } from 'antd';
import type { CSSProperties, ReactNode } from 'react';
import { useMessage, type MessageApi } from './message';
import { useNotification, type NotificationApi } from './notification';
import { useTaskMateModal } from './modal';
import { getSharedControlTokens } from './tokens.contract';

export type AppProps<P = Record<string, unknown>> = AntAppProps<P>;

/** Native bound context shape; no AntD `App.useApp()` singleton. */
export interface AppContextValue {
  message: MessageApi;
  notification: NotificationApi;
  modal: ReturnType<typeof useTaskMateModal>['modal'];
}

/**
 * Single swap point for AntD App. Holder stacks stay in message.tsx so this
 * wrapper adds no geometry of its own; callers keep the Phase 50 signature.
 */
export function App<P = Record<string, unknown>>({ children, style, ...rest }: AppProps<P>) {
  const { fontSize } = getSharedControlTokens();
  const tokenStyle = { '--ui-app-font-size': `${fontSize}px` } as CSSProperties;
  const { message: _message, notification: _notification, component: _component, ...domProps } = rest;
  void _message; void _notification; void _component;
  return (
    <div data-oi-control="app" style={{ ...tokenStyle, ...style }} {...(domProps as object)}>
      {children as ReactNode}
    </div>
  );
}

/** Hook returns receiver-bound APIs from the native holders; no context provider needed. */
export function useApp(): AppContextValue {
  const message = useMessage();
  const notification = useNotification();
  const { modal } = useTaskMateModal();
  return { message, notification, modal };
}
