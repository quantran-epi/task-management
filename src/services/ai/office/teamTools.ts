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
import { wrapField, wrapUntrusted } from '../untrustedData';
import { USER_PARTICIPANT_ID } from '../../../types/teamChat';
import { createNote, getNotesByFolder, updateNote } from '../../../db/repositories/noteRepo';
import { NOTE_BODY_MAX_LENGTH, NOTE_TITLE_MAX_LENGTH } from '../../../validation/schemas';
import { resolveMemberFolder } from '../../../db/repositories/teamDocsRepo';
import { getSshConfigById, getSshSecret } from '../../../services/sshService';
import {
  checkDirtyStatus,
  getDiffSummary,
  getFileDiff,
  getRecentCommits,
  getRemoteBranches,
  grepRemoteRef,
  InvalidGrepPatternError,
} from '../../../services/gitRemoteService';
import {
  confineRepoPath,
  getRemoteTree,
  PathOutsideRepoError,
  readRemoteFilePage,
} from '../../../services/gitRemoteTreeService';
import type { System } from '../../../types/models';
import type { SshConfig } from '../../../types/ssh';
import type { RemoteGitCommit } from '../../../types/gitRemote';
import {
  clampExploreMaxTurns,
  probeRemoteClaude,
  runRemoteExplore,
} from '../../../services/remoteExploreService';
import { MODEL_ID_REGEX } from '../../../services/agents/ghostDevConfig';

