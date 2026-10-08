import type { DlpCategory } from '../../types/dlp';

/**
 * Capped context window size in characters (80 chars per D-19 / Plan 16-03 Task 2).
 */
export const MAX_CONTEXT_LENGTH = 80;

/**
 * Masks PAN according to standard banking safety rules:
 * Retains at most first 6 and last 4 digits (or fewer if short), dots out the rest.
 */
export function maskPan(rawDigits: string): string {
  const len = rawDigits.length;
  if (len < 10) {
    return '••••';
  }
  const prefix = rawDigits.slice(0, 6);
  const suffix = rawDigits.slice(-4);
  const middle = '•'.repeat(Math.max(4, len - 10));
  return `${prefix}${middle}${suffix}`;
}

/**
 * Masks CVV: never reveals any digits.
 */
export function maskCvv(): string {
  return '•••';
}

/**
 * Masks PIN or PIN Block: never reveals clear digits or hex nibbles.
 */
export function maskPin(): string {
  return '••••';
}

/**
 * Masks HSM Key: never reveals cryptographic key material.
 */
export function maskHsmKey(keyType?: string): string {
  return keyType ? `[${keyType}: REDACTED_KEY]` : '[HSM_KEY: REDACTED]';
}

/**
 * Masks credentials (passwords, tokens, private keys).
 */
export function maskCredential(credType?: string): string {
  return credType ? `[${credType}: REDACTED]` : '[CREDENTIAL: REDACTED]';
}

/**
 * Masks customer PII (CCCD, email, phone number).
 */
export function maskPii(piiType: 'CCCD' | 'EMAIL' | 'PHONE', value: string): string {
  if (piiType === 'EMAIL') {
    const atIdx = value.indexOf('@');
    if (atIdx > 1) {
      const first = value.charAt(0);
      const domain = value.slice(atIdx);
      return `${first}•••${domain}`;
    }
    return '•••@•••';
  }
  if (piiType === 'CCCD') {
    // Retain first 3 and last 3 digits, mask middle 6
    if (value.length === 12) {
      return `${value.slice(0, 3)}••••••${value.slice(-3)}`;
    }
    return '••••••••••••';
  }
  if (piiType === 'PHONE') {
    // Retain last 3 digits
    if (value.length >= 7) {
      return `••••••${value.slice(-3)}`;
    }
    return '••••••';
  }
  return '[PII: REDACTED]';
}

/**
 * Returns a category-safe replacement for the sensitive span.
 */
export function getMaskedReplacement(
  category: DlpCategory,
  rawSpan: string,
  extraHint?: string
): string {
  switch (category) {
    case 'PAN': {
      const digits = rawSpan.replace(/\D/g, '');
      return maskPan(digits);
    }
    case 'CVV':
      return maskCvv();
    case 'PIN':
      return maskPin();
    case 'HSM_KEY':
      return maskHsmKey(extraHint);
    case 'CREDENTIAL':
      return maskCredential(extraHint);
    case 'PII': {
      if (extraHint === 'EMAIL') return maskPii('EMAIL', rawSpan);
      if (extraHint === 'CCCD') return maskPii('CCCD', rawSpan.replace(/\D/g, ''));
      if (extraHint === 'PHONE') return maskPii('PHONE', rawSpan.replace(/\D/g, ''));
      return '[PII: REDACTED]';
    }
  }
}

/**
 * Constructs a bounded masked context snippet around the matched span.
 * Replaces all sensitive matches with category-safe masks in the context window
 * and caps total context to 80 chars.
 * Never leaks raw matches in output.
 */
export function buildMaskedContext(
  sanitizedText: string,
  startOffset: number,
  endOffset: number,
  maskedReplacement: string,
  maxContextLength = MAX_CONTEXT_LENGTH
): string {
  const textLength = sanitizedText.length;

  const availableBudget = Math.max(0, maxContextLength - maskedReplacement.length);
  const halfBudget = Math.floor(availableBudget / 2);

  let prefixStart = Math.max(0, startOffset - halfBudget);
  let suffixEnd = Math.min(textLength, endOffset + halfBudget);

  const usedPrefix = startOffset - prefixStart;
  const usedSuffix = suffixEnd - endOffset;

  if (usedPrefix < halfBudget) {
    const extraForSuffix = halfBudget - usedPrefix;
    suffixEnd = Math.min(textLength, suffixEnd + extraForSuffix);
  } else if (usedSuffix < halfBudget) {
    const extraForPrefix = halfBudget - usedSuffix;
    prefixStart = Math.max(0, prefixStart - extraForPrefix);
  }

  let prefix = sanitizedText.slice(prefixStart, startOffset);
  let suffix = sanitizedText.slice(endOffset, suffixEnd);

  prefix = prefix.replace(/\r?\n/g, ' ');
  suffix = suffix.replace(/\r?\n/g, ' ');

  const leftEllipsis = prefixStart > 0 ? '...' : '';
  const rightEllipsis = suffixEnd < textLength ? '...' : '';

  return `${leftEllipsis}${prefix}${maskedReplacement}${suffix}${rightEllipsis}`;
}
