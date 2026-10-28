---
phase: 25
slug: interactive-sdlc-document-wizards
status: approved
shadcn_initialized: false
preset: none
created: 2026-10-28
reviewed_at: 2026-10-28
---

# Phase 25 — UI Design Contract

> Visual and interaction contract for the interactive SDLC document wizards in the AI Chat Drawer. Extends the existing drawer surfaces (`ChatInputBar`, `ChatMessageBubble`, `ChatMessageList`, `MermaidViewer`) with a skill quick bar, a metadata modal, guided gap-fill question cards, a Markdown preview / docx approval card, a change-pack dropzone + confirm modal, versioned `SOLUTION.md` review, and wizard-lifecycle states. No new design system, no new dependencies (`docx@^9.9.0`, `jszip@^3.10.2`, `mermaid` already installed).

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none (shadcn not initialized; project uses Ant Design 6) |
| Preset | not applicable |
| Component library | Ant Design 6.6.5 (`antd`) via `ConfigProvider` in `src/App.tsx` |
| Icon library | `@ant-design/icons` 6.3.4 — import icons individually |
| Font (UI) | `Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif` (App theme token) |
| Font (docx output) | Times New Roman with `eastAsia` fallback — enforced by the `docx` builder only, never for UI chrome |

Theme tokens inherited (`src/App.tsx:29-36`) — never re-declare per component:

- `colorPrimary: #4f46e5`, `colorPrimaryHover: #4338ca`, `colorPrimaryActive: #3730a3`
- `borderRadius: 8`, `controlHeight: 36`
- Dark/light via `useThemeMode()` + `theme.darkAlgorithm` / `theme.defaultAlgorithm`
- All Phase 25 surfaces consume semantics through `theme.useToken()`. No hard-coded hex that collides with dark mode; the only literal hexes allowed are file-type icon colors already in use in `ChatMessageBubble.tsx` (Word `#185abd`, Excel `#107c41`, PPT `#d24726`, Markdown `#0969da`).

Source: `src/App.tsx:29-36`, `24-UI-SPEC.md` Design System, `25-CONTEXT.md` D-03/D-05.

---

## Spacing Scale

Declared values (multiples of 4):

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Skill chip internal gap, badge-to-label gap, table density padding |
| sm | 8px | Chip bar horizontal gap, wizard card row rhythm, preview card inner list spacing |
| md | 16px | Wizard card body padding, metadata modal field gap, section gap in preview card |
| lg | 24px | Gap between wizard question cards, modal content padding, preview section separation |
| xl | 32px | Gap between the wizard progress strip and the first question card |
| 2xl | 48px | Not used in Phase 25 (reserved) |
| 3xl | 64px | Not used in Phase 25 (reserved) |

Exceptions:

- Skill quick bar sits inside `ChatInputBar` whose shell padding is `10px 14px` (existing component, `ChatInputBar.tsx:634-643`). The bar uses `xs`/`sm` interior gaps; it does not restyle the parent padding.
- Chat Drawer minimum width 320px (`MIN_AI_CHAT_WIDTH`), inherited: at drawer width < 384px the metadata modal drops to single-column fields and the chip bar horizontally scrolls instead of wrapping taller than one row.
- Table cells inside the docx preview / drift matrix render at `xs` (4px) vertical padding (data density exception); outer margins stay on the 8/16/24 scale.
- Touch/click targets: chips and icon-only buttons minimum 28px height; primary buttons keep `controlHeight: 36`.

Source: `ChatInputBar.tsx:633-644`, `24-UI-SPEC.md` Spacing, `25-CONTEXT.md` D-05/D-06.

---

## Typography

Exactly four sizes, two weights (400 regular, 600 semibold):

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Label (skill chip text, metadata field labels, wizard step counter, pack meta rows, table headers) | 12px | 600 | 1.4 (17px) |
| Body (question card copy, chat preview Markdown, drift-matrix cell text, helper text) | 14px | 400 | 1.5 (21px) |
| Heading (wizard card title, preview card section heading, modal title, `SOLUTION.md` version label) | 16px | 600 | 1.3 (21px) |
| Display (document preview card title — `Bản thảo PL02`, `Bản thảo PL03`, …) | 20px | 600 | 1.25 (25px) |

