import { z } from 'zod';
import { isValidUuid } from '../../utils/uuid';

export const WIZARD_RENDER_PAYLOAD_MAX_BYTES = 524_288 as const;

const uuidSchema = z.string().refine(isValidUuid, 'Must be a valid RFC 4122 v4 UUID');
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/, 'Must be a lowercase SHA-256 hash');
const isoTimestampSchema = z.string().datetime({ message: 'Must be a valid ISO 8601 datetime string' });

export const WizardSkillSchema = z.enum(['PL02', 'PL03', 'PL07', 'CAB', 'SOLUTION']);
export type WizardSkill = z.infer<typeof WizardSkillSchema>;

export const WizardStatusSchema = z.enum([
  'collecting',
  'gap_fill',
  'review',
  'approved',
  'exporting',
  'completed',
  'abandoned',
]);
export type WizardStatus = z.infer<typeof WizardStatusSchema>;

const SolutionRenderPayloadSchema = z.discriminatedUnion('featureMode', [
  z.strictObject({
    title: z.string().min(1).max(200),
    featureMode: z.literal('new'),
    markdown: z.string().optional(),
  }),
  z.strictObject({
    title: z.string().min(1).max(200),
    featureMode: z.literal('existing'),
    currentSystem: z.string().trim().min(1).max(20_000),
    affectedSurfaces: z.array(z.string().trim().min(1).max(500)).min(1).max(100),
    markdown: z.string().optional(),
  }),
]);

const GenericRenderPayloadSchema = z.strictObject({
  title: z.string().min(1).max(200),
  markdown: z.string().max(WIZARD_RENDER_PAYLOAD_MAX_BYTES).optional(),
});

export const WizardRenderPayloadSchema = z.union([
  SolutionRenderPayloadSchema,
  GenericRenderPayloadSchema,
]);
export type WizardRenderPayload = z.infer<typeof WizardRenderPayloadSchema>;

export const WizardMetadataSchema = z.strictObject({
  schemaVersion: z.literal(1),
  sessionId: uuidSchema,
  projectId: uuidSchema,
  threadId: uuidSchema,
  skill: WizardSkillSchema,
  inputRevision: z.number().int().nonnegative(),
  draftRevision: z.number().int().positive().nullable(),
  artifactId: uuidSchema.nullable(),
  artifactHash: hashSchema.nullable(),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
});
export type WizardMetadata = z.infer<typeof WizardMetadataSchema>;

const baseSnapshotFields = {
  schemaVersion: z.literal(1),
  sessionId: uuidSchema,
  projectId: uuidSchema,
  threadId: uuidSchema,
  skill: WizardSkillSchema,
  inputRevision: z.number().int().nonnegative(),
  renderPayload: WizardRenderPayloadSchema,
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
  artifactId: uuidSchema.nullable(),
  artifactHash: hashSchema.nullable(),
};

const nullableDraftFields = {
  draftRevision: z.number().int().positive().nullable(),
  approvedAt: isoTimestampSchema.nullable(),
};

const reviewDraftFields = {
  draftRevision: z.number().int().positive(),
  approvedAt: isoTimestampSchema.nullable(),
};

export const WizardSnapshotSchema = z.discriminatedUnion('status', [
  z.strictObject({ ...baseSnapshotFields, status: z.literal('collecting'), ...nullableDraftFields }),
  z.strictObject({ ...baseSnapshotFields, status: z.literal('gap_fill'), ...nullableDraftFields }),
  z.strictObject({ ...baseSnapshotFields, status: z.literal('review'), ...reviewDraftFields }),
  z.strictObject({ ...baseSnapshotFields, status: z.literal('approved'), ...reviewDraftFields, approvedAt: isoTimestampSchema }),
  z.strictObject({ ...baseSnapshotFields, status: z.literal('exporting'), ...reviewDraftFields, approvedAt: isoTimestampSchema }),
  z.strictObject({ ...baseSnapshotFields, status: z.literal('completed'), ...reviewDraftFields, approvedAt: isoTimestampSchema }),
  z.strictObject({ ...baseSnapshotFields, status: z.literal('abandoned'), ...nullableDraftFields }),
]).superRefine((snapshot, ctx) => {
  const bytes = new TextEncoder().encode(JSON.stringify(snapshot.renderPayload)).byteLength;
  if (bytes > WIZARD_RENDER_PAYLOAD_MAX_BYTES) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['renderPayload'],
      message: `WIZARD_PAYLOAD_TOO_LARGE: render payload exceeds ${WIZARD_RENDER_PAYLOAD_MAX_BYTES} UTF-8 bytes`,
    });
  }
  if (snapshot.status === 'completed' && (snapshot.artifactId === null || snapshot.artifactHash === null)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['artifactId'],
      message: 'WIZARD_COMPLETION_REQUIRES_ARTIFACT',
    });
  }
});
export type WizardSnapshot = z.infer<typeof WizardSnapshotSchema>;

