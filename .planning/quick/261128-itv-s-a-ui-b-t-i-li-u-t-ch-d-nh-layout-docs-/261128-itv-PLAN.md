---
phase: 261128-itv
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/workbench/DocSetLibrary.tsx
  - src/workbench/DocumentSetDetail.tsx
  - src/components/knowledge/DocumentSetForm.tsx
  - src/styles/workbench-tokens.css
  - src/workbench/__tests__/DocumentSetDetailPublished.test.tsx
autonomous: true
requirements: [ITV-01, ITV-02, ITV-03]
must_haves:
  truths:
    - "Rail trái, danh sách doc, inspector phải và modal cấu hình tách rõ bằng ranh giới/khoảng cách — không dính vào nhau ở cả light và dark"
    - "Các nút trong header, toolbar, inspector và form có gap/kích thước ổn định, không chèn vào nội dung hay tràn khi center hẹp"
    - "Danh sách doc, membership list và picker đều render virtual (số row DOM bounded) — không map full dataset ở bất kỳ chỗ nào trên màn hình bộ tài liệu"
    - "Mọi API/export/testid hiện có của DocSetLibrary/DocumentSetDetail/DocumentSetForm giữ nguyên"
  artifacts:
    - path: src/workbench/DocSetLibrary.tsx
      provides: "rail trái tách bạch khung chi tiết (không inline form)"
      contains: "doc-set-library-list"
    - path: src/workbench/DocumentSetDetail.tsx
      provides: "header/toolbar/inspector tách bạch + docs list virtualization giữ nguyên"
      contains: "doc-set-config-modal"
    - path: src/components/knowledge/DocumentSetForm.tsx
      provides: "membership + picker virtualized, đang tách nút khỏi nội dung"
      contains: "VirtualizedList"
    - path: src/styles/workbench-tokens.css
      provides: "CSS doc-set scoped dùng token, không màu cứng"
      contains: ".doc-set-inspector"
    - path: src/workbench/__tests__/DocumentSetDetailPublished.test.tsx
      provides: "assert tách bạch UI + bounded DOM cho doc list/form list"
  key_links:
    - from: src/workbench/DocSetLibrary.tsx
      to: src/workbench/DocumentSetDetail.tsx
      via: "render <DocumentSetDetail setId db /> trong detail panel"
      pattern: "DocumentSetDetail"
    - from: src/workbench/DocumentSetDetail.tsx
      to: src/components/knowledge/DocumentSetForm.tsx
      via: "<Modal className=\"doc-set-config-modal\" ...> chứa form"
      pattern: "doc-set-config-modal"
    - from: src/workbench/DocumentSetDetail.tsx
      to: src/workbench/virtual/VirtualizedList.tsx
      via: "docs list render items={filteredRows}"
      pattern: "items=\\{filteredRows\\}"
---

<objective>
Sửa UI màn hình Bộ tài liệu: tách rõ rail/docs list/inspector/modal cấu hình và các button, đồng thời rà soát virtualization để danh sách nhiều doc vẫn mượt. Giữ nguyên kiến trúc workbench TaskMate và mọi export/testid.

Purpose: Sketch findings 016A + virtual-list/states-pickers đã validate; code hiện tại đã virtualize chỗ chính nhưng vẫn có điểm dính UI (rail sát detail, toolbar sát list, nút sát nội dung form/row) cần targeted fix theo token — không over-engineer, không thêm dependency.

Output: 4 file nguồn + 1 file test scoped, commit staged an toàn, verify Chrome light/dark.

Ràng buộc phiên: KHÔNG đụng `src/components/ui/drawer.tsx`, `TaskDrawer` (session 85), `ChangeRequestDetailView.tsx` + test (session 6a), git links (session 24). Không stage file lạ, không rebase/reset, không đổi branch (`pre-v1.6-baseline`), worktrees=false, KHÔNG push cho tới khi session 85 báo xong drawer.
</objective>

