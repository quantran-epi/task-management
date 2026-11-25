---
phase: 51-taskmate-chat-standalone
reviewed: 2026-11-25T18:10:15Z
depth: deep
files_reviewed: 14
files_reviewed_list:
  - src-tauri/tauri.conf.chat.json
  - vite.chat.config.ts
  - tests/phase51/chatConfig.test.ts
  - tests/phase51/standaloneRoute.test.tsx
  - tests/phase51/AIPopoutView.standalone.test.tsx
  - tests/phase51/AIPopoutView.legacy.test.tsx
  - src/AppIntelliJ.tsx
  - src/views/AIPopoutView.tsx
  - src/components/ai/AIChatDrawer.tsx
  - src/components/ai/ChatHeader.tsx
  - src/components/ai/AISettingsDrawer.tsx
  - tests/phase51/AISettingsDrawer.test.tsx
  - tests/phase51/groundingSuppression.test.tsx
  - package.json
findings:
  critical: 1
  warning: 6
  info: 1
  total: 8
status: issues_found
---

# Phase 51: Báo cáo Code Review

**Reviewed:** 2026-11-25T18:10:15Z
**Depth:** deep
**Files Reviewed:** 14
**Status:** issues_found

## Summary

Review deep đi theo import/call chain từ `AppIntelliJ` → `AIPopoutView` → `AIChatDrawer` → `AiChatWidget`/`aiOrchestratorLoop`, đối chiếu với `51-CONTEXT.md` (D-01..D-14) và `51-UI-SPEC.md`. Cấu hình Tauri/Vite/package/scripts đúng hợp đồng, không thêm dependency, nhánh legacy (TaskMate thường) giữ nguyên, 28 test phase51 pass. Tuy nhiên có 1 lỗi CRITICAL về scope leak: standalone chat vẫn quảng bá và có thể thực thi toàn bộ TaskMate DB mutation tools. Ngoài ra copy/empty-state/quick prompt mang nội dung tác vụ, scope picker vẫn mở được, và notification deeplink có thể đưa standalone app sang workbench — tất cả vi phạm D-08/D-05 và UI-SPEC Copywriting Contract.

## Critical Issues

### CR-01: Standalone chat vẫn quảng bá và thực thi TaskMate DB mutation tools

**File:** `src/components/ai/AIChatDrawer.tsx:2016-2022`, `src/services/ai/chatTurnTools.ts:104-129`, `src/components/ai/AIChatDrawer.tsx:1539,2678-2679`, `src/services/ai/aiOrchestratorLoop.ts:481-539`
**Severity:** CRITICAL
**Issue:** Tại `AIChatDrawer.tsx:2016` lượt chat gọi `getToolsForTurnWithRemote({...})` mà không truyền `allowedToolNames`, bất kể `isStandaloneChat`. Trong `chatTurnTools.ts:112`, `allowedToolNames === undefined` nghĩa là **không có allowlist**: toàn bộ `AI_DATABASE_TOOLS` đều được đưa vào payload, gồm `create_task`, `update_task`, `delete_task`, `create_change_request`, `delete_change_request`, `plan_allocation`, `log_work_session`, `delete_note`, v.v. (`src/services/ai/aiTools.ts:709-1734`). Orchestrator (`aiOrchestratorLoop.ts:481-539`) thực thi mutation qua `dispatchAiToolCall`; cổng `onMutationCheck` chỉ chặn khi `autoApprove` tắt. `turnAutoApprove` đọc từ `turnTab.config.autoApproveMutations` (`AIChatDrawer.tsx:1539`), là cấu hình tab **persisted** trong cùng Dexie store, và toggle này vẫn hiển thị trong standalone (`AIChatDrawer.tsx:2678-2679` → `ChatTabToolbox`). Kịch bản cụ thể: bật "auto approve" trong một tab, hoặc mở app Chat với tab đã bật sẵn, rồi nhập "xóa mọi task quá hạn" — model gọi `delete_task`, approval bị bỏ qua, dữ liệu TaskMate bị xóa mà `51-CONTEXT.md:12,122` ("task CRUD from chat — out of scope") và D-08 cấm. Ngay cả khi auto-approve tắt, việc expose mutation tools là scope leak: approval card hiện tên tool TaskMate trong app được quảng cáo là "chat thuần, không có ngữ cảnh TaskMate".
**Fix:** Thêm option riêng, ví dụ `suppressTaskmateTools?: boolean`, vào `RemoteTurnToolOptions` trong `src/services/ai/chatTurnTools.ts`. Trước khi gọi `getToolsForTurn`, lọc builtin `AI_DATABASE_TOOLS` xuống tập knowledge/artifact được phép (`retrieve_knowledge`, `get_document_details`, `search_knowledge_base`, `generate_file`, `generate_pptx`, `generate_image`), **giữ nguyên** `dynamicMcpTools` (MCP/Graphiti/Oracle/SSH) — không dùng `allowedToolNames` vì filter đó cũng áp cho MCP tools ở dòng 124. Truyền option này từ `AIChatDrawer.tsx:2016` khi `isStandaloneChat`. Bổ sung assert trong `tests/phase51/groundingSuppression.test.tsx` rằng `currentCapture()?.toolsSent` không chứa tool mutation/task DB.

