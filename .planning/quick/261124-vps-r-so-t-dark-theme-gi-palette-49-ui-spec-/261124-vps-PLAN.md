---
phase: quick
plan: 261124-vps
type: execute
wave: 1
depends_on: []
files_modified:
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
  - src/components/agents/AgentControlView.tsx
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
  - .planning/quick/261124-vps-r-so-t-dark-theme-gi-palette-49-ui-spec-/261124-vps-CHROME-AUDIT.md
autonomous: false
requirements:
  - VPS-TOKEN-FOUNDATION
  - VPS-CRITICAL-SURFACES
  - VPS-DARK-DETECTION
  - VPS-DOCS-MARKDOWN
  - VPS-CHROME-AUDIT
user_setup: []
must_haves:
  truths:
    - "Palette 49-UI-SPEC trong src/styles/tokens.ts giữ nguyên từng hex; chỉ THÊM 4 biến --diff-add-bg/fg, --diff-del-bg/fg vào cả lightTokens.css và darkTokens.css"
    - "dark mode: Command Palette, Settings cards, Systems, CR, Notes/docs, Coding Zone diff, Mermaid, AI chat, notifications không còn nền trắng/kem, chữ tối hay border sáng hardcode"
    - "RemoteFileViewer và MermaidAssistantView lấy mode từ useThemeMode(), không còn so sánh hex colorBgBase hay parseInt"
    - "Accent cũ #3871e1 không còn xuất hiện; CR badge hex D-17 (#1677ff/#52c41a/#faad14) giữ nguyên"
    - "Chrome verify từng màn hình ở dark: computed --accent = #6a9bff, diff add/del nền dark, selected row dùng --accent-soft"
    - "Scoped tests + tsc --noEmit pass; KHÔNG chạy full vitest suite"
  artifacts:
    - path: "src/styles/tokens.ts"
      provides: "Palette lock + định nghĩa --diff-add-bg/fg, --diff-del-bg/fg cho cả 2 mode"
      contains: "'--diff-add-bg'"
    - path: "src/components/ui/__tests__/tokens.test.ts"
      provides: "Canary assertion cho 4 biến diff mới ở cả light/dark"
      contains: "diff-add-bg"
    - path: "src/components/palette/CommandPaletteModal.tsx"
      provides: "Cheatsheet/selected row/footer kbd dùng var(--token) thay hardcode"
    - path: "src/workbench/editor/RemoteFileViewer.tsx"
      provides: "isDark từ useThemeMode()"
      contains: "useThemeMode"
    - path: "src/views/MermaidAssistantView.tsx"
      provides: "isDark từ useThemeMode(); body dùng token.colorBgContainer"
      contains: "useThemeMode"
    - path: "src/styles/coding-zone.css"
      provides: "Diff add/del lấy biến đã định nghĩa trong tokens.ts"
      contains: "var(--diff-add-bg"
  key_links:
    - from: "src/styles/tokens.ts"
      to: "src/workbench/AntdThemeAdapter.tsx"
      via: "applyCssVariables inject mọi tokens.css lên wrapper + document.documentElement (portal kế thừa)"
      pattern: "applyCssVariables"
    - from: "src/styles/coding-zone.css"
      to: "src/styles/tokens.ts"
      via: "var(--diff-*-bg/fg) phải có định nghĩa thật, không rơi vào fallback light"
      pattern: "--diff-add-bg"
    - from: "src/components/palette/CommandPaletteModal.tsx"
      to: "document.documentElement"
      via: "Modal portal append vào body, kế thừa CSS var từ documentElement"
      pattern: "var(--accent-soft"
---

# 261124-vps: Giữ palette 49-UI-SPEC, sửa control dark mode, Chrome verify

## Vấn đề

Palette dark đã lock trong `src/styles/tokens.ts` và inject qua `applyCssVariables()` lên cả wrapper lẫn `document.documentElement`. Lỗi nằm ở chính control: hardcode `#fafafa/#f0f0f0/#d9d9d9/#fff/#e6f4ff`, `rgba(0,0,0,.02/.08/.15)`, hex accent cũ `#3871e1`, cặp biến `--diff-*-bg/fg` chưa từng được định nghĩa (fallback light luôn thắng), và dark detection đoán bằng hex `colorBgBase === '#141414'` trong khi dark token thật là `#11151d`.

