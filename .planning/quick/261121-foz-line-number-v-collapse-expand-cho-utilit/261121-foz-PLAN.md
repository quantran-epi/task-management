---
id: 261121-foz
slug: line-number-v-collapse-expand-cho-utilit
title: Line number và collapse/expand cho mọi utility tool editor
date: 2026-11-21
status: planned
scope: Tool Explorer utility editors only — JSON/XML Formatter, Text Compare, Markdown Viewer. Không đụng AI assistant, layoutStore, EditorArea.
type: execute
wave: 1
depends_on: []
autonomous: true
files_modified:
  - src/workbench/toolwindows/LineNumberedPane.tsx
  - src/workbench/toolwindows/UtilityToolPanel.tsx
  - src/workbench/__tests__/UtilityToolPanel.test.tsx
requirements: []
must_haves:
  truths:
    - "Mọi pane của 4 utility editor đều có cột line number nhìn thấy được: input textarea, output JSON/XML, diff result, Markdown preview"
    - "Line number cuộn cùng nội dung và khớp 1 dòng = 1 số (textarea bật wrap off, output code dùng whiteSpace pre)"
    - "Output JSON/XML đã format có điểm gập cho object/array (JSON) và element (XML); click hoặc phím Enter trên nút gập thu gọn/mở rộng vùng tương ứng"
    - "Khi gập, các dòng bị ẩn biến mất khỏi cả nội dung lẫn cột số; syntax highlight vẫn giữ nguyên"
    - "Đổi nội dung (Format/Minify/AI apply/Clear) thì trạng thái gập reset về mở hết"
    - "AI assistant, aria-label hiện hữu, useSyncedScroll và 17 test cũ không bị ảnh hưởng"
    - "Không thêm dependency nào; scoped tests + tsc + Chrome UAT xanh"
  artifacts:
    - path: "src/workbench/toolwindows/LineNumberedPane.tsx"
      provides: "LineNumberedPane dùng chung + computeFoldRanges pure logic"
      exports: ["LineNumberedPane", "computeFoldRanges"]
    - path: "src/workbench/toolwindows/UtilityToolPanel.tsx"
      provides: "FoldingCodeView local + 8 lần dùng LineNumberedPane + cột số inline cho diff result"
      contains: "FoldingCodeView"
    - path: "src/workbench/__tests__/UtilityToolPanel.test.tsx"
      provides: "17 test cũ + test line number và folding"
  key_links:
    - from: "UtilityToolPanel.tsx textarea"
      to: "LineNumberedPane via scrollRef = leftRef/rightRef"
      via: "native scroll listener copy scrollTop sang gutter"
      pattern: "scrollRef.current.scrollTop"
    - from: "FoldingCodeView"
      to: "computeFoldRanges + highlight"
      via: "visibleIndices lọc dòng bị gập, highlight từng dòng đã escape"
      pattern: "computeFoldRanges"
    - from: "LineNumberedPane gutter"
      to: "visibleLines (chỉ số dòng nguồn)"
      via: "visibleLines.map(lineIndex => lineIndex + 1) — số gutter là số dòng gốc, KHÔNG phải vị trí trong visible array"
      pattern: "visibleLines.map"
    - from: "folded state"
      to: "output text"
      via: "useEffect reset khi text đổi"
      pattern: "setFolded(new Set())"
---

# Line number và collapse/expand cho utility editor

<objective>
Thêm cột line number cho toàn bộ pane của 4 utility editor trong Tool Explorer, và cho phép thu gọn/mở rộng object/array (JSON) lẫn element/node (XML) trên output đã format. Giữ nguyên syntax highlight, scroll sync, AI assistant và mọi aria-label hiện hữu.

Purpose: dễ đọc và điều hướng output dài, xử lý JSON/XML phân cấp sâu mà không thêm dependency.

Output: 1 component/hook module dùng chung, wire vào `UtilityToolPanel.tsx`, scoped tests mở rộng.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@$HOME/.claude/gsd-core/references/planner-antipatterns.md

