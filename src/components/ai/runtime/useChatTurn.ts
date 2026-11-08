import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createChatTurnRuntime,
  type ChatTurnApprovalInfo,
  type ChatTurnOutcome,
  type ChatTurnRequest,
  type ChatTurnRuntime,
  type ChatTurnRuntimeDeps,
  type ChatTurnStatus,
} from './chatTurnRuntime';
import { aiTurnManager, ACTIVE_AI_STATUSES } from '../../../services/ai/aiTurnManager';

export interface UseChatTurnOptions {
  scopeKey: string;
  deps: Omit<ChatTurnRuntimeDeps, 'onStatus' | 'onDelta'>;
  /** When true, the turn continues executing in the background across view switches and unmounts */
  background?: boolean;
}

export interface UseChatTurnResult {
  status: ChatTurnStatus;
  streamingText: string;
  streamingStatusLabel: string | null;
  pendingApproval: ChatTurnApprovalInfo | null;
  start: (request: ChatTurnRequest) => Promise<ChatTurnOutcome>;
  retry: () => Promise<ChatTurnOutcome>;
  abort: () => void;
  resolveApproval: (approved: boolean) => void;
  runtime: ChatTurnRuntime;
}

/** UI-SPEC staged labels (D-19). Raw reasoning is never surfaced (D-04). */
export function stageLabelFor(status: ChatTurnStatus): string | null {
  switch (status) {
    case 'preparing':
      return 'Chuẩn bị ngữ cảnh';
    case 'tool':
      return 'Truy xuất công cụ';
    case 'streaming':
    case 'synthesizing':
      return 'Đang phản hồi';
    case 'awaiting-approval':
      return 'Chờ phê duyệt';
    case 'tool-limit':
      return null;
    default:
      return null;
  }
}

// Module-level registry for background runtimes
const globalScopeTurnRuntimes = new Map<string, ChatTurnRuntime>();

/**
 * One turn runtime per `scopeKey`. Hosts that own exactly one conversation use
 * this; multi-conversation hosts must keep a runtime per tab instead, so a
 * background tab's turn is never aborted by switching tabs.
 */
