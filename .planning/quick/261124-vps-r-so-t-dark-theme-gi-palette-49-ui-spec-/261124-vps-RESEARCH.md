# Quick 261124-vps — Rà soát dark theme (giữ palette 49-UI-SPEC)

**Researched:** 2026-11-24
**Domain:** Dark-mode CSS/AntD token audit — TaskMate IntelliJ workbench (Tauri)
**Confidence:** HIGH (mọi dòng vi phạm đều lấy từ grep/codebase; palette lock từ 49-UI-SPEC)

## Summary

Palette dark đã lock trong `src/styles/tokens.ts` (`darkTokens.antd` + `darkTokens.css`) và được đưa vào DOM bởi `applyCssVariables()` trong `AntdThemeAdapter.tsx` — cả trên wrapper `.taskmate-workbench-theme` lẫn `document.documentElement` (portals Modal/Drawer/Dropdown/Find cũng thừa hưởng). Không cần đổi một hex nào trong `tokens.ts`; nhiệm vụ là dọn các chỗ view/CSS tự hardcode nền sáng, chữ tối, border sáng hoặc tự đoán dark mode bằng hex sniffing.

Vi phạm tập trung ở 4 nhóm: (1) Command Palette dùng `#fff/#fafafa/#e6f4ff/#f0f0f0/#d9d9d9` trực tiếp; (2) Settings cards dùng `rgba(0,0,0,.02/.08/.15)` và `#f0f0f0`; (3) màn hình Notes/DocEditor dùng nền `#fafafa/#f0f0f0/#fef3c7`, chữ `#262626/#374151/#595959`; (4) `coding-zone.css` dùng 6 biến `--diff-*-bg/fg` **không tồn tại trong tokens.ts**, nên fallback light luôn thắng dù dark mode. Ngoài ra `RemoteFileViewer.tsx:48` so sánh `colorBgBase === '#141414'` trong khi dark token thật là `#11151d` — dark detection sai.

**Primary recommendation:** Giữ nguyên `src/styles/tokens.ts`, thay mọi hardcode bằng `var(--...)` đã có (ưu tiên) hoặc `useAntdToken()`/`statusColorMap` (khi cần giá trị trong JS), và xóa hẳn hex sniffing bằng `useThemeMode()`. Không đụng 4 file đang có session refactor khác (xem Project Constraints).

## Project Constraints (from CLAUDE.md)

- Mọi thảo luận/trao đổi tiếng Việt; xưng "sếp", dùng "tôi"; mã nguồn/đường dẫn/lệnh giữ nguyên.
- Runtime: Tauri là runtime chính và duy nhất được hỗ trợ; PWA/GitHub Pages **out of scope**, không thêm/sửa/validate trừ khi được yêu cầu rõ.
- Persistence: IndexedDB/Dexie là store chuẩn; không thêm backend, không dùng localStorage làm DB.
- Identifiers: `crypto.randomUUID()`; không thêm package `uuid`.
- UI: Ant Design; controls phải qua wrapper `src/components/ui/*`, không bare import runtime `theme` từ `antd`.
- Data safety: backup import phải validate + xác nhận trước khi thay dữ liệu local.
- Anti-Loop: đọc 1 lần phạm vi rộng, không re-read cùng đoạn; Single Read trước Edit.
- GSD workflow: mọi sửa code đi qua `/gsd-quick` hoặc `/gsd-execute-phase`, không edit trực tiếp ngoài workflow.
- Review: review diff + verify UI trong Chrome sau mỗi thay đổi.
- Test: **không chạy full vitest** (trên 1 giờ); luôn pass scoped paths.
- Không band-aid: sửa tại state owner, không vá triệu chứng.

### Workspace exclusions (bắt buộc)
Không đụng, không đề xuất sửa, không mở worktree khác, không `git checkout/reset`, không xoá branch/worktree:
- `src/components/knowledge/DocumentSetForm.tsx`
- `src/workbench/DocSetLibrary.tsx`
- `src/workbench/DocumentSetDetail.tsx`
- `src/workbench/__tests__/DocumentSetDetailPublished.test.tsx`
- `.planning/quick/261124-udx-*/`
- `.claude/worktrees/*`

`git status --short` sạch tại thời điểm research `[VERIFIED: git status]`.

## Phase Requirements (quick task)

| ID | Yêu cầu | Research support |
|----|---------|------------------|
| R1 | List CSS var token có sẵn cho dark + quy ứng dụng | `tokens.ts:138-288`, `AntdThemeAdapter.tsx:14-16`, mục "Token Map" |
| R2 | Grep/rank hardcode màu sáng/sai token trong src | Mục "Ranked Violations" + "Full file index" |
| R3 | Pattern có sẵn trong repo để reuse | Mục "Reuse Patterns" |
| R4 | Xác định chạy Chrome/dev server thế nào (chỉ đọc) | Mục "Environment Availability" |
| R5 | Không đổi palette, không đụng file bị loại trừ | Mục Project Constraints + "Non-goals" |

## Non-goals