## Warnings

### WR-01: Quick prompt và empty-state copy vẫn nói về tác vụ trong standalone

**File:** `src/components/ai/AIChatDrawer.tsx:191-196,2695,2698-2701`
**Severity:** WARNING
**Issue:** `DRAWER_QUICK_PROMPTS` chứa `Lập kế hoạch hôm nay`, `Báo cáo tiến độ`, `Tác vụ quá hạn`; được truyền vào `AiChatWidget` ở dòng 2695 không phụ thuộc `isStandaloneChat`. Empty state dùng heading `Trợ lý AI ${APP_NAME}` và body `Đặt câu hỏi về tác vụ hiện tại, phân tích tiến độ, gợi ý checklist...`. Browser verification tại `http://localhost:4178/task-management/index.html#ai-popout` xác nhận các nút và đoạn copy này render trong standalone. `51-UI-SPEC.md:99-100` yêu cầu heading `Chưa có hội thoại`, body `Nhập tin nhắn bên dưới để bắt đầu. Enter để gửi, Shift+Enter để xuống dòng.`; `51-UI-SPEC.md:111` yêu cầu first-run prompt `Chưa có API Key. Mở Cài đặt AI → Provider để nhập key.` Đây là gap copy contract và là TaskMate task framing lọt vào app "không có ngữ cảnh TaskMate" (D-08).
**Fix:** Trong `AIChatDrawer.tsx`, khi `isStandaloneChat` truyền `quickPrompts={[]}` (hoặc tập prompt trung tính) và `emptyState` lấy copy từ UI-SPEC; giữ nguyên giá trị hiện tại cho legacy. Thread first-run qua `onOpenSettings`. Thêm assert trong `tests/phase51/AIPopoutView.standalone.test.tsx` rằng `queryByText('Lập kế hoạch hôm nay')` và `queryByText(/tác vụ hiện tại/)` không tồn tại.

### WR-02: Slash command aliases rewrite sang TaskMate planning prompt

**File:** `src/components/ai/AIChatDrawer.tsx:1444-1458`
**Severity:** WARNING
**Issue:** `/plan`, `/status`, `/overdue`, `/help` luôn được rewrite thành `Lập kế hoạch công việc hôm nay`, `Báo cáo tiến độ hiện tại`, `Kiểm tra các tác vụ quá hạn`, `Hướng dẫn sử dụng trợ lý AI và các lệnh`, kể cả khi `isStandaloneChat=true`. Người dùng gõ `/plan` trong app Chat sẽ gửi prompt bảo model lên kế hoạch tác vụ — prompt này sau đó kết hợp với system prompt "full database mutation capabilities" (xem WR-03) và tool list CR-01.
**Fix:** Đặt khối rewrite trong `if (!isStandaloneChat) { ... }`, hoặc dùng bảng alias trung tính riêng cho standalone. Đảm bảo `/clear` vẫn hoạt động ở cả hai nhánh.

### WR-03: System prompt standalone khẳng định có toàn quyền mutation DB và các rules TaskMate

**File:** `src/components/ai/AIChatDrawer.tsx:2047-2082`
**Severity:** WARNING
**Issue:** `systemPromptContent` được dựng cố định cho mọi turn: dòng 2052-2054 liệt kê "tasks, change requests, subsystems, statuses, deadlines, logged work sessions... MUST be strictly grounded in concrete evidence returned by your tools", dòng 2057 "YOU HAVE FULL DATABASE MUTATION CAPABILITIES: You can create, update, reparent, or delete tasks...". Trong standalone, các tool đó phải bị chặn (CR-01), nhưng prompt vẫn bảo model có chúng — gây hallucination và mâu thuẫn với D-08. `groundingSuppression.test.tsx` chỉ assert absence của `<global_context>`/`<mentioned_entities>`, không bắt được đoạn này.
**Fix:** Tách system prompt theo `isStandaloneChat`: bỏ rules 2-3-4/7 liên quan entity TaskMate và tự mô tả năng lực bằng đúng tập tool thực sự gửi trong standalone (knowledge/SSH/Oracle/MCP). Check `systemPrompt` capture trong test để khẳng định không chứa "FULL DATABASE MUTATION CAPABILITIES".

### WR-04: ScopeChipsBar vẫn mở ScopePickerModal chọn task/CR/system trong standalone

