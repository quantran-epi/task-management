---
phase: quick-261119-s1j
plan: 01
subsystem: ui
tags: [react, antd, dexie, indexeddb, knowledge-graph, publish-preview, doc_set, workbench]

requires:
  - phase: 45-knowledge-sets-docs-workspace-oracle-connections-team-pinned
    provides: tab doc_set, DocumentSetForm, shared delete dialog, publish/graph primitives
provides:
  - tab doc_set là nơi duy nhất chứa mọi tác vụ per-set (sửa, publish preview, reconcile, graph rebuild/evidence/chunks/status, attempt history, xóa)
  - create-only Modal thay drawer, gọi onOpenSet để mở tab doc_set sau khi tạo
  - DocumentSetDrawer bị xóa hoàn toàn; không còn import hay render
affects: [docs workspace, knowledge publishing UI, phase 16/45 regression tests]

tech-stack:
  added: []
  patterns:
    - mọi state per-set là state local của tab, khóa theo setId (không dùng sets[]/statesBySet map)
    - test injection qua props knowledgeClient/configured/graphStatusOverride thay vì mock module

key-files:
  created: []
  modified:
    - src/workbench/DocumentSetDetail.tsx
    - src/components/notes/DocsLibraryActions.tsx
    - src/workbench/toolwindows/DocsExplorer.tsx
    - src/components/knowledge/DocumentSetDrawer.tsx (deleted)
    - tests/knowledge/DocumentSetPublishFlow.test.tsx
    - tests/knowledge/phase16Acceptance.test.tsx
    - tests/knowledge/NotesWorkspacePublishingIntegration.test.tsx
    - src/workbench/__tests__/DocsWorkspace.test.tsx

key-decisions:
  - Mỗi tab doc_set khóa một setId nên publish state/graph status/reconcile chuyển thành state local của tab
  - Nút "Tạo bộ tài liệu" mở Modal create-only chứa DocumentSetForm; DocsExplorer truyền onOpenSet để mở tab sau khi tạo
  - publishStateLabel chuyển export từ DocumentSetDrawer sang DocumentSetDetail
  - Giữ pageSize=10, fallback defaultDb, WR-02 published query và D-18/D-21 rebuild guards nguyên vẹn
  - Injection points trên DocumentSetDetail chỉ dùng trong test; production vẫn lấy client từ useOptionalKnowledgeConfig

patterns-established:
  - Tab doc_set là single home cho mọi thao tác trên một bộ tài liệu
  - Create set không có setId => thuộc toolbar Modal, không thuộc tab

requirements-completed: []

duration: ~25min
completed: 2026-11-19
---

# Quick 261119-s1j: Chuyển toàn bộ tác vụ DocumentSetDrawer vào tab doc_set — Summary

**Tab doc_set giờ là nơi duy nhất chứa publish preview, reconcile, graph rebuild/evidence/chunks/status, lịch sử xuất bản và xóa bộ; drawer đã bị xóa, create chuyển sang Modal**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-11-19T13:15:00Z
- **Completed:** 2026-11-19T13:41:27Z
- **Tasks:** 3/3
- **Files modified:** 8 (1 deleted)

## Accomplishments

- `DocumentSetDetail` port toàn bộ logic/UI từ drawer 930 dòng: 6 trạng thái publish, reconcile attempt, sửa bộ + preview xuất bản, state machine đồ thị (status/rebuild polling/activate candidate/evidence/chunks retry), lịch sử attempt và xóa bộ có DLP/remote gate.
- `DocsLibraryActions` gọn lại còn create Modal + Zip import + Prompt AI; `DocsExplorer` truyền `onOpenSet` nên tạo xong mở đúng một tab `doc_set`.
- `DocumentSetDrawer.tsx` bị xóa; `grep -rn "DocumentSetDrawer" src tests` trả về rỗng.
- Giữ nguyên pageSize=10, fallback `defaultDb`, WR-02 (`publishedDocuments` HOẶC `publishAttempts`), D-18 rebuild disabled khi chưa có snapshot/configured/đang build và Modal xác nhận D-21.
- Tests phase 16, publish-flow và integration được migrated sang tab/create-modal; thêm 2 test DocsWorkspace cho tab đầy đủ tính năng và rebuild gate.

## Task Commits

1. **Task 1: Port mọi tính năng per-set của drawer vào tab doc_set** - `0f708526` (feat)
2. **Task 2: Đổi DocsLibraryActions sang Modal tạo bộ và xóa DocumentSetDrawer** - `610f9fd6` (refactor)
3. **Task 3: Di chuyển test drawer sang tab và khóa regression** - `fa9d58af` (test)

**Plan metadata:** không commit (theo yêu cầu quick task, orchestrator xử lý artifacts)

## Files Created/Modified

