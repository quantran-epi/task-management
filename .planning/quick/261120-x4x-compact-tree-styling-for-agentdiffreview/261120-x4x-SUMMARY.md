---
phase: quick-261120-x4x
plan: '01'
subsystem: workbench-systems-explorer
tags: [system-type-icons, workbench-ui]
dependency_graph:
  requires: []
  provides:
    - getSystemTypeIcon dùng chung cho SystemTable và SystemsExplorer
  affects:
    - src/workbench/toolwindows/SystemsExplorer.tsx
    - src/components/systems/SystemTable.tsx
tech_stack:
  added: []
  patterns:
    - icon component map dùng chung, surface tự quyết style
key_files:
  created: []
  modified:
    - src/services/system/systemTypeSettings.ts
    - src/services/system/__tests__/systemTypeSettings.test.ts
    - src/components/systems/SystemTable.tsx
    - src/workbench/toolwindows/SystemsExplorer.tsx
    - tests/workbench/SystemsExplorer.test.tsx
decisions:
  - "Sau UAT 2026-11-21 bỏ phần AgentDiffReviewer/compact tree vì ghost dev đã retired, không còn route; chỉ giữ icon SystemsExplorer."
  - "Dùng lại tests/workbench/SystemsExplorer.test.tsx có sẵn thay vì tạo src/workbench/__tests__/SystemsExplorer.test.tsx trùng lặp; action set parent/subsystem đã được test ở đó."
  - "SystemTable giữ FolderOutlined cho icon cột tên parent (không phải icon type); chỉ TYPE_ICONS type-column được thay bằng getSystemTypeIcon."
  - "Parent icon của SystemsExplorer dùng getSystemTypeIcon(type, expanded) nên current state là FolderOpenOutlined khi defaultExpandAll."
metrics:
  duration: ~13 phút (trước khi thu hẹp scope)
  completed_date: "2026-11-21"
---

# Quick 261120-x4x: Icon hệ thống theo type trong SystemsExplorer — Tổng kết

Sếp xác nhận ghost dev đã retired nên phần compact tree của `AgentDiffReviewer` bị bỏ hoàn toàn. Branch final chỉ giữ việc đã UAT được trong app thật: SystemsExplorer hiển thị icon theo `System.type`.

## Kết quả thực hiện

- Commit `86bffc8a` (cherry-pick từ `cf082789`):
  - `src/services/system/systemTypeSettings.ts`: `SYSTEM_TYPE_ICON_COMPONENTS` và `getSystemTypeIcon(type, expanded)` là nguồn icon chung; LOGICAL_GROUP/SERVICE/SCHEMA/UI/WORKER mapped, type lạ fallback `AppstoreOutlined`, parent expanded dùng `FolderOpenOutlined`.
  - `src/components/systems/SystemTable.tsx`: bỏ `TYPE_ICONS` local, dùng hàm chung.
  - `src/workbench/toolwindows/SystemsExplorer.tsx`: icon + màu lấy từ `useSystemTypeLookup(db)`; custom type dùng màu cấu hình, unknown fallback xám; action set parent/subsystem giữ nguyên.
  - Test cập nhật: `systemTypeSettings.test.ts`, `tests/workbench/SystemsExplorer.test.tsx`.

## Phần đã bỏ (không push)

Theo chỉ đạo của sếp: ghost dev không còn sử dụng, không sửa `AgentDiffReviewer`. Các commit `60fbfde9`, `d7704ca8`, `67bb82b0`, merge `1d296fca` chỉ còn trong backup branch `backup/x4x-full`; branch `feature/intellij-workbench` đã reset về `5b937a50` rồi cherry-pick đúng phần icon.

## Verification

- Scoped test: `npx vitest run --bail=1 src/services/system/__tests__/systemTypeSettings.test.ts tests/workbench/SystemsExplorer.test.tsx` — PASS 2 files, 14 tests.
- `npx tsc --noEmit` — exit 0.
- Review diff: không dependency mới, không `!important`, không duplicate `TYPE_ICONS`, action set không đổi; reviewer trước đó tìm bug icon 12px trong `AgentDiffReviewer`, phần đó đã bị bỏ cùng ghost-dev.
- Chrome DevTools tại `http://localhost:5173/task-management/`: seed 6 system mẫu (LOGICAL_GROUP, SERVICE, SCHEMA, UI, WORKER, type lạ) vào IndexedDB, reload, đo trực tiếp:
  - icon tree: `folder-open`, `code`, `database`, `desktop`, `thunderbolt`, `appstore` — đúng 5 type + fallback.
  - màu icon: parent `rgb(114,46,209)`, SERVICE `rgb(19,194,194)`, SCHEMA `rgb(24,144,255)`, UI `rgb(235,47,150)`, WORKER `rgb(250,140,22)`, unknown `rgb(140,140,140)`.
  - click parent vẫn mở detail tab; tổng 6 node, action set parent/subsystem không đổi.
  - Dữ liệu seed đã xóa sau UAT.

## Threat flags

Không thêm endpoint/auth/schema/dependency. Type custom đã đi qua `normalizeSystemTypeOptions` ở trust boundary sẵn có.