- Không sửa hex trong `src/styles/tokens.ts`, `.planning/phases/49-*/49-UI-SPEC.md`, `workbench-tokens.css` structural aliases.
- Không thêm package; không chạy `npm install`, không chạy server, không tự sửa code.
- Không đụng file bị loại trừ ở trên (kể cả khi grep thấy hardcoded trong `DocumentSetForm.tsx` — có 2 dòng `useAntdToken` + dòng 80 nhưng research không đề xuất sửa).

## Token Map (dark mode)

Nguồn: `src/styles/tokens.ts:214-288`; apply tại `AntdThemeAdapter.tsx:14-16` `[VERIFIED: codebase grep]`.

### Antd tokens (`getAntdTheme(mode)` → ConfigProvider)
| Token | Dark value | Dùng cho |
|-------|-----------|----------|
| `colorBgBase` | `#11151d` | frame/backdrop |
| `colorBgContainer` | `#171d27` | card/table/input container |
| `colorBgElevated` | `#1c2330` | popup/menu/drawer |
| `colorBorder` / `colorBorderSecondary` | `#2c3646` / `#3d4a5f` | border thường/đậm |
| `colorText` / `colorTextSecondary` / `colorTextTertiary` | `#e6ebf5` / `#9aa8bd` / `#9aa8bd` | chữ |
| `colorPrimary` / `colorPrimaryHover` | `#6a9bff` / `#8db2ff` | accent |
| `colorInfo` | `#22d3ee` | info |

### CSS custom properties (được inject cả lên wrapper lẫn `document.documentElement`)
| Nhóm | Biến | Dark value |
|------|------|-----------|
| Nền | `--bg-frame`, `--bg-app`, `--bg-island`, `--bg-elev`, `--bg-popup`, `--bg-floating-toolbar` | `#11151d`, `#171d27`, `#1c2330`, `#171d27`, `#1c2330`, `#1c2330` |
| Nền tương tác | `--bg-hover`, `--bg-selected`, `--bg-selected-strong`, `--bg-current-line`, `--bg-backdrop`, `--bg-input` | `#232c3b`, `#1e3156`, `#27406e`, `#1e3156`, `#11151d`, `#111720` |
| Border | `--border`, `--border-strong`, `--border-popup`, `--border-window`, `--control-off` | `#2c3646`, `#3d4a5f`, `#3d4a5f`, `#3d4a5f`, `#4a566b` |
| Chữ | `--fg`, `--fg-strong`, `--fg-secondary`, `--fg-muted`, `--fg-subtle`, `--fg-faint`, `--fg-icon` | `#e6ebf5`, `#f4f7fb`, `#9aa8bd`, `#9aa8bd`, `#9aa8bd`, `#71819a`, `#9aa8bd` |
| Accent/link | `--accent`, `--accent-hover`, `--accent-soft`, `--accent-fg`, `--link`, `--link-hover` | `#6a9bff`, `#8db2ff`, `#1e3156`, `#071224`, `#6a9bff`, `#8db2ff` |
| Surface | `--bg`, `--surface`, `--surface-strong`, `--surface-sunken` | `#11151d`, `#171d27`, `#1c2330`, `#111720` |
| Status | `--success`, `--warning`, `--danger`, `--info` | `#4ade80`, `#e8a13a`, `#ff8289`, `#22d3ee` |
| File status | `--status-untracked`, `--status-added`, `--status-deleted`, `--status-modified` + `-bg` | map dark từ `fileStatusMap.dark` |
| Khác | `--match`, `--match-ink`, `--shadow`, `--find-shadow` | `#a97c16`, `#fff8e1`, shadow dark |

**Quy ứng dụng:** CSS/inline style dùng `var(--token, fallback-light)` (fallback chỉ để debug; token luôn được inject nên fallback không bao giờ thắng trong app) `[VERIFIED: codebase grep]`; JS cần giá trị thì `useAntdToken()` từ `../components/ui` (không import `theme` từ `antd` — GUARD-01/49-UI-SPEC D-01); status dùng `statusColorMap[mode]` từ tokens.ts. Portals Modal/Drawer/Dropdown/Find nằm ở `<body>` vẫn đọc được vars nhờ vòng lặp `roots = [target, document.documentElement]` trong `applyCssVariables` `[CITED: src/styles/tokens.ts:333-345]`.

### Biến bị gọi nhưng KHÔNG được định nghĩa (fallback light luôn thắng)
`[VERIFIED: codebase grep — có usage, không có định nghĩa trong src]`
- `--fg-default`: `workbench-tokens.css:220` → fallback `#262626`.
- `--fg-primary`: `RemoteFileViewer.tsx:437` → fallback `#1f2328`.
- `--diff-add-bg/-fg`, `--diff-del-bg/-fg`: `coding-zone.css:181-184` → fallback `#e6ffed/#1a6b34`, `#ffeef0/#a3272e` **trong cả 2 mode**.
- `--fg-muted` có định nghĩa (`#9aa8bd`) nên fallback `#8c8c8c` ở `workbench-tokens.css:207` là vô hại; giữ nguyên hoặc dọn sau.
- `--bg-input`, `--surface-sunken` có định nghĩa đầy đủ trong tokens.ts — không phải lỗi.

