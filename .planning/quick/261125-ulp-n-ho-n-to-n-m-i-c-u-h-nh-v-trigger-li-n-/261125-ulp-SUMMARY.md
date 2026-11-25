---
phase: quick
plan: 261125-ulp
subsystem: ui
tags: [ghost-dev, ui-hide, source-guard, tdd]
requires: []
provides: [GHD-UI-TRIGGER, GHD-UI-CONFIG, GHD-DATA-PRESERVED, GHD-REGRESSION]
affects: []
tech_stack:
  added: []
  patterns: [source-guard test theo mẫu shellRemoval.test.ts, RED→GREEN]
key_files:
  created:
    - src/workbench/__tests__/ghostDevUiHide.test.ts
  modified:
    - src/components/tasks/TaskDrawer.tsx
    - src/components/tasks/TaskTable.tsx
    - src/views/SettingsView.tsx
    - src/views/ConfigProfilesView.tsx
decisions:
  - Chỉ ẩn bề mặt discovery/render; giữ nguyên state, modal, service, hook, schema, dữ liệu profile/backup và notification runtime.
  - Không đụng Agent Developer, AI team, Coding Zone hay file của session khác.
metrics:
  duration: ~3 phút
  completed: 2026-11-25T15:09:30Z
  tasks: 2/2
  commits: [d71cd62a]
---

# Quick 261125-ulp: Ẩn trigger và cấu hình Ghost Dev khỏi UI — Summary

Ẩn 4 bề mặt UI của Ghost Dev (nút trên task drawer, menu item trên task table, card cấu hình trong Settings và card cấu hình trong Config Profiles) bằng source-guard test RED→GREEN, không xóa code hay data runtime.

## Việc đã làm

### Task 1 — Ẩn trigger Ghost Dev
- RED: `ghostDevUiHide.test.ts` block `Ghost Dev UI triggers hidden` fail đúng chỗ nút `Khởi chạy Ghost Dev` còn tồn tại.
- Xóa nút `aria-label="Khởi chạy Ghost Dev"` khỏi `TaskDrawer.tsx`; giữ nút `Hỏi AI`, state `ghostDevModalOpen` và render `<RunGhostDevModal>`.
- Xóa menu item `key: 'run-ghost-dev'` khỏi `TaskTable.tsx`; giữ `key: 'ai-chat'`, state `ghostDevTask` và modal render.
- GREEN: 3 test block trigger pass.

### Task 2 — Ẩn cấu hình Ghost Dev
- RED riêng block `Ghost Dev config surfaces hidden`: SettingsView còn `GhostDevConfigCard`, ConfigProfilesView còn `profile-ghost-dev-section`.
- `SettingsView.tsx`: bỏ import + render `GhostDevConfigCard`, đổi nhãn tab thành `Trợ lý AI`, bỏ section `Trợ lý & Ghost Dev`. Mọi card AI khác giữ nguyên.
- `ConfigProfilesView.tsx`: xóa trọn JSX Card `data-testid="profile-ghost-dev-section"` (4 input), giữ `profile-ai-team-section` và helper `ghostDevConfig` ở phần draft/export/import byte-nguyên.
- GREEN: cả 6 test pass; `shellRemoval.test.ts` vẫn pass chứng minh `useGhostDevNotifications` trong AppIntelliJ không đổi.

## Verification

- `npx vitest run src/workbench/__tests__/ghostDevUiHide.test.ts src/workbench/__tests__/shellRemoval.test.ts --bail=1` — 2 files / 12 tests pass.
- `npx tsc --noEmit` — clean.
- Full suite không chạy theo quy định dự án.
- `git diff --name-only` lúc commit: đúng 5 file plan; `AIChatDrawer.tsx` và `groundedTurn.ts` là change của session khác, không stage, không commit.

## Deviations from Plan

None — plan executed exactly as written. Commit mang cả 2 task (TDD RED/GREEN nằm chung 1 commit theo yêu cầu constraints của orchestrator: chỉ 1 commit cho đúng 5 file).

## Known Stubs

None. UI bị ẩn có chủ đích; code/data runtime được giữ và pin bởi guard test.

## Threat Flags

Không có bề mặt mới. Đúng mitigate T-ulp-01/T-ulp-02 theo threat model; T-ulp-03 accept (notification runtime giữ nguyên).

## Self-Check: PASSED

- File tồn tại: `src/workbench/__tests__/ghostDevUiHide.test.ts`, 4 file UI đã sửa.
- Commit `d71cd62a` tồn tại trên `pre-v1.6-baseline`, gồm đúng 5 file, không có deletion ngoài ý muốn.
- Không đổi branch/worktree, không dependency/schema mới, không chạm file session khác.
