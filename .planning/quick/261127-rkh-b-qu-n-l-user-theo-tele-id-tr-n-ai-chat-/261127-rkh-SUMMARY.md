---
phase: quick
plan: 261127-rkh
subsystem: ui-telegram-ai-chat
tags: [telegram, ai-chat-standalone, settings, ui-cleanup]
dependency_graph:
  requires: [261127-01z, 261127-fzv]
  provides: [RKH-01, RKH-02, RKH-03]
  affects: [TelegramMonitorView, AISettingsDrawer, AIChatDrawer, chatTurnRuntime]
tech_stack:
  added: []
  patterns: [remove-dead-ui-only, scoped-vitest-gates]
key_files:
  created: []
  modified:
    - src/views/TelegramMonitorView.tsx
    - src/components/ai/AISettingsDrawer.tsx
    - src/components/ai/AIChatDrawer.tsx
    - src/components/ai/runtime/chatTurnRuntime.ts
    - tests/phase51/AISettingsDrawer.test.tsx
    - tests/phase51/AIPopoutView.standalone.test.tsx
  deleted:
    - src/components/settings/StandaloneDevicePolicyCard.tsx
    - tests/telegram/StandaloneDevicePolicyCard.test.tsx
decisions:
  - "Whitelist pending standalone dùng luồng duyệt thường; giữ tag nguồn và nút Từ chối"
  - "Chỉ đổi text blocked; giữ code policy_blocked, enforce và mọi service/DB/Rust bridge"
  - "Text bot /policy trong telegramHeadlessWorker.ts giữ nguyên theo phạm vi chốt"
metrics:
  duration: ~10min
  completed_date: 2026-11-27
---

# Quick 261127-rkh: Bỏ quản lý user theo Telegram ID trong AI chat Summary

Gỡ UI quản lý thiết bị standalone AI chat: Telegram còn 3 tab, AI Settings standalone mất group Telegram Device, thông báo blocked không còn dẫn tới setting đã xoá. Service/DB/Rust bridge, whitelist user/bot và enforce policy giữ nguyên.

## Commits

| Task | Commit | Nội dung |
|------|--------|----------|
| 1 (RKH-01) | 1868012b | Bỏ tab AI Chat Devices + dead path pending trên trang Telegram |
| 2 (RKH-02) | 5a516e4c | Bỏ group Telegram Device, xoá card và test riêng |
| 3 (RKH-03) | 650cab8d | Đổi 3 thông báo blocked thành text trung tính |

## Verification

- Task 1: `npx tsc --noEmit` clean; grep gate 0 kết quả cho `AI Chat Devices|key: 'devices'|modelDrafts|defaultModelDrafts|buildPolicyPayload|upsertDeviceEnrollment`.
- Task 2: `npx vitest run tests/phase51/AISettingsDrawer.test.tsx --bail=1` — 11 passed; grep gate clean; 2 file bị xoá xác nhận không còn tồn tại.
- Task 3: `npx vitest run tests/phase51/AIPopoutView.standalone.test.tsx --bail=1` — 5 passed; grep gate clean.
- Gate cuối: `npx tsc --noEmit` clean; `npx vitest run tests/phase51/AISettingsDrawer.test.tsx tests/phase51/AIPopoutView.standalone.test.tsx tests/telegram/devicePolicy.test.ts --bail=1` — 3 files / 23 tests passed.
- Không chạy full vitest suite (quy tắc dự án).

## Deviations from Plan

None — plan executed exactly as written. Một reference còn lại tới `Cài đặt AI → Telegram Device` nằm ở text bot `/policy` trong `telegramHeadlessWorker.ts`, cố tình giữ nguyên theo quyết định chốt ở objective.

## Threat Flags

None — đúng các mitigate trong threat register (bỏ nút chuyển tab chết, giữ quickApprove/deny + Popconfirm; đổi message nhưng giữ `code: 'policy_blocked'`). Không có surface mới.

## Known Stubs

None.

## Self-Check: PASSED

7 file tồn tại, 2 file xoá xác nhận, 3 commit tìm thấy trong git log.
