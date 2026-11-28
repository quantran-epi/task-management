# 261128-fvp — Thiết kế lại right section màn hình Bộ tài liệu

**Goal:** Áp sketch 016 winner A vào workbench hiện có: rail trái + danh sách giữ nguyên (kể cả virtualization), bên phải là inspector **chỉ xem** tài liệu. Nút `Cấu hình` mở modal riêng, form có section rõ ràng, không dồn control vào aside. Mỗi doc row có thao tác nhanh sửa/mở/đổi tên/sao chép đường dẫn/xoá khỏi bộ.

**Locked decisions:** variant A (`.planning/sketches/016-doc-set-inspector-redesign/index.html`, ghi `winner: A` trong README). Không làm variant B (tab) hay C (drawer). Không đụng data model, payload, validation, aria-label, data-testid của `DocumentSetForm`.

**Hard scope:** KHÔNG sửa `.planning/STATE.md` (peer đang giữ), `.planning/phases/52-*`, `TaskDrawer.tsx`, `TaskDrawer.test.tsx`, `TaskTable.tsx`, `TaskTable.test.tsx`, CR Detail, backup/sqlite, `ItemInsightView`, planner/tasklist/splash/`AiOfficeExplorer`. Không chạy full vitest. Không `git add -A` / `git add .` — chỉ stage explicit file path.

---

## Task 1 — Tách inspector chỉ-xem và đưa form cấu hình vào modal

**Files:** `src/workbench/DocumentSetDetail.tsx`, `src/styles/workbench-tokens.css`

1. Trong `DocumentSetDetail` (~lines 826-863), thay cụm `<aside>` hiện tại (đang `display: none` form theo `configOpen`) bằng inspector tĩnh:
   - Header: `Chi tiết tài liệu` + nút `Cấu hình` (`aria-label="Cấu hình bộ tài liệu"` hiện có ở header detail (~line 706) giữ nguyên một nguồn mở modal; nút trong aside dùng `aria-label` mới `Mở cấu hình bộ tài liệu` nếu cần phân biệt test).
   - Body: `title`, `path`, size (`formatBytes`), `updatedAt`, `Tag` trạng thái (`STATE_UI`/`STATUS_SHORT`), tên bộ, `Text copyable` cho `id` — toàn bộ là read-only. Khi chưa chọn doc: giữ text `Chọn một tài liệu để xem chi tiết.`
   - Actions: `Mở tài liệu`, `Đổi tên`, `Xoá khỏi bộ` dùng chung handler với row menu ở Task 2 (không tạo abstraction mới).
2. Render form cấu hình trong `<Modal>` (ui wrapper `src/components/ui/modal.tsx`): `open={configOpen}`, `title="Cấu hình bộ tài liệu"`, `width={620}` theo sketch A, `onCancel={() => setConfigOpen(false)}`, `footer={null}` vì `DocumentSetForm` đã có nút `Lưu thay đổi` của riêng nó. Bên trong chỉ render `<DocumentSetForm ref={formRef} notes/formNotes initialSet={set} availableSets={allSets.filter(...)} onSave={...} />` — giữ nguyên mọi prop và logic.
   - Giữ effect `configOpen && pendingPicker` → `formRef.current?.openPicker()` (~lines 588-593) và CTA `Thêm tài liệu` của empty state.
   - `handleSaveDocumentSet` (~line 429): giữ `updateDocumentSet(setId, value, db)` + message cũ; thêm `setConfigOpen(false)` chỉ sau save thành công.
   - Bỏ hoàn toàn nhánh inline `configOpen ? <DocumentSetForm .../> : null` ở narrow width (~lines 855-863); ở `detailWidth < 560` modal vẫn mở được, dòng chọn rút gọn (~lines 802-807) giữ nguyên.
3. CSS mới trong `src/styles/workbench-tokens.css`, scope class riêng (vd `.doc-set-inspector`, `.doc-set-config-modal`): dùng `--border`, `--border-strong`, `--bg-hover`, `--accent-soft`, `--fg-secondary`, `--gap-*`, `--radius-*`; control 28px; spacing 4/8/12/16. Không hard-code màu light/dark. Với `.doc-set-config-modal .doc-set-form-compact`, xếp các `.doc-set-form-group-title` thành section rõ ràng (border top + spacing), giữ nguyên aria/data-testid và validation của form. Không đổi rule global nào khác của file.

**Verify:** `Modal` đóng/mở bằng nút `Cấu hình` ở cả wide (≥560) và narrow (<560); form sections hiện rõ; aside lúc đóng modal không còn control form nào; `DocumentSetForm` không đổi logic.

---

## Task 2 — Thao tác nhanh trên từng doc row

**Files:** `src/workbench/DocumentSetDetail.tsx` (cùng file), `src/components/ui/icon.tsx` (chỉ import `MoreOutlined`, không sửa file)

