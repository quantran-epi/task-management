import type { TaskPlannerDatabase } from '../../db';
import { buildTeamBm25Docs, getTeamTurn } from '../../db/repositories/teamTranscriptRepo';
import { rankBM25, extractRelevantSnippet } from '../../utils/bm25';
import type { AiToolDefinition } from './aiTools';
import { wrapUntrusted } from './untrustedData';

/**
 * Quick 261126-q7j: the AI chat panel's own transcript search/read pair. The thread id is
 * ALWAYS supplied by the dispatcher from `ChatTurnRequest.threadId`; model arguments never
 * select a thread. The guards and ranking are the team tools' existing ones — no copy, no
 * new table, and no change to the context-compaction window.
 */

export type ChatHistoryToolRefusalCode =
  | 'TURN_NOT_IN_THREAD'
  | 'THREAD_CONTEXT_MISSING'
  | 'UNKNOWN_CHAT_HISTORY_TOOL';

export interface ChatHistoryToolRefusal {
  refused: true;
  code: ChatHistoryToolRefusalCode;
  message: string;
}

function refuse(code: ChatHistoryToolRefusalCode, message: string): ChatHistoryToolRefusal {
  return { refused: true, code, message };
}

export const CHAT_HISTORY_TOOL_DEFINITIONS: AiToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'search_chat_history',
      description:
        'Tìm trong lịch sử cuộc hội thoại hiện tại bằng BM25 cục bộ (không cần mạng). Trả về các lượt khớp dạng rút gọn: turnId, agent, timestamp, kind, excerpt. Dùng read_chat_turn để đọc toàn văn một lượt. Chỉ tìm trong cuộc hội thoại này.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Từ khóa cần tìm trong lịch sử cuộc hội thoại hiện tại.' },
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
      name: 'read_chat_turn',
      description:
        'Đọc toàn văn một lượt trong lịch sử cuộc hội thoại hiện tại theo turnId. Từ chối nếu lượt đó không thuộc cuộc hội thoại này.',
      parameters: {
        type: 'object',
        properties: {
          turnId: { type: 'string', description: 'Id của lượt cần đọc.' },
        },
        required: ['turnId'],
      },
    },
  },
];

export const CHAT_HISTORY_TOOL_NAMES: ReadonlySet<string> = new Set(
  CHAT_HISTORY_TOOL_DEFINITIONS.map((tool) => tool.function.name)
);

export async function executeChatHistoryTool(
  name: string,
  args: Record<string, any>,
  threadId: string,
  db: TaskPlannerDatabase,
  _signal?: AbortSignal
): Promise<string> {
  if (!threadId) {
    return JSON.stringify(
      refuse('THREAD_CONTEXT_MISSING', 'Không xác định được cuộc hội thoại hiện tại.')
    );
  }
  if (name === 'search_chat_history') {
    const query = typeof args.query === 'string' ? args.query : '';
    const limit = Math.min(Math.max(1, Number(args.limit) || 8), 20);
    // ponytail: rankBM25 tokenizes every row per call. Cap to the last 2 000 rows if a
    // personal transcript ever gets that large.
    const docs = await buildTeamBm25Docs(threadId, db);
    const hits = rankBM25(query, docs, { limit }).map(({ doc }) => ({
      turnId: doc.id,
      agent: doc.title,
      timestamp: doc.updatedAt ?? null,
      kind: doc.tags[0] ?? null,
      excerpt: wrapUntrusted('TRÍCH ĐOẠN', extractRelevantSnippet(doc.body, query, 400)),
    }));
    return JSON.stringify(hits);
  }
  if (name === 'read_chat_turn') {
    const turnId = typeof args.turnId === 'string' ? args.turnId : '';
    const row = await getTeamTurn(threadId, turnId, db);
    if (!row) {
      return JSON.stringify(
        refuse('TURN_NOT_IN_THREAD', 'Lượt hội thoại không thuộc cuộc hội thoại hiện tại.')
      );
    }
    return JSON.stringify({
      turnId: row.id,
      agent: row.agentName ?? (row.role === 'user' ? 'Người dùng' : 'Trợ lý'),
      timestamp: row.createdAt,
      kind: row.messageKind ?? row.role,
      content: wrapUntrusted('LƯỢT HỘI THOẠI', row.content),
    });
  }
  return JSON.stringify(refuse('UNKNOWN_CHAT_HISTORY_TOOL', 'Công cụ lịch sử không hợp lệ.'));
}
