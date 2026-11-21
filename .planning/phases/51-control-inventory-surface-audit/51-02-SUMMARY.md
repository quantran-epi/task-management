---
phase: 51-control-inventory-surface-audit
plan: 02
subsystem: documentation
tags: [inventory, antd, ui-surface, import-audit, fixture, guard]

requires:
  - phase: 51-01
    provides: "51-CONTROL-INVENTORY.md §0-§2 with 56 wrapper rows, 257 guard exports and drift definitions used verbatim by §3"
provides:
  - "51-CONTROL-INVENTORY.md §3.1: 139 import path:line findings in five separated buckets (a)-(e) plus (c2), with live reproduction commands"
  - "51-CONTROL-INVENTORY.md §3.2: 441 SURFACE rows covering all 12 INV-02 groups with per-file/per-route listings"
  - "tests/fixtures/ant-design-surface-inventory.txt: 365 globally sorted entries (139 path:line + 226 path) cross-checked with grep -Fq against the artifact"
affects: [51-03, 52-openidea-mapping-design-contract, 53-native-controls, 54-overlay-controls, 55-domain-adoption, 56-dependency-removal]

tech-stack:
  added: []
  patterns: ["SURFACE marker per inventory row: <!-- SURFACE: <group> --> | file/route | control | note", "Sorted path:line fixture with every entry grep -Fq-checkable in the artifact", "Static call classification by receiver binding (useMessage/useNotification/useTaskMateModal), not by AntD import"]

key-files:
  created:
    - tests/fixtures/ant-design-surface-inventory.txt
    - .planning/phases/51-control-inventory-surface-audit/51-02-SUMMARY.md
  modified:
    - .planning/phases/51-control-inventory-surface-audit/51-CONTROL-INVENTORY.md

key-decisions:
  - "Mọi số trong §3 là output lệnh grep chạy live; PATTERNS chỉ được giữ làm chú thích lịch sử khi lệch source (97 file khớp, 139 dòng bổ sung; 28→31 type-only; 10→8 icon deep-import; 19→18 tool window; 20→22 view)."
  - "31 dòng import type, 13 dòng export type và 22 dòng type antd/es/* là ba nhóm riêng, không gộp; tất cả chỉ đổi khi gỡ dependency Phase 56, không phải runtime Phase 53/54."
  - "0 static call unbound và 86 file cú pháp message.*/notification.* bound qua context là hai số khác nhau; bốn file PATTERNS nêu được ghi là ghi chú lịch sử, không phải số liệu hiện tại."
  - "Mỗi branch popout tự bọc AntdThemeAdapter + ThemeAppHolder — không chuyển sang singleton holder; context menu duy nhất nằm ở TaskTable.tsx:1014, không tìm được bằng grep <Menu."

patterns-established:
  - "Mỗi nhóm import có lệnh enumerate và số live riêng; fixture path:line được sort LC_ALL=C và đối chiếu từng dòng bằng grep -Fq với artifact."
  - "Mỗi dòng surface có marker <!-- SURFACE: <group> -->, path cụ thể và cột behavior phải giữ; không viết tắt 'v.v.' cho 15 route, 22 viewType, 18 tool window hay 30 settings file."

requirements-completed: [INV-01, INV-02]

duration: 5 min
completed: 2026-11-21
---

# Phase 51 Plan 02: Control Inventory Surface Audit Summary

**Tồn kho 139 import AntD tồn dư và 441 dòng UI surface theo 12 nhóm, kèm fixture 365 entry đối chiếu máy được**

## Performance

- **Duration:** 5 min
- **Started:** 2026-11-21T17:24:23Z
- **Completed:** 2026-11-21T17:29:06Z
- **Tasks:** 2/2
- **Files modified:** 3 (1 artifact, 1 fixture mới, 1 SUMMARY)

## Accomplishments

- Viết xong §3.1 của `51-CONTROL-INVENTORY.md`: 139 dòng import từ 97 file, tách thành (a) tổng hợp, (b) runtime 76 dòng/61 file, (c) 31 dòng `import type` / 31 file, (c2) 13 dòng `export type` + 22 dòng type `antd/es/*`, (d) 0 static call unbound + 86 file context-bound, (e) 8 deep-import icon và 4 file `@ant-design/plots`.
- Viết xong §3.2: 441 dòng marker `<!-- SURFACE: <group> -->` cho đủ 12 nhóm INV-02, gồm 15 hash route, 4 popout branch tự bọc `AntdThemeAdapter` + `ThemeAppHolder`, 22 `viewType` case, 18 tool window, 30 settings file, 22 view, 3 CR + 16 notes, 21 AI + 16 grounded + 11 agents, 85 modal/drawer/popover + 33 popconfirm, 38 form/table, 4 menu rows kèm `TaskTable.tsx:1014`, 76 tooltip, 8 notification, 12 state rows.
- Tạo `tests/fixtures/ant-design-surface-inventory.txt` với 365 entry đã sort `LC_ALL=C` (139 `path:line` + 226 `path`), mọi entry `grep -Fq` khớp trong artifact.
- Chạy scoped verification xanh: `staticApiGuard.test.ts` + `antdInventory.test.ts` (8 tests), marker/count checks, sort check, `git status --short src` trống. Không chạy full Vitest, không đổi source, không cài dependency.

## Task Commits

1. **Task 1: Tồn kho import tồn dư và cơ chế phát hiện** - `f3141a11` (docs)
2. **Task 2: Tồn kho mọi UI surface (INV-02)** - `81429bf3` (docs)

**Plan metadata:** commit tiếp theo `docs(51-02): complete ...`

## Files Created/Modified

- `.planning/phases/51-control-inventory-surface-audit/51-CONTROL-INVENTORY.md` - bổ sung §3.1 (import tồn dư, 6 bảng/phần kèm lệnh enumerate và số live) và §3.2 (12 nhóm surface, mỗi dòng marker `SURFACE`); giữ nguyên §0-§2 của 51-01.
- `tests/fixtures/ant-design-surface-inventory.txt` - fixture sorted gồm 139 phát hiện import và 226 path surface; tiêu thụ bởi lệnh diff trong `<verify>`.
- `.planning/STATE.md`, `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md` - cập nhật qua gsd-tools lúc đóng plan.

## Decisions Made

- Chọn số live từ lệnh grep làm truth cho mọi lệch với PATTERNS, ghi chú lệch ngay trong artifact để Phase 52/56 không lập kế hoạch trên số cũ.
- Giữ ba dạng type (import/export/deep) thành hàng riêng dù cùng hệ quả Phase 56, vì `scanConsumedAntd()` bỏ `import type` và dễ gộp nhầm khi gỡ dependency.
- Phân loại static call bằng receiver binding của `staticApiGuard.test.ts`, không bằng import — 86 file vẫn có cú pháp `message.*` nhưng đều bind qua context, guard xanh.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. Lệnh enumerate cho nhóm (b) trả thêm hai dòng value import từ file nội bộ có chứa cụm "antd" (`src/styles/tokens.ts:1`, `src/components/ui/antdTheme.ts:6`); artifact ghi rõ đây là output cần lọc tay, không phải dependency AntD.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for 51-03. Artifact đã có §0-§3 đầy đủ để 51-03 viết §4 (phân loại implementation) và §5 (đối chiếu cuối, bàn giao Phase 52) mà không đụng các marker `WRAPPER-ROW`, `EXPORT`, `SURFACE` và fixture đã đối chiếu. `git status --short src` trống.

---
*Phase: 51-control-inventory-surface-audit*
*Completed: 2026-11-21*