**File:** `src/components/ai/AIChatDrawer.tsx:2629-2635,2579-2595,2583-2592`
**Severity:** WARNING
**Issue:** Sau một grounded turn, `activeRoutedScope` (từ `routedScopeByTab`, dòng 1237/1750) có thể có facet domain/env/version → `ScopeChipsBar` render với `onEditScope={() => setScopeModalOpen(true)}`. `ScopePickerModal` được mount unconditional (dòng 2579) và liệt kê `db.tasks`, `db.changeRequests`, `db.systems` (`ScopePickerModal.tsx:56-58`). Click vào chip gọi `onSelectScope` → `setInternalScope(newScope)` + `setCustomScope(newScope)` (dòng 2583-2592), biến `currentScope` từ global sang task/CR/system — vi phạm D-08 "force global scope" và "no task/project context". Test `AIPopoutView.standalone.test.tsx:95` chỉ kiểm tra nút "Đổi phạm vi ngữ cảnh" trong header, không phủ đường này.
**Fix:** Khi `isStandaloneChat`, render chip dạng non-interactive (bỏ `role="button"`, `tabIndex`, `onClick`) hoặc ẩn hẳn khối `ScopeChipsBar`; đồng thời không mount `ScopePickerModal`. Với `ScopeChipsBar`, cho phép prop `readOnly?: boolean` để giữ hành vi legacy nguyên vẹn.

### WR-05: Notification deeplink đưa standalone app sang dashboard/workbench

**File:** `src/components/ai/AIChatDrawer.tsx:1311-1315`, `src/AppIntelliJ.tsx:62-90`, `src/utils/notificationDeepLink.ts:61-68`
**Severity:** WARNING
**Issue:** `notifyIfBlurred` gửi notification với `deeplink: NotificationDeepLink.dashboard` (`#/dashboard`). `AppIntelliJ` mount `startNotificationDeepLinkListener()` ở root cho **mọi** route, kể cả standalone. Listener gọi `applyNotificationDeepLink` → set `window.location.hash = '#/dashboard'` → `useHashRoute` đổi route → nhánh default `AppIntelliJ.tsx:138-155` render `WorkbenchLayout`. Kịch bản: user đang dùng TaskMate Chat, chuyển sang app khác, click notification "AI trả lời xong" → app Chat thoát chat, hiện workbench TaskMate — vi phạm D-05/D-07/D-13.
**Fix:** Truyền cờ `standaloneChat` tới `startNotificationDeepLinkListener` và bỏ qua event khi standalone (hoặc map mọi deeplink về `#ai-popout`); đồng thời trong `AIChatDrawer` dùng deeplink trung tính khi `isStandaloneChat`.

### WR-06: Thiếu connection status có `aria-live="polite"` trong standalone shell

**File:** `src/components/ai/ChatHeader.tsx:40-82`, `src/views/AIPopoutView.tsx:220-231`
**Severity:** WARNING
**Issue:** `51-UI-SPEC.md:88` yêu cầu status copy truthful ("Knowledge · MCP sẵn sàng" chỉ khi thực sự reachable; nếu không thì "Knowledge Server chưa kết nối — mở Cài đặt AI") với `aria-live="polite"`; `51-UI-SPEC.md:119,126` yêu cầu titlebar có truthful connection status. Nhánh standalone của `ChatHeader` chỉ render icon, chữ "AI Chat", chip "Global · không có ngữ cảnh TaskMate" và gear — không có status node nào, không có `aria-live`. Hệ quả: user không biết Knowledge/MCP đang offline và không có thông báo accessible khi trạng thái đổi.
**Fix:** Thêm một `<span role="status" aria-live="polite">` trong standalone header, derive từ `knowledgeConfig` và MCP readiness đã có trong `AIChatDrawer.tsx:1977-1999` (truyền qua prop xuống `ChatHeader`), render đúng copy trong UI-SPEC. Giữ legacy header nguyên vẹn.

## Info

### IN-01: Test phase51 không pin copy contract và tool allowlist của standalone

**File:** `tests/phase51/AIPopoutView.standalone.test.tsx:84-98`, `tests/phase51/groundingSuppression.test.tsx:202-265`
**Severity:** INFO
**Issue:** `AIPopoutView.standalone.test.tsx` chỉ assert affordances và draft giữ nguyên; không assert empty-state/quick-prompt copy. `groundingSuppression.test.tsx` capture `systemPrompt` nhưng không assert `toolsSent` (dù `aiDebugService.startTurn` thu cả hai). Vì thế WR-01/WR-02/WR-03/CR-01 lọt qua 28 test pass. `chatConfig.test.ts` thì assert chặt chữ scripts/config — tốt, nhưng không có assert runtime copy/tool boundary tương ứng.
**Fix:** Bổ sung 2–3 assert ngắn: (1) standalone render không có "Lập kế hoạch hôm nay"/"tác vụ hiện tại" và có "Chưa có hội thoại"; (2) `currentCapture()?.toolsSent` không chứa `create_task|update_task|delete_task`; (3) systemPrompt không chứa "FULL DATABASE MUTATION CAPABILITIES".

---

_Reviewed: 2026-11-25T18:10:15Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
