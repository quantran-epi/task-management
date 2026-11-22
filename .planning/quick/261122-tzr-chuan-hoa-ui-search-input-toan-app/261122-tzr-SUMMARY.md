---
phase: 261122-tzr
plan: 01
subsystem: ui-search
tags: [search-input, antd, vietnamese, keyboard, empty-state]
dependency_graph:
  requires: [261122-t7c]
  provides: [SearchInput, zero-result-empty-states]
  affects: [search-surfaces-across-app]
tech_stack:
  added: []
  patterns: ["single SearchInput wrapper", "token prefix", "zero-result vs no-data empty states"]
key_files:
  created: []
  modified:
    - src/components/ui/input.tsx
    - src/components/ui/index.ts
    - src/components/ui/__tests__/controls.test.tsx
    - src/views/TelegramMonitorView.tsx
    - src/components/knowledge/DocumentSetForm.tsx
    - src/components/notes/ZipImportPreviewModal.tsx
    - src/workbench/DocSetLibrary.tsx
    - src/workbench/toolwindows/ToolExplorerPanel.tsx
    - src/components/agents/CodingZoneTree.tsx
    - src/styles/coding-zone.css
    - src/workbench/search/SearchEverywhereModal.tsx
    - src/workbench/search/__tests__/SearchEverywhereModal.test.tsx
    - src/components/common/ShortcutHUD.tsx
    - src/views/AiOfficeView.tsx
    - src/components/notes/DocFolderTree.tsx
    - src/components/palette/CommandPaletteModal.tsx
    - src/components/agents/AgentDiffReviewer.tsx
    - src/workbench/toolwindows/RemoteGitExplorer.tsx
    - src/workbench/search/find/FindInRemoteFiles.tsx
    - src/components/settings/AiToolCatalogCard.tsx
    - src/workbench/toolwindows/CRExplorer.tsx
    - src/workbench/toolwindows/SystemsExplorer.tsx
    - src/workbench/toolwindows/DiagramExplorer.tsx
    - src/components/notes/DocListPane.tsx
    - src/components/changeRequests/ChangeRequestTable.tsx
    - src/views/ChangeRequestsView.tsx
    - src/views/SystemCatalogView.tsx
    - src/views/NotesPopoutView.tsx
decisions:
  - "InputSearch giữ lại làm legacy export cho test cũ; product code dùng SearchInput."
  - "useAntdToken() trả wrapper nên prefix dùng token.token.colorTextSecondary."
  - "ChangeRequestTable nhận emptyText optional để view quyết định thông báo zero-result mà không thêm state mới."
  - "FindInRemoteFiles chỉ thêm placeholder; byte-exact matching và class find-pattern giữ nguyên."
metrics:
  duration: "~13 phút"
  completed: 2026-11-22
---

# Phase 261122-tzr Plan 01: Chuẩn hóa UI search input toàn app Summary

Một `SearchInput` dùng chung cho mọi ô tìm kiếm đã audit: prefix SearchOutlined theo token, allowClear, size middle, không width cố định. 5 `InputSearch`, 2 raw `<input>`, và mọi prefix/size/width lệch đã chuyển sang wrapper chung. Empty state zero-result tách khỏi no-data ở 6 màn hình. Không đụng logic fold tiếng Việt, matching byte-exact, debounce hay keyboard handler.

## Commits

| Task | Commit | Nội dung |
| ---- | ------ | -------- |
| 1 | `5e93f5bd` | Thêm SearchInput + di chuyển 7 controllegacy |
| 2 | `2b2108d3` | Đồng bộ 12 site Input có sẵn |
| 3 | `cf71f6ce` | Tách zero-result + dọn width còn lại |

## Verification

- `npx vitest run src/components/ui/__tests__/controls.test.tsx src/workbench/search/__tests__/SearchEverywhereModal.test.tsx --bail=1 --reporter=dot` — 2 files, 32 tests pass.
- `npx tsc --noEmit` — sạch sau mỗi task.
- Grep gate: không còn `InputSearch`, `⌕`, hay `<input>` search trong code product. `<input type="file">` trong `DocsLibraryActions.tsx` là file picker ẩn, không phải search — giữ nguyên.
- `git diff --stat` — không chứa `src/workbench/search/find/*` matching code (chỉ thêm 1 placeholder) hay `knowledge-server/`.
- Chrome UI verification: defer tới main tree sau merge (worktree không có dev server).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] PLAN file chỉ tồn tại ở main checkout**
- **Found during:** Startup
- **Issue:** Worktree base `9afc803d` chưa có `.planning/quick/261122-tzr-...` — plan được tạo sau khi worktree tách.
- **Fix:** Đọc plan từ main checkout dạng read-only; không ghi file planning vào worktree cho tới lúc tạo SUMMARY.
- **Files modified:** none
- **Commit:** none

**2. [Rule 1 - Bug] `useAntdToken()` trả object wrapper**
- **Found during:** Task 1, tsc
- **Issue:** `token.colorTextSecondary` không tồn tại trên kiểu trả về của hook; phải là `token.token.colorTextSecondary`.
- **Fix:** Sửa biểu thức prefix trong `input.tsx`.
- **Files modified:** `src/components/ui/input.tsx`
- **Commit:** `5e93f5bd`

**3. [Rule 3 - Blocking] `Input` vẫn dùng ở AgentDiffReviewer dòng 594**
- **Found during:** Task 2, tsc
- **Issue:** Bỏ import `Input` làm hỏng một input không phải search.
- **Fix:** Giữ lại import `Input` cạnh `SearchInput`.
- **Files modified:** `src/components/agents/AgentDiffReviewer.tsx`
- **Commit:** `2b2108d3`

**4. [Rule 2 - Missing functionality] Empty state nằm trong component con**
- **Found during:** Task 3
- **Issue:** `ChangeRequestsView` không render Empty trực tiếp; `ChangeRequestTable` mới là nơi quyết định emptyText.
- **Fix:** Thêm prop `emptyText?: React.ReactNode` optional vào `ChangeRequestTable`, fallback giữ nguyên thông báo cũ.
- **Files modified:** `src/components/changeRequests/ChangeRequestTable.tsx`, `src/views/ChangeRequestsView.tsx`
- **Commit:** `cf71f6ce`

**5. [Rule 3 - Blocking] Empty condition của SystemCatalog dùng raw list**
- **Found during:** Task 3
- **Issue:** `systems.length === 0` không phản ánh zero-result sau lọc; filtered list mới là nguồn đúng.
- **Fix:** Đổi điều kiện sang `filteredSystems.length === 0` và rẽ nhánh description + nút "Tạo hệ thống" theo `searchQuery.trim()`.
- **Files modified:** `src/views/SystemCatalogView.tsx`
- **Commit:** `cf71f6ce`

## Known Stubs

None. Mọi empty state đều lấy từ nguồn dữ liệu thật (filtered list + query state có sẵn).

## Threat Flags

None. Không thêm endpoint, auth path, file access hay schema change; prefix override là React node, không render HTML thô.

## Self-Check: PASSED

- Key files tồn tại: `input.tsx`, `SearchEverywhereModal.tsx`, `ChangeRequestTable.tsx`, SUMMARY.
- Commits `5e93f5bd`, `2b2108d3`, `cf71f6ce` có trong git log.
