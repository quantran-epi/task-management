---
phase: 48-agent-developer-workbench-ssh-worktree-coding-zone-popout-hu
reviewed: 2026-11-20T21:06:37Z
depth: standard
files_reviewed: 16
files_reviewed_list:
  - src/services/sshWorktreeService.ts
  - src/services/__tests__/sshWorktreeService.test.ts
  - src/services/ai/office/teamTools.ts
  - src/services/ai/office/teamRunCoordinator.ts
  - src/components/ai/office/TeamWorkspace.tsx
  - src-tauri/src/agent_diff_ops.rs
  - src-tauri/src/lib.rs
  - src/components/agents/CodingZoneDiffPanel.tsx
  - src/components/agents/CodingZoneModal.tsx
  - src/components/agents/office/CodingZoneTrigger.tsx
  - src/types/aiOffice.ts
  - src/types/codingZone.ts
  - src/db/index.ts
  - src/db/schema.ts
  - src/db/repositories/aiOfficeRepo.ts
  - src/validation/backupSchemas.ts
findings:
  critical: 0
  warning: 0
  info: 0
  total: 0
status: clean
---

# Phase 48: Code Review Report (Re-review)

**Reviewed:** 2026-11-20T21:06:37Z
**Depth:** standard
**Files Reviewed:** 16
**Status:** clean

## Summary

Re-review sau khi 11 finding của bản review trước (CR-01..CR-03, WR-01..WR-06, IN-01..IN-02) đã được sửa qua 11 commit (`dd5f62d5`..`295074c8`). Tôi đọc lại toàn bộ source tại 16 file trong scope, đối chiếu từng finding với mã nguồn hiện tại, traces qua các module liên quan (`gitDiffParser.ts`, `useCodingZoneSync.ts`, `sshFsToolService.ts`, `tool_cancel.rs`, `validateBackup.ts`, `restoreBackup.ts`), và chạy scoped tests.

Kết quả: cả 11 finding đều đã được giải quyết đúng tại nguồn (không phải band-aid ở lớp gọi). Không còn Critical hay Warning tồn dư. Không phát hiện regression high-severity nào do các fix nàyintroduce. Scoped tests đều xanh: `sshWorktreeService` (17), `CodingZoneDiffPanel` + `CodingZoneModal` (24), `teamTools.codeEdit` + `aiOfficeImport` (12), `TeamWorkspaceWorktreeTarget` + `schemaV27Migration` (4).

Xem mục `## Verification of Prior Findings` ở dưới để có bằng chứng cụ thể cho từng finding.

## Narrative Findings (AI reviewer)

Không có finding mới. Tất cả finding cũ đã resolve — chi tiết ở mục verification.

## Verification of Prior Findings

### CR-01 (Critical) — Remote shell injection qua heredoc: RESOLVED

`src/services/sshWorktreeService.ts`:
- `confineWorktreePath` (dòng 98-99) giờ chặn `\n`, `\r`, `\0` — test tại `sshWorktreeService.test.ts:63,130` khẳng định không phát lệnh SSH nào cho path có newline.
- `applyPatch` (dòng 217-232) bỏ hẳn heredoc: patch được mã hoá base64 (`base64EncodeUtf8`, dòng 137-143),Only base64 alphabet nằm trong shell quote, rồi `printf %s <b64> | base64 -d | git apply ...`. Test dòng 109-128 assert không có `PATCH_EOF`, có `base64 -d`, và patch (kể cả path) đi dưới dạng base64.
- `codeEdit` (`teamTools.ts:1892-1895`) chặn `[\r\n\0]` trong `filePath` như defence-in-depth.
- Remote transport (`tool_cancel.rs:288-294`) base64 toàn bộ command nên `$()`/quote không bị tái expand. Đường tấn công injection đã đóng.

### CR-02 (Critical) — `agentDeveloperWorktree` không bao giờ được truyền: RESOLVED

`TeamWorkspace.tsx:329-337` resolve target từ linked System row (`listTeamLinks` → `db.systems.get`) rồi truyền vào coordinator tại dòng 361. Trích dẫn đúng field `itemType`/`itemId` (`AiTeamLink`) và `sshConfigId`/`remoteRepoPath` (`System`). Effect vẫn keyed on `team.id` (dòng 444) nên không gây churn. Test `tests/components/ai/office/TeamWorkspaceWorktreeTarget.test.tsx` (4 tests, xanh) phủ đường production.

### CR-03 (Critical) — Rust worktree commands không confine: RESOLVED

`src-tauri/src/agent_diff_ops.rs:269-274` xoá 3 commands `ssh_worktree_list_files` / `ssh_worktree_read_file` / `ssh_worktree_apply_patch`; `src-tauri/src/lib.rs` gỡ cả 3 khỏi danh sách đăng ký (đã verify qua diff `acebf0c3`). Chỉ còn `ssh_worktree_provision` (deterministic, realpath + exact-path boundary, exit 77/78) và 3 local-file commands cũ (`list_worktree_files`, `read_worktree_file_content`, `revert_hunk_diff`) vốn thuộc Ghost Dev, có caller trong `useGhostDevDiff.ts`, có canonicalize + `starts_with` + `..` check — không phải Phase 48 surface. Primitive arbitrary-write từ renderer đã bị loại bỏ.