/**
 * AI Office team tools (D-11, D-24, D-26, D-27, D-33).
 *
 * CROSS-TEAM READ GUARD: `teamId`, `threadId` and `agentId` always come from the
 * request-bound `TeamToolContext` the coordinator owns. No handler reads a team, thread
 * or agent id out of the model-supplied `args` — a model can only name a turn, item or
 * agent that must still be verified against the context's team.
 *
 * Every handler except `git_read` is fully offline: it reads IndexedDB and
 * `src/utils/bm25.ts` only. `git_read` performs read-only SSH git reads against a
 * repository of a system linked to the team.
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
  /**
   * Phase 41 D-06: the caller's role, so a handler can refuse a write path the role must not
   * use. Absent means unknown, which is treated as an employee.
   */
  role?: 'lead' | 'employee' | undefined;
  /**
   * Phase 41 D-05: the caller's own docs folder. Absent means the tree is not ready.
   */
  folderId?: string | undefined;
  /**
   * WR-05: the team folder, so `write_doc` can re-resolve the caller's zone instead of trusting
   * the id it was handed. Absent means the tree is not ready.
   */
  teamFolderId?: string | undefined;
  /** Phase 41 D-02b: the caller's display name, used as the title prefix. */
  agentName?: string | undefined;
  /**
   * The turn's abort signal. `explore_repo` runs for minutes on the remote, so a cancelled turn
   * must be able to kill it instead of leaving it reading until the wall clock fires.
   */
  signal?: AbortSignal | undefined;
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
  | 'EMPTY_MESSAGE'
  // Phase 41: the three `write_doc` refusals. `LEAD_USES_DB_TOOLS` is its own code because
  // `INVALID_ARGUMENT` would blame the model's arguments for a role rule (D-06).
  | 'DOC_NOT_IN_YOUR_FOLDER'
  | 'TEAM_DOCS_NOT_READY'
  | 'LEAD_USES_DB_TOOLS'
  // Phase 42: `git_read` repo resolution. Truthful codes — a linked system that merely lacks
  // repo configuration is NOT "not linked" (D-07).
  | 'SYSTEM_NOT_LINKED'
  | 'NO_LINKED_REPO'
  // CR-03: git/SSH failure is infrastructure, not a bad argument. Reporting it as
  // `INVALID_ARGUMENT` told the model to retry variations forever instead of surfacing the
  // failure — the same reasoning that gives `LEAD_USES_DB_TOOLS` its own code.
  | 'GIT_READ_FAILED'
  // Phase 43 D-03: the remote lacks the Claude Code CLI. That is a configuration fact, not a bad
  // argument — the model must switch tier (`git_read`) rather than retry its question.
  | 'REMOTE_CLAUDE_UNAVAILABLE';

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
  {
    type: 'function',
    function: {
      name: 'write_doc',
      description:
        'Ghi tài liệu vào thư mục tài liệu của chính bạn. Ba action: list (liệt kê tài liệu trong thư mục của bạn, trả noteId để sửa), create (tạo tài liệu mới trong thư mục của bạn), update (sửa tài liệu đã có trong thư mục của bạn). Với update, truyền title để đổi tiêu đề, body để thay toàn văn nội dung, hoặc cả hai; bỏ trống một trường thì trường đó giữ nguyên. Không thể tạo thư mục, không thể ghi ra ngoài thư mục của bạn.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['list', 'create', 'update'] },
          title: { type: 'string', description: 'Tiêu đề tài liệu. Bỏ trống khi action = list.' },
          body: { type: 'string', description: 'Toàn văn nội dung tài liệu.' },
          noteId: { type: 'string', description: 'Id tài liệu cần sửa, chỉ dùng khi action = update.' },
        },
        required: ['action'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_read',
      description:
        'Đọc trạng thái git của repo remote qua SSH (chỉ đọc, không ghi). Tám action: branches (liệt kê nhánh), status (tệp chưa commit), log (N commit gần nhất của một nhánh), diff_summary (tổng hợp diff giữa base và target), diff_file (diff một tệp), read_file (một TRANG nội dung tệp tại một nhánh — dùng offset/limit, không trả cả file), tree (cây thư mục tại một nhánh), grep (tìm chuỗi hoặc biểu thức trong nội dung đã track của một nhánh). Repo lấy từ hệ thống đã liên kết với nhóm.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: [
              'branches',
              'status',
              'log',
              'diff_summary',
              'diff_file',
              'read_file',
              'tree',
              'grep',
            ],
            description: 'Hành động cần thực hiện.',
          },
          systemId: {
            type: 'string',
            description:
              'Chỉ cần khi nhóm liên kết nhiều hơn một hệ thống có repo. Phải là hệ thống đã liên kết.',
          },
          limit: {
            type: 'number',
            description:
              'log: số commit 1..50; grep: số kết quả 1..200; read_file: số dòng 1..2000.',
          },
          offset: { type: 'number', description: 'read_file: dòng bắt đầu, 1-based, mặc định 1.' },
          branch: { type: 'string', description: 'log, read_file, tree, grep: nhánh cần đọc.' },
          base: { type: 'string', description: 'diff_summary, diff_file: nhánh gốc.' },
          target: { type: 'string', description: 'diff_summary, diff_file: nhánh đích.' },
          filePath: { type: 'string', description: 'diff_file, read_file: đường dẫn tệp.' },
          dirPath: { type: 'string', description: 'tree: thư mục con (bỏ trống để đọc gốc).' },
          pattern: { type: 'string', description: 'grep: chuỗi hoặc biểu thức cần tìm.' },
          path: { type: 'string', description: 'grep: đường dẫn tệp hoặc thư mục cần giới hạn.' },
          caseSensitive: {
            type: 'boolean',
            description: 'grep: phân biệt hoa thường, mặc định true.',
          },
          literal: { type: 'boolean', description: 'grep: khớp nguyên văn thay vì biểu thức, mặc định false.' },
        },
        required: ['action'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'explore_repo',
      description:
        'Giao một câu hỏi RỘNG cho Claude Code chạy trên chính máy remote (chỉ đọc) và nhận lại báo cáo tóm tắt kèm đường dẫn:dòng. Dùng khi muốn hiểu cả một vùng code mà nếu tự đọc sẽ tốn nhiều lần read_file. KHÔNG dùng cho một chỗ cụ thể — grep rồi read_file rẻ hơn.',
      parameters: {
        type: 'object',
        properties: {
          question: {
            type: 'string',
            description: 'Câu hỏi cần trả lời, ví dụ "luồng xử lý đơn hàng đi qua những module nào".',
          },
          systemId: {
            type: 'string',
            description:
              'Chỉ cần khi nhóm liên kết nhiều hơn một hệ thống có repo. Phải là hệ thống đã liên kết.',
          },
          model: { type: 'string', description: 'Model chạy trên remote, mặc định haiku.' },
          maxTurns: {
            type: 'number',
            description: 'Số lượt tối đa của phiên chạy remote, mặc định 20, tối đa 40.',
          },
        },
        required: ['question'],
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

/**
 * Phase 41 D-06: tools only an employee may call. The mirror of `LEAD_ONLY_TEAM_TOOLS`, but NOT
 * symmetric in effect — this set is subtracted from the LEAD payload (`leadTools()`), while
 * `LEAD_ONLY_TEAM_TOOLS` is subtracted from the employee payload. A tool in both sets would be
 * offered to nobody. The leader keeps the DB tool plus the approval card as its write path.
 */
export const EMPLOYEE_ONLY_TEAM_TOOLS: ReadonlySet<string> = new Set(['write_doc']);

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

  // CR-03/WR-03: the delegated resolver embeds every free-text field the user authored, so its
  // result is not safe to return verbatim — the invariant above applies to all of them, not
  // just sticky-note bodies. The recipient is the lead, the one agent holding mutation tools.
  // WR-02: `name` / `code` are wrapped here too. This result is a `role: 'tool'` message and
  // never enters `buildLeadTurnRequest`, so the "wrapped once at the prompt boundary" rationale
  // does not apply on this path — leaving them raw leaves them raw.
  const raw = await executeAiTool('get_item_details', { type: link.itemType, id: itemId }, ctx.db);
  const parsed = JSON.parse(raw);

  if (parsed?.item && typeof parsed.item === 'object') {
    const item = parsed.item;
    item.name = wrapField(`TÊN MỤC ${itemId}`, item.name);
    item.jiraKey = wrapField(`MÃ JIRA ${itemId}`, item.jiraKey);
    item.description = wrapField(`MÔ TẢ MỤC ${itemId}`, item.description);
    item.notes = wrapField(`GHI CHÚ MỤC ${itemId}`, item.notes);
    item.reminderNote = wrapField(`GHI CHÚ NHẮC ${itemId}`, item.reminderNote);
    for (const listField of ['opsOwners', 'businessAnalysts', 'tags'] as const) {
      if (Array.isArray(item[listField])) {
        item[listField] = item[listField].map((entry: unknown) =>
          wrapField(`MỤC ${itemId}`, entry)
        );
      }
    }
    if (Array.isArray(item.checklist)) {
      item.checklist = item.checklist.map((entry: any) => ({
        ...entry,
        text: wrapField(`ĐẦU VIỆC ${itemId}`, entry?.text),
      }));
    }
    if (Array.isArray(item.reminders)) {
      item.reminders = item.reminders.map((reminder: any) => ({
        ...reminder,
        note: wrapField(`NHẮC NHỞ ${itemId}`, reminder?.note),
      }));
    }
    if (Array.isArray(item.documentLinks)) {
      item.documentLinks = item.documentLinks.map((link: unknown) =>
        wrapField(`LIÊN KẾT TÀI LIỆU ${itemId}`, link)
      );
    }
  }
  // WR-01: the linked CR's and system's names are user-authored free text too.
  parsed.crName = wrapField(`TÊN CR ${itemId}`, parsed.crName);
  parsed.crCode = wrapField(`MÃ CR ${itemId}`, parsed.crCode);
  parsed.systemName = wrapField(`TÊN HỆ THỐNG ${itemId}`, parsed.systemName);
  if (Array.isArray(parsed?.stickyNotes)) {
    parsed.stickyNotes = parsed.stickyNotes.map((note: any) => ({
      ...note,
      title: wrapField(`TIÊU ĐỀ GHI CHÚ ${note.id ?? itemId}`, note.title),
      body: wrapUntrusted(`GHI CHÚ ${note.title ?? note.id}`, String(note.body ?? '')),
    }));
  }
  return JSON.stringify(parsed);
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
    // AIO-SKILL-06: the unified diff carries the base side — context lines and removed lines —
    // so it reproduces the approved body verbatim. This is a `role: 'tool'` message, so nothing
    // downstream wraps it. Both UI surfaces recompute the diff from Dexie and never read this
    // field, so wrapping it costs the model nothing it needs.
    diffText: wrapUntrusted('BẢN KHÁC BIỆT ĐỀ XUẤT', diff.diffText),
  });
}

