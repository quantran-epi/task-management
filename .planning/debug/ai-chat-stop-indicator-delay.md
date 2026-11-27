---
slug: ai-chat-stop-indicator-delay
status: resolved
trigger: "AI chat khi ấn dừng thì không dừng ngay, vẫn có loading indicator trên bong bóng Assistant, hàng chục giây sau mới tắt"
created: 2026-11-27
updated: 2026-11-27
---

## Symptoms

- Expected: bấm Stop → loading/thinking indicator trên assistant message tắt ngay.
- Actual: indicator vẫn hiện hàng chục giây sau mới tắt.
- Location: AI Chat drawer (không phải team chat).
- Errors: chưa rõ.

## Evidence

- timestamp: 2026-11-27 — `src/components/ai/AIChatDrawer.tsx:2425-2430` — `AiChatWidget.turn.status` lấy từ `activeTurnRuntime.getStatus()` (runtime registry, không phải state cục bộ).
- timestamp: 2026-11-27 — `src/components/ai/AiChatWidget.tsx:124-129,287,403-404` — `isTurnActive = ACTIVE_STAGES.has(turn.status)` với `ACTIVE_STAGES = {preparing, tool, streaming, synthesizing}`; truyền thẳng làm `isStreaming` cho `ChatMessageList`.
- timestamp: 2026-11-27 — `src/components/ai/ChatMessageList.tsx:469-480` — temp bubble `<ChatMessageBubble isStreaming={true}>` tồn tại khi `isStreaming`.
- timestamp: 2026-11-27 — `src/components/ai/ChatMessageBubble.tsx:1314-1327` — indicator = `<Spin>` + text "Đang suy nghĩ câu trả lời..." khi `isStreaming && !msg.content`.
- timestamp: 2026-11-27 — `src/components/ai/runtime/chatTurnRuntime.ts:251-274` — `abort()` gọi `controller.abort()`, detach controller, `running=false`, `publish('aborted')` NGAY. `onStatus('aborted')` ở `AIChatDrawer.tsx:658-668` patch tab runtime `status: idle`, `streamingText: ''` và `setTurnRevision`. Vậy bản thân Stoppath public đúng và đồng bộ.
- timestamp: 2026-11-27 — `src/components/ai/runtime/chatTurnRuntime.ts:403-413` — `onTextChunk` có guard `if (!isCurrent(turnId, turnController)) return` trước khi `publish('streaming')`.
- timestamp: 2026-11-27 — `src/components/ai/runtime/chatTurnRuntime.ts:414-418` — `onStatusChange` gọi `publish('synthesizing')` khi status chứa marker 'tổng hợp' — KHÔNG có guard `isCurrent`.
- timestamp: 2026-11-27 — `src/components/ai/runtime/chatTurnRuntime.ts:436-456` — `onToolCall` và `onToolResult` gọi `publish('tool')` — KHÔNG có guard `isCurrent`.
- timestamp: 2026-11-27 — `src/services/ai/aiOrchestratorLoop.ts:393-423,488-571` — vòng lặp vẫn chạy tiếp sau khi signal bị abort; các callback trên vẫn có thể fire trong lúc unwinding (đặc biệt `onToolResult` sau khi tool bị cancel nhưng resolve thay vì throw).
- timestamp: 2026-11-27 — `src-tauri/src/ai_proxy.rs:14,87-149` — `ai_proxy_request` đệm TOÀN BỘ response, timeout 90s, KHÔNG nhận cancellation signal từ JS. `src/services/ai/nineRouterClient.ts:216-226` gọi invoke mà không truyền signal. Đây là nguồn "hàng chục giây" mà runLoop còn pending.
- timestamp: 2026-11-27 — `src/components/ai/runtime/useTabRuntimes.ts:19-43` — notification coalesce 50ms, không giải thích được độ trễ hàng chục giây.

## Hypotheses & Tests

### H1 — AbortController không lan truyền tới runtime, nên status không đổi
- Test: trace `handleStopGeneration` (`AIChatDrawer.tsx:1293-1321`) → `tabRuntimes.abortTab` → `runtime.abort()`.
- Kết quả: LOẠI. `abort()` publish 'aborted' ngay; `onStatus` patch idle + bump `turnRevision`, React re-render ngay.

