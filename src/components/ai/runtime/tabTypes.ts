import type { ChatGeneratedFile, ChatTokenUsage } from '../../../types/models';

export type TabRuntimeStatus =
  | 'idle'
  | 'processing'
  | 'interrupted'
  | 'error'
  | 'stale'
  | 'complete';

export type TabRuntimeErrorCode =
  | 'aborted'
  | 'timeout'
  | 'invalid_response'
  | 'tool_schema'
  | 'request_failed';

export interface TabRuntimeError {
  code: TabRuntimeErrorCode;
  message: string;
  requestId: string;
}

export interface TabRuntime {
  tabId: string;
  threadId: string;
  status: TabRuntimeStatus;
  draft: string;
  attachments: File[];
  references: string[];
  streamingText: string;
  streamingStatus: string | null;
  groundedLoadingStatus: string | null;
  toolProgress: string | null;
  partialBuffer: string;
  generatedFiles: ChatGeneratedFile[];
  error: TabRuntimeError | null;
  lastSubmittedText: string;
  retryUserMessageId: string | null;
  wizardState: unknown;
  exportState: unknown;
  model: string;
  analysisMode: boolean;
  mcpEnabled: boolean;
  knowledgeEnabled: boolean;
  promptOptions: Record<string, unknown>;
  tokenUsage: ChatTokenUsage | undefined;
  requestController?: AbortController;
  confirmationResolver?: ((confirmed: boolean) => void) | undefined;
  pendingConfirmation: {
    toolName: string;
    summary: string;
    args?: Record<string, unknown>;
  } | null;
}

export type TabRuntimePatch = Partial<Omit<TabRuntime, 'tabId' | 'threadId'>>;

export function createTabRuntime(
  tabId: string,
  threadId: string,
  overrides: Partial<TabRuntime> = {}
): TabRuntime {
  return {
    tabId,
    threadId,
    status: 'idle',
    draft: '',
    attachments: [],
    references: [],
    streamingText: '',
    streamingStatus: null,
    groundedLoadingStatus: null,
    toolProgress: null,
    partialBuffer: '',
    generatedFiles: [],
    error: null,
    lastSubmittedText: '',
    retryUserMessageId: null,
    wizardState: null,
    exportState: null,
    model: 'gpt-4o',
    analysisMode: false,
    mcpEnabled: true,
    knowledgeEnabled: false,
    promptOptions: {},
    tokenUsage: undefined,
    pendingConfirmation: null,
    ...overrides,
  };
}
