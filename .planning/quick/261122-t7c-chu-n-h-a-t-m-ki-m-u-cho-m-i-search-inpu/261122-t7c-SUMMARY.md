---
phase: 261122-t7c
plan: 01
subsystem: search
tags: [vietnamese, search, normalization, antd]
dependency_graph:
  requires: []
  provides: [searchText-fold-helper]
  affects: [task-filter, global-search, command-palette, ai-search, workbench-search, planner-selects]
tech_stack:
  added: []
  patterns: [single search-fold boundary wrapping canonical normalizeVietnamese]
key_files:
  created:
    - src/utils/searchText.ts
    - src/utils/searchText.test.ts
  modified:
    - src/utils/filter.ts
    - tests/utils/filter.test.ts
    - src/views/ChangeRequestsView.tsx
    - src/views/SystemCatalogView.tsx
    - src/views/TelegramMonitorView.tsx
    - src/views/AiOfficeView.tsx
    - src/views/MermaidAssistantView.tsx
    - src/views/PlannerView.tsx
    - src/views/TasksView.tsx
    - src/workbench/search/SearchEverywhereModal.tsx
    - src/components/palette/CommandPaletteModal.tsx
    - src/components/common/ShortcutHUD.tsx
    - src/components/ai/ScopePickerModal.tsx
    - src/components/ai/ChatInputBar.tsx
    - src/components/ai/ChatTabToolbox.tsx
    - src/components/ai/office/LinkedItemPicker.tsx
    - src/components/knowledge/DocumentSetForm.tsx
    - src/components/notes/DocEditorPane.tsx
    - src/components/notes/DocListPane.tsx
    - src/components/notes/NoteEditor.tsx
    - src/components/notes/ZipImportPreviewModal.tsx
    - src/components/settings/AiToolCatalogCard.tsx
    - src/components/settings/NineRouterConfigCard.tsx
    - src/components/systems/SystemModal.tsx
    - src/components/planner/AllocationModal.tsx
    - src/components/planner/ActualWorklogPlanner.tsx
    - src/workbench/DocSetLibrary.tsx
    - src/workbench/toolwindows/CRExplorer.tsx
    - src/workbench/toolwindows/SystemsExplorer.tsx
    - src/workbench/toolwindows/DiagramExplorer.tsx
    - src/workbench/toolwindows/ToolExplorerPanel.tsx
    - src/workbench/toolwindows/AiOfficeExplorer.tsx
    - src/workbench/toolwindows/AiStaffExplorer.tsx
    - src/components/agents/CodingZoneTree.tsx
    - src/components/agents/AgentDiffReviewer.tsx
    - src/components/agents/AgentTerminalLog.tsx
    - src/services/ai/aiTools.ts
    - src/services/gitRemoteTreeService.ts
decisions:
  - "foldForSearch is a thin wrapper over canonical normalizeVietnamese in bm25.ts — no duplicated NFD logic"
  - "searchIncludes uses String.includes on folded text — no RegExp from user query (ReDoS-safe)"
  - "Byte-exact find/*, error-message checks and knowledge-server daemon left unchanged"
metrics:
  duration: ~28m
  completed: 2026-11-22
---

# Phase 261122-t7c Plan 01: Chuẩn hóa fold tiếng Việt cho mọi search input Summary

Một helper dùng chung `src/utils/searchText.ts` dẫn tới canonical `normalizeVietnamese`, áp dụng cho query lẫn dữ liệu tại mọi search input UI/AI đã audit; gõ `u`/`ư`/`ũ` tìm ra cùng bản ghi.

## Accomplishments

- **Task 1**: Tạo `foldForSearch`/`searchIncludes`, regression U/Ũ/Ư/đ cho helper và `filterTasks` (RED xác nhận trước khi migrate filter). Commit `3576e519`.
- **Task 2**: Migrate filter, Search Everywhere, Command Palette, Shortcut HUD và 4 view search. Commit `4fc134df`.
- **Task 3**: Sweep AI/chat, notes, doc sets, workbench explorers, planner selects, agent skill filters, aiTools và remote-tree search. Commit `f3ea17fa`.

## Verification

- `npx tsc --noEmit` — sạch sau Task 2 và Task 3.
- `vitest run src/utils/searchText.test.ts tests/utils/filter.test.ts tests/utils/bm25.test.ts` — 37 tests pass.
- `vitest run` thêm `src/services/__tests__/gitRemoteTreeService.test.ts src/workbench/__tests__/RemoteGitExplorer.test.tsx` — 91 tests pass (cảnh báo antd deprecated có sẵn, không phải regression).
- Grep `toLowerCase().includes` còn lại trong `src/`: chỉ 7 dòng ở error-message detection (`JiraConfigCard`, `useGitHubAutoSync`), role/description constant check (`teamPrompts`, `smartIngestion` fallback) — không phải search input; `find/*` byte-exact vẫn giữ nguyên.
- `git diff --stat HEAD~3 HEAD -- knowledge-server src/workbench/search/find src/utils/bm25.ts src/utils/docSearch.ts` — không có thay đổi.
- Review diff: 3 commit theo đúng ranh giới task, không file bị xóa ngoài ý muốn, working tree sạch.
- Chrome verify: KHÔNG thực hiện — worktree không có dev server đang chạy; đã verify bằng scoped tests + tsc + grep thay thế.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Plan file chỉ tồn tại ở main checkout**
- **Found during:** Khởi động
- **Issue:** Đường dẫn plan trong prompt không có trong worktree (chưa commit docs artifacts).
- **Fix:** Đọc plan từ main checkout (read-only), không ghi vào main; mọi code change nằm trong worktree.

**2. [Rule 3 - Blocking] Worktree không có node_modules**
- **Found during:** Chạy test
- **Issue:** Worktree không symlink `node_modules`; dependency nằm ở main checkout.
- **Fix:** Gọi trực tiếp binary vitest/tsc của main checkout với `cwd` trỏ vào worktree; không cài đặt package mới.

**3. [Rule 2 - Missing coverage] Raw `.toLowerCase().includes()` sót ngoài danh sách anchor**
- **Found during:** Task 3 grep toàn `src/`
- **Issue:** Còn call site search tại ChatTabToolbox, NoteEditor, AllocationModal, ActualWorklogPlanner, NineRouterConfigCard, SystemModal, MermaidAssistantView, PlannerView, TasksView, remote Git tree search, và `/` command filter trong ChatInputBar.
- **Fix:** Đưa toàn bộ vào cùng Task 3, dùng chung helper; giữ nguyên error-message và byte-exact checks.

**4. [Rule 1 - Bug] AgentDiffReviewer `lower` out of scope + unused import**
- **Found during:** Task 3 typecheck
- **Issue:** `lower` dùng trong `diffFolderKeys` memo nhưng khai báo trong memo khác; `foldForSearch` unused ở ActualWorklogPlanner.
- **Fix:** Khai báo `lower` trong đúng memo, bỏ import thừa; tsc sạch.

## Known Stubs

None.

## Threat Flags

None. Không endpoint/auth/schema/file-access mới; query fold dùng `String.includes`, không RegExp từ input.

## Self-Check: PASSED

- Files: `src/utils/searchText.ts`, `src/utils/searchText.test.ts`, SUMMARY.md exist.
- Commits: `3576e519`, `4fc134df`, `f3ea17fa` verified in git log.
- tsc clean, scoped tests 91/91 pass, protected paths unchanged, working tree clean.
