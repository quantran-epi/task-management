---
id: 261121-eck
slug: tool-explorer-markdown-viewer
title: Markdown Viewer trong Tool Explorer + sửa overflow search box + chỉnh icon Tool Explorer/Stripe
date: 2026-11-21
status: planned
scope: Tool Explorer only
---

# Tool Explorer: Markdown Viewer, search box overflow, icon polish

## Mục tiêu

4 yêu cầu trong 1 plan, scope **chỉ Tool Explorer** (tool registry, panel, stripe button của
Tool Explorer). Không thêm dependency; dùng stack có sẵn (`unified`/`remark` đã có nhưng
không cần — dùng `renderSafeMarkdown` hiện hữu), Ant Design icons và token CSS hiện hữu.

1. Markdown viewer: render đầy đủ cú pháp Markdown, editor trái / preview phải, đồng bộ cuộn 2 chiều.
2. Sửa search box Tool Explorer bị overflow/kéo dài quá, co giãn đúng container, responsive.
3. Đổi icon stripe button của Tool Explorer (item `tool_explorer`) sang icon đẹp hơn, chuẩn UI token.
4. Đổi icon tool "JSON Formatter" trong danh sách Tool Explorer sang curly bracket `{}`
   (không phải file icon).

## Context / developed patterns

- `src/workbench/toolwindows/ToolExplorerPanel.tsx` — search box đang `<Input.Search style={{ margin: 10 }} />`
  (width auto, không bị giới hạn bởi container hẹp của right stripe) → root cause overflow.
- `src/workbench/toolwindows/utilityTools.tsx` — registry `UTILITY_TOOLS`: JSON dùng `FileTextOutlined`.
- `src/workbench/toolwindows/UtilityToolPanel.tsx` — đã có `useSyncedScroll` (guard chống bounce,
  guard `fromMax <= 0`) dùng cho JSON/XML/TextCompare; `UtilityToolPanel` switch theo `viewType`;
  `utilityToolIcon` đã trả về `'{}'` dạng text span cho tab icon JSON (giữ nguyên, không đụng vào).
- `src/workbench/EditorArea.tsx` — switch `viewType` ở ~line 105 (icon) và ~line 673 (render panel).
- `src/workbench/store/layoutStore.ts` — `EditorViewType` union ở line 6-31.
- `src/workbench/WorkbenchLayout.tsx` — `rightItems` line 106-108: item `tool_explorer` dùng
  `<ToolOutlined style={{ fontSize: 16 }} />`; các item khác dùng custom `JetBrains*Icon`
  từ `src/components/icons/JetBrainsIcons.tsx` + `--accent`, `--fg-muted`, `--bg-island` tokens.
- `src/utils/markdown.ts` — `renderSafeMarkdown(source)` đã render headings, bold/italic/strike,
  fenced code, nested lists, task checkbox, blockquote, GFM tables (align), images, links an toàn.
- `src/styles/markdown.css` — class `.markdown-rendered-view` đã được import global qua `src/main.tsx`,
  dùng class này trên preview để có style sẵn.
- Test pattern: `src/workbench/__tests__/UtilityToolPanel.test.tsx` (Vitest + Testing Library).

## Nhiệm vụ

### Task 1 — Markdown viewer: split editor/preview + sync scroll + full syntax

**Files:** `src/workbench/store/layoutStore.ts`, `src/workbench/toolwindows/utilityTools.tsx`,
`src/workbench/toolwindows/UtilityToolPanel.tsx`, `src/workbench/EditorArea.tsx`,
`src/workbench/__tests__/UtilityToolPanel.test.tsx`

**Action:**

- Thêm `'markdown_viewer'` vào union `EditorViewType` trong `layoutStore.ts` ngay cạnh 3 utility
  view types hiện hữu (không đụng `RETIRED_VIEW_TYPES` — view mới, không phải persisted cũ).
- Đăng ký tool mới trong `UTILITY_TOOLS`: `id: 'markdown_viewer'`, `title: 'Markdown Viewer'`,
  mô tả tiếng Việt ngắn ("Soạn Markdown và xem trước"),
  `viewType: 'markdown_viewer'`, icon `<FileTextOutlined />` từ `@ant-design/icons` (đã import).
