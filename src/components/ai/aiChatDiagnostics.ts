/**
 * Sanitized AI-chat diagnostics (D-13).
 *
 * Error objects from providers and Zod carry prompts, endpoints, API keys, and payload
 * fragments. Only whitelisted metadata may cross into the console.
 */

export interface AiErrorDescription {
  name: string;
  code?: string;
  issuePaths?: string[];
}

const MAX_CODE_LENGTH = 64;

function safeName(value: unknown): string {
  if (value === null || value === undefined) return 'UnknownError';
  if (typeof value === 'object') {
    const candidate = (value as { name?: unknown }).name;
    if (typeof candidate === 'string' && candidate.length > 0 && candidate.length <= MAX_CODE_LENGTH) {
      return candidate;
    }
  }
  return 'UnknownError';
}

function safeCode(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const candidate = (value as { code?: unknown }).code;
  if (typeof candidate === 'string' && candidate.length > 0 && candidate.length <= MAX_CODE_LENGTH) {
    return candidate;
  }
  return undefined;
}

function safeIssuePaths(value: unknown): string[] | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const issues = (value as { issues?: unknown }).issues;
  if (!Array.isArray(issues) || issues.length === 0) return undefined;
  const paths = issues
    .map((issue) => {
      const issuePath = (issue as { path?: unknown } | null)?.path;
      if (!Array.isArray(issuePath)) return '';
      return issuePath
        .map((segment) => String(segment))
        .filter((segment) => segment.length > 0 && segment.length <= MAX_CODE_LENGTH)
        .join('.');
    })
    .filter((entry) => entry.length > 0);
  return paths.length > 0 ? paths : undefined;
}

export function describeAiError(error: unknown): AiErrorDescription {
  const description: AiErrorDescription = { name: safeName(error) };
  const code = safeCode(error);
  if (code !== undefined) description.code = code;
  const issuePaths = safeIssuePaths(error);
  if (issuePaths !== undefined) description.issuePaths = issuePaths;
  return description;
}

export function logAiChatError(scope: string, error: unknown): void {
  console.warn(`[AIChatDrawer] ${scope}:`, describeAiError(error));
}
