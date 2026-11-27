import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAntdToken } from '../components/ui';
import { db as defaultDb, type TaskPlannerDatabase } from '../db';
import { chatWindowDb } from '../db/chatWindowDb';
import { AIChatDrawer, type ActiveScope } from '../components/ai/AIChatDrawer';
import { AISettingsDrawer } from '../components/ai/AISettingsDrawer';
import {
  isTauriApp,
  isAiWindowAlwaysOnTop,
  setAiWindowAlwaysOnTop,
  closeCurrentAiPopoutWindow,
  AI_SCOPE_EVENT,
  AI_DRAFT_EVENT,
  type AIScopeParams,
  type AIDraftPayload,
} from '../utils/aiPopout';
import type { ChatScopeType } from '../types/models';
import { useAIChat } from '../context/AIChatContext';
import {
  DEVICE_POLICY_SETTINGS_KEY,
  devicePolicySchema,
  resolveEffectiveChatConfig,
  type TelegramDevicePolicy,
} from '../services/telegram/telegramDevicePolicy';
import {
  ACCESS_STATE_SETTINGS_KEY,
  pollStandaloneAccess,
  saveAccessState,
  type StandaloneAccessState,
} from '../services/telegram/standaloneAccessService';

const AI_GEOMETRY_STORAGE_KEY = 'planner:ai_popout_geometry';

function readAccessStateFromRecord(value: unknown): StandaloneAccessState | undefined {
  // Poll writes through saveAccessState; this mirror keeps the live-query path synchronous
  // and refuses malformed cache rows so a bad value can never grant access.
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Partial<StandaloneAccessState>;
  if (candidate.status !== 'approved' && candidate.status !== 'pending' &&
      candidate.status !== 'denied' && candidate.status !== 'revoked' && candidate.status !== 'expired') return undefined;
  if (!/^\d{6,12}$/.test(candidate.telegramUserId ?? '')) return undefined;
  return candidate as StandaloneAccessState;
}

export interface AIPopoutViewProps {
  db?: TaskPlannerDatabase | undefined;
  standaloneChat?: boolean | undefined;
}

export const AIPopoutView: React.FC<AIPopoutViewProps> = ({ db, standaloneChat = false }) => {
  const activeDb = db ?? (standaloneChat ? chatWindowDb : defaultDb);
  const { token } = useAntdToken();
  const { setPendingDraft } = useAIChat();
  const [pinned, setPinned] = useState<boolean>(true);
  const [isTauri] = useState<boolean>(() => isTauriApp());
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Live query: policy applied/revoked in settings propagates to chat without close/reopen.
  const policyRecord = useLiveQuery(
    () => activeDb.settings.get(DEVICE_POLICY_SETTINGS_KEY),
    [activeDb]
  );
  const parsed = devicePolicySchema.safeParse(policyRecord?.value);
  const devicePolicy: TelegramDevicePolicy | undefined = parsed.success ? parsed.data : undefined;
  const accessRecord = useLiveQuery(() => activeDb.settings.get(ACCESS_STATE_SETTINGS_KEY), [activeDb]);
  const accessState: StandaloneAccessState | undefined = readAccessStateFromRecord(accessRecord?.value);
  const [activeScope, setActiveScope] = useState<ActiveScope>(() => {
    if (standaloneChat || typeof window === 'undefined') return { type: 'global' };
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

  const effectiveChat = resolveEffectiveChatConfig({ defaultModel: '' }, devicePolicy);
  // Standalone needs BOTH a valid policy and a matching approved access state.
  const policyState = standaloneChat && (accessState?.status !== 'approved' || !devicePolicy)
    ? 'blocked'
    : effectiveChat.policyState === 'expired' ? 'blocked' : effectiveChat.policyState;

  // Standalone: poll the local bridge so admin Apply/revoke lands in this open window.
  const bridgeIdentity = accessState?.telegramUserId ?? devicePolicy?.telegramUserId;
  useEffect(() => {
    if (!standaloneChat || !bridgeIdentity) return undefined;
    const cleanup = pollStandaloneAccess(activeDb, bridgeIdentity, (state) => {
      void saveAccessState(activeDb, state);
    });
    return cleanup;
  }, [standaloneChat, bridgeIdentity, activeDb]);

  // Tauri window listeners and geometry persistence
  useEffect(() => {
    if (standaloneChat) return undefined;
    let unlistenScope: (() => void) | undefined;
    let unlistenDraft: (() => void) | undefined;
    let unlistenMoved: (() => void) | undefined;
    let unlistenResized: (() => void) | undefined;

    // Seed the composer from an incoming draft (and its scope), never auto-send.
    const applyDraft = (payload: AIDraftPayload) => {
      if (typeof payload.text !== 'string' || !payload.text) return;
      setPendingDraft(payload.text);
      if (payload.scope?.type) {
        setActiveScope({
          type: payload.scope.type as ChatScopeType,
          id: payload.scope.id,
          title: payload.scope.title,
        });
      }
    };

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

        listen<AIDraftPayload>(AI_DRAFT_EVENT, (event) => {
          if (event.payload) applyDraft(event.payload);
        }).then((unsub) => {
          unlistenDraft = unsub;
        });

        // Unmaximize and restore window geometry
        win.unmaximize().catch(() => {});
        try {
          const raw = localStorage.getItem(AI_GEOMETRY_STORAGE_KEY);
          if (raw) {
            const saved = JSON.parse(raw);
            if (saved.width && saved.height) {
              const clampedW = Math.max(360, Math.min(saved.width, 560));
              const clampedH = Math.max(480, Math.min(saved.height, 800));
              win.setSize(new PhysicalSize(clampedW, clampedH)).catch(() => {});
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
          } else {
            win.setSize(new PhysicalSize(440, 680)).catch(() => {});
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
    } else {
      // Browser popup: same-origin postMessage from the main window.
      const onMessage = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        const data = event.data as { type?: string } & Partial<AIDraftPayload>;
        if (data?.type !== AI_DRAFT_EVENT) return;
        applyDraft(data.scope ? { text: data.text ?? '', scope: data.scope } : { text: data.text ?? '' });
      };
      window.addEventListener('message', onMessage);
      return () => window.removeEventListener('message', onMessage);
    }

    return () => {
      if (unlistenScope) unlistenScope();
      if (unlistenDraft) unlistenDraft();
      if (unlistenMoved) unlistenMoved();
      if (unlistenResized) unlistenResized();
    };
  }, [isTauri, setPendingDraft, standaloneChat]);

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
        color: token.colorText,
        fontFamily: token.fontFamily || "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <style>{`
        * {
          font-family: ${token.fontFamily || "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"} !important;
        }
      `}</style>
      <AIChatDrawer
        open={true}
        onClose={standaloneChat ? () => undefined : handleClose}
        isPinned={standaloneChat ? false : pinned}
        onTogglePin={standaloneChat ? undefined : handleTogglePin}
        activeScope={activeScope}
        isPopoutWindow={true}
        isStandaloneChat={standaloneChat}
        devicePolicy={devicePolicy}
        policyState={policyState}
        onOpenSettings={standaloneChat ? () => setSettingsOpen(true) : undefined}
        db={activeDb}
      />
      <AISettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} db={activeDb} standalone={standaloneChat} />
    </div>
  );
};
