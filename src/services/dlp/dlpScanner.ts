import { generateId } from '../../utils/uuid';
import type {
  DlpCategory,
  DlpFinding,
  OutboundTextField,
  OutboundUserText,
} from '../../types/dlp';
import { buildMaskedContext, getMaskedReplacement } from './dlpMasker';

/**
 * Strict category specificity precedence per D-19 and Plan 16-03 Task 1:
 * CREDENTIAL > HSM_KEY > PIN > CVV > PAN > PII
 */
export const CATEGORY_PRECEDENCE: Record<DlpCategory, number> = {
  CREDENTIAL: 6,
  HSM_KEY: 5,
  PIN: 4,
  CVV: 3,
  PAN: 2,
  PII: 1,
};

/**
 * Luhn checksum algorithm for PAN validation (D-15).
 */
export function isValidLuhn(digitsOnly: string): boolean {
  if (digitsOnly.length < 13 || digitsOnly.length > 19) {
    return false;
  }
  let sum = 0;
  let alternate = false;
  for (let i = digitsOnly.length - 1; i >= 0; i--) {
    const code = digitsOnly.charCodeAt(i);
    if (code < 48 || code > 57) return false;
    let n = code - 48;
    if (alternate) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}

/**
 * Internal raw candidate finding before overlap resolution and masking.
 */
interface RawFindingCandidate {
  category: DlpCategory;
  startOffset: number;
  endOffset: number;
  extraHint?: string | undefined;
  sourceText: string;
}

/**
 * Calculates 1-based line and 1-based column for a 0-based character offset
 * against original source string without newline normalization (D-19, Task 1).
 * Handles both LF and CRLF accurately.
 */
export function getLineAndColumn(
  text: string,
  offset: number
): { line: number; column: number } {
  let line = 1;
  let lastLineStart = 0;

  for (let i = 0; i < offset && i < text.length; i++) {
    const ch = text.charAt(i);
    if (ch === '\n') {
      line++;
      lastLineStart = i + 1;
    } else if (ch === '\r') {
      if (i + 1 < text.length && text.charAt(i + 1) === '\n') {
        // CRLF sequence: advance past \n on next loop iteration
        line++;
        lastLineStart = i + 2;
        i++; // skip \n
      } else {
        // Lone CR
        line++;
        lastLineStart = i + 1;
      }
    }
  }

  const column = offset - lastLineStart + 1;
  return { line, column };
}

// Regex patterns for deterministic detection (D-15, D-16)

// 1. CREDENTIALS
const PRIVATE_KEY_REGEX = /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/g;
const BEARER_TOKEN_REGEX = /\bBearer\s+([A-Za-z0-9_\-\.]{20,})\b/gi;
const PASSWORD_FIELD_REGEX = /(?:["']?(?:password|passwd|pwd|client_secret|api_key|secret_key|private_key)["']?\s*[:=]\s*["'])([^"'\r\n]{4,})(?:["'])/gi;

// 2. HSM KEYS
const HSM_KEY_REGEX = /\b(ZPK|LMK|ZMK|BDK|PEK|CVK|PVK|ZEK|DEK)\s*[:=]\s*([0-9a-fA-F]{16,64})\b/gi;
const GENERAL_HSM_KEY_REGEX = /\b(?:HSM[_\s-]?KEY)\s*[:=]\s*([0-9a-fA-F]{16,64})\b/gi;

// 3. PIN / PIN BLOCK
const PIN_BLOCK_REGEX = /\b(?:PIN[_\s-]?BLOCK|EPB)\s*[:=]+\s*([0-9a-fA-F]{16,32})\b/gi;
const CLEAR_PIN_REGEX = /\b(?:PIN|Mã[_\s-]?PIN|clear[_\s-]?pin)\s*[:=]+\s*(\d{4,6})\b/gi;

// 4. CVV
const CVV_REGEX = /(?:\b(?:cvv[2]?|cvc[2]?|cid|security\s*code|mã\s*bảo\s*mật)\b[\s:=]+)([0-9]{3,4})\b/gi;

// 5. PAN (13 to 19 digits with optional spaces or dashes, surrounded by non-digits or boundaries)
const PAN_CANDIDATE_REGEX = /(?:^|[^\d])((?:\d[ -]?){13,19})(?=[^\d]|$)/g;

// 6. PII
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
// CCCD: Vietnamese Citizen Identity Card (12 digits, often with keyword or standalone 12 digits starting with valid century/province code 001-096)
const CCCD_WITH_KEYWORD_REGEX = /\b(?:CCCD|CMND|Số\s*CCCD|Số\s*CMND|Căn\s*cước)\s*[:=]?\s*([0-9]{9,12})\b/gi;
const CCCD_STANDALONE_REGEX = /\b(0[0-9]{2}[0-3][0-9]{2}[0-9]{6})\b/g;
// Vietnamese phone numbers: starts with 03, 05, 07, 08, 09 or +84 followed by 9 digits
const VN_PHONE_REGEX = /(?:\+84|0)(?:3[2-9]|5[25689]|7[06-9]|8[1-9]|9[0-9])[0-9]{7}\b/g;

/**
 * Scans a single string and identifies raw candidates across all categories.
 */
function scanStringCandidates(text: string): RawFindingCandidate[] {
  const candidates: RawFindingCandidate[] = [];

  const pushMatch = (
    category: DlpCategory,
    startOffset: number,
    endOffset: number,
    extraHint?: string | undefined
  ) => {
    if (startOffset >= 0 && endOffset > startOffset) {
      candidates.push({
        category,
        startOffset,
        endOffset,
        extraHint,
        sourceText: text,
      });
    }
  };

  // 1. CREDENTIALS
  let match: RegExpExecArray | null;
  PRIVATE_KEY_REGEX.lastIndex = 0;
  while ((match = PRIVATE_KEY_REGEX.exec(text)) !== null) {
    pushMatch('CREDENTIAL', match.index, match.index + match[0].length, 'PRIVATE_KEY');
  }

  BEARER_TOKEN_REGEX.lastIndex = 0;
  while ((match = BEARER_TOKEN_REGEX.exec(text)) !== null) {
    const tokenVal = match[1];
    if (tokenVal) {
      const valStart = match.index + match[0].indexOf(tokenVal);
      pushMatch('CREDENTIAL', valStart, valStart + tokenVal.length, 'BEARER_TOKEN');
    }
  }

  PASSWORD_FIELD_REGEX.lastIndex = 0;
  while ((match = PASSWORD_FIELD_REGEX.exec(text)) !== null) {
    const fullMatch = match[0];
    const secret = match[1];
    if (secret) {
      const secretStart = match.index + fullMatch.indexOf(secret);
      pushMatch('CREDENTIAL', secretStart, secretStart + secret.length, 'PASSWORD');
    }
  }

  // 2. HSM KEYS
  HSM_KEY_REGEX.lastIndex = 0;
  while ((match = HSM_KEY_REGEX.exec(text)) !== null) {
    const keyType = match[1]?.toUpperCase() ?? 'HSM';
    const keyVal = match[2];
    if (keyVal) {
      const valStart = match.index + match[0].indexOf(keyVal);
      pushMatch('HSM_KEY', valStart, valStart + keyVal.length, keyType);
    }
  }

  GENERAL_HSM_KEY_REGEX.lastIndex = 0;
  while ((match = GENERAL_HSM_KEY_REGEX.exec(text)) !== null) {
    const keyVal = match[1];
    if (keyVal) {
      const valStart = match.index + match[0].indexOf(keyVal);
      pushMatch('HSM_KEY', valStart, valStart + keyVal.length, 'HSM_KEY');
    }
  }

  // 3. PIN / PIN BLOCK
  PIN_BLOCK_REGEX.lastIndex = 0;
  while ((match = PIN_BLOCK_REGEX.exec(text)) !== null) {
    const blockVal = match[1];
    if (blockVal) {
      const valStart = match.index + match[0].indexOf(blockVal);
      pushMatch('PIN', valStart, valStart + blockVal.length, 'PIN_BLOCK');
    }
  }

  CLEAR_PIN_REGEX.lastIndex = 0;
  while ((match = CLEAR_PIN_REGEX.exec(text)) !== null) {
    const pinVal = match[1];
    if (pinVal) {
      const valStart = match.index + match[0].indexOf(pinVal);
      pushMatch('PIN', valStart, valStart + pinVal.length, 'CLEAR_PIN');
    }
  }

  // 4. CVV
  CVV_REGEX.lastIndex = 0;
  while ((match = CVV_REGEX.exec(text)) !== null) {
    const cvvVal = match[1];
    if (cvvVal) {
      const valStart = match.index + match[0].indexOf(cvvVal);
      pushMatch('CVV', valStart, valStart + cvvVal.length, 'CVV');
    }
  }

  // 5. PAN (Luhn validated)
  PAN_CANDIDATE_REGEX.lastIndex = 0;
  while ((match = PAN_CANDIDATE_REGEX.exec(text)) !== null) {
    const captured = match[1];
    if (captured) {
      const digitsOnly = captured.replace(/[\s-]/g, '');
      if (isValidLuhn(digitsOnly)) {
        const fullIndex = match.index + match[0].indexOf(captured);
        pushMatch('PAN', fullIndex, fullIndex + captured.length, 'PAN');
      }
    }
  }

  // 6. PII
  EMAIL_REGEX.lastIndex = 0;
  while ((match = EMAIL_REGEX.exec(text)) !== null) {
    pushMatch('PII', match.index, match.index + match[0].length, 'EMAIL');
  }

  CCCD_WITH_KEYWORD_REGEX.lastIndex = 0;
  while ((match = CCCD_WITH_KEYWORD_REGEX.exec(text)) !== null) {
    const cccdVal = match[1];
    if (cccdVal) {
      const valStart = match.index + match[0].indexOf(cccdVal);
      pushMatch('PII', valStart, valStart + cccdVal.length, 'CCCD');
    }
  }

  CCCD_STANDALONE_REGEX.lastIndex = 0;
  while ((match = CCCD_STANDALONE_REGEX.exec(text)) !== null) {
    const cccdVal = match[1];
    if (cccdVal) {
      pushMatch('PII', match.index, match.index + cccdVal.length, 'CCCD');
    }
  }

  VN_PHONE_REGEX.lastIndex = 0;
  while ((match = VN_PHONE_REGEX.exec(text)) !== null) {
    pushMatch('PII', match.index, match.index + match[0].length, 'PHONE');
  }

  return candidates;
}

/**
 * Collapses overlapping candidate spans using strict category precedence:
 * CREDENTIAL > HSM_KEY > PIN > CVV > PAN > PII (D-19).
 * If categories are equal, keeps the longer span; if lengths equal, keeps earlier start.
 */
export function collapseOverlappingCandidates(
  candidates: RawFindingCandidate[]
): RawFindingCandidate[] {
  if (candidates.length <= 1) return candidates;

  const sorted = [...candidates].sort((a, b) => {
    if (a.startOffset !== b.startOffset) {
      return a.startOffset - b.startOffset;
    }
    const precDiff = CATEGORY_PRECEDENCE[b.category] - CATEGORY_PRECEDENCE[a.category];
    if (precDiff !== 0) return precDiff;
    return (b.endOffset - b.startOffset) - (a.endOffset - a.startOffset);
  });

  const resolved: RawFindingCandidate[] = [];

  for (const current of sorted) {
    let absorbed = false;
    for (let i = 0; i < resolved.length; i++) {
      const existing = resolved[i]!;

      const hasOverlap =
        Math.max(existing.startOffset, current.startOffset) <
        Math.min(existing.endOffset, current.endOffset);

      if (hasOverlap) {
        absorbed = true;
        const currentPrec = CATEGORY_PRECEDENCE[current.category];
        const existingPrec = CATEGORY_PRECEDENCE[existing.category];

        if (currentPrec > existingPrec) {
          resolved[i] = current;
        } else if (currentPrec === existingPrec) {
          const currentLen = current.endOffset - current.startOffset;
          const existingLen = existing.endOffset - existing.startOffset;
          if (currentLen > existingLen) {
            resolved[i] = current;
          }
        }
        break;
      }
    }

    if (!absorbed) {
      resolved.push(current);
    }
  }

  return resolved.sort((a, b) => a.startOffset - b.startOffset);
}

/**
 * Scans a single text field and returns masked findings.
 * Pre-redacts all findings from text before building context to ensure
 * adjacent secrets never leak in each other's context snippets (T-16-10).
 */
export function scanField(field: OutboundTextField): DlpFinding[] {
  if (!field.text || field.text.length === 0) {
    return [];
  }

  const rawCandidates = scanStringCandidates(field.text);
  const resolved = collapseOverlappingCandidates(rawCandidates);

  if (resolved.length === 0) {
    return [];
  }

  // Pre-calculate replacements
  const findingMetadata = resolved.map((c) => {
    const rawSpan = field.text.slice(c.startOffset, c.endOffset);
    const maskedReplacement = getMaskedReplacement(c.category, rawSpan, c.extraHint);
    const { line, column } = getLineAndColumn(field.text, c.startOffset);
    return {
      candidate: c,
      rawSpan,
      maskedReplacement,
      line,
      column,
    };
  });

  return findingMetadata.map((target, targetIdx) => {
    // Replace all other findings in text with their masks
    let textForContext = field.text;
    let targetStart = target.candidate.startOffset;
    let targetEnd = target.candidate.endOffset;

    // Apply other replacements in reverse order
    for (let i = findingMetadata.length - 1; i >= 0; i--) {
      if (i === targetIdx) continue;
      const other = findingMetadata[i]!;
      const before = textForContext.slice(0, other.candidate.startOffset);
      const after = textForContext.slice(other.candidate.endOffset);
      textForContext = `${before}${other.maskedReplacement}${after}`;

      // Adjust target offsets if other was before target
      if (other.candidate.startOffset < target.candidate.startOffset) {
        const delta = other.maskedReplacement.length - (other.candidate.endOffset - other.candidate.startOffset);
        targetStart += delta;
        targetEnd += delta;
      }
    }

    const maskedContext = buildMaskedContext(
      textForContext,
      targetStart,
      targetEnd,
      target.maskedReplacement
    );

    return {
      id: generateId(),
      category: target.candidate.category,
      documentId: field.documentId,
      fieldType: field.fieldType,
      fieldIndex: field.fieldIndex,
      line: target.line,
      column: target.column,
      startOffset: target.candidate.startOffset,
      endOffset: target.candidate.endOffset,
      maskedContext,
    };
  });
}

/**
 * Extracts and scans all user-authored outbound text (D-17).
 * Protocol fields, UUIDs, timestamps, and hashes are never passed into scanning.
 */
export function scanOutboundUserText(payload: OutboundUserText): DlpFinding[] {
  const fields: OutboundTextField[] = [];

  // 1. Set name
  if (payload.setName) {
    fields.push({
      fieldType: 'set_name',
      text: payload.setName,
    });
  }

  // 2. Documents: title, body, and each tag
  for (const doc of payload.documents) {
    if (doc.title) {
      fields.push({
        documentId: doc.documentId,
        fieldType: 'doc_title',
        text: doc.title,
      });
    }

    if (doc.body) {
      fields.push({
        documentId: doc.documentId,
        fieldType: 'doc_body',
        text: doc.body,
      });
    }

    if (Array.isArray(doc.tags)) {
      for (let tagIdx = 0; tagIdx < doc.tags.length; tagIdx++) {
        const tag = doc.tags[tagIdx];
        if (tag) {
          fields.push({
            documentId: doc.documentId,
            fieldType: 'doc_tag',
            fieldIndex: tagIdx,
            text: tag,
          });
        }
      }
    }
  }

  const findings: DlpFinding[] = [];
  for (const field of fields) {
    const fieldFindings = scanField(field);
    findings.push(...fieldFindings);
  }

  return findings;
}