## Ranked Violations

Severity: **critical** = nền sáng/chữ tối lệch hẳn trong dark; **major** = sai token accent/status hoặc dark detection sai; **minor** = fallback/dead color, không lệch visually nhưng nên dọn.

Mọi dòng dưới đây `[VERIFIED: codebase grep]`. Đã loại trừ 4 file session khác và `tokens.ts` (nguồn).

### Critical — nền/trường văn bản sáng trong dark

| File | Dòng | Hardcode | Thay bằng |
|------|------|----------|-----------|
| `src/components/palette/CommandPaletteModal.tsx` | 510, 512, 546, 548, 591, 593, 630, 637, 640, 646, 652 | `#fafafa`, `#f0f0f0`, `#d9d9d9`, `#fff`, `#e6f4ff` | `--bg-island`/`--bg-elev`, `--border`/`--border-strong`, `--accent-soft`, `--bg-hover` |
| `src/views/ChangeRequestsView.tsx` | 146, 148, 159, 177 | `#f9f9fb`, `#e9eaee`, `#595959` | `--bg-elev`, `--border`, `--fg-secondary` |
| `src/components/tasks/TaskTable.tsx` | 51-52 (map) | `#52c41a`, `#faad14` cho CR type | xem Open Question Q1 — không tự đổi hex CR badge |
| `src/views/ChangeRequestDetailView.tsx` | 30-31, 368, 371 | `#52c41a`, `#faad14`, `#d1d3d9` | CR badge giữ nguyên theo D-17; `#d1d3d9` → `--border-strong` |
| `src/components/systems/SystemTable.tsx` | 104-106 | `#f9f0ff`, `#e6fffb`, `#d3adf7`, `#87e8de`, `#722ed1`, `#08979c` | `--accent-soft`, `--info`, `--border`; giữ glyph icon nếu cần |
| `src/components/settings/GitHubConfigCard.tsx` | 191, 193, 229, 231 | `rgba(0,0,0,0.02)`, `rgba(0,0,0,0.08)` | `--bg-elev`, `--border` |
| `src/components/settings/JiraConfigCard.tsx` | 374, 376 | `rgba(0,0,0,0.02)`, `rgba(0,0,0,0.08)` | `--bg-elev`, `--border` |
| `src/components/settings/NineRouterConfigCard.tsx` | 558 | `#f0f0f0` | `--border` |
| `src/components/settings/WeeklyCapacityForm.tsx` | 82 | `#f0f0f0` | `--border` |
| `src/components/settings/SystemTypeOptionsCard.tsx` | 136 | `rgba(0,0,0,0.15)` | `--border-strong` |
| `src/views/SettingsView.tsx` | 209 | `#ff4d4f` | `var(--danger)` |
| `src/components/notes/DocFolderTree.tsx` | 441-442, 613, 643, 811-812 | `#e0e7ff`, `#3730a3`, `#374151`, `#262626`, `#fef3c7`, `#92400e`, `#f0f0f0` | `--accent-soft`, `--accent`, `--fg`, `--warning`/`--warning-bg`, `--bg-hover` |
| `src/components/notes/DocEditorPane.tsx` | 581, 626-627, 853 | `#595959`, `#f0f0f0`, `#fafafa`, `#1f1f1f` | `--fg-secondary`, `--border`, `--bg-elev`, `--fg` |
| `src/components/notes/DocFolderContentsView.tsx` | 92-93, 140, 179, 192-193, 199 | `#f0f0f0`, `#fafafa`, `#1f2937`, `#374151`, `#e5e7eb`, `#fefce8` | `--border`, `--bg-elev`, `--fg`, `--fg-secondary`, `--fg-strong` |
| `src/components/notes/DocListPane.tsx` | 191-192, 205-216, 267-268 | `#fafafa`, `#f0f0f0`, `#fef3c7`, `#fde68a`, `#92400e`, `#d97706` | `--bg-elev`, `--border`, `--warning`/`--warning-bg` |
| `src/components/notes/QuickPreviewDrawer.tsx` | 109, 358-359, 463-464, 474-475, 497-500 | `#ffe58f`, `#000`, `#fafafa`, `#595959`, `#d9d9d9`, `#f0f0f0`, `#e6f4ff`, `#0958d9` | `--match`/`--match-ink`, `--bg-elev`, `--fg-secondary`, `--border`, `--accent-soft`, `--accent` |
| `src/components/notes/NormalizeDocModal.tsx` | 239, 247-248, 251, 263, 277, 285-286 | `#e5e7eb`, `#f3f4f6`, `#4b5563`, `#fafafa`, `#bae6fd`, `#f0f9ff` | `--border`, `--bg-elev`, `--fg-secondary`, `--info`-family CSS var |
| `src/components/notes/NoteEditor.tsx` | 281, 285 | `#d9d9d9`, `#fafafa` | `--border-strong`, `--bg-elev` |
| `src/components/notes/QuickNoteEntry.tsx` | 136-137, 167 | `#d9d9d9`, `#fafafa`, `#f0f0f0` | `--border-strong`, `--bg-elev`, `--border` |
| `src/components/notes/NoteAttachmentsPanel.tsx` | 212, 296 | `#f5f5f5` | `--bg-elev` |
| `src/components/notes/BacklinksSection.tsx` | 36 | `#f0f0f0` | `--border` |
| `src/components/notes/DocsLibraryActions.tsx` | 241 | `#fafafa` | `--bg-elev` |
| `src/components/notes/EntityNotesSection.tsx` | 146, 231 | `#f0f7ff`, `#fff`, `#434343` | `--accent-soft`, `--bg-island`, `--fg-secondary` |
| `src/components/notes/ZipImportPreviewModal.tsx` | 408, 410, 561 | `#f8fafc`, `#e2e8f0`, `#f0f0f0` | `--bg-elev`, `--border`, `--border` |
| `src/views/NotesView.tsx` | 663, 755, 758 | `#f0f0f0`, `#d1d5db`, `#374151` | `--border`, `--fg-faint`, `--fg` |
| `src/views/NotesPopoutView.tsx` | 394, 485 | `#fafcff`, `#fff`, `#434343` | `--accent-soft`, `--bg-island`, `--fg-secondary` |
| `src/styles/markdown.css` | 145, 284, 293-294, 300, 310-322 | `#1677ff`, `#f3e8ff`, `#7e22ce`, `#e9d5ff`, `#6b21a8` | `--accent`, `--accent-soft`, `--fg` (wiki chip) |
| `src/styles/coding-zone.css` | 181-184 | `--diff-*-bg/fg` fallback `#e6ffed/#1a6b34`, `#ffeef0/#a3272e` | định nghĩa biến mới trong `tokens.ts` (dark/light) rồi giữ `var(--diff-*, ...)` |
| `src/styles/coding-zone.css` | 101 | `color: #fff` trên `var(--danger)` | `--accent-fg` hoặc token chữ trên danger |

