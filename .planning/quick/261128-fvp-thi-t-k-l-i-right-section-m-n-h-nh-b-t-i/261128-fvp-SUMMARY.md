---
status: complete
task: 261128-fvp
title: Thiết kế lại right section màn hình Bộ tài liệu (sketch 016 winner A)
---

# 261128-fvp — Tóm tắt thực thi

Sếp, đã áp sketch 016 winner A vào workbench hiện có: rail trái + danh sách docs + virtualization giữ nguyên; bên phải là inspector chỉ-đọc; form cấu hình nằm modal 620px riêng; mỗi doc row có menu 4 thao tác.

## Phạm vi code

- `src/workbench/DocumentSetDetail.tsx`: inspector `Chi tiết tài liệu` thay cho inline form; `<Modal className="doc-set-config-modal" width={620}>` chứa nguyên `<DocumentSetForm>` với mọi prop cũ; `setConfigOpen(false)` chỉ sau save thành công; bỏ hoàn toàn inline form narrow.
- `src/workbench/DocumentSetDetail.tsx`: `DocumentRowView` (vẫn `memo`) thêm nút `⋯` với `aria-label="Thao tác: <title>"`, `data-testid="doc-row-menu-<id>"`, menu ổn định: `Sửa nhanh`, `Đổi tên`, `Sao chép đường dẫn`, `Xoá khỏi bộ`. Row giữ nguyên `data-testid`, `role="option"`, `aria-selected`, `aria-label`, chiều cao 38px. Click menu không đổi selection.
- Handler dùng repository có sẵn: rename `updateNote(id, { title }, db)`; remove `updateDocumentSet(setId, { documentIds: filtered }, db)` qua `useTaskMateModal.confirm` (không xoá note gốc, không patch state local); copy qua `navigator.clipboard.writeText` + message; sửa nhanh mở tab `notes` qua `useLayoutStore.openTab({ id: 'doc-<id>', params: { doc: id } })`.
- `src/styles/workbench-tokens.css`: thêm CSS scoped `.doc-set-inspector*`, `.doc-row-action`, `.doc-set-config-modal .doc-set-form-group-title`; chỉ dùng token runtime (`--border`, `--bg-elev`, `--bg-hover`, `--accent`, `--fg-secondary`, `--gap-*`, `--font-*`), không màu cứng; không đổi rule global cũ.
- Test: mở rộng `src/workbench/__tests__/DocumentSetDetailPublished.test.tsx`; đổi selector đếm row sang `[role="option"]` trong file đó và `src/workbench/__tests__/DocsWorkspace.test.tsx` để không đếm nhầm nút menu. Không đổi logic/aria/data-testid/payload/validation của `DocumentSetForm`.

## Verification

- `npx tsc --noEmit`: pass, không output.
- `npx vitest run src/workbench/__tests__/DocumentSetDetailPublished.test.tsx src/workbench/__tests__/DocumentSetDetailDefaultDb.test.tsx src/workbench/__tests__/DocsWorkspace.test.tsx src/workbench/__tests__/VirtualizedList.test.tsx src/components/ui/__tests__/controls.test.tsx --bail=1`: `Test Files 5 passed (5)`, `Tests 45 passed (45)`, exit code 1 chỉ vì 1 unhandled rejection có sẵn `TypeError: message.error is not a function` tại `src/workbench/DocSetLibrary.tsx:96` (đã xác nhận trên baseline bằng `git stash` trước khi sửa; không phải lỗi task này). Scoped test mới gồm: inspector read-only ở width 900, dialog config mở được ở 900 và 479, không form inline ở narrow, row menu rename → `db.notes.get(id).title` đổi, remove → `db.documentSets.get(set.id)` bớt id nhưng note vẫn tồn tại, row DOM ≤ 25 với 60 docs.

## Commit (code only, explicit paths)

- `736b4046` Task 1 — `src/workbench/DocumentSetDetail.tsx`, `src/styles/workbench-tokens.css`.
- `39ce124c` Task 3 tests — `src/workbench/__tests__/DocumentSetDetailPublished.test.tsx`, `src/workbench/__tests__/DocsWorkspace.test.tsx`.
- `b6ceacd5` Task 2 — `src/workbench/DocumentSetDetail.tsx` (row actions được commit sau cùng để giữ Task 1 là diff tách bạch, không lẫn handler/menu).

Cả 3 commit đều atomic, chỉ code/test; không stage `.planning/STATE.md`, PLAN, SUMMARY hay file của peer.

