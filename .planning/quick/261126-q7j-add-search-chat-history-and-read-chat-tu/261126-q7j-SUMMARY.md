---
phase: quick
plan: 261126-q7j
subsystem: ai-chat-history
tags: [ai-chat, tools, bm25, thread-scope, prompt-injection, browser-uat]
requires: []
provides: [CHAT-HISTORY-TOOLS]
affects: [ai-chat-dock, ai-chat-standalone, settings-ai-catalog]
tech-stack:
  added: []
  patterns: [team-tool adapter reuse, request-bound threadId, wrapUntrusted nonce delimiters]
key-files:
  created:
    - src/services/ai/chatHistoryTools.ts
    - tests/services/ai/chatHistoryTools.test.ts
  modified:
    - src/services/ai/aiOrchestratorLoop.ts
    - src/components/ai/runtime/chatTurnRuntime.ts
    - src/services/ai/chatTurnTools.ts
    - src/components/ai/AIChatDrawer.tsx
    - src/components/settings/AiToolCatalogCard.tsx
    - src/services/ai/__tests__/chatTurnTools.test.ts
    - tests/ai/chatTurnTools.test.ts
    - tests/ai/chatTurnRuntime.test.ts
    - e2e/aiChatSettings.spec.ts
decisions:
  - threadId chỉ đến từ ChatTurnRequest.threadId; args.threadId từ model bị bỏ qua hoàn toàn
  - tái dùng buildTeamBm25Docs/getTeamTurn/rankBM25/wrapUntrusted thay vì copy guard hay BM25
  - thêm source catalog 'chat' nhãn "Lịch sử hội thoại" cho hai tool định nghĩa
metrics:
  duration: ~14m
  completed: 2026-11-26
---

# Quick 261126-q7j: Search + read lịch sử AI chat theo thread Summary

Thêm `search_chat_history` và `read_chat_turn` cho cả dock lẫn standalone AI chat. BM25 chỉ xếp hạng trong thread hiện tại; mọi excerpt/content đi qua `wrapUntrusted`; cross-thread turnId và thiếu thread context bị từ chối. Cửa sổ nén ngữ cảnh giữ nguyên (16 / 24000 / 6, `contextCompaction.ts` byte-identical).

## Commits

| Task | Commit | Nội dung |
|------|--------|----------|
| 1 | `49b71e93` | Tool definitions + handler thread-scoped + dispatch |
| 2 | `6bc5f229` | Wire payload, runtime, prompt và catalog |
| 3 | `c8c851a3` | Chrome UAT cho standalone harness |

## Tests

- `npx vitest run tests/services/ai/chatHistoryTools.test.ts --bail=1` — 6 passed
- `npx vitest run tests/ai/chatTurnTools.test.ts tests/ai/chatTurnRuntime.test.ts src/services/ai/__tests__/chatTurnTools.test.ts --bail=1` — 79 passed
- `npx tsc --noEmit` — exit 0
- `npx playwright test e2e/aiChatSettings.spec.ts --grep "chat history tools" --workers=1` — 1 passed (6.2s, Chrome thật qua channel `chrome`)

Không chạy `npm test` full theo quy tắc dự án.

## Browser UAT

Standalone harness `e2e/aiChatStandalone.html`: seed 2 thread + 3 message trực tiếp vào `TaskMateChatWindowDB` sau khi app boot (Dexie đã nâng schema lên v28), reload để drawer adopts tab `Q7J`. Provider SSE stub 3 request: `search_chat_history`, `read_chat_turn` với `{"turnId":"<own>","threadId":"<foreign>"}` (model arg giả), kết luận cuối. Assert payload tools có cả hai tên, tool result chứa "Bí mật Q7J" + delimiter `DỮ LIỆU KHÔNG ĐÁNG TIN`, không chứa "Tuyệt mật thread khác", câu trả lời cuối render. `watchErrors`/`expectNoErrors` sạch.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] UAT seeding trước boot không thấy store**
- **Found during:** Task 3
- **Issue:** `addInitScript` mở `TaskMateChatWindowDB` ở version 1, chưa có `chatThreads`/`chatTabs`/`settings`, nên seeding bỏ qua và endpoint không persisted.
- **Fix:** chuyển sang seed bằng `page.evaluate` sau khi app boot (Dexie đã upgrade), rồi reload để drawer adopts tab; thêm route `**/v1/models` stub.
- **Files modified:** `e2e/aiChatSettings.spec.ts`
- **Commit:** `c8c851a3`

**2. [Rule 1 - Bug] Test legacy count cứng không còn đúng sau khi thêm 2 tool**
- **Found during:** Task 2
- **Issue:** `tests/ai/chatTurnTools.test.ts` so sánh tổng số tool tuyệt đối, và `src/services/ai/__tests__/chatTurnTools.test.ts` chỉ cho phép 4 source catalog.
- **Fix:** filter hai tên mới ra khỏi legacy count; thêm `'chat'` vào source whitelist test. Legacy tool identity/count không đổi.
- **Files modified:** `tests/ai/chatTurnTools.test.ts`, `src/services/ai/__tests__/chatTurnTools.test.ts`
- **Commit:** `6bc5f229`

**3. [Rule 3 - Blocking] Playwright debug process bị pkill làm chết dev server**
- **Found during:** Task 3 (lần chạy đầu sau `--debug`)
- **Issue:** `--debug` mở browser và treo; pkill để dừng cũng tắt luôn Vite dev server, lần chạy tiếp gặp ERR_CONNECTION_REFUSED.
- **Fix:** chạy lại scoped test để Playwright tự khởi động webServer; không đụng file.
- **Files modified:** none
- **Commit:** none

## Threat Flags

None — T-Q7J-01..04, T-Q7J-SC đều nằm trong threat model và đã có mitigation + test/UAT tương ứng. Không thêm endpoint, auth path hay schema mới.

## Known Stubs

None.