1. `DocumentRowView` (~lines 109-147): giữ nguyên `data-testid={`doc-row-${row.id}`}`, `role="option"`, `aria-selected`, `aria-label={row.title}`, chiều cao `DOC_ROW_HEIGHT = 38`. Thêm 1 trigger `Button`/`Dropdown` (`Dropdown`, `MoreOutlined` đã có qua `../components/ui` và `../components/ui/icon`) với `aria-label={`Thao tác: ${row.title}`}`, `data-testid={`doc-row-menu-${row.id}`}`, `onClick={(e) => e.stopPropagation()}` để không đổi selection. Dùng 1 cấu hình `menu` ổn định (không dựng `MenuProps` mới mỗi render) — row vẫn là `memo`.
2. Menu items (dùng handler đã có trong `DocumentSetDetail`, truyền xuống props ổn định qua `useCallback`):
   - `Sửa nhanh` → mở tab `notes` với `params: { doc: id }` (`EditorArea` case `notes` đã truyền `initialDocId` vào `NotesView`); dùng `useLayoutStore.getState().openTab` hoặc hook `openTab` hiện có — không thêm route/handler abstraction.
   - `Đổi tên` → `<Modal>` nhỏ với `<Input>` giá trị `row.title`, `aria-label="Tên tài liệu"`, lưu qua `updateNote(id, { title: trimmed }, db)` từ `src/db/repositories/noteRepo.ts` (đã có, validation/Zod ở repository). Không mutate state local.
   - `Sao chép đường dẫn` → `navigator.clipboard.writeText(row.path)` + `message.success` (guard khi clipboard không có; fallback báo lỗi bằng message).
   - `Xoá khỏi bộ` → confirm rồi `updateDocumentSet(setId, { documentIds: set.documentIds.filter((x) => x !== id) }, db)`; **không xoá note gốc**, không mutate `documents`/`rows` local. Dùng `useTaskMateModal` (hook có sẵn trong ui) hoặc `Popconfirm` — không gọi static `Modal.confirm`.
3. Dùng chung 4 handler này cho nút trong inspector ở Task 1. Khi repo trả lỗi, giữ `message.error` và để live query tự cập nhật; không patch local state.

**Verify:** Click `⋯` không đổi `aria-selected` của row; mỗi item gọi đúng repo API; sau đổi tên/xoá, `useLiveQuery` cập nhật danh sách; số DOM row vẫn bounded (≤25 ở test 60 docs).

---

## Task 3 — Scoped test + kiểm tra Chrome

**Files:** `src/workbench/__tests__/DocumentSetDetailPublished.test.tsx` (mở rộng test có sẵn, không tạo file mới nếu không cần)

1. Bổ sung assertion vào describe hiện có:
   - Wide (`setObservedWidth('doc-set-detail', 900)`): bấm `Cấu hình` → `role="dialog"` tên `Cấu hình bộ tài liệu` hiện, form nằm trong dialog; aside không chứa input form; đóng dialog → aside vẫn có thông tin doc đang chọn.
   - Narrow (479): bấm `Cấu hình` vẫn mở dialog, không có form inline trong `doc-set-documents`; toolbar + compact selected line vẫn đúng test cũ.
   - Row menu: click `data-testid="doc-row-menu-<id>"` → 4 item; click `Đổi tên` → nhập tên mới → `db.notes.get(id)` có title mới; click `Xoá khỏi bộ` + confirm → `db.documentSets.get(set.id)` bớt 1 id nhưng `db.notes.get(id)` vẫn tồn tại. Dùng DB riêng của test, cleanup như hiện tại.
2. Verification commands (chạy scoped, tuyệt đối không `npm test`_full):
   - `npx tsc --noEmit`
   - `npx vitest run src/workbench/__tests__/DocumentSetDetailPublished.test.tsx src/workbench/__tests__/DocumentSetDetailDefaultDb.test.tsx src/workbench/__tests__/DocsWorkspace.test.tsx src/workbench/__tests__/VirtualizedList.test.tsx src/components/ui/__tests__/controls.test.tsx --bail=1`
3. Chrome (tab riêng, giữ tab hiện tại): `npm run dev` rồi mở tab mới tới app, vào tab `Bộ tài liệu`. Soi ở 1280 / 768 / 375: (a) light + dark — aside, row menu, modal dùng token, không màu cứng, (b) bấm `Cấu hình` → form section rõ, không chen trong aside, (c) bấm `⋯` trên row → sửa nhanh / đổi tên / sao chép / xoá khỏi bộ chạy đúng, doc gốc còn lại, (d) filter/search vẫn tức thì và số row DOM bounded. Kiểm tra console không có error/warning mới. Đóng tab kiểm tra, không đụng tab đang mở của sếp.
4. Stage explicit: `git add src/workbench/DocumentSetDetail.tsx src/styles/workbench-tokens.css src/workbench/__tests__/DocumentSetDetailPublished.test.tsx` (chỉ file thực sự đổi). Không stage `.planning/STATE.md` — peer session đang giữ.

**Output expectations:** inspector chỉ đọc, modal cấu hình riêng, row action đầy đủ, dark mode token-driven, virtualization + API + validation cũ không đổi.
