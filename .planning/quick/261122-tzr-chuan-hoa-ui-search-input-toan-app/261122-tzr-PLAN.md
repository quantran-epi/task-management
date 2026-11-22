---
phase: 261122-tzr
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
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
  - src/views/NotesPopoutView.tsx
  - src/views/ChangeRequestsView.tsx
  - src/views/SystemCatalogView.tsx
autonomous: true
requirements: []
user_setup: []
must_haves:
  truths:
    - "Mọi ô tìm kiếm ở các màn hình đã audit có cùng chiều cao/bo góc/cỡ chữ, prefix SearchOutlined màu token, allowClear, size middle, không width cố định lệch"
    - "Không còn AntD Search button (InputSearch), ký tự ⌕, hay input HTML thô ở 7 điểm chuyển đổi (5 InputSearch + 2 raw input)"
    - "Gõ từ khóa không khớp hiện rõ thông báo 'không tìm thấy kết quả', tách khỏi trạng thái 'chưa có dữ liệu'"
    - "Phím tắt /, ↑↓, Enter, Esc, Tab và tìm kiếm Find byte-exact vẫn nguyên vẹn"
  artifacts:
    - path: src/components/ui/input.tsx
      provides: "SearchInput — một điểm đổi chung cho mọi search input (prefix + allowClear + size + width)"
      exports: ["SearchInput"]
    - path: src/components/ui/index.ts
      provides: "Barrel export SearchInput"
    - path: src/styles/coding-zone.css
      provides: "Bỏ CSS .cz-search-wrap đã chết sau khi thay raw input"
    - path: src/workbench/search/__tests__/SearchEverywhereModal.test.tsx
      provides: "Placeholder tiếng Việt mới, giữ nguyên mọi assertion bàn phím"
    - path: src/components/ui/__tests__/controls.test.tsx
      provides: "Regression SearchInput dùng chung metrics và prefix token"
  key_links:
    - from: "src/components/ui/input.tsx (SearchInput)"
      to: "src/components/ui/input.tsx (Input) + ./antdTheme useAntdToken + ./icon SearchOutlined"
      via: "wrapper mỏng, default prefix/allowClear/size"
      pattern: "SearchInput|useAntdToken|colorTextSecondary"
    - from: "~24 call site search input"
      to: "src/components/ui/input.tsx"
      via: "import { SearchInput } from '../components/ui' (đường dẫn tương đối đúng thư mục)"
      pattern: "<SearchInput"
---

<objective>
Chuẩn hóa UI/UX của mọi search input: một primitive dùng chung, không còn biến thể lệch (AntD Search button, raw `<input>`, glyph ⌕, màu cứng, width 260/280, size small, borderless, nút reset thừa). Logic fold tiếng Việt đã xong ở quick 261122-t7c — không đụng logic tìm kiếm.

Purpose: Một người dùng thấy cùng một ô tìm kiếm ở mọi nơi; một chỗ đổi token là đổi toàn app; thông báo "không tìm thấy" không bị nhầm với "chưa có dữ liệu".

Output: `SearchInput` export từ `src/components/ui`, ~24 call site migrate, empty-state tách biệt, 2 file test cập nhật. Không thêm dependency, không đụng `src/workbench/search/find/*` matching logic, không đụng knowledge-server.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@/Users/tranducquan/Working/Personal/task-management/CLAUDE.md
@.planning/STATE.md