Rules:

- Two weights only: 400 and 600. Ant Design `Tag` defaults to 500 — all wizard chips/tags force `fontWeight: 600`.
- Markdown preview body renders through the existing renderer at Body size; headings inside the preview follow the renderer's own scale, but never exceed 20px inside the chat column (Display is the ceiling).
- Mermaid diagrams inside the preview render in `MermaidViewer` unchanged; its own SVG labels are not governed by these tokens.
- Codes, CR IDs, table names, API paths (`MA_CTUD`, `PRC_PROCESS:60000006`) render verbatim in inline `<code>` at 12px on `colorFillTertiary`, `borderRadius: 4`, wrapping — never truncated.
- Vietnamese diacritics preserved exactly everywhere in UI copy.

Source: `24-UI-SPEC.md` Typography, `25-TEMPLATES.md` content-marker conventions, `src/components/ai/ChatMessageBubble.tsx` existing file-card typography (13/11 → normalize to 12/14).

---

## Color

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `colorBgContainer` (`#ffffff` light / `#141414` dark) | Drawer body, wizard card surfaces, modal body, preview card body |
| Secondary (30%) | `colorFillTertiary` (`#f5f5f5` / `#262626`) | Skill chip bar track, metadata modal section bands, code chips, drift-matrix header row, pack meta strip |
| Accent (10%) | `colorPrimary` (`#4f46e5`) | Selected skill chip, `Duyệt & Tải .docx` primary CTA, `Lưu SOLUTION.md` primary CTA, wizard progress active segment, focused dropzone border |
| Destructive | `colorError` (`#ff4d4f` / `#dc4446`) | `Hủy Wizard` confirm, rejected change-pack banner, drift-removal rows (`Chưa làm`), security-baseline `Không` marks |

Semantic status colors (meaning-carrying, not accent):

- `colorInfo` (`#1677ff`) — change-pack accepted confirmation, `SOLUTION.md` v(n) info tag.
- `colorWarning` (`#faad14`) — drift rows `Làm khác`, pack size near the 5MB ceiling, wizard state restored from draft.
- `colorSuccess` (`#52c41a`) — docx saved-as-Note confirmation, pack contents validated, `Đáp ứng: Có` marks.

Accent reserved for (explicit list — nothing else):

1. The active/selected skill chip in the quick bar (one at a time; inactive chips are `default` ghost style).
2. `Duyệt & Tải .docx` primary button on the document preview card.
3. `Lưu SOLUTION.md` primary button on the solution review card.
4. The active segment of the wizard progress strip.
5. Keyboard focus ring on the dropzone and on focusable wizard cards.

Not accent: `Yêu cầu chỉnh sửa thêm` (default button), `Hủy Wizard` (text/danger link), drift-matrix cell colors, pack size chip, version tags, file-type icons. A user must never read a neutral action as "recommended" by color alone.

Source: `src/App.tsx:30-32`, `24-UI-SPEC.md` Color, `25-CONTEXT.md` D-05/D-07/D-08.

---

## Copywriting Contract

All UI copy is Vietnamese (project convention). Technical tokens (CR ID, branch, commit SHA, table/column names, API paths) stay verbatim. Response prose follows the user's query language; codes never translate.

