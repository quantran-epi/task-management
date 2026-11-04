import type { TaskPlannerDatabase } from '../../db';
import { z } from 'zod';
import {
  type SdlcArtifactRef,
  type SdlcStepId,
  type SdlcWorkflowState,
  SdlcWorkflowStateSchema,
} from '../wizard/workflowSchemas';
import { defaultSha256, workflowStorageKey } from '../wizard/workflowCoordinator';
import { buildSectionIndex, splitLines, type ArtifactSection } from '../../utils/markdownSections';
import {
  createUnifiedLineDiff,
  MAX_DIFF_CELLS,
  type DiffBudgetRefusal,
  type UnifiedLineDiff,
} from '../../utils/lineDiff';

/** Artifact kinds these tools own; every other kind is out of scope for Phase 27. */
export const ARTIFACT_TOOL_KINDS = ['SOLUTION', 'PL03B', 'PL07', 'CAB'] as const;
export type ArtifactToolKind = (typeof ARTIFACT_TOOL_KINDS)[number];

/** D-09 cap on both the supplied text and the resulting changed lines. */
export const PATCH_LINE_CAP = 120;
export { MAX_DIFF_CELLS };

export type ArtifactToolRefusalCode =
  | 'ARTIFACT_SCOPE_REQUIRED'
  | 'ARTIFACT_SCOPE_INVALID'
  | 'CR_NOT_ACTIVE'
  | 'READ_ONLY'
  | 'UNSUPPORTED_KIND'
  | 'WORKFLOW_UNAVAILABLE'
  | 'ARTIFACT_NOT_FOUND'
  | 'INVALID_ARGUMENTS'
  | 'SECTION_NOT_FOUND'
  | 'SECTION_DRIFT'
  | 'SECTION_EMPTY'
  | 'PATCH_TOO_LARGE'
  | 'NO_CHANGES'
  | 'DIFF_BUDGET_EXCEEDED';

export interface ArtifactToolRefusal {
  refused: true;
  code: ArtifactToolRefusalCode;
  message: string;
  /** Present when the caller can act on the current index (drift / missing section). */
  sectionIndex?: ArtifactSection[];
  addedLines?: number;
  removedLines?: number;
  cap?: number;
  sectionId?: string;
}

export interface ArtifactToolSnapshot {
  kind: ArtifactToolKind;
  version: number;
  approvedAt?: string;
  approvalState: 'approved' | 'unapproved';
  markdown: string;
  baseHash: string;
  sectionIndex: ArtifactSection[];
}

export interface ArtifactPatchProposal {
  proposalId: string;
  scopeKey: string;
  projectId: string;
  crId: string;
  kind: ArtifactToolKind;
  version: number;
  sectionId: string;
  sectionTitle: string;
  baseHash: string;
  baseMarkdown: string;
  diffText: string;
  addedLines: number;
  removedLines: number;
  patchedMarkdown: string;
}

export type ArtifactToolResult = ArtifactToolSnapshot | ArtifactPatchProposal | ArtifactToolRefusal;

export interface ArtifactToolAccess {
  readOnly: boolean;
  crActive: boolean;
  scopeValid: boolean;
}

/**
 * Trusted, request-bound host context (T-27-01). Model arguments never select project,
 * CR, or scope; two simultaneous scopes stay isolated because nothing here is a singleton.
 */
export interface ArtifactToolContext {
  scopeKey: string;
  projectId: string;
  crId: string;
  stepId: SdlcStepId;
  getAccess: () => ArtifactToolAccess;
  getDraft: (kind: ArtifactToolKind) => string | undefined;
  getWorkflowState?: () => SdlcWorkflowState | undefined;
}

const ARTIFACT_KEY: Record<ArtifactToolKind, 'solution' | 'pl03b' | 'pl07' | 'cab'> = {
  SOLUTION: 'solution',
  PL03B: 'pl03b',
  PL07: 'pl07',
  CAB: 'cab',
};

const KIND_LABEL: Record<ArtifactToolKind, string> = {
  SOLUTION: 'SOLUTION.md',
  PL03B: 'PL03B',
  PL07: 'PL07',
  CAB: 'Tờ trình CAB',
};

function refuse(code: ArtifactToolRefusalCode, message: string, extra: Partial<ArtifactToolRefusal> = {}): ArtifactToolRefusal {
  return { refused: true, code, message, ...extra };
}