### H2 — Coalesced snapshot (50ms) làm trễ indicator
- Test: đọc `useTabRuntimes.ts:19-43`.
- Kết quả: LOẠI. 50ms không thể là "hàng chục giây"; Map vẫn cập nhật đồng bộ.

### H3 — Timeout/watchdog tự tắt indicator muộn
- Test: đọc `nineRouterClient.ts:274-300` (watchdog 60s), `ai_proxy.rs:14` (90s), `aiTurnManager.ts:95` (purge 800ms).
- Kết quả: LOẠI là nguồn trạng thái. Chỉ giải thích TẠI SAO runLoop còn pending lâu; không giải thích được status bị đẩy về active trong lúc đó.

### H4 — Callback muộn của runLoop ghi đè trạng thái 'aborted' (XÁC NHẬN)
- Test: so sánh `onTextChunk` (có `isCurrent` guard) với `onToolCall` / `onToolResult` / `onStatusChange` (không có guard).
- Cơ chế: Sau `abort()`, `turnController.signal.aborted = true` nên `isCurrent()` trả false. Nhưng 3 callback trên vẫn `publish('tool')` / `publish('synthesizing')` → status chuyển từ terminal 'aborted' về active. `onStatus` ở drawer patch `status: processing`, `streamingStatus: 'Truy xuất công cụ'`/`'Đang phản hồi'` → `isTurnActive = true` → Spin hiện lại. Chỉ khi runLoop cuối cùng settle (sau tool cancel / 90s proxy timeout) thì `start()` mới `publish('aborted')` lần cuối → indicator tắt. Khớp chính xác triệu chứng "hàng chục giây sau mới tắt".
- Kết quả: CONFIRMED — root cause.

## Root Cause

`src/components/ai/runtime/chatTurnRuntime.ts:414-418,436-456` — các callback `onStatusChange`, `onToolCall`, `onToolResult` thiếu guard `isCurrent(turnId, turnController)` trước khi `publish()` trạng thái active. Sau Stop, runtime đã publish 'aborted' nhưng runLoop còn pending (Tauri proxy buffer tới 90s) nên callback muộn ghi đè status về 'tool'/'synthesizing'. State owner của indicator là runtime status; abort không có quyền ưu tiên vì guard chỉ có ở `onTextChunk`.

## Fix (đề xuất, minimal tại state owner)

Thêm guard `isCurrent(turnId, turnController)` vào 3 callback trên — chỉ chặn `publish()`, vẫn giữ `deps.onToolEvent`/`onFileGenerated` để log đầy đủ tool đã chạy. Thêm 1 regression test trong `tests/ai/chatTurnRuntime.test.ts` mô phỏng callback fire sau abort.

## Resolution

- root_cause: `chatTurnRuntime.ts` các callback `onStatusChange`/`onToolCall`/`onToolResult` publish trạng thái active mà không kiểm tra `isCurrent`; sau Stop, runLoop còn pending (Tauri proxy缓冲 90s) nên callback muộn ghi đè `aborted` thành `tool`/`synthesizing`, indicator hiện lại đến khi loop settle.
- fix: thêm `isCurrent(turnId, turnController)` guard trước `publish('synthesizing'/'tool')` trong 3 callback; giữ nguyên `deps.onToolEvent` để log đầy đủ.
- verification: test `late loop callbacks after Stop must not resurrect the active streaming indicator` — tháo guard thì FAIL (`expected 'tool' to be 'aborted'`), giữ guard thì PASS. Scoped `npx vitest run tests/ai/chatTurnRuntime.test.ts` → 49/49 pass (~5s).
- commit: `1e3f46ca` trên `pre-v1.6-baseline`.
- changed_files:
  - `/Users/tranducquan/Working/Personal/task-management/src/components/ai/runtime/chatTurnRuntime.ts`
  - `/Users/tranducquan/Working/Personal/task-management/tests/ai/chatTurnRuntime.test.ts`
  - `/Users/tranducquan/Working/Personal/task-management/.planning/debug/ai-chat-stop-indicator-delay.md` (session record)

## Current Focus

- resolved. Không còn hypothesis mở.