| Element | Copy |
|---------|------|
| Primary CTA (wizard entry chips) | `📋 Soạn PL02` · `⚙️ Soạn PL03` · `🔍 Checklist PL07` · `📢 Tờ trình CAB` (locked labels per D-05; emoji are decorative — each chip carries an `aria-label` with the form name, e.g. `Soạn PL02 — Tài liệu Đặc tả Chức năng`) |
| Primary CTA (document preview card) | `Duyệt & Tải .docx` |
| Secondary CTA (document preview card) | `Yêu cầu chỉnh sửa thêm` |
| Primary CTA (SOLUTION review card) | `Lưu SOLUTION.md` |
| Secondary CTA (SOLUTION review card) | `Yêu cầu chỉnh sửa thêm` |
| Metadata modal title | `Thông tin tài liệu` (subtitle names the target form, e.g. `PL02 — Tài liệu Đặc tả Chức năng`) |
| Metadata modal fields | `Mã dự án/CR` · `Tên tính năng` · `Đơn vị yêu cầu` · `Người lập` · `Ngày lập` |
| Metadata modal submit | `Bắt đầu soạn thảo` |
| Skill bar empty/disabled state (no project scope) | Chips disabled with tooltip `Chọn phạm vi Dự án để dùng wizard tài liệu.` |
| Wizard progress strip | `Bước {n}/{total} · {tên bước}` where steps are `Thu thập`, `Hỏi bù`, `Soát xét`, `Xuất bản` |
| Gap-fill question card title | `Cần làm rõ: {chủ đề}` |
| Gap-fill question card body | `{một đoạn ngắn mô tả khoảng trống phát hiện trong {mục biểu mẫu}, kèm gợi ý giá trị hợp lệ}` |
| Gap-fill answer input placeholder | `Nhập câu trả lời hoặc chọn gợi ý bên dưới` |
| Gap-fill skip | `Bỏ qua mục này` (records the field as omitted, never fabricates) |
| Gap-fill confidence note | `Dựa trên {n} nguồn đã tra cứu: {source titles}` |
| Empty state — no inputs yet | Heading: `Chưa có dữ liệu đầu vào`  Body: `Dán nội dung PL01, chọn tài liệu liên quan hoặc nạp change-pack để bắt đầu.` |
| Empty state — pack-drop for PL03/PL07 | `Kéo thả change-pack.zip vào đây hoặc bấm để chọn tệp.` |
| Empty state — docx history (no generated docs in thread) | `Chưa có tài liệu nào được xuất trong phiên này.` |
| Error — pack too large | `Change-pack vượt quá 5MB. Chạy lại scripts/change-pack.mjs với phạm vi nhỏ hơn rồi nạp lại.` |
| Error — pack contains blocked paths | `Change-pack chứa tệp không được phép: {path1}, {path2}. Loại bỏ node_modules/, *.min.js và package-lock.json rồi nạp lại.` |
| Error — pack missing/invalid meta.json | `Không đọc được meta.json trong change-pack. Kiểm tra lệnh sinh pack và nạp lại.` |
| Error — docx build failure | `Không tạo được tệp .docx. Nội dung Markdown vẫn được giữ trong phiên; thử lại hoặc yêu cầu chỉnh sửa.` |
| Success — docx exported | `Đã tải {filename} và lưu thành tài liệu dự án.` |
| Success — SOLUTION saved | `Đã lưu SOLUTION.md phiên bản v{n} cho dự án {projectName}.` |
| Draft restored notice | `Wizard đang tiếp tục từ bản nháp. Bấm Hủy Wizard để bắt đầu lại.` |
| Change-pack confirm strip | `CR {cr} · Nhánh {branch} · {commitCount} commit · {fileCount} tệp` |
| Change-pack confirm action | `Xác nhận pack` / `Chọn pack khác` |
| Drift matrix heading | `Bảng drift so với SOLUTION.md` (row groups: `Ngoài solution`, `Chưa làm`, `Làm khác`) |
| Drift empty state | `Không phát hiện drift: triển khai khớp với solution đã duyệt.` |
| Destructive confirmation | `Hủy Wizard`: `Hủy phiên wizard? Bản nháp hiện tại vẫn được giữ trong thread và có thể tiếp tục sau.` — actions `Hủy phiên` / `Tiếp tục làm` |
| Destructive confirmation | `Xóa bản nháp wizard`: `Xóa bản nháp wizard khỏi thread? Thao tác này không xóa tài liệu đã xuất.` — actions `Xóa` / `Giữ lại` |

