import type { TaskPlannerDatabase } from '../../db';
import { z } from 'zod';
import {
  type SdlcArtifactRef,
  type SdlcStepId,
  type SdlcWorkflowState,
  SdlcWorkflowStateSchema,
} from '../wizard/workflowSchemas';
import { defaultSha256, workflowStorageKey } from '../wizard/workflowCoordinator';
import { isSubsystem } from '../../db/repositories/systemRepo';
import { formatGuardMessage, WORKFLOW_GUARD_MESSAGES, WORKFLOW_GUARD_STEP_NUMBER, type WorkflowGuardCode } from '../wizard/workflowGuards';
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
  | 'ARTIFACT_STEP_UNSUPPORTED'
  | 'CR_NOT_ACTIVE'
  | 'ARTIFACT_READ_ONLY'
  | 'ARTIFACT_REQUIRED'
  | 'UNSUPPORTED_KIND'
  | 'WORKFLOW_UNAVAILABLE'
  | 'ARTIFACT_NOT_FOUND'
  | 'INVALID_ARGUMENTS'
  | 'SECTION_NOT_FOUND'
  | 'SECTION_DRIFT'
  | 'SECTION_EMPTY'
  | 'PATCH_TOO_LARGE'
  | 'NO_CHANGES'
  | 'DIFF_BUDGET_EXCEEDED'
  | WorkflowGuardCode;

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
  /** Supplying step for a missing prerequisite, so the host can offer navigation. */
  supplyingStep?: SdlcStepId;
  stepNumber?: number;
  missingArtifact?: string;
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
  changeRequestId: string;
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

