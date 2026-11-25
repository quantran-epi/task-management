---
phase: quick
plan: 261125-qdr
subsystem: ui
tags: [react, antd, tabs, profile-export, recipient-metadata, indexeddb]

requires:
  - phase: 46
    provides: "ConfigProfilesView, buildProfileExportPayload, catalog machine/secret classifiers"
  - phase: sketch-005/006
    provides: "005C shell rail-editor-review và 006B checklist không chặn export"

provides:
  - "Shell 3 vùng 220px / minmax(0,1fr) / 296px với rail tìm kiếm, Mới, Nhân bản"
  - "Metadata recipient lưu local trên ConfigurationProfile, tách khỏi JSON export"
  - "Editor 4 tab forceRender giữ mọi field/testid/aria-label cũ"
  - "Panel rà soát 3 checkbox + cảnh báo field theo máy + preview JSON của draft"
  - "Regression tests cho recipient-local, id ổn định, nhân bản, tìm kiếm, tab, preview"

affects: [profile-authoring, config-profile-export, config-profile-import]

tech-stack:
  added: []
  patterns:
    - "normalisedDraftFor dùng chung cho path lưu và preview, tránh preview lệch bản lưu"
    - "recipient là optional field tách ở buildProfileExportPayload trước khi spread vào envelope strictObject"
    - "AntD Tabs forceRender thay Collapse để DOM hook vẫn reachable ở mọi tab"

key-files:
  created: []
  modified:
    - src/views/ConfigProfilesView.tsx
    - src/services/configProfiles/types.ts
    - src/services/configProfiles/exportProfile.ts
    - tests/views/ConfigProfilesView.test.tsx
    - tests/services/configProfiles/exportProfile.test.ts

key-decisions:
  - "recipient?: string nằm trên ConfigurationProfile nhưng không nằm trong ConfigProfileEnvelopeSchema; export destructures bỏ field này trước khi đóng gói"
  - "Giữ ConfigProfileExportButton nguyên vẹn: 3 checkbox là chỉ báo, không phải gate"
  - "Không thêm ô nhập secret; panel liệt kê secret đã khai báo và để trống trong preview"
  - "Preview JSON lấy từ normalisedDraftFor(draft), không đọc db/settings/keyring; exportedAt theo updatedAt của draft"
  - "Dùng mock antd App.useApp().notification trong test file vì jsdom không có contextHolder AntD App"

patterns-established:
  - "Shell profile authoring: rail trái cố định, editor giữa, review panel phải, footer dính"
  - "Review panel không gated export: checklist chỉ nhắc nhở, import đã có checklist riêng"

requirements-completed: [PROFILE-RAIL-SEARCH-DUPLICATE, PROFILE-RECIPIENT-LOCAL, PROFILE-4-TABS, PROFILE-REVIEW-PANEL]

duration: 25min
completed: 2026-11-25
---

# Quick 261125-qdr: Refactor ConfigProfilesView theo sketch 005C + 006B Summary

**Shell rail-editor-review 3 vùng với recipient local-only, 4 tab forceRender và preview export JSON của đúng draft đang soạn**

## Performance

- **Duration:** ~25 phút
- **Started:** 2026-11-25T12:04:12Z
- **Completed:** 2026-11-25T12:28:49Z
- **Tasks:** 2/2
- **Files modified:** 5

## Accomplishments

- Rail trái 220px liệt kê mọi profile, tìm kiếm theo tên/người nhận không phân biệt hoa thường, nút Mới và Nhân bản; đổi tên giữ nguyên id, nhân bản copy config/recipient sang id mới.
- Editor có ô `Người nhận` là metadata nội bộ, lưu cùng settings row nhưng bị tách khỏi payload export trước khi validate bằng schema `strictObject`.
- 5 `Collapse` cũ gom thành 4 tab `Cơ bản` / `Kết nối` / `AI & Team` / `Công suất` với `forceRender: true`; mọi `data-testid`, `aria-label` và validation WR-02/WR-04 vẫn giữ nguyên.
- Panel phải hiện 3 checkbox rà soát, cảnh báo vàng số field theo máy có giá trị, số secret đã khai báo và `<pre>` preview JSON render bằng text node React.

## Task Commits

1. **Task 1: Shell 3 vùng + metadata người nhận + quản lý nhiều profile** — `6ddc55ab` (feat)
2. **Task 2: 4 tab nhóm field + panel rà soát/preview không chặn Export** — `921bdc3a` (feat)

**Plan metadata:** Không commit artifact docs theo yêu cầu quick task; orchestrator xử lý.

## Files Created/Modified

- `src/views/ConfigProfilesView.tsx` — shell 3 cột, state recipient/search/reviewChecks, 4 tab, panel review, helper `normalisedDraftFor`.
- `src/services/configProfiles/types.ts` — thêm `recipient?: string` với comment local-only.
- `src/services/configProfiles/exportProfile.ts` — tách `recipient` khỏi profile trước khi đóng gói envelope.
- `tests/views/ConfigProfilesView.test.tsx` — giữ 11 ca cũ, đổi helper sang tab, thêm 10 ca regression + mock notification jsdom.
- `tests/services/configProfiles/exportProfile.test.ts` — thêm ca assert payload không có `recipient` và envelope vẫn parse được.