**Quyết định đã chốt — KHÔNG hỏi lại:**
- GIỮ NGUYÊN mọi hex trong `darkTokens/lightTokens`. Chỉ THÊM 4 biến `--diff-add-bg/fg`, `--diff-del-bg/fg` vào cả 2 `css` map, lấy giá trị từ fallback hiện có trong `coding-zone.css` cho light (`#e6ffed/#1a6b34`, `#ffeef0/#a3272e`) và giá trị dark phù hợp cùng họ `fileStatusMap.dark` (`rgba(74,222,128,.16)/#4ade80`, `rgba(255,130,137,.16)/#ff8289`), rồi cập nhật canary `tokens.test.ts`.
- Ưu tiên sửa: (1) critical = CommandPalette, settings cards, CR/settings views, notes/doc controls, coding-zone vars; (2) major = dark detection sai, accent cũ `#3871e1`, notification/chat hardcode; (3) minor = bỏ qua trừ khi cùng file đang sửa.
- Pattern: `var(--token)` trong inline style; `useAntdToken()` khi cần giá trị JS dynamic; `useThemeMode()` cho dark detection. Không import `theme` từ `antd` ngoài `antdTheme.ts`.
- KHÔNG đổi CR badge hex D-17 (`#52c41a/#faad14/#1677ff`); KHÔNG đụng `GraphEvidenceDrawer.tsx`; KHÔNG đụng brand SVG / white-on-swatch / file-type labels (xem RESEARCH "Không phải lỗi dark mode").

**Ràng buộc cứng:**
- TUYỆT ĐỐI không đụng: `src/components/knowledge/DocumentSetForm.tsx`, `src/workbench/DocSetLibrary.tsx`, `src/workbench/DocumentSetDetail.tsx`, `src/workbench/__tests__/DocumentSetDetailPublished.test.tsx`, `.planning/quick/261124-udx-*/`, `.claude/worktrees/*`, session refactor docs đang chạy. Không `git checkout/reset`, không xoá branch/worktree. Làm trên `pre-v1.6-baseline`.
- KHÔNG chạy full vitest suite (>1h). Chỉ scoped tests + `npx tsc --noEmit`.
- Không commit/push trong plan — orchestrator lo sau khi verify.
- Review diff + Chrome verify BẮT BUỘC trước khi xong. Dev server đã chạy `:5173`.

## Context

@/Users/tranducquan/Working/Personal/task-management/CLAUDE.md
@.planning/STATE.md
@.planning/quick/261124-vps-r-so-t-dark-theme-gi-palette-49-ui-spec-/261124-vps-RESEARCH.md
@src/styles/tokens.ts
@src/hooks/useThemeMode.ts
@src/components/ui/antdTheme.ts

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@src/styles/tokens.ts
@src/components/ui/__tests__/tokens.test.ts
@src/styles/coding-zone.css
@src/workbench/editor/RemoteFileViewer.tsx
@src/views/MermaidAssistantView.tsx
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Nền tảng token — thêm 4 biến diff + canary test, giữ palette nguyên vẹn</name>
  <files>src/styles/tokens.ts, src/components/ui/__tests__/tokens.test.ts</files>
  <behavior>
    - Light css map có `--diff-add-bg: #e6ffed`, `--diff-add-fg: #1a6b34`, `--diff-del-bg: #ffeef0`, `--diff-del-fg: #a3272e` (đúng fallback hiện có trong coding-zone.css).
    - Dark css map có 4 biến tương ứng, nền rgba theo họ fileStatusMap.dark, chữ `#4ade80` / `#ff8289`; không trùng ngày thường, không đổi hex palette đã lock.
    - `applyCssVariables` tự động inject 4 biến mới (vì lặp `Object.entries(tokens.css)`) — không sửa hàm này.
    - Canary test xác nhận cả 2 mode đều có đủ 4 biến với giá trị đúng và palette fields vẫn giữ nguyên.
  </behavior>
  <action>
    Trong `src/styles/tokens.ts`, thêm 4 khóa vào `lightTokens.css` và `darkTokens.css` ngay cạnh nhóm file-status/success (`'--success'/'--warning'/'--danger'/'--info'`). Light dùng đúng 4 hex fallback từ `coding-zone.css:181-184`: `--diff-add-bg` `#e6ffed`, `--diff-add-fg` `#1a6b34`, `--diff-del-bg` `#ffeef0`, `--diff-del-fg` `#a3272e`. Dark dùng `--diff-add-bg: rgba(74, 222, 128, 0.16)`, `--diff-add-fg: #4ade80`, `--diff-del-bg: rgba(255, 130, 137, 0.16)`, `--diff-del-fg: #ff8289`. KHÔNG đổi bất kỳ hex nào khác trong `antd`/`css` map, KHÔNG đổi `cssMetrics`, KHÔNG đụng `getAntdTheme`/`applyCssVariables`, KHÔNG thêm comments giải thích palette (đã có comment lock ở đầu file).

    Trong `src/components/ui/__tests__/tokens.test.ts`, mở rộng case `applyCssVariables writes exact %s token values`: thêm 4 tên biến diff vào mảng kiểm tra và assert từng giá trị bằng `tokens.css[name]` cho cả 2 mode, kèm assert cố light/dark (`#e6ffed` vs `rgba(74, 222, 128, 0.16)`). Giữ nguyên mọi assertion cũ. Không tạo file test mới.
  </action>
  <verify>
    <automated>npx vitest run src/components/ui/__tests__/tokens.test.ts --bail=1 && npx tsc --noEmit</automated>
  </verify>
  <done>4 biến diff có định nghĩa thực trong cả 2 mode, canary test pass, mọi hex palette đã lock byte-identical, tsc sạch.</done>
