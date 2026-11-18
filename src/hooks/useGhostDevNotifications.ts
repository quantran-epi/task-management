import { useEffect, useRef } from 'react';
import { isTauriApp } from '../utils/timerPopout';
import { sendDesktopNotification } from '../utils/desktopNotification';
import { NotificationDeepLink } from '../utils/notificationDeepLink';
import type { AgentSession, ShellPermissionRequest } from '../types/agent';

/**
 * Listens for Agent completion and Shell permission approval requests
 * and triggers desktop OS notifications via tauri-plugin-notification (D-04).
 */
export function useGhostDevNotifications(sessions: AgentSession[]): void {
  const prevStatusesRef = useRef<Record<string, string>>({});

  // 1. Monitor session completion/error transitions
  useEffect(() => {
    sessions.forEach((s) => {
      const prev = prevStatusesRef.current[s.taskId];
      if (prev && prev !== s.status) {
        if (s.status === 'done') {
          void sendDesktopNotification({
            title: 'Ghost Dev hoàn thành',
            body: `Tác vụ "${s.taskTitle}" đã hoàn thành mã nguồn. Nhấp để xem diff.`,
            tag: `ghost-dev-done-${s.taskId}`,
            deeplink: NotificationDeepLink.task(s.taskId),
          });
        } else if (s.status === 'error') {
          void sendDesktopNotification({
            title: 'Ghost Dev gặp sự cố',
            body: `Tiến trình Ghost Dev cho tác vụ "${s.taskTitle}" đã dừng do lỗi.`,
            tag: `ghost-dev-error-${s.taskId}`,
            deeplink: NotificationDeepLink.task(s.taskId),
          });
        }
      }
      prevStatusesRef.current[s.taskId] = s.status;
    });
  }, [sessions]);

  // 2. Listen for Tauri shell permission requests
  useEffect(() => {
    if (!isTauriApp()) return;

    let unlisten: (() => void) | undefined;
    void (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        unlisten = await listen<ShellPermissionRequest>(
          'ghost-dev:permission-request',
          (event) => {
            if (event.payload) {
              void sendDesktopNotification({
                title: 'Ghost Dev: Yêu cầu cấp quyền Shell',
                body: `Lệnh: ${event.payload.command.slice(0, 100)}`,
                tag: `ghost-dev-perm-${event.payload.requestId}`,
                requireInteraction: true,
                // The ghost-dev list page/tab is retired. The approval modal itself is global
                // (mounted at the shell root), so point the banner at the task that triggered it.
                deeplink: NotificationDeepLink.task(event.payload.taskId),
              });
            }
          }
        );
      } catch (err) {
        console.error('[GhostDev] Failed to listen to permission notifications:', err);
      }
    })();

    return () => {
      if (unlisten) unlisten();
    };
  }, []);
}