File đã đọc (đọc 1 lần, không re-read):
- `src/workbench/toolwindows/UtilityToolPanel.tsx` (~664 dòng): 4 editor module-local; style dùng chung `panelStyle/toolbarStyle/editorStyle/outputStyle/colHeadStyle/footerStyle/splitPaneStyle`; `useSyncedScroll` export ở dòng 133; `highlight`/`escapeHtml` ở dòng 105/303; `<pre>` output ở dòng 378/464; 5 textarea ở dòng 373/459/541/546/608; diff rows grid ở dòng 554; Markdown preview div ở dòng 613.
- `src/workbench/__tests__/UtilityToolPanel.test.tsx` (248 dòng, **17 test**): giữ nguyên tất cả. Divider test đếm đúng 1 `role="separator"`; JSON/XML test đọc `getByLabelText('JSON output'|'XML output').textContent` và require `span[style*="color"]`; XML minify require textContent **bằng đúng** chuỗi một dòng; scroll-sync test gắn ref trực tiếp vào editor/preview.
- `package.json`: không có code-editor/folding dependency. **Không cài package mới.**
- `UtilityToolAIAssistant.tsx`: cấm sửa.
</context>

## Quyết định thiết kế (bắt buộc, không tự đổi)

### 1. Một component dùng chung, không copy/paste

Tạo **duy nhất** `src/workbench/toolwindows/LineNumberedPane.tsx`, export:

- `export type FoldRange = { openLine: number; closeLine: number }` (0-based, tính trên chuỗi đã format).
- `export function computeFoldRanges(text: string, kind: 'json' | 'xml'): FoldRange[]` — pure, test trực tiếp.
- `export function LineNumberedPane(props)` — wrapper gutter + nội dung.

Props của `LineNumberedPane`:
- `scrollRef: React.RefObject<HTMLElement | null>` — chính là `leftRef`/`rightRef` từ `useSyncedScroll`, hoặc ref mới cho diff/preview. Caller vẫn tự gắn ref vào child; component **không cloneElement**.
- `totalLines: number` — số dòng nguồn (`text.split('\n').length`).
- `visibleLines?: number[]` — mảng index 0-based được hiển thị; mặc định `0..totalLines-1`. Khi folding, truyền danh sách đã lọc.
- `foldableLines?: ReadonlySet<number>`, `collapsedLines?: ReadonlySet<number>`, `onToggleFold?: (lineIndex: number) => void`.
- `gutterPaddingTop?: number` (mặc định `12`) và `gutterWidth?: number` (mặc định `48`).

Cấu trúc render: flex row gồm gutter (`div` có `data-testid="line-gutter"`, `overflow:'hidden'`, `flex:'0 0 48px'`, `background:'var(--bg-elev,#f7f8fa)'`, `borderRight:'1px solid var(--border,#e9eaee)'`, font `12.5px/20px var(--font-mono, monospace)`, `paddingTop` theo prop) + `children`. Mỗi dòng gutter cao đúng `20px`. **Số gutter luôn lấy từ `visibleLines.map(lineIndex => lineIndex + 1)` — tức số dòng nguồn gốc, KHÔNG phải vị trí trong mảng visible.** Mỗi row gutter hiển thị số dòng màu `var(--fg-muted,#6c707e)` ở bên trái; khi `foldableLines.has(lineIndex)` thì hiển thị THÊM một `<button type="button">` nhỏ ở bên phải cùng row đó (số + nút nằm chung một row 20px, nút KHÔNG thay thế số), `aria-label` dạng `Thu gọn dòng N` / `Mở rộng dòng N`, `aria-expanded={!collapsed}`, nội dung `▾`/`▸`. **Không dùng `role="separator"`** (test divider đếm 1).

Scroll sync: trong `LineNumberedPane`, `useEffect` thêm native listener `scroll` (passive) trên `scrollRef.current`, copy `scrollTop` sang gutter `div`, cleanup khi unmount. Không sửa `useSyncedScroll`; listener này chạy song song với React `onScroll` của caller.

### 2. Line number khớp 1 dòng = 1 số

