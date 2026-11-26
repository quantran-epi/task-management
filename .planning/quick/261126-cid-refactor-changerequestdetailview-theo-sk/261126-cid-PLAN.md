---
phase: quick
plan: 261126-cid
type: execute
wave: 1
depends_on: []
files_modified:
  - src/views/ChangeRequestDetailView.tsx
  - tests/views/ChangeRequestDetailView.test.tsx
  - src/components/tasks/TaskFilterBar.tsx
  - src/components/tasks/TaskTable.tsx
  - src/components/tasks/BatchActionBar.tsx
  - tests/components/TaskTable.test.tsx
autonomous: true
requirements:
  - CR-DETAIL-SKETCH-009-A
  - TASK-LIST-SKETCH-010-A
  - REVIEW-CLEAN
user_setup: []
must_haves:
  truths:
    - "CR Detail có header nén + stats strip lấy từ task/cr/notes đã load sẵn; không thêm query IndexedDB mới"
    - "Bảng task CR giữ nguyên đúng 5 cột Task/Subsystem/Status/Ước lượng/Hạn, thứ tự và mọi data-testid cũ; Select subsystem vẫn chỉ options của cr.targets"
    - "Khối Ghi chú/Jira/Tài liệu/Nhắc nhở hiện thẳng trong bố cục 2 cột, giữ data-testid và count đúng; filter note cr vẫn loại task note và note đã xóa"
    - "Toolbar tìm/lọc TasksView dính đầu khi cuộn; mọi control, aria-label và hành vi lọc/sắp xếp không đổi"
    - "Batch bar vẫn là floating bar gọn dưới cùng, chỉ xuất hiện khi có row chọn; action/xác nhận/xóa hàng loạt giữ nguyên"
    - "Review critical+warning trên diff sạch, typecheck và 5 file test targeted xanh, không chạy full suite"
  artifacts:
    - path: src/views/ChangeRequestDetailView.tsx
      provides: "Header nén, stats strip, grid 2 cột với bảng task 5 cột và khối phụ hiện thẳng"
      contains: "cr-detail-stats"
    - path: tests/views/ChangeRequestDetailView.test.tsx
      provides: "Regression header, 5 cột, subsystem options, stats, khối phụ mở sẵn và drawer/delete flow"
      contains: "cr-detail-block-notes"
    - path: src/components/tasks/TaskFilterBar.tsx
      provides: "Toolbar search/filter sticky top"
      contains: "position: 'sticky'"
    - path: src/components/tasks/TaskTable.tsx
      provides: "Header bảng sticky dưới toolbar, cột và testid không đổi"
      contains: "sticky={{ offsetHeader: 0 }}"
    - path: src/components/tasks/BatchActionBar.tsx
      provides: "Floating batch bar compact theo sketch 010 A"
      contains: "batch-action-bar"
    - path: tests/components/TaskTable.test.tsx
      provides: "Regression sticky toolbar/header + batch bar labels và columns cũ"
      contains: "task-table-container"
  key_links:
    - from: src/views/ChangeRequestDetailView.tsx (stats strip)
      to: tasks + crNotesCount + cr.documentLinks + cr.reminders (useLiveQuery hiện có)
      via: "useMemo tính count/tổng estimate/done từ mảng đã load; không gọi db.notes/workSessions mới"
    - from: src/views/ChangeRequestDetailView.tsx (task table)
      to: subsystemOptions
      via: "giữ nguyên 5 columns, data-testid=subsystem-cell-${record.id} và UNATTACHED_OPTION"
    - from: src/views/ChangeRequestDetailView.tsx (secondary cards)
      to: EntityNotesSection + cr.jiraEpicKey/documentLinks/reminders
      via: "render trực tiếp thay Collapse, vẫn giữ data-testid=cr-detail-block-* và count badge"
    - from: src/views/TasksView.tsx (TaskFilterBar)
      to: src/components/tasks/TaskFilterBar.tsx (root sticky)
      via: "root flex column của view không đổi, style sticky nằm trên root của filter bar"
    - from: src/components/tasks/BatchActionBar.tsx (fixed bar)
      to: src/views/TasksView.tsx (selectedRowKeys)
      via: "selectedCount === 0 vẫn return null; mọi handler db.transaction/confirm giữ nguyên"
---