/**
 * Phase 41 D-01..D-06: the one write an employee may make.
 *
 * D-01: a team tool, deliberately absent from `MUTATION_TOOLS`, so it never reaches
 * `onMutationCheck` and the employee's read-only policy cannot block it. Same precedent as
 * `propose_skill_version` (39 D-04/D-05/D-06).
 *
 * D-04: the folder guard is code, not prompt. `parentId` always comes from `ctx.folderId` — a
 * client-supplied `parentId` in the arguments is never read — and `type` is the literal
 * `'document'` so an agent can never mint a folder and widen its own write area.
 */
/** IN-02: imported, not mirrored — a schema change cannot silently desync the refusal caps. */
const MAX_DOC_TITLE_LENGTH = NOTE_TITLE_MAX_LENGTH;
const MAX_DOC_BODY_LENGTH = NOTE_BODY_MAX_LENGTH;

/**
 * WR-03/IN-04: a whitelist, not a `!== 'folder'` blacklist. `NOTE_TYPES` also holds `diagram`,
 * and a diagram's body is its source — overwriting it destroys the diagram. Listing the type
 * lets the model see which notes it may touch.
 */
const WRITABLE_DOC_TYPES: ReadonlySet<string> = new Set(['document', 'quick_note']);

function isWritableDoc(note: { type?: string | undefined }): boolean {
  return note.type !== undefined && WRITABLE_DOC_TYPES.has(note.type);
}

