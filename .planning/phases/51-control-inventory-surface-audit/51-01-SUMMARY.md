---
phase: 51-control-inventory-surface-audit
plan: 01
subsystem: documentation
tags: [inventory, antd, wrappers, baseline, guard]

requires:
  - phase: 50-full-app-adoption
    provides: "UI wrapper foundation and static-API migration that produced the current src/components/ui surface"
provides:
  - "51-CONTROL-INVENTORY.md sections 0-2: count definitions, drift reconciliation, 56 wrapper rows and 257 sorted guard exports"
  - "Reproduction commands for 56 / 257 / 52-141-3 / 10 and for every PATTERNS drift"
  - "Section placeholders for 51-02 (imports/surface) and 51-03 (classification/handoff)"
affects: [51-02, 51-03, 52-openidea-mapping-design-contract]

tech-stack:
  added: []
  patterns: ["one WRAPPER-ROW marker per wrapper file with nine labelled columns", "one EXPORT marker per scanWrappers() name in guard-sorted order"]

key-files:
  created:
    - .planning/phases/51-control-inventory-surface-audit/51-CONTROL-INVENTORY.md
    - .planning/phases/51-control-inventory-surface-audit/51-01-SUMMARY.md
  modified:
    - .planning/STATE.md
    - .planning/ROADMAP.md
    - .planning/REQUIREMENTS.md

key-decisions:
  - "Tồn kho Phase 51 định nghĩa bốn số riêng biệt: 56 file wrapper, 257 tên export guard, 52/141/3 named import live và 10 file test bằng chứng. Mọi lệch với PATTERNS được ghi kèm lệnh tái tạo; static call site được đếm bằng cú pháp và bind context, không phải import AntD tĩnh."

patterns-established:
  - "Mọi số trong artifact phải có lệnh tái tạo chạy được; PATTERNS chỉ là lịch sử khi lệch source."
  - "Mỗi wrapper là một dòng marker WRAPPER-ROW với path ngay sau marker; mỗi export là một dòng EXPORT theo đúng output sort của scanWrappers()."

requirements-completed: [INV-01]

duration: 3 min
completed: 2026-11-21
---

# Phase 51 Plan 01: Control Inventory Foundation Summary

**Tồn kho gồm 56 wrapper rows và 257 guard export, kèm bảng đối chiếu bốn số liệu và mọi lệch PATTERNS bằng lệnh tái tạo**

## Performance

- **Duration:** 3 min
- **Started:** 2026-11-21T17:18:37Z
- **Completed:** 2026-11-21T17:21:48Z
- **Tasks:** 2/2
- **Files modified:** 4 (1 artifact mới + 3 metadata files qua gsd-tools)

## Accomplishments

- Tạo `.planning/phases/51-control-inventory-surface-audit/51-CONTROL-INVENTORY.md` với §0-§2 đầy đủ và §3-§5 để dành cho 51-02/51-03.
- Định nghĩa rõ 56 file wrapper / 257 tên export / 52-141-3 named import / 10 file test, kèm lệnh chạy live và baseline PROOF.md đường dẫn tuyệt đối.
- Đối chiếu bốn lệch PATTERNS: 51→52 component, 28→31 type-only import, 10→8 deep icon import, 4 static file→0 unbound với 86 file cú pháp context-bound.
- Ghi 56 dòng `<!-- WRAPPER-ROW -->` với chín cột có nhãn và 257 dòng `<!-- EXPORT: Ten -->` khớp chính xác `scanWrappers('src/components/ui')`; `findMissingWrappers` trả `[]`.
- Không đổi source dưới `src/`, không cài dependency, không chạy full Vitest.

## Task Commits

1. **Task 1: Khung artifact + đối chiếu 4 con số và mọi lệch với PATTERNS** - `1b558d88` (docs)
2. **Task 2: Tồn kho 56 wrapper + 257 tên export** - `d4de7b3d` (docs)

**Plan metadata:** xem commit plan completion trên nhánh `feature/intellij-workbench`.

## Files Created/Modified

- `.planning/phases/51-control-inventory-surface-audit/51-CONTROL-INVENTORY.md` - nguồn truth tồn kho control; §0 cách đọc, §1 đối chiếu số liệu + lệch, §2 56 wrapper rows + 257 export rows + missing guard; §3-§5 placeholders.
- `.planning/STATE.md` - position 2/3, decision Phase 51, metric, session continuity (gsd-tools).
- `.planning/ROADMAP.md` - plan progress cập nhật qua `roadmap.update-plan-progress 51`.
- `.planning/REQUIREMENTS.md` - INV-01 đánh dấu complete qua `requirements.mark-complete`.

## Decisions Made

- 56 là số file wrapper, 257 là số tên export guard — hai phép đếm khác nhau, không thay thế nhau. Số live từ lệnh scan là truth khi PATTERNS lệch source.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. Lệnh `state.add-decision` từ chối file input ngoài repo; đã chạy lại với file tạm nằm trong `.planning/` rồi xóa, decision được ghi nhận.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for 51-02. Artifact đã có marker 56/257 và định nghĩa số liệu để 51-02 viết §3 (import tồn dư và UI surface) mà không đụng §0-§2. `git status --short src` trống.

---
*Phase: 51-control-inventory-surface-audit*
*Completed: 2026-11-21*
