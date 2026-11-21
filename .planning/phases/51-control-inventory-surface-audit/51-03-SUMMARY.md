---
phase: 51-control-inventory-surface-audit
plan: 03
subsystem: documentation
tags: [inventory, antd, ui-surface, classification, phase-handoff, verification]

requires:
  - phase: 51-01
    provides: "51-CONTROL-INVENTORY.md §0-§2 with 56 WRAPPER-ROW and 257 guard export names"
  - phase: 51-02
    provides: "51-CONTROL-INVENTORY.md §3 with 139 import findings, 441 SURFACE rows and sorted 365-entry fixture"
provides:
  - "51-CONTROL-INVENTORY.md §4: 56 CLASSIFY rows, one per wrapper; 3 exclusive groups (26 core/form, 28 overlay/complex, 2 domain/adoption) with complexity, wrapper to swap, predicted OpenIDEA analog and behavior criteria"
  - "51-CONTROL-INVENTORY.md §4.1: 12 SURFACE groups mapped to wrappers with adoption complexity and behavior to preserve"
  - "51-CONTROL-INVENTORY.md §5: criteria↔artifact map, copy/paste reproduction commands, scoped gate results and Phase 52 handoff with absolute PROOF.md path"
affects: [52-openidea-mapping-design-contract, 53-native-controls, 54-overlay-controls, 55-domain-adoption, 56-dependency-removal]

tech-stack:
  added: []
  patterns: ["CLASSIFY marker at line start so plan regex matches; one group value per wrapper file", "Priority rule for exclusive classification: overlay behavior > domain-specific > core/form", "No-analog labels use literal 'cần thiết kế mới'; 34 such wrappers are the MAP-02 input"]

key-files:
  created:
    - .planning/phases/51-control-inventory-surface-audit/51-03-SUMMARY.md
  modified:
    - .planning/phases/51-control-inventory-surface-audit/51-CONTROL-INVENTORY.md

key-decisions:
  - "date-picker → overlay/complex because range picker is an overlay behavior; status-dot and empty → domain/adoption; auto-complete → overlay/complex because of popup. One group only per file, no double counting."
  - "Icon is one CLASSIFY row with all 141 wrapIcon exports; the 8 deep-imports in RemoteGitExplorer.tsx stay in the same core/form group, not a separate row."
  - "§4 uses PROOF-analog labels only where PROOF has evidence (Button, Input, Checkbox, Radio, Toggle, Select/Listbox, Tabs, Chip, Dialog); 34 wrappers get the literal 'cần thiết kế mới' for MAP-02. Phase 51 sets no metric, CSS module, DOM or class."
  - "§5 records PROOF.md at the absolute scratchpad path, not the shortened ROADMAP path; research stays skipped per milestone decision."
  - "Verification is scoped only: 3 Vitest files, tsc --noEmit, marker counts, fixture sort, git status --short src. No full suite, no source change."

patterns-established:
  - "Every CLASSIFY row keeps the same file name as its WRAPPER-ROW so the regex match is a hard equality, not a fuzzy label."
  - "Handoff section separates what Phase 52 owns (API/metric lock, MAP-01/02 design) from what Phase 51 only labels."

requirements-completed: [INV-03]

duration: 3 min
completed: 2026-11-22
---

# Phase 51 Plan 03: Control Inventory Surface Audit Summary

**Phân loại 56 wrapper thành 3 nhóm implementation với tiêu chí behavior phải giữ, rồi đối chiếu 56/257/441 marker và bàn giao Phase 52 kèm đường dẫn PROOF tuyệt đối**

## Performance

- **Duration:** 3 min
- **Started:** 2026-11-21T17:32:20Z
- **Completed:** 2026-11-21T17:35:23Z
- **Tasks:** 2/2
- **Files modified:** 2 (1 artifact, 1 SUMMARY mới)

## Accomplishments

