import { z } from 'zod';

/**
 * Versioned server constants per D-25 and D-26.
 * Single source of truth for both browser-preview and daemon-projection runtimes.
 */
export const CHUNKING_POLICY_VERSION = '2026.10.1';
export const TARGET_CHUNK_SIZE = 6000;
export const HARD_ATOMIC_BLOCK_LIMIT = 50000;

/**
 * UUID v4 / RFC 4122 regex validator.
 */
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const uuidSchema = z.string().regex(uuidRegex, 'Invalid UUID format');

/**
 * Strict SHA-256 hex string validator.
 */
const sha256HexSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{64}$/, 'Must be 64-character hex SHA-256 hash');

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
 * D-27: Primary set and attempt status states.
 * Connectivity loss or warning is subordinate, not a seventh primary state.
 */
export const PUBLISH_PRIMARY_STATES = [
  'Never published',
  'In sync',
  'Local changes',
  'Publishing',
  'Warning',
  'Failed',
] as const;

export type PublishPrimaryState = (typeof PUBLISH_PRIMARY_STATES)[number];
export const PublishPrimaryStateSchema = z.enum(PUBLISH_PRIMARY_STATES);

/**
 * Terminal attempt states on server.
 */
export const ATTEMPT_TERMINAL_STATUSES = ['In sync', 'Warning', 'Failed'] as const;
export type AttemptTerminalStatus = (typeof ATTEMPT_TERMINAL_STATUSES)[number];

/**
 * Published document input payload for POST /api/v1/sets/:id/attempts.
 * Frozen immutable snapshot of documents at confirmation time (D-10).
 */
export const PublishedDocumentInputSchema = z
  .object({
    documentId: uuidSchema,
    title: z.string().min(1).max(200),
    body: z.string(), // Immutable raw markdown content
    tags: z.array(z.string()).optional(),
  })
  .strict();

export type PublishedDocumentInput = z.infer<typeof PublishedDocumentInputSchema>;

/**
 * Request payload for POST /api/v1/sets/:id/attempts.
 */
export const PublishAttemptRequestSchema = z
  .object({
    setName: z.string().trim().min(1).max(120),
    documents: z.array(PublishedDocumentInputSchema),
  })
  .strict();

export type PublishAttemptRequest = z.infer<typeof PublishAttemptRequestSchema>;

/**
 * Structural AST evidence chunk metadata produced by section-first chunker.
 * Reflects D-20 through D-26:
 * - exact raw source offsets [startOffset, endOffset] against published snapshot (D-23)
 * - exact start/end line (1-based)
 * - heading path array (D-20)
 * - normalized content hash (CRLF/CR -> LF) (D-22)
 * - content identity vs occurrence identity separation (D-24)
 */
export const EvidenceChunkSchema = z
  .object({
    occurrenceId: uuidSchema,
    chunkIndex: z.number().int().nonnegative(),
    headingPath: z.array(z.string()),
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive(),
    startOffset: z.number().int().nonnegative(),
    endOffset: z.number().int().nonnegative(),
    rawContent: z.string(),
    contentHash: sha256HexSchema,
    chunkKey: sha256HexSchema,
  })
  .strict();

export type EvidenceChunk = z.infer<typeof EvidenceChunkSchema>;

/**
 * Atomic block error schema for oversized blocks exceeding 50,000 chars (D-25).
 */
export const OversizedAtomicBlockErrorSchema = z
  .object({
    code: z.literal('OVERSIZED_ATOMIC_BLOCK'),
    documentId: uuidSchema,
    blockType: z.string(),
    line: z.number().int().positive(),
    column: z.number().int().positive(),
    length: z.number().int().positive(),
    limit: z.number().int().positive(),
    message: z.string(),
  })
  .strict();

export type OversizedAtomicBlockError = z.infer<typeof OversizedAtomicBlockErrorSchema>;

/**
 * Structured error details for attempt failure.
 */
export const AttemptErrorDetailsSchema = z
  .object({
    code: z.string(),
    message: z.string(),
    documentId: uuidSchema.optional(),
    blockType: z.string().max(80).optional(),
    line: z.number().int().positive().optional(),
    column: z.number().int().positive().optional(),
    limit: z.number().int().positive().optional(),
  })
  .strict();

export type AttemptErrorDetails = z.infer<typeof AttemptErrorDetailsSchema>;

/**
 * Attempt metrics and counts.
 * Strictly content-free (D-29, T-16-02).
 */
