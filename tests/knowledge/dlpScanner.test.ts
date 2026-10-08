import { describe, it, expect } from 'vitest';
import {
  isValidLuhn,
  getLineAndColumn,
  scanField,
  scanOutboundUserText,
  CATEGORY_PRECEDENCE,
} from '../../src/services/dlp/dlpScanner';
import { buildDlpAuditRecord } from '../../src/services/dlp/dlpAudit';
import { DLP_RULESET_VERSION } from '../../src/types/dlp';
import type { OutboundUserText } from '../../src/types/dlp';

describe('DLP Scanner & Masking (D-15, D-16, D-17, D-18, D-19)', () => {
  // 1. PAN and Luhn validation
  describe('Luhn and PAN detection', () => {
    it('validates 13-19 digit PANs correctly with Luhn algorithm', () => {
      // Known valid Visa test card numbers
      expect(isValidLuhn('4532015112830366')).toBe(true);
      expect(isValidLuhn('4532 0151 1283 0366'.replace(/\s/g, ''))).toBe(true);
      // Valid Mastercard
      expect(isValidLuhn('5425233430109903')).toBe(true);
      // Valid Amex (15 digits)
      expect(isValidLuhn('378282246310005')).toBe(true);

      // Luhn invalid variant (last digit modified)
      expect(isValidLuhn('4532015112830367')).toBe(false);
      // Length out of bounds
      expect(isValidLuhn('123456789012')).toBe(false); // 12 digits
      expect(isValidLuhn('12345678901234567890')).toBe(false); // 20 digits
      // Non-digits
      expect(isValidLuhn('453201511283036a')).toBe(false);
    });

    it('detects valid PAN and ignores invalid Luhn numbers in text', () => {
      const text = 'Card number: 4532015112830366 and invalid 4532015112830367.';
      const findings = scanField({
        fieldType: 'doc_body',
        text,
      });

      expect(findings.length).toBe(1);
      expect(findings[0]?.category).toBe('PAN');
      expect(findings[0]?.maskedContext).toContain('453201••••••0366');
      expect(findings[0]?.maskedContext).not.toContain('4532015112830366');
    });

    it('detects PAN formatted with spaces and dashes', () => {
      const text = 'Payment with 4532-0151-1283-0366 completed.';
      const findings = scanField({
        fieldType: 'doc_body',
        text,
      });

      expect(findings.length).toBe(1);
      expect(findings[0]?.category).toBe('PAN');
      expect(findings[0]?.maskedContext).not.toContain('4532-0151-1283-0366');
    });
  });

  // 2. All DLP categories coverage (D-15)
  describe('All required categories detection', () => {
    it('detects contextual CVV/CVC/CID', () => {
      const text = 'CVV: 123, CVC: 890, security code: 4321';
      const findings = scanField({ fieldType: 'doc_body', text });

      expect(findings.length).toBe(3);
      expect(findings.every((f) => f.category === 'CVV')).toBe(true);
      expect(findings.every((f) => f.maskedContext.includes('•••'))).toBe(true);
      expect(findings.some((f) => f.maskedContext.includes('123'))).toBe(false);
    });

    it('detects clear PIN and PIN Block', () => {
      const text = 'PIN := 1234 and PIN_BLOCK: 0123456789ABCDEF0123456789ABCDEF';
      const findings = scanField({ fieldType: 'doc_body', text });

      expect(findings.length).toBe(2);
      expect(findings[0]?.category).toBe('PIN');
      expect(findings[1]?.category).toBe('PIN');
      expect(findings[0]?.maskedContext).not.toContain('1234');
      expect(findings[1]?.maskedContext).not.toContain('0123456789ABCDEF');
    });

    it('detects HSM keys (ZPK, LMK, ZMK, BDK, PEK)', () => {
      const text = 'ZPK: 0123456789ABCDEF0123456789ABCDEF and LMK = FEDCBA9876543210FEDCBA9876543210';
      const findings = scanField({ fieldType: 'doc_body', text });

      expect(findings.length).toBe(2);
      expect(findings[0]?.category).toBe('HSM_KEY');
      expect(findings[1]?.category).toBe('HSM_KEY');
      expect(findings[0]?.maskedContext).toContain('[ZPK: REDACTED_KEY]');
      expect(findings[1]?.maskedContext).toContain('[LMK: REDACTED_KEY]');
      expect(findings[0]?.maskedContext).not.toContain('0123456789ABCDEF0123456789ABCDEF');
    });

    it('detects credentials (passwords, Bearer tokens, private keys)', () => {
      const text = `
client_secret: "super_secret_token_12345"
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotLeakThis
-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA0Y3k9v7...
-----END RSA PRIVATE KEY-----
      `;
      const findings = scanField({ fieldType: 'doc_body', text });

      expect(findings.length).toBe(3);
      expect(findings.every((f) => f.category === 'CREDENTIAL')).toBe(true);
      expect(findings.some((f) => f.maskedContext.includes('super_secret_token_12345'))).toBe(false);
      expect(findings.some((f) => f.maskedContext.includes('doNotLeakThis'))).toBe(false);
      expect(findings.some((f) => f.maskedContext.includes('MIIEowIBAAKCAQEA0Y3k9v7'))).toBe(false);
    });

    it('detects customer PII (CCCD, email, phone)', () => {
      const text = 'Liên hệ: nguyen.van.a@shb.com.vn, SĐT: 0912345678, CCCD: 001090012345';
      const findings = scanField({ fieldType: 'doc_body', text });

      expect(findings.length).toBe(3);
      expect(findings.every((f) => f.category === 'PII')).toBe(true);
      expect(findings[0]?.maskedContext).toContain('n•••@shb.com.vn');
      expect(findings[1]?.maskedContext).toContain('••••••678');
      expect(findings[2]?.maskedContext).toContain('001••••••345');
      // Ensure full secrets are not present
      expect(findings[0]?.maskedContext).not.toContain('nguyen.van.a@shb.com.vn');
      expect(findings[1]?.maskedContext).not.toContain('0912345678');
      expect(findings[2]?.maskedContext).not.toContain('001090012345');
    });
  });

  // 3. User-authored text provenance (D-17)
  describe('Outbound user text scanning and provenance', () => {
    it('scans set name, document titles, bodies, and tags with field provenance', () => {
      const payload: OutboundUserText = {
        setName: 'Publish Set with secret email: admin@bank.vn',
        documents: [
          {
            documentId: 'doc-uuid-1',
            title: 'Doc Title with phone 0987654321',
            body: 'Body content containing password: "bank_password_999"',
            tags: ['tag-safe', 'tag-with-cvv: cvv 789'],
          },
        ],
      };

      const findings = scanOutboundUserText(payload);

      expect(findings.length).toBe(4);
      // 1. Set name
      const setFinding = findings.find((f) => f.fieldType === 'set_name');
      expect(setFinding).toBeDefined();
      expect(setFinding?.category).toBe('PII');
      expect(setFinding?.documentId).toBeUndefined();

      // 2. Title
      const titleFinding = findings.find((f) => f.fieldType === 'doc_title');
      expect(titleFinding).toBeDefined();
      expect(titleFinding?.category).toBe('PII');
      expect(titleFinding?.documentId).toBe('doc-uuid-1');

      // 3. Body
      const bodyFinding = findings.find((f) => f.fieldType === 'doc_body');
      expect(bodyFinding).toBeDefined();
      expect(bodyFinding?.category).toBe('CREDENTIAL');
      expect(bodyFinding?.documentId).toBe('doc-uuid-1');

      // 4. Tag
      const tagFinding = findings.find((f) => f.fieldType === 'doc_tag');
      expect(tagFinding).toBeDefined();
      expect(tagFinding?.category).toBe('CVV');
      expect(tagFinding?.fieldIndex).toBe(1);
      expect(tagFinding?.documentId).toBe('doc-uuid-1');
    });
  });

  // 4. Unicode and CRLF/LF line & column calculation (D-19, Task 1)
  describe('Line and column positioning across CRLF and Unicode', () => {
    it('accurately calculates line and column with LF and CRLF', () => {
      const crlfText = "Dòng 1: Tiếng Việt\r\nDòng 2: Mã bảo mật cvv: 999\r\nDòng 3";
      const { line, column } = getLineAndColumn(crlfText, crlfText.indexOf('999'));

      expect(line).toBe(2);
      expect(crlfText.split('\r\n')[1]?.slice(column - 1, column + 2)).toBe('999');
    });

    it('accurately calculates line and column with Unicode characters', () => {
      const unicodeText = "Hệ thống tính toán tín dụng SHB 🏦\nKhách hàng: 0912345678";
      const phoneIndex = unicodeText.indexOf('0912345678');
      const { line, column } = getLineAndColumn(unicodeText, phoneIndex);

      expect(line).toBe(2);
      expect(unicodeText.split('\n')[1]?.slice(column - 1, column + 10)).toBe('0912345678');
    });
  });

  // 5. Overlap precedence resolution (D-19)
  describe('Overlap precedence resolution', () => {
    it('prefers higher specificity category when ranges overlap', () => {
      // In hierarchy: CREDENTIAL > HSM_KEY > PIN > CVV > PAN > PII
      expect(CATEGORY_PRECEDENCE.CREDENTIAL).toBeGreaterThan(CATEGORY_PRECEDENCE.HSM_KEY);
      expect(CATEGORY_PRECEDENCE.HSM_KEY).toBeGreaterThan(CATEGORY_PRECEDENCE.PIN);
      expect(CATEGORY_PRECEDENCE.PIN).toBeGreaterThan(CATEGORY_PRECEDENCE.CVV);
      expect(CATEGORY_PRECEDENCE.CVV).toBeGreaterThan(CATEGORY_PRECEDENCE.PAN);
      expect(CATEGORY_PRECEDENCE.PAN).toBeGreaterThan(CATEGORY_PRECEDENCE.PII);

      // Suppose a text has password containing digits that also match PAN or phone
      const text = 'API private_key: "4532015112830366"';
      const findings = scanField({ fieldType: 'doc_body', text });

      // Should be collapsed to CREDENTIAL, absorbing the embedded PAN
      expect(findings.length).toBe(1);
      expect(findings[0]?.category).toBe('CREDENTIAL');
      expect(findings[0]?.maskedContext).not.toContain('4532015112830366');
    });
  });

  // 6. Masking boundaries and context length (Task 2)
  describe('Masking and bounded context length', () => {
    it('caps masked context length and replaces secret span', () => {
      const veryLongText = 'A'.repeat(100) + ' cvv: 999 ' + 'B'.repeat(100);
      const findings = scanField({ fieldType: 'doc_body', text: veryLongText });

      expect(findings.length).toBe(1);
      const finding = findings[0]!;
      expect(finding.maskedContext.length).toBeLessThanOrEqual(100);
      expect(finding.maskedContext).toContain('...');
      expect(finding.maskedContext).toContain('•••');
      expect(finding.maskedContext).not.toContain('999');
    });

    it('does not leak full seeded secrets in serialized findings JSON', () => {
      const secretPan = '4532015112830366';
      const secretPass = 'super_secret_vault_password_abc';
      const secretEmail = 'ceo.confidential@vietnam-bank.vn';
      const text = `Data: PAN=${secretPan}, pwd="${secretPass}", email=${secretEmail}`;

      const findings = scanField({ fieldType: 'doc_body', text });
      const serialized = JSON.stringify(findings);

      expect(serialized).not.toContain(secretPan);
      expect(serialized).not.toContain(secretPass);
      expect(serialized).not.toContain(secretEmail);
    });
  });

  // 7. Content-free audit record generation (D-18, Task 2)
  describe('Content-free DLP audit generation', () => {
    it('creates audit record with fixed ruleset version, counts, and hashes only', () => {
      const audit = buildDlpAuditRecord({
        setId: 'c3b3e3e3-1111-4111-8111-111111111111',
        attemptId: 'a1a1a1a1-2222-4222-8222-222222222222',
        documentIds: ['d1d1d1d1-3333-4333-8333-333333333333'],
        contentHashes: ['e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
        findingCategories: ['PAN', 'CVV', 'PAN'],
        userAction: 'confirmed',
      });

      expect(audit.ruleSetVersion).toBe(DLP_RULESET_VERSION);
      expect(audit.findingCountsByCategory).toEqual({
        PAN: 2,
        CVV: 1,
      });
      expect(audit.userAction).toBe('confirmed');

      const serialized = JSON.stringify(audit);
      expect(serialized).not.toContain('title');
      expect(serialized).not.toContain('body');
      expect(serialized).not.toContain('tag');
      expect(serialized).not.toContain('match');
      expect(serialized).not.toContain('excerpt');
    });
  });
});
