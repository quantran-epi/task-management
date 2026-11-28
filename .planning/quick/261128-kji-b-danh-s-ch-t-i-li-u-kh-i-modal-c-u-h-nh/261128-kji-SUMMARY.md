---
phase: quick
plan: 261128-kji
subsystem: knowledge / workbench
tags: [doc-set, modal, detail, membership, presentation-order]
dependency_graph:
  requires: []
  provides: [DOCSET-MODAL-DOC-LIST-MOVE]
  affects: [src/workbench/DocSetLibrary.tsx]
tech_stack:
  added: []
  patterns:
    - "Form cấu hình chỉ emit documentIds lúc tạo; edit KHÔNG emit để tránh ghi đè membership"
    - "Detail là nơi duy nhất thao tác tài liệu; reorder qua updatePresentationOrder"
key_files:
  created: []
  modified:
    - src/components/knowledge/DocumentSetForm.tsx
    - src/workbench/DocumentSetDetail.tsx
    - src/workbench/__tests__/DocumentSetDetailPublished.test.tsx
decisions:
  - "Chuyển DocumentSetForm từ forwardRef sang function component thuần; bỏ DocumentSetFormHandle/openPicker"
  - "Picker thêm tài liệu do DocumentSetDetail sở hữu; search/filter tái dùng foldForSearch/searchIncludes"
  - "Reorder swap trên set.documentIds gốc, disable ở biên, đi qua updatePresentationOrder"
metrics:
  duration: ~8 phút
  completed_date: 2026-11-28
---

# Phase quick Plan 261128-kji: Bỏ danh sách tài liệu khỏi modal cấu hình bộ Summary

Modal "Cấu hình bộ tài liệu" giờ chỉ chứa cấu hình bộ (tên, preset/scope, alias, quan hệ, isBase). Mọi thao tác tài liệu chuyển sang `DocumentSetDetail`: picker thêm, xoá, đổi tên, mở, sắp xếp lên/xuống qua `updatePresentationOrder`. Lưu cấu hình lúc edit không còn emit `documentIds` nên không ghi đè membership.

## Commits

| Task | Commit | Files |
|------|--------|-------|
| 1 | `3f59d7c9` | `src/components/knowledge/DocumentSetForm.tsx` |
| 2 | `dc798952` | `src/workbench/DocumentSetDetail.tsx` |
| 3 | `d1820272` | `src/workbench/__tests__/DocumentSetDetailPublished.test.tsx` |

## Changes

### Task 1 — Form chỉ giữ cấu hình bộ
- Xoá section "Tài liệu thành viên" (VirtualizedList, move, 3 nút) và modal picker + state/import liên quan.
- Bỏ `forwardRef`/`useImperativeHandle`/`DocumentSetFormHandle`; `openPicker` không còn tồn tại.
- "Khởi tạo từ" chỉ còn `Bộ trống` / `Từ thư mục hiện tại`; type `mode` thuần `'empty' | 'folder'`.
- `DocumentSetFormValue.documentIds` thành optional; `save()` chỉ emit khi `!initialSet` (folder snapshot hoặc `[]`).
- Giữ nguyên dòng `style={{ width: '100%', minWidth: 0 }}` của `Form`.

### Task 2 — Detail làm chủ tài liệu
- Bỏ `formRef`, `pendingPicker`, useEffect gọi `openPicker`; modal config render form không truyền `ref`.
- Toolbar `.doc-set-docs-toolbar` có nút "Thêm tài liệu" (`data-testid="doc-set-add-documents"`); `Empty` cũng mở picker mới.
- Picker: `SearchInput aria-label="Tìm tài liệu để thêm"`, `VirtualizedList aria-label="Danh sách tài liệu để chọn"`, class `.doc-set-pick-row`, nguồn `allNotes` lọc `!deletedAt`, không folder/diagram, chưa thuộc bộ; append id vào cuối `set.documentIds` qua `updateDocumentSet`.
- Reorder: row menu + inspector có "Đưa lên"/"Đưa xuống", swap trên `set.documentIds` gốc qua `updatePresentationOrder`, disable ở biên. Giữ rename/remove/copy/open, filter/sort, virtual list, graph/publish.

### Task 3 — Scoped test
- Thay test membership/picker cũ bằng: (1) edit → assert form sạch + payload không có `documentIds`; (2) tạo mới → payload có `documentIds: []`.
- Thêm test: bấm `doc-set-add-documents`, chọn 1 note, xác nhận → DB chứa id mới; mở row menu cuối, "Đưa lên" → thứ tự đổi, `presentationRevision` +1, `publishedDocuments` không đổi.
- Giữ assertion CSS `.doc-set-pick-row`.

## Verification

- `npx vitest run src/workbench/__tests__/DocumentSetDetailPublished.test.tsx --bail=1`: 11 tests passed.
- `npx tsc --noEmit`: không có lỗi trong 3 file của plan. Có lỗi tsc trong `src/context/TimerContext.tsx` (unused import, thiếu `useState`, implicit any) — file ngoài scope, đang bị session khác sửa đồng thời; không đụng vào.
- Grep: `DocumentSetForm.tsx` không còn `Tài liệu thành viên` / `Chọn tài liệu` / `openPicker`; `DocumentSetDetail.tsx` có `updatePresentationOrder` + `doc-set-add-documents`, không còn `formRef`.
- Row count <=25 với 60 docs vẫn được assertion trong test bounded list cũ.

## Deviations from Plan

### Auto-fixed Issues
Không có — plan thực hiện đúng. Lỗi tsc ngoài scope (`TimerContext.tsx`) và test tạo mới cần điền tên trước khi bấm "Lưu thay đổi" (nút disabled khi tên rỗng) được xử lý trong test, không phải deviation.

## Threat Flags
Không có surface mới ngoài `<threat_model>`: picker chỉ lấy id từ `allNotes` đã lọc `!deletedAt`; `updateDocumentSet` validate bằng `DocumentSetSchema.parse`.

## Known Stubs
Không có.
