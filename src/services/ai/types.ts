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

export interface ImageConfig {
  endpoint: string;
  defaultModel: string;
}

export interface ImageGenerationOptions {
  prompt: string;
  endpoint?: string;
  apiKey?: string;
  model?: string;
  size?: '1024x1024' | '512x512' | '256x256' | string;
  n?: number;
  quality?: 'standard' | 'hd';
  style?: 'vivid' | 'natural';
  responseFormat?: 'b64_json' | 'url';
  signal?: AbortSignal;
}

export interface ImageGenerationResult {
  url?: string;
  b64Json?: string;
  dataUrl?: string;
  revisedPrompt?: string;
  model: string;
}