- `src/workbench/DocumentSetDetail.tsx` - tab doc_set đầy đủ tính năng per-set; export `publishStateLabel`
- `src/components/notes/DocsLibraryActions.tsx` - create-only Modal, Zip import, Prompt AI; bỏ machinery publish/graph
- `src/workbench/toolwindows/DocsExplorer.tsx` - wire `onOpenSet={handleOpenDocumentSet}`
- `src/components/knowledge/DocumentSetDrawer.tsx` - đã xóa
- `tests/knowledge/DocumentSetPublishFlow.test.tsx` - render tab thay drawer; seed DB theo trạng thái
- `tests/knowledge/phase16Acceptance.test.tsx` - assert 6 nhãn trạng thái thay smoke loop drawer
- `tests/knowledge/NotesWorkspacePublishingIntegration.test.tsx` - preview/DLP/create/error path chạy qua tab + Modal
- `src/workbench/__tests__/DocsWorkspace.test.tsx` - 2 test mới: tab đầy đủ + rebuild gate

## Decisions Made

- State per-set là local của tab, không cần map `statesBySet` như drawer.
- `onOpenSet` (đã khai báo nhưng trước đây unused) giờ được DocsExplorer truyền để mở tab sau create; NotesView không truyền nên chỉ đóng Modal.
- Thêm 3 props injection (`knowledgeClient`, `configured`, `graphStatusOverride`) trên `DocumentSetDetail` để test không cần mock module; production không dùng.
- Test integration cũ chạy qua drawer trong NotesView được chuyển sang render `DocumentSetDetail` trực tiếp dưới `KnowledgeConfigProvider` — đây là đường path đúng sau khi drawer bị xóa.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Bounded-page regression test đếm cả bảng Descriptions của graph**
- **Found during:** Task 1
- **Issue:** `detail.querySelectorAll('table tbody tr')` giờ thấy thêm 2 dòng `ant-descriptions-row` của summary card, không còn đúng 10.
- **Fix:** thêm `data-testid="doc-set-documents"` trên bảng tài liệu; test scoped selector vào bảng đó. Cùng lúc thêm lại `aria-label="Xóa bộ tài liệu ${set.name}"` cho nút xóa (mất khi viết lại header).
- **Files modified:** `src/workbench/DocumentSetDetail.tsx`, `src/workbench/__tests__/DocsWorkspace.test.tsx`
- **Verification:** 8/8 scoped tests pass sau fix
- **Committed in:** `0f708526`

**2. [Rule 1 - Bug] `Tests/knowledge/NotesWorkspacePublishingIntegration.test.tsx` vẫn drive drawer đã xóa**
- **Found during:** Task 3
- **Issue:** file này không nằm trong `read_first` của plan nhưng 4 test click "Bộ tài liệu" → "Mở chi tiết" (drawer). Sau khi xóa drawer, cả 4 fail.
- **Fix:** rewrite 4 test dùng `DocumentSetDetail` dưới `KnowledgeConfigProvider` (và `DocsLibraryActions` cho create path), với `graphStatusOverride` để graph effect không phát thêm fetch làm lệch spy count; sort notes theo `updatedAt` như `NotesView` thật để giữ thứ tự membership.
- **Files modified:** `tests/knowledge/NotesWorkspacePublishingIntegration.test.tsx`
- **Verification:** 4/4 pass; tổng 36/36 scoped pass
- **Committed in:** `fa9d58af`

**3. [Rule 1 - Bug] State tag chưa cập nhật khi test seed DB trước render**
- **Found during:** Task 3
- **Issue:** `useLiveQuery` trả default rỗng rồi update async; assertion chạy quá sớm thấy "Chưa xuất bản".
- **Fix:** helper `renderTab` flush thêm một microtask trong `act` sau `findByTestId`.
- **Files modified:** `tests/knowledge/DocumentSetPublishFlow.test.tsx`
- **Verification:** test "derives each tab detail from its own set state" pass
- **Committed in:** `fa9d58af`

---

**Total deviations:** 3 auto-fixed (3 bug). Impact: chỉ test/selection; không đổi schema, dependency hay D-18/D-21 guards.

## Issues Encountered

- `npx tsc --noEmit` chạy nhiều lần trong quá trình (sau mỗi task) để so lỗi import của test trước khi Task 3 sửa xong; lần cuối sạch.
- Không chạy full Vitest suite (quy tắc dự án: >1 giờ).

## User Setup Required

None.

## Next Phase Readiness

- Tab doc_set là entry point duy nhất cho mọi tác vụ bộ tài liệu; drawer đã bị loại bỏ hoàn toàn.
- NotesView thường vẫn render PageHeader/DocsLibraryActions bình thường; create mở Modal, không điều hướng khi không có `onOpenSet`.
- Có thể xóa comment "legacy drawer" trong `DocumentSetDeleteDialog` ở quick task sau (chỉ văn phong, không ảnh hưởng hành vi).

## Self-Check: PASSED

- Tất cả 8 file tồn tại; `DocumentSetDrawer.tsx` đã bị xóa.
- Cả 3 commit tồn tại trong git history.
- 36/36 scoped Vitest tests pass (6 file), `npx tsc --noEmit` sạch, grep `DocumentSetDrawer` trong src/tests trả về rỗng.

---
*Phase: quick-261119-s1j*
*Completed: 2026-11-19*
