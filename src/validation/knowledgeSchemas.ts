import { z } from 'zod';
import { isValidUuid } from '../utils/uuid';

/**
 * D-27: Primary set states remain exactly these six strings.
 * Connectivity uncertainty is subordinate text/banner, not a seventh primary state.
 */
export const PUBLISH_PRIMARY_STATES = [
  'Never published',
  'In sync',
  'Local changes',
  'Publishing',
  'Warning',
  'Failed',
] as const;

export const PublishPrimaryStateSchema = z.enum(PUBLISH_PRIMARY_STATES);

/**
 * Strict UUID validator schema reusing isValidUuid helper.
 */
const strictUuidSchema = z.string().refine((val) => isValidUuid(val), {
  message: 'Invalid UUID format',
});

/**
 * ISO 8601 timestamp schema.
 */
const isoTimestampSchema = z.string().refine(
  (val) => {
    const d = new Date(val);
    return !isNaN(d.getTime()) && val.includes('T');
  },
  { message: 'Invalid ISO timestamp' }
);

/**
 * SHA-256 hex string validator.
 */
const sha256HexSchema = z.string().regex(/^[0-9a-fA-F]{64}$/, 'Must be 64-character hex SHA-256 hash');

/**
 * Lowercase SHA-256 hex string validator for frozen manifests (D-06, D-10).
 */
const lowercaseSha256HexSchema = z
  .string()
  .regex(/^[0-9a-f]{64}$/, 'Must be 64-character lowercase hex SHA-256 hash');

/**
 * Frozen submitted document metadata schema (D-06, D-08, D-10).
 * Strictly contains document UUID and lowercase submitted SHA-256 hash only.
 * No content-bearing or credential fields permitted.
 */
export const FrozenSubmittedDocumentMetadataSchema = z
  .object({
    documentId: strictUuidSchema,
    submittedContentHash: lowercaseSha256HexSchema,
  })
  .strict();

/**
 * D-01: DocumentSet stores an explicit ordered snapshot of stable document UUIDs.
 */
export const DocumentSetSchema = z
  .object({
    id: strictUuidSchema,
    name: z
      .string()
      .trim()
      .min(1, 'Name is required')
      .max(120, 'Name cannot exceed 120 characters'),
    description: z.string().max(500).optional(),
    documentIds: z
      .array(strictUuidSchema)
      .refine(
        (items) => new Set(items).size === items.length,
        'Duplicate document IDs are not allowed in document set'
      ),
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
  })
  .strict();

/**
 * D-08 / T-16-02: PublishedDocumentMetadata stores last-known remote state per document.
 * Contains NO markdown body, excerpts, or credentials.
 */
export const PublishedDocumentMetadataSchema = z
  .object({
    setId: strictUuidSchema,
    documentId: strictUuidSchema,
    lastKnownRemoteAt: isoTimestampSchema,
    publishedContentHash: sha256HexSchema,
    activeSnapshotId: z.string().min(1).max(100).optional(),
    activeAttemptId: z.string().min(1).max(100).optional(),
    lastPrimaryState: PublishPrimaryStateSchema.optional(),
  })
  .strict();

/**
 * D-29 / T-16-02: PublishAttemptCache records metrics for recent attempts.
 * Contains NO payload, markdown, findings, tokens, or retrieval data.
 */
export const PublishAttemptCacheSchema = z
  .object({
    id: strictUuidSchema,
    setId: strictUuidSchema,
    attemptKey: z.string().min(1).max(100).optional(),
    startedAt: isoTimestampSchema,
    completedAt: isoTimestampSchema.optional(),
    durationMs: z.number().nonnegative().optional(),
    status: PublishPrimaryStateSchema,
    addedCount: z.number().int().nonnegative(),
    changedCount: z.number().int().nonnegative(),
    removedCount: z.number().int().nonnegative(),
    unchangedCount: z.number().int().nonnegative(),
    warningCount: z.number().int().nonnegative(),
    errorCode: z.string().max(100).optional(),
    errorMessage: z.string().max(1000).optional(),
    submittedDocuments: z
      .array(FrozenSubmittedDocumentMetadataSchema)
      .refine(
        (items) => new Set(items.map((i) => i.documentId)).size === items.length,
        'Duplicate document IDs are not allowed in submittedDocuments'
      )
      .optional(),
  })
  .strict();

/**
 * D-18 / T-16-02: DlpAuditRecord stores fixed version, timestamp, document IDs, counts, and hashes only.
 * Contains NO matched values, source excerpts, or raw secrets.
 */
export const DlpAuditRecordSchema = z
  .object({
    id: strictUuidSchema,
    setId: strictUuidSchema,
    attemptId: z.string().min(1).max(100).optional(),
    ruleSetVersion: z.string().min(1).max(30),
    timestamp: isoTimestampSchema,
    documentIds: z.array(strictUuidSchema),
    contentHashes: z.array(sha256HexSchema),
    findingCountsByCategory: z.record(z.string(), z.number().int().nonnegative()),
    userAction: z.enum(['confirmed', 'cancelled', 'auto_passed']),
  })
  .strict();