<objective>
Refactor `ChangeRequestDetailView` theo sketch 009 variant A (header nén, stats strip, bảng task đầy đủ, docs/notes/Jira/reminders hiện thẳng) và `TasksView`/`TaskTable` theo sketch 010 variant A (toolbar tìm/lọc dính đầu, batch bar nổi gọn). Đồng thời rà soát critical+warning trên diff, type-check và chạy targeted test; không đụng schema, query mới hay full test suite.

Purpose: màn hình CR hiện giấu ngữ cảnh trong 3 `Collapse`, không có số liệu tóm tắt; màn hình Tasks có toolbar cuộn mất và batch bar chiếm chỗ. Sếp cần quét nhanh CR và danh sách task trong khi vẫn giữ nguyên mọi test/behavior đã có.

Output: 2 cột CR detail với stats strip và khối phụ mở sẵn; sticky toolbar/header và batch bar compact; focused regression tests; diff sạch review. Không thêm dependency, không đổi Dexie schema, không đụng PWA/GitHub Pages.

Quyết định locked từ `.planning/quick/261126-cid-refactor-changerequestdetailview-theo-sk/261126-cid-CONTEXT.md`: giữ 5 cột + test IDs, giữ cột/test IDs TaskTable, sticky toolbar + batch bar không làm phiền, không query mới, targeted tests only. Chi tiết CSS/class/tách component nhỏ theo discretion và pattern repo.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/STATE.md
@.planning/quick/261126-cid-refactor-changerequestdetailview-theo-sk/261126-cid-CONTEXT.md
@.claude/skills/sketch-findings-task-management/SKILL.md
@.planning/sketches/009-cr-detail-fast-scan/index.html
@.planning/sketches/010-task-list-triage/index.html
@src/styles/workbench-tokens.css
@src/components/ui/ui-tokens.css
@src/views/ChangeRequestDetailView.tsx
@tests/views/ChangeRequestDetailView.test.tsx
@src/views/TasksView.tsx
@src/components/tasks/TaskFilterBar.tsx
@src/components/tasks/TaskTable.tsx
@src/components/tasks/BatchActionBar.tsx
@tests/components/TaskTable.test.tsx
@src/views/__tests__/ChangeRequestDetailView.subsystemOptions.test.tsx
@src/views/__tests__/TasksViewActions.test.tsx
@tests/workbench/CRExplorer.test.tsx

