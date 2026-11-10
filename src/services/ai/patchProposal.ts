import type { TaskPlannerDatabase } from '../../db';
import { z } from 'zod';
import { buildSectionIndex, splitLines, type ArtifactSection } from '../../utils/markdownSections';
import {
  createUnifiedLineDiff,
  MAX_DIFF_CELLS,
  type DiffBudgetRefusal,
  type UnifiedLineDiff,
} from '../../utils/lineDiff';
import { readNoteMarkdown } from '../../utils/noteBody';
import type { Note } from '../../types/models';
import type { AiSkill } from '../../types/aiOffice';

/** Cap on both the supplied text and the resulting changed lines. */
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
  | 'PATCH_TARGET_REQUIRED'
  | 'PATCH_TARGET_INVALID';

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
  target: 'note' | 'skill';
  id: string;
  version: number;
  approvalState: 'approved' | 'unapproved';
  markdown: string;
  baseHash: string;
  sectionIndex: ArtifactSection[];
}

export interface ArtifactPatchProposal {
  proposalId: string;
  target: 'note' | 'skill';
  id: string;
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

export function refuse(code: ArtifactToolRefusalCode, message: string, extra: Partial<ArtifactToolRefusal> = {}): ArtifactToolRefusal {
  return { refused: true, code, message, ...extra };
}

export function isRefusal(result: ArtifactToolResult): result is ArtifactToolRefusal {
  return (result as ArtifactToolRefusal).refused === true;
}

export async function defaultSha256(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

const targetArgsSchema = z.object({ target: z.enum(['note', 'skill']), id: z.string().min(1) });
const patchArgsSchema = targetArgsSchema.extend({
  sectionId: z.string().min(1, 'sectionId không được để trống'),
  expectedHeading: z.string().min(1, 'expectedHeading không được để trống'),
  baseHash: z.string().regex(/^[a-f0-9]{64}$/, 'baseHash không hợp lệ'),
  operation: z.enum(['append', 'replace']),
  newContent: z.string({ message: 'newContent phải là chuỗi' }),
});

export async function readPatchTarget(
  db: TaskPlannerDatabase,
  rawArgs: Record<string, unknown>
): Promise<ArtifactToolResult> {
  const parsed = targetArgsSchema.safeParse(rawArgs);
  if (!parsed.success) {
    return refuse('INVALID_ARGUMENTS', `Đối số không hợp lệ: ${parsed.error.issues.map((issue) => issue.message).join('; ')}.`);
  }
  const { target, id } = parsed.data;
  const row = target === 'note'
    ? await db.notes.get(id)
    : await db.aiSkills.get(id);
  const markdown = target === 'note'
    ? row && readNoteMarkdown((row as Note).body)
    : (row as AiSkill | undefined)?.body;
  if (markdown === undefined) {
    return refuse('ARTIFACT_NOT_FOUND', 'Không tìm thấy tài liệu. Hãy chọn tài liệu hiện có rồi thử lại.');
  }
  const baseHash = await defaultSha256(markdown.trim());
  return { target, id, version: 0, approvalState: 'unapproved', markdown, baseHash, sectionIndex: buildSectionIndex(markdown) };
}

interface SectionSlice {
  section: ArtifactSection;
  bodyLines: string[];
  /** Line indices (inclusive) of the non-blank body core, in whole-document space. */
  coreStart: number;
  coreEnd: number;
}

export function locateSection(markdown: string, sectionId: string): SectionSlice | ArtifactToolRefusal {
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

/** The document's own line-ending style is part of its identity. */
export function detectEol(markdown: string): '\r\n' | '\n' {
  const crlf = (markdown.match(/\r\n/g) ?? []).length;
  const lfOnly = (markdown.match(/(?<!\r)\n/g) ?? []).length;
  return crlf > 0 && crlf >= lfOnly ? '\r\n' : '\n';
}

export function applyOperation(
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

export function countLogicalLines(text: string): number {
  if (text === '') return 0;
  const lines = splitLines(text);
  return lines.length > 0 && lines[lines.length - 1] === '' ? lines.length - 1 : lines.length;
}

/** Prepare a reviewable proposal only; never writes a document or approves a version. */
export async function preparePatch(
  db: TaskPlannerDatabase,
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

  const snapshot = await readPatchTarget(db, args);
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

  // Exact heading match — never fuzzy-retarget a renamed section.
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
    fromLabel: `a/${args.target}:${args.id}`,
    toLabel: `b/${args.target}:${args.id}`,
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
    target: args.target,
    id: args.id,
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
