import type { TaskPlannerDatabase } from '../../../db';
import type { AiTeamLinkItemType } from '../../../types/aiOffice';
import { rankBM25, extractRelevantSnippet } from '../../../utils/bm25';
import { buildTeamBm25Docs, getTeamTurn } from '../../../db/repositories/teamTranscriptRepo';
import { listTeamLinks, listTeamMembers } from '../../../db/repositories/aiTeamRepo';
import { executeAiTool, normalizeToolName, type AiToolDefinition } from '../aiTools';
import { isRefusal, prepareSkillVersionDiff } from '../patchProposal';
import {
  createSkillVersion,
  getLatestApprovedVersionNumber,
} from '../../../db/repositories/aiSkillVersionRepo';
import { AiSkillVersionInputSchema } from '../../../validation/aiOfficeSchemas';
import { wrapUntrusted } from './teamPrompts';
import { USER_PARTICIPANT_ID } from '../../../types/teamChat';

/**
 * AI Office team tools (D-11, D-24, D-26, D-27, D-33).
 *
 * CROSS-TEAM READ GUARD: `teamId`, `threadId` and `agentId` always come from the
 * request-bound `TeamToolContext` the coordinator owns. No handler reads a team, thread
 * or agent id out of the model-supplied `args` — a model can only name a turn, item or
 * agent that must still be verified against the context's team.
 *
 * Every handler is fully offline: it reads IndexedDB and `src/utils/bm25.ts` only.
 */

export interface TeamToolContext {
  db: TaskPlannerDatabase;
  teamId: string;
  threadId: string;
  agentId: string;
  /** The caller's assigned skill (D-25). Absent means the agent has none. */
  skillId?: string | undefined;
  /**
   * D-18: the approved version pinned on this attempt. Absent means the implicit baseline
   * (no approved row exists yet), so `read_skill` reads the current `aiSkills` row.
   */
  skillVersion?: number | undefined;
}

export type TeamToolRefusalCode =
  | 'TURN_NOT_IN_TEAM'
  | 'SKILL_NOT_ASSIGNED'
  | 'ITEM_NOT_LINKED'
  | 'AGENT_NOT_IN_ROSTER'
  | 'EMPTY_BATCH'
  | 'INVALID_ARGUMENT'
  | 'NOT_QUEUED'
  | 'ASSIGNMENT_NOT_IN_BATCH'
  | 'RECIPIENT_NOT_IN_ROSTER'
  | 'EMPTY_MESSAGE';

/** Mirrors `ArtifactToolRefusal`: a refusal is a returned value, never a thrown error. */
export interface TeamToolRefusal {
  refused: true;
  code: TeamToolRefusalCode;
  message: string;
}

function refuse(code: TeamToolRefusalCode, message: string): TeamToolRefusal {
  return { refused: true, code, message };
}