- Thêm `whiteSpace:'pre'`, `overflow:'auto'` vào `editorStyle`; thêm thuộc tính `wrap="off"` cho **cả 5 textarea** (JSON input, XML input, Text A, Text B, Markdown editor). Nếu không, soft-wrap làm số lệch với dòng visual.
- `outputStyle` vẫn giữ đè `whiteSpace:'pre-wrap'`, nhưng `FoldingCodeView` dùng style riêng `whiteSpace:'pre'` để gutter khớp. Ký tự `\n` chỉ được nối vào một dòng khi `i < lines.length - 1` trên mảng `lines` **gốc** (`text.split('\n')`), KHÔNG phải mảng visible đã lọc — nhờ vậy `textContent` của `<pre>` (khi chưa gập) **bằng đúng** chuỗi gốc, đây là điều kiện để test XML minify và 17 test cũ pass. Dấu `…` khi gập phải đặt TRƯỚC `\n`, cùng row với dòng mở (xem mục 3).
- Markdown preview giữ `whiteSpace:'normal'`; gutter của preview là **thước số dòng nguồn** (`source.split('\n').length`) cuộn cùng container. Không cố map số sang block HTML đã render (renderSafeMarkdown không trả line map) — ghi rõ trong UAT.
- Diff result: **không dùng** `LineNumberedPane`; thêm một cột số thứ tự `28px` vào đầu grid của mỗi row (`gridTemplateColumns: '28px 44px 1fr 20px 1fr 44px'`). Lý do: row đã tự align theo grid, số nằm cùng row nên khớp dù nội dung wrap; giữ nguyên 2 cột `an`/`bn` cũ.

### 3. Folding JSON/XML — phát hiện, state, render

`computeFoldRanges` nằm trong file mới, không import gì từ `UtilityToolPanel` (tránh circular import):

- **JSON**: quét ký tự một lượt, đếm dòng. Bỏ qua nội dung trong `"..."` (theo dõi `escaped` cho `\\`). Stack lưu `{line}` khi gặp `{`/`[`; khi gặp `}`/`]` thì pop và chỉ đưa vào kết quả nếu `closeLine > openLine` (bỏ object/array một dòng). JSON đã format bởi `JSON.stringify(_, null, indent)` nên string không chứa newline thật — quét 1 lượt là đủ.
- **XML**: regex quét token theo thứ tự ưu tiên `comment | CDATA | PI | DOCTYPE | tag`; bỏ qua 4 loại đầu. Với tag mở, bỏ self-closing (`/>`), push `{tag, line}`; với tag đóng, tìm phần tử **cuối cùng cùng tên** bằng vòng lặp lui, splice ra, và chỉ lưu range nếu `closeLine > openLine`. Đếm dòng bằng cách đếm `\n` trong `text.slice(lastIndex, match.index)`, không slice từ đầu mỗi lần. Format XML đầu ra đã escape `>` trong attribute (`&gt;` bởi `escapeAttr`), nên regex tag an toàn.
- Chỉ trả range có ít nhất 1 dòng thân — tức điểm gập chỉ xuất hiện ở dòng mở có nội dung bên trong.

`FoldingCodeView` là component **module-local mới trong `UtilityToolPanel.tsx`** (dùng lại `highlight`, `escapeHtml`, output style có sẵn — không tách để tránh import vòng):

Props: `text`, `kind: 'json' | 'xml'`, `rightRef: React.RefObject<HTMLPreElement | null>`, `onRightScroll`, `label: 'JSON output' | 'XML output'`, `error?: string | null`.