Never: fabricate a missing field, auto-fill a gap the user skipped, translate a code token, or print a network/server error string into the drawer. Only stable, enumerated messages render.

Source: `25-CONTEXT.md` D-05…D-09, D-17, D-21; `22-UI`/`24-UI-SPEC.md` copy conventions; `25-TEMPLATES.md` Vietnamese section names.

---

## Component Inventory (Phase 25)

New under `src/components/ai/wizard/`:

- `WizardSkillBar.tsx` — horizontal chip strip anchored immediately above `ChatInputBar` (rendered by `AIChatDrawer` inside the existing bottom stack). Four chips (labels + emoji per D-05), single-select, disabled when chat scope is not a project. Chips are Ant Design `Button size="small" shape="round"`; selected chip gets `type="primary"` (ghost-free filled accent). Horizontal scroll at narrow drawer width. Keyboard: `Tab` once into the bar, arrow keys move between chips, `Enter`/`Space` activates.
- `WizardMetadataModal.tsx` — Ant Design `Modal` (~520px, single column < 384px drawer width). Five fields (`Mã dự án/CR` required, `Tên tính năng` required, `Đơn vị yêu cầu`, `Người lập` default `Người dùng hiện tại` if configured in Settings, `Ngày lập` default today via `dayjs`, format `DD/MM/YYYY`). Pre-fills from the scoped project (name/code) when available. Footer: `Đóng` (plain) / `Bắt đầu soạn thảo` (primary). Validation inline, one error per field, no toast.
- `WizardProgressStrip.tsx` — 4-segment line above the wizard message group; active segment accent, completed segments `colorSuccess`, pending `colorBorderSecondary`. Screen-reader label carries `Bước n/Tên bước`.
- `GapFillQuestionCard.tsx` — renders inside a normal assistant `ChatMessageBubble` (not a modal): Heading `Cần làm rõ: …`, Body gap description, optional suggestion chips (reuse `ChatInputBar` chip style) that pre-fill the composer, and an inline `Bỏ qua mục này` text button. Multiple open questions render as a vertical stack, gap 24px, answered cards collapse to a one-line summary (`Đã trả lời: {tóm tắt}`).
- `DocumentPreviewCard.tsx` — an assistant message card (`colorBgContainer`, `borderRadius: 8`, `colorBorderSecondary` border). Contains: Display title (`Bản thảo PL02`, `Bản thảo PL03`, `Phiếu PL07`, `Tờ trình CAB`), metadata summary (`CR · Đơn vị · Người lập · Ngày`), collapsible Markdown preview (default expanded to first ~40 lines, `Xem toàn bộ` expands), Mermaid diagrams via `MermaidViewer`, and footer actions `Duyệt & Tải .docx` (primary) + `Yêu cầu chỉnh sửa thêm` (default). After export: footer actions replaced by persisted-file row reusing the existing `ChatGeneratedFile` card pattern in `ChatMessageBubble.tsx:1137-1240` (Word icon, filename, size, `Tải về`, `Lưu tệp...`).
- `SolutionReviewCard.tsx` — same card family as `DocumentPreviewCard`, Display title `SOLUTION.md — v{n}`, affected-surface summary (Hiện trạng hệ thống / Danh sách màn hình/API/bảng bị ảnh hưởng for edit-type features), Markdown preview collapse, footer `Lưu SOLUTION.md` (primary) + `Yêu cầu chỉnh sửa thêm` (default). On save, the card becomes a version row (`v{n}`, `colorInfo` tag, saved timestamp, link `Mở tài liệu`).
- `ChangePackDropzone.tsx` — rectangular dashed drop area (`colorBorder`, `borderRadius: 8`, `md` padding, centered 14px Body copy, upload icon). Accepts drag/drop and click-to-file-picker (`.zip` only). Hover/drag-over: border `colorPrimary`, background `colorPrimaryBg`. After selection, replaced by `ChangePackConfirmStrip`.
- `ChangePackConfirmStrip.tsx` — compact `colorFillTertiary` strip showing `CR / Nhánh / commitCount / fileCount` read from `meta.json`, plus accept/replace actions. Invalid packs show a `colorError`-bordered inline alert with the enumerated error copy and no action but `Chọn pack khác`.
- `DriftMatrixView.tsx` — three grouped tables (Ngoài solution / Chưa làm / Làm khác) rendered inside the PL03 preview card before the DB-change section. Fixed columns `Mục | SOLUTION.md | Thực tế | Ghi chú`. Row status by group color (destructive / warning / info) plus a text tag; empty group renders the drift-empty copy in that group's slot.
- `WizardLifecycleBar.tsx` — thin status row above the composer when a wizard session is active: current form name, `Bước n/4`, and `Hủy Wizard` text button. Restored draft shows the `colorWarning` draft-restored notice.
- `WizardSavedNoteBanner.tsx` — inline success banner (`role="status"`) after automatic Note persistence, with `Mở tài liệu` link that navigates the Docs view (`#/notes?doc=<id>`).

