# Phase 42: Read-only git inspection — Context

**Gathered:** 2026-11-15
**Status:** Ready for planning
**Owner decision:** Owner said: "reviewer chỉ cần read là đủ, read tất cả các thứ có thể của git repo đó." This document records that decision as binding. Where a prior decision conflicts, this one wins.

**Scope narrowed 2026-11-15:** The recursive linked-item read half was removed. Evidence: `get_item_details` already returns sticky notes in full body, and `documentLinks` already arrives as wrapped strings; `read_file` is already in `EMPLOYEE_READ_ONLY_ALLOWLIST`, so reading a linked file costs one extra tool round-trip and needs no new code. The removed decisions are preserved in §Deferred Ideas.

## Phase Boundary

Reviewer đọc được trạng thái git của repo remote qua SSH: branch, status, diff (summary + từng file), log, nội dung file. **Chỉ đọc.** Không lệnh ghi, không shell tuỳ ý, không redirect output.

Phase này gồm:

- Team tool mới `git_read` (read-only), dùng lại `gitRemoteService`/`gitRemoteTreeService`/`sshFsToolService` đã có.
- Prompt Reviewer nêu cách dùng `git_read`.
- Test cho escape tham số, guard repo từ context, và wrap untrusted.

Phase này **không** gồm:

- Ghi bất kỳ thứ gì lên repo remote.
- Chạy `git` local trên máy owner (chỉ remote SSH + `read_file` local đã có).
- Thêm bảng Dexie, thêm cột backup.
- Skill body (Deferred của Phase 41 vẫn giữ).
- `ssh_exec_command` cho AI — **tuyệt đối không**.
- Recursive linked-item read (xem §Deferred Ideas).

## Implementation Decisions

### Git read

- **D-06:** Một team tool `git_read` với **enum hành động cố định**, không nhận chuỗi lệnh:
  `action: 'branches' | 'status' | 'log' | 'diff_summary' | 'diff_file' | 'read_file' | 'tree'`.
  Tham số theo action:
  - `branches` → không tham số.
  - `status` → không tham số.
  - `log` → `limit` (1..50, mặc định 20), `branch?`.
  - `diff_summary` → `base`, `target`.
  - `diff_file` → `base`, `target`, `filePath`.
  - `read_file` → `branch`, `filePath`.
  - `tree` → `branch`, `dirPath?`.
  Không có action nào nhận `-c`, `--output`, `--ext-diff`, hay chuỗi shell.

- **D-07:** Repo đích lấy từ **context, không từ args**. Thứ tự resolve:
  1. `System` được link vào nhóm và có `sshConfigId` + `remoteRepoPath` → dùng.
  2. Nếu có đúng một system như vậy → dùng nó.
  3. Nếu có nhiều → tool yêu cầu `systemId` trong args, và **phải** là một trong các system đã link (kiểm bằng code). Không link → refusal `SYSTEM_NOT_LINKED`.
  4. Không có system nào → refusal `NO_LINKED_REPO`.
  Lý do: cùng nguyên tắc cross-team guard. Model không được trỏ vào repo ngoài phạm vi nhóm.

- **D-08:** Mọi lệnh git đi qua `runGitCommand` (`gitRemoteService.ts:20`) với `escapeShellArg` cho **từng** tham số. Không nối chuỗi. `base`/`target`/`filePath`/`branch` đều phải escape. Đây là yêu cầu bảo mật, không phải style.

- **D-09:** `git_read` **không** nằm trong `MUTATION_TOOLS` và **không** park trên approval card — nó chỉ đọc. Nhưng nó **phải** nằm trong `EMPLOYEE_READ_ONLY_ALLOWLIST`-tương đương: thực tế là nó là team tool, nên chỉ cần thêm vào `TEAM_TOOL_DEFINITIONS` và switch. Vì là team tool, `mutationPolicy: 'read-only'` không chặn nó (cùng cơ chế D-01 của Phase 41).

- **D-10:** Không expose `ssh_exec_command` cho AI, không thêm tool shell. Nếu `git_read` thiếu một hành động, thêm action vào enum — không mở shell.

- **D-11:** Kết quả `git_read` wrap untrusted như mọi tool result khác, nhãn gồm repo path + action. Diff là dữ liệu do người khác viết — không bao giờ là instruction.

### Prompt

- **D-12:** `buildEmployeeTurnRequest` thêm một dòng khi `employee.role` chứa "review" (không phân biệt hoa thường) hoặc khi skill description chứa "review": nêu `git_read` và thứ tự đọc (branches → log → diff_summary → diff_file → read_file). Wording thuộc Claude's Discretion. Không thêm field mới vào `AiEmployee`.

### Claude's Discretion

- Tên chính xác của action enum.
- Ngưỡng chính xác trong D-02 (miễn là nêu rõ trong kết quả).
- Có cache kết quả `git_read` trong một lượt hay không — **khuyến nghị: không**, mỗi call là một SSH round-trip, và cache trong lượt làm kết quả cũ đi khi reviewer đọc sau khi owner vừa push.
- Cách phát hiện "reviewer" ở D-12.

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Quyết định và phạm vi
- `.planning/ROADMAP.md` §Phase 42 — goal + 2 success criteria.
- `.planning/REQUIREMENTS.md` — `AIO-READ-04`, `AIO-READ-05`.
- `.planning/phases/41-.../41-CONTEXT.md` — D-01 (team tool là cửa ghi/đọc mở rộng, không đụng runtime policy), D-05 (`TeamToolContext` mở rộng).
- `CLAUDE.md` — Tauri runtime; không thêm dependency.