async function writeDoc(args: Record<string, any>, ctx: TeamToolContext): Promise<string> {
  // D-06, guard half one: the leader's write path is the DB tool plus the approval card. This
  // runs BEFORE `action` is read, so no branch is reachable for a lead-role call. The payload
  // filter (`EMPLOYEE_ONLY_TEAM_TOOLS`, plan 41-06) keeps the tool out of the model's hands;
  // this guard keeps a leaked or hand-crafted call from writing anything.
  if (ctx.role === 'lead') {
    return JSON.stringify(
      refuse(
        'LEAD_USES_DB_TOOLS',
        'Leader ghi bằng công cụ cơ sở dữ liệu, mỗi lần ghi dừng ở thẻ phê duyệt.'
      )
    );
  }
  // D-05: the handler NEVER creates a folder — that belongs to the coordinator, in one place,
  // inside a transaction.
  if (!ctx.folderId) {
    return JSON.stringify(
      refuse('TEAM_DOCS_NOT_READY', 'Thư mục tài liệu của bạn chưa sẵn sàng.')
    );
  }
  const folderId = ctx.folderId;
  const action = typeof args.action === 'string' ? args.action : '';

  // WR-02: the owner can delete the member folder mid-turn. Writing anyway would create a note
  // with a dangling `parentId` that `DocFolderTree` never shows — success reported for a
  // document the user cannot see. The truthful outcome is `TEAM_DOCS_NOT_READY`.
  //
  // WR-05: shape is not ownership. Re-resolve the caller's zone from its identity (slug + team
  // folder) so a stale or crossed `ctx.folderId` cannot write into another agent's area — this
  // is the last line of defence, and the coordinator's map is not a proof.
  if (ctx.teamFolderId === undefined) {
    return JSON.stringify(
      refuse('TEAM_DOCS_NOT_READY', 'Thư mục tài liệu của bạn chưa sẵn sàng.')
    );
  }
  const owned = await resolveMemberFolder(ctx.teamId, ctx.agentId, ctx.teamFolderId, ctx.db);
  if (owned === undefined || owned !== folderId) {
    return JSON.stringify(
      refuse('TEAM_DOCS_NOT_READY', 'Thư mục tài liệu của bạn chưa sẵn sàng.')
    );
  }
  const folder = await ctx.db.notes.get(folderId);
  if (!folder || folder.deletedAt || folder.type !== 'folder') {
    return JSON.stringify(
      refuse('TEAM_DOCS_NOT_READY', 'Thư mục tài liệu của bạn chưa sẵn sàng.')
    );
  }

  if (action === 'list') {
    const rows = await getNotesByFolder(folderId, ctx.db);
    return JSON.stringify(
      rows
        // WR-03/IN-04: an agent lists the notes it may write — never a folder or a diagram.
        .filter((note) => isWritableDoc(note))
        .map((note) => ({
          noteId: note.id,
          // T-41-12: a title was written by a model in an earlier turn — it is data.
          title: wrapField('TIÊU ĐỀ TÀI LIỆU', note.title ?? ''),
          type: note.type,
          updatedAt: note.updatedAt,
        }))
    );
  }

  if (action === 'create') {
    const title = typeof args.title === 'string' ? args.title.trim() : '';
    const body = typeof args.body === 'string' ? args.body : '';
    if (!title) {
      return JSON.stringify(refuse('INVALID_ARGUMENT', 'Thiếu tiêu đề tài liệu.'));
    }
    // WR-02: `NoteInputSchema` would throw on an over-long field, and a throw is not the
    // team-tool convention — validate here so the model gets a code it can self-correct on.
    // The prefix is part of the stored title, so it counts against the cap.
    const prefix = ctx.agentName ? `${ctx.agentName} — ` : '';
    // UAT-41: `list` returns the STORED title, which already carries the prefix. An agent that
    // re-creates from a listed title used to store "Alex — Alex — …". Strip every leading copy
    // so `create` is idempotent on the prefix, however many times the model pasted it.
    let bare = title;
    while (prefix && bare.startsWith(prefix)) bare = bare.slice(prefix.length);
    if (prefix.length + bare.length > MAX_DOC_TITLE_LENGTH) {
      return JSON.stringify(
        refuse(
          'INVALID_ARGUMENT',
          `Tiêu đề quá dài (tối đa ${MAX_DOC_TITLE_LENGTH - prefix.length} ký tự).`
        )
      );
    }
    if (body.length > MAX_DOC_BODY_LENGTH) {
      return JSON.stringify(
        refuse('INVALID_ARGUMENT', `Nội dung quá dài (tối đa ${MAX_DOC_BODY_LENGTH} ký tự).`)
      );
    }
    const note = await createNote(
      {
        type: 'document',
        parentId: folderId,
        // D-02b: the prefix is added by the tool, never by the prompt, so the model cannot
        // forget it. No `agentName` means the bare title — never a leading "— ".
        title: `${prefix}${bare}`,
        body,
      },
      ctx.db
    );
    return JSON.stringify({ noteId: note.id, title: note.title ?? '' });
  }

  if (action === 'update') {
    const noteId = typeof args.noteId === 'string' ? args.noteId : '';
    if (!noteId) {
      return JSON.stringify(refuse('INVALID_ARGUMENT', 'Thiếu id tài liệu cần sửa.'));
    }
    const existing = await ctx.db.notes.get(noteId);
    // T-41-11: the comparison is against the context id, never an arg. No leader exception —
    // the leader uses the DB tool (D-04/D-06).
    // WR-03: a folder the owner created inside this folder also has `parentId === folderId`, and
    // a diagram's body is its source — only a writable document type may be updated.
    if (
      !existing ||
      existing.deletedAt ||
      existing.parentId !== folderId ||
      !isWritableDoc(existing)
    ) {
      return JSON.stringify(
        refuse('DOC_NOT_IN_YOUR_FOLDER', 'Tài liệu này không nằm trong thư mục của bạn.')
      );
    }
    const title = typeof args.title === 'string' ? args.title.trim() : '';
    // CR-01: an omitted `body` means "leave the content alone", never "erase it". Defaulting to
    // '' here made a rename-only call wipe the document the member wrote last turn.
    const body = typeof args.body === 'string' ? args.body : undefined;
    if (title === '' && body === undefined) {
      return JSON.stringify(
        refuse('INVALID_ARGUMENT', 'Cần tiêu đề hoặc nội dung mới để sửa tài liệu.')
      );
    }
    if (title.length > MAX_DOC_TITLE_LENGTH) {
      return JSON.stringify(
        refuse('INVALID_ARGUMENT', `Tiêu đề quá dài (tối đa ${MAX_DOC_TITLE_LENGTH} ký tự).`)
      );
    }
    if (body !== undefined && body.length > MAX_DOC_BODY_LENGTH) {
      return JSON.stringify(
        refuse('INVALID_ARGUMENT', `Nội dung quá dài (tối đa ${MAX_DOC_BODY_LENGTH} ký tự).`)
      );
    }
    // D-02b: `update` does NOT re-apply the agent-name prefix.
    const updated = await updateNote(
      noteId,
      { ...(title ? { title } : {}), ...(body !== undefined ? { body } : {}) },
      ctx.db
    );
    // IN-01: `updateNote` returns null when the row vanished between the get and the put.
    // Reporting `title: ''` would read as success while nothing was written.
    if (!updated) {
      return JSON.stringify(
        refuse('DOC_NOT_IN_YOUR_FOLDER', 'Tài liệu này không còn tồn tại trong thư mục của bạn.')
      );
    }
    return JSON.stringify({ noteId, title: updated.title ?? '' });
  }

  return JSON.stringify(
    refuse('INVALID_ARGUMENT', 'action phải là list, create hoặc update.')
  );
}

