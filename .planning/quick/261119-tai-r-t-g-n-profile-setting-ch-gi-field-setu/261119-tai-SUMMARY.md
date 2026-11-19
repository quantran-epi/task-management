---
phase: quick
plan: 261119-tai
subsystem: ui
tags: [react, antd, typescript, config-profiles, json-editor, collapse, indexeddb]

requires:
  - phase: 46
    provides: Configuration Profiles authoring view, profile schema and export/import pipeline
provides:
  - Compact Config Profiles authoring view with no blank secret inputs
  - Pretty-JSON editors with parse-or-shape-check and save-time guard for structured settings
  - AntD Collapse grouping with forceRender preserving every DOM hook
affects:
  - Phase 46 Configuration Profiles follow-up work
  - Any future test that queries ConfigProfilesView fields or secret hooks

tech-stack:
  added: []
  patterns:
    - Structured settings edited as JSON text with JSON.parse + exact shape guard before state write
    - Save-time re-parse of textarea source so no invalid type reaches the Zod envelope
    - AntD Collapse items with forceRender for DOM-hook and accessibility continuity

key-files:
  created: []
  modified:
    - src/views/ConfigProfilesView.tsx
    - tests/views/ConfigProfilesView.test.tsx

key-decisions:
  - "Removed only the useless read-only secret inputs; secret blanking in export/import/schema/checklist stays byte-identical"
  - "JSON_SETTINGS declares object for notification_settings and array for system_type_options; parse failures keep the last valid value in draft.settings and show an inline role=alert"
  - "Save re-parses structuredText before validation and overwrites normalised.settings keys with parsed values, so a string can never reach settings"
  - "All Collapse items use forceRender: true (ghost, defaultActiveKey=[]), and two existing tests open the capacity panel explicitly for role-based button queries"

patterns-established:
  - "Structured profile fields use parseStructuredValue + structuredTextFor rather than plain String() rendering"
  - "Collapsed authoring sections keep children mounted; hidden panels are not queried by getByRole until opened"

requirements-completed: [PROFILE-SETTINGS-COMPACT]

duration: 14min
completed: 2026-11-19
---

# Quick 261119-tai: Rút gọn màn hình soạn Config Profiles Summary

**Bỏ secret input vô dụng, sửa JSON editor parse-hoặc-chặn cho hai field cấu trúc và gộp field vào Collapse mà vẫn giữ mọi DOM hook**

## Performance

- **Duration:** 14 min
- **Started:** 2026-11-19T14:20:18Z
- **Completed:** 2026-11-19T14:34:09Z
- **Tasks:** 3/3
- **Files modified:** 2

## Accomplishments

- Xóa `<Card data-testid="profile-secrets-section">` và mọi `<Input data-secret-field>` khỏi authoring view; giữ nguyên `getSecretFields()` import, `SECRET_LABELS`, `secretFields` trong clone/defaults và bước xóa secret-like khỏi `settings` trong `normaliseDraft`.
- `notification_settings` / `system_type_options` giờ là textarea JSON đẹp có aria-label tiếng Việt; parse + kiểm tra shape (object/array) trước `setSetting`, lỗi hiện inline `role="alert"`, và guard ở `handleSave` chặn lưu/không ghi chuỗi.
- Gộp toàn bộ nhóm field thành một `<Collapse ghost defaultActiveKey={[]}>` với 7 item, mỗi item `forceRender: true`; mọi aria-label, data-testid, `data-machine-specific` và nội dung field vẫn trong DOM.
- Không file nào khác bị đổi: `catalog.ts`, `defaults.ts`, `exportProfile.ts`, `importProfile.ts`, schema, import modal, checklist đều giữ nguyên; không thêm dependency.

## Task Commits

Each task was committed atomically:

1. **Task 1: Bỏ section secret read-only khỏi authoring view** - `16084344` (refactor)
2. **Task 2: Sửa notification_settings & system_type_options thành JSON editor parse-hoặc-chặn** - `66451725` (feat)
3. **Task 3: Gộp các nhóm field vào Collapse, giữ nguyên mọi test hook** - `552d174d` (refactor)

**Plan metadata:** not committed (per constraint: do not commit .planning artifacts)

## Files Created/Modified

- `src/views/ConfigProfilesView.tsx` - authoring view gọn hơn: không secret input, JSON editor có guard, Collapse forceRender
- `tests/views/ConfigProfilesView.test.tsx` - test mới cho secret removed, JSON round-trip/parse-block và DOM hook sau collapse

## Decisions Made

- Secret blanking vẫn do export/import/schema/checklist đảm nhiệm; authoring view chỉ bỏ input hiển thị vô dụng.
- Dùng textarea JSON với `JSON.stringify(..., null, 2)` và `JSON.parse` + shape check thay vì để `String(value)` tạo `[object Object]`.
- Collapse dùng `forceRender: true` trên mọi item để test hook và accessibility name không bị mất khi panel đóng.

## Deviations from Plan

None - plan executed as written. Test assertions dùng `.value` trực tiếp thay vì `toHaveValue(expect.stringContaining(...))` vì matcher không hỗ trợ asymmetric value; two existing tests mở panel capacity bằng `fireEvent.click` trên `.ant-collapse-header` để query nút ẩn theo role (hành vi mong đợi của Collapse).

## Issues Encountered

- Fork repo ban đầu không có `node_modules`; `npx` cố fetch từ registry và lỗi EEXIST/EACCES. Đã symlink tạm `node_modules` từ repo chính (cùng phiên bản dependency) để chạy verification, rồi unlink sau khi xong — không thay đổi tracked files.
- Một số test tĩnh ban đầu fail do hidden Collapse content; sửa bằng cách mở panel trong các test đó. Không thêm dependency.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Caretaker có thể tiếp tục Phase 46 Configuration Profiles; secret/safety pipeline và export/import test unchanged.
- Verification scoped: 24 tests pass (3 files); `npx tsc --noEmit` clean.

---
*Phase: quick*
*Completed: 2026-11-19*

## Self-Check: PASSED

- All modified files found on disk
- All 3 task commits verified in git history
- No untracked artifacts besides the uncommitted `.planning/quick/.../` folder