### Source contracts — đọc trước khi sửa
- `src/services/ai/office/teamTools.ts` — `TeamToolContext` (:21); `TeamToolRefusalCode` (:41); `TEAM_TOOL_DEFINITIONS` (:88); `executeTeamTool` switch (:708); `EMPLOYEE_ONLY_TEAM_TOOLS` (:304).
- `src/services/ai/aiTools.ts` — `ssh_read_file` (:2018).
- `src/services/gitRemoteService.ts` — `runGitCommand` (:20), `escapeShellArg` (:16), `getRemoteBranches` (:34), `checkDirtyStatus` (:68), `getCommitLog` (:100), `getDiffSummary` (:145), `getFileDiff` (:240).
- `src/services/gitRemoteTreeService.ts` — `getRemoteTree` (:124), `getRemoteFileContent` (:156).
- `src/services/ai/sshFsToolService.ts` — `resolveSshConfig` (:62), `resolveRemotePath` (:89), `executeSshReadFile` (:179).
- `src/services/ai/untrustedData.ts` — `wrapUntrusted`, `wrapField`.
- `src/services/ai/office/teamPrompts.ts` — `buildEmployeeTurnRequest` (:52).
- `src/types/models.ts` — `System` (:46).
- `src/types/gitRemote.ts` — `RemoteDiffSummary`, `RemoteGitTreeNode`, `RemoteGitBranch`.

### Đã có, không viết lại
- `RemoteGitExplorer.tsx` — nơi duy nhất hiện dùng các hàm git remote; đọc để biết cách gọi đúng.
- `getSshSecret` (`services/sshService.ts`) — lấy secret theo `sshConfigId`.

## Existing Code Insights

### Reusable Assets
- `gitRemoteService` + `gitRemoteTreeService` đã có đủ 7 hành động của D-06, chỉ thiếu lớp tool.
- `escapeShellArg` đã là chuẩn POSIX duy nhất trong repo.

### Established Patterns
- Refusal là giá trị trả về, không throw.
- Tool result là data → wrap ở boundary.
- Id/repo luôn từ context, không từ args.
- Mọi tham số shell đều escape riêng lẻ.

### Integration Points
- `TEAM_TOOL_DEFINITIONS` + `executeTeamTool` switch — thêm `git_read`.
- `buildEmployeeTurnRequest` — thêm dòng prompt cho reviewer.

### Dead code — không chạm
- `AiOfficeView.tsx`.
- `start_ghost_dev_session` / `agent_diff_ops` — đường headless, không dùng cho phase này.

## Specific Ideas

- Test bắt buộc: (1) `git_read` với `filePath` chứa `; rm -rf /` → escape đúng, lệnh không chạy; (2) `git_read` với `systemId` không link → refusal `SYSTEM_NOT_LINKED`; (3) không có system nào có `remoteRepoPath` → refusal `NO_LINKED_REPO`; (4) mọi kết quả có nhãn untrusted; (5) `git_read` không nằm trong `MUTATION_TOOLS` và không park approval card.

## Deferred Ideas

### Recursive linked-item read — removed from this phase 2026-11-15

Bị cắt sau khi đọc code: phần lớn không tạo capability mới.

- **D-01 (cũ) Đệ quy một cấp từ link:** sticky notes đã về full body qua `get_item_details` (`aiTools.ts:2458-2485`), `getLinkedContext` đã wrap chúng (`teamTools.ts:548-553`). Không có việc mới.
- **D-02 (cũ) Cap + `truncated`/`moreAvailable`:** chỉ có value nếu có nội dung mới để cắt. Không còn.
- **D-03 (cũ) Đọc attachment text:** **dead code**. App chỉ nhận ảnh — `NoteAttachmentsPanel.tsx:29` `ALLOWED_MIME_TYPES = ['image/png','image/jpeg','image/gif','image/webp']`, `noteRepo.ts:393` Zod schema cùng 4 type, `aiTools.ts:1278` enum cùng 4 type. Nhánh "text-ish" luôn rơi vào `skipped: 'binary'`. Thêm nữa `NoteAttachment.filePath` gần như không được set: UI upload không truyền (`NoteAttachmentsPanel.tsx:107`), `manage_note_attachments` set sai (lưu chuỗi path làm blob, `aiTools.ts:4013`), `restoreBackup.ts:229` set path tổng hợp không tồn tại trên đĩa.
- **D-04 (cũ) Đọc `documentLinks` local:** chỉ tiết kiệm **một round-trip**. `documentLinks` đã về dạng chuỗi wrapped (`teamTools.ts:538-542`), và `read_file` đã nằm trong `EMPLOYEE_READ_ONLY_ALLOWLIST` (`chatTurnTools.ts:39`) nên agent tự mở được file.
- **D-05 (cũ) Wrap untrusted:** vẫn áp dụng, nhưng cho `git_read` — đã thành AIO-READ-05.

Mở lại khi: app nhận attachment text (PDF/DOCX/MD), hoặc `documentLinks` trở nên phổ biến tới mức round-trip thứ hai thành vấn đề thật.

### Khác
- Note → note recursion.
- Cache git result trong lượt.
- Ghi lên repo remote (không làm, không bàn).
- Skill body cho BA/SA/Reviewer — sau Phase 42.