## Chrome UAT (isolated context `fvp-uat`, page id 5; không đụng tab hiện có)

Dev server `http://localhost:5173/` trả 200. Dùng set «Bộ kiểm tra UAT» với một note.

- 1280 light: inspector 260px «Chi tiết tài liệu» + nút «Cấu hình» hiển thị; khi chưa chọn doc đúng chữ «Chọn một tài liệu để xem chi tiết.»; sau khi chọn row, inspector hiện title, Kích thước `1.4 KB`, Cập nhật `2026-11-28`, Trạng thái `Chưa XB`, Bộ chứa, ID + Copy, 3 action `Mở tài liệu / Đổi tên / Xoá khỏi bộ`. Toolbar/search/filter/sort/count `1 / 1`, rail trái và virtual list vẫn dùng được. Row có nút `aria-label="Thao tác: ..."`; click nút không đổi `aria-selected` (`"false"`).
- Row menu: đúng 4 item. `Sao chép đường dẫn` → toast «Đã sao chép đường dẫn». `Sửa nhanh` → mở tabnotes có `params.doc`, tab tiêu đề theo doc; row selection không đổi. `Xoá khỏi bộ` → dialog «Xoá tài liệu khỏi bộ?» với nút «Xoá khỏi bộ»; sau xác nhận: `documentIds: []`, note vẫn nằm trong store `notes`, toast «Đã xoá tài liệu khỏi bộ», row count 0.
- Rename: dialog «Đổi tên tài liệu» với input `aria-label="Tên tài liệu"` + Hủy/Lưu. Lần đầu dùng tool `fill` của Chrome MCP cho kết quả title bị nối `Tài liệu mớiTài liệu sau đổi tên` trong cả UI lẫn IndexedDB — đây là artifact của tool (chèn vào controlled input thay vì thay thế); dùng native `HTMLInputElement.value` setter + event `input` thì lưu đúng «Tài liệu UAT đã đổi tên», UI và IndexedDB cùng khớp. Unit test rename pass. Không sửa code vì handler/repository đúng.
- Config modal: nút «Cấu hình bộ tài liệu» ở header và «Mở cấu hình bộ tài liệu» trong aside đều mở dialog 620px; các section rõ: `Phạm vi bộ tài liệu`, `Cấu hình nâng cao`, `Thông tin bộ tài liệu`, `Tài liệu thành viên`; nút Close/× đóng được; aside lúc modal đóng không có control form nào.
- Dark: 1280 dark modal + inspector + row/menu dùng token dark, chữ dễ đọc; 768 dark inspector ẩn do center hẹp (356px), toolbar + compact selected line vẫn dùng; 375 dark workbench chật do nhiều tool window mở cùng lúc (pre-existing layout, không phải task này), inspector vẫn ẩn, alert wrap cao, không có form inline. Kiểm tra computed style row dark `rgb(46, 61, 91)` / `rgb(230, 235, 245)`; không thấy màu cứng từ CSS mới.
- Console (`list_console_messages`, tab `fvp-uat`): 7 messages, toàn cảnh báo AntD/PanelGroup có sẵn (`overlayStyle`, `Space direction`, `List` deprecated, `Missing resize handle for PanelGroup`, `Alert message`, `Card bordered`, `Statistic valueStyle`). Không có error/warning mới từ inspector, modal hay row menu. Close tab `fvp-uat` sau khi xong; tab của sếp không bị đụng.

Screenshots UAT (review-only, không commit): `fvp-uat-1280.png`, `fvp-uat-light-1280.png`, `fvp-uat-light-768.png`, `fvp-uat-light-375.png` trong thư mục task này.

## Deviation / ghi chú

- Plan cho phép `Popconfirm`, nhưng dùng `useTaskMateModal().confirm` (controlled) theo ưu tiên của plan, không gọi static `Modal.confirm`.
- `aria-label` nút mở config trong aside là `Mở cấu hình bộ tài liệu` để phân biệt với nút header `Cấu hình bộ tài liệu`, đúng phương án plan nêu.
- Plan Task 3 chỉ liệt kê 3 file để stage; `src/workbench/__tests__/DocsWorkspace.test.tsx` cũng đổi selector (cần thiết để test virtualization không đếm nhầm nút menu), nên đưa vào commit Task 3.
- Không commit artifact docs (`PLAN.md`, `STATE.md`, file SUMMARY này); orchestrator xử lý sau khi peer release `STATE.md`. Không update `ROADMAP.md`.