type GitRepoResolution =
  | { system: System; config: SshConfig; repoPath: string; secret: string | undefined }
  | TeamToolRefusal;

/**
 * Phase 42 D-07: the repository comes from the team's linked systems, never from an arg.
 * `args.systemId` is only an INDEX into the linked set, so it can never name a repo outside
 * the team. Codes are truthful: a linked system that merely lacks repo configuration is
 * `NO_LINKED_REPO`, not `SYSTEM_NOT_LINKED`.
 */
async function resolveGitRepo(
  args: Record<string, any>,
  ctx: TeamToolContext
): Promise<GitRepoResolution> {
  const links = await listTeamLinks(ctx.teamId, ctx.db);
  const linkedSystems: System[] = [];
  for (const link of links) {
    if (link.itemType !== 'system') continue;
    const row = await ctx.db.systems.get(link.itemId);
    if (row) linkedSystems.push(row);
  }
  const usable = linkedSystems.filter(
    (s) =>
      typeof s.sshConfigId === 'string' &&
      s.sshConfigId !== '' &&
      typeof s.remoteRepoPath === 'string' &&
      s.remoteRepoPath !== ''
  );

  const requested = typeof args.systemId === 'string' ? args.systemId.trim() : '';
  let system: System;
  if (requested) {
    const linked = linkedSystems.find((s) => s.id === requested);
    if (!linked) {
      // WR-04: `requested` is model-supplied and a refusal is a `role: 'tool'` result, so it
      // is wrapped like every other untrusted string on this path.
      return refuse(
        'SYSTEM_NOT_LINKED',
        `Hệ thống ${wrapUntrusted('SYSTEM ID YÊU CẦU', requested)} không được liên kết với nhóm này.`
      );
    }
    const match = usable.find((s) => s.id === requested);
    if (!match) {
      return refuse(
        'NO_LINKED_REPO',
        `Hệ thống ${wrapUntrusted('TÊN HỆ THỐNG', linked.name)} chưa cấu hình SSH profile hoặc đường dẫn repo.`
      );
    }
    system = match;
  } else if (usable.length === 0) {
    return refuse('NO_LINKED_REPO', 'Nhóm chưa liên kết hệ thống nào có repo để đọc.');
  } else if (usable.length > 1) {
    // WR-04: names are user-authored free text; ids alone would not tell the model which to
    // pick, so both are listed and the names are wrapped.
    const list = usable
      .map((s) => `${s.id} (${wrapUntrusted('TÊN HỆ THỐNG', s.name)})`)
      .join(', ');
    return refuse(
      'INVALID_ARGUMENT',
      `Nhóm liên kết nhiều hệ thống có repo — hãy truyền systemId. Các lựa chọn: ${list}.`
    );
  } else {
    system = usable[0]!;
  }

  const config = await getSshConfigById(system.sshConfigId!, ctx.db);
  if (!config) {
    return refuse(
      'NO_LINKED_REPO',
      `Hệ thống ${wrapUntrusted('TÊN HỆ THỐNG', system.name)} trỏ tới một SSH profile không còn tồn tại.`
    );
  }
  const secret = (await getSshSecret(config.id)) ?? undefined;
  return { system, config, repoPath: system.remoteRepoPath!, secret };
}

