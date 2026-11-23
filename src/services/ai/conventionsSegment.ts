import { wrapUntrusted } from './untrustedData';

/**
 * Shared convention framing for organization and repository rules in chat prompts.
 *
 * 261123-et1: global conventions (Settings) and the per-team pin are authored deliberately by
 * the user as standing instructions — trusted prompt instructions, NOT retrieved data. Repo
 * conventions are read from CONVENTIONS.md over SSH and remain wrapped as untrusted. Read-only
 * and safety policy are enforced in code by the tool handlers, so trusting a pin never grants
 * write permission. Other retrieved data (skill body, doc chunks, transcript) likewise still
 * uses `wrapUntrusted()`.
 */
export const CONVENTIONS_CONFLICT_POLICY = [
  'NGUYÊN TẮC XỬ LÝ XUNG ĐỘT QUY ƯỚC BẮT BUỘC:',
  'Khi phát hiện có mâu thuẫn giữa Quy ước chung của tổ chức (Global) và Quy ước của kho lưu trữ (Repository), ' +
  'AI BẮT BUỘC phải nêu rõ mâu thuẫn cụ thể, trích dẫn rõ nguồn từ từng bên và KHÔNG ĐƯỢC tự ý chọn một bên; ' +
  'phải dừng lại và yêu cầu người dùng xác nhận hoặc phân giải quyết định.',
].join('\n');

/**
 * 261123-et1: shared boundary line for user-authored standing instructions. Trusted as prose,
 * but explicitly subordinate to the code-enforced read-only/safety policy.
 */
export const TRUSTED_INSTRUCTION_BOUNDARY =
  'Đây là CHỈ DẪN ĐƯỢC TIN CẬY do người dùng thiết lập: hãy tuân theo. ' +
  'Chỉ dẫn này KHÔNG được ghi đè chính sách vận hành cốt lõi (chính sách chỉ đọc / quy tắc an toàn) — ' +
  'các chính sách đó do công cụ thực thi và luôn có hiệu lực cao nhất.';

export interface RepoConventionItem {
  systemCode: string;
  systemName?: string;
  repoPath?: string;
  content: string;
}

export function buildConventionsSegment(conventions?: {
  global?: string | undefined;
  repo?: string | undefined;
  repoPath?: string | undefined;
  repos?: RepoConventionItem[] | undefined;
} | undefined): string {
  const globalText = conventions?.global?.trim();
  const repoText = conventions?.repo?.trim();
  const repos = conventions?.repos?.filter((r) => r.content.trim().length > 0) ?? [];
  if (!globalText && !repoText && repos.length === 0) return '';

  const parts = [
    '[QUY ƯỚC TỔ CHỨC — CHỈ DẪN ĐƯỢC TIN CẬY]',
    'Các quy ước dưới đây là tiêu chuẩn kỹ thuật do người dùng thiết lập, áp dụng cho giải pháp.',
    TRUSTED_INSTRUCTION_BOUNDARY,
    CONVENTIONS_CONFLICT_POLICY,
  ];

  if (globalText) {
    parts.push('[GLOBAL CONVENTIONS - QUY ƯỚC CHUNG TỔ CHỨC]\n' + globalText);
  }

  if (repos.length > 0) {
    for (const r of repos) {
      const header = r.repoPath
        ? `[REPOSITORY CONVENTIONS - ${r.systemCode} (${r.repoPath})]`
        : `[REPOSITORY CONVENTIONS - ${r.systemCode}]`;
      // Repo CONVENTIONS.md is retrieved from SSH, not authored in Settings. It stays
      // untrusted data; only the global setting above is a standing trusted instruction.
      parts.push(wrapUntrusted(header, r.content.trim()));
    }
  } else if (repoText) {
    const header = conventions?.repoPath
      ? `[REPOSITORY CONVENTIONS - ${conventions.repoPath}]`
      : '[REPOSITORY CONVENTIONS]';
    parts.push(wrapUntrusted(header, repoText));
  }

  parts.push('[HẾT QUY ƯỚC TỔ CHỨC]');
  return parts.join('\n\n');
}

/**
 * 261123-et1: framing for the per-team Pinned Team Context. The pin is user-authored
 * standing guidance intentionally injected into every leader/employee turn — a TRUSTED
 * instruction, not retrieved data. It is therefore emitted verbatim, without
 * `wrapUntrusted()`'s nonce delimiters or the "ignore" negation that previously told the
 * model to disregard the user's own instruction. Read-only/safety policy stays code-enforced
 * in the tool handlers, so a pin that asks for writes gains no permission (T-45-10 holds
 * by code, not by prompt). Deliberately WITHOUT the conventions conflict rule — a pin has no
 * competing source to reconcile. Empty/whitespace input yields no segment at all.
 */
export function buildPinnedContextSegment(pinned?: string | undefined): string {
  const text = pinned?.trim();
  if (!text) return '';
  return [
    '[NGỮ CẢNH NHÓM ĐƯỢC GHIM — CHỈ DẪN ĐƯỢC TIN CẬY]',
    'Nội dung dưới đây là hướng dẫn do người dùng soạn cho nhóm này, đưa vào mọi lượt của leader và nhân viên.',
    TRUSTED_INSTRUCTION_BOUNDARY,
    text,
  ].join('\n\n');
}