Extensions to existing components:

- `AIChatDrawer.tsx` — owns wizard session state per thread (`activeWizard: {skill, step, metadata, draftId}`), renders `WizardSkillBar` + `WizardLifecycleBar` in the bottom stack above `ChatInputBar`, passes wizard-mode `placeholder` to the bar (`Trả lời câu hỏi hoặc bổ sung thông tin…`), and keeps the normal composer fully usable (user can type freely at any step).
- `ChatInputBar.tsx` — accepts a `leadingContent?: React.ReactNode` slot rendered directly above the `Mentions` input (above the attached-files chip list) so the skill bar lives inside the composer shell without changing its padding. No other behavior change.
- `ChatMessageBubble.tsx` — add `wizardCard` / `wizardQuestion` message variants routed to `DocumentPreviewCard`, `SolutionReviewCard`, `GapFillQuestionCard`; reuse the existing generated-file row for post-export state. Wizard cards must never be treated as abstention/grounding cards.
- `src/types/models.ts` — extend `ChatMessage` with optional `wizard?: { skill: 'PL02' | 'PL03' | 'PL07' | 'CAB' | 'SOLUTION'; step: string; metadata?: WizardMetadata; draftId?: string; version?: number }` and extend `ChatGeneratedFile` usage unchanged. All new fields optional so historical threads parse.
- `src/utils/dynamicFileSandbox.ts` / `src/services/export/` — add the three approved `docx` builders (PL02, PL03B, PL07) plus the minimal CAB builder; expose one `buildWizardDocx(skill, payload): Promise<Blob>` entry point. UI imports the blob only; no renderer logic in components.

Not built: freeform Word template upload, generic renderer for all forms, graph canvas, new chart library, new npm packages.

Source: `25-CONTEXT.md` D-03…D-19, `25-TEMPLATES.md` section trees, `ChatInputBar.tsx:30-45`, `ChatMessageBubble.tsx:1137-1240`, `MermaidViewer.tsx`.

---

## Interaction Contracts