Audit facts (đã xác nhận, KHÔNG research lại):
- Shared wrapper hiện có: `src/components/ui/input.tsx` export `Input` (token metrics), `InputSearch` (AntD `Input.Search` có nút Search), `InputPassword`. Barrel: `src/components/ui/index.ts:126-133`.
- `useAntdToken()` ở `src/components/ui/antdTheme.ts:14`; `SearchOutlined` ở `src/components/ui/icon.tsx:306`. `input.tsx` import `useAntdToken` từ `./antdTheme` KHÔNG tạo vòng lặp (antdTheme chỉ import `./tokens.contract`).
- 5 site dùng `InputSearch`: `TelegramMonitorView.tsx:452`, `DocumentSetForm.tsx:659`, `ZipImportPreviewModal.tsx:466`, `DocSetLibrary.tsx:107`, `ToolExplorerPanel.tsx:26`.

 2 raw `<input>`: `CodingZoneTree.tsx:171` (trong `.cz-search-wrap`, glyph ⌕, CSS `coding-zone.css:60-66`), `SearchEverywhereModal.tsx:419` (custom clear button, inputRef `useRef<HTMLInputElement>` tại :40, focus tại :233, handleKeyDown `React.KeyboardEvent<HTMLInputElement>` tại :239, placeholder English tại :425, "No results found" tại :467).
- Test pin placeholder English ở `src/workbench/search/__tests__/SearchEverywhereModal.test.tsx` (nhiều chỗ, qua `getByPlaceholderText`), assertion bàn phím phải giữ nguyên.
- `controls.test.tsx:55-64` pin class `.ui-search-root` + metrics của `InputSearch` — giữ nguyên wrapper đó và test đó.

Quy ước bắt buộc: broad-read mỗi file 1 lần rồi Edit ngay, KHÔNG re-read đoạn vừa đọc; identifier/đường dẫn/lệnh giữ nguyên; tiếng Việt, xưng sếp; scoped vitest, KHÔNG chạy full suite; `npx tsc --noEmit` sạch; review diff + verify Chrome sau merge; branch `pre-v1.6-baseline`. Không đổi matching logic hay debounce.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Tạo SearchInput dùng chung + chuyển 5 InputSearch và 2 raw input</name>
  <files>src/components/ui/input.tsx, src/components/ui/index.ts, src/components/ui/__tests__/controls.test.tsx, src/views/TelegramMonitorView.tsx, src/components/knowledge/DocumentSetForm.tsx, src/components/notes/ZipImportPreviewModal.tsx, src/workbench/DocSetLibrary.tsx, src/workbench/toolwindows/ToolExplorerPanel.tsx, src/components/agents/CodingZoneTree.tsx, src/styles/coding-zone.css, src/workbench/search/SearchEverywhereModal.tsx, src/workbench/search/__tests__/SearchEverywhereModal.test.tsx</files>
  <action>
    Bước 1 — primitive. Trong `src/components/ui/input.tsx`: import `useAntdToken` từ `./antdTheme` và `SearchOutlined` từ `./icon`; export `SearchInput = forwardRef<import('antd').InputRef, InputProps>` với default `allowClear = true`, `size = 'middle'`, `prefix = <SearchOutlined style={{ color: token.colorTextSecondary }} />` (token lấy từ `useAntdToken()`); cho phép caller override `prefix`; render bằng `<Input {...} ref={ref} />` để kế thừa controlStyle/controlWidthStyle. Export `SearchInput` từ `src/components/ui/index.ts`. Thêm 1 assertion nhỏ trong `controls.test.tsx` (describe 'input-family policy'): render `<SearchInput placeholder="Tìm chung" />`, kiểm tra root có class `ant-input-affix-wrapper` và style chứa `--ui-control-height`. KHÔNG sửa `InputSearch` wrapper hay test của nó — nó thành export legacy, product code không dùng nữa.

    Bước 2 — 5 site InputSearch → SearchInput (bỏ import `InputSearch`, thêm `SearchInput`): `TelegramMonitorView.tsx:452` (bỏ `style={{width:280}}`), `DocumentSetForm.tsx:659` (giữ `aria-label`, `marginBottom`), `ZipImportPreviewModal.tsx:466` (bỏ `style={{width:280}}`), `DocSetLibrary.tsx:107`, `ToolExplorerPanel.tsx:26` (bỏ `style={{width:'100%',maxWidth:...}}`). Giữ nguyên value/onChange/allowClear/placeholder. Ở `DocSetLibrary.tsx`: `locale.emptyText` tại :118 — khi `search.trim()` khác rỗng và list rỗng thì hiện `<Empty ... description="Không tìm thấy bộ tài liệu phù hợp" />`, ngược lại giữ "Chưa có bộ tài liệu".

    Bước 3 — `CodingZoneTree.tsx:169-179`: thay `<div className="cz-search-wrap"><span>⌕</span><input .../></div>` bằng `<SearchInput value={query} onChange={(e)=>onQueryChange(e.target.value)} placeholder="Tìm file trong worktree..." aria-label="Tìm file trong worktree" data-testid="coding-zone-tree-search" size="middle" />`. Giữ data-testid/aria-label. Empty state tại :189-193: nếu `query.trim()` khác rỗng thì `<strong>Không tìm thấy file phù hợp</strong><p>Thử đổi từ khóa hoặc chuyển phạm vi sang Tất cả.</p>`; ngược lại giữ 2 thông báo cũ. Xóa hẳn 4 rule `.cz-search-wrap` trong `src/styles/coding-zone.css:60-66`.

    Bước 4 — `SearchEverywhereModal.tsx`: thay khối raw `<input>` + nút clear (:418-452) bằng `<SearchInput ref={inputRef} value={query} onChange={(e)=>setQuery(e.target.value)} onKeyDown={handleKeyDown} placeholder="Tìm kiếm mọi nơi, hoặc gõ '>' để chạy lệnh..." aria-label="Tìm kiếm" size="middle" />` trong cùng div bar; bỏ nút clear thủ công (allowClear đã lo). Đổi `inputRef` (:40) sang `useRef<InputRef>(null)` (import type `InputRef` từ `antd`); lời gọi focus tại :233 vẫn `inputRef.current?.focus()` (InputRef có focus()). Giữ nguyên `handleKeyDown` và mọi nhánh Tab/↑↓/Enter/Esc. Đổi "No results found" (:467) → "Không tìm thấy kết quả". Cập nhật MỌI chuỗi placeholder English trong `src/workbench/search/__tests__/SearchEverywhereModal.test.tsx` sang placeholder tiếng Việt mới; giữ nguyên toàn bộ assertion bàn phím.

    Không đụng `src/workbench/search/find/*`.
  </action>
  <verify>
    <automated>npx vitest run src/components/ui/__tests__/controls.test.tsx src/workbench/search/__tests__/SearchEverywhereModal.test.tsx --bail=1 --reporter=dot && npx tsc --noEmit</automated>
  </verify>
  <done>`SearchInput` tồn tại và export; 7 điểm chuyển đổi không còn `InputSearch`/raw `<input>`/glyph ⌕; test placeholder + keyboard pass; tsc sạch; focus `/` và Tab/↑↓/Enter/Esc ở Search Everywhere vẫn chạy.</done>
