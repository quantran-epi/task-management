import { AcceptanceEvidence, AcceptanceEvidenceSchema } from './types.js';

const DISALLOWED_FIELD_REGEX =
  /^(prompt|prompttext|rawprompt|query|querytext|userquery|excerpt|rawexcerpt|content|rawcontent|documentbody|body|apikey|token|bearertoken|secret|password|credential)$/i;

const SENSITIVE_STRING_PATTERNS = [
  /(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13})/, // Credit Card PAN
  /(?:bearer\s+)?[a-zA-Z0-9_\-\.]{32,}/i, // Tokens / Keys >= 32 chars
  /BEGIN (?:RSA )?PRIVATE KEY/,
];

export class ProtocolGateViolationError extends Error {
  constructor(message: string) {
    super(`Protocol Gate Violation: ${message}`);
    this.name = 'ProtocolGateViolationError';
  }
}

export function assertMetadataOnlyEvidence(payload: unknown, path: string = 'root'): void {
  if (payload === null || payload === undefined) {
    return;
  }

  if (typeof payload === 'string') {
    for (const pattern of SENSITIVE_STRING_PATTERNS) {
      if (pattern.test(payload)) {
        throw new ProtocolGateViolationError(
          `Sensitive string pattern matched at path "${path}"`
        );
      }
    }
    return;
  }

  if (typeof payload === 'number' || typeof payload === 'boolean') {
    return;
  }

  if (Array.isArray(payload)) {
    payload.forEach((item, index) => {
      assertMetadataOnlyEvidence(item, `${path}[${index}]`);
    });
    return;
  }

  if (typeof payload === 'object') {
    for (const [key, value] of Object.entries(payload)) {
      if (DISALLOWED_FIELD_REGEX.test(key)) {
        throw new ProtocolGateViolationError(
          `Disallowed sensitive field "${key}" detected at path "${path}.${key}"`
        );
      }
      assertMetadataOnlyEvidence(value, `${path}.${key}`);
    }
    return;
  }
}

export function validateAcceptanceEvidence(raw: unknown): AcceptanceEvidence {
  assertMetadataOnlyEvidence(raw);
  const parsed = AcceptanceEvidenceSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ProtocolGateViolationError(
      `Schema validation failed: ${parsed.error.message}`
    );
  }
  return parsed.data;
}