**Không phải lỗi dark mode (để lại):** SVG gradient/stroke cố định trong `JetBrainsIcons.tsx` (màu icon thương hiệu, dùng cả 2 mode); nhãn màu file-type `#d24726/#185abd/#0969da/...` trong `ChatMessageBubble.tsx:1082-1123` (màu nhận diện định danh file); `SystemTypeOptionsCard.tsx:271` `#8c8c8c` là placeholder ví dụ cho người dùng; `ChatMessageBubble.tsx:168-228` `#ffffff` trên nền swatch màu (có comment `ponytail: fixed white on colored swatch`).

### Major — sai token/sai dark detection

| File | Dòng | Vấn đề | Fix |
|------|------|--------|-----|
| `src/workbench/editor/RemoteFileViewer.tsx` | 48 | `token.colorBgBase === '#141414' \|\| token.colorTextBase?.includes('255')`; dark token thật `#11151d` → `isDark === false` trong dark | Dùng `useThemeMode().mode === 'dark'` hoặc `document.documentElement.dataset.theme` |
| `src/views/MermaidAssistantView.tsx` | 142-144 | Đoán dark bằng parseInt hex `colorBgContainer`; đang trúng nhờ `#171d27` nhưng rất dễ vỡ khi đổi palette | Dùng `useThemeMode()`; xóa cast `(token as any)` |
| `src/views/MermaidAssistantView.tsx` | 773 | `backgroundColor: isDark ? '#141414' : '#fafafa'` — hex không thuộc palette đã lock | `token.colorBgContainer` hoặc `var(--bg-elev)` |
| `src/components/settings/GlobalConventionsCard.tsx` | 98, 176 | `#3871e1` — accent cũ, không phải `#2f62d8`/`#6a9bff` | `var(--accent)` / `token.colorPrimary` |
| `src/views/ChangeRequestsView.tsx` | 131 | `#3871e1` accent cũ | `var(--accent)` |
| `src/views/ItemInsightView.tsx` | 62-63, 509, 797, 877 | CR map rời + `#13c2c2`, `#10b981` cố định | `statusColorMap`/`var(--info)`/`var(--success)` |
| `src/views/SystemDetailView.tsx` | 34-35, 103-105 | map CR/status rời, cùng hex light ở dark | `statusColorMap`/`var(--success)`/`var(--warning)`/`var(--danger)` |
| `src/components/notifications/NotificationItemRow.tsx` | 54, 72, 78, 107, 109, 140, 155 | `#52c41a`, `#fa8c16`, `#722ed1`, `#f0f0f0`, `#262626` | `var(--success)`, `var(--warning)`, `var(--border)`, `var(--fg)` |
| `src/components/notifications/NotificationDrawer.tsx` | 102 | `#ff4d4f`/`#d9d9d9` badge | `var(--danger)`/`var(--control-off)` |
| `src/components/notifications/NotificationBell.tsx` | 16 | `#ff4d4f` | `var(--danger)` |
| `src/components/ai/ChatInputBar.tsx` | 39-75, 639, 691, 782 | icon command màu light cố định | `var(--danger)`, `var(--success)`, `var(--warning)`, `var(--info)` |
| `src/components/palette/CommandPaletteModal.tsx` | 96-306 | icon category màu cố định | `statusColorMap`/CSS var tương ứng |
| `src/components/agents/AgentControlView.tsx` | 186, 309-310, 341-342, 349, 402, 408 | nền sáng `#1e1e1e`, `#f8fafc`, `#fafafa`, chữ `#374151`, `#9ca3af` | `token.colorBgContainer`, `var(--bg-elev)`, `var(--fg-secondary)`; `#1e1e1e` là terminal — giữ nếu cố ý |
| `src/views/TelegramMonitorView.tsx` | 481-528, 587, 680-705, 924-942, 342 | nền `#f8fafc`, border `#e2e8f0`, chữ `#1e293b/#0f172a/#334155` | `var(--bg-elev)`, `var(--border)`, `var(--fg)`; màu trạng thái dùng status vars |
| `src/components/settings/BudgetWarnThresholdCard.tsx`, `GitHubConflictModal.tsx` | 68 / 54 | `#faad14` | `var(--warning)` |
| `src/components/settings/StoragePersistenceCard.tsx` | 80 | `#faad14` | `var(--warning)` |
| `src/components/tasks/TaskDrawerPlanning.tsx` | 301 | `#fa8c16`/`#52c41a` | `var(--warning)`/`var(--success)` |
| `src/components/knowledge/GraphEvidenceDrawer.tsx` | 304 | `#fff1f0`/`#fffbe6` conflict branch backgrounds | token bg phù hợp — **chỉ research, KHÔNG sửa** nếu nằm trong file bị loại trừ? File này KHÔNG bị loại trừ; nhưng thuộc session docs/refactor liên quan — để planner quyết định, ưu tiên bỏ qua trong quick này |