</task>

<task type="auto">
  <name>Task 2: Đồng bộ prefix/size/màu ở các site Input có sẵn</name>
  <files>src/components/common/ShortcutHUD.tsx, src/views/AiOfficeView.tsx, src/components/notes/DocFolderTree.tsx, src/components/palette/CommandPaletteModal.tsx, src/components/agents/AgentDiffReviewer.tsx, src/workbench/toolwindows/RemoteGitExplorer.tsx, src/workbench/search/find/FindInRemoteFiles.tsx, src/components/settings/AiToolCatalogCard.tsx, src/workbench/toolwindows/CRExplorer.tsx, src/workbench/toolwindows/SystemsExplorer.tsx, src/workbench/toolwindows/DiagramExplorer.tsx, src/components/notes/DocListPane.tsx</files>
  <action>
    Nguyên tắc chung: broad-read từng file 1 lần rồi Edit ngay; thay `<Input ... prefix={<...style={{color: ...}}/>} ... />` bằng `<SearchInput ... />` (bỏ prefix inline, style fontSize/borderRadius một-off, size small, variant borderless); import `SearchInput` thay `Input` khi `Input` không còn dùng. Giữ nguyên debounce, onKeyDown, data-testid, aria-label, value/onChange và mọi logic lọc. Không đụng matching logic.

    Anchors cụ thể:
    - `ShortcutHUD.tsx:123-135`: chuyển sang `SearchInput`, giữ ref + `handleKeyDown` (↑↓/Enter), bỏ `variant="borderless"`, `style={{fontSize:15,padding:0}}`, `marginRight:6`. Nếu ref đang `HTMLInputElement` thì đổi sang `InputRef` và gọi `.focus()` như Task 1.
    - `AiOfficeView.tsx:256-267`: bỏ hẳn `<Button icon={<ReloadOutlined />} onClick={() => setSearch('')}>` ( nút reset thừa cạnh allowClear ) và import `ReloadOutlined` nếu hết dùng; bỏ `style={{width:280}}`; rút `<Space size="middle">` nếu chỉ bọc mỗi input. Giữ `copy.placeholder`.
    - `DocFolderTree.tsx:971-979`: prefix `#9ca3af` → SearchInput prefix token; bỏ `style={{borderRadius:'var(--radius-control)'}}`; GIỮ NGUYÊN debounce 250ms và count line.
    - `CommandPaletteModal.tsx:436-441`: GIỮ `size="large"` (cố ý khác biệt) nhưng bỏ `fontSize:18` và mọi màu cứng → SearchInput `size="large"` với prefix token mặc định.
    - `AgentDiffReviewer.tsx:629-633`: bỏ size small + `colorTextQuaternary` → SearchInput default.
    - `RemoteGitExplorer.tsx:852-859`: thay `prefix={<span ...>⌕</span>}` bằng SearchInput; giữ chỗ trong flex row và `handleGlobalKeyDown`.
    - `FindInRemoteFiles.tsx:369-375`: CHỈ thêm `placeholder="Tìm kiếm mẫu..."` vào Input `Pattern`; giữ nguyên class `find-pattern`, monospace, byte-exact semantics — KHÔNG thêm prefix, KHÔNG đổi Matching Case/Words/Regex.
    - `AiToolCatalogCard.tsx:131`, `CRExplorer.tsx:238`, `SystemsExplorer.tsx:285`, `DiagramExplorer.tsx:927`, `DocListPane.tsx:281`: thay prefix trần/cứng và override fontSize bằng SearchInput; `DocListPane` chuyển `var(--fg-secondary)` sang prefix token của wrapper mà KHÔNG đụng đường `useDocWorkerSearch`.

    Không thêm file, không đổi test; nếu grep cuối Task 3 thấy raw search `<input>` khác trong các cluster này thì convert luôn ở task này.
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <done>Mọi site ở trên dùng SearchInput; không còn glyph ⌕, `#9ca3af`, `colorTextQuaternary`, fontSize override hay width 280 trong list; palette vẫn large, Find vẫn byte-exact, debounce/keyboard không đổi.</done>
</task>

