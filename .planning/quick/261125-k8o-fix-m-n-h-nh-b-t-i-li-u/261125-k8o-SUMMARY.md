---
phase: quick
plan: 261125-k8o
status: complete
subsystem: workbench-doc-set
tags: [ui, doc-set, virtual-list, layout]
updated_at: "2026-11-25T15:20:00Z"
key-files:
  created: []
  modified:
    - src/workbench/EditorArea.tsx
    - src/workbench/DocSetLibrary.tsx
    - src/workbench/DocumentSetDetail.tsx
    - tests/knowledge/DocumentSetPublishFlow.test.tsx
    - src/views/ChangeRequestDetailView.tsx
    - src/views/ItemInsightView.tsx
    - src/workbench/toolwindows/UtilityToolPanel.tsx
    - src/workbench/__tests__/UtilityToolPanel.test.tsx
commits:
  - 39221b84
  - f3c31fd5
---

# Quick 261125-k8o: Sửa bố cục màn hình Bộ tài liệu Summary

Đưa danh sách tài liệu lên đầu vùng chi tiết, bỏ nested scroll, dùng virtual list full-height và inspector phải 260px; các control/testid cũ vẫn giữ nguyên.

## Thay đổi

- Commit `39221b84`: commit riêng 4 file UI diff có sẵn (`ChangeRequestDetailView`, `ItemInsightView`, `UtilityToolPanel` + test); không trộn với DocSet.
- Commit `f3c31fd5`:
  - `EditorArea.tsx`: tab `doc_set_library` dùng `overflow: hidden` và `padding: 0`, loại bỏ scroller ngoài.
  - `DocSetLibrary.tsx`: detail pane `overflow: hidden`, flex column; rail 160/248 và padding 8/16 giữ nguyên.
  - `DocumentSetDetail.tsx`: root `overflow: hidden`; docs section đứng trước graph/history, chiếm phần cao còn lại; `VirtualizedList` dùng `height="100%"`; graph/history gộp thành pane dưới compact; `DocumentSetForm` chuyển vào inspector sau nút `Cấu hình` (nút header `Cấu hình bộ tài liệu` dùng khi hẹp); empty-state CTA mở config rồi picker.
  - `DocumentSetPublishFlow.test.tsx`: test bấm nút cấu hình trước khi truy cập form.

## Verification

- `npx vitest run src/workbench/__tests__/VirtualizedList.test.tsx src/workbench/__tests__/DocumentSetDetailPublished.test.tsx src/workbench/__tests__/DocumentSetDetailDefaultDb.test.tsx tests/knowledge/DocumentSetPublishFlow.test.tsx --bail=1` → 4 files / 26 tests pass.
- `npx tsc --noEmit`: chỉ còn lỗi có sẵn từ session Graphiti khác (`McpConfigCard.tsx` import `applyGraphitiRules` không tồn tại trong `graphitiRules.ts`); không sửa file đó.
- Chrome thật 1440x900 (Google Chrome + Playwright, Vite dev server, browser-only route stub cho `/src/services/ai/graphitiRules.ts`): tab `Bộ tài liệu`, bộ 60 doc; `doc-set-detail` 751px cao, docs 262px, virtual list 217px, 10 row DOM, filter count `60 / 60`, inspector 260px, sort newest-first, header/action graph hiển thị. Screenshot: `/tmp/k8o-chrome/docset-1440x900.png`. Không patch source Graphiti.
- `src/workbench/__tests__/DocsWorkspace.test.tsx` không chạy được trong worktree này: Vitest báo `Error: Denied ID .../node_modules/pdfjs-dist/build/pdf.worker.min.mjs?url` ở phase transform (0 test). Đã thử xóa cache `node_modules/.vite` trong worktree nhưng lỗi vẫn vậy; đây là lỗi môi trường/module resolution, không phải assertion DocSet.

## Deviations from Plan

- Plan file `.planning/quick/261125-k8o-fix-m-n-h-nh-b-t-i-li-u/261125-k8o-PLAN.md` không tồn tại trong worktree khi bắt đầu (thư mục rỗng). Phạm vi được khôi phục từ transcript của planner agent cùng task; các task đã thực hiện theo phạm vi đó.
- `DocumentSetPublishFlow.test.tsx` không nằm trong danh sách test được nêu trong plan nhưng cần cập nhật vì form chuyển sau nút cấu hình; đây là hệ quả trực tiếp của task DocSet.
- Không merge/push sang `pre-v1.6-baseline`; orchestrator xử lý sau.

## Known Stubs

- Browser-only route stub cho `graphitiRules.ts` chỉ tồn tại trong script Chrome tạm, đã xóa; không có stub trong source.

## Threat Flags

- Không có bề mặt mới: chỉ sắp xếp lại UI local và test; không thêm network/auth/schema.

## Self-Check: PASSED

- SUMMARY.md tồn tại; commit `39221b84` và `f3c31fd5` tồn tại trong git history.
- Working tree sạch ngoài thư mục planning chưa commit (theo constraint của task).