Quan sát lúc lập plan:
- `ChangeRequestDetailView.tsx` đã có `tasks`, `systems`, `crNotesCount` qua `useLiveQuery`; `cr` mang `jiraEpicKey`, `documentLinks`, `reminders`, `reminderDate`, `updatedAt`. Stats phải dùng lại các giá trị này.
- Bảng CR detail đang đúng 5 cột và 2 test file pin cột/testid: `tests/views/ChangeRequestDetailView.test.tsx`, `src/views/__tests__/ChangeRequestDetailView.subsystemOptions.test.tsx`. Không đổi `UNATTACHED_OPTION`, `subsystem-cell-${id}` hay options `Tên (CODE)`.
- Test cũ `keeps the three secondary blocks collapsed by default` đang mâu thuẫn với decision "bỏ collapse"; đổi test đó thành assert khối hiện thẳng. Test note cũ bấm vào block để mở; bỏ bước bấm nhưng giữ assert lọc note.
- `TaskFilterBar.tsx` root đang là flex column có padding/border; `TasksView.tsx` root là flex column không `overflow: hidden`. `TaskTable.tsx` có toolbar nội bộ với sort/column/standup và AntD `Table` sẵn sàng nhận prop `sticky`.
- `BatchActionBar.tsx` đã fixed bottom/center, `data-testid="batch-action-bar"`, text `Đã chọn N tác vụ`, nút `Trạng thái`, `Di chuyển`, `Xóa`, `Bỏ chọn`; chỉ đổi style, giữ handler và `db.transaction`.
- Test `tests/components/TaskTable.test.tsx` pin cột đầu, `Chung`, color tag CR, keyboard, standup, batch bar labels; mọi assert cũ phải xanh.
- Memory project: `npm test` >1 tiếng — chỉ chạy 5 file targeted + `npx tsc --noEmit`. Dùng `--bail=1`, không dùng `-x` (Vitest 5 từng từ chối).
- Token màu lấy từ `useAntdToken()` / CSS var có sẵn; không thêm màu hardcode mới.
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: CR Detail header nén + stats strip + khối phụ hiện thẳng</name>
  <files>src/views/ChangeRequestDetailView.tsx, tests/views/ChangeRequestDetailView.test.tsx</files>
  <behavior>
    - Với CR có 1 task Open, estimate 90m, deadline quá hạn, 2 note cr hợp lệ, 1 documentLink, 1 reminder: stats strip hiện TASK=1, MỞ/PENDING=1, ƯỚC TÍNH=1h 30m, HOÀN THÀNH=0/1, GHI CHÚ=2, DOC/REMINDER=1/1; không có truy vấn Dexie mới nào được tạo.
    - Header giữ CR code, tên, type tag màu `var(--accent)`, status, subsystem pills; thêm meta Jira Epic/ngày cập nhật từ `cr` có sẵn; Tải lại/Sửa/Xóa/Thêm tác vụ vẫn bấm được và testid/code hiện tại không đổi.
    - Bảng task vẫn có đúng 5 cột theo thứ tự Task/Subsystem/Status/Ước lượng/Hạn; option Select vẫn `Payment Service (PAYMENT_SVC)`, `Ledger Service (LEDGER_SVC)`, `Chung (không gắn)` và ghi `systemId` đúng.
    - `cr-detail-block-notes`, `-jira`, `-documents`, `-reminders` hiện thẳng với count badge; body note/Jira/doc/reminder có trong DOM mà không cần click; note nhiễu entityType=task và note đã xóa vẫn bị loại.
  </behavior>
  <action>
    Viết/sửa test trước (đỏ), rồi sửa production:

    Trong `tests/views/ChangeRequestDetailView.test.tsx`: thay ca `keeps the three secondary blocks collapsed by default and badges their counts` bằng ca assert 4 block render mở sẵn (badge count 1/1/1 và nội dung `EPIC-42`, link doc, ngày reminder hiện trong DOM, không cần click). Trong ca lọc note, bỏ `fireEvent.click(block)` nhưng giữ mọi assert về 2 note cr và loại note task/đã xóa. Thêm 1 ca stats strip: seed như `seed()` nhưng tạo thêm 2 note cr + 1 doc link + 1 reminder, assert text/icon của strip theo behavior trên (dùng `formatMinutes` để biết kỳ vọng). Giữ nguyên 8 ca còn lại, không đổi helper mở Select.

    Trong `src/views/ChangeRequestDetailView.tsx`: bỏ import `Collapse`. Thêm `useMemo` (hoặc tính trực tiếp trước return) lấy `taskCount`, `openTaskCount` (status không phải Done/Cancelled), `doneCount`, `totalEstimate = tasks.reduce(...)`, `noteCount = crNotesCount`, `docCount = cr.documentLinks?.length ?? 0`, `reminderCount = cr.reminders?.length ?? (cr.reminderDate ? 1 : 0)`. Render strip `<div data-testid="cr-detail-stats">` ngay dưới header, mỗi stat có label+value, font mono và separator bằng CSS var hiện có; value dùng `formatMinutes(totalEstimate)` và `${doneCount}/${taskCount}`. Không gọi `db.*` mới, không đưa query vào `useLiveQuery` mới.

    Header: nén padding/gap (dùng `var(--gap-*)`), giữ nguyên toàn bộ Tag/Title/Target chips và nút Tải lại/Sửa/Xóa; bổ sung 1 dòng meta compact gồm `cr.jiraEpicKey ?? 'Chưa có'` và `cr.updatedAt.slice(0, 10)` lấy thẳng từ `cr`. Giữ nguyên nhánh `Chưa gắn subsystem` + link `Chọn subsystem`.

    Thay `<Collapse>` bằng grid 2 cột: cột trái giữ nguyên card bảng task (mọi column/render/data-testid/handler/empty state y hệt), cột phải render 4 card nhỏ từ `secondaryBlocks`, mỗi card có header `<span data-testid={block.testId}>` kèm count badge rồi `{block.body}` ngay bên dưới. Responsive: media query không dùng được inline — dùng style `display: 'grid', gridTemplateColumns: 'minmax(0,1.35fr) minmax(280px,.65fr)'` và để flex wrap tự xử lý khi hẹp; không đổi cột bảng. Không dùng `dangerouslySetInnerHTML`; document links giữ `target="_blank" rel="noreferrer"`.
  </action>
  <verify>
    <automated>npx vitest run tests/views/ChangeRequestDetailView.test.tsx src/views/__tests__/ChangeRequestDetailView.subsystemOptions.test.tsx tests/workbench/CRExplorer.test.tsx --bail=1 && npx tsc --noEmit</automated>
  </verify>
  <done>CR Detail có header nén + stats đúng dữ liệu đã load; 5 cột và mọi testid/option subsystem giữ nguyên; 4 khối phụ mở sẵn với count đúng; focused tests + tsc xanh.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Sticky toolbar/header + batch bar compact + quality gates</name>
  <files>src/components/tasks/TaskFilterBar.tsx, src/components/tasks/TaskTable.tsx, src/components/tasks/BatchActionBar.tsx, tests/components/TaskTable.test.tsx</files>
  <behavior>
    - TaskFilterBar root có `position: 'sticky'`, `top: 0`, background đục bằng token; ô tìm kiếm, Segmented, Select CR/Subsystem, Bộ lọc nâng cao, Xóa bộ lọc, RadioGroup horizon vẫn giữ id/aria-label/handler như cũ.
    - TaskTable header dính (`sticky={{ offsetHeader: 0 }}`), vẫn có đúng cột đầu Tác vụ/CR/Subsystem/Trạng thái/Ước lượng/Hạn và `data-testid="task-table-container"`; keyboard Arrow/Enter/Space, sort, column picker, Standup không đổi.
    - BatchActionBar chỉ render khi `selectedCount > 0`, vẫn có `data-testid="batch-action-bar"`, chữ `Đã chọn 2 tác vụ`, các nút `Trạng thái`, `Di chuyển`, `Xóa`, `Bỏ chọn` và modal CR đích/Subsystem đích; style gọn hơn, không che row cuối.
    - Không còn finding critical/warning thuộc diff sau review; không có file test/target nằm ngoài danh sách bị sửa; full suite không được chạy.
  </behavior>
  <action>
    Viết/sửa test trước (đỏ), rồi sửa production:

    Trong `tests/components/TaskTable.test.tsx`: giữ nguyên mọi ca cũ. Thêm 2 ca: filter bar root có inline style sticky/top/background (query bằng `screen.getByPlaceholderText(/Tìm kiếm tác vụ/i).closest('div[style*="sticky"]')` hoặc truyền `data-testid="task-filter-bar"` mới nếu cần hook ổn định — không đổi aria-label cũ); batch bar render với testid và các label cũ khi `selectedCount=2`, và không render khi `selectedCount=0`. Không thêm assert vào `src/views/__tests__/TasksViewActions.test.tsx` (file đó mock cả 3 component, chỉ cần xanh).

    Trong `src/components/tasks/TaskFilterBar.tsx`: thêm style `position: 'sticky', top: 0, zIndex: 20` vào root div, thay nền bằng `token.colorBgElevated` đục (giữ border `token.colorBorderSecondary`, radius và padding cũ), thêm shadow nhẹ bằng `token.boxShadowTertiary`. Không đổi control nào, không đổi state `advancedOpen`, không đổi logic `eligibleSystems`. Nếu cần hook test, thêm `data-testid="task-filter-bar"` trên root — thuần bổ sung, không thay behavior.

    Trong `src/components/tasks/TaskTable.tsx`: thêm prop `sticky={{ offsetHeader: 0 }}` cho AntD `Table`; giữ nguyên toolbar nội bộ (sort/columns/Standup) để tránh chồng 2 lớp sticky. Không sửa `columns`, `visibleColumns`, `rowSelection`, `onRow`, `handleKeyDown`, emptyText. Nếu toolbar nội bộ cần bám theo filter bar, chỉ đổi style của div toolbar hiện tại thành `position: 'sticky', top: 0, zIndex: 10` và đảm bảo filter bar zIndex cao hơn; không đổi DOM control.

    Trong `src/components/tasks/BatchActionBar.tsx`: chỉ restyle khối fixed: padding nhỏ hơn (`6px 12px`), gap `var(--gap-8)`, `bottom: 16`, `maxWidth: 'calc(100vw - 32px)'`, bo góc bằng `var(--radius-control)`, shadow `token.boxShadowSecondary`, border `token.colorBorderSecondary`; các nút dùng `size="small"`/`type="text"` với màu kế thừa token, giữ icon và text hiện tại. Giữ nguyên `if (selectedCount === 0) return null`, mọi handler `handleStatusMenuClick`/`handleDelete`/`handleReparentSubmit`, `Popconfirm`, `Modal`, aria-label `Bỏ chọn`. Không đổi `src/views/TasksView.tsx` trừ khi sticky bị chặn bởi ancestor overflow — nếu có thì chỉ bỏ `overflow` trên root, không đổi state/query.

    Quality gates: chạy skill `code-review` ở effort `medium` trên diff hiện tại, liệt kê critical+warning; sửa mọi finding thuộc 6 file trong `files_modified`, bỏ qua finding ngoài diff và ghi rõ lý do. Chạy lại review nếu có sửa, rồi chạy lệnh verify bên dưới. Không commit, không push.
  </action>
  <verify>
    <automated>npx vitest run tests/views/ChangeRequestDetailView.test.tsx src/views/__tests__/ChangeRequestDetailView.subsystemOptions.test.tsx src/views/__tests__/TasksViewActions.test.tsx tests/components/TaskTable.test.tsx tests/workbench/CRExplorer.test.tsx --bail=1 && npx tsc --noEmit</automated>
  </verify>
  <done>Toolbar search/filter và header bảng dính đầu, batch bar compact mà vẫn giữ labels/handler; mọi targeted test + tsc xanh; review critical/warning trên diff đã sạch; full suite không chạy.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| CR fields/notes → secondary cards | Nội dung note, document link, reminder do người dùng nhập, render thẳng thay vì sau Collapse. |
