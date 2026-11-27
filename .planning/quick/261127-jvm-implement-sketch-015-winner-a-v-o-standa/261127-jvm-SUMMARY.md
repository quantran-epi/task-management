---
phase: quick
plan: 261127-jvm
type: execute
status: complete
started: 2026-11-27
completed: 2026-11-27
---

# Quick Task 261127-jvm: Implement sketch 015 winner A — SSH file picker

## Outcome

- `StandaloneSshFileBrowser` đổi sang layout hai cột: explorer trái (host + folder, click navigate), phải gồm breadcrumb + Up + search + danh sách tệp có size/mtime, footer gom chip selection.
- Checkbox nằm trên file row; folder row không checkbox, click để navigate. Selection lưu trong `Set<string>` dùng chung cho chip/footer/attach; `onAttach(paths)` vẫn gọi một lần với path đã normalize, không đọc nội dung tệp.
- Giữ nguyên bootstrap SSH, `find -iname ... | head -n 201`, `callIdRef`/`cancelRemoteCall`, error message từ service và props từ `ChatInputBar`. Không dependency/CSS/service/type mới.
- State error/empty/searching có CTA ("Thử lại", "Sửa connection SSH", "Về thư mục gốc", "Hủy") và không xoá selection đã chọn.

## Commits

- `32cdfa4c` feat(261127-jvm): two-column SSH file picker with explorer, file rows and selection chips
- `86a670ae` test(261127-jvm): target SSH file rows instead of tree checkboxes
- `482ae277` docs(quick-261127-jvm): implement sketch 015 winner A two-column SSH file picker
- `bdae3362` fix(261127-jvm): harden SSH picker navigation, async state and search indicators after review

## Verification

- `npx vitest run tests/phase51/standaloneAttachmentPersistence.test.tsx --bail=1` — 7/7 passed (gồm 2 regression test mới cho stale listing response + Up bounds).
- `npx tsc --noEmit --pretty false` — clean.
- `git diff --check` — clean.
- `/code-review` mức high: 7 findings (5 important + 1 pre-existing + 1 nit) — tất cả đã fix ở `bdae3362`.
- E2E RFX chưa chạy (cần fixture Tauri/SSH); selector e2e đã cập nhật, ghi nhận là UAT checkpoint.

## Decision

Explorer trái + danh sách tệp phải + footer chip là chuẩn picker; giữ `onAttach(paths)`/search cancellable/không đọc nội dung.