- Viết §4 của `51-CONTROL-INVENTORY.md`: đúng 56 dòng `<!-- CLASSIFY: <file> -->` khớp từng `WRAPPER-ROW`, mỗi dòng 7 cột (nhóm, complexity, wrapper cần thay, OpenIDEA analog, control còn thiếu, behavior phải giữ). Phân bổ 26 core/form + 28 overlay/complex + 2 domain/adoption; `date-picker` → overlay, `status-dot`/`empty` → adoption, icon gộp 141 export vào một dòng kèm 8 deep-import.
- Viết §4.1: 12 nhóm SURFACE ánh xạ tới wrapper, complexity adoption theo số file call site (≤5 thấp, 6-20 trung bình, >20 cao) và behavior phải giữ — gồm focus trap, Escape, portal, mask `false`, `contextHolder`, `withoutUndefined`, static Form mirror, `onContextMenu` tại `TaskTable.tsx:1014`, notification realtime.
- Viết §4.2: bảng 3 nhóm ↔ phase 53/54/55 (NAT-01..04) và ghi chú Phase 56 (CLEAN-01..03) gỡ type/deep import/plots.
- Viết §5: bảng 5 tiêu chí ROADMAP ↔ marker + lệnh kiểm tra, khối lệnh tái tạo copy/paste, bảng kết quả gate và mục bàn giao Phase 52. Tiêu chí #5 nêu rõ 257 export là guard, 56 file là cột wrapper cần thay.
- Chạy scoped verification xanh: 3 file / 12 test, `npx tsc --noEmit` exit 0, marker 56/257/441/56, fixture sort đúng, `git status --short src` trống. Không chạy full Vitest, không đổi source, không cài dependency.

## Task Commits

1. **Task 1: Phân loại 56 wrapper theo nhóm implementation (INV-03)** - `7487baec` (docs)
2. **Task 2: Đối chiếu cuối, chéo số liệu và bàn giao Phase 52** - `6ee9d62b` (docs)

**Plan metadata:** `docs(51-03): complete control inventory classification plan`

## Files Created/Modified

- `.planning/phases/51-control-inventory-surface-audit/51-CONTROL-INVENTORY.md` - bổ sung §4 (bảng 56 CLASSIFY + §4.1 adoption surface + §4.2 nhóm↔phase) và §5 (3 bảng đối chiếu/bàn giao); giữ nguyên §0-§3 của 51-01/02.
- `.planning/STATE.md`, `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md` - cập nhật qua gsd-tools lúc đóng plan.
- `.planning/phases/51-control-inventory-surface-audit/51-03-SUMMARY.md` - SUMMARY này.

## Decisions Made

- Ưu tiên nhóm duy nhất theo behavior: overlay > domain > core. Một file không xuất hiện ở hai nhóm, nên số 26+28+2=56 khớp số file thực tế.
- Nhãn analog chỉ lấy tên control có bằng chứng trong PROOF; 34 wrapper nhận nhãn `cần thiết kế mới` làm đầu vào MAP-02, 22 wrapper có analog làm đầu vào MAP-01. Phase 51 không viết metric hay CSS module.
- Marker CLASSIFY đặt đầu dòng để khớp đúng regex của plan; nội dung bảng vẫn đủ cột và dẫn path wrapper cụ thể.
- PROOF.md được ghi bằng đường dẫn tuyệt đối ngoài repo; research vẫn skipped theo quyết định milestone.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. Lần đầu viết marker CLASSIFY nằm trong cell bảng nên regex `^<!-- CLASSIFY:` của `<verify>` trả về 0; đã chuyển 56 marker ra đầu dòng trong cùng commit Task 1 trước khi chạy gate và commit. Không có thay đổi source.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 51 complete, ready for next step. Artifact `51-CONTROL-INVENTORY.md` đầy đủ §0-§5; Phase 52 có thể bắt đầu `52-UI-SPEC.md` từ PROOF tuyệt đối, danh sách 34 nhãn `cần thiết kế mới` và tiêu chí behavior đã lock. `git status --short src` trống; scoped gate xanh. Recommended next: `/gsd-verify-work 51` rồi `/gsd-plan-phase 52`.

---
*Phase: 51-control-inventory-surface-audit*
*Completed: 2026-11-22*
