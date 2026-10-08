/**
 * DLP type contracts and fixed ruleset version (D-15, D-17, D-18, D-19).
 */

export const DLP_RULESET_VERSION = '2026.10.1';

export type DlpCategory =
  | 'CREDENTIAL'
  | 'HSM_KEY'
  | 'PIN'
  | 'CVV'
  | 'PAN'
  | 'PII';

/**
 * Field provenance for scanned text.
 * Only user-authored fields enter scanning (D-17).
 */
export type OutboundFieldType = 'set_name' | 'doc_title' | 'doc_body' | 'doc_tag';

export interface OutboundTextField {
  documentId?: string | undefined; // Optional if set-level text like set_name
  fieldType: OutboundFieldType;
  text: string;
  fieldIndex?: number | undefined; // e.g. tag index
}

export interface OutboundUserText {
  setName?: string | undefined;
  documents: Array<{
    documentId: string;
    title: string;
    body: string;
    tags?: string[] | undefined;
  }>;
}

/**
 * Finding presented to user/UI.
 * Never contains raw unmasked match or sensitive secret (D-19, T-16-10).
 */
export interface DlpFinding {
  id: string; // RFC 4122 v4 UUID
  category: DlpCategory;
  documentId?: string | undefined; // Present if document-level field
  fieldType: OutboundFieldType;
  fieldIndex?: number | undefined;
  line: number; // 1-based line in field text
  column: number; // 1-based column (character index) in line
  startOffset: number; // 0-based UTF-16 character offset in field text
  endOffset: number; // 0-based UTF-16 character offset in field text
  maskedContext: string; // Capped context with redacted secret
}

/**
 * Input for content-free audit record generation (D-18).
 * Never accepts raw text, excerpts, or findings with sensitive values.
 */
export interface DlpAuditInput {
  setId: string;
  attemptId?: string | undefined;
  documentIds: string[];
  contentHashes: string[];
  findingCategories: DlpCategory[];
  userAction: 'confirmed' | 'cancelled' | 'auto_passed';
}