/** D-41: one candidate subsystem, already validated against the System Catalog. */
export interface SubsystemProposalItem {
  systemId: string;
  code: string;
  name: string;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

/** D-41/D-42: data only. The CR is written by the approval card, never by this tool. */
export interface SubsystemProposalResult {
  items: SubsystemProposalItem[];
  evidence: string[];
}

export type ArtifactToolResult =
  | ArtifactToolSnapshot
  | ArtifactPatchProposal
  | SubsystemProposalResult
  | ArtifactToolRefusal;

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
  changeRequestId: string;
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

const getArtifactArgsSchema = z.object({ kind: kindSchema });

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

/** A document kind is only editable from the step that owns it (SDLC-ART-06). */
const KIND_OWNING_STEP: Record<ArtifactToolKind, SdlcStepId> = {
  SOLUTION: 'SOLUTION',
  PL03B: 'TECH_DOCS',
  PL07: 'TECH_DOCS',
  CAB: 'CAB',
};

type PrerequisiteGuard = {
  guard: WorkflowGuardCode;
  present: (state: SdlcWorkflowState) => boolean;
};

/** Prerequisites come from validated workflow references, never grounded text or model flags. */
const KIND_PREREQUISITES: Record<ArtifactToolKind, readonly PrerequisiteGuard[]> = {
  SOLUTION: [
    { guard: 'INTAKE_PL01_REQUIRED', present: (state) => Boolean(state.artifacts.pl01?.content?.trim()) },
    { guard: 'INTAKE_PL02_REQUIRED', present: (state) => Boolean(state.artifacts.pl02?.content?.trim()) },
  ],
  PL03B: [
    { guard: 'SOLUTION_AND_PACK_REQUIRED_FOR_TECH_DOCS', present: (state) => Boolean(state.artifacts.solution?.content?.trim()) },
    { guard: 'SOLUTION_AND_PACK_REQUIRED_FOR_TECH_DOCS', present: (state) => Boolean(state.artifacts.changePack?.hash && state.artifacts.solution && state.artifacts.changePack.sourceHashes.includes(state.artifacts.solution.hash)) },
  ],
  PL07: [
    { guard: 'SOLUTION_AND_PACK_REQUIRED_FOR_TECH_DOCS', present: (state) => Boolean(state.artifacts.solution?.content?.trim()) },
    { guard: 'SOLUTION_AND_PACK_REQUIRED_FOR_TECH_DOCS', present: (state) => Boolean(state.artifacts.changePack?.hash && state.artifacts.solution && state.artifacts.changePack.sourceHashes.includes(state.artifacts.solution.hash)) },
  ],
  CAB: [
    { guard: 'ALL_DOCS_REQUIRED_FOR_CAB', present: (state) => Boolean(state.artifacts.pl03b?.content?.trim()) },
    { guard: 'ALL_DOCS_REQUIRED_FOR_CAB', present: (state) => Boolean(state.artifacts.pl07?.content?.trim()) },
  ],
};

function stepOwnershipRefusal(stepId: SdlcStepId, kind: ArtifactToolKind): ArtifactToolRefusal | undefined {
  const owner = KIND_OWNING_STEP[kind];
  if (owner === stepId) return undefined;
  return refuse(
    'ARTIFACT_STEP_UNSUPPORTED',
    `Tài liệu ${kind} thuộc bước ${owner}. Công cụ tài liệu không thể đọc hoặc sửa ${kind} từ bước ${stepId}.`,
    { missingArtifact: KIND_LABEL[kind] }
  );
}

/** Actionable guard copy plus the supplying step and its 1-based number for navigation. */
function prerequisiteRefusal(state: SdlcWorkflowState, kind: ArtifactToolKind): ArtifactToolRefusal | undefined {
  const missing = KIND_PREREQUISITES[kind].find((entry) => !entry.present(state));
  if (!missing) return undefined;
  const message = WORKFLOW_GUARD_MESSAGES[missing.guard];
  return refuse(missing.guard, formatGuardMessage(missing.guard), {
    supplyingStep: message.supplyingStep,
    stepNumber: WORKFLOW_GUARD_STEP_NUMBER[message.supplyingStep],
    missingArtifact: message.missingArtifact,
  });
}

function accessRefusal(context: ArtifactToolContext): ArtifactToolRefusal | undefined {
  const access = context.getAccess();
  if (!access.scopeValid || !context.changeRequestId || !context.crId || !context.scopeKey) {
    return refuse('ARTIFACT_SCOPE_INVALID', 'Phạm vi quy trình không còn hợp lệ. Hãy mở lại CR đang làm việc.');
  }
  if (access.readOnly) {
    return refuse(
      'ARTIFACT_READ_ONLY',
      'Chỉ được phép chỉnh sửa ở phiên bản đang hoạt động. Đang xem phiên bản xem trước/lịch sử — hãy quay về phiên bản hiện tại để đề xuất chỉnh sửa.'
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
  try {
    // A supplied but unavailable live state is unavailable, never a fallback to a stale DB snapshot.
    // The DB row is keyed by the CR's durable SDLC tab thread (D-23); the `<crId>` second
    // segment is the pre-fix key and is still read so upgraded workspaces keep their state.
    let value: unknown;
    if (context.getWorkflowState) {
      value = context.getWorkflowState();
    } else {
      const tabs = await db.chatTabs.where('scopeKey').equals(`cr:${context.crId}`).toArray();
      const threadId = tabs.find((tab) => tab.type === 'sdlc')?.threadId;
      if (threadId) {
        value = (await db.settings.get(workflowStorageKey(context.changeRequestId, threadId)))?.value;
      }
      if (value === undefined) {
        value = (await db.settings.get(workflowStorageKey(context.changeRequestId, context.crId)))?.value;
      }
    }
    if (value === undefined) {
      return refuse('WORKFLOW_UNAVAILABLE', 'Chưa có trạng thái quy trình SDLC cho CR này.');
    }
    const parsed = SdlcWorkflowStateSchema.safeParse(
      typeof value === 'string' ? JSON.parse(value) : value
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

/** The same live guard serves direct reads and patch preparation; model args never select scope. */
export function validateArtifactToolAccess(
  context: ArtifactToolContext,
  state: SdlcWorkflowState,
  kind: ArtifactToolKind
): ArtifactToolRefusal | undefined {
  return accessRefusal(context) ??
    (state.projectId !== context.changeRequestId
      ? refuse('ARTIFACT_SCOPE_INVALID', 'Trạng thái quy trình không thuộc dự án đang mở. Hãy mở lại CR đang làm việc.')
      : undefined) ??
    stepOwnershipRefusal(context.stepId, kind) ?? prerequisiteRefusal(state, kind);
}

export async function readArtifactSnapshot(
  db: TaskPlannerDatabase,
  context: ArtifactToolContext,
  kind: ArtifactToolKind | string
): Promise<ArtifactToolResult> {
  const parsedKind = kindSchema.safeParse(kind);
  if (!parsedKind.success) {
    return refuse('INVALID_ARGUMENTS', `Loại tài liệu không hợp lệ. Chỉ hỗ trợ: ${ARTIFACT_TOOL_KINDS.join(', ')}.`);
  }

  const denied = accessRefusal(context);
  if (denied) return denied;
  const unsupportedStep = stepOwnershipRefusal(context.stepId, parsedKind.data);
  if (unsupportedStep) return unsupportedStep;

  const state = await loadWorkflowState(db, context);
  if (isRefusal(state as ArtifactToolResult)) return state as ArtifactToolRefusal;

  const workflowState = state as SdlcWorkflowState;
  const missingPrerequisite = validateArtifactToolAccess(context, workflowState, parsedKind.data);
  if (missingPrerequisite) return missingPrerequisite;
  // Access is re-checked AFTER the awaited workflow read (T-27-15): a scope revoked while
  // the read was in flight must not leak content.
  const revokedMidRead = accessRefusal(context);
  if (revokedMidRead) return revokedMidRead;

  const committed = committedArtifact(workflowState, parsedKind.data);
  const draft = context.getDraft(parsedKind.data);
  const markdown = draft !== undefined ? draft : committed?.content;
  if (markdown === undefined) {
    return refuse(
      'ARTIFACT_REQUIRED',
      `Chưa đủ điều kiện: Thiếu ${KIND_LABEL[parsedKind.data]} từ Bước ${WORKFLOW_GUARD_STEP_NUMBER[KIND_OWNING_STEP[parsedKind.data]]}. Vui lòng tạo tài liệu trước khi xem hoặc đề xuất chỉnh sửa.`,
      { missingArtifact: KIND_LABEL[parsedKind.data], supplyingStep: KIND_OWNING_STEP[parsedKind.data],
        stepNumber: WORKFLOW_GUARD_STEP_NUMBER[KIND_OWNING_STEP[parsedKind.data]] }
    );
  }

  const baseHash = await defaultSha256(markdown.trim());
  const revokedAfterHash = accessRefusal(context);
  if (revokedAfterHash) return revokedAfterHash;
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

/**
 * CR-01: the document's own line-ending style is part of its identity. Rewriting a CRLF
 * document to LF changes the approved draft hash and immediately contradicts the card.
 */
function detectEol(markdown: string): '\r\n' | '\n' {
  const crlf = (markdown.match(/\r\n/g) ?? []).length;
  const lfOnly = (markdown.match(/(?<!\r)\n/g) ?? []).length;
  return crlf > 0 && crlf >= lfOnly ? '\r\n' : '\n';
}

function applyOperation(
  markdown: string,
  slice: SectionSlice,
  operation: 'append' | 'replace',
  newContent: string
): string {
  const eol = detectEol(markdown);
  const lines = splitLines(markdown);
  const newLines = splitLines(newContent);
  // A single trailing newline in the supplied text is a formatting artifact, not a line.
  if (newLines.length > 0 && newLines[newLines.length - 1] === '') newLines.pop();

  if (operation === 'append') {
    // Insert after the body's last non-blank line so the blank separator before the
    // next heading survives untouched.
    const insertAt = slice.coreEnd + 1;
    return [...lines.slice(0, insertAt), ...newLines, ...lines.slice(insertAt)].join(eol);
  }
  return [
    ...lines.slice(0, slice.coreStart),
    ...newLines,
    ...lines.slice(slice.coreEnd + 1),
  ].join(eol);
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
  const revokedBeforeDiff = accessRefusal(context);
  if (revokedBeforeDiff) return revokedBeforeDiff;

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
      { cap: PATCH_LINE_CAP, addedLines: suppliedLines, removedLines: 0, sectionId: args.sectionId }
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
    changeRequestId: context.changeRequestId,
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

/** Registered dispatch entry point for the artifact and proposal tools. Never writes to the editor or the CR. */
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
  if (toolName === 'propose_subsystems') {
    return proposeSubsystems(db, args);
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

const proposalArgsSchema = z.object({
  items: z.array(z.object({
    systemId: z.string().min(1),
    confidence: z.enum(['high', 'medium', 'low']).default('medium'),
    reason: z.string().default(''),
  })).default([]),
  evidence: z.array(z.string()).default([]),
});

/**
 * T-31.2-47: model output is untrusted. Every id is re-resolved against `db.systems` and
 * must be a subsystem; `code`/`name` come from the catalog, never from the model.
 */
async function proposeSubsystems(
  db: TaskPlannerDatabase,
  rawArgs: Record<string, unknown>
): Promise<SubsystemProposalResult | ArtifactToolRefusal> {
  const parsed = proposalArgsSchema.safeParse(rawArgs);
  if (!parsed.success) {
    return refuse('INVALID_ARGUMENTS', 'Danh sách đề xuất subsystem không hợp lệ.');
  }
  const systems = await db.systems.toArray();
  const byId = new Map(systems.map((system) => [system.id, system]));
  const seen = new Set<string>();
  const items: SubsystemProposalItem[] = [];
  for (const candidate of parsed.data.items) {
    if (seen.has(candidate.systemId)) continue;
    seen.add(candidate.systemId);
    const system = byId.get(candidate.systemId);
    if (!system || !isSubsystem(system)) continue;
    items.push({
      systemId: system.id,
      code: system.code,
      name: system.name,
      confidence: candidate.confidence,
      reason: candidate.reason,
    });
  }
  return { items, evidence: parsed.data.evidence };
}
