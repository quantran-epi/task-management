import { describe, expect, it } from 'vitest';
import {
  SdlcArtifactMetadataSchema,
  SdlcDocumentSetMetadataSchema,
  WizardSnapshotSchema,
  WizardTransitionError,
  assertWizardTransition,
  buildWizardIdempotencyKey,
} from '../../src/services/ai/wizardSchemas';
import { DocumentSetSchema } from '../../src/validation/knowledgeSchemas';
import { NoteSchema } from '../../src/validation/schemas';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const THREAD_ID = '22222222-2222-4222-8222-222222222222';
const SESSION_ID = '33333333-3333-4333-8333-333333333333';
const NOTE_ID = '44444444-4444-4444-8444-444444444444';
const HASH = 'a'.repeat(64);
const NOW = '2026-10-28T12:00:00.000Z';

function snapshot(
  status: 'collecting' | 'gap_fill' | 'review' | 'approved' | 'exporting' | 'completed' | 'abandoned',
  overrides: Record<string, unknown> = {},
) {
  const draftRevision = ['review', 'approved', 'exporting', 'completed'].includes(status) ? 1 : null;
  const approvedAt = ['approved', 'exporting', 'completed'].includes(status) ? NOW : null;
  return {
    schemaVersion: 1,
    sessionId: SESSION_ID,
    projectId: PROJECT_ID,
    threadId: THREAD_ID,
    skill: 'SOLUTION',
    status,
    inputRevision: status === 'collecting' ? 0 : 1,
    draftRevision,
    approvedAt,
    artifactId: status === 'completed' ? NOTE_ID : null,
    artifactHash: status === 'completed' ? HASH : null,
    renderPayload: { title: 'SOLUTION', featureMode: 'new' },
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function expectTransitionCode(previous: unknown, next: unknown, code: string) {
  expect(() => assertWizardTransition(previous, next)).toThrowError(
    expect.objectContaining<Partial<WizardTransitionError>>({ code }),
  );
}

describe('wizard lifecycle contracts', () => {
  it('accepts legal lifecycle, review edits, and abandoned snapshots', () => {
    const collecting = WizardSnapshotSchema.parse(snapshot('collecting'));
    const gapFill = WizardSnapshotSchema.parse(snapshot('gap_fill'));
    const review = WizardSnapshotSchema.parse(snapshot('review'));
    const approved = WizardSnapshotSchema.parse(snapshot('approved'));
    const exporting = WizardSnapshotSchema.parse(snapshot('exporting'));
    const completed = WizardSnapshotSchema.parse(snapshot('completed'));

    expect(() => assertWizardTransition(collecting, gapFill)).not.toThrow();
    expect(() => assertWizardTransition(gapFill, review)).not.toThrow();
    expect(() => assertWizardTransition(review, approved)).not.toThrow();
    expect(() => assertWizardTransition(approved, exporting)).not.toThrow();
    expect(() => assertWizardTransition(exporting, completed)).not.toThrow();
    expect(() => assertWizardTransition(
      review,
      WizardSnapshotSchema.parse(snapshot('gap_fill', { inputRevision: 2 })),
    )).not.toThrow();
    expect(() => assertWizardTransition(
      review,
      WizardSnapshotSchema.parse(snapshot('abandoned')),
    )).not.toThrow();
  });

  it('rejects unknown keys, identity changes, stale revisions, and completion without approval', () => {
    expect(WizardSnapshotSchema.safeParse({ ...snapshot('review'), apiKey: 'secret' }).success).toBe(false);
    expectTransitionCode(snapshot('review'), snapshot('approved', { projectId: NOTE_ID }), 'WIZARD_PROJECT_MISMATCH');
    expectTransitionCode(snapshot('review'), snapshot('approved', { threadId: NOTE_ID }), 'WIZARD_THREAD_MISMATCH');
    expectTransitionCode(snapshot('review'), snapshot('gap_fill'), 'WIZARD_INPUT_REVISION_STALE');
    expectTransitionCode(snapshot('review'), snapshot('completed'), 'WIZARD_ILLEGAL_TRANSITION');
    expect(WizardSnapshotSchema.safeParse(snapshot('completed', { approvedAt: null })).success).toBe(false);
  });

  it('requires current-system details for existing-feature solution snapshots', () => {
    const invalid = snapshot('review', {
      renderPayload: { title: 'SOLUTION', featureMode: 'existing' },
    });
    expect(WizardSnapshotSchema.safeParse(invalid).success).toBe(false);

    expect(WizardSnapshotSchema.safeParse(snapshot('review', {
      renderPayload: {
        title: 'SOLUTION',
        featureMode: 'existing',
        currentSystem: 'Current card limit service',
        affectedSurfaces: ['API /limits', 'MAIN1.LIMITS'],
      },
    })).success).toBe(true);
  });

  it('rejects render payloads above 524,288 UTF-8 bytes', () => {
    const result = WizardSnapshotSchema.safeParse(snapshot('review', {
      renderPayload: { title: 'x', markdown: 'x'.repeat(524_289), featureMode: 'new' },
    }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message.includes('WIZARD_PAYLOAD_TOO_LARGE'))).toBe(true);
    }
  });

  it('validates artifact chains and stable idempotency keys', () => {
    const solution = SdlcArtifactMetadataSchema.parse({
      kind: 'SOLUTION',
      projectId: PROJECT_ID,
      threadId: THREAD_ID,
      sessionId: SESSION_ID,
      version: 1,
      inputHash: HASH,
      sourceArtifactIds: [],
      sourceArtifactHashes: [],
      approvedAt: NOW,
      idempotencyKey: 'wizard-key',
    });
    expect(solution.version).toBe(1);

    expect(SdlcArtifactMetadataSchema.safeParse({
      ...solution,
      kind: 'PL03B',
      sourceArtifactIds: [],
      sourceArtifactHashes: [],
    }).success).toBe(false);

    expect(SdlcArtifactMetadataSchema.safeParse({
      ...solution,
      kind: 'CHANGE_PACK_ENTRY',
      packHash: HASH,
      path: 'diff.patch',
      sourceArtifactIds: [NOTE_ID],
      sourceArtifactHashes: [HASH],
    }).success).toBe(true);

    expect(buildWizardIdempotencyKey({
      sessionId: SESSION_ID,
      draftRevision: 2,
      artifactKind: 'SOLUTION',
    })).toBe(`${SESSION_ID}:2:SOLUTION`);
  });

  it('keeps historical models valid and accepts exact SDLC set mapping', () => {
    expect(NoteSchema.safeParse({
      id: NOTE_ID,
      body: 'legacy',
      isPinned: false,
      createdAt: NOW,
      updatedAt: NOW,
    }).success).toBe(true);

    expect(DocumentSetSchema.safeParse({
      id: NOTE_ID,
      name: 'Legacy set',
      documentIds: [],
      createdAt: NOW,
      updatedAt: NOW,
    }).success).toBe(true);

    expect(SdlcDocumentSetMetadataSchema.parse({ projectId: PROJECT_ID, purpose: 'sdlc' })).toEqual({
      projectId: PROJECT_ID,
      purpose: 'sdlc',
    });
  });
});
