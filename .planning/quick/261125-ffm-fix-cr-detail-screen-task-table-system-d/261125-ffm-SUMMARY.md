---
phase: quick
plan: 261125-ffm
subsystem: cr-detail-subsystem-dropdown
tags: [cr-detail, subsystem, select, label, regression-test]
requires: []
provides:
  - CR Detail subsystem Select renders `${name} (${code})` while persisting raw systemId
affects:
  - src/views/ChangeRequestDetailView.tsx
tech-stack:
  added: []
  patterns:
    - AntD Select options label `${System.name} (${System.code})` per SystemModal convention
    - TDD red/green with real Dexie instance + fake-indexeddb and useLiveQuery
key-files:
  created:
    - src/views/__tests__/ChangeRequestDetailView.subsystemOptions.test.tsx
  modified:
    - src/views/ChangeRequestDetailView.tsx
decisions:
  - D-1: Use `${sys.name} (${sys.code})` label (SystemModal precedent at SystemModal.tsx:229); keep code for cross-screen recognition.
  - D-2: Fallback to raw `t.systemId` when no System row exists; never fabricate a name.
  - D-3: Sentinels and values unchanged — `UNATTACHED_OPTION` still writes `undefined`, target option still writes `systemId`.
metrics:
  duration: 9min
  completed: 2026-11-25
  tasks: 1
  commits: 1
actuals:
  tokens: 26000
  tasks: 1
  commits: 1
status: complete
---

# Quick Plan 261125-ffm: CR Detail subsystem dropdown label Summary

Dropdown Subsystem trong bảng tác vụ CR Detail giờ hiện "Tên hệ thống (MÃ)" theo convention của SystemModal, trong khi giá trị lưu vẫn là systemId. Cột Subsystem mở rộng 160px → 200px để nhãn dài không bị cắt.

## What Happened

- Task 1 (TDD): viết regression test trước — xác nhận đỏ tại kỳ vọng nhãn "Web app (WEB)" (nhãn cũ chỉ "WEB"). Sau đó đổi production, test xanh.
- `subsystemOptions` dùng `sys ? \`${sys.name} (${sys.code})\` : t.systemId`; `value: t.systemId` và option `Chung (không gắn)` giữ nguyên.
- `handleSubsystemChange` không đổi: chọn sentinel ghi `undefined`, chọn option hệ thống ghi systemId.
- Không đụng TaskTable.tsx, schema Dexie, backup, PWA/GitHub Pages; không thêm dependency.

## Verification

- `npx vitest run src/views/__tests__/ChangeRequestDetailView.subsystemOptions.test.tsx --bail=1` — 2/2 passed.
- `npx tsc --noEmit` — clean (exit 0).
- `git diff --name-only` trước commit: đúng 2 file trong files_modified; `.gsd/dispatch-isolation-sentinel.json` là thay đổi có sẵn từ trước, không đụng vào.
- Test cover: nhãn tên + mã, option sentinel, số option = số target + 1, ghi systemId đúng sau chọn, ghi undefined sau chọn sentinel, fallback id lạ.
- Full suite không chạy theo project rule (over an hour).

## Deviations from Plan

None — plan executed exactly as written. Small test-harness adjustment only: bỏ `act()` wrapper trong render helper vì môi trường Vitest không cấu hình `IS_REACT_ACT_ENVIRONMENT`, dùng `findByRole('columnheader')` thay để chờ live query; không ảnh hưởng hành vi production.

## Known Stubs

None.

## Threat Flags

None — threat model T-ffm-01 mitigated as planned; label derived only from System rows loaded via getAllSystems, value path unchanged and pinned by test.

## Self-Check: PASSED

- File tồn tại: `src/views/ChangeRequestDetailView.tsx`, `src/views/__tests__/ChangeRequestDetailView.subsystemOptions.test.tsx`.
- Commit `bd3a1a60` tồn tại trên `pre-v1.6-baseline`.
- Không có file bị xóa ngoài ý muốn.