export const TEAM_TOOL_DEFINITIONS: AiToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'search_team_history',
      description:
        'Tìm trong lịch sử nhóm bằng BM25 cục bộ (không cần mạng). Trả về các lượt khớp dạng rút gọn: turnId, agent, timestamp, kind, excerpt. Dùng read_team_turn để đọc toàn văn một lượt.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Từ khóa cần tìm trong lịch sử nhóm.' },
          limit: {
            type: 'number',
            description: 'Số lượt tối đa trả về (mặc định 8, tối đa 20).',
          },
          addressedToMe: {
            type: 'boolean',
            description:
              'Chỉ tìm trong các tin được gửi tới bạn (to[] chứa bạn). Bỏ trống để tìm toàn bộ lịch sử nhóm.',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_team_turn',
      description:
        'Đọc toàn văn một lượt trong lịch sử nhóm theo turnId. Từ chối nếu lượt đó không thuộc nhóm này.',
      parameters: {
        type: 'object',
        properties: {
          turnId: { type: 'string', description: 'Id của lượt cần đọc.' },
        },
        required: ['turnId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_skill',
      description:
        'Đọc toàn văn kỹ năng được gán cho bạn. Chỉ gọi khi mô tả kỹ năng trong hướng dẫn chưa đủ.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_linked_items',
      description:
        'Liệt kê các mục được liên kết với nhóm (CR, tác vụ, hệ thống, ghi chú, tài liệu) dạng rút gọn: itemId, itemType, name, code.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_linked_context',
      description:
        'Đọc toàn văn nội dung của một mục đã liên kết với nhóm. Với ghi chú và tài liệu trả về toàn bộ body, không cắt bớt. Từ chối nếu mục không nằm trong liên kết của nhóm.',
      parameters: {
        type: 'object',
        properties: {
          itemId: { type: 'string', description: 'Id của mục đã liên kết.' },
        },
        required: ['itemId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delegate_batch',
      description:
        'Giao một lô việc cho các nhân viên trong nhóm. Lead phải chờ toàn bộ lô hoàn tất rồi mới tổng hợp. skillId chỉ mang tính thông tin — kỹ năng được gán cho nhân viên mới là căn cứ.',
      parameters: {
        type: 'object',
        properties: {
          assignments: {
            type: 'array',
            description: 'Danh sách việc cần giao.',
            items: {
              type: 'object',
              properties: {
                agentId: { type: 'string', description: 'Id nhân viên trong nhóm.' },
                skillId: { type: 'string', description: 'Id kỹ năng gợi ý (không bắt buộc).' },
                task: { type: 'string', description: 'Nội dung chỉ dẫn cho nhân viên.' },
              },
              required: ['agentId', 'task'],
            },
          },
        },
        required: ['assignments'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'amend_assignments',
      description:
        'Huỷ hoặc sửa một việc còn ĐANG XẾP HÀNG trong lô đang chạy. Không dùng cho việc đang chạy — việc đang chạy chỉ nhận tin nhắn mới.',
      parameters: {
        type: 'object',
        properties: {
          operations: {
            type: 'array',
            description: 'Danh sách thao tác cần áp.',
            items: {
              type: 'object',
              properties: {
                op: { type: 'string', enum: ['cancel', 'rewrite_task'] },
                assignmentId: {
                  type: 'string',
                  description: 'Id dòng assignment lấy từ hiện trạng lô.',
                },
                task: { type: 'string', description: 'Nội dung mới, chỉ khi op = rewrite_task.' },
                reason: { type: 'string', description: 'Lý do ngắn để báo cáo lại cho người dùng.' },
              },
              required: ['op', 'assignmentId'],
            },
          },
        },
        required: ['operations'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_skill_version',
      description:
        'Đề xuất một phiên bản mới cho kỹ năng đang được gán cho bạn. Không thay đổi gì cho tới khi người dùng duyệt. Phải gửi toàn văn nội dung mới, không phải bản vá.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Tên mới của kỹ năng.' },
          description: {
            type: 'string',
            description: 'Mô tả mới — đây là phần nhân viên khác thấy trước.',
          },
          body: { type: 'string', description: 'Toàn văn nội dung mới của kỹ năng.' },
          evidence: {
            type: 'string',
            description: 'Bằng chứng ngắn từ lượt chạy này (không bắt buộc).',
          },
        },
        required: ['name', 'description', 'body'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_message',
      description:
        'Gửi một tin nhắn cho một hoặc nhiều thành viên trong nhóm (trưởng nhóm, nhân viên, người dùng). Người nhận đang chạy sẽ đọc tin ở vòng công cụ kế tiếp; người nhận đang rảnh sẽ bắt đầu một lượt mới. Dùng khi cần trao đổi trực tiếp thay vì giao việc.',
      parameters: {
        type: 'object',
        properties: {
          to: {
            type: 'array',
            description: 'Danh sách id người nhận trong nhóm.',
            items: { type: 'string' },
          },
          content: { type: 'string', description: 'Nội dung tin nhắn.' },
        },
        required: ['to', 'content'],
      },
    },
  },
];

/**
 * 37.1 D-27/D-28: tools only the leader may call. Declared ONCE here; the coordinator derives
 * its employee payload from it, so adding a tool above can never leak it to an employee.
 */
export const LEAD_ONLY_TEAM_TOOLS: ReadonlySet<string> = new Set([
  'delegate_batch',
  'amend_assignments',
]);

/** D-11: compact BM25 hits; the full body is only reachable through `read_team_turn`. */
async function searchTeamHistory(
  args: Record<string, any>,
  ctx: TeamToolContext
): Promise<string> {
  const query = typeof args.query === 'string' ? args.query : '';
  const limit = Math.min(Math.max(1, Number(args.limit) || 8), 20);
  // ponytail: rankBM25 tokenizes the whole candidate set per call. Cap to the last 2 000
  // rows if a personal transcript ever gets that large.
  const docs = await buildTeamBm25Docs(ctx.threadId, ctx.db);
  // 37.1 R8: `addressedToMe` narrows to messages whose `to[]` names the caller. The log is
  // the addressing record; `chatMessages` only carries the text, so the filter reads the log
  // and the ranking still runs on the transcript docs.
  if (args.addressedToMe === true) {
    const mine = await ctx.db.teamMessages
      .where('teamId')
      .equals(ctx.teamId)
      .filter((row) => row.to.includes(ctx.agentId))
      .toArray();
    const allowed = new Set(mine.map((row) => row.id));
    const addressed = docs.filter((doc) => allowed.has(doc.id));
    const hits = rankBM25(query, addressed, { limit }).map(({ doc }) => ({
      turnId: doc.id,
      agent: doc.title,
      timestamp: doc.updatedAt ?? null,
      kind: doc.tags[0] ?? null,
      excerpt: wrapUntrusted('TRÍCH ĐOẠN', extractRelevantSnippet(doc.body, query, 400)),
    }));
    return JSON.stringify(hits);
  }
  const hits = rankBM25(query, docs, { limit }).map(({ doc }) => ({
    turnId: doc.id,
    agent: doc.title,
    timestamp: doc.updatedAt ?? null,
    kind: doc.tags[0] ?? null,
    // CR-07: excerpts are untrusted data too.
    excerpt: wrapUntrusted('TRÍCH ĐOẠN', extractRelevantSnippet(doc.body, query, 400)),
  }));
  return JSON.stringify(hits);
}

async function readTeamTurn(args: Record<string, any>, ctx: TeamToolContext): Promise<string> {
  const turnId = typeof args.turnId === 'string' ? args.turnId : '';
  const row = await getTeamTurn(ctx.threadId, turnId, ctx.db);
  if (!row) return JSON.stringify(refuse('TURN_NOT_IN_TEAM', 'Lượt hội thoại không thuộc nhóm này.'));
  return JSON.stringify({
    turnId: row.id,
    agent: row.agentName ?? (row.role === 'user' ? 'Người dùng' : 'Trợ lý'),
    timestamp: row.createdAt,
    kind: row.messageKind ?? row.role,
    // CR-07: transcript content is untrusted data on the tool path.
    content: wrapUntrusted('LƯỢT HỘI THOẠI', row.content),
  });
}

/**
 * D-18: exact compound-index lookup, never `.between(...).last()` — that would serve the
 * highest version ≤ the pin, which is different content.
 *
 * WR-02/IN-05: a present pin must resolve to an approved row. Falling back to the current row
 * would serve content newer than the assignment's pin — the pin would silently stop meaning
 * anything. Only an absent pin (mention-started turn) legitimately reads the current row.
 * The refusal says what the agent can still do: it cannot change its own pin mid-run.
 */
const PIN_UNRESOLVED_MESSAGE =
  'Không đọc được đúng phiên bản kỹ năng đã ghim cho lượt chạy này. Hãy dùng phần mô tả kỹ năng ở trên.';

/** The subset both `aiSkills` and `aiSkillVersions` rows carry. */
interface SkillContent {
  name: string;
  description: string;
  body: string;
}

async function resolvePinnedSkill(
  skillId: string,
  ctx: TeamToolContext
): Promise<{ skill: SkillContent } | { refusal: TeamToolRefusal }> {
  const pinned =
    ctx.skillVersion === undefined
      ? undefined
      : await ctx.db.aiSkillVersions
          .where('[skillId+version]')
          .equals([skillId, ctx.skillVersion])
          .first();
  if (ctx.skillVersion !== undefined && pinned?.status !== 'approved') {
    return { refusal: refuse('SKILL_NOT_ASSIGNED', PIN_UNRESOLVED_MESSAGE) };
  }
  const skill = pinned ?? (await ctx.db.aiSkills.get(skillId));
  return skill
    ? { skill }
    : { refusal: refuse('SKILL_NOT_ASSIGNED', 'Nhân viên này chưa được gán kỹ năng nào.') };
}

/** D-24: the only path by which a skill body ever reaches a model. */
async function readSkill(ctx: TeamToolContext): Promise<string> {
  if (!ctx.skillId) {
    return JSON.stringify(refuse('SKILL_NOT_ASSIGNED', 'Nhân viên này chưa được gán kỹ năng nào.'));
  }
  const resolved = await resolvePinnedSkill(ctx.skillId, ctx);
  if ('refusal' in resolved) return JSON.stringify(resolved.refusal);
  const { skill } = resolved;
  // CR-07: tool results bypass the prompt assembler, so the untrusted-data boundary
  // must be applied here, where the provenance is known. D-22: approved is not trusted.
  // CR-04/IN-07: the name is model-authored after approval — wrap it, never return it raw.
  return JSON.stringify({
    name: wrapUntrusted(`TÊN KỸ NĂNG ${skill.name}`, skill.name),
    description: wrapUntrusted(`MÔ TẢ KỸ NĂNG ${skill.name}`, skill.description),
    body: wrapUntrusted(`KỸ NĂNG ${skill.name}`, skill.body),
  });
}

interface LinkedItemLabel {
  name: string;
  code?: string;
}

async function resolveLinkedItemLabel(
  itemType: AiTeamLinkItemType,
  itemId: string,
  db: TaskPlannerDatabase
): Promise<LinkedItemLabel | undefined> {
  switch (itemType) {
    case 'cr': {
      const row = await db.changeRequests.get(itemId);
      return row ? { name: row.name, code: row.code } : undefined;
    }
    case 'system': {
      const row = await db.systems.get(itemId);
      return row ? { name: row.name, code: row.code } : undefined;
    }
    case 'task': {
      const row = await db.tasks.get(itemId);
      return row ? { name: row.name } : undefined;
    }
    case 'note':
    case 'document': {
      const row = await db.notes.get(itemId);
      if (!row || row.deletedAt) return undefined;
      const firstLine = row.body.split('\n')[0]?.trim() ?? '';
      return { name: row.title?.trim() || firstLine };
    }
  }
}

/** Compact only — no bodies (D-26). */
async function listLinkedItems(ctx: TeamToolContext): Promise<string> {
  const links = await listTeamLinks(ctx.teamId, ctx.db);
  const items = [];
  for (const link of links) {
    const label = await resolveLinkedItemLabel(link.itemType, link.itemId, ctx.db);
    items.push({
      itemId: link.itemId,
      itemType: link.itemType,
      // WR-01: raw. `buildLeadTurnRequest` owns the prompt boundary and wraps this value
      // once; wrapping here too nested the block inside itself and destroyed the inner
      // header. A tool result is data by role — the same rule `get_linked_context` follows.
      name: label?.name ?? link.itemId,
      ...(label?.code ? { code: label.code } : {}),
    });
  }
  return JSON.stringify(items);
}

/**
 * D-27: the lead reaches the full content of a linked item. Notes and documents are
 * returned whole (Phase 31 "entire document retained without truncation" precedent);
 * task/CR/system delegate to the existing `get_item_details` resolver so the two
 * implementations cannot drift.
 *
 * Returned text is data. CR-07: the prompt assembler never sees tool results, so each
 * handler wraps its own body in the untrusted-data delimiter before returning.
 */
async function getLinkedContext(args: Record<string, any>, ctx: TeamToolContext): Promise<string> {
  const itemId = typeof args.itemId === 'string' ? args.itemId : '';
  const links = await listTeamLinks(ctx.teamId, ctx.db);
  const link = links.find((row) => row.itemId === itemId);
  if (!link) {
    return JSON.stringify(refuse('ITEM_NOT_LINKED', 'Mục này không được liên kết với nhóm.'));
  }

  if (link.itemType === 'note' || link.itemType === 'document') {
    const note = await ctx.db.notes.get(itemId);
    if (!note || note.deletedAt) {
      return JSON.stringify(refuse('ITEM_NOT_LINKED', 'Mục này không được liên kết với nhóm.'));
    }
    return JSON.stringify({
      itemId,
      itemType: link.itemType,
      // IN-03: raw, exactly like `list_linked_items` — a tool result is data by role, and
      // `buildLeadTurnRequest` wraps the name once at the prompt boundary.
      name: note.title ?? '',
      // CR-07: a linked note/document body is untrusted data.
      body: wrapUntrusted(`MỤC LIÊN KẾT ${note.title ?? itemId}`, note.body),
    });
  }

  return executeAiTool('get_item_details', { type: link.itemType, id: itemId }, ctx.db);
}

/**
 * D-33: the validator the coordinator calls. It never dispatches anything: the
 * coordinator intercepts `delegate_batch` in the lead's `executeToolFn` before
 * `dispatchAiToolCall`, so this must never be wired into `AI_DATABASE_TOOLS`.
 */
async function delegateBatch(args: Record<string, any>, ctx: TeamToolContext): Promise<string> {
  const assignments: any[] = Array.isArray(args.assignments) ? args.assignments : [];
  if (assignments.length === 0) {
    return JSON.stringify(refuse('EMPTY_BATCH', 'Danh sách giao việc đang trống.'));
  }

  const members = await listTeamMembers(ctx.teamId, ctx.db);
  const roster = new Set(members.map((member) => member.agentId));

  const normalized = [];
  for (const raw of assignments) {
    const agentId = typeof raw?.agentId === 'string' ? raw.agentId : '';
    if (!roster.has(agentId)) {
      return JSON.stringify(
        refuse('AGENT_NOT_IN_ROSTER', `Nhân viên "${agentId}" không thuộc nhóm này.`)
      );
    }
    const task = typeof raw?.task === 'string' ? raw.task : '';
    // D-33: skillId is informational only; the agent's assigned skill stays authoritative.
    const skillId = typeof raw?.skillId === 'string' ? raw.skillId : undefined;
    normalized.push({ agentId, ...(skillId ? { skillId } : {}), task });
  }

  return JSON.stringify({ assignments: normalized });
}

/**
 * 37.1 D-28: argument validation only. The coordinator owns the real gate — it re-validates
 * the id against the live ledger, because a model-supplied id must never be trusted.
 */
/**
 * 37.1 D-06/D-27: argument validation only, exactly like `delegateBatch`. Ledger membership is
 * NOT checked here — the validator has no `batchId`; the coordinator's tier-1 executor owns it
 * against the live `openBatchId`.
 */
async function amendAssignments(args: Record<string, any>): Promise<string> {
  const operations: any[] = Array.isArray(args.operations) ? args.operations : [];
  if (operations.length === 0) {
    return JSON.stringify(refuse('INVALID_ARGUMENT', 'Danh sách thao tác đang trống.'));
  }

  const normalized: Array<{ op: 'cancel' | 'rewrite_task'; assignmentId: string; task?: string; reason?: string }> = [];
  for (const raw of operations) {
    const op = raw?.op;
    // WR-08: an argument-shape failure is `INVALID_ARGUMENT`, not `NOT_QUEUED` — the model
    // self-corrects on the code, and `NOT_QUEUED` sent it retrying against another id.
    if (op !== 'cancel' && op !== 'rewrite_task') {
      return JSON.stringify(
        refuse('INVALID_ARGUMENT', 'Thao tác không hợp lệ: chỉ hỗ trợ cancel hoặc rewrite_task.')
      );
    }
    const assignmentId = typeof raw?.assignmentId === 'string' ? raw.assignmentId : '';
    if (!assignmentId) {
      return JSON.stringify(refuse('INVALID_ARGUMENT', 'Thiếu id việc cần áp dụng.'));
    }
    const task = typeof raw?.task === 'string' ? raw.task.trim() : '';
    if (op === 'rewrite_task' && !task) {
      return JSON.stringify(
        refuse('INVALID_ARGUMENT', 'Thiếu nội dung mới cho thao tác sửa việc.')
      );
    }
    const reason = typeof raw?.reason === 'string' && raw.reason ? raw.reason : undefined;
    normalized.push({
      op,
      assignmentId,
      ...(op === 'rewrite_task' ? { task } : {}),
      ...(reason ? { reason } : {}),
    });
  }

  return JSON.stringify({ operations: normalized });
}

/**
 * 37.1 R6/R9: argument validation for `send_message`. Recipients must be participants of THIS
 * team — the roster comes from stored rows, never from the model's claim. The coordinator owns
 * the routing half (append to the log, start a turn), because only it knows what is running.
 */
async function sendMessage(args: Record<string, any>, ctx: TeamToolContext): Promise<string> {
  const content = typeof args.content === 'string' ? args.content.trim() : '';
  if (!content) return JSON.stringify(refuse('EMPTY_MESSAGE', 'Nội dung tin nhắn đang trống.'));

  const requested = Array.isArray(args.to) ? args.to : [];
  const members = await listTeamMembers(ctx.teamId, ctx.db);
  const team = await ctx.db.aiTeams.get(ctx.teamId);
  const allowed = new Set<string>([USER_PARTICIPANT_ID, ...members.map((row) => row.agentId)]);
  if (team?.leadId !== undefined) allowed.add(team.leadId);

  const to: string[] = [];
  for (const raw of requested) {
    const id = typeof raw === 'string' ? raw : '';
    if (!allowed.has(id)) {
      return JSON.stringify(
        refuse('RECIPIENT_NOT_IN_ROSTER', `Người nhận "${id}" không thuộc nhóm này.`)
      );
    }
    if (id === ctx.agentId) {
      return JSON.stringify(refuse('RECIPIENT_NOT_IN_ROSTER', 'Không thể tự gửi tin cho chính mình.'));
    }
    if (!to.includes(id)) to.push(id);
  }
  if (to.length === 0) {
    return JSON.stringify(refuse('RECIPIENT_NOT_IN_ROSTER', 'Chưa chọn người nhận nào.'));
  }

  return JSON.stringify({ to, content });
}

/**
 * D-01/D-02/D-04: the one write an employee may make. It stores an inert `pending` row and
 * returns the diff — never a status, never a version number, never an `aiSkills` write.
 *
 * D-02: the proposal is always for the caller's own assigned skill, so there is no separate
 * leader guard — a leader has no `skillId` and is refused here.
 */
async function proposeSkillVersion(
  args: Record<string, any>,
  ctx: TeamToolContext
): Promise<string> {
  if (!ctx.skillId) {
    return JSON.stringify(refuse('SKILL_NOT_ASSIGNED', 'Nhân viên này chưa được gán kỹ năng nào.'));
  }
  // CR-01: the base is what the RUN is pinned to, not whatever is approved now. Reading the
  // current row let a pinned agent propose a revert of a version approved mid-batch, and the
  // resulting `baseVersion === currentApproved` made the proposal look fresh — approving it
  // silently discarded the newer content. Same pin plumbing as `read_skill`; refuse rather
  // than re-base, because a silent re-base is the bug.
  const resolved = await resolvePinnedSkill(ctx.skillId, ctx);
  if ('refusal' in resolved) return JSON.stringify(resolved.refusal);
  const skill = resolved.skill;
  // WR-06: read the base number once and pass it into the repo, so the stored `baseVersion`
  // and the diff label cannot disagree if an approval lands between the two reads.
  const baseVersion =
    ctx.skillVersion ?? (await getLatestApprovedVersionNumber(ctx.skillId, ctx.db));

  const name = typeof args.name === 'string' ? args.name.trim() : '';
  const description = typeof args.description === 'string' ? args.description.trim() : '';
  const body = typeof args.body === 'string' ? args.body.trim() : '';
  if (!name || !description || !body) {
    return JSON.stringify(refuse('INVALID_ARGUMENT', 'Thiếu nội dung đề xuất.'));
  }
  // The repo schema would throw on an over-long field, and a throw is not the team-tool
  // convention — validate here so the model gets a code it can self-correct on.
  const evidence = typeof args.evidence === 'string' ? args.evidence.trim() : '';
  if (evidence.length > 2000) {
    return JSON.stringify(
      refuse('INVALID_ARGUMENT', 'Bằng chứng quá dài (tối đa 2000 ký tự).')
    );
  }
  const draft = {
    skillId: ctx.skillId,
    name,
    description,
    body,
    ...(evidence ? { evidence } : {}),
  };
  const parsed = AiSkillVersionInputSchema.safeParse(draft);
  if (!parsed.success) {
    return JSON.stringify(
      refuse(
        'INVALID_ARGUMENT',
        `Đề xuất không hợp lệ: ${parsed.error.issues.map((issue) => issue.message).join('; ')}.`
      )
    );
  }

  const diff = prepareSkillVersionDiff({
    skillId: ctx.skillId,
    base: { name: skill.name, description: skill.description, body: skill.body },
    next: { name, description, body },
    baseVersion,
  });
  // A refusal writes no row — an empty or oversized card must never exist.
  if (isRefusal(diff)) return JSON.stringify(diff);

  // T-39-13: never pass `status`; the repo default is `pending` and it refuses anything else.
  const row = await createSkillVersion(
    { skillId: ctx.skillId, name, description, body, ...(evidence ? { evidence } : {}) },
    ctx.db,
    baseVersion
  );

  return JSON.stringify({
    proposalId: diff.proposalId,
    versionId: row.id,
    addedLines: diff.addedLines,
    removedLines: diff.removedLines,
    diffText: diff.diffText,
  });
}

export async function executeTeamTool(
  name: string,
  args: Record<string, any>,
  ctx: TeamToolContext
): Promise<string> {
  const input = args ?? {};
  switch (normalizeToolName(name)) {
    case 'search_team_history':
      return searchTeamHistory(input, ctx);
    case 'read_team_turn':
      return readTeamTurn(input, ctx);
    case 'read_skill':
      return readSkill(ctx);
    case 'list_linked_items':
      return listLinkedItems(ctx);
    case 'get_linked_context':
      return getLinkedContext(input, ctx);
    case 'delegate_batch':
      return delegateBatch(input, ctx);
    case 'amend_assignments':
      return amendAssignments(input);
    case 'propose_skill_version':
      return proposeSkillVersion(input, ctx);
    case 'send_message':
      return sendMessage(input, ctx);
    default:
      return JSON.stringify({ error: `Unknown team tool: ${name}` });
  }
}
