import type { ChatMessage } from '../../../types/models';
import {
  ASSIGNMENT_HISTORY_CAP,
  type AiEmployee,
  type AiLead,
  type AiSkill,
  type AiTeam,
  type AiTeamAssignment,
} from '../../../types/aiOffice';
import { sanitizeHistoryTurns } from '../contextCompaction';
import { wrapUntrusted } from '../untrustedData';

/**
 * Prompt assembly per agent (D-04, D-05, D-10, D-24, D-29).
 *
 * Pure functions: no Dexie reads and no React. Callers pass the already-loaded rows, so
 * this module stays testable without a database. The coordinator composes the remaining
 * `ChatTurnRequest` fields (`tools`, `analysisMode`, `autoApprove`, `mutationPolicy`,
 * `persistUserMessage`, attribution) — they are deliberately not duplicated here.
 *
 * The untrusted-data delimiter control itself lives in `../untrustedData` (re-exported here
 * for the existing call sites) so the DB tool layer can apply the same boundary without
 * importing this module's Dexie graph.
 */

export { wrapUntrusted } from '../untrustedData';

export interface PromptTurn {
  systemMessages: Array<{ role: 'system'; content: string }>;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  text: string;
}

export interface BatchResult {
  agentName: string;
  content: string;
}

export interface BuildEmployeeTurnRequestInput {
  employee: AiEmployee;
  skill?: AiSkill | undefined;
  team: AiTeam;
  instruction: string;
  originalRequest: string;
  batchResults?: readonly BatchResult[] | undefined;
  /** Newest-first from `listAssignmentHistory`. */
  assignmentHistory: readonly ChatMessage[];
  /** Bounded recent window from `listRecentTurns`. */
  recentTurns: readonly ChatMessage[];
}

export function buildEmployeeTurnRequest(input: BuildEmployeeTurnRequestInput): PromptTurn {
  const { employee, skill, team, instruction, originalRequest, batchResults, assignmentHistory, recentTurns } =
    input;

  const parts = [
    `Bạn là ${employee.name}, ${employee.role} trong nhóm "${team.name}".`,
    employee.persona,
    [
      '[CHÍNH SÁCH CHỈ ĐỌC]',
      'Bạn chỉ được đọc dữ liệu. Mọi thao tác ghi đều bị từ chối tự động, trừ một ngoại lệ duy nhất bên dưới.',
      'Ngoại lệ: công cụ propose_skill_version được phép tạo một đề xuất kỹ năng ở trạng thái chờ duyệt. Đề xuất đó không thay đổi kỹ năng — chỉ người dùng duyệt mới tạo ra phiên bản mới.',
      'Nếu cần thay đổi dữ liệu, hãy nêu rõ trong báo cáo để trưởng nhóm thực hiện.',
      'Bạn có thể nhắn trực tiếp cho trưởng nhóm, nhân viên khác hoặc người dùng bằng công cụ send_message khi cần hỏi lại hoặc trao đổi.',
    ].join('\n'),
  ];

  // D-24 / AIO-SKILL-02: the description enters the prompt, the body never does.
  // D-21: once a model can author the description, it is untrusted data like any other.
  if (skill) {
    parts.push(
      [
        '[KỸ NĂNG]',
        // CR-04: the name is model-authored after approval — data, never a header.
        wrapUntrusted('TÊN KỸ NĂNG', skill.name),
        wrapUntrusted(`MÔ TẢ KỸ NĂNG ${skill.name}`, skill.description),
        'Khi cần quy trình chi tiết, gọi công cụ read_skill để đọc toàn văn.',
      ].join('\n')
    );
  }

  parts.push(wrapUntrusted('YÊU CẦU GỐC', originalRequest));

  if (batchResults && batchResults.length > 0) {
    parts.push(
      wrapUntrusted(
        'KẾT QUẢ CỦA CÁC NHÂN VIÊN KHÁC',
        batchResults.map((r) => `${r.agentName}:\n${r.content}`).join('\n\n')
      )
    );
  }

  parts.push(
    'Công việc cũ hơn không nằm trong ngữ cảnh này có thể tra cứu bằng công cụ search_team_history.'
  );

  const ownRows = assignmentHistory
    .filter(
      (row) =>
        // CR-06: an instruction row's display attribution is the lead's; the assignee
        // is carried on targetAgentId.
        (row.targetAgentId ? row.targetAgentId === employee.id : row.agentId === employee.id) &&
        (row.messageKind === 'instruction' || row.messageKind === 'report')
    )
    .slice(0, ASSIGNMENT_HISTORY_CAP)
    .reverse()
    .map((row) => ({
      ...row,
      role: row.messageKind === 'instruction' ? ('user' as const) : ('assistant' as const),
    }));

  // 37.1 §1.1: the transcript is the team's shared record. Addressing (`to[]`) decides who
  // must act; it never hides what was said from the other members.
  const visibleTurns = recentTurns;

  return {
    systemMessages: [{ role: 'system', content: parts.join('\n\n') }],
    history: [...sanitizeHistoryTurns(ownRows), ...sanitizeHistoryTurns(visibleTurns)],
    text: instruction,
  };
}

export interface LinkedItemIndexEntry {
  itemId: string;
  itemType: string;
  name: string;
}

export interface BuildLeadTurnRequestInput {
  lead: AiLead;
  team: AiTeam;
  /** D-04: name + role + capability only — personas and skill bodies never reach the lead. */
  roster: readonly AiEmployee[];
  linkedItems: readonly LinkedItemIndexEntry[];
  originalRequest: string;
  recentTurns: readonly ChatMessage[];
  /** D-12: the batch's current reports, resolved from the ledger on a re-synthesis pass. */
  batchResults?: readonly BatchResult[] | undefined;
  /** 37.1 D-04: the live assignment list, so the leader can report where every agent is. */
  ledger?: readonly AiTeamAssignment[] | undefined;
}