<execution_context>
@/Users/tranducquan/.claude/gsd-core/workflows/execute-plan.md
@/Users/tranducquan/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@CLAUDE.md
@.claude/skills/sketch-findings-task-management/SKILL.md
@.claude/skills/sketch-findings-task-management/references/layout-navigation.md
@.claude/skills/sketch-findings-task-management/references/virtual-list-search.md
@.claude/skills/sketch-findings-task-management/references/states-pickers.md
@src/workbench/DocSetLibrary.tsx
@src/workbench/DocumentSetDetail.tsx
@src/components/knowledge/DocumentSetForm.tsx
@src/workbench/virtual/VirtualizedList.tsx
@src/styles/workbench-tokens.css (dòng 466-591)
@src/workbench/__tests__/DocumentSetDetailPublished.test.tsx
@.planning/quick/261128-fvp-thi-t-k-l-i-right-section-m-n-h-nh-b-t-i/261128-fvp-SUMMARY.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Rà soát virtualization + tách rail/detail/toolbar/inspector</name>
  <files>src/workbench/DocSetLibrary.tsx, src/workbench/DocumentSetDetail.tsx, src/styles/workbench-tokens.css</files>
  <action>
  Chạy `grep -n "VirtualizedList\|virtual" src/workbench/DocumentSetDetail.tsx src/components/knowledge/DocumentSetForm.tsx src/workbench/DocSetLibrary.tsx` trước khi sửa để xác nhận baseline: docs list (`items={filteredRows}` line ~920), membership (`items={members}` line ~476), picker (`items={flatDocs}` line ~556) ĐÃ dùng `VirtualizedList`; rail trái dùng `<List>` thường (số bộ ít, KHÔNG đổi sang virtual trùng lặp). Không tự thêm virtualization mới khi chưa có bằng chứng render full — nếu phát hiện chỗ map full dataset, dùng `VirtualizedList` có sẵn, giữ testid/role/aria.

  Tách các điểm "dính" bằng CSS/layout tối thiểu, dùng token có sẵn (--border, --bg-elev, --gap-*, --fg-secondary; KHÔNG màu cứng):
  - DocSetLibrary: rail `borderRight` giữ nguyên 1px nhưng thêm `paddingRight`/khoảng cách nội bộ cho head (`Space` padding 12) và list row (`padding: '8px 12px'`) sao cho chữ/tag không chạm viền; detail panel giữ `padding: narrow ? 8 : 16`; đảm bảo `minWidth:0` trên cả hai để không tràn khi hẹp. KHÔNG đổi prop `DocSetLibraryProps`, testid `doc-set-library*`, logic ResizeObserver/narrow, không đưa form inline trở lại.
  - DocumentSetDetail: toolbar sticky (line ~883) giữ `position:sticky; top:0; zIndex:5`, thêm khoảng cách dưới rõ (gap/padding) giữa toolbar và virtual list, và giới hạn chiều cao list bằng flex (`flex:1; minHeight:0`) trên container con line ~882 — hiện VirtualizedList `height="100%"` nhưng container cha chưa có `minHeight:0` nên dễ bị đẩy/dính. Header (line 796-838) tách khỏi nút bằng `Space` gap ổn định; các button `size="small"` giữ nguyên aria-label/testid. Inspector giữ 260px, dùng class `.doc-set-inspector` có sẵn; bổ Sung CSS scoped nếu cần (xem Task 2) để head/body/kv/actions có khoảng cách rõ, không đụng dark token.
  - Modal cấu hình giữ `className="doc-set-config-modal"` width 620; KHÔNG sửa z-index của AntD modal (đã tách bạch), chỉ đảm bảo nội dung form không dính sát header modal (CSS Task 2).
  - Giữ nguyên mọi export: `DocSetLibrary`, `DocumentSetDetail`, `publishStateLabel`, `DocumentSetDetailProps`, `DocumentSetFormValue`, `DocumentSetFormHandle`, `snapshotFolderMembers`. Giữ `data-testid`: `doc-row-<id>`, `doc-row-menu-<id>`, `doc-set-detail`, `doc-set-documents`, `doc-set-filter-count`, `doc-set-library*`.

  <behavior>
  - Với 60 docs, số `[data-testid^="doc-row-"]` trong DOM ≤ 25 (fallback jsdom) — không render 60 row cùng lúc.
  - Toolbar `position:sticky`, inspector `flex-shrink:0` 260px, detail list container có `minHeight:0` — computed style assert được trong jsdom.
  - Không có `computeSha256(normalizeMarkdownForHash(note.body))` gọi lại trên mọi note; `computeNoteHashesCached` có sẵn (line ~282) giữ nguyên.
  </behavior>

  <verify>
    <automated>cd /Users/tranducquan/Working/Personal/task-management && npx vitest run src/workbench/__tests__/DocumentSetDetailPublished.test.tsx src/workbench/__tests__/DocumentSetDetailDefaultDb.test.tsx src/workbench/__tests__/DocsWorkspace.test.tsx src/workbench/__tests__/VirtualizedList.test.tsx --bail=1</automated>
  </verify>
  <done>Virtualization baseline được xác nhận (không thêm trùng); rail/detail/toolbar/list/inspector có ranh giới và khoảng cách rõ; API/testid không đổi; scoped tests pass (chấp nhận known baseline `message.error is not a function` unhandled rejection như fvp đã ghi nhận).</done>
