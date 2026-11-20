/**
 * Phase 48 D-17/D-18: truthful Coding Zone connection state + live ghost-dev activity.
 * Event text is rendered strictly as data (T-48-13); no draft sample items are seeded.
 */

import { useEffect, useRef, useState } from 'react';
import type { ConnectionState } from '../../types/codingZone';
import { isTauriApp } from '../../utils/timerPopout';

export type CodingZoneActivityKind = 'tool' | 'result' | 'status';

export interface CodingZoneActivityItem {
  id: string;
  time: string;
  label: string;
  text: string;
  kind: CodingZoneActivityKind;
}

export interface ConnectionInput {
  sshProbeOk: boolean;
  worktreeValid: boolean;
  sessionActive: boolean;
  popoutOpen?: boolean | undefined;
}

/**
 * Priority: session-ended > invalid-worktree > disconnected > connecting > connected.
 * 'connected' requires every live signal; popoutOpen=false does NOT break the main modal,
 * it only prevents claiming a healthy paired-window state.
 */
export function deriveConnectionState(input: ConnectionInput): ConnectionState {
  if (!input.sessionActive) return 'session-ended';
  if (!input.worktreeValid) return 'invalid-worktree';
  if (!input.sshProbeOk) return 'disconnected';
  if (input.popoutOpen === undefined) return 'connecting';
  return 'connected';
}

export const CONNECTION_COPY: Record<ConnectionState, { chip: string; detail: string }> = {
  connected: { chip: 'Đồng bộ', detail: '' },
  connecting: { chip: 'Đang kết nối', detail: '' },
  disconnected: {
    chip: 'Mất kết nối',
    detail: 'Không kết nối được SSH target. Kiểm tra cấu hình SSH và thử lại.',
  },
  'invalid-worktree': {
    chip: 'Worktree không hợp lệ',
    detail: 'Đường dẫn worktree không hợp lệ. Kiểm tra cấu hình repository từ xa.',
  },
  'session-ended': {
    chip: 'Phiên đã kết thúc',
    detail: 'Phiên Agent Developer đã kết thúc. Mở phiên mới để tiếp tục.',
  },
};

const ACTIVITY_LIMIT = 50;
const CHUNK_EVENT = 'ghost-dev:stream-chunk';
const SESSION_UPDATED_EVENT = 'ghost-dev:session-updated';
const SESSION_FINISHED_EVENT = 'ghost-dev:session-finished';

type ActivityListener = (event: string, handler: (event: { payload: unknown }) => void) => Promise<() => void>;
let activityListenOverride: ActivityListener | undefined;
/** Test seam: dynamic Tauri imports bypass module mocks in jsdom. */
export function setActivityListenerForTest(listener: ActivityListener | undefined): void {
  activityListenOverride = listener;
}

interface StreamChunk {
  task_id?: string;
  chunk_type?: string;
  type?: string;
  content?: string;
}

function chunkKind(chunk: StreamChunk): CodingZoneActivityKind {
  const type = String(chunk.type ?? chunk.chunk_type ?? '').toLowerCase();
  if (type.includes('result')) return 'result';
  if (type.includes('status') || type.includes('finish')) return 'status';
  return 'tool';
}

function formatTime(): string {
  return new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

/** Bounded live timeline; every event payload is stored as text, never evaluated. */
export function useCodingZoneActivity(): CodingZoneActivityItem[] {
  const [items, setItems] = useState<CodingZoneActivityItem[]>([]);
  const seqRef = useRef(0);

  useEffect(() => {
    if (!isTauriApp() && !activityListenOverride) return;
    let closed = false;
    const unlisteners: (() => void)[] = [];
    const append = (label: string, text: string, kind: CodingZoneActivityKind) => {
      if (closed) return;
      setItems((previous) => [...previous, {
        id: `cz-activity-${++seqRef.current}`,
        time: formatTime(),
        label,
        text,
        kind,
      }].slice(-ACTIVITY_LIMIT));
    };

    void (async () => {
      try {
        const listen = activityListenOverride ?? (await import('@tauri-apps/api/event')).listen;
        const register = async <T>(event: string, handler: (payload: T) => void) => {
          const unlisten = await listen(event, (received) => {
            if (received.payload !== undefined) handler(received.payload as T);
          });
          if (closed) unlisten();
          else unlisteners.push(unlisten);
        };
        await register<StreamChunk>(CHUNK_EVENT, (chunk) => {
          const content = typeof chunk?.content === 'string' ? chunk.content : '';
          if (!content) return;
          append(chunkKind(chunk), content.slice(0, 500), chunkKind(chunk));
        });
        await register<unknown>(SESSION_UPDATED_EVENT, () => append('status', 'Trạng thái phiên đã cập nhật.', 'status'));
        await register<unknown>(SESSION_FINISHED_EVENT, () => append('status', 'Phiên Agent Developer đã kết thúc.', 'status'));
      } catch {
        // No Tauri event bridge in browser fallback — timeline stays empty, not faked.
      }
    })();

    return () => {
      closed = true;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, []);

  return items;
}