function isRefusal(result: ArtifactToolResult): result is ArtifactToolRefusal {
  return (result as ArtifactToolRefusal).refused === true;
}

const kindSchema = z.enum(ARTIFACT_TOOL_KINDS);

const getArtifactArgsSchema = z.object({
  // Kept loose so an unsupported-but-present kind yields the actionable
  // UNSUPPORTED_KIND refusal rather than a generic argument error.
  kind: z.string({ message: 'kind phải là chuỗi' }),
});

const patchArgsSchema = z.object({
  kind: kindSchema,
  sectionId: z.string().min(1, 'sectionId không được để trống'),
  expectedHeading: z.string().min(1, 'expectedHeading không được để trống'),
  baseHash: z.string().regex(/^[a-f0-9]{64}$/, 'baseHash không hợp lệ'),
  operation: z.enum(['append', 'replace']),
  newContent: z.string({ message: 'newContent phải là chuỗi' }),
});

export type ArtifactPatchArgs = z.infer<typeof patchArgsSchema>;
export type GetArtifactArgs = z.infer<typeof getArtifactArgsSchema>;

function accessRefusal(context: ArtifactToolContext): ArtifactToolRefusal | undefined {
  const access = context.getAccess();
  if (!access.scopeValid) {
    return refuse('ARTIFACT_SCOPE_INVALID', 'Phạm vi quy trình không còn hợp lệ. Hãy mở lại CR đang làm việc.');
  }
  if (access.readOnly) {
    return refuse(
      'READ_ONLY',
      'Đang xem phiên bản xem trước/lịch sử nên chỉ đọc. Hãy chuyển về CR đang hoạt động để xem hoặc đề xuất chỉnh sửa.'
    );
  }
  if (!access.crActive) {
    return refuse('CR_NOT_ACTIVE', 'CR này không ở trạng thái hoạt động. Hãy chọn CR đang hoạt động.');
  }
  return undefined;
}

async function loadWorkflowState(
  db: TaskPlannerDatabase,
  context: ArtifactToolContext
): Promise<SdlcWorkflowState | ArtifactToolRefusal> {
  if (context.getWorkflowState) {
    const live = context.getWorkflowState();
    if (!live) {
      // An explicitly supplied but unavailable host state is unavailable — never a
      // licence to read another snapshot (T-27-01).
      return refuse('WORKFLOW_UNAVAILABLE', 'Chưa có trạng thái quy trình SDLC cho CR này.');
    }
    return live;
  }
  try {
    const row = await db.settings.get(workflowStorageKey(context.projectId, context.crId));
    if (!row?.value) {
      return refuse('WORKFLOW_UNAVAILABLE', 'Chưa có trạng thái quy trình SDLC cho CR này.');
    }
    const parsed = SdlcWorkflowStateSchema.safeParse(
      typeof row.value === 'string' ? JSON.parse(row.value) : row.value
    );
    if (!parsed.success) {
      return refuse('WORKFLOW_UNAVAILABLE', 'Trạng thái quy trình SDLC không hợp lệ hoặc đã hỏng.');
    }
    return parsed.data;
  } catch {
    return refuse('WORKFLOW_UNAVAILABLE', 'Không đọc được trạng thái quy trình SDLC.');
  }
}

function committedArtifact(state: SdlcWorkflowState, kind: ArtifactToolKind): SdlcArtifactRef | undefined {
  return state.artifacts[ARTIFACT_KEY[kind]];
}