### Minor — fallback không bao giờ dùng / cần dọn khi tiện
- `src/components/ui/ui-tokens.css:110-176` và `src/styles/workbench-tokens.css:403-421`: mọi hardcode nằm sau `var(--..., light-hex)`. Vì `applyCssVariables` luôn inject token, fallback là dead value. Không bắt buộc sửa trong quick này; nếu dọn thì bỏ fallback để tránh nhầm lần sau.
- `src/components/ai/ChatMessageBubble.tsx:512-513`: `token.colorPrimaryBg ?? '#e6f4ff'` / `token.colorPrimaryBorder ?? '#91caff'` — token AntD luôn tồn tại; vô hại.
- `src/views/TelegramMonitorView.tsx:639`, `src/components/notifications/*`: badge AntD `count` backgroundColor cố định — cần pass `color` từ theme.

## Reuse Patterns

1. **`var(--token, light-fallback)` trực tiếp trong `style={{...}}`** — pattern phổ biến nhất, đã dùng ở `StaffDetailView.tsx:167/192/197`, `AiOfficeView.tsx:161`, `SystemCatalogView.tsx:134/170/184`, `SystemModal.tsx:244-245/258`, `ChangeRequestDetailView.tsx:267/327/420`, `workbench/editor/*.tsx`, hầu hết `workbench/toolwindows/*`. Đây là mục tiêu sửa cho Command Palette / Settings / Notes hardcode. `[VERIFIED: codebase grep]`
2. **`useAntdToken()` từ `../components/ui`** — helper officially sanctioned (`antdTheme.ts:11-16`, export ở `ui/index.ts:104`), dùng ở 52 file (AgentDiffReviewer, AgentSessionList, ChatMessageBubble, ChatInputBar, TaskFilterBar, AIPopoutView, PlannerView…). Dùng khi style cần giá trị AntD dynamic (`token.colorBgContainer`, `token.colorBorderSecondary`, `token.colorTextSecondary`). Tuyệt đối không import `theme` từ `antd` ngoài `antdTheme.ts`. `[VERIFIED: codebase grep]`
3. **`useThemeMode()`** — `src/hooks/useThemeMode.ts`, đọc `localStorage['taskmate_theme']` → media query, broadcast qua `themeBroadcast.ts`, có sẵn test `src/hooks/__tests__/themeBroadcast.test.ts`. Đây là nguồn đúng thay cho hex sniffing ở `RemoteFileViewer.tsx:48` và `MermaidAssistantView.tsx:142-144`. `[VERIFIED: codebase grep]`
4. **`statusColorMap` / `fileStatusMap` từ `tokens.ts`** — map D-12 đã có cả 2 mode; CR type badge light map nằm ở `49-UI-SPEC.md:119`. `[CITED: .planning/phases/49-*/49-UI-SPEC.md]`
5. **`ui-tool-btn*` class** — `ui-tokens.css:108-177` đã xử lý toàn bộ hover/focus/press/disabled cho button; không tự thêm style màu riêng cho control.
6. **Test canary hiện có** — `src/components/ui/__tests__/tokens.test.ts` so sánh từng field `getAntdTheme(mode)` với `lightTokens/darkTokens`, chặn palette drift và duplicate hex trong `workbench-tokens.css`. Không chỉnh test này trừ khi thêm var mới (khi đó thêm assertion cho var mới).