</task>

<task type="auto">
  <name>Task 2: Critical — Command Palette + Settings cards + CR/settings views</name>
  <files>src/components/palette/CommandPaletteModal.tsx, src/views/SettingsView.tsx, src/components/settings/GitHubConfigCard.tsx, src/components/settings/JiraConfigCard.tsx, src/components/settings/NineRouterConfigCard.tsx, src/components/settings/WeeklyCapacityForm.tsx, src/components/settings/SystemTypeOptionsCard.tsx, src/views/ChangeRequestsView.tsx, src/views/ChangeRequestDetailView.tsx, src/components/systems/SystemTable.tsx</files>
  <action>
    Thay mọi hardcode màu sáng trong 10 file này bằng CSS var đã có (giữ fallback light chỉ khi pattern file đang dùng `var(--x, light)`; ưu tiên `var(--token)` thuần theo decision đã chốt). Cụ thể theo RESEARCH:
    - `CommandPaletteModal.tsx` dòng 510/512 `#fafafa`/`#f0f0f0` → `var(--bg-elev)`/`var(--border)`; 546/548 `#d9d9d9`/`#fff` → `var(--border)`/`var(--bg-island)`; 591 `#e6f4ff` → `var(--accent-soft)`; 593/630 `#f0f0f0` → `var(--border)`; 637/640/646/652 kbd `#d9d9d9`/`#fafafa` → `var(--border)`/`var(--bg-elev)`.
    - `GitHubConfigCard.tsx` 191/193/229/231 `rgba(0,0,0,0.02/0.08)` → `var(--bg-elev)`/`var(--border)`; `JiraConfigCard.tsx` 374/376 tương tự; `NineRouterConfigCard.tsx:558`, `WeeklyCapacityForm.tsx:82` `#f0f0f0` → `var(--border)`; `SystemTypeOptionsCard.tsx:136` `rgba(0,0,0,0.15)` → `var(--border-strong)`. KHÔNG đụng dòng 271 (`#8c8c8c` là placeholder ví dụ) trong SystemTypeOptionsCard.
    - `SettingsView.tsx:209` `#ff4d4f` → `var(--danger)`.
    - `ChangeRequestsView.tsx` 146/148/159/177 `#f9f9fb`/`#e9eaee`/`#595959` → `var(--bg-elev)`/`var(--border)`/`var(--fg-secondary)`; dòng 131 accent cũ `#3871e1` → `var(--accent)`.
    - `ChangeRequestDetailView.tsx` 368/371 `#d1d3d9` → `var(--border-strong)`. TUYỆT ĐỐI giữ nguyên hex badge CR `#52c41a/#faad14/#1677ff` (D-17, research Q1).
    - `SystemTable.tsx` 104-106 `#f9f0ff/#e6fffb/#d3adf7/#87e8de/#722ed1/#08979c` → `var(--accent-soft)`/`var(--info)`/`var(--border)`; giữ glyph/icon nếu cần nhận diện.
    Dùng `Edit` từng file đúng block đã xác định (RESEARCH "Full file index"), không đọc lại đoạn vừa sửa, không đổi logic/behavior, không thêm package, không đụng file bị loại trừ.
  </action>
  <verify>
    <automated>npx tsc --noEmit && ! grep -rnE "#fafafa|#f0f0f0|#d9d9d9|#e6f4ff|#f9f9fb|#e9eaee|#595959|#d1d3d9|#3871e1|rgba\(0, *0, *0, *0\.(02|08|15)\)" src/components/palette/CommandPaletteModal.tsx src/views/SettingsView.tsx src/components/settings/GitHubConfigCard.tsx src/components/settings/JiraConfigCard.tsx src/components/settings/NineRouterConfigCard.tsx src/components/settings/WeeklyCapacityForm.tsx src/components/settings/SystemTypeOptionsCard.tsx src/views/ChangeRequestsView.tsx src/views/ChangeRequestDetailView.tsx src/components/systems/SystemTable.tsx</automated>
  </verify>
  <done>10 file critical không còn hardcode màu sáng theo danh sách trên; CR badge D-17 nguyên vẹn; tsc sạch; grep sạch (bỏ qua placeholder `#8c8c8c` ở SystemTypeOptionsCard:271 nếu còn).</done>
