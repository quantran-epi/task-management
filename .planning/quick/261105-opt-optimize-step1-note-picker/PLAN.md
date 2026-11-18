---
phase: quick
plan: 261105-opt
type: execute
autonomous: true
requirements: [PERF-virtualize-step1-notes, PERF-defer-search-step1-notes]
files_modified:
  - src/components/sdlc/steps/Step1IntakeView.tsx
must_haves:
  truths:
    - "Note list inside Step1IntakeView modal uses VirtualizedList to prevent DOM overload with large note collections"
    - "Search query is deferred with useDeferredValue and search filter short-circuits title match before scanning body text"
    - "Empty search results display clear Vietnamese empty notice: Không tìm thấy ghi chú nào phù hợp bộ lọc"
    - "All existing unit tests in ProjectSdlcPerformance.test.tsx and StepViews.test.tsx pass without regression"
  artifacts:
    - { path: src/components/sdlc/steps/Step1IntakeView.tsx, contains: "useDeferredValue" }
    - { path: src/components/sdlc/steps/Step1IntakeView.tsx, contains: "VirtualizedList" }
---

# Quick plan — Tối ưu hóa Note Picker Modal trong Step1IntakeView

## Context
Step1IntakeView mở modal chọn note để nạp vào PL01/PL02. Danh sách hiện tại render qua Ant Design `List` không ảo hoá, tìm kiếm lọc trực tiếp từng ký tự không defer và quét toàn bộ text body cho mọi note.

## Task 1 — Virtualize danh sách note và tối ưu search với useDeferredValue
File: `src/components/sdlc/steps/Step1IntakeView.tsx`

1. Import `useDeferredValue` từ React và `VirtualizedList` từ `../../../workbench/virtual/VirtualizedList`.
2. Khai báo `const deferredSearch = useDeferredValue(searchQuery);`.
3. Tối ưu `filteredNotes` với `useMemo`:
   - Dùng `deferredSearch`.
   - Short-circuit: nếu `matchTitle` đúng thì không quét `body`.
4. Thay thế `<List>` bằng `filteredNotes.length === 0` fallback hoặc `<VirtualizedList>`:
   - Nếu rỗng: hiển thị text `'Không tìm thấy ghi chú nào phù hợp bộ lọc'` chuẩn xác cho test/UX.
   - Nếu có data: render qua `<VirtualizedList items={filteredNotes} height={420} estimateSize={() => 76} />` với action "Chọn" và preview.

## Verification
- `npx vitest run tests/unit/sdlc/ProjectSdlcPerformance.test.tsx tests/unit/sdlc/StepViews.test.tsx`
- `npx tsc --noEmit`
