# Phase 42: Recursive linked-item read + read-only git inspection — Context

**Gathered:** 2026-11-15
**Status:** Ready for planning
**Owner decision:** Owner said: "nếu tao gắn 1 CR vào nhóm, trong CR đó có docs thì agent phải đọc được, không cần tao gắn tường minh docs vào nhóm nữa." And: "reviewer chỉ cần read là đủ, read tất cả các thứ có thể của git repo đó." This document records those two decisions as binding. Where a prior decision conflicts, this one wins.

## Phase Boundary

Hai việc, cùng một mục tiêu: agent đọc được nhiều hơn mà owner không phải gắn thêm liên kết.

1. **Recursive read.** Gắn **một** item vào nhóm là đủ. Agent đọc được item đó, note dán trên nó, tài liệu đính kèm, và file local mà item trỏ tới — không cần owner gắn từng tài liệu.
2. **Git read.** Reviewer đọc được trạng thái git của repo remote qua SSH: branch, status, diff (summary + từng file), log, nội dung file. **Chỉ đọc.** Không lệnh ghi, không shell tuỳ ý, không redirect output.

Phase này gồm:

- Mở rộng `get_linked_context` để đọc đệ quy có giới hạn.
- Đọc attachment text (bỏ qua binary), đọc `documentLinks` local trong Tauri.
- Team tool mới `git_read` (read-only), dùng lại `gitRemoteService`/`gitRemoteTreeService`/`sshFsToolService` đã có.
- Prompt Reviewer nêu cách dùng `git_read`.
- Test cho wrap untrusted và cho cycle.

Phase này **không** gồm:

- Ghi bất kỳ thứ gì lên repo remote.
- Chạy `git` local trên máy owner (chỉ remote SSH + `read_file` local đã có).
- Thêm bảng Dexie, thêm cột backup.
- Skill body (Deferred của Phase 41 vẫn giữ).
- `ssh_exec_command` cho AI — **tuyệt đối không**.

## Implementation Decisions

### Recursive read

- **D-01:** Đệ quy **một cấp cố định**, không phải đệ quy sâu vô hạn. Từ một link:
  - CR / task / system → `get_item_details` (đã có) → `stickyNotes` (note gắn `entityType`/`entityId`) → **mỗi note: full body**.
  - Note / document → full body + **attachment text** + **`documentLinks` local file**.
  - Không đi tiếp từ note sang note khác. Lý do: note → note là chỗ sinh vòng lặp, và owner không yêu cầu. Nếu sau này cần, đây là chỗ mở.
  — **Reversibility:** reversible — thêm một vòng lặp có cap.

- **D-02:** Giới hạn phải **nêu rõ trong kết quả trả về**, không im lặng cắt:
  - Tối đa **20** note/tài liệu phụ mỗi lần gọi.
  - Mỗi body tối đa **2000 dòng**; vượt → cắt và ghi `truncated: true` + tổng số dòng.
  - Tổng payload tối đa **200 000 ký tự**; chạm trần → dừng thêm và ghi `moreAvailable: true`.
  Lý do: agent phải biết mình đang thiếu gì. Cắt im lặng làm nó khẳng định sai.

- **D-03:** Attachment: chỉ đọc khi `mimeType` là text-ish (`text/*`, `application/json`, `application/xml`, `application/yaml`, `text/markdown`). Binary → ghi `{ fileName, mimeType, sizeBytes, skipped: 'binary' }`. Không base64 vào prompt. `NoteAttachment.data` là `Blob` — đọc bằng `.text()`, cap theo D-02.
  Nếu attachment có `filePath` (local disk) → đọc file đó qua đường `read_file` sẵn có (Tauri).

- **D-04:** `documentLinks` local: chỉ đọc khi Tauri. Mỗi link: nếu là đường dẫn local và file tồn tại → đọc slice (cap D-02). Nếu không đọc được → `{ link, skipped: 'unreadable' }`, **không** trả body rỗng im lặng. Link là URL → bỏ qua, ghi `skipped: 'remote-url'`.
  Đường dẫn phải qua `normalizeLocalPath` + `isLocalPath` (`utils/documentLinks.tsx`) — không tự parse.