</task>

<task type="auto">
  <name>Task 3: Major — dark detection đúng + accent cũ + notification/chat hardcode</name>
  <files>src/workbench/editor/RemoteFileViewer.tsx, src/views/MermaidAssistantView.tsx, src/components/settings/GlobalConventionsCard.tsx, src/views/ItemInsightView.tsx, src/views/SystemDetailView.tsx, src/components/notifications/NotificationItemRow.tsx, src/components/notifications/NotificationDrawer.tsx, src/components/notifications/NotificationBell.tsx, src/components/ai/ChatInputBar.tsx, src/components/agents/AgentControlView.tsx, src/views/TelegramMonitorView.tsx, src/components/settings/BudgetWarnThresholdCard.tsx, src/components/settings/GitHubConflictModal.tsx, src/components/settings/StoragePersistenceCard.tsx, src/components/tasks/TaskDrawerPlanning.tsx</files>
  <action>
    - `RemoteFileViewer.tsx`: import `useThemeMode` từ `../../hooks/useThemeMode`, thay dòng 48 bằng `const { mode } = useThemeMode(); const isDark = mode === 'dark';`. Giữ `useAntdToken()` cho các token khác; xóa hoàn toàn so sánh `colorBgBase === '#141414'` và `colorTextBase?.includes('255')`. Không đổi logic render file/diagram.
    - `MermaidAssistantView.tsx`: import `useThemeMode`, thay block 141-144 bằng `const { mode } = useThemeMode(); const isDark = mode === 'dark';`, xóa cast `(token as any)`. Dòng 773 `backgroundColor: isDark ? '#141414' : '#fafafa'` → `token.colorBgContainer` (hoặc `var(--bg-elev)` nếu style chấp nhận CSS var) — dùng `token.colorBgContainer` để khớp `useAntdToken()` đã có.
    - Accent cũ `#3871e1`: `GlobalConventionsCard.tsx:98,176` → `var(--accent)` / `token.colorPrimary` tùy ngữ cảnh inline/CSS.
    - Notification/chat/status hardcode: `NotificationItemRow.tsx` 54/72/78/107/109/140/155 → `var(--success)`, `var(--warning)`, `var(--border)`, `var(--fg)`; `NotificationDrawer.tsx:102` `#ff4d4f/#d9d9d9` → `var(--danger)`/`var(--control-off)`; `NotificationBell.tsx:16` → `var(--danger)`; `ChatInputBar.tsx` 39-75/639/691/782 icon command → `var(--danger)/--success/--warning/--info`; `AgentControlView.tsx` 186/309-310/341-342/349/402/408 → `token.colorBgContainer`/`var(--bg-elev)`/`var(--fg-secondary)` (GIỮ `#1e1e1e` nếu đó là nền terminal cố ý); `TelegramMonitorView.tsx` 481-528/587/680-705/924-942/342 → `var(--bg-elev)`/`var(--border)`/`var(--fg)` + status vars.
    - `ItemInsightView.tsx` 62-63/509/797/877: CR map rời → dùng `statusColorMap[mode]`/`var(--info)`/`var(--success)` thay `#13c2c2/#10b981`; KHÔNG đổi CR badge hex D-17. `SystemDetailView.tsx` 34-35/103-105: map CR/status rời → `statusColorMap` + `var(--success)/--warning/--danger`, giữ hex CR badge.
    - `#faad14` → `var(--warning)` tại `BudgetWarnThresholdCard.tsx:68`, `GitHubConflictModal.tsx:54`, `StoragePersistenceCard.tsx:80`; `TaskDrawerPlanning.tsx:301` `#fa8c16/#52c41a` → `var(--warning)/var(--success)` (KHÔNG đụng CR badge map).
    KHÔNG đụng `GraphEvidenceDrawer.tsx`, không đụng brand SVG/white-on-swatch/file-type labels. Mỗi file đọc 1 lần đúng block, Edit ngay; không re-read.
  </action>
  <verify>
    <automated>npx tsc --noEmit && ! grep -rnE "#141414|#fafafa|#3871e1|#ff4d4f|#d9d9d9|#faad14|#fa8c16|#13c2c2|#10b981|colorTextBase.*255|parseInt\(token\.colorBgContainer" src/workbench/editor/RemoteFileViewer.tsx src/views/MermaidAssistantView.tsx src/components/settings/GlobalConventionsCard.tsx src/views/ItemInsightView.tsx src/views/SystemDetailView.tsx src/components/notifications/NotificationItemRow.tsx src/components/notifications/NotificationDrawer.tsx src/components/notifications/NotificationBell.tsx src/components/ai/ChatInputBar.tsx src/components/settings/BudgetWarnThresholdCard.tsx src/components/settings/GitHubConflictModal.tsx src/components/settings/StoragePersistenceCard.tsx src/components/tasks/TaskDrawerPlanning.tsx</automated>
  </verify>
  <done>Hai view dùng `useThemeMode()` (grep hex sniffing sạch); accent cũ `#3871e1` biến mất; notification/chat/status hardcode thay bằng token/status map; `tsc --noEmit` sạch; CR badge D-17 nguyên vẹn.</done>
