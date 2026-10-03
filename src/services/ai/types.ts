export interface NineRouterConfig {
  endpoint: string;
  defaultModel: string;
  charLimit?: number;
}

export interface ChatCompletionMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface StreamChatCompletionOptions {
  endpoint: string;
  apiKey: string;
  payload: {
    model: string;
    messages: ChatCompletionMessage[];
    temperature?: number;
    max_tokens?: number;
  };
  signal?: AbortSignal;
}

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