- `lines = useMemo(() => text.split('\n'), [text])`; `ranges = useMemo(() => computeFoldRanges(text, kind), [text])`.
- State `folded: ReadonlySet<number>` khóa bằng `openLine`. `useEffect(() => setFolded(new Set()), [text])` — reset mỗi khi output đổi (Format/Minify/AI apply/Clear). Không dùng index dòng làm khóa lâu dài khi text đổi.
- `openByLine = Map(ranges.map(r => [r.openLine, r]))`; vòng lặp `i = 0..lines.length-1`, nếu `i <= skipUntil` thì bỏ qua; nếu range tại `i` đang folded thì vẫn đưa `i` vào `visibleLines`, đánh dấu collapsed, rồi đặt `skipUntil = range.closeLine` (ẩn cả thân lẫn dòng đóng). `foldableLines = new Set(ranges.map(r => r.openLine))`.
- Render: `<pre ref={rightRef} onScroll={onRightScroll} aria-label={label} style={{...outputStyle, whiteSpace:'pre'}}>`. **Nếu `error` truthy**: bỏ qua folding, coi nội dung đúng 1 dòng (`visibleLines = [0]`) và render `escapeHtml('❌ ' + error)` — giữ nguyên UX lỗi hiện tại của `<pre>`; gutter vì thế cũng chỉ có 1 số, không lệch. **Ngược lại**, mỗi dòng visible là một `<span key={i}>` với `dangerouslySetInnerHTML={{ __html: highlight(line, kind) + (collapsed ? ellipsisMarkup : '') + (i < lines.length - 1 ? '\n' : '') }}` — `i` là chỉ số trên mảng `lines` **gốc**, điều kiện `\n` chỉ đúng khi chưa tới dòng cuối của mảng gốc. `ellipsisMarkup` đứng TRƯỚC `\n` để dấu `…` nằm cùng visual row với dòng mở (đặt sau `\n` sẽ tạo row thứ hai không có gutter → số lệch sau khi gập). `highlight()` đã gọi `escapeHtml(code)` trước khi tạo span màu — giữ nguyên bước này; `ellipsisMarkup` là chuỗi tĩnh ` <span style="color:var(--fg-muted)">…</span>`. **Không** đưa user data chưa escape vào innerHTML (kể cả khi gập).
- Caller truyền `error` từ state lỗi hiện hữu của từng editor (`jsonError` / `xmlError`) vào `FoldingCodeView` để giữ nguyên thông báo lỗi cũ.
- Nút gập nằm ở gutter (do `LineNumberedPane` render) → click chuột hoặc Focus + Enter/Space đều toggle được; state toggle dùng `new Set(prev)` rồi add/delete.
- Thay thế hoàn toàn `<pre>` cũ ở 2 chỗ (dòng ~378 và ~464); giữ nguyên `aria-label` để test cũ không vỡ. Footer đếm dòng giữ nguyên, dùng `lines.length`.

### 4. Phạm vi test / UAT

- Chỉ mở rộng `src/workbench/__tests__/UtilityToolPanel.test.tsx`. Giữ nguyên 17 test hiện hữu, **không** tạo file test mới, **không** sửa `UtilityToolAIAssistant.test.tsx`.
- Test mới: (a) mỗi pane có `line-gutter` với số lượng đúng (JSON/XML/Markdown = 2, Text Compare = 2 + cột số trong diff row); (b) `computeFoldRanges` xử lý JSON có `{}`/`[]` trong string, XML self-closing/comment/CDATA, range multi-line; (c) JSON format → bấm `Thu gọn dòng N` → text trong vùng biến mất, gutter mất dòng, nút đổi thành `Mở rộng dòng N`, bấm lại → hồi phục; (d) XML tương tự; (e) đổi input rồi Format lại → fold state reset; (f) syntax color `span[style*="color"]` vẫn còn sau khi gập.
- Verify commands (chạy đúng, **không** full suite): `npx vitest run src/workbench/__tests__/UtilityToolPanel.test.tsx`, `npx tsc --noEmit`, rồi Chrome UAT.

<tasks>