export function buildLeadTurnRequest(input: BuildLeadTurnRequestInput): PromptTurn {
  const {
    lead,
    team,
    roster,
    linkedItems,
    originalRequest,
    recentTurns,
    batchResults,
    ledger,
  } = input;

  const parts = [
    `Bạn là ${lead.name}, ${lead.role} của nhóm "${team.name}".`,
    lead.persona,
    [
      '[QUY TẮC ĐIỀU HÀNH NHÓM]',
      '1. Mỗi yêu cầu của người dùng chọn ĐÚNG MỘT trong hai đường, không bao giờ cả hai:',
      '   (a) VIỆC — cần tạo ra sản phẩm/dữ liệu → delegate_batch. Không tự làm thay công việc chuyên môn của nhân viên.',
      '   (b) CÂU HỎI — cần biết một thông tin → send_message tới đúng nhân viên, rồi trả lời người dùng bằng kết quả nhận được. Không mở lô việc.',
      '2. TUYỆT ĐỐI KHÔNG vừa delegate_batch vừa send_message cho cùng một yêu cầu: người nhận sẽ nhận hai lần và người dùng thấy hai bản trả lời.',
      '3. Chờ toàn bộ lô trả về rồi mới tổng hợp; không tuyên bố kết quả trước khi có báo cáo từ nhân viên.',
      '4. Không khẳng định suy luận nội bộ của nhân viên; chỉ dùng nội dung họ báo cáo.',
      '5. Chỉ bạn được phép thay đổi dữ liệu; thao tác ghi sẽ dừng ở thẻ phê duyệt của người dùng.',
      "6. Nếu kết quả lô có mục `kind: 'unfinished'`, BẮT BUỘC nêu rõ trong câu tổng hợp những việc chưa hoàn tất và lý do; không được trình bày lô là đã xong.",
      '7. Trước khi sửa việc, đọc [HIỆN TRẠNG LÔ ĐANG CHẠY] và báo cáo trung thực từng nhân viên đang ở đâu.',
      '8. Hỏi lại người dùng khi yêu cầu mơ hồ hoặc thay đổi việc của nhiều nhân viên; yêu cầu rõ và nhỏ thì áp ngay rồi báo lại sau.',
      '9. Khi yêu cầu mâu thuẫn với việc đang chạy, nói rõ trong câu trả lời; nếu nghiêm trọng, hỏi người dùng xác nhận.',
      '10. Tin nhắn người dùng gửi thẳng cho một nhân viên sẽ tới nhân viên đó ngay — bạn không chặn. Bạn vẫn thấy mọi tin trong nhóm: nếu thấy vấn đề, nói rõ cảnh báo trong câu trả lời của bạn.',
      '11. Khi người dùng nhắc tới một nhân viên đã xong việc, nói thẳng là đã xong và đề nghị chạy lại hoặc giao việc mới — không tự chạy lại.',
      '12. Khi cần trao đổi trực tiếp thay vì giao việc (hỏi lại, nhắc nhở, cảnh báo), dùng công cụ send_message thay vì delegate_batch.',
    ].join('\n'),
    [
      '[DANH SÁCH NHÂN VIÊN]',
      ...roster.map((e) => `- ${e.name} — ${e.role}: ${e.capability} (agentId: ${e.id})`),
      'Khi gọi delegate_batch, trường agentId PHẢI là giá trị agentId ở trên — không dùng tên.',
    ].join('\n'),
  ];

  // 37.1 D-04/D-06: the live ledger is how the leader reports honestly and knows which rows
  // it may amend. `task` originated from a model, so it enters as untrusted data.
  if (ledger && ledger.length > 0) {
    parts.push(
      [
        '[HIỆN TRẠNG LÔ ĐANG CHẠY]',
        ...ledger.map(
          (row) =>
            `- assignmentId: ${row.id} · ${row.agentName} · ${row.runStatus}` +
            `${row.runStatus === 'queued' ? ' · có thể huỷ hoặc sửa' : ' · chỉ có thể gửi tin nhắn mới'}` +
            `\n  việc: ${wrapUntrusted('VIỆC ĐANG GIAO', row.task)}`
        ),
        'Chỉ huỷ/sửa được dòng `queued`. Dòng `running` chỉ nhận tin nhắn mới.',
      ].join('\n')
    );
  }

  if (batchResults && batchResults.length > 0) {
    parts.push(
      wrapUntrusted(
        'KẾT QUẢ CỦA LÔ',
        batchResults.map((r) => `${r.agentName}:\n${r.content}`).join('\n\n')
      )
    );
  }

  if (linkedItems.length > 0) {
    parts.push(
      [
        '[MỤC LIÊN KẾT]',
        // WR-05: a note title / task name is user- or model-authored — untrusted, exactly
        // like the same value on the `get_linked_context` path.
        ...linkedItems.map(
          (i) => `- ${i.itemId} (${i.itemType}): ${wrapUntrusted('TÊN MỤC LIÊN KẾT', i.name)}`
        ),
        'Gọi công cụ get_linked_context để đọc toàn văn nội dung của một mục.',
      ].join('\n')
    );
  }

  parts.push(
    [
      '[QUYỀN GHI]',
      'Chỉ bạn được thay đổi dữ liệu. Mỗi thao tác ghi sẽ dừng ở thẻ phê duyệt để người dùng quyết định.',
      'Luôn trả lời bằng tiếng Việt.',
    ].join('\n')
  );

  return {
    systemMessages: [{ role: 'system', content: parts.join('\n\n') }],
    history: sanitizeHistoryTurns(recentTurns),
    text: originalRequest,
  };
}