export async function readArtifactSnapshot(
  db: TaskPlannerDatabase,
  context: ArtifactToolContext,
  kind: ArtifactToolKind | string
): Promise<ArtifactToolResult> {
  const parsedKind = kindSchema.safeParse(kind);
  if (!parsedKind.success) {
    return refuse('UNSUPPORTED_KIND', `Công cụ chỉ hỗ trợ các tài liệu: ${ARTIFACT_TOOL_KINDS.join(', ')}.`);
  }

  const denied = accessRefusal(context);
  if (denied) return denied;

  const state = await loadWorkflowState(db, context);
  if (isRefusal(state as ArtifactToolResult)) return state as ArtifactToolRefusal;

  const workflowState = state as SdlcWorkflowState;
  const committed = committedArtifact(workflowState, parsedKind.data);
  const draft = context.getDraft(parsedKind.data);
  const markdown = draft !== undefined ? draft : committed?.content;
  if (markdown === undefined) {
    return refuse(
      'ARTIFACT_NOT_FOUND',
      `Chưa có ${KIND_LABEL[parsedKind.data]} cho CR này. Hãy tạo tài liệu trước khi xem hoặc đề xuất chỉnh sửa.`
    );
  }

  const baseHash = await defaultSha256(markdown.trim());
  const matchesCommitted = committed?.hash === baseHash;

  return {
    kind: parsedKind.data,
    version: committed?.version ?? 0,
    ...(committed?.approvedAt ? { approvedAt: committed.approvedAt } : {}),
    // Committed approval metadata describes the committed version only; a diverging
    // draft is explicitly unapproved (SDLC-ART-01).
    approvalState: matchesCommitted && committed?.approvedAt ? 'approved' : 'unapproved',
    markdown,
    baseHash,
    sectionIndex: buildSectionIndex(markdown),
  };
}

interface SectionSlice {
  section: ArtifactSection;
  bodyLines: string[];
  /** Line indices (inclusive) of the non-blank body core, in whole-document space. */
  coreStart: number;
  coreEnd: number;
}

function locateSection(markdown: string, sectionId: string): SectionSlice | ArtifactToolRefusal {
  const lines = splitLines(markdown);
  const section = buildSectionIndex(markdown).find((candidate) => candidate.id === sectionId);
  if (!section) {
    return refuse('SECTION_NOT_FOUND', `Không tìm thấy mục "${sectionId}". Hãy đọc lại danh sách mục rồi đề xuất lại.`, {
      sectionIndex: buildSectionIndex(markdown),
      sectionId,
    });
  }
  const bodyStart = section.start + 1;
  const bodyLines = lines.slice(bodyStart, section.end);
  let coreStart = -1;
  let coreEnd = -1;
  for (let i = 0; i < bodyLines.length; i += 1) {
    if (bodyLines[i]!.trim() !== '') {
      if (coreStart === -1) coreStart = bodyStart + i;
      coreEnd = bodyStart + i;
    }
  }
  return { section, bodyLines, coreStart, coreEnd };
}

function applyOperation(
  markdown: string,
  slice: SectionSlice,
  operation: 'append' | 'replace',
  newContent: string
): string {
  const lines = splitLines(markdown);
  const newLines = splitLines(newContent);
  // A single trailing newline in the supplied text is a formatting artifact, not a line.
  if (newLines.length > 0 && newLines[newLines.length - 1] === '') newLines.pop();

  if (operation === 'append') {
    // Insert after the body's last non-blank line so the blank separator before the
    // next heading survives untouched.
    const insertAt = slice.coreEnd + 1;
    return [...lines.slice(0, insertAt), ...newLines, ...lines.slice(insertAt)].join('\n');
  }
  return [
    ...lines.slice(0, slice.coreStart),
    ...newLines,
    ...lines.slice(slice.coreEnd + 1),
  ].join('\n');
}

function countLogicalLines(text: string): number {
  if (text === '') return 0;
  const lines = splitLines(text);
  return lines.length > 0 && lines[lines.length - 1] === '' ? lines.length - 1 : lines.length;
}

