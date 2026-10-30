import { z } from 'zod';
import { isValidUuid } from '../../utils/uuid';
import { ReconciliationResultSchema } from './reconciliation';

export const uuidSchema = z.string().refine(isValidUuid, 'Must be a valid RFC 4122 v4 UUID');
export const hashSchema = z.string().regex(/^[a-f0-9]{64}$/, 'Must be a lowercase SHA-256 hash');
export const isoTimestampSchema = z.string().datetime({ message: 'Must be a valid ISO 8601 datetime string' });

export const SdlcStepIdSchema = z.enum([
  'INTAKE',          // Bước 1: Nạp PL01 & PL02
  'SOLUTION',        // Bước 2: Phân tích & Trao đổi SOLUTION.md
  'CODE_GUIDE',      // Bước 3: Coding ngoài & Hướng dẫn lệnh pack
  'CHANGE_PACK',     // Bước 4: Nạp change-pack & Soi Drift
  'TECH_DOCS',       // Bước 5: Sinh & Duyệt PL03B & PL07
  'CAB',             // Bước 6: Tổng kết & Duyệt CAB
]);
export type SdlcStepId = z.infer<typeof SdlcStepIdSchema>;

export const SdlcStepStatusSchema = z.enum([
  'wait',       // Chưa kích hoạt / Đang chờ
  'process',    // Đang thực hiện / Cần tương tác
  'finish',     // Đã hoàn thành / Đã duyệt
  'stale',      // Bị cũ / Cần cập nhật do đầu vào hoặc bước trước thay đổi
  'error',      // Lỗi kiểm tra / Không hợp lệ
]);
export type SdlcStepStatus = z.infer<typeof SdlcStepStatusSchema>;

export const SdlcArtifactKindSchema = z.enum([
  'PL01',
  'PL02',
  'SOLUTION',
  'CODE_GUIDE',
  'CHANGE_PACK',
  'PL03B',
  'PL07',
  'CAB',
]);
export type SdlcArtifactKind = z.infer<typeof SdlcArtifactKindSchema>;

export const SdlcArtifactRefSchema = z.strictObject({
  noteId: uuidSchema.optional(),
  kind: SdlcArtifactKindSchema,
  version: z.number().int().positive().default(1),
  hash: hashSchema,
  title: z.string().min(1).max(200),
  content: z.string().optional(),
  sourceHashes: z.array(hashSchema).default([]),
  approvedAt: isoTimestampSchema.optional(),
  updatedAt: isoTimestampSchema,
});
export type SdlcArtifactRef = z.infer<typeof SdlcArtifactRefSchema>;

export const SdlcWorkflowMetadataSchema = z.strictObject({
  cr: z.string().trim().min(1, 'Mã CR/Dự án không được để trống').max(100),
  featureName: z.string().trim().min(1, 'Tên tính năng không được để trống').max(200),
  author: z.string().trim().default('(chưa cung cấp)'),
  requestingUnit: z.string().trim().default('(chưa cung cấp)'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày lập phải theo định dạng YYYY-MM-DD'),
});
export type SdlcWorkflowMetadata = z.infer<typeof SdlcWorkflowMetadataSchema>;

export const SdlcCheckpointSchema = z.strictObject({
  requestId: uuidSchema,
  step: SdlcStepIdSchema.optional(),
  status: z.enum(['running', 'interrupted']),
  startedAt: isoTimestampSchema,
});
export type SdlcCheckpoint = z.infer<typeof SdlcCheckpointSchema>;

export const RevisionCycleSchema = z.strictObject({
  cycleId: uuidSchema,
  status: z.enum(['active', 'completed']),
  startedAt: isoTimestampSchema,
  closedAt: isoTimestampSchema.optional(),
});
export type RevisionCycle = z.infer<typeof RevisionCycleSchema>;

export const RevisionSourceSchema = z.strictObject({
  kind: SdlcArtifactKindSchema,
  version: z.number().int().positive(),
  hash: hashSchema,
  noteId: uuidSchema.optional(),
});
export type RevisionSource = z.infer<typeof RevisionSourceSchema>;

export const RevisionPreviewSchema = z.strictObject({
  kind: SdlcArtifactKindSchema,
  markdown: z.string().min(1),
  hash: hashSchema,
  diff: z.array(z.string()),
  sources: z.array(RevisionSourceSchema),
  impactSteps: z.array(SdlcStepIdSchema),
  requiresConfirmation: z.literal(true),
  baseVersion: z.number().int().nonnegative(),
  baseHash: hashSchema.optional(),
});
export type RevisionPreview = z.infer<typeof RevisionPreviewSchema>;

export const SdlcWorkflowStateSchema = z.strictObject({
  schemaVersion: z.literal(1),
  sessionId: uuidSchema,
  projectId: uuidSchema,
  threadId: uuidSchema,
  currentStep: SdlcStepIdSchema,
  metadata: SdlcWorkflowMetadataSchema,
  artifacts: z.strictObject({
    pl01: SdlcArtifactRefSchema.optional(),
    pl02: SdlcArtifactRefSchema.optional(),
    solution: SdlcArtifactRefSchema.optional(),
    codeGuide: SdlcArtifactRefSchema.optional(),
    changePack: SdlcArtifactRefSchema.optional(),
    driftResult: ReconciliationResultSchema.optional(),
    pl03b: SdlcArtifactRefSchema.optional(),
    pl07: SdlcArtifactRefSchema.optional(),
    cab: SdlcArtifactRefSchema.optional(),
  }),
  staleSteps: z.array(SdlcStepIdSchema).default([]),
  selectedStep: SdlcStepIdSchema.optional(),
  cycles: z.array(RevisionCycleSchema).optional(),
  versions: z.record(z.string(), z.array(SdlcArtifactRefSchema)).optional(),
  activeVersions: z.record(z.string(), z.number().int().positive()).optional(),
  checkpoint: SdlcCheckpointSchema.optional(),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
});
export type SdlcWorkflowState = z.infer<typeof SdlcWorkflowStateSchema>;