<task type="auto">
  <name>Task 3: Tách zero-result empty state + dọn width còn lại</name>
  <files>src/views/ChangeRequestsView.tsx, src/views/SystemCatalogView.tsx, src/views/NotesPopoutView.tsx</files>
  <action>
    Broad-read từng file 1 lần rồi Edit ngay. Chuyển search input sang `SearchInput` (bỏ width 260/280 và prefix hard-code nếu còn, bỏ size small), giữ placeholder, debounce, value/onChange.

    Empty state — nguyên tắc: lấy biến filtered list và biến query có sẵn trong file; KHÔNG tạo state hay helper mới. Nếu `query.trim()` khác rỗng VÀ filtered rỗng → hiện `<Empty ... description="Không tìm thấy kết quả cho từ khóa đã nhập" />` (hoặc text tương đương có chứa "Không tìm thấy"); nếu query rỗng VÀ list rỗng → giữ nguyên thông báo "chưa có dữ liệu" cũ.
    - `ChangeRequestsView.tsx:152-153` + khối empty của bảng (:167-180).
    - `SystemCatalogView.tsx:139-140` + khối `systems.length === 0` (:167-179).
    - `NotesPopoutView.tsx:327-330` (size small → SearchInput) + `<Empty description="Không có ghi chú nào">` tại :378-380: khi có query → "Không tìm thấy ghi chú phù hợp", khi không → giữ "Không có ghi chú nào". Giữ `EmptyImageSimple`.

    Sau 3 task, chạy grep kiểm chứng (không đọc lại file): `grep -rn 'InputSearch\|<input\|⌕\|width: 26[08]\|width: 280\|#9ca3af\|colorTextQuaternary' src --include='*.tsx' --include='*.css' | grep -v 'components/ui/input.tsx\|__tests__\|useGlobalKeymap.test'` → rỗng hoặc chỉ còn site ngoài audit có lý do chính đáng (ghi rõ trong SUMMARY). `git diff --stat` không chứa `src/workbench/search/find/*` matching code hay `knowledge-server/`.
  </action>
  <verify>
    <automated>npx tsc --noEmit && grep -rn 'InputSearch\|⌕\|width: 280\|#9ca3af\|colorTextQuaternary' src --include='*.tsx' --include='*.css' | grep -v 'components/ui/input.tsx\|__tests__' ; test $? -eq 1</automated>
  </verify>
  <done>3 view có empty state tách biệt; grep sạch; tsc sạch; diff review xong; Chrome verify sau merge trên main tree (worktree không có dev server).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| search query input → query state | Text do người dùng gõ là untrusted; chỉ đổi UI control, không dựng HTML/regex mới |
