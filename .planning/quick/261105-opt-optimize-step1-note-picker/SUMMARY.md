---
phase: quick
plan: 261105-opt
status: complete
date: 2026-11-05
requirements: [PERF-virtualize-step1-notes, PERF-defer-search-step1-notes]
files_modified:
  - src/components/sdlc/steps/Step1IntakeView.tsx
  - tests/unit/sdlc/StepViews.test.tsx
---

# Quick task summary — Tối ưu hóa Note Picker Modal trong Step1IntakeView

## Changes
1. **Virtualization**:
   - Thay Ant Design `<List>` bằng `<VirtualizedList>` (dùng `@tanstack/react-virtual` có sẵn trong workbench) trong modal Note Picker của `Step1IntakeView`.
   - Giữ nguyên fallback text `"Không tìm thấy ghi chú nào phù hợp bộ lọc"` khi kết quả rỗng.
   - Thêm `estimateSize={() => 76}`, `role="list"`, `aria-label="Danh sách ghi chú"`.

2. **Search Optimization**:
   - Dùng React 19 `useDeferredValue` cho `searchQuery` để nhập liệu trên input hoàn toàn mượt mà, không giật lag.
   - Short-circuit lọc: nếu `title` khớp từ khóa thì return ngay, không quét chuỗi `body` dài của note.

3. **Tests**:
   - Bổ sung test kiểm thử ảo hóa và lọc debounce/deferred trong `tests/unit/sdlc/StepViews.test.tsx`.
   - Toàn bộ 15 test trong `StepViews.test.tsx` và `ProjectSdlcPerformance.test.tsx` đều pass.