| Interaction | Trigger | Response |
|-------------|---------|----------|
| Activate a skill chip | Click / Enter / Space on `WizardSkillBar` | Opens `WizardMetadataModal` prefilled from the scoped project. No wizard turn is created until `Bắt đầu soạn thảo`. If a wizard session is already active, the chip is disabled with tooltip `Đang trong phiên wizard. Hãy hoàn tất hoặc hủy phiên hiện tại.` |
| Submit metadata | `Bắt đầu soạn thảo` with required fields valid | Creates the wizard turn: an assistant message acknowledging inputs, then an automatic grounded retrieval pass (Docs index + Knowledge Graph + enabled MCP tools) before the first gap-fill question. Progress strip shows `Bước 1/4 — Thu thập`. |
| Gap-fill question answered | User sends a reply in the normal composer | The answer is attached to the open question, the card collapses to its summary, and the next question or the preview appears. Never require a dedicated modal per question. |
| `Bỏ qua mục này` | Click on question card | Marks the corresponding template field omitted; the preview must show the field as omitted (blank cell or `(chưa cung cấp)`), never a fabricated value. |
| Extra context supplied mid-wizard | User pastes text / selects a doc / attaches a file while a wizard is active | Appended to the wizard input set and the AI re-runs gap detection for the affected template sections only. Existing answered questions stay answered. |
| Preview reached | All gaps answered or skipped | Assistant posts `DocumentPreviewCard` with full Markdown and Mermaid. Actions become live. Progress shows `Bước 3/4 — Soát xét`. |
| `Yêu cầu chỉnh sửa thêm` | Click | Returns one step to `Bước 2/4`, posts a short prompt asking what to change; the preview card remains in the thread as history and a new preview is produced after the change. Never mutate the prior preview card in place. |
| `Duyệt & Tải .docx` | Click | Builds the blob client-side, triggers browser download, saves a Note (type `document`) linked to the project scope, and posts `WizardSavedNoteBanner`. Progress shows `Bước 4/4 — Xuất bản`; the wizard session ends and chips re-enable. |
| docx build failure | Blob build throws | Keep the preview card, show the `Error — docx build failure` inline alert on the card, re-enable the primary button for retry. Never discard the Markdown. |
| Drop `change-pack.zip` | Drag over / drop or file picker | Validate size and content; invalid → inline error copy, no wizard turn. Valid → `ChangePackConfirmStrip`; only `Xác nhận pack` proceeds. |
| Confirm change-pack | `Xác nhận pack` | Unzips via `jszip`, stores each entry as a Note linked to the project DocumentSet, then runs SOL/PL03 reconciliation. Thread keeps the confirm strip collapsed to `Đã nạp change-pack {cr}`. |
| `Lưu SOLUTION.md` | Click on `SolutionReviewCard` | Saves a versioned Note (v1, v2, … — increment from existing versioned notes in the project) and replaces the card footer with the version row. |
| Reopen `SOLUTION.md` from project thread | Click version row / `Mở tài liệu` | Loads the Note content back into the thread as a new review card with the next version number on save. Chat context stays the same thread — never open a new thread. |
| `Hủy Wizard` | Click on lifecycle bar | Opens destructive confirmation with the enumerated copy; on confirm the wizard session is marked abandoned (draft kept in thread), chips re-enable. No docx or Note is produced. |
| Wizard draft restored | Reopen a thread with an abandoned/partial wizard | Lifecycle bar shows draft-restored notice, progress resumes at the stored step. No automatic re-run of retrieval until the user acts. |
| Mermaid diagram in preview | Render | Uses existing `MermaidViewer` (zoom/fullscreen/copy). In the docx the same flow becomes the Step-by-step Execution Matrix table — the preview card carries the note `Sơ đồ sẽ được chuyển thành bảng bước khi xuất Word.` |
| Cancel without session | Escape in metadata modal / confirm strip | Closes the modal/ strip, no state change. Escape never cancels a running wizard session without the confirm dialog. |

---

## State Matrix (Phase 25)