| global search keyboard path | ↑↓/Enter/Esc/Tab điều khiển action registry — giữ nguyên handler, không injection |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-tzr-01 | Tampering | `SearchInput` prefix override | mitigate | Prefix mặc định là `SearchOutlined` từ token; caller override vẫn là React node, không render HTML thô; không thêm `dangerouslySetInnerHTML` |
| T-tzr-02 | Tampering | SearchEverywhere keyboard → actions | mitigate | Giữ nguyên `handleKeyDown` và action registry; đổi mỗi placeholder/control, không đổi nhánh phím |
| T-tzr-03 | Information disclosure | byte-exact Find | accept | `src/workbench/search/find/*` cố tình giữ byte-exact, chỉ thêm placeholder; không đụng matching logic |
| T-tzr-SC | Tampering | package installs | accept | Không có package install trong quick task này |
</threat_model>

<verification>
1. `npx vitest run src/components/ui/__tests__/controls.test.tsx src/workbench/search/__tests__/SearchEverywhereModal.test.tsx --bail=1 --reporter=dot` — pass.
2. `npx tsc --noEmit` — sạch sau mỗi task. KHÔNG chạy full vitest suite (quy tắc dự án: >1 giờ).
3. Grep gates ở Task 3; `git diff --stat` không chứa `src/workbench/search/find/*` và `knowledge-server/`.
4. Chrome verify sau merge: mở Search Everywhere, Coding Zone tree, Task filter, Change Requests, Notes popout → cùng kiểu ô tìm kiếm; gõ từ khóa sai → hiện "Không tìm thấy..."; `/` focus, ↑↓/Enter/Esc trong palette và HUD vẫn chạy.
</verification>

<success_criteria>
- Một `SearchInput` duy nhất làm điểm đổi chung; 5 `InputSearch` + 2 raw `<input>` + mọi prefix/size/width lệch đã chuẩn hóa.
- Không còn glyph ⌕, màu cứng, fontSize override, hay width 260/280 ở các site đã audit.
- Zero-result tách khỏi no-data ở Search Everywhere, Coding Zone, DocSetLibrary, Change Requests, System Catalog, Notes popout.
- Keyboard shortcuts và Find byte-exact nguyên vẹn; scoped tests + tsc pass; diff reviewed, Chrome verified.
</success_criteria>

<output>
Tạo `.planning/quick/261122-tzr-chuan-hoa-ui-search-input-toan-app/261122-tzr-SUMMARY.md` khi hoàn tất.
</output>