| task/cr data → stats strip | Số liệu tính từ IndexedDB local, chỉ hiển thị trong tab CR detail. |
| row selection → batch actions | Hàng loạt thay đổi/xóa task đi qua transaction và confirm hiện có. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-cid-01 | T (Tampering) | `ChangeRequestDetailView` secondary cards | medium | mitigate | Render bằng React text node, không `dangerouslySetInnerHTML`; document link giữ `target="_blank" rel="noreferrer"`; filter note cr vẫn chặn note task/đã xóa. |
| T-cid-02 | I (Information disclosure) | `cr-detail-stats` | low | accept | Chỉ lấy từ dữ liệu đã load trong cùng tab; không query/đẩy dữ liệu ra ngoài, không thêm field mới. |
| T-cid-03 | T (Tampering) | `BatchActionBar` | medium | mitigate | Giữ nguyên `db.transaction`, `Popconfirm` xóa và handler status/reparent; restyle không nới quyền hay bỏ confirm. |
| T-cid-SC | Tampering | npm/pip/cargo installs | high | accept | Không cài package mới; chỉ dùng AntD/token và component có sẵn trong repo. |
</threat_model>

<verification>
1. `npx vitest run tests/views/ChangeRequestDetailView.test.tsx src/views/__tests__/ChangeRequestDetailView.subsystemOptions.test.tsx src/views/__tests__/TasksViewActions.test.tsx tests/components/TaskTable.test.tsx tests/workbench/CRExplorer.test.tsx --bail=1` — pass. Không chạy `npm test`.
2. `npx tsc --noEmit` — clean.
3. `git diff --name-only` — chỉ 6 file trong `files_modified`; `src/types/models.ts`, `src/db/*`, `src/validation/*` không đổi.
4. `grep -n "Collapse" src/views/ChangeRequestDetailView.tsx` — không có kết quả; `grep -n "cr-detail-stats" src/views/ChangeRequestDetailView.tsx` — có.
5. `grep -n "data-testid=\"batch-action-bar\"" src/components/tasks/BatchActionBar.tsx` và `grep -n "subsystem-cell-" src/views/ChangeRequestDetailView.tsx` — đều còn.
6. Review `code-review` effort medium trên diff: zero critical, zero warning thuộc diff; nếu có sửa thì chạy lại bước 1-2.
</verification>

<success_criteria>
- CR Detail là sketch 009 A: header nén, stats strip từ dữ liệu có sẵn, grid 2 cột, khối phụ hiện thẳng; 5 cột/test IDs cũ không đổi.
- Task list là sketch 010 A: toolbar/filter dính đầu, header bảng dính, batch bar nổi gọn; columns/test IDs/labels/filter behavior giữ nguyên.
- Không query IndexedDB mới, không đổi schema, không thêm dependency, không đụng PWA/GitHub Pages, không chạy full suite.
- Focused Vitest (5 file) + `tsc --noEmit` xanh; review diff sạch critical/warning.
</success_criteria>

<output>
Create `.planning/quick/261126-cid-refactor-changerequestdetailview-theo-sk/261126-cid-SUMMARY.md` when done
</output>
