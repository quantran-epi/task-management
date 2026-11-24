---
phase: quick
plan: 261124-vps
subsystem: dark-theme-controls
tags: [dark-mode, tokens, css-vars, antd, command-palette, settings, notes, coding-zone]
requires: []
provides: [VPS-TOKEN-FOUNDATION, VPS-CRITICAL-SURFACES, VPS-DARK-DETECTION, VPS-DOCS-MARKDOWN]
affects: [VPS-CHROME-AUDIT]
tech-stack:
  added: []
  patterns: [var(--token) inline style, useThemeMode() cho dark detection, useAntdToken() cho JS color, statusColorMap]
key-files:
  created: []
  modified:
    - src/styles/tokens.ts
    - src/components/ui/__tests__/tokens.test.ts
    - src/components/palette/CommandPaletteModal.tsx
    - src/views/SettingsView.tsx
    - src/components/settings/GitHubConfigCard.tsx
    - src/components/settings/JiraConfigCard.tsx
    - src/components/settings/NineRouterConfigCard.tsx
    - src/components/settings/WeeklyCapacityForm.tsx
    - src/components/settings/SystemTypeOptionsCard.tsx
    - src/views/ChangeRequestsView.tsx
    - src/views/ChangeRequestDetailView.tsx
    - src/components/systems/SystemTable.tsx
    - src/workbench/editor/RemoteFileViewer.tsx
    - src/views/MermaidAssistantView.tsx
    - src/components/settings/GlobalConventionsCard.tsx
    - src/views/ItemInsightView.tsx
    - src/views/SystemDetailView.tsx
    - src/components/notifications/NotificationItemRow.tsx
    - src/components/notifications/NotificationDrawer.tsx
    - src/components/notifications/NotificationBell.tsx
    - src/components/ai/ChatInputBar.tsx
    - src/views/AgentControlView.tsx
    - src/views/TelegramMonitorView.tsx
    - src/components/settings/BudgetWarnThresholdCard.tsx
    - src/components/settings/GitHubConflictModal.tsx
    - src/components/settings/StoragePersistenceCard.tsx
    - src/components/tasks/TaskDrawerPlanning.tsx
    - src/components/notes/DocFolderTree.tsx
    - src/components/notes/DocEditorPane.tsx
    - src/components/notes/DocFolderContentsView.tsx
    - src/components/notes/DocListPane.tsx
    - src/components/notes/QuickPreviewDrawer.tsx
    - src/components/notes/NormalizeDocModal.tsx
    - src/components/notes/NoteEditor.tsx
    - src/components/notes/QuickNoteEntry.tsx
    - src/components/notes/NoteAttachmentsPanel.tsx
    - src/components/notes/BacklinksSection.tsx
    - src/components/notes/DocsLibraryActions.tsx
    - src/components/notes/EntityNotesSection.tsx
    - src/components/notes/ZipImportPreviewModal.tsx
    - src/views/NotesView.tsx
    - src/views/NotesPopoutView.tsx
    - src/styles/markdown.css
    - src/styles/coding-zone.css
