import React, { useState, useEffect } from 'react';
import { theme } from 'antd';
import { db as defaultDb, type TaskPlannerDatabase } from '../db';
import { AIChatDrawer, type ActiveScope } from '../components/ai/AIChatDrawer';
import {
  isTauriApp,
  isAiWindowAlwaysOnTop,
  setAiWindowAlwaysOnTop,
  closeCurrentAiPopoutWindow,
  AI_SCOPE_EVENT,
  type AIScopeParams,
} from '../utils/aiPopout';
import type { ChatScopeType } from '../types/models';

const AI_GEOMETRY_STORAGE_KEY = 'planner:ai_popout_geometry';

export interface AIPopoutViewProps {
  db?: TaskPlannerDatabase | undefined;
}

export const AIPopoutView: React.FC<AIPopoutViewProps> = ({ db = defaultDb }) => {
  const { token } = theme.useToken();
  const [pinned, setPinned] = useState<boolean>(true);
  const [isTauri] = useState<boolean>(() => isTauriApp());
  const [activeScope, setActiveScope] = useState<ActiveScope>(() => {
    if (typeof window === 'undefined') return { type: 'global' };
    const hash = window.location.hash || '';
    const matchType = hash.match(/[?&]scopeType=([^&]+)/);
    const matchId = hash.match(/[?&]scopeId=([^&]+)/);
    const matchTitle = hash.match(/[?&]scopeTitle=([^&]+)/);

    if (matchType && matchType[1]) {
      const type = decodeURIComponent(matchType[1]) as ChatScopeType;
      const id = matchId && matchId[1] ? decodeURIComponent(matchId[1]) : undefined;
      const title = matchTitle && matchTitle[1] ? decodeURIComponent(matchTitle[1]) : undefined;
      return { type, id, title };
    }
    return { type: 'global' };
  });

  // Tauri window listeners and geometry persistence
  useEffect(() => {
    let unlistenScope: (() => void) | undefined;
    let unlistenMoved: (() => void) | undefined;
    let unlistenResized: (() => void) | undefined;

    if (isTauri) {
      isAiWindowAlwaysOnTop().then((state) => setPinned(state));

      Promise.all([
        import('@tauri-apps/api/event'),
        import('@tauri-apps/api/webviewWindow'),
        import('@tauri-apps/api/window'),
      ]).then(([{ listen }, { getCurrentWebviewWindow }, { PhysicalPosition, PhysicalSize, currentMonitor }]) => {
        const win = getCurrentWebviewWindow();

        // Listen for scope changes emitted from main window
        listen<AIScopeParams>(AI_SCOPE_EVENT, (event) => {
          if (event.payload?.type) {
            setActiveScope({
              type: event.payload.type as ChatScopeType,
              id: event.payload.id,
              title: event.payload.title,
            });
          }
        }).then((unsub) => {
          unlistenScope = unsub;
        });

        // Restore window geometry
        try {
          const raw = localStorage.getItem(AI_GEOMETRY_STORAGE_KEY);
          if (raw) {
            const saved = JSON.parse(raw);
            if (saved.width && saved.height) {
              win.setSize(new PhysicalSize(saved.width, saved.height)).catch(() => {});
            }
            if (typeof saved.x === 'number' && typeof saved.y === 'number') {
              currentMonitor().then((monitor) => {
                if (monitor) {
                  const monX = monitor.position.x;
                  const monY = monitor.position.y;
                  const monW = monitor.size.width;
                  const monH = monitor.size.height;
                  const clampedX = Math.max(monX, Math.min(saved.x, monX + monW - 100));
                  const clampedY = Math.max(monY, Math.min(saved.y, monY + monH - 100));
                  win.setPosition(new PhysicalPosition(clampedX, clampedY)).catch(() => {});
                }
              }).catch(() => {});
            }
            if (typeof saved.alwaysOnTop === 'boolean') {
              win.setAlwaysOnTop(saved.alwaysOnTop).catch(() => {});
              setPinned(saved.alwaysOnTop);
            }
          }
        } catch {}

        // Track and persist geometry
        const persistGeometry = async () => {
          try {
            const pos = await win.outerPosition();
            const size = await win.outerSize();
            const aot = await win.isAlwaysOnTop();
            localStorage.setItem(
              AI_GEOMETRY_STORAGE_KEY,
              JSON.stringify({
                x: pos.x,
                y: pos.y,
                width: size.width,
                height: size.height,
                alwaysOnTop: aot,
              })
            );
          } catch {}
        };

        win.onMoved(() => {
          void persistGeometry();
        }).then((unsub) => {
          unlistenMoved = unsub;
        });

        win.onResized(() => {
          void persistGeometry();
        }).then((unsub) => {
          unlistenResized = unsub;
        });
      });
    }

    return () => {
      if (unlistenScope) unlistenScope();
      if (unlistenMoved) unlistenMoved();
      if (unlistenResized) unlistenResized();
    };
  }, [isTauri]);

  const handleTogglePin = async () => {
    const next = !pinned;
    setPinned(next);
    if (isTauri) {
      await setAiWindowAlwaysOnTop(next);
      try {
        const raw = localStorage.getItem(AI_GEOMETRY_STORAGE_KEY);
        const existing = raw ? JSON.parse(raw) : {};
        localStorage.setItem(
          AI_GEOMETRY_STORAGE_KEY,
          JSON.stringify({ ...existing, alwaysOnTop: next })
        );
      } catch {}
    }
  };

  const handleClose = () => {
    void closeCurrentAiPopoutWindow();
  };

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        backgroundColor: token.colorBgContainer,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <AIChatDrawer
        open={true}
        onClose={handleClose}
        isPinned={pinned}
        onTogglePin={handleTogglePin}
        activeScope={activeScope}
        isPopoutWindow={true}
        db={db}
      />
    </div>
  );
};