## Decisions Made

- `recipient` optional nên profile cũ vẫn hợp lệ; schema import/validation không đổi.
- Preview lấy từ draft đang soạn, không đọc live settings — giữ bất biến D-01.
- Checkbox rà soát không chặn export (006B), export button vẫn bật ngay khi có profile đã lưu.
- Giữ hạn chế đã có: không render ô nhập secret trong authoring view.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `getDeclaredProfileMachineFields` không nhận `GhostDevConfig` trực tiếp**
- **Found during:** Task 2
- **Issue:** `GhostDevConfig` thiếu index signature nên tsc TS2345 khi truyền `draft` vào helper catalog.
- **Fix:** Truyền object(shape) `{ settings, ghostDevConfig: {...} }` thay vì truyền nguyên `ProfileConfig`.
- **Files modified:** `src/views/ConfigProfilesView.tsx`
- **Verification:** `npx tsc --noEmit` sạch.
- **Committed in:** `6ddc55ab`

**2. [Rule 1 - Bug] Footer nút "Nhân bản profile" trùng accessible name với icon rail**
- **Found during:** Task 2
- **Issue:** `getByRole` tìm 2 nút cùng name `/Nhân bản profile/i`.
- **Fix:** Rails giữ aria-label `Nhân bản profile`; nút footer đổi text thành `Nhân bản profile đang chọn`. Test bấm rail bằng getByLabelText.
- **Files modified:** `src/views/ConfigProfilesView.tsx`, `tests/views/ConfigProfilesView.test.tsx`
- **Verification:** 25 scoped tests pass.
- **Committed in:** `6ddc55ab`, `921bdc3a`

**3. [Rule 3 - Blocking] AntD `App.useApp().notification` là stub trong jsdom**
- **Found during:** Task 2
- **Issue:** Các test save/new/duplicate sinh 15 unhandled rejection `notification.error/info is not a function`; đây là lỗi test harness có sẵn từ trước task, không phải regression production.
- **Fix:** Mock `App.useApp()` trong file test để trả notification object no-op.
- **Files modified:** `tests/views/ConfigProfilesView.test.tsx`
- **Verification:** `npx vitest run ... --bail=1` exit 0, không còn unhandled errors.
- **Committed in:** `921bdc3a`

**4. [Rule 1 - Bug] Test cảnh báo machine count giả định giá trị mặc định sai**
- **Found during:** Task 2
- **Issue:** Draft mặc định đã có 3 field theo máy có giá trị (`ninerouter_endpoint`, `image_endpoint`, `graphiti_mcp_endpoint`), nên assert "không có cảnh báo" và "+1" cố định sai.
- **Fix:** Test đếm số ban đầu từ DOM rồi assert tăng 1 sau khi sửa `github_owner`.
- **Files modified:** `tests/views/ConfigProfilesView.test.tsx`
- **Verification:** Scoped test xanh.
- **Committed in:** `921bdc3a`

---

**Total deviations:** 4 auto-fixed (3 Rule 1, 1 Rule 3)
**Impact on plan:** Không đổi phạm vi; tất cả là sửa lỗi test/type phát sinh khi đổi vỏ UI.

## Issues Encountered

- Không chạy full Vitest suite theo rule dự án (mất hơn 1 tiếng). Chỉ chạy 2 file scoped theo plan.
- Chrome MCP không khả dụng trong agent này. Đã verify UI bằng Playwright điều khiển Chrome thật tại `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` qua Vite dev server tạm: 4 tab render, ô search/recipient/3 checkbox/preview có mặt, grid đúng `220px minmax(0px, 1fr) 296px`, preview không chứa `recipient`, không có page error. Screenshot lưu tạm tại `/tmp/qdr-config-profiles.png`.

## Threat Flags

Không có bề mặt mới ngoài `<threat_model>` của plan. Preview render bằng React text node, `recipient` bị tách trước export, machine/secret flags dùng lại catalog có sẵn.

## Known Stubs

Không có stub mới. Preview phản ánh đúng draft, checkbox không gated export, secret vẫn để trống theo thiết kế.

## Self-Check: PASSED

- `npx vitest run tests/views/ConfigProfilesView.test.tsx tests/services/configProfiles/exportProfile.test.ts --bail=1` — 25 tests passed, exit 0.
- `npx tsc --noEmit` — clean.
- `git diff --name-only af8132ac..HEAD` — đúng 5 file trong `files_modified`.
- `grep -n recipient src/services/configProfiles/exportProfile.ts` — có destructuring tách; `grep -n recipient src/validation/configProfileSchemas.ts` — không có kết quả.
- Chrome check — xác nhận shell/tab/panel/preview như mô tả ở Issues Encountered.

## Next Phase Readiness

Sẵn sàng cho review/UAT màn hình profile authoring. Không có blocker. Không đụng import/schema/PWA/GitHub Pages.

---
*Phase: quick 261125-qdr*
*Completed: 2026-11-25*