export async function prepareArtifactPatch(
  db: TaskPlannerDatabase,
  context: ArtifactToolContext,
  rawArgs: Record<string, unknown>
): Promise<ArtifactToolResult> {
  const parsed = patchArgsSchema.safeParse(rawArgs);
  if (!parsed.success) {
    return refuse(
      'INVALID_ARGUMENTS',
      `Đối số không hợp lệ: ${parsed.error.issues.map((issue) => issue.message).join('; ')}.`
    );
  }
  const args = parsed.data;

  const denied = accessRefusal(context);
  if (denied) return denied;

  const snapshot = await readArtifactSnapshot(db, context, args.kind);
  if (isRefusal(snapshot)) return snapshot;
  const current = snapshot as ArtifactToolSnapshot;

  if (current.baseHash !== args.baseHash) {
    return refuse(
      'SECTION_DRIFT',
      'Tài liệu đã thay đổi kể từ khi đọc. Hãy gọi get_artifact để lấy bản mới rồi đề xuất lại.',
      { sectionIndex: current.sectionIndex }
    );
  }

  const slice = locateSection(current.markdown, args.sectionId);
  if (isRefusal(slice as ArtifactToolResult)) return slice as ArtifactToolRefusal;
  const located = slice as SectionSlice;

  // D-06: exact heading match — never fuzzy-retarget a renamed section.
  if (located.section.title !== args.expectedHeading) {
    return refuse(
      'SECTION_DRIFT',
      `Mục "${args.sectionId}" hiện có tiêu đề "${located.section.title}" (không khớp "${args.expectedHeading}"). Hãy đọc lại danh sách mục rồi đề xuất lại.`,
      { sectionIndex: current.sectionIndex, sectionId: args.sectionId }
    );
  }

  if (located.coreStart === -1) {
    return refuse(
      'SECTION_EMPTY',
      `Mục "${located.section.title}" hiện không có nội dung để chỉnh sửa. Hãy đề xuất nội dung cho một mục khác hoặc dùng văn bản thay thế đầy đủ.`,
      { sectionIndex: current.sectionIndex, sectionId: args.sectionId }
    );
  }

  const suppliedLines = countLogicalLines(args.newContent);
  if (suppliedLines > PATCH_LINE_CAP) {
    return refuse(
      'PATCH_TOO_LARGE',
      `Đề xuất quá lớn (${suppliedLines} dòng, giới hạn ${PATCH_LINE_CAP}). Hãy chia nhỏ thành nhiều chỉnh sửa theo từng mục.`,
      { cap: PATCH_LINE_CAP, sectionId: args.sectionId }
    );
  }

  const patchedMarkdown = applyOperation(current.markdown, located, args.operation, args.newContent);
  if (patchedMarkdown === current.markdown) {
    return refuse('NO_CHANGES', 'Nội dung đề xuất trùng với bản hiện tại nên không có gì để duyệt.', {
      sectionId: args.sectionId,
    });
  }

  const diff: UnifiedLineDiff | DiffBudgetRefusal = createUnifiedLineDiff(current.markdown, patchedMarkdown, {
    fromLabel: `a/${KIND_LABEL[args.kind]}`,
    toLabel: `b/${KIND_LABEL[args.kind]}`,
  });
  if ((diff as DiffBudgetRefusal).refused) {
    const budget = diff as DiffBudgetRefusal;
    return refuse('DIFF_BUDGET_EXCEEDED', budget.message, { cap: budget.cap, sectionId: args.sectionId });
  }
  const unified = diff as UnifiedLineDiff;

  if (unified.addedLines + unified.removedLines > PATCH_LINE_CAP) {
    return refuse(
      'PATCH_TOO_LARGE',
      `Đề xuất quá lớn (${unified.addedLines + unified.removedLines} dòng thay đổi, giới hạn ${PATCH_LINE_CAP}). Hãy chia nhỏ thành nhiều chỉnh sửa theo từng mục.`,
      {
        addedLines: unified.addedLines,
        removedLines: unified.removedLines,
        cap: PATCH_LINE_CAP,
        sectionId: args.sectionId,
      }
    );
  }

  return {
    proposalId: crypto.randomUUID(),
    scopeKey: context.scopeKey,
    projectId: context.projectId,
    crId: context.crId,
    kind: args.kind,
    version: current.version,
    sectionId: located.section.id,
    sectionTitle: located.section.title,
    baseHash: current.baseHash,
    baseMarkdown: current.markdown,
    diffText: unified.diffText,
    addedLines: unified.addedLines,
    removedLines: unified.removedLines,
    patchedMarkdown,
  };
}

/** Registered dispatch entry point for both artifact tools. Never writes to the editor. */
export async function executeSdlcArtifactTool(
  toolName: string,
  args: Record<string, unknown>,
  db: TaskPlannerDatabase,
  context?: ArtifactToolContext
): Promise<ArtifactToolResult> {
  if (!context) {
    return refuse(
      'ARTIFACT_SCOPE_REQUIRED',
      'Công cụ tài liệu chỉ dùng được trong khung chat SDLC đang mở một CR cụ thể.'
    );
  }
  if (toolName === 'get_artifact') {
    const parsed = getArtifactArgsSchema.safeParse(args);
    if (!parsed.success) {
      return refuse('INVALID_ARGUMENTS', 'Thiếu hoặc sai tham số "kind" cho get_artifact.');
    }
    return readArtifactSnapshot(db, context, parsed.data.kind);
  }
  return prepareArtifactPatch(db, context, args);
}
