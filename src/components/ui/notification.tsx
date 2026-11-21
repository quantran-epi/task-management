import { App as AntApp, type NotificationArgsProps } from 'antd';
import { getSharedControlTokens } from './tokens.contract';

/** Notification instance from the single holder — never AntD's static `notification.*`. */
export function useNotification() {
  return AntApp.useApp().notification;
}

/** Shared notification policy: duration/placement defaults trace back to the token contract. */
export function useNotificationConfig() {
  const { iconSize } = getSharedControlTokens();
  const defaults: Pick<NotificationArgsProps, 'duration' | 'placement' | 'pauseOnHover'> = {
    duration: 4.5,
    placement: 'topRight',
    pauseOnHover: true,
  };
  return { ...defaults, iconSize };
}