## Full file index (đã grep, nhóm theo màn hình)

- **Common controls:** `src/components/ui/ui-tokens.css`, `src/components/ui/button.tsx`, `src/components/ui/input.tsx`, `src/components/ui/table.tsx`, `src/components/ui/tag.tsx`, `src/components/ui/tooltip.tsx`, `src/components/ui/dropdown.tsx`, `src/components/ui/modal.tsx`, `src/components/ui/drawer.tsx` — wrapper đã dùng token; hardcode nằm ở CSS fallback, không phải view.
- **Settings:** `src/views/SettingsView.tsx`, `src/components/settings/GitHubConfigCard.tsx`, `JiraConfigCard.tsx`, `NineRouterConfigCard.tsx`, `WeeklyCapacityForm.tsx`, `SystemTypeOptionsCard.tsx`, `GlobalConventionsCard.tsx`, `StoragePersistenceCard.tsx`, `BudgetWarnThresholdCard.tsx`, `GitHubConflictModal.tsx`.
- **Systems/CR:** `src/views/SystemCatalogView.tsx`, `SystemDetailView.tsx`, `ChangeRequestsView.tsx`, `ChangeRequestDetailView.tsx`, `src/components/systems/SystemTable.tsx`, `SystemModal.tsx`, `src/components/tasks/TaskTable.tsx`, `src/views/ItemInsightView.tsx`.
- **AI chat:** `src/components/ai/ChatMessageBubble.tsx`, `ChatInputBar.tsx`, `ChatHeader.tsx`, `AIChatDrawer.tsx`, `src/views/AIPopoutView.tsx` — phần lớn đã dùng `useAntdToken`; còn lại là icon category.
- **Docs/doc-set (không đụng file bị loại trừ):** `src/components/notes/DocFolderTree.tsx`, `DocEditorPane.tsx`, `DocListPane.tsx`, `DocFolderContentsView.tsx`, `DocOutlineToC.tsx`, `QuickPreviewDrawer.tsx`, `NormalizeDocModal.tsx`, `NoteAttachmentsPanel.tsx`, `NoteEditor.tsx`, `QuickNoteEntry.tsx`, `EntityNotesSection.tsx`, `ZipImportPreviewModal.tsx`, `src/views/NotesView.tsx`, `NotesPopoutView.tsx`.
- **Editor/workbench:** `src/workbench/editor/RemoteFileViewer.tsx`, `OracleSqlComposer.tsx`, `OracleObjectViewer.tsx`, `src/styles/coding-zone.css`, `src/styles/markdown.css`, `src/views/MermaidAssistantView.tsx`.

## Don't Hand-Roll

| Problem | Don't build | Use instead |
|---------|-------------|-------------|
| Đổi palette light/dark | Custom CSS `:root[data-theme]` riêng trong từng view | `tokens.ts` + `applyCssVariables()` |
| Đọc màu AntD trong JS | `import { theme } from 'antd'` ở view | `useAntdToken()` từ `components/ui` |
| Biết đang dark hay light | So sánh hex `colorBgBase`/parseInt | `useThemeMode().mode` |
| Status/badge màu | Map `#52c41a/#faad14` rời ở mỗi view | `statusColorMap` + `--success/--warning/--danger` |
| Diff add/del màu | Hardcode `#e6ffed/#ffeef0` | Thêm 4 biến `--diff-*` vào `tokens.ts` (cả 2 mode), giữ `var()` trong CSS |
| Service worker/PWA | — | Out of scope per CLAUDE.md |

## Common Pitfalls

1. **Fallback light lọt vào dark.** `var(--x, #fafafa)` chỉ an toàn khi `--x` thật sự được inject. Với `--fg-default`, `--fg-primary`, `--diff-*` hiện không có định nghĩa → fallback thắng mọi lúc. Kiểm tra định nghĩa trước khi tin fallback.
2. **Hex sniffing nhầm mode.** `colorBgBase === '#141414'` (`RemoteFileViewer.tsx:48`) sai vì dark token là `#11151d`. Đổi palette là lỗi ngay lập tức. Dùng `useThemeMode()`.
3. **Portal thoát wrapper.** Modal/Drawer/Dropdown/Find append vào `<body>`; nếu chỉ set CSS var trên wrapper thì portal vẫn light. `applyCssVariables` đã set cả `document.documentElement` — đừng bỏ vòng lặp `roots`.
4. **Đổi nhầm hex bị lock.** 49-UI-SPEC khóa từng hex; chỉ đổi chỗ dùng (token reference), không đổi giá trị trong `tokens.ts`.
5. **CR badge map rời.** D-17/D-32 gán hex cho CR type; D-12 lại muốn gom về `statusColorMap`. Đây là mâu thuẫn cần quyết định — xem Open Question Q1; quick này không đổi map CR.
6. **Sửa file đang có session khác.** 4 file doc-set đang được refactor 261124-udx/sav; phải loại khỏi plan dù grep thấy hardcode.
7. **Full vitest.** Chạy full suite > 1 giờ; chỉ chạy scoped paths (`package.json:24` `test:foundation` hoặc từng file cụ thể).