<task type="auto">
  <name>Task 1 — Module dùng chung: LineNumberedPane + computeFoldRanges + unit test</name>
  <files>
    src/workbench/toolwindows/LineNumberedPane.tsx (mới)
    src/workbench/__tests__/UtilityToolPanel.test.tsx
  </files>
  <action>
    Tạo `LineNumberedPane.tsx` theo đúng API và cấu trúc ở mục 1. Chỉ import `React` (useEffect) — không import từ `UtilityToolPanel`, không import package mới. Export `FoldRange`, `computeFoldRanges`, `LineNumberedPane`. Cài đặt `computeFoldRanges` theo mục 3 (nhánh json và xml), ưu tiên đếm dòng tăng dần, vòng lặp lui khi khớp tag đóng. Gutter render `data-testid="line-gutter"`, số gutter lấy từ `visibleLines.map(lineIndex => lineIndex + 1)` (số dòng nguồn, không phải vị trí visible); với dòng foldable hiển thị số VÀ nút `<button type="button">` nhỏ cùng row 20px, có `aria-label` tiếng Việt và `aria-expanded`; tuyệt đối không dùng `role="separator"`.

    Trong file test, thêm import `computeFoldRanges` và viết các case pure theo mục 4(b). Chưa wire vào panel ở task này; chạy test file để xác nhận module mới compile và logic gập đúng. Giữ nguyên 17 test cũ.
  </action>
  <verify>
    <automated>npx vitest run src/workbench/__tests__/UtilityToolPanel.test.tsx</automated>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <done>
    Module mới tồn tại, export đúng tên; computeFoldRanges trả range đúng cho JSON có brace trong string và XML có self-closing/comment/CDATA; 17 test cũ + test pure mới pass; tsc clean; không package nào được cài.
  </done>
</task>

<task type="auto">
  <name>Task 2 — Wire 4 editor + folding integration + Chrome UAT</name>
  <files>
    src/workbench/toolwindows/UtilityToolPanel.tsx
    src/workbench/__tests__/UtilityToolPanel.test.tsx
  </files>
  <action>
    Trong `UtilityToolPanel.tsx`: import `LineNumberedPane`/`computeFoldRanges`; định nghĩa `FoldingCodeView` module-local theo mục 3, có prop `error?: string | null` — khi `error` truthy render `escapeHtml('❌ ' + error)` trong `<pre>` thay vì các dòng gập (giữ nguyên UX lỗi cũ), và truyền `error` từ state lỗi hiện hữu của từng editor vào. Cập nhật `editorStyle` (`whiteSpace:'pre'`, `overflow:'auto'`) và thêm `wrap="off"` cho cả 5 textarea. Bọc mỗi pane bằng `LineNumberedPane` với `scrollRef` chính là ref đã có (`leftRef` cho input, `rightRef` cho output/preview): JSON input + JSON output, XML input + XML output, Text A + Text B, Markdown editor + Markdown preview. `totalLines` lấy từ `value.split('\n').length`; Markdown preview dùng `source.split('\n').length` làm thước số dòng nguồn. Thay 2 `<pre>` output bằng `FoldingCodeView` giữ nguyên aria-label. Khi render dòng, nối `\n` chỉ khi `i < lines.length - 1` trên mảng gốc và đặt `ellipsisMarkup` TRƯỚC `\n` để dấu `…` cùng row với dòng mở. Cho diff result: thêm cột số thứ tự 28px vào grid của mỗi row như mục 2, giữ nguyên cột `an`/`bn`, KHÔNG bọc bằng `LineNumberedPane`. Không sửa `UtilityToolAIAssistant`, `useSyncedScroll`, toolbar, AI wiring, footer, hay logic Format/Minify/Copy/Clear/diff/render.

    Bổ sung test 4(c)–4(f) vào file test hiện hữu. Sau khi scoped tests + tsc xanh, tự review diff rồi mở Chrome làm UAT (xem phần `<verification>`). Không chạy full vitest suite.
  </action>
  <verify>
    <automated>npx vitest run src/workbench/__tests__/UtilityToolPanel.test.tsx</automated>
    <automated>npx tsc --noEmit</automated>
    <human-check>
      Chrome UAT theo các bước tiếng Việt trong phần `<verification>`; kiểm tra Console không có lỗi.
    </human-check>
  </verify>
  <done>
    Cả 8 pane text/output/preview có cột số cuộn cùng nội dung; diff result có cột số thứ tự; JSON/XML có nút gập hoạt động bằng click lẫn bàn phím, gập ẩn dòng khỏi nội dung và gutter, mở lại hồi phục, đổi nội dung reset state; highlight giữ nguyên; số gutter là số dòng nguồn, dấu `…` nằm cùng row dòng mở; lỗi vẫn hiển thị đúng như cũ; AI assistant vẫn chạy; 17 test cũ + test mới pass; tsc clean; Chrome UAT sạch.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| user paste → `highlight()`/`dangerouslySetInnerHTML` | Nội dung JSON/XML do người dùng dán đi vào innerHTML của `<pre>` |
