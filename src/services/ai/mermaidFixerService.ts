import { completeChatText, stripThinkingBlocks } from './nineRouterClient';
import { getNineRouterApiKey, getNineRouterConfig } from './nineRouterTokenService';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';

export interface MermaidFixRequest {
  code: string;
  errorMessage?: string | undefined;
  prompt?: string | undefined;
  db?: TaskPlannerDatabase | undefined;
  signal?: AbortSignal | undefined;
}

export interface MermaidFixResult {
  fixedCode: string;
  rawResponse?: string | undefined;
}

/**
 * Extracts mermaid code from markdown code fences or raw text.
 */
export function extractMermaidCode(rawText: string): string {
  const stripped = stripThinkingBlocks(rawText).trim();
  const match = stripped.match(/```(?:mermaid)?\s*\r?\n([\s\S]*?)```/i);
  if (match && match[1]) {
    return match[1].trim();
  }
  // If wrapped in backticks without lang
  if (stripped.startsWith('```') && stripped.endsWith('```')) {
    return stripped.replace(/^```[a-zA-Z0-9_-]*\s*\r?\n/, '').replace(/\s*```$/, '').trim();
  }
  return stripped;
}

/**
 * Calls the configured AI model to fix syntax errors in a Mermaid diagram.
 */
export async function fixMermaidWithAi(req: MermaidFixRequest): Promise<MermaidFixResult> {
  const database = req.db ?? defaultDb;
  const [apiKey, config] = await Promise.all([
    getNineRouterApiKey(database),
    getNineRouterConfig(database),
  ]);

  if (!config.endpoint || !config.defaultModel) {
    throw new Error('AI chưa được cấu hình. Vui lòng thiết lập Endpoint & Model trong Cài đặt AI.');
  }

  const systemPrompt = [
    'You are an expert in Mermaid.js syntax and diagram engineering.',
    'Your goal is to inspect broken or invalid Mermaid diagrams, repair all syntax errors, and return 100% valid Mermaid code compatible with Mermaid v11.',
    'Common syntax pitfalls to fix:',
    '- Node labels containing parentheses, brackets, colons, slashes, or special characters MUST be quoted in double quotes, e.g. A["Node (1/2): status"]',
    '- Subgraph definitions must have matching `end` statements and proper indentation',
    '- Arrow types must be standard (--> , --- , -.-> , ==> , etc.)',
    '- Class/State/ER diagrams must follow valid Mermaid grammar',
    'CRITICAL: Return ONLY the fixed Mermaid diagram code wrapped inside ```mermaid and ``` fences. Do not output conversational explanations or notes.',
  ].join('\n');

  const userPrompt = [
    req.prompt ? `Custom request: ${req.prompt}\n` : '',
    req.errorMessage ? `Reported Error from Mermaid Engine:\n${req.errorMessage}\n` : '',
    'Broken Mermaid Code:',
    '```mermaid',
    req.code,
    '```',
    '',
    'Please fix the syntax and output the corrected diagram code.',
  ].filter(Boolean).join('\n');

  const rawContent = await completeChatText({
    endpoint: config.endpoint,
    apiKey,
    model: config.defaultModel,
    temperature: 0.1,
    maxTokens: 3000,
    signal: req.signal ?? new AbortController().signal,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });

  const fixedCode = extractMermaidCode(rawContent);
  if (!fixedCode) {
    throw new Error('AI không trả về mã Mermaid hợp lệ');
  }

  return {
    fixedCode,
    rawResponse: rawContent,
  };
}