| State | Surface | Required elements |
|-------|---------|-------------------|
| No wizard, project scope | Composer bottom stack | Four enabled chips; normal placeholder; no progress strip |
| No wizard, non-project scope | Composer bottom stack | Chips disabled with tooltip; normal chat fully functional |
| Metadata modal open — invalid | Modal | Inline field errors, `Bắt đầu soạn thảo` disabled until required fields valid; `Đóng` always enabled |
| Wizard step 1/4 (collecting) | Thread | Acknowledgment message, progress strip, gap questions begin to appear, composer placeholder switched |
| Wizard step 2/4 (gap-fill) | Thread | Question cards stacked; answered cards collapsed; skip available per card |
| Wizard step 3/4 (review) | Thread | `DocumentPreviewCard` with Markdown + Mermaid + two actions; no auto-download |
| Export success | Thread | Saved-note banner + persisted-file row (Word icon, filename, size, `Tải về`, `Lưu tệp...`), progress 4/4, session ended |
| Export failure | Thread | Preview retained, destructive-style inline alert with retry, session still active |
| Change-pack invalid | Thread (pack strip slot) | `colorError` inline alert with enumerated reason, only `Chọn pack khác` |
| Change-pack valid, awaiting confirm | Thread | `colorFillTertiary` strip with CR/branch/commits/files + `Xác nhận pack` / `Chọn pack khác` |
| Change-pack confirmed | Thread | Collapsed confirmation line `Đã nạp change-pack {cr}`, storage progress not blocking chat |
| SOLUTION review | Thread | `SolutionReviewCard` with version label, affected-surface summary, Markdown collapse, save/edit actions |
| SOLUTION saved | Thread | Version row with `v{n}` info tag + timestamp + `Mở tài liệu` |
| Drift detected | PL03 preview | `DriftMatrixView` with three groups populated; drift-empty copy per empty group |
| Unknown / missing template data | Preview | Field marked `(chưa cung cấp)`; never omitted silently and never invented |
| Wizard abandoned / restored | Thread + lifecycle bar | Draft notice (`colorWarning`), stored step shown, `Hủy Wizard` available |
| Historical thread (pre-Phase-25) | Thread | Renders unchanged; no chips, no progress strip, no empty wizard chrome |

---

## Accessibility

- Skill chips are real `<button>` elements with accessible names (`Soạn PL02 — Tài liệu Đặc tả Chức năng`); arrow-key traversal inside the chip bar, `Tab` exits to the composer. Disabled chips remain focusable for tooltip discovery and carry `aria-disabled="true"`.
- Wizard progress strip is not color-only: each segment has text (`Bước 1/4 — Thu thập`) and a `role="progressbar"` with `aria-valuenow/max` on the strip container.
- Metadata modal: labels tied to inputs, first invalid field focused on submit, Escape closes, focus returns to the triggering chip.
- Gap-fill question cards use a heading (`aria-level=3`) inside the message; answer confirmation is announced with `role="status"` (polite), not `role="alert"`.
- Dropzone is keyboard-operable (`Enter`/`Space` opens file picker) with `aria-label="Khu vực nạp change-pack"`; drag-over state also has a text change so it is not color-only.
- Error alerts use `role="alert"`; success banners and saved-note banners use `role="status"`.
- Preview card disclosure (`Xem toàn bộ`) is an Ant Design `Collapse`-style toggle with `aria-expanded`; focus returns to the toggle on collapse.
- Drift-matrix group status carries text tags (`Ngoài solution`, `Chưa làm`, `Làm khác`) plus color; screen readers get group headings.
- Contrast: body/label text always uses token text colors on their tokens' surfaces; never place 12px label text on `colorFillTertiary` with a raw hex.
- Respect `prefers-reduced-motion`: no wizard step animations; the existing Mermaid highlight behavior is unchanged.
- The `.docx` content itself is out of accessibility scope, but exported tables keep header-row repetition and real heading styles so Word's outline/reading order works.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | none | not required (shadcn not initialized) |
| third-party | none | not applicable |

No third-party registries or blocks. All UI uses Ant Design 6 components already in `package.json` plus local components under `src/components/ai/wizard/`. No `npm install` for this phase — `docx@^9.9.0`, `jszip@^3.10.2`, and `mermaid` are already dependencies (`25-CONTEXT.md` canonical refs).

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS
- [x] Dimension 2 Visuals: PASS
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: PASS
- [x] Dimension 5 Spacing: PASS
- [x] Dimension 6 Registry Safety: PASS

**Approval:** approved 2026-10-28
