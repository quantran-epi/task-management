/**
 * Phase 48 D-13/D-15: versioned, echo-safe Coding Zone state bus.
 * BroadcastChannel is the convenience transport between same-origin windows;
 * Tauri emitTo is the authoritative fallback when origins differ (research A1).
 * Every event carries originWindowId + a monotonic revision; self/stale/malformed
 * events are ignored (T-48-10).
 */

import { useCallback, useEffect, useRef } from 'react';
import type { CodingZoneSyncPayload } from '../types/codingZone';
import {
  isCodingZonePopoutOpen,
  isTauriApp,
  CODING_ZONE_LABEL,
  CODING_ZONE_HANDOFF_EVENT,
  CODING_ZONE_SYNC_EVENT,
} from '../utils/codingZonePopout';

export type CodingZoneSyncKind = CodingZoneSyncPayload['kind'];
export type { CodingZoneSyncPayload };

export type CodingZoneHunkState = 'pending' | 'accepted' | 'rejected';

/** Shared slice passed by targeted handoff and kept in lockstep by revisioned sync events. */
export interface CodingZoneSharedState {
  tabs: { id: string; filePath: string; kind: 'code' | 'diff' }[];
  activeTabId: string;
  activeFile: string | null;
  hunkStates: Record<string, CodingZoneHunkState>;
  treeScope: 'diff' | 'all';
  treeQuery: string;
  messages: { id: string; author: string; time: string; text: string; kind?: 'chat' | 'agent' | 'synthesis' | undefined }[];
  activity: { id: string; time: string; label: string; text: string; kind: 'tool' | 'result' | 'status' }[];
}

const CHANNEL_NAME = 'taskmate_coding_zone_sync';
const KINDS: readonly CodingZoneSyncKind[] = ['tabs', 'activeFile', 'hunk', 'chat', 'activity', 'full', 'request-state'];
const MAX_REVISION = Number.MAX_SAFE_INTEGER;

const channels = new Map<string, BroadcastChannel | null>();
/** One channel per window id, so a shared module instance never self-delivers its own posts. */
function getSharedChannel(windowId: string): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  if (!channels.has(windowId)) {
    try {
      channels.set(windowId, new BroadcastChannel(CHANNEL_NAME));
    } catch {
      channels.set(windowId, null);
    }
  }
  return channels.get(windowId) ?? null;
}

export function isValidCodingZoneSyncPayload(value: unknown): value is CodingZoneSyncPayload {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<CodingZoneSyncPayload>;
  return typeof item.originWindowId === 'string'
    && item.originWindowId.length > 0
    && typeof item.revision === 'number'
    && Number.isInteger(item.revision)
    && item.revision >= 0
    && item.revision <= MAX_REVISION
    && typeof item.kind === 'string'
    && KINDS.includes(item.kind as CodingZoneSyncKind)
    && 'payload' in item;
}

type TauriEmitter = (label: string, event: string, payload: unknown) => Promise<void>;
type TauriListener = (event: string, handler: (event: { payload: unknown }) => void) => Promise<() => void>;

let emitOverride: TauriEmitter | undefined;
let listenOverride: TauriListener | undefined;
const allUnlisteners = new Set<() => void>();
/** Test seams: dynamic Tauri imports bypass module mocks in jsdom. */
export function setCodingZoneEmitterForTest(emitter: TauriEmitter | undefined): void {
  emitOverride = emitter;
}
export function setCodingZoneListenerForTest(listener: TauriListener | undefined): void {
  listenOverride = listener;
}
export function getCodingZoneListenerCountForTest(): number {
  return allUnlisteners.size;
}

export interface UseCodingZoneSyncResult {
  /** Increment the revision and broadcast a state slice to the other window. */
  publish: (kind: CodingZoneSyncKind, payload: unknown) => void;
  /** Ask the owner window to republish its latest full snapshot. */
  requestState: () => void;
  /** True when the paired Coding Zone window is currently open. */
  pairedWindowOpen: () => Promise<boolean>;
}

/**
 * @param windowId unique id for THIS webview; must differ between main and popout.
 * @param onState called only for valid events from another window with a newer revision.
 * @param getSnapshot owner window's latest full state; answering a late popout's request prevents handoff races.
 */
