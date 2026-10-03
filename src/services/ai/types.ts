export interface NineRouterConfig {
  endpoint: string;
  defaultModel: string;
  charLimit?: number;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatCompletionMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content?: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface StreamChatCompletionOptions {
  endpoint: string;
  apiKey: string;
  payload: {
    model: string;
    messages: ChatCompletionMessage[];
    tools?: any[];
    temperature?: number;
    max_tokens?: number;
  };
  signal?: AbortSignal;
}

export type StreamChatChunk =
  | { type: 'text'; delta: string }
  | { type: 'tool_calls'; calls: ToolCall[] };

export interface ConnectionTestOptions {
  endpoint: string;
  apiKey: string;
  signal?: AbortSignal;
}

export interface ConnectionTestResult {
  ok: boolean;
  status: number;
  models: string[];
  error?: string;
}
