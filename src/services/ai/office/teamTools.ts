import type { TaskPlannerDatabase } from '../../../db';
import { MAX_BATCH_SIZE } from '../../../types/aiOffice';
import { rankBM25, extractRelevantSnippet } from '../../../utils/bm25';
import { buildTeamBm25Docs, getTeamTurn } from '../../../db/repositories/teamTranscriptRepo';
import { normalizeToolName, type AiToolDefinition } from '../aiTools';

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
  | 'BATCH_TOO_LARGE'
  | 'EMPTY_BATCH';

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
      description: `Giao một lô việc cho các nhân viên trong nhóm. Tối đa ${MAX_BATCH_SIZE} việc mỗi lô. Lead phải chờ toàn bộ lô hoàn tất rồi mới tổng hợp. skillId chỉ mang tính thông tin — kỹ năng được gán cho nhân viên mới là căn cứ.`,
      parameters: {
        type: 'object',
        properties: {
          assignments: {
            type: 'array',
            description: `Danh sách việc, tối đa ${MAX_BATCH_SIZE} phần tử.`,
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
];

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
    excerpt: extractRelevantSnippet(doc.body, query, 400),
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
    content: row.content,
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
  return JSON.stringify({ name: skill.name, description: skill.description, body: skill.body });
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
    default:
      return JSON.stringify({ error: `Unknown team tool: ${name}` });
  }
}