</task>

<task type="auto">
  <name>Task 2: Tách button/form controls trong DocumentSetForm + CSS scoped</name>
  <files>src/components/knowledge/DocumentSetForm.tsx, src/styles/workbench-tokens.css</files>
  <action>
  Giữ nguyên membership list và picker dùng `VirtualizedList` (lines ~476/~556) — KHÔNG thay bằng map thường, KHÔNG đổi `estimateSize`, height, role, aria-label hay `data-testid="member-<id>"`.

  Sửa điểm button dính nội dung trong form (theo states-pickers: picker row gọn, nút không chèn vào text):
  - Ở membership `ListItem` (line ~486): thiết lập CSS class mới `.doc-set-member-item` trên ListItem (qua className prop nếu wrapper hỗ trợ; nếu không, bọc nội dung bằng `<div className="doc-set-member-item">`), để tách tên khỏi 3 nút up/down/remove bằng `gap`/`padding` thay vì để AntD list action sát chữ. Giữ nguyên `aria-label` (`Đưa lên`, `Đưa xuống`, `Gỡ <title>`) và handlers `move()`/filter.
  - Ở picker row (line ~564): thay `<Space size="small"><Checkbox>…</Checkbox><Text>{path}</Text></Space>` bằng wrapper `<div className="doc-set-pick-row">` với Checkbox + path có `min-width:0`/ellipsis, checkbox `flex-shrink:0`; giữ `aria-label={doc.title}` và logic `draftSelection`. Không đọc nội dung note, không render markdown.
  - Nút «Thêm tài liệu» (line ~466) và «Lưu thay đổi» (line ~523) giữ nguyên label/aria/disabled, thêm spacing scoped qua CSS `.doc-set-form-compact .ant-btn` đã có min-height 28px; bổ sung margin/gap có token thay vì inline style mới.

  Trong `src/styles/workbench-tokens.css` (khu vực 466-591), thêm/sửa rule scoped `.doc-set-member-item`, `.doc-set-pick-row`, và nếu cần `.doc-set-config-modal .ant-modal-body` để form không dính header modal — CHỈ dùng token runtime (`--gap-*`, `--border`, `--fg-secondary`, `--bg-hover`, `--accent`, `--font-*`), không hardcode màu, không rule global, không đụng drawer/ChangeRequest/git-link CSS. Giữ `.doc-set-inspector*` và `.doc-row-action` hiện có (016A đã verify).

  <behavior>
  - Với 60 members + 60 docs picker, DOM row bounded (≤25 mỗi list); tăng số member không tăng số `[data-testid^="member-"]` quá 25.
  - Click checkbox picker vẫn toggle đúng; click «Gỡ <title>» vẫn xóa đúng id; «Đưa lên/xuống» vẫn đổi thứ tự — không đổi logic state.
  </behavior>

  <verify>
    <automated>cd /Users/tranducquan/Working/Personal/task-management && npx vitest run tests/knowledge/documentSetForm.test.tsx src/workbench/__tests__/DocumentSetDetailPublished.test.tsx src/components/ui/__tests__/controls.test.tsx --bail=1 && npx tsc --noEmit</automated>
  </verify>
  <done>Form membership/picker vẫn virtual, button tách rõ khỏi text bằng CSS scoped, dark/light token không đổi cứng, state handlers giữ nguyên; scoped tests + tsc pass.</done>
</task>

