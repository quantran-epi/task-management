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

export interface UseChatTurnOptions {
  scopeKey: string;
  deps: Omit<ChatTurnRuntimeDeps, 'onStatus' | 'onDelta'>;
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
    default:
      return null;
  }
}

/**
 * One turn runtime per `scopeKey`. Hosts that own exactly one conversation use
 * this; multi-conversation hosts must keep a runtime per tab instead, so a
 * background tab's turn is never aborted by switching tabs.
 */
export function useChatTurn({ scopeKey, deps }: UseChatTurnOptions): UseChatTurnResult {
  const depsRef = useRef(deps);
  depsRef.current = deps;

  const [status, setStatus] = useState<ChatTurnStatus>('idle');
  const [streamingText, setStreamingText] = useState('');
  const [pendingApproval, setPendingApproval] = useState<ChatTurnApprovalInfo | null>(null);

  const runtime = useMemo(
    () =>
      createChatTurnRuntime({
        runLoop: depsRef.current.runLoop,
        saveMessage: depsRef.current.saveMessage,
        describeMutation: depsRef.current.describeMutation,
        db: depsRef.current.db,
        onStatus: (next) => {
          setStatus(next);
          if (next !== 'awaiting-approval') setPendingApproval(null);
        },
        onDelta: (text) => setStreamingText((prev) => prev + text),
        onToolEvent: (event) => depsRef.current.onToolEvent?.(event),
        onAwaitingApproval: (info) => {
          setPendingApproval(info);
          depsRef.current.onAwaitingApproval?.(info);
        },
        onCompleted: (message) => depsRef.current.onCompleted?.(message),
        onError: (error) => depsRef.current.onError?.(error),
      }),
    // Runtime identity follows the scope only; callbacks read through depsRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scopeKey]
  );

  useEffect(() => {
    setStatus('idle');
    setStreamingText('');
    setPendingApproval(null);
    return () => runtime.abort();
  }, [runtime]);

  const start = useCallback(
    async (request: ChatTurnRequest) => {
      setStreamingText('');
      setPendingApproval(null);
      return runtime.start(request);
    },
    [runtime]
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

  return {
    status,
    streamingText,
    streamingStatusLabel: stageLabelFor(status),
    pendingApproval,
    start,
    retry,
    abort: runtime.abort,
    resolveApproval,
    runtime,
  };
}