const artifactBase = {
  kind: z.enum(['PL02', 'SOLUTION', 'CHANGE_PACK_ENTRY', 'PL03B', 'PL07', 'CAB']),
  projectId: uuidSchema,
  threadId: uuidSchema,
  sessionId: uuidSchema,
  version: z.number().int().positive(),
  inputHash: hashSchema,
  sourceArtifactIds: z.array(uuidSchema),
  sourceArtifactHashes: z.array(hashSchema),
  approvedAt: isoTimestampSchema,
  idempotencyKey: z.string().trim().min(1).max(200),
};

export const SdlcArtifactMetadataSchema = z.discriminatedUnion('kind', [
  z.strictObject({ ...artifactBase, kind: z.literal('PL02') }),
  z.strictObject({ ...artifactBase, kind: z.literal('SOLUTION') }),
  z.strictObject({
    ...artifactBase,
    kind: z.literal('CHANGE_PACK_ENTRY'),
    packHash: hashSchema,
    path: z.string().trim().min(1).max(500),
  }),
  z.strictObject({ ...artifactBase, kind: z.literal('PL03B') }).superRefine(requireSourceArtifacts),
  z.strictObject({ ...artifactBase, kind: z.literal('PL07') }).superRefine(requireSourceArtifacts),
  z.strictObject({ ...artifactBase, kind: z.literal('CAB') }).superRefine(requireSourceArtifacts),
]).superRefine((artifact, ctx) => {
  if (artifact.sourceArtifactIds.length !== artifact.sourceArtifactHashes.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['sourceArtifactHashes'],
      message: 'ARTIFACT_SOURCE_HASH_COUNT_MISMATCH',
    });
  }
});
export type SdlcArtifactMetadata = z.infer<typeof SdlcArtifactMetadataSchema>;

function requireSourceArtifacts(
  artifact: { sourceArtifactIds: string[]; sourceArtifactHashes: string[] },
  ctx: z.RefinementCtx,
): void {
  if (artifact.sourceArtifactIds.length === 0 || artifact.sourceArtifactHashes.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['sourceArtifactIds'],
      message: 'ARTIFACT_SOURCE_REQUIRED',
    });
  }
}

export const SdlcDocumentSetMetadataSchema = z.strictObject({
  projectId: uuidSchema,
  purpose: z.literal('sdlc'),
});
export type SdlcDocumentSetMetadata = z.infer<typeof SdlcDocumentSetMetadataSchema>;

export class WizardTransitionError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = 'WizardTransitionError';
    this.code = code;
  }
}

const legalTransitions: Record<WizardStatus, readonly WizardStatus[]> = {
  collecting: ['gap_fill', 'abandoned'],
  gap_fill: ['gap_fill', 'review', 'abandoned'],
  review: ['approved', 'gap_fill', 'abandoned'],
  approved: ['exporting', 'abandoned'],
  exporting: ['completed', 'abandoned'],
  completed: [],
  abandoned: [],
};

export function assertWizardTransition(previous: unknown, next: unknown): void {
  const from = WizardSnapshotSchema.parse(previous);
  const to = WizardSnapshotSchema.parse(next);

  if (from.projectId !== to.projectId) throw new WizardTransitionError('WIZARD_PROJECT_MISMATCH');
  if (from.threadId !== to.threadId) throw new WizardTransitionError('WIZARD_THREAD_MISMATCH');
  if (from.sessionId !== to.sessionId) throw new WizardTransitionError('WIZARD_SESSION_MISMATCH');
  if (to.inputRevision < from.inputRevision) throw new WizardTransitionError('WIZARD_INPUT_REVISION_STALE');
  if (from.draftRevision !== null && to.draftRevision !== null && to.draftRevision < from.draftRevision) {
    throw new WizardTransitionError('WIZARD_DRAFT_REVISION_STALE');
  }
  if (!legalTransitions[from.status].includes(to.status)) throw new WizardTransitionError('WIZARD_ILLEGAL_TRANSITION');
  if (to.status === 'gap_fill' && from.status === 'review' && to.inputRevision <= from.inputRevision) {
    throw new WizardTransitionError('WIZARD_INPUT_REVISION_STALE');
  }
  if (to.status === 'approved' && from.status !== 'review') throw new WizardTransitionError('WIZARD_APPROVAL_REQUIRES_REVIEW');
  if (to.status === 'completed' && from.status !== 'exporting') throw new WizardTransitionError('WIZARD_COMPLETION_REQUIRES_EXPORT');
}

export function buildWizardIdempotencyKey(input: {
  sessionId: string;
  draftRevision: number;
  artifactKind: SdlcArtifactMetadata['kind'];
}): string {
  return `${input.sessionId}:${input.draftRevision}:${input.artifactKind}`;
}
