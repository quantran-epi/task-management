import type { TaskPlannerDatabase } from '../../../db';
import type { AiTeamLinkItemType } from '../../../types/aiOffice';
import { rankBM25, extractRelevantSnippet } from '../../../utils/bm25';
import { buildTeamBm25Docs, getTeamTurn } from '../../../db/repositories/teamTranscriptRepo';
import { listTeamLinks, listTeamMembers } from '../../../db/repositories/aiTeamRepo';
import { executeAiTool, normalizeToolName, type AiToolDefinition } from '../aiTools';
import { wrapUntrusted } from './teamPrompts';

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
}

export type TeamToolRefusalCode =
  | 'TURN_NOT_IN_TEAM'
  | 'SKILL_NOT_ASSIGNED'
  | 'ITEM_NOT_LINKED'
  | 'AGENT_NOT_IN_ROSTER'
  | 'EMPTY_BATCH'
  | 'INVALID_ARGUMENT'
  | 'NOT_QUEUED'
  | 'ASSIGNMENT_NOT_IN_BATCH';

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

/** D-24: the only path by which a skill body ever reaches a model. */
async function readSkill(ctx: TeamToolContext): Promise<string> {
  if (!ctx.skillId) {
    return JSON.stringify(refuse('SKILL_NOT_ASSIGNED', 'Nhân viên này chưa được gán kỹ năng nào.'));
  }
  const skill = await ctx.db.aiSkills.get(ctx.skillId);
  if (!skill) {
    return JSON.stringify(refuse('SKILL_NOT_ASSIGNED', 'Nhân viên này chưa được gán kỹ năng nào.'));
  }
  // CR-07: tool results bypass the prompt assembler, so the untrusted-data boundary
  // must be applied here, where the provenance is known.
  return JSON.stringify({
    name: skill.name,
    description: skill.description,
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
    default:
      return JSON.stringify({ error: `Unknown team tool: ${name}` });
  }
}