function wrapCommits(commits: RemoteGitCommit[], label: (field: string) => string) {
  return commits.map((c) => ({
    sha: c.sha,
    shortSha: c.shortSha,
    author: wrapField(label('TÁC GIẢ'), c.author),
    date: c.date,
    message: wrapUntrusted(label('THÔNG ĐIỆP COMMIT'), c.message),
  }));
}

/** Phase 42 D-11: one label format for every git-shaped tool result. */
function gitLabelFor(action: string, repoPath: string, field: string): string {
  return `GIT ${action} ${repoPath} — ${field}`;
}

/**
 * CR-01: a revision-shaped value is only ever a revision. `escapeShellArg` protects the shell,
 * but git parses any argv element beginning with `-` as an option, and `git log`/`show`/`diff`
 * accept `--output=<file>` — an arbitrary remote file write. Refuse rather than strip: a
 * silently-mangled value would read as a different branch than the model asked for.
 */
function revisionArg(value: unknown): string | undefined {
  const v = typeof value === 'string' ? value.trim() : '';
  return v && !v.startsWith('-') ? v : undefined;
}

/**
 * Phase 42 D-06/D-08/D-11: read-only remote git inspection. The handler never builds a
 * command string — every value goes to a `gitRemoteService`/`gitRemoteTreeService` function
 * that escapes it per argument. A git or SSH throw becomes a refusal, never a throw.
 */