</task>

<task type="auto">
  <name>Task 4: Notes/docs + markdown + coding-zone CSS vars</name>
  <files>src/components/notes/DocFolderTree.tsx, src/components/notes/DocEditorPane.tsx, src/components/notes/DocFolderContentsView.tsx, src/components/notes/DocListPane.tsx, src/components/notes/QuickPreviewDrawer.tsx, src/components/notes/NormalizeDocModal.tsx, src/components/notes/NoteEditor.tsx, src/components/notes/QuickNoteEntry.tsx, src/components/notes/NoteAttachmentsPanel.tsx, src/components/notes/BacklinksSection.tsx, src/components/notes/DocsLibraryActions.tsx, src/components/notes/EntityNotesSection.tsx, src/components/notes/ZipImportPreviewModal.tsx, src/views/NotesView.tsx, src/views/NotesPopoutView.tsx, src/styles/markdown.css, src/styles/coding-zone.css</files>
  <action>
    - 13 file `src/components/notes/*` + 2 view `NotesView.tsx`/`NotesPopoutView.tsx`: thay mọi hardcode theo bảng RESEARCH "Critical" bằng CSS var: `#fafafa/#f3f4f6/#f8fafc/#fafcff/#f0f0f0/#f0f7ff` → `var(--bg-elev)`/`var(--bg-island)`/`var(--border)`; `#262626/#374151/#1f2937/#434343/#4b5563/#595959` → `var(--fg)`/`var(--fg-secondary)`; warning family `#fef3c7/#fefce8/#fde68a/#92400e/#d97706` → `var(--warning)` + nền `rgba(232,161,58,.16)` (không có `--warning-bg` riêng, dùng rgba cùng họ `statusColorMap.dark.warning`); info family `#bae6fd/#f0f9ff` → `rgba(34,211,238,.14)` + `var(--info)`; highlight `#ffe58f` → `var(--match)/--match-ink` (QuickPreviewDrawer). KHÔNG đụng 4 file bị loại trừ (DocumentSetForm, DocSetLibrary, DocumentSetDetail, DocumentSetDetailPublished test) dù grep có thể thấy hardcode.
    - `markdown.css` 145/284/293-294/300/310-322: `#1677ff` → `var(--accent)`, `#f3e8ff/#e9d5ff` → `var(--accent-soft)`, `#7e22ce/#6b21a8` → `var(--fg)` (wiki chip).
    - `coding-zone.css`: dòng 101 `color: #fff` trên `var(--danger)` → `var(--accent-fg)`; dòng 165 giữ `var(--diff-del-bg)` (giờ đã có định nghĩa từ Task 1 — KHÔNG đổi fallback); dòng 181-184 giữ nguyên `var(--diff-add-bg, #e6ffed)`... nhưng vì biến đã tồn tại ở cả 2 mode nên fallback light không bao giờ thắng. KHÔNG xóa fallback (để debug foreign context), KHÔNG đổi giá trị fallback.
    KHÔNG thêm package; mỗi file đọc 1 lần, Edit ngay, không re-read đoạn vừa sửa.
  </action>
  <verify>
    <automated>npx tsc --noEmit && ! grep -rnE "#fafafa|#f0f0f0|#fef3c7|#374151|#262626|#595959|#e6f4ff|#0958d9|#1677ff|#f3e8ff|#7e22ce|#fff1f0|#fffbe6" src/components/notes/DocFolderTree.tsx src/components/notes/DocEditorPane.tsx src/components/notes/DocFolderContentsView.tsx src/components/notes/DocListPane.tsx src/components/notes/QuickPreviewDrawer.tsx src/components/notes/NormalizeDocModal.tsx src/components/notes/NoteEditor.tsx src/components/notes/QuickNoteEntry.tsx src/components/notes/NoteAttachmentsPanel.tsx src/components/notes/BacklinksSection.tsx src/components/notes/DocsLibraryActions.tsx src/components/notes/EntityNotesSection.tsx src/components/notes/ZipImportPreviewModal.tsx src/views/NotesView.tsx src/views/NotesPopoutView.tsx src/styles/markdown.css</automated>
  </verify>
  <done>Notes/docs/markdown hết hardcode theo bảng; coding-zone diff dùng 4 biến mới đã inject; tsc sạch; 4 file bị loại trừ không bị đụng (kiểm tra `git diff --name-only`).</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 5: Chrome audit dark mode — mọi màn hình/control + screenshots</name>
  <files>.planning/quick/261124-vps-r-so-t-dark-theme-gi-palette-49-ui-spec-/261124-vps-CHROME-AUDIT.md</files>
  <what-built>Tasks 1-4: palette giữ nguyên, 4 biến diff mới, ~55 file control dùng token/`useThemeMode()`/`useAntdToken()`.</what-built>
  <how-to-verify>
    Dev server đang chạy tại `http://localhost:5173`. Dùng chrome-devtools MCP (`list_pages` / `navigate` / `evaluate_script` / `take_screenshot`); load skill `chrome-devtools` nếu cần. KHÔNG thay bằng jsdom. Mỗi bước: toggle dark bằng `localStorage['taskmate_theme'] = 'dark'` rồi reload (hoặc TitleBar icon Moon/Sun `aria-label="Chuyển đổi giao diện sáng/tối"`), chụp screenshot, kiểm tra `getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() === '#6a9bff'`. Đi lần lượt:
    1. `http://localhost:5173/#/settings` — mở từng card GitHub/Jira/NineRouter/WeeklyCapacity/SystemType/GlobalConventions/Storage/BudgetWarn: nền card `#171d27`/`#1c2330`, border `#2c3646`, chữ sáng, không còn nền trắng hay `rgba(0,0,0,...)`.
    2. `http://localhost:5173/#/systems` (SystemsExplorer + SystemCatalog + SystemDetail): chip/card nền tối, accent `#6a9bff`; KHÔNG đụng brand SVG/file-type labels.
    3. `http://localhost:5173/#/change-requests` + mở 1 CR detail: badge CR giữ `#1677ff/#52c41a/#faad14` (D-17), nền/border xung quanh dark; filter/card không còn `#f9f9fb`.
    4. `http://localhost:5173/#/notes` — DocFolderTree, DocEditorPane, DocListPane, QuickPreviewDrawer, NormalizeDocModal, note editor: highlight tìm kiếm dùng `--match` vàng đục trên chữ sáng; không còn nền kem `#fef3c7` hay chữ `#374151`. KHÔNG mở doc-set rail/inspector (file bị loại trừ).
    5. Command Palette `Cmd+K` (và cheatsheet `?`): cheatsheet nền `var(--bg-elev)`, kbd border `var(--border)`, selected row `var(--accent-soft)` `#1e3156`, chữ sáng.
    6. AI chat + notification bell/drawer + AI popout (`#/ai-popout`): icon/badge dùng `--danger/--success/--warning/--info`, không còn `#ff4d4f/#3871e1`.
    7. Coding Zone mở 1 diff: dòng add nền `rgba(74,222,128,0.16)` chữ `#4ade80`; dòng del nền `rgba(255,130,137,0.16)` chữ `#ff8289`; tab close hover dùng `--accent-fg` chữ đậm trên `--danger`.
    8. Mermaid Assistant (`#/mermaid` hoặc mở từ Studio): body `token.colorBgContainer` `#171d27`, không còn `#141414/#fafafa`; toggle sáng/tối qua TitleBar vẫn cập nhật ngay.
    9. Markdown render có wiki-link chip: chip nền `--accent-soft`, chữ `--fg`.
    Ghi kết quả từng màn hình (đạt / lỗi cụ thể kèm computed style) vào `.planning/quick/.../261124-vps-CHROME-AUDIT.md` (file artifacts, KHÔNG phải report analysis — orchestrator đọc). Nếu phát hiện control vẫn lệch, sửa tại file tương ứng (Task 2-4) rồi chụp lại trước khi approve.
  </how-to-verify>
  <resume-signal>Soạn "approved" kèm danh sách màn hình đã chụp; hoặc nêu control cụ thể còn lệch để tôi sửa rồi verify lại.</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| CSS var injection → DOM | `applyCssVariables` ghi token lên wrapper + `document.documentElement`; portal Modal/Drawer kế thừa — không có input người dùng. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-vps-01 | T (Tampering) | CSS hardcode thay bằng `var(--token)` | accept | Chỉ đổi giá trị style tĩnh; không có luồng dữ liệu mới từ URL/props vào style. |