export function useChatTurn({ scopeKey, deps, background = false }: UseChatTurnOptions): UseChatTurnResult {
  const depsRef = useRef(deps);
  depsRef.current = deps;

  const existingTurn = background ? aiTurnManager.getTurn(scopeKey) : undefined;
  const isExistingActive = existingTurn && ACTIVE_AI_STATUSES.includes(existingTurn.status);
  const [status, setStatus] = useState<ChatTurnStatus>(() => (isExistingActive ? existingTurn.status : 'idle'));
  const [streamingText, setStreamingText] = useState<string>(() => (isExistingActive ? existingTurn.streamingText : ''));
  const [pendingApproval, setPendingApproval] = useState<ChatTurnApprovalInfo | null>(null);

  const setStatusRef = useRef(setStatus);
  setStatusRef.current = setStatus;
  const setStreamingTextRef = useRef(setStreamingText);
  setStreamingTextRef.current = setStreamingText;

  const runtime = useMemo(() => {
    if (background) {
      const cached = globalScopeTurnRuntimes.get(scopeKey);
      if (cached) return cached;
    }

    const created = createChatTurnRuntime({
      runLoop: depsRef.current.runLoop,
      saveMessage: depsRef.current.saveMessage,
      describeMutation: depsRef.current.describeMutation,
      ...(depsRef.current.preparePatch ? { preparePatch: depsRef.current.preparePatch } : {}),
      db: depsRef.current.db,
      onStatus: (next) => {
        setStatusRef.current(next);
        if (next === 'tool-limit') setStreamingTextRef.current('');
        if (next !== 'awaiting-approval') setPendingApproval(null);

        if (background) {
          if (ACTIVE_AI_STATUSES.includes(next)) {
            aiTurnManager.registerTurn({
              id: scopeKey,
              scopeKey,
              title: scopeKey.startsWith('sdlc:') ? `SDLC: ${scopeKey.split(':').slice(-1)[0]}` : scopeKey,
              status: next,
              streamingStatusLabel: stageLabelFor(next),
              streamingText: '',
              abort: () => created.abort(),
            });
          } else {
            aiTurnManager.finishTurn(scopeKey, next);
          }
        }
      },
      onDelta: (text) => {
        setStreamingTextRef.current((prev) => {
          const nextText = prev + text;
          if (background) {
            aiTurnManager.updateTurn(scopeKey, { streamingText: nextText });
          }
          return nextText;
        });
      },
      onToolEvent: (event) => {
        depsRef.current.onToolEvent?.(event);
        if (background) {
          const turn = aiTurnManager.getTurn(scopeKey);
          if (turn) {
            aiTurnManager.updateTurn(scopeKey, {
              toolEvents: [...turn.toolEvents, event],
            });
          }
        }
      },
      onAwaitingApproval: (info) => {
        setPendingApproval(info);
        depsRef.current.onAwaitingApproval?.(info);
      },
      onCompleted: (message) => {
        depsRef.current.onCompleted?.(message);
        if (background) aiTurnManager.finishTurn(scopeKey, 'complete');
      },
      onError: (error) => {
        setStatusRef.current('error');
        depsRef.current.onError?.(error);
        if (background) aiTurnManager.finishTurn(scopeKey, 'error');
      },
    });

    if (background) {
      globalScopeTurnRuntimes.set(scopeKey, created);
    }
    return created;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, background]);

  // Sync state whenever scopeKey changes (e.g. switching SDLC steps)
  useEffect(() => {
    const turn = aiTurnManager.getTurn(scopeKey);
    if (background && turn && ACTIVE_AI_STATUSES.includes(turn.status)) {
      setStatus(turn.status);
      setStreamingText(turn.streamingText);
    } else {
      setStatus('idle');
      setStreamingText('');
      setPendingApproval(null);
    }
  }, [scopeKey, background]);

  // Sync with background turn manager while running
  useEffect(() => {
    if (!background) return undefined;
    const syncState = () => {
      const turn = aiTurnManager.getTurn(scopeKey);
      if (turn && ACTIVE_AI_STATUSES.includes(turn.status)) {
        setStatus(turn.status);
        setStreamingText(turn.streamingText);
      } else {
        const runtimeStatus = runtime.isRunning() ? runtime.getStatus() : 'idle';
        if (!ACTIVE_AI_STATUSES.includes(runtimeStatus)) {
          setStatus(runtimeStatus === 'complete' ? 'idle' : runtimeStatus);
          setStreamingText('');
        }
      }
    };
    return aiTurnManager.subscribe(syncState);
  }, [background, scopeKey, runtime]);

  useEffect(() => {
    if (!background) {
      return () => runtime.abort();
    }
    return undefined;
  }, [runtime, background]);

  const start = useCallback(
    async (request: ChatTurnRequest) => {
      setStreamingText('');
      setPendingApproval(null);
      if (background) {
        aiTurnManager.registerTurn({
          id: scopeKey,
          scopeKey,
          title: scopeKey.startsWith('sdlc:') ? `SDLC: ${scopeKey.split(':').slice(-1)[0]}` : scopeKey,
          status: 'preparing',
          streamingStatusLabel: stageLabelFor('preparing'),
          streamingText: '',
          abort: () => runtime.abort(),
        });
      }
      return runtime.start(request);
    },
    [runtime, background, scopeKey]
  );

  const retry = useCallback(async () => {
    setStreamingText('');
    setPendingApproval(null);
    return runtime.retry();
  }, [runtime]);

  const resolveApproval = useCallback(
    (approved: boolean) => {
      setPendingApproval(null);
      runtime.resolveApproval(approved);
    },
    [runtime]
  );

  const abort = useCallback(() => {
    runtime.abort();
    if (background) {
      aiTurnManager.abortTurn(scopeKey);
    }
  }, [runtime, background, scopeKey]);

  return {
    status,
    streamingText,
    streamingStatusLabel: stageLabelFor(status),
    pendingApproval,
    start,
    retry,
    abort,
    resolveApproval,
    runtime,
  };
}