- Trong `UtilityToolPanel.tsx`: export `useSyncedScroll` để tái dùng (hiện đang là hàm module-local),
  rồi thêm component `MarkdownViewer` dùng chung hook này:
  - state `source` (chuỗi Markdown), `useMemo` gọi `renderSafeMarkdown(source)` cho HTML preview.
  - grid 2 cột `minmax(0, 1fr) minmax(0, 1fr)`, `gap: 1`, nền `var(--border, #e9eaee)`,
    `flex: 1`, `minHeight: 0`, `minWidth: 0`, `overflow: 'hidden'` — copy cấu trúc từ `JsonFormatter`.
  - cột trái: header `SOẠN` + `<textarea ref={leftRef} onScroll={onLeftScroll} aria-label="Markdown editor">`,
    font mono, `spellCheck={false}`, `value={source}`, `onChange` cập nhật state.
  - cột phải: header `XEM TRƯỚC` + `<div ref={rightRef} onScroll={onRightScroll} aria-label="Markdown preview" className="markdown-rendered-view" style={{ overflow: 'auto' }} dangerouslySetInnerHTML={{ __html: rendered }} />`.
    Không dùng `innerHTML` thủ công, không tự viết parser — dùng `renderSafeMarkdown`.
  - toolbar-style header với các nút hiện có: Copy (copy source), Clear (xóa source),
    và status text tiếng Việt (số ký tự / "Sẵn sàng"). Dùng `Button`, `Tooltip`, `message`
    đã import sẵn trong file.
- Thêm `case 'markdown_viewer': return <MarkdownViewer />;` vào `UtilityToolPanel` switch.
- Trong `EditorArea.tsx`: thêm `case 'markdown_viewer'` vào cả switch icon (~line 105, dùng
  `utilityToolIcon(viewType, size)`) lẫn switch render (~line 673, trả `<UtilityToolPanel viewType={tab.viewType} />`).
- Trong `utilityToolIcon` (`UtilityToolPanel.tsx`): thêm `case 'markdown_viewer'` trả
  `<FileTextOutlined style={{ fontSize: size, color: 'var(--accent, #3871e1)' }} />`.
- Test mới trong `src/workbench/__tests__/UtilityToolPanel.test.tsx` (giữ nguyên 4 test cũ):
  - render `<UtilityToolPanel viewType="markdown_viewer" />`; `fireEvent.change` textarea với
    sample chứa `# H1`, `**bold**`, `- [x] task`, bảng GFM 2 cột có delimiter, fenced
    code block, blockquote, link và image. Assert preview có `h1`, `strong`, `input[type=checkbox][disabled][checked]`,
    `.markdown-table`, `.code-block`, `blockquote`, `a[target="_blank"][rel*="noopener"]`, `img`.
  - sync scroll: mock `scrollHeight`/`clientHeight` trên cả 2 element rồi `fireEvent.scroll(left)`;
    assert `right.scrollTop > 0` và tỉ lệ đúng; rồi scroll ngược từ right → left. Guard: khi
    `scrollHeight <= clientHeight` thì bên kia không đổi (`scrollTop` giữ nguyên).

**Verify:** `npx vitest run src/workbench/__tests__/UtilityToolPanel.test.tsx` (tất cả test phải pass)
và `npx tsc --noEmit`. Không chạy full suite.

**Done:** mở Tool Explorer → click "Markdown Viewer" → tab mới hiện editor trái / preview phải;
gõ Markdown hiện render đúng; cuộn một bên thì bên kia cuộn theo tỉ lệ, không giật ngược (no bounce).

### Task 2 — Sửa search box overflow trong Tool Explorer

**Files:** `src/workbench/toolwindows/ToolExplorerPanel.tsx`,
`src/workbench/__tests__/ToolExplorerPanel.test.tsx` (tạo mới)

**Action:**

- Bọc `<Input.Search>` trong `<div style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box', padding: 10, flexShrink: 0 }}>`.
- Đổi `Input.Search` style từ `{ margin: 10 }` sang `{ width: '100%', maxWidth: '100%' }`
  và thêm `style`/`className` sao cho input con `boxSizing: 'border-box'` (dùng prop `style` trên
  `Input.Search` là đủ vì antd truyền xuống input wrapper). Không dùng fixed width, không dùng
  `margin` âm, không đổi cấu trúc list bên dưới.