export const AttemptMetricsSchema = z
  .object({
    addedCount: z.number().int().nonnegative(),
    changedCount: z.number().int().nonnegative(),
    removedCount: z.number().int().nonnegative(),
    unchangedCount: z.number().int().nonnegative(),
    warningCount: z.number().int().nonnegative(),
    durationMs: z.number().int().nonnegative().optional(),
  })
  .strict();

export type AttemptMetrics = z.infer<typeof AttemptMetricsSchema>;

/**
 * Full attempt resource returned by POST and GET /api/v1/attempts/:id.
 */
export const PublishAttemptResponseSchema = z
  .object({
    attemptId: uuidSchema,
    setId: uuidSchema,
    attemptKey: z.string().optional(),
    status: PublishPrimaryStateSchema,
    startedAt: isoTimestampSchema,
    completedAt: isoTimestampSchema.optional(),
    metrics: AttemptMetricsSchema,
    error: AttemptErrorDetailsSchema.optional(),
    activeSnapshotId: z.string().optional(),
  })
  .strict();

export type PublishAttemptResponse = z.infer<typeof PublishAttemptResponseSchema>;

/**
 * Manifest item for an individual published document inside an active snapshot.
 */
export const PublishedDocumentManifestItemSchema = z
  .object({
    documentId: uuidSchema,
    contentHash: sha256HexSchema,
    chunkCount: z.number().int().nonnegative(),
    chunkKeys: z.array(sha256HexSchema),
  })
  .strict();

export type PublishedDocumentManifestItem = z.infer<
  typeof PublishedDocumentManifestItemSchema
>;

/**
 * Active snapshot manifest returned by GET /api/v1/sets/:id/snapshot.
 * Content-free summary providing hashes and chunk keys for client pre-send diffing (D-04).
 */
export const ActiveSnapshotManifestSchema = z
  .object({
    snapshotId: z.string().min(1),
    setId: uuidSchema,
    chunkingPolicyVersion: z.string().min(1),
    activatedAt: isoTimestampSchema,
    documentCount: z.number().int().nonnegative(),
    totalChunkCount: z.number().int().nonnegative(),
    documents: z.array(PublishedDocumentManifestItemSchema),
  })
  .strict();

export type ActiveSnapshotManifest = z.infer<typeof ActiveSnapshotManifestSchema>;

/**
 * Four-way document delta classification for pre-send preview (D-04).
 */
export const DocumentDeltaClassificationSchema = z.enum([
  'added',
  'changed',
  'removed',
  'unchanged',
]);

export type DocumentDeltaClassification = z.infer<
  typeof DocumentDeltaClassificationSchema
>;

/**
 * Item in document delta breakdown.
 */
export const DocumentDeltaItemSchema = z
  .object({
    documentId: uuidSchema,
    classification: DocumentDeltaClassificationSchema,
    title: z.string(),
    previousHash: sha256HexSchema.optional(),
    currentHash: sha256HexSchema.optional(),
  })
  .strict();

export type DocumentDeltaItem = z.infer<typeof DocumentDeltaItemSchema>;

/**
 * Four-way chunk delta classification for pre-send preview (D-04).
 */
export const ChunkDeltaClassificationSchema = z.enum([
  'added',
  'changed',
  'removed',
  'unchanged',
]);

export type ChunkDeltaClassification = z.infer<
  typeof ChunkDeltaClassificationSchema
>;

/**
 * Item in chunk delta breakdown.
 */
export const ChunkDeltaItemSchema = z
  .object({
    chunkKey: sha256HexSchema,
    documentId: uuidSchema,
    classification: ChunkDeltaClassificationSchema,
    headingPath: z.array(z.string()),
  })
  .strict();

export type ChunkDeltaItem = z.infer<typeof ChunkDeltaItemSchema>;

/**
 * Full pre-send change preview breakdown (D-04).
 */
export const ChangePreviewResultSchema = z
  .object({
    setId: uuidSchema,
    documents: z.array(DocumentDeltaItemSchema),
    chunks: z.array(ChunkDeltaItemSchema),
    counts: z
      .object({
        documentsAdded: z.number().int().nonnegative(),
        documentsChanged: z.number().int().nonnegative(),
        documentsRemoved: z.number().int().nonnegative(),
        documentsUnchanged: z.number().int().nonnegative(),
        chunksAdded: z.number().int().nonnegative(),
        chunksChanged: z.number().int().nonnegative(),
        chunksRemoved: z.number().int().nonnegative(),
        chunksUnchanged: z.number().int().nonnegative(),
      })
      .strict(),
    hasRemovals: z.boolean(),
  })
  .strict();

export type ChangePreviewResult = z.infer<typeof ChangePreviewResultSchema>;