## Code Examples

Pattern chuẩn đã có trong repo `[VERIFIED: codebase grep]`:

```tsx
// src/views/StaffDetailView.tsx:192 — CSS var cho border/chữ
borderBottom: '1px solid var(--border, #e9eaee)',
color: 'var(--fg-secondary, #5f6269)',
```

```tsx
// src/components/agents/AgentSessionList.tsx:142-143 — AntD token khi cần giá trị JS
borderColor: isSelected ? 'var(--accent)' : token.colorBorderSecondary,
backgroundColor: isSelected ? token.colorFillAlter : token.colorBgContainer,
```

```tsx
// src/hooks/useThemeMode.ts:72-92 — nguồn mode đúng (thay hex sniffing)
const { mode } = useThemeMode();
```

```ts
// src/styles/tokens.ts:338-345 — portals thừa hưởng CSS vars
const roots = [target, document.documentElement];
for (const [name, value] of Object.entries(tokens.css)) {
  for (const root of roots) root.style.setProperty(name, value);
}
```

## State of the Art

| Old | Current | Changed | Impact |
|-----|---------|---------|--------|
| Palette hardcoded trong `workbench-tokens.css` `:root[data-theme]` | `tokens.ts` single source + `applyCssVariables` | Phase 49 (2026-11) | Mọi màu phải đi qua token; test `tokens.test.ts` chặn drift |
| View import `theme` từ `antd` | `useAntdToken()` wrapper | Phase 50 | GUARD-01; không bare import |
| Mỗi consumer tự subscribe theme broadcast | `useThemeMode` shared subscription | 2026-11 | Tránh nhiều IPC listener làm stall renderer Tauri |

## Assumptions Log

| # | Claim | Section | Risk if wrong |
|---|-------|---------|---------------|
| A1 | `rgba(0,0,0,.02/.08)` trong Settings cards là lỗi dark mode, không phải ý đồ thiết kế | Ranked Violations | Thấp — nền đen 2% trên `#171d27` gần như vô hình, border 8% đen không đúng `--border` dark |
| A2 | Màu icon file-type/SVG brand là cố ý, không nên tokenize | Non-goals | Thấp — đổi sẽ mất nhận diện icon |

Không có claim `[ASSUMED]` khác; mọi file/line đều verify bằng grep trong session này.

## Open Questions

1. **CR type badge hex conflict.** 49-UI-SPEC D-17 + `STATE` D-17 lock `#1677ff/#52c41a/#faad14`; D-12/status map muốn mọi màu sinh từ `tokens.ts` (`--success` dark = `#4ade80`). Hành động: giữ nguyên hex badge CR (không đổi palette), chỉ dọn nền/border xung quanh; nếu sếp muốn badge đổi theo mode thì cần quyết định riêng, không nằm trong quick này.
2. **Có sửa `GraphEvidenceDrawer.tsx:304` (`#fff1f0/#fffbe6`) không?** Không nằm trong 4 file bị loại trừ nhưng thuộc luồng docs đang refactor. Recommend: để planner đưa vào nhóm "optional", mặc định bỏ qua để tránh conflict session.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node/npm | `npm run dev` | ✓ (dev server đang chạy) | Node 24 LTS theo CLAUDE.md | — |
| Vite dev server | Chrome verify | ✓ PID 61137, TCP `[::1]:5173` LISTEN `[VERIFIED: lsof]` | Vite 8.3.1 (`package.json:81`) | `npm run dev` (script `vite`, `strictPort: true`) |
| Chrome | Visual verify | Cần sếp tự mở | — | Không thay bằng jsdom; jsdom không render CSS var |
| Tauri CLI | Runtime đích | ✓ dependency `@tauri-apps/cli` | ^2.2.0 | Verify bằng browser trước, Tauri sau nếu cần |
| Docker/knowledge stack | Không liên quan | — | — | Không khởi động |

Cấu hình dev `[VERIFIED: codebase grep]`: `vite.config.ts:9-15` — `base` là `/task-management/` khi không có `TAURI_ENV_PLATFORM/TAURI_PLATFORM`, `/` khi Tauri; `server.port = 5173`, `strictPort: true`.

**KHÔNG chạy server lúc này** — theo yêu cầu. Chrome verify diễn ra sau khi planner/executor áp fix.

