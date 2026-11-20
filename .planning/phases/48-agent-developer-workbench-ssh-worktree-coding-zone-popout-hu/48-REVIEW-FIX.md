---
phase: 48-agent-developer-workbench-ssh-worktree-coding-zone-popout-hu
fixed_at: 2026-11-20T20:58:51Z
review_path: .planning/phases/48-agent-developer-workbench-ssh-worktree-coding-zone-popout-hu/48-REVIEW.md
iteration: 1
findings_in_scope: 11
fixed: 11
skipped: 0
status: all_fixed
---

# Phase 48: Code Review Fix Report

**Fixed at:** 2026-11-20T20:58:51Z
**Source review:** .planning/phases/48-agent-developer-workbench-ssh-worktree-coding-zone-popout-hu/48-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 11 (3 Critical, 6 Warning, 2 Info)
- Fixed: 11
- Skipped: 0

## Fixed Issues

### CR-01: Remote shell command injection via heredoc delimiter break

**Files modified:** `src/services/sshWorktreeService.ts`, `src/services/__tests__/sshWorktreeService.test.ts`, `src/services/ai/office/teamTools.ts`
**Commit:** `dd5f62d5`
**Applied fix:** Patch giờ được base64-encode và đưa qua `base64 -d | git apply` (giống Rust), không còn nội dung untrusted trong heredoc. `confineWorktreePath` và `codeEdit` chặn `\n`/`\r`/`\0`. Test regression xác nhận newline-bearing path bị từ chối trước khi gọi SSH.

### CR-02: `agentDeveloperWorktree` never supplied

**Files modified:** `src/components/ai/office/TeamWorkspace.tsx`, `tests/components/ai/office/TeamWorkspaceWorktreeTarget.test.tsx`
**Commit:** `fc306f13`
**Applied fix:** Coordinator lấy target từ System row được liên kết và persist (`db.systems` qua `listTeamLinks`), resolve trong bootstrap effect (không thêm dependency vào live-query array). Test focused xác nhận `sshConfigId`/`remoteRepoPath` tới coordinator options.

### CR-03: Unconfined Rust worktree commands reachable from renderer

**Files modified:** `src-tauri/src/agent_diff_ops.rs`, `src-tauri/src/lib.rs`
**Commit:** `acebf0c3`
**Applied fix:** Xóa ba lệnh Tauri `ssh_worktree_list_files`, `ssh_worktree_read_file`, `ssh_worktree_apply_patch` cùng helper `apply_patch_remote`/`confine_worktree_path` (không có TS caller) và bỏ registration trong `lib.rs`. Giữ `ssh_worktree_provision` server-side deterministic; mọi verb đọc/ghi đi qua TS-layer confined + `ssh_exec_command`.

### WR-01: Accept dùng forward `git apply` no-op

**Files modified:** `src/services/sshWorktreeService.ts`, `src/services/__tests__/sshWorktreeService.test.ts`
**Commit:** `de79bf58`
**Applied fix:** Accept giờ stage-and-commit (`git apply --recount --cached -` rồi `git commit`, mirror `accept_patch_diff`), revert vẫn `git apply --reverse`. Command vẫn base64-quoted.

### WR-02: Decision keys embed `diffRevision`

**Files modified:** `src/components/agents/CodingZoneDiffPanel.tsx`, `src/components/agents/__tests__/CodingZoneDiffPanel.test.tsx`
**Commit:** `f39259ad`
**Applied fix:** Key quyết định chỉ gồm path + header + content hash; revision chỉ dùng cho stale banner. Test xác nhận quyết định sống qua revision bump.

### WR-03: `closeTab`/`reorderTab` không publish sync

**Files modified:** `src/components/agents/CodingZoneModal.tsx`, `src/components/agents/__tests__/CodingZoneModal.test.tsx`
**Commit:** `30559047`
**Applied fix:** Cả hai callback tính `next` ngoài state updater rồi publish `tabs` (và `activeFile` cho close), đồng bộ local state. Test xác nhận event được phát.

### WR-04: Cross-window double-send

**Files modified:** `src/components/agents/CodingZoneModal.tsx`, `src/components/agents/__tests__/CodingZoneModal.test.tsx`
**Commit:** `ba5044a1`
**Applied fix:** `Set<string>` message-id chặn re-delivery từ dual transport; đánh dấu trước local send. Test mô phỏng hai lần giao cùng id → `runTurn` một lần.

### WR-05: `code_edit` role gate trusts mutable display name

**Files modified:** `src/types/aiOffice.ts`, `src/validation/backupSchemas.ts`, `src/db/schema.ts`, `src/db/index.ts`, `src/db/repositories/aiOfficeRepo.ts`, `src/services/ai/office/teamTools.ts`, `src/services/ai/office/teamRunCoordinator.ts`, `src/components/agents/CodingZoneDiffPanel.tsx`, và các test liên quan
**Commit:** `10ded463`
**Applied fix:** Thêm marker bền vững `agentKind: 'developer'` trên AiEmployee; gán lúc import/create và backfill qua migration V28. Coordinator resolve developer theo marker (fallback tên chỉ khi chưa có row được mark), propagate `codeEditAllowed` vào `TeamToolContext`; `codeEdit` gate theo capability grant thay vì tên. Trigger visibility ưu tiên marker. Test xác nhận import gán đúng marker và spoof bằng tên bị từ chối.

### WR-06: Untrusted descriptor/diff payloads applied without shape validation

**Files modified:** `src/types/codingZone.ts`, `src/components/agents/CodingZoneModal.tsx`, `src/views/CodingZonePopoutView.tsx`, `src/components/agents/__tests__/CodingZoneModal.test.tsx`
**Commit:** `d75a5e80`
**Applied fix:** Thêm guards (`isWorktreeDescriptor`, `isDiffFileGuard`, `isConnectionState`, `isCodingZoneFullState`); modal reject toàn bộ event `full` nếu descriptor/diffFiles/connection sai hình dạng; popout dùng strict guard chung. Test xác nhận descriptor sai bị bỏ, descriptor hợp lệ được áp.

### IN-01: Hardcoded `'Agent Developer'` literal

**Files modified:** `src/components/ai/office/TeamWorkspace.tsx`
**Commit:** `267ab8b9`
**Applied fix:** Dùng `CODE_EDIT_AGENT_NAME` thay cho literal (kèm ưu tiên marker ổn định).

### IN-02: Redundant ternary in `CodingZoneTrigger`

**Files modified:** `src/components/agents/office/CodingZoneTrigger.tsx`, `src/styles/coding-zone.css`
**Commit:** `295074c8`
**Applied fix:** `compact` giờ ra class `cz-btn tiny compact` với CSS riêng.

## Skipped Issues

None.

## Verification

- Scoped gate (lệnh chính xác từ `48-VALIDATION.md` 48-04-01): **8 test files / 68 tests passed** (`npx vitest run ... --bail=1`).
- `npx tsc --noEmit`: **pass**.
- `cargo check --manifest-path src-tauri/Cargo.toml`: **pass**.
- Chrome UAT (48-04-02): `npx playwright test tests/e2e/coding-zone.spec.ts --project=chromium` — **2 passed (5.6s)**.

**Lưu ý human verification:** WR-01 changed accept semantics to stage-and-commit; logic mirrored from canonical Ghost Dev path and asserted at command level. WR-05 migration V28 backfills legacy rows by exact display name once; subsequent gates are id/marker-based.

---

_Fixed: 2026-11-20T20:58:51Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