async function gitRead(args: Record<string, any>, ctx: TeamToolContext): Promise<string> {
  const action = typeof args.action === 'string' ? args.action : '';
  // WR-05: repo resolution is inside the try. `listTeamLinks`, `db.systems.get`,
  // `getSshConfigById` and `getSshSecret` all await Dexie, and a closed/quota-failed DB used
  // to reject out of `executeTeamTool`, breaking the "a refusal is a returned value, never a
  // thrown error" contract that the coordinator's dispatch relies on.
  let repoPath = '';
  // D-11: every wrap label carries BOTH the action and the repo path.
  const gitLabel = (field: string) => gitLabelFor(action, repoPath, field);
  try {
    const resolved = await resolveGitRepo(args, ctx);
    if ('refused' in resolved) return JSON.stringify(resolved);
    const { system, config, secret } = resolved;
    repoPath = resolved.repoPath;

    // IN-05 is Info-tier and out of this fix pass: `repoPath` stays unwrapped here.
    const base = { action, systemId: system.id, repoPath };

    switch (action) {
      case 'branches': {
        const branches = await getRemoteBranches(config, repoPath, secret);
        return JSON.stringify({
          ...base,
          branches: branches.map((b) => ({
            name: wrapField(gitLabel('TÊN NHÁNH'), b.name),
            isRemote: b.isRemote,
            isHead: b.isHead,
          })),
        });
      }
      case 'status': {
        const status = await checkDirtyStatus(config, repoPath, secret);
        return JSON.stringify({
          ...base,
          isClean: status.isClean,
          uncommittedFiles: status.uncommittedFiles.map((f) => ({
            path: wrapField(gitLabel('ĐƯỜNG DẪN'), f.path),
            indexStatus: f.indexStatus,
            workingTreeStatus: f.workingTreeStatus,
          })),
        });
      }
      case 'log': {
        // WR-06: `Math.floor` so `limit: 2.7` becomes 2 instead of reaching `git log -n 2.7`.
        const limit = Math.min(Math.max(1, Math.floor(Number(args.limit)) || 20), 50);
        // IN-01: `??` only falls back on null/undefined, so `branch: ''` used to refuse instead
        // of using the system default. Fall back only when nothing was supplied; a value that
        // was supplied but rejected (leading `-`, non-string) still refuses.
        const supplied = args.branch;
        const branch =
          supplied === undefined || supplied === null || supplied === ''
            ? (revisionArg(system.defaultBaseBranch) ?? 'HEAD')
            : revisionArg(supplied);
        if (!branch) {
          return JSON.stringify(
            refuse('INVALID_ARGUMENT', 'log: branch phải là tên nhánh, không bắt đầu bằng "-".')
          );
        }
        const commits = await getRecentCommits(config, repoPath, branch, limit, secret);
        return JSON.stringify({
          ...base,
          branch,
          limit,
          commits: wrapCommits(commits, gitLabel),
        });
      }
      case 'diff_summary': {
        const baseBranch = revisionArg(args.base);
        const targetBranch = revisionArg(args.target);
        if (!baseBranch || !targetBranch) {
          return JSON.stringify(
            refuse(
              'INVALID_ARGUMENT',
              'diff_summary cần cả base và target, và không được bắt đầu bằng "-".'
            )
          );
        }
        const summary = await getDiffSummary(config, repoPath, baseBranch, targetBranch, secret);
        return JSON.stringify({
          ...base,
          baseBranch: summary.baseBranch,
          targetBranch: summary.targetBranch,
          headSha: summary.headSha,
          totalAdditions: summary.totalAdditions,
          totalDeletions: summary.totalDeletions,
          commits: wrapCommits(summary.commits, gitLabel),
          files: summary.files.map((f) => ({
            path: wrapField(gitLabel('ĐƯỜNG DẪN'), f.path),
            status: f.status,
            additions: f.additions,
            deletions: f.deletions,
          })),
        });
      }
      case 'diff_file': {
        const baseBranch = revisionArg(args.base);
        const targetBranch = revisionArg(args.target);
        const filePath = typeof args.filePath === 'string' ? args.filePath : '';
        if (!baseBranch || !targetBranch || !filePath) {
          return JSON.stringify(
            refuse(
              'INVALID_ARGUMENT',
              'diff_file cần base, target và filePath; base/target không được bắt đầu bằng "-".'
            )
          );
        }
        const text = await getFileDiff(
          config,
          repoPath,
          baseBranch,
          targetBranch,
          filePath,
          secret
        );
        return JSON.stringify({
          ...base,
          base: baseBranch,
          target: targetBranch,
          filePath: wrapField(gitLabel('ĐƯỜNG DẪN'), filePath),
          diff: wrapUntrusted(gitLabel('DIFF'), text),
        });
      }
      case 'read_file': {
        const branch = revisionArg(args.branch);
        const filePath = typeof args.filePath === 'string' ? args.filePath : '';
        if (!branch || !filePath) {
          return JSON.stringify(
            refuse(
              'INVALID_ARGUMENT',
              'read_file cần branch và filePath; branch không được bắt đầu bằng "-".'
            )
          );
        }
        const offset = Math.max(1, Math.floor(Number(args.offset)) || 1);
        const limit = Math.min(Math.max(1, Math.floor(Number(args.limit)) || 200), 2000);
        const page = await readRemoteFilePage(
          config,
          repoPath,
          branch,
          filePath,
          offset,
          limit,
          secret
        );
        return JSON.stringify({
          ...base,
          branch,
          filePath: wrapField(gitLabel('ĐƯỜNG DẪN'), filePath),
          offset: page.offset,
          limit: page.limit,
          linesRead: page.linesRead,
          totalLines: page.totalLines,
          hasMore: page.hasMore,
          isBinary: page.isBinary,
          content: page.isBinary
            ? ''
            : wrapUntrusted(gitLabel('NỘI DUNG FILE'), page.lines.join('\n')),
          ...(page.hasMore ? { nextOffset: page.offset + page.linesRead } : {}),
        });
      }
      case 'tree': {
        const branch = revisionArg(args.branch);
        if (!branch) {
          return JSON.stringify(
            refuse('INVALID_ARGUMENT', 'tree cần branch, và branch không được bắt đầu bằng "-".')
          );
        }
        // IN-02 is Info-tier and out of this fix pass: `dirPath` is passed through untrimmed.
        const dirPath = typeof args.dirPath === 'string' ? args.dirPath : undefined;
        const nodes = await getRemoteTree(config, repoPath, branch, dirPath, secret);
        return JSON.stringify({
          ...base,
          branch,
          dirPath: dirPath ?? '',
          nodes: nodes.map((n) => ({
            key: wrapField(gitLabel('ĐƯỜNG DẪN'), n.key),
            title: wrapField(gitLabel('TÊN MỤC'), n.title),
            isLeaf: n.isLeaf,
            ...(n.size !== undefined ? { size: n.size } : {}),
            sha: n.sha,
          })),
        });
      }
      case 'grep': {
        const pattern = typeof args.pattern === 'string' ? args.pattern : '';
        if (!pattern) {
          return JSON.stringify(
            refuse('INVALID_ARGUMENT', 'grep cần pattern — chuỗi hoặc biểu thức cần tìm.')
          );
        }
        // IN-01 precedent: only an absent/empty branch falls back; a supplied-but-rejected one
        // (leading `-`, non-string) still refuses rather than silently reading another ref.
        const supplied = args.branch;
        const ref =
          supplied === undefined || supplied === null || supplied === ''
            ? (revisionArg(system.defaultBaseBranch) ?? 'HEAD')
            : revisionArg(supplied);
        if (!ref) {
          return JSON.stringify(
            refuse('INVALID_ARGUMENT', 'grep: branch phải là tên nhánh, không bắt đầu bằng "-".')
          );
        }
        const path = typeof args.path === 'string' && args.path.trim() ? args.path.trim() : undefined;
        // Same confinement as `tree`: a path outside the repo is the model's argument mistake,
        // and letting git say so would report it as GIT_READ_FAILED (infrastructure).
        const cleanPath = path ? confineRepoPath(path, 'Đường dẫn') : undefined;
        const result = await grepRemoteRef(
          config,
          repoPath,
          ref,
          {
            pattern,
            ...(cleanPath ? { path: cleanPath } : {}),
            caseSensitive: args.caseSensitive !== false,
            literal: args.literal === true,
            limit: args.limit,
          },
          secret
        );
        // Zero hits is a successful empty result, never a refusal: `git grep` exit 1 is normal.
        return JSON.stringify({
          ...base,
          ref,
          pattern: wrapUntrusted(gitLabel('MẪU TÌM'), pattern),
          path: cleanPath ? wrapField(gitLabel('ĐƯỜNG DẪN'), cleanPath) : '',
          hits: result.hits.map((h) => ({
            path: wrapField(gitLabel('ĐƯỜNG DẪN'), h.path),
            line: h.line,
            text: wrapUntrusted(gitLabel('DÒNG KHỚP'), h.text),
          })),
          truncated: result.truncated,
        });
      }
      default:
        return JSON.stringify(
          refuse(
            'INVALID_ARGUMENT',
            'action phải là branches, status, log, diff_summary, diff_file, read_file, tree hoặc grep.'
          )
        );
    }
  } catch (err: any) {
    // INVALID_ARGUMENT includes paths this tool will not read (traversal or symlink policy)
    // and a malformed grep pattern, not only malformed input. GIT_READ_FAILED would
    // incorrectly blame infrastructure.
    if (err instanceof PathOutsideRepoError || err instanceof InvalidGrepPatternError) {
      const label = err instanceof InvalidGrepPatternError ? 'MẪU TÌM' : 'ĐƯỜNG DẪN';
      return JSON.stringify(refuse('INVALID_ARGUMENT', wrapUntrusted(gitLabel(label), err.message)));
    }
    // CR-03: git/SSH stderr is remote-controlled text (paths, refs, `.gitattributes`-driven
    // messages) and this is a `role: 'tool'` result, so it is wrapped like every other
    // retrieved body (AIO-READ-05). The code is GIT_READ_FAILED, not INVALID_ARGUMENT: an SSH
    // timeout is not the model's argument mistake.
    return JSON.stringify(
      refuse('GIT_READ_FAILED', wrapUntrusted(gitLabel('LỖI GIT'), err?.message || String(err)))
    );
  }
}