### Cách verify bằng Chrome (sau khi sửa — chỉ đọc hôm nay)
1. Trình duyệt mở `http://localhost:5173/#/notes` (base `/task-management/` nếu phục từ subpath; với dev server thường root `/`).
2. Toggle theme ở TitleBar: icon Moon/Sun, `aria-label="Chuyển đổi giao diện sáng/tối"` (`TitleBar.tsx:310-318`). Hoặc set `localStorage['taskmate_theme'] = 'dark'` rồi reload (key `themeBroadcast.ts:20`).
3. Đi lần lượt: Command Palette (`Ctrl/Cmd+K`), Settings (các card GitHub/Jira/NineRouter/Weekly/SystemType), Systems, CR list + CR detail, AI chat + AI popout (`#/ai-popout`), Notes/DocEditor/DocFolderTree, Coding Zone (diff add/del), Markdown render (wiki-link chip).
4. Kiểm tra visually: không còn nền trắng/kem, chữ tối, border sáng; diff add/del có nền dark; selected row dùng `--accent-soft`.
5. DevTools `getComputedStyle(el).getPropertyValue('--accent')` phải trả `#6a9bff` ở dark; nếu trả fallback `#...` thì biến chưa được inject.
6. Review diff trước khi verify per CLAUDE.md/memory.

## Validation Architecture

`workflow.nyquist_validation = true` trong `.planning/config.json:20` → include section.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.2 + jsdom (`vite.config.ts:17-29`) |
| Config file | `vite.config.ts` (`test` block) |
| Quick run command | `npx vitest run src/components/ui/__tests__/tokens.test.ts src/workbench/__tests__/AntdThemeAdapter.test.tsx src/hooks/__tests__/themeBroadcast.test.ts --bail=1` |
| Full suite command | `npm test` — **KHÔNG chạy** (memory: > 1 giờ) |

### Requirements → Test Map
| Req | Behavior | Test type | Automated command | File exists? |
|-----|----------|-----------|-------------------|--------------|
| R1 | Token parity light/dark + no duplicate palette hex | unit | `npx vitest run src/components/ui/__tests__/tokens.test.ts --bail=1` | ✅ |
| R1 | CSS vars applied to wrapper + documentElement | unit | `npx vitest run src/workbench/__tests__/AntdThemeAdapter.test.tsx --bail=1` | ✅ |
| R4 | Theme persistence/broadcast | unit | `npx vitest run src/hooks/__tests__/themeBroadcast.test.ts --bail=1` | ✅ |
| R2/R3 | Visual dark-mode correctness | manual Chrome | các bước ở trên | n/a — không có automated CSS snapshot |

### Wave 0 Gaps
- [ ] Nếu thêm 4 biến `--diff-*`, mở rộng `tokens.test.ts` assertion cho cả 2 mode (file đã có sẵn, không tạo file mới).
- [ ] Không có test tự động cho hardcode hex trong view; có thể thêm grep-based canary (tùy planner), nhưng không bắt buộc cho quick này.

## Security Domain

`security_enforcement = true`, ASVS level 1 (`.planning/config.json:42-44`). Quick task là CSS/color-only, không thêm input/crypto/auth.

| ASVS Category | Applies | Standard control |
|---------------|---------|------------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | no | không có input/output boundary mới |
| V6 Cryptography | no | không đụng Web Crypto/token/passphrase |

STRIDE: không có threat pattern mới. Rủi ro duy nhất là regression trực quan làm người dùng bỏ sót nội dung destructive action — mitigate bằng Chrome verify và giữ `--danger` cho destructive. Không lưu secret vào CSS/token (hiện tại không có).

## Package Legitimacy Audit

Không cài package nào. Gate skip (`no new dependencies`). Mọi fix dùng CSS var/token/hook có sẵn; không thêm dependency.

## Sources

### Primary (HIGH confidence — codebase)
- `/Users/tranducquan/Working/Personal/task-management/src/styles/tokens.ts` — palette light/dark, cssMetrics, getAntdTheme, applyCssVariables.
- `/Users/tranducquan/Working/Personal/task-management/src/workbench/AntdThemeAdapter.tsx` — wrapper + documentElement injection.
- `/Users/tranducquan/Working/Personal/task-management/src/components/ui/antdTheme.ts`, `ui/index.ts`, `ui-tokens.css` — useAntdToken export, wrapper policies.
- `/Users/tranducquan/Working/Personal/task-management/src/hooks/useThemeMode.ts`, `src/workbench/themeBroadcast.ts` — mode source.
- `/Users/tranducquan/Working/Personal/task-management/vite.config.ts`, `package.json` — dev server config/scripts.
- `/Users/tranducquan/Working/Personal/task-management/.planning/phases/49-*/49-UI-SPEC.md` — palette lock, D-12/D-17.
- `/Users/tranducquan/Working/Personal/task-management/.claude/skills/sketch-findings-task-management/SKILL.md` — UI đã validate cho doc-set (chỉ tham khảo, không sửa file bị loại trừ).

### Secondary
- `lsof -nP -iTCP:5173 -sTCP:LISTEN` — dev server đang listen.
- `git status --short` — working tree sạch lúc research.

### Tertiary
- Không có.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — mọi token/hook đọc trực tiếp từ source.
- Architecture: HIGH — injection path và portal coverage rõ ràng trong code + UI-SPEC.
- Violations: HIGH — grep file/line cụ thể; đã phân biệt fallback-dead vs real breakage.
- Open questions: MEDIUM — conflict D-17 vs D-12 cần quyết định của sếp.

**Research date:** 2026-11-24
**Valid until:** 30 ngày (palette lock ổn định; mã nguồn có thể đổi sau session refactor doc-set).