<task type="auto" checkpoint="human-verify">
  <name>Task 3: Chrome light/dark verify + review + staged commit (không push)</name>
  <files>src/workbench/DocSetLibrary.tsx, src/workbench/DocumentSetDetail.tsx, src/components/knowledge/DocumentSetForm.tsx, src/styles/workbench-tokens.css, src/workbench/__tests__/DocumentSetDetailPublished.test.tsx</files>
  <action>
  Chạy scoped test tổng hợp cuối (KHÔNG full vitest — quy tắc dự án): `npx vitest run src/workbench/__tests__/DocumentSetDetailPublished.test.tsx src/workbench/__tests__/DocumentSetDetailDefaultDb.test.tsx src/workbench/__tests__/DocsWorkspace.test.tsx src/workbench/__tests__/VirtualizedList.test.tsx tests/knowledge/documentSetForm.test.tsx src/components/ui/__tests__/controls.test.tsx --bail=1`, rồi `npx tsc --noEmit` và `npx eslint src/workbench/DocSetLibrary.tsx src/workbench/DocumentSetDetail.tsx src/components/knowledge/DocumentSetForm.tsx`. Review diff (`git diff` trên đúng 5 file) fix mọi critical/warning do chính task này sinh ra; KHÔNG sửa lỗi baseline không liên quan (đã có ghi nhận trong fvp summary).

  Verify Chrome thật light + dark ở 1280/768/375 theo thói quen TaskMate: mở workbench Bộ tài liệu, kiểm tra (1) rail trái tách khỏi detail, (2) toolbar filter tách khỏi virtual list và sticky khi cuộn, (3) inspector 260px tách khỏi list, (4) modal cấu hình 620px tách bạch, form membership/picker nút không dính chữ, (5) 60+ docs cuộn mượt (DOM row bounded), (6) light+dark không màu cứng/chữ dễ đọc. Dùng tab Chrome riêng, đóng sau khi xong; KHÔNG đụng tab/session của sếp. Nếu dùng Chrome tool không có sẵn trong executor, ghi rõ kết quả verify bằng testid/computed-style thay vì bịa screenshots.

  Commit staged an toàn, KHÔNG push: `git add` CHỈ 5 file trong `files_modified` (kiểm tra `git status` trước — loại trừ `src/views/ChangeRequestDetailView.tsx`, `tests/views/ChangeRequestDetailView.test.tsx`, `.planning/debug/drawer-open-latency.md`, `.planning/phases/52-*`, mọi file quick khác của session 24/85/6a). Commit message `fix(261128-itv): tách UI bộ tài liệu và rà virtualize docs list` + attribution line theo project. KHÔNG rebase/reset, KHÔNG đổi branch.

  <verify>
    <human-check>Mở Chrome light + dark, xác nhận 6 điểm (1)-(6) ở trên; báo lại «approved» hoặc mô tả lệch.</human-check>
  </verify>
  <done>Scoped tests + tsc + eslint sạch (ngoại trừ baseline đã ghi nhận); Chrome light/dark verified; review critical/warning đã fix; commit chứa đúng 5 file, chưa push.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| (none) | Quick task UI/CSS scoped trong workbench local, không có input xuyênboundary mới; giữ nguyên boundary của DocSetLibrary/DocumentSetDetail/DocumentSetForm. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-ITV-01 | Tampering | doc-set config modal form | accept | Không đổi validation/save path; `isValid`, `save()` và repository calls giữ nguyên, nên không mở rộng bề mặt dữ liệu. |
| T-ITV-02 | Information disclosure | doc row / picker render | accept | Không đưa `Note.body` vào row, không render markdown; giữ row metadata-only như baseline. |
| T-ITV-SC | Tampering | (không có cài đặt package) | accept | Không thêm dependency; dùng `VirtualizedList` + AntD có sẵn. |
</threat_model>

<verification>
- `grep -n "VirtualizedList" src/workbench/DocumentSetDetail.tsx src/components/knowledge/DocumentSetForm.tsx` → vẫn 3 chỗ (docs list, membership, picker); không map full dataset mới.
- Scoped tests (5 file detail/library/virtual + form + controls) pass; `npx tsc --noEmit`; `npx eslint` trên 3 file nguồn sạch.
- Chrome light/dark 1280/768/375: tách bạch rail/toolbar/list/inspector/modal + button; cuộn 60+ docs mượt.
- `git show --stat HEAD` chỉ liệt kê 5 file của task; branch vẫn `pre-v1.6-baseline`; chưa push.
</verification>

<success_criteria>
- Không còn cảm giác "dính" giữa rail/docs list/inspector/modal/button ở light và dark.
- Virtualization hiện diện ở mọi list lớn trên màn hình bộ tài liệu; DOM row bounded khi tăng dataset.
- API/export/testid không đổi; scoped tests, tsc, eslint pass; commit staged đúng scope, không đụng file session khác, không push.
</success_criteria>

<output>
Tạo `.planning/quick/261128-itv-s-a-ui-b-t-i-li-u-t-ch-d-nh-layout-docs-/261128-itv-SUMMARY.md` khi xong (ghi rõ file đổi, kết quả scoped tests, Chrome light/dark, commit hash, trạng thái chưa push).
</output>