- Giữ nguyên các style còn lại của panel (header "Format & Transform", list, footer).
- Test mới `ToolExplorerPanel.test.tsx`: render panel trong container có chiều rộng cố định nhỏ
  (ví dụ 220px), query `.ant-input-search` hoặc `input[placeholder="Tìm công cụ..."]`; assert:
  - wrapper search có `maxWidth: 100%` và `boxSizing: border-box`;
  - `input.getBoundingClientRect().width <= 220` (không tràn container) — jsdom trả 0 nên
    thay bằng assert style inline `width: 100%; max-width: 100%` trên `Input.Search`;
  - search vẫn hoạt động: `fireEvent.change` với "json" → chỉ còn nút "JSON Formatter" trong danh sách.

**Verify:** `npx vitest run src/workbench/__tests__/ToolExplorerPanel.test.tsx src/workbench/__tests__/UtilityToolPanel.test.tsx`
(vì Task 1 đổi export `useSyncedScroll`, đảm bảo không regression) và kiểm tra trong Chrome:
thu hẹp right stripe (Tool Explorer panel) → search box co lại theo panel, không có horizontal
scrollbar, không đè lên danh sách tool.

**Done:** search box co giãn đúng trong mọi chiều rộng của right panel; test assert style + filter pass;
Chrome UAT hẹp/rộng đều không tràn.

### Task 3 — Đổi icon JSON Formatter sang `{}` + icon stripe Tool Explorer theo UI token

**Files:** `src/workbench/toolwindows/utilityTools.tsx`, `src/workbench/WorkbenchLayout.tsx`,
`src/workbench/__tests__/ToolExplorerPanel.test.tsx`

**Action:**

- Trong `utilityTools.tsx`: đổi icon tool `json_formatter` từ `FileTextOutlined` sang curly bracket
  `{}` — dùng cùng biểu diễn text span đã có trong `utilityToolIcon` (`<span style={{ fontSize: size, color: 'var(--accent, #3871e1)' }}>{'{}'}</span>`),
  nhận `size` từ callback `(size = 16)`. Bỏ import `FileTextOutlined` nếu không còn chỗ dùng
  (chú ý: `xml_formatter` còn dùng `CodeOutlined`, `text_compare` dùng `DiffOutlined`).
- Trong `WorkbenchLayout.tsx`: đổi icon của item `tool_explorer` (line 108) từ `<ToolOutlined .../>`
  sang icon custom theo phong cách TaskMate: ưu tiên icon có sẵn trong `src/components/icons/JetBrainsIcons.tsx`
  nếu có biến thể tool/utility; nếu không có thì dùng `<AppstoreOutlined style={{ fontSize: 16, color: 'var(--accent, #3871e1)' }} />`
  từ `@ant-design/icons` (đã là dependency) — khớp màu accent với các iconUSTOM khác, không thêm dependency,
  không sửa component `Stripe` (đã dùng token `--accent`, `--fg-muted`, `--bg-island` sẵn).
  Cập nhật import: bỏ `ToolOutlined`, thêm `AppstoreOutlined` nếu cần.
- Test trong `ToolExplorerPanel.test.tsx`: render panel, tìm nút "Open JSON Formatter"
  (`aria-label`), assert trong nút có span text `{}`; assert không còn element `.anticon-file-text`
  trong nút đó. (Icon stripe nằm ngoài panel — verify bằng grep/tsc, không test render WorkbenchLayout.)

**Verify:** `npx vitest run src/workbench/__tests__/ToolExplorerPanel.test.tsx` và `npx tsc --noEmit`
(đảm bảo import icon mới hợp lệ, không có unused import). Chrome: mở Tool Explorer → icon JSON
Formatter là `{}`; icon trên stripe là accent-colored, khớp các icon tool window khác.

**Done:** JSON Formatter hiện `{}` trong danh sách tool; icon stripe Tool Explorer dùng accent token
theo phong cách TaskMate; không dependency mới; `tsc` + scoped test xanh.

## Ghi chú thực thi

- Thứ tự Task 1 → Task 2 → Task 3 (cùng file `utilityTools.tsx` và test file → chạy tuần tự).
- Không đụng `package.json`, không đụng PWA/GitHub Pages, không đụng feature ngoài Tool Explorer.
- Không chạy full Vitest suite (quy tắc dự án: > 1 giờ).
- Mọi text UI mới bằng tiếng Việt; giữ identifier/path/lệnh nguyên gốc.

## Definition of Done (tổng)

- [ ] 4 yêu cầu đều có task tương ứng, verify cụ thể.
- [ ] Scoped Vitest tests xanh, `npx tsc --noEmit` sạch.
- [ ] Chrome UAT: Markdown render + sync scroll 2 chiều, search box không tràn, 2 icon đổi đúng.
