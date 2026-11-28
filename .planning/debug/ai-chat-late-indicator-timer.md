---
slug: ai-chat-late-indicator-timer
status: investigating
trigger: "AI chat tab: message đầu tiên gửi là phản hồi ngay, có loading indicator; từ message thứ 2 trở đi phải gần 10s mới thấy indicator. Timer AI process ở footer đếm sai: chạy nhiều phút nhưng mỗi tool call dường như reset timer."
created: 2026-11-28
updated: 2026-11-28
---

## Symptoms

- Expected: gửi message bất kỳ trong AI chat tab → loading indicator hiện ngay; timer AI process ở footer đếm liên tục trong suốt turn.
- Actual: message đầu tiên của tab hiện indicator ngay. Từ message thứ 2, indicator delay ~10s. Footer timer reset dường như mỗi tool call dù turn đã chạy nhiều phút.
- Location: AI Chat drawer, tab nội bộ (`ChatTabBar` / `tabRuntimes`). Không rõ standalone có bị không.
- Errors: chưa rõ.

## Current Focus

- hypothesis: (resolved) hai state-owner bug độc lập: (1) `AiTurnManager.registerTurn` reset `startedAt`; (2) drawer prelude status chỉ paint khi runtime `idle`.
- test: regression tests cho timer continuity + prelude paint; scoped Vitest.
- expecting: timer không reset khi tool call; indicator 'preparing' hiện ngay từ message 2.
- next_action: apply fix tại state owner, chạy scoped tests, commit + push.

## Evidence

- 2026-11-28 — `src/services/ai/aiTurnManager.ts:67-80`: `registerTurn` luôn gán `startedAt: turn.startedAt ?? Date.now()`; mọi caller production đều không truyền `startedAt`.
- 2026-11-28 — `src/components/ai/AIChatDrawer.tsx:659-693`: `onStatus` gọi `aiTurnManager.registerTurn({...})` cho MỌI active status. Runtime publish `'tool'` ở `chatTurnRuntime.ts:439-458` trên mỗi `onToolCall`/`onToolResult`. Vì `registerTurn` ghi đè turn và reset `startedAt`, footer capsule (`ActiveAiTurnIndicator.tsx:99-106`, `:192-203`) tính elapsed từ timestamp mới → reset mỗi tool call. Loại bỏ được bằng `updateTurn` cho status update nhưng cần giữ abort/meta — fix đúng tại manager: `registerTurn` phải giữ `startedAt` của turn cùng id còn tồn tại.
- 2026-11-28 — `src/components/ai/AIChatDrawer.tsx:2444-2448`: `turn.status` = `'preparing'` chỉ khi `preludeTabs[activeTabId] && (activeTurnRuntime?.getStatus() ?? 'idle') === 'idle'`. Sau turn 1, runtime giữ status `'complete'` (`chatTurnRuntime.ts:618`), không phải `'idle'`, nên message 2+ trong prelude không paint. Indicator chỉ hiện khi `runtime.start()` publish `'preparing'` (~10s sau do `compactThreadContext` + `routeIntent` + grounding, `AIChatDrawer.tsx:1572-1612`; `routeIntent` gọi `completeJson` 2 lần với timeout 90s ở `nineRouterClient.ts:546-548`). Message 1 paint ngay vì runtime mới tạo ở status `'idle'`.
- 2026-11-28 — `useTabRuntimes.ts:19-43`: notify coalesce 50ms không gây delay 10s; widget đọc `activeTurnRuntime.getStatus()` qua `turnRevision` (`AIChatDrawer.tsx:1271-1274`), đã bị force re-read qua `setTurnRevision` ở `patchTurnError`/`onStatus`. Loại trừ.
- 2026-11-28 — `nineRouterClient.ts:546`: timer 90s cho `completeJson` là config có chủ đích (comment đo trên). Không đụng transport per rangh gioi.
- 2026-11-28 — `routeIntent` commit 9e914784 chỉ thêm `await` trong prelude, không đụng `markPrelude`. Delay là nguyên nhân làm lộ bug status derivation, không phải nguyên nhân gây bug (prelude luôn chạy trước đó, dài ít hơn).

## Eliminated

- `useTabRuntimes` 50ms notify coalesce — chỉ 50ms, không phải ~10s.
- `routeIntent` transport timeout — config 90s có chủ đích; không phải reset timer; chỉ kéo dài prelude để lộ bug status derivation.
- Stop indicator bug (`.planning/debug/ai-chat-stop-indicator-delay.md`, commit 1e3f46ca) — khác path (lúc dừng, không phải lúc gửi).

## Resolution

- root_cause: Hai bug tại state owner: (1) `AiTurnManager.registerTurn` reset `startedAt` mỗi lần drawer publish status active (mỗi tool call), làm footer timer đếm lại từ 0; (2) `AIChatDrawer` chỉ paint staged 'preparing' khi runtime status === 'idle', nhưng runtime giữ 'complete' sau turn trước, nên prelude turn sau không hiện indicator cho tới khi `runtime.start()` chạy ~10s sau.
- fix: (1) `AiTurnManager.registerTurn` chỉ复用 `startedAt`/streamingText/toolEvents từ entry CÙNG ID còn active; turn mới sau `finishTurn` (entry terminal giữ 800ms) lấy clock mới. (2) Trích `turnStatusForPaint` trong `tabTypes.ts`: prelude paint 'preparing' khi runtime không running VÀ status không active — bao gồm 'complete' sau turn trước. Drawer dùng helper thay vì điều kiện `=== 'idle'`.
- verification: `npx tsc --noEmit` exit 0. `npx vitest run tests/ai/aiTurnManager.test.ts tests/ai/turnStatusForPaint.test.ts` 2 files / 13 tests pass. `tests/ai/AIChatDrawerTabs.test.tsx` 18 tests pass (1 unhandled DatabaseClosedError ở teardown, có ở baseline). Hai test baseline-fail xác nhận không phải regression: `AIChatDrawerIsolation` "unmounting the drawer aborts every tab request" và `ActiveAiTurnIndicator` "shows the new-budget preview line" — cả hai fail ở baseline đã stash. Không chạy full suite.
- commit: (pending)
- changed_files: src/services/ai/aiTurnManager.ts, src/components/ai/runtime/tabTypes.ts, src/components/ai/AIChatDrawer.tsx, tests/ai/aiTurnManager.test.ts, tests/ai/turnStatusForPaint.test.ts, .planning/debug/ai-chat-late-indicator-timer.md