| user paste → diff/preview rows | Text A/B, Markdown source render ra DOM |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-foz-01 | Tampering / XSS | `FoldingCodeView` line spans | mitigate | Mỗi dòng đi qua `highlight()` → `escapeHtml()` trước khi `dangerouslySetInnerHTML`; chuỗi `ellipsisMarkup` là literal tĩnh, không chứa user data; không nối raw `text` vào HTML. |
| T-foz-02 | Denial of service | `computeFoldRanges`, `visibleIndices`, diff rows | mitigate | Quét text 1 lượt O(n), memo hóa theo `text`; diff đã có `MAX_DIFF_TOKENS = 4000`; gutter chỉ render số dòng đang visible. |
| T-foz-03 | Spoofing | nút gập trong gutter | accept | Chỉ toggle state local trong component, không ghi DB, không đổi nội dung editor; aria-label/aria-expanded giúp phân biệt trạng thái. |
| T-foz-SC | Supply chain | package manager | accept | Không có lệnh install nào trong plan này, không thêm dependency → không cần checkpoint legitimacy. |

</threat_model>

<verification>
**Automated (bắt buộc, scoped):**
1. `npx vitest run src/workbench/__tests__/UtilityToolPanel.test.tsx` — toàn bộ pass, bao gồm 17 test cũ.
2. `npx tsc --noEmit` — clean.
3. Tuyệt đối không chạy `npm test` / full vitest suite (>1h).

**Chrome UAT — tiếng Việt, các bước ngắn:**
1. Mở app Tauri dev → Tool Explorer.
2. Với JSON Formatter: dán JSON có object/array lồng nhau → bấm Format → thấy số dòng ở cả 2 pane; cuộn input/output → số cuộn theo.
3. Bấm nút `▾` ở dòng mở → vùng con biến mất, xuất hiện `…` ngay trên cùng row với dòng mở (không tạo row mới làm lệch số); bấm `▸` → hiện lại. Tab đến nút rồi nhấn Enter → toggle vẫn hoạt động.
4. Đổi input rồi Format lại → mọi vùng về trạng thái mở.
5. Lặp lại bước 2–4 cho XML Formatter với element lồng nhau (thử cả element tự đóng và comment).
6. Text Compare: dán 2 đoạn nhiều dòng → thấy số ở Text A, Text B và cột số đầu bảng kết quả; cột `an`/`bn` cũ vẫn hiển thị.
7. Markdown Viewer: dán Markdown nhiều dòng → pane SOẠN có số; pane XEM TRƯỚC có thước số nguồn cuộn cùng nội dung (không căn theo từng block render).
8. Với cả 4 tool: bấm nút AI → stream vẫn chạy, đóng lại → nội dung editor không đổi.
9. Mở DevTools Console → không có error/warning mới.

</verification>

<success_criteria>
- [x] Module `LineNumberedPane.tsx` tồn tại, tái dùng ở 8 pane; diff result có cột số riêng.
- [x] 17 test cũ không đổi ý nghĩa và vẫn pass; test line number + folding pass.
- [x] `npx tsc --noEmit` clean; không dependency mới; `package.json` unchanged.
- [x] AI assistant, aria-label, `useSyncedScroll`, divider count không bị regression.
- [x] Chrome UAT sạch, có ghi nhận kết quả trong artifact quick task.
</success_criteria>

<output>
Khi thực hiện xong, ghi kết quả UAT và scope test vào thư mục quick task `.planning/quick/261121-foz-line-number-v-collapse-expand-cho-utilit/`. Không tạo file báo cáo riêng ngoài artifact của GSD.
</output>
