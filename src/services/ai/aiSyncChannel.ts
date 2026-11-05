export interface AIChatSyncPayload {
  type: 'message_saved' | 'tab_updated' | 'thread_updated';
  threadId?: string;
  tabId?: string;
  scopeKey?: string;
  timestamp: number;
}

const CHANNEL_NAME = 'taskmate_ai_chat_sync';

let broadcastChannel: BroadcastChannel | null = null;

function getBroadcastChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') {
    return null;
  }
  if (!broadcastChannel) {
    try {
      broadcastChannel = new BroadcastChannel(CHANNEL_NAME);
    } catch {
      broadcastChannel = null;
    }
  }
  return broadcastChannel;
}

export function notifyAIChatSync(payload: Omit<AIChatSyncPayload, 'timestamp'>): void {
  const channel = getBroadcastChannel();
  if (channel) {
    try {
      channel.postMessage({
        ...payload,
        timestamp: Date.now(),
      });
    } catch {
      // ignore message delivery error
    }
  }
}

export function subscribeAIChatSync(callback: (payload: AIChatSyncPayload) => void): () => void {
  const channel = getBroadcastChannel();
  if (!channel) {
    return () => {};
  }
  const handler = (event: MessageEvent<AIChatSyncPayload>) => {
    if (event && event.data && typeof event.data.type === 'string') {
      callback(event.data);
    }
  };
  channel.addEventListener('message', handler);
  return () => {
    channel.removeEventListener('message', handler);
  };
}