decisions:
  - Giữ nguyên mọi hex palette 49-UI-SPEC; chỉ thêm 4 biến diff vào lightTokens.css/darkTokens.css.
  - Dùng useThemeMode().mode === 'dark' thay hex sniffing trong RemoteFileViewer và MermaidAssistantView.
  - Giữ nguyên CR badge D-17 (#1677ff/#52c41a/#faad14); chỉ tokenize nền/border xung quanh.
  - `--info` là fill accent bị khóa; thêm `--info-fg` riêng cho chữ/icon nhỏ (#0e7490 light, #22d3ee dark) để đạt contrast.
  - AgentControlView thực tế nằm ở src/views/AgentControlView.tsx (PLAN ghi sai đường dẫn src/components/agents/).
metrics:
  duration: "~15 phút"
  completed: 2026-11-24
  tasks_completed: 5
  tasks_total: 5
---

# Phase Quick Plan 261124-vps: Giữ palette 49-UI-SPEC, sửa control dark mode Summary

Palette 49-UI-SPEC giữ byte-identical, bổ sung 4 biến `--diff-*/--fg-default` (thực tế 4 biến `--diff-*-bg/fg`) cho cả 2 mode, và dọn hardcode màu sáng ở ~44 file control bằng CSS var/`useThemeMode()`/`useAntdToken()`.

## Task 1 — Nền tảng token

- `src/styles/tokens.ts`: thêm đúng 4 khóa `--diff-add-bg/fg`, `--diff-del-bg/fg` vào `lightTokens.css` (fallback hiện có từ coding-zone.css) và `darkTokens.css` (họ `fileStatusMap.dark`). `git diff -U0` xác nhận **chỉ có 8 dòng thêm, 0 dòng palette bị đổi**.
- `applyCssVariables` không sửa — tự inject 4 biến mới nhờ `Object.entries(tokens.css)`.
- `src/components/ui/__tests__/tokens.test.ts`: mở rộng canary `applyCssVariables writes exact %s token values` — thêm 4 tên biến + assert cố light/dark. Không tạo file test mới.
- Verify: `npx vitest run src/components/ui/__tests__/tokens.test.ts --bail=1` → 7 tests pass; `npx tsc --noEmit` sạch.

## Task 2 — Critical: Command Palette + Settings + CR/Systems

- CommandPalette: cheatsheet bg/border, kbd, selected row (`--accent-soft`), footer border → CSS var.
- Settings: GitHub/Jira `rgba(0,0,0,.02/.08)` → `--bg-elev`/`--border`; NineRouter/Weekly `#f0f0f0` → `--border`; SystemType `rgba(0,0,0,.15)` → `--border-strong`; SettingsView `#ff4d4f` → `--danger`.
- ChangeRequests: accent cũ `#3871e1` → `--accent`; filter bar bg/border/chữ → token. ChangeRequestDetail `#d1d3d9` → `--border-strong`. Đồng thời bỏ 3 fallback `#e9eaee` trong `var(--border, #e9eaee)` để grep hygiene sạch.
- SystemTable: chip parent/child → `--accent-soft`/`--accent`/`--info`/`--border`; giữ glyph nhận diện (Folder/Branches).
- Verify: `npx tsc --noEmit` sạch; grep hygiene sạch. CR badge D-17 nguyên vẹn.

## Task 3 — Major: dark detection + accent cũ + notification/chat/status

- `RemoteFileViewer.tsx`: thay hex sniffing bằng `useThemeMode()`; bỏ `useAntdToken()` vì đã không còn dùng; dọn 2 fallback `#3871e1` và bg `#10b981`.
- `MermaidAssistantView.tsx`: thay parseInt sniffing/cast `(token as any)` bằng `useThemeMode()`; modal body `backgroundColor: token.colorBgContainer`; icon → `--success`.
- GlobalConventions `#3871e1` → `--accent`; notification/chat icon/badge → status vars; Telegram monitor nền/border/chữ → token; warning `#faad14` ở 3 settings card + TaskDrawerPlanning → `--warning`/`--success`.
- `AgentControlView.tsx` (đường dẫn thực: `src/views/`, không phải `src/components/agents/`): dọn `#f8fafc/#fafafa/#e2e8f0/#374151/#9ca3af`. Giữ `#1e1e1e` (nền terminal cố ý).
- **Cố ý giữ** `#faad14` trong `CR_TYPE_COLORS`/`CR_TYPE_COLOR` (`ItemInsightView.tsx:63`, `SystemDetailView.tsx:35`) — CR badge D-17, theo RESEARCH Q1.
- Verify: `npx tsc --noEmit` sạch. Grep còn đúng 2 hex CR badge nói trên (chủ đích).

## Task 4 — Notes/docs + markdown + coding-zone

- 15 file notes/views: thay nền sáng/chữ tối/warning/info/highlight bằng CSS var; `{--warning} bg` dùng `rgba(232, 161, 58, 0.16)`, info dùng `rgba(34, 211, 238, 0.14)` theo `statusColorMap.dark`; highlight.search dùng `--match`/`--match-ink`.
- `markdown.css`: `#1677ff` → `--accent`, wiki chip `#f3e8ff/#e9d5ff` → `--accent-soft`, `#7e22ce/#6b21a8` → `--fg`.
- `coding-zone.css`: tab close hover `color: #fff` → `var(--accent-fg)`; giữ nguyên 4 fallback `var(--diff-*, light-hex)` để debug foreign context (giờ biến đã có định nghĩa thật ở cả 2 mode nên fallback không thắng).
- Verify: `npx tsc --noEmit` sạch; grep hygiene sạch. 4 file bị loại trừ (DocumentSetForm, DocSetLibrary, DocumentSetDetail, DocumentSetDetailPublished test) không bị đụng.

## Verification tổng

- `npx vitest run src/components/ui/__tests__/tokens.test.ts src/workbench/__tests__/AntdThemeAdapter.test.tsx src/hooks/__tests__/themeBroadcast.test.ts --bail=1` → 3 files / 22 tests pass.
- `npx tsc --noEmit` → sạch.
- Không chạy full vitest suite. Không cài package. Không commit, không push.
- `git diff --name-only`: chỉ chứa các file trong scope dark-theme 261124-vps, **ngoại trừ** 6 file của session song song 261124-vps SSH/docx (`package.json`, `package-lock.json`, `src-tauri/src/lib.rs`, `src-tauri/src/ssh_service.rs`, `src/services/sshService.ts`, `tests/services/sshService.test.ts`). Các file này thay đổi trong lúc tôi chạy (timestamps 23:07–23:13), tôi không đụng vào và không revert. Không có file bị loại trừ (doc-set, udx, worktrees) nào xuất hiện.
- `src/styles/tokens.ts`: `git diff -U0` chỉ 8 dòng thêm (4 light + 4 dark), 0 dòng hex cũ bị đổi.
- CR badge D-17, brand SVG, white-on-swatch, file-type labels, GraphEvidenceDrawer — nguyên vẹn.

## Task 5 — Chrome audit HOÀN TẤT

Chrome audit dùng Playwright + Google Chrome thật (profile riêng, không đụng profile/session khác), 8 màn hình/control clusters, computed-style contrast scan + screenshot tại `/tmp/taskmate-dark-audit/`. File artifact: `261124-vps-CHROME-AUDIT.md`. Bổ sung fix boot body background trong `index.html` bằng early script đọc `taskmate_theme` (explicit light vẫn đúng dưới OS dark). Re-verify: `--accent #6a9bff`, `--bg-app #171d27`, body dark `rgb(17,21,29)`, body light `rgb(233,234,238)`, 0 low-contrast text. `npx tsc --noEmit` sạch; scoped tests 3 files / 22 tests pass.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Đường dẫn AgentControlView sai trong PLAN**
- **Found during:** Task 3
- **Issue:** PLAN ghi `src/components/agents/AgentControlView.tsx`, file thực tế là `src/views/AgentControlView.tsx`.
- **Fix:** Sửa đúng 4 dòng hardcode trong file thực tế. Không tạo file mới.
- **Files modified:** `src/views/AgentControlView.tsx`

**2. [Rule 1 - Bug] `token` unused sau khi chuyển sang `useThemeMode()`**
- **Found during:** Task 3 verify (`tsc --noEmit` báo TS6133)
- **Issue:** `const { token } = useAntdToken()` trong RemoteFileViewer không còn được dùng.
- **Fix:** Bỏ `useAntdToken` khỏi import + destructure.
- **Files modified:** `src/workbench/editor/RemoteFileViewer.tsx`

**3. [Rule 2 - Hygiene] Fallback `var(--border, #e9eaee)` làm grep verify fail**
- **Found during:** Task 2 verify
- **Issue:** 3 dòng fallback cũ trong ChangeRequestDetailView(2)/SystemTable(1) khớp regex grep dù vô hạn (var luôn inject).
- **Fix:** Bỏ fallback, dùng `var(--border)` thuần theo decision đã chốt.
- **Files modified:** `src/views/ChangeRequestDetailView.tsx`, `src/components/systems/SystemTable.tsx`

**4. [scope] 6 file của session song song**
- **Found during:** final `git diff --name-only`
- **Issue:** `package.json`, `package-lock.json`, `src-tauri/src/lib.rs`, `src-tauri/src/ssh_service.rs`, `src/services/sshService.ts`, `tests/services/sshService.test.ts` thay đổi từ session 261124-vps SSH/docx chạy song song (mtime 23:07–23:13).
- **Fix:** Không đụng, không revert, ghi rõ để orchestrator phân biệt. `npx tsc --noEmit` vẫn sạch sau khi các file này đổi.
- **Commit:** không (không commit).

## Known Stubs

Không có stub mới. 4 biến `--diff-*` có định nghĩa thật ở cả 2 mode, coding-zone dùng var đã inject.

## Threat Flags

Không có bề mặt mới. Chỉ thay style tĩnh bằng CSS var/hook có sẵn; không input boundary, network, auth hay schema mới. T-vps-02 (chữ tối trên nền tối) sẽ được chặn bởi Task 5 Chrome audit của orchestrator.

## Self-Check: PASS

Task 1-5 verify xong (tsc + scoped tests + grep + diff audit + Chrome audit). Không có file session song song nào bị đụng.