export function useCodingZoneSync(
  windowId: string,
  onState: (event: CodingZoneSyncPayload) => void,
  getSnapshot?: () => unknown
): UseCodingZoneSyncResult {
  const revisionRef = useRef(0);
  const seenRef = useRef<number>(-1);
  const handlerRef = useRef(onState);
  const snapshotRef = useRef(getSnapshot);
  handlerRef.current = onState;
  snapshotRef.current = getSnapshot;

  const receive = useCallback((candidate: unknown) => {
    if (!isValidCodingZoneSyncPayload(candidate)) return;
    if (candidate.originWindowId === windowId) return;
    if (candidate.kind === 'request-state') {
      const snapshot = snapshotRef.current?.();
      if (snapshot !== undefined) {
        const response: CodingZoneSyncPayload = {
          originWindowId: windowId,
          revision: ++revisionRef.current,
          kind: 'full',
          payload: snapshot,
        };
        getSharedChannel(windowId)?.postMessage(response);
        if (emitOverride) {
          void emitOverride(CODING_ZONE_LABEL, CODING_ZONE_SYNC_EVENT, response).catch(() => {});
        } else if (isTauriApp()) {
          void (async () => {
            try {
              const { emitTo } = await import('@tauri-apps/api/event');
              await emitTo(CODING_ZONE_LABEL, CODING_ZONE_SYNC_EVENT, response);
            } catch {
              // BroadcastChannel already answered when origins match.
            }
          })();
        } else if (typeof window !== 'undefined') {
          window.postMessage({ type: CODING_ZONE_SYNC_EVENT, payload: response }, window.location.origin);
        }
      }
      return;
    }
    if (candidate.revision <= seenRef.current) return;
    seenRef.current = candidate.revision;
    handlerRef.current(candidate);
  }, [windowId]);

  useEffect(() => {
    seenRef.current = -1;
    let closed = false;
    const channel = getSharedChannel(windowId);
    const onChannelMessage = (event: MessageEvent<unknown>) => receive(event.data);
    channel?.addEventListener('message', onChannelMessage);

    let unlistenSync: (() => void) | undefined;
    let unlistenHandoff: (() => void) | undefined;
    let unlistenMessage: ((event: MessageEvent) => void) | undefined;

    if (isTauriApp()) {
      void (async () => {
        try {
          const listen = listenOverride ?? (await import('@tauri-apps/api/event')).listen;
          unlistenSync = await listen(CODING_ZONE_SYNC_EVENT, (event) => receive(event.payload));
          allUnlisteners.add(unlistenSync);
          unlistenHandoff = await listen(CODING_ZONE_HANDOFF_EVENT, (event) => receive(event.payload));
          allUnlisteners.add(unlistenHandoff);
          if (closed) { unlistenSync(); unlistenHandoff(); allUnlisteners.delete(unlistenSync); allUnlisteners.delete(unlistenHandoff); }
        } catch {
          // Tauri unavailable — BroadcastChannel remains the transport.
        }
      })();
    } else if (typeof window !== 'undefined') {
      unlistenMessage = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        const data = event.data as { type?: string } | null;
        if (!data || typeof data !== 'object') return;
        if (data.type === CODING_ZONE_HANDOFF_EVENT || data.type === CODING_ZONE_SYNC_EVENT) {
          receive((data as { payload?: unknown }).payload);
        }
      };
      window.addEventListener('message', unlistenMessage);
    }

    return () => {
      closed = true;
      channel?.removeEventListener('message', onChannelMessage);
      channels.delete(windowId);
      if (unlistenSync) { unlistenSync(); allUnlisteners.delete(unlistenSync); }
      if (unlistenHandoff) { unlistenHandoff(); allUnlisteners.delete(unlistenHandoff); }
      if (unlistenMessage && typeof window !== 'undefined') {
        window.removeEventListener('message', unlistenMessage);
      }
    };
  }, [receive]);

  const publish = useCallback((kind: CodingZoneSyncKind, payload: unknown) => {
    const event: CodingZoneSyncPayload = {
      originWindowId: windowId,
      revision: ++revisionRef.current,
      kind,
      payload,
    };
    try {
      getSharedChannel(windowId)?.postMessage(event);
    } catch {
      // Fall through to Tauri targeted send.
    }
    if (emitOverride) {
      void emitOverride(CODING_ZONE_LABEL, CODING_ZONE_SYNC_EVENT, event).catch(() => {});
    } else if (isTauriApp()) {
      void (async () => {
        try {
          const { emitTo } = await import('@tauri-apps/api/event');
          await emitTo(CODING_ZONE_LABEL, CODING_ZONE_SYNC_EVENT, event);
        } catch {
          // No target window — BroadcastChannel (if any) already delivered it.
        }
      })();
    } else if (typeof window !== 'undefined') {
      window.postMessage({ type: CODING_ZONE_SYNC_EVENT, payload: event }, window.location.origin);
    }
  }, [windowId]);

  const requestState = useCallback(() => {
    const event: CodingZoneSyncPayload = {
      originWindowId: windowId,
      revision: 0,
      kind: 'request-state',
      payload: null,
    };
    getSharedChannel(windowId)?.postMessage(event);
    if (emitOverride) {
      void emitOverride(CODING_ZONE_LABEL, CODING_ZONE_SYNC_EVENT, event).catch(() => {});
    } else if (isTauriApp()) {
      void (async () => {
        try {
          const { emitTo } = await import('@tauri-apps/api/event');
          await emitTo(CODING_ZONE_LABEL, CODING_ZONE_SYNC_EVENT, event);
        } catch {
          // BroadcastChannel already delivered the request when origins match.
        }
      })();
    } else if (typeof window !== 'undefined') {
      window.postMessage({ type: CODING_ZONE_SYNC_EVENT, payload: event }, window.location.origin);
    }
  }, [windowId]);

  const pairedWindowOpen = useCallback(() => isCodingZonePopoutOpen(), []);

  return { publish, requestState, pairedWindowOpen };
}