| T-vps-02 | I (Information disclosure) | Chữ tối trên nền tối | mitigate | Chrome audit từng màn hình (Task 5) chặn regression làm người dùng bỏ sót nội dung destructive; giữ `--danger` cho destructive action. |
| T-vps-SC | Tampering | npm/pip/cargo installs | accept | Không cài package nào trong plan này; mọi fix dùng CSS var/token/hook có sẵn. |
</threat_model>

<verification>
1. `npx vitest run src/components/ui/__tests__/tokens.test.ts src/workbench/__tests__/AntdThemeAdapter.test.tsx src/hooks/__tests__/themeBroadcast.test.ts --bail=1` — pass (scoped, KHÔNG full suite).
2. `npx tsc --noEmit` — sạch.
3. Grep hygiene: mọi `grep -c` dùng `grep -v '^#' | grep -c token` nếu đếm comment; ở đây dùng `! grep -rnE` trên file cụ thể nên không đếm header prose.
4. `git diff --name-only` — KHÔNG chứa 4 file bị loại trừ, không chứa `.claude/worktrees/*`, không chứa `tokens.ts` palette diff (chỉ 4 dòng diff var mới).
5. Chrome audit Task 5 — blocking human checkpoint, có screenshot/mô tả từng màn hình.
</verification>

<success_criteria>
- `src/styles/tokens.ts`: mọi hex cũ byte-identical; chỉ thêm 4 biến diff ở cả 2 mode; canary test pass.
- ~55 file control hết hardcode theo bảng RESEARCH; dark detection dùng `useThemeMode()`; accent cũ `#3871e1` biến mất.
- CR badge D-17, brand SVG, white-on-swatch, file-type labels, GraphEvidenceDrawer — nguyên vẹn.
- Chrome dark verify đạt 9 bước, `--accent = #6a9bff`, diff add/del đúng nền dark; file CHROME-AUDIT.md có kết quả.
- Scoped tests + `tsc --noEmit` pass; không full vitest; không commit/push trong plan; làm trên `pre-v1.6-baseline`, không worktree/branch mới.
</success_criteria>

<output>
Create `.planning/quick/261124-vps-r-so-t-dark-theme-gi-palette-49-ui-spec-/261124-vps-SUMMARY.md` when done
</output>