### WR-01 (Warning) — Accept dùng forward `git apply` (no-op): RESOLVED

`sshWorktreeService.ts:222-231`: accept giờ là `git apply --recount --cached - && (git commit -m ... || git diff --cached --quiet)` (stage-and-commit), revert vẫn `git apply --reverse`. Test `sshWorktreeService.test.ts:114-116` assert `--cached`, `git commit -m`, và không có `--reverse` ở accept.

### WR-02 (Warning) — Decision keys gắn `diffRevision`: RESOLVED

`CodingZoneDiffPanel.tsx:101-109`: `keyFor` = `${filePath}::${hunk.header}::${hunkContentHash(hunk)}` — bỏ revision; `hunkContentHash` (dòng 32-40) hash theo nội dung dòng. `revision` chỉ dùng cho stale banner (`seenRevision !== revision`, cập nhật sau act tại dòng 127/145/170). Test trong `CodingZoneDiffPanel.test.tsx` (21 dòng thêm ở `f39259ad`) xanh.

### WR-03 (Warning) — `closeTab`/`reorderTab` không publish sync: RESOLVED

`CodingZoneModal.tsx:242-271`: cả hai callback giờ tính `next` ngoài state updater rồi `publish('tabs', next)`; `closeTab` còn `publish('activeFile', nextActiveFile)`. `onState` xử lý cả hai event (dòng 170-177). Test `CodingZoneModal.test.tsx` assert phát cả `tabs` + `activeFile`, xanh.

### WR-04 (Warning) — Cross-window chat send trùng: RESOLVED

`CodingZoneModal.tsx:108-110,191-194,284-288`: `sentMessageIds = useRef<Set<string>>` — đánh dấu id TRƯỚC khi gửi local và trước khi xử lý `intent: 'send'` event; cả hai path đều skip nếu id đã thấy. Dedupe đúng cho dual-transport re-delivery. Test trong `CodingZoneModal.test.tsx` (19 dòng thêm ở `ba5044a1`) xanh.

### WR-05 (Warning) — `code_edit` gate tin `ctx.agentName`: RESOLVED

`teamRunCoordinator.ts:1338-1342` `developerAgentId()` ưu tiên `agentKind === 'developer'` (stable marker), chỉ fallback tên cho roster legacy khi không có row nào mang marker. `codeEditGranted` (dòng 1393) khoá bằng `agentId === developerAgentId()` + presence của target, không phải display name. Marker được gắn lúc tạo/import bởi owner (`aiOfficeRepo.ts:82,508`), backfill cho row legacy qua migration `db/index.ts:676-687` (SCHEMA_V28, `LATEST_SCHEMA_VERSION = 28`), và cho phép trong backup schema (`backupSchemas.ts:622`, strictObject). `codeEdit` (`teamTools.ts:1877`) vẫn giữ `codeEditAllowed && role !== 'lead'`. `hasActiveAgentDeveloperSession` (`CodingZoneDiffPanel.tsx:234-239`) và `developerId` (`TeamWorkspace.tsx:614-616`) cùng ưu tiên marker. IN-01 cũng được gộp ở đây (dùng `CODE_EDIT_AGENT_NAME`). Test `teamTools.codeEdit` + `aiOfficeImport` xanh.

### WR-06 (Warning) — Payload cross-window không validate shape: RESOLVED

`types/codingZone.ts:100-166` thêm guards `isWorktreeDescriptor`, `isConnectionState`, `isDiffHunkGuard`, `isDiffFileGuard`, `isCodingZoneFullState` (strict, reject toàn bộ event nếu field present nhưng sai). `CodingZoneModal.tsx:144-149` và `CodingZonePopoutView.tsx:35-38` dùng các guard này trước khi đưa vào state. Guard khớp đúng shape của `DiffFile`/`DiffHunk`/`DiffLine` (`types/agent.ts`) nên không chặn nhầm diff hợp lệ. Test `CodingZoneModal.test.tsx` (33 dòng thêm ở `d75a5e80`) xanh.

### IN-01 / IN-02 (Info): RESOLVED

- IN-01: `TeamWorkspace.tsx:49,614-615` và `CodingZoneDiffPanel.tsx:6,237` import/dùng `CODE_EDIT_AGENT_NAME` thay cho literal.
- IN-02: `CodingZoneTrigger.tsx:82` → `compact ? 'cz-btn tiny compact' : 'cz-btn tiny'`; CSS `.cz-btn.tiny.compact` tại `coding-zone.css:36`.

## Structural Findings (fallow)

Không có structural findings được cung cấp cho lần review này.

---

_Reviewed: 2026-11-20T21:06:37Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