- **D-05:** Mọi nội dung đọc thêm đều wrap bằng `wrapUntrusted` với nhãn riêng từng mục (giữ nguyên quy ước hiện có: `wrapField` cho field, `wrapUntrusted` cho body). Test bắt buộc khẳng định nhãn xuất hiện.

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
- `.planning/ROADMAP.md` §Phase 42 — goal + 5 success criteria.
- `.planning/REQUIREMENTS.md` — `AIO-READ-01..05`.
- `.planning/phases/41-.../41-CONTEXT.md` — D-01 (team tool là cửa ghi/đọc mở rộng, không đụng runtime policy), D-05 (`TeamToolContext` mở rộng).
- `CLAUDE.md` — Tauri runtime; không thêm dependency.

### Source contracts — đọc trước khi sửa
- `src/services/ai/office/teamTools.ts` — `getLinkedContext` (:428) là chỗ mở rộng chính; `TeamToolContext` (:21); `TeamToolRefusalCode` (:41); `executeTeamTool` switch (:708).
- `src/services/ai/aiTools.ts` — `get_item_details` (:2438) trả `stickyNotes`; `read_file` (:3386); `ssh_read_file` (:2018).
- `src/services/gitRemoteService.ts` — `runGitCommand` (:20), `escapeShellArg` (:16), `getRemoteBranches` (:34), `checkDirtyStatus` (:68), `getCommitLog` (:100), `getDiffSummary` (:145), `getFileDiff` (:240).
- `src/services/gitRemoteTreeService.ts` — `getRemoteTree` (:124), `getRemoteFileContent` (:156).
- `src/services/ai/sshFsToolService.ts` — `resolveSshConfig` (:62), `resolveRemotePath` (:89), `executeSshReadFile` (:179).
- `src/utils/documentLinks.tsx` — `isLocalPath`, `normalizeLocalPath`.
- `src/services/ai/untrustedData.ts` — `wrapUntrusted`, `wrapField`.
- `src/services/ai/office/teamPrompts.ts` — `buildEmployeeTurnRequest` (:52).
- `src/types/models.ts` — `Note` (:192), `NoteAttachment` (:208), `System` (:46), `ChangeRequest` (:69).
- `src/types/gitRemote.ts` — `RemoteDiffSummary`, `RemoteGitTreeNode`, `RemoteGitBranch`.

### Đã có, không viết lại
- `RemoteGitExplorer.tsx` — nơi duy nhất hiện dùng các hàm git remote; đọc để biết cách gọi đúng.
- `getSshSecret` (`services/sshService.ts`) — lấy secret theo `sshConfigId`.

## Existing Code Insights

### Reusable Assets
- `get_item_details` đã trả `stickyNotes` + `documentLinks` + `checklist` — chỉ cần đọc thêm phần nó trả về.
- `read_file` (Tauri) đã có offset/limit — dùng lại cho D-04.
- `gitRemoteService` + `gitRemoteTreeService` đã có đủ 7 hành động của D-06, chỉ thiếu lớp tool.
- `escapeShellArg` đã là chuẩn POSIX duy nhất trong repo.

### Established Patterns
- Refusal là giá trị trả về, không throw.
- Tool result là data → wrap ở boundary.
- Id/repo luôn từ context, không từ args.
- Mọi tham số shell đều escape riêng lẻ.

### Integration Points
- `getLinkedContext` — mở rộng tại đây, giữ nguyên nhánh note/document hiện có.
- `TEAM_TOOL_DEFINITIONS` + `executeTeamTool` switch — thêm `git_read`.
- `buildEmployeeTurnRequest` — thêm dòng prompt cho reviewer.

### Dead code — không chạm
- `AiOfficeView.tsx`.
- `start_ghost_dev_session` / `agent_diff_ops` — đường headless, không dùng cho phase này.

## Specific Ideas

- Test bắt buộc: (1) gắn CR có 3 note → `get_linked_context` trả cả 3 body; (2) note có 30 attachment → cap 20 + `moreAvailable`; (3) binary attachment → `skipped: 'binary'`, không có body; (4) cycle note→note không treo (dù D-01 không đi tiếp, test chứng minh nó không đi); (5) `git_read` với `filePath` chứa `; rm -rf /` → escape đúng, lệnh không chạy; (6) `git_read` với `systemId` không link → refusal; (7) mọi kết quả có nhãn untrusted.

## Deferred Ideas

- Note → note recursion.
- Cache git result trong lượt.
- Ghi lên repo remote (không làm, không bàn).
- Skill body cho BA/SA/Reviewer — sau Phase 42.