/**
 * Phase 43 D-03: the second read tier. A model on the remote host reads the repo with its own
 * context window and returns a capped report, so a broad question costs one nested call instead
 * of many `read_file` results in the caller's context.
 *
 * A refusal is a returned value, never a throw — same contract as `gitRead`.
 */
async function exploreRepo(args: Record<string, any>, ctx: TeamToolContext): Promise<string> {
  const question = typeof args.question === 'string' ? args.question.trim() : '';
  if (!question) {
    return JSON.stringify(
      refuse('INVALID_ARGUMENT', 'explore_repo cần question — câu hỏi cần trả lời.')
    );
  }

  let repoPath = '';
  try {
    const resolved = await resolveGitRepo(args, ctx);
    if ('refused' in resolved) return JSON.stringify(resolved);
    const { system, config, secret } = resolved;
    repoPath = resolved.repoPath;

    if (!(await probeRemoteClaude(config, secret))) {
      return JSON.stringify(
        refuse(
          'REMOTE_CLAUDE_UNAVAILABLE',
          'Máy chủ remote chưa cài Claude Code CLI (không tìm thấy lệnh "claude"). Dùng git_read để đọc trực tiếp.'
        )
      );
    }

    // A model id is echoed into a command, so an unrecognised value falls back to the default
    // rather than being passed through. A leading `-` is refused too: `MODEL_ID_REGEX` allows
    // one, and `--model --output-format` is an option-shaped value, not a model.
    const suppliedModel = typeof args.model === 'string' ? args.model.trim() : '';
    const model =
      suppliedModel && !suppliedModel.startsWith('-') && MODEL_ID_REGEX.test(suppliedModel)
        ? suppliedModel
        : 'haiku';
    const maxTurns = clampExploreMaxTurns(args.maxTurns);

    const result = await runRemoteExplore(config, secret, {
      repoPath,
      question,
      model,
      maxTurns,
    }, ctx.signal ? { signal: ctx.signal } : {});

    return JSON.stringify({
      action: 'explore_repo',
      systemId: system.id,
      repoPath,
      model,
      outcome: result.outcome,
      truncated: result.truncated,
      report: wrapUntrusted(gitLabelFor('explore_repo', repoPath, 'BÁO CÁO'), result.report),
      ...(result.detail
        ? { detail: wrapUntrusted(gitLabelFor('explore_repo', repoPath, 'CHI TIẾT'), result.detail) }
        : {}),
    });
  } catch (err: any) {
    return JSON.stringify(
      refuse(
        'GIT_READ_FAILED',
        wrapUntrusted(
          gitLabelFor('explore_repo', repoPath, 'LỖI REMOTE'),
          err?.message || String(err)
        )
      )
    );
  }
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
    case 'write_doc':
      return writeDoc(input, ctx);
    case 'git_read':
      return gitRead(input, ctx);
    case 'explore_repo':
      return exploreRepo(input, ctx);
    default:
      return JSON.stringify({ error: `Unknown team tool: ${name}` });
  }
}
