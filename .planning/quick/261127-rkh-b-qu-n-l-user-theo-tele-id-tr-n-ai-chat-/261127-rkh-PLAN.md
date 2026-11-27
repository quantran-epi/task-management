---
phase: quick
plan: 261127-rkh
type: execute
wave: 1
depends_on: []
files_modified:
  - src/views/TelegramMonitorView.tsx
  - src/components/ai/AISettingsDrawer.tsx
  - src/components/settings/StandaloneDevicePolicyCard.tsx
  - src/components/ai/AIChatDrawer.tsx
  - src/components/ai/runtime/chatTurnRuntime.ts
  - tests/phase51/AISettingsDrawer.test.tsx
  - tests/phase51/AIPopoutView.standalone.test.tsx
  - tests/telegram/StandaloneDevicePolicyCard.test.tsx
autonomous: true
requirements:
  - RKH-01
  - RKH-02
  - RKH-03
must_haves:
  truths:
    - "Trang Telegram chỉ còn 3 tab: Live Monitor, Whitelist & Phân quyền, Cấu hình Bot — không còn tab AI Chat Devices"
    - "AI Settings standalone không còn mục Telegram Device; các nhóm Provider/Knowledge Server/MCP/Graphiti/Oracle SQLcl/SSH Connections/SSH File System/Tool Catalog giữ nguyên thứ tự"
    - "AI chat standalone không còn thông báo dẫn người dùng tới mục Cài đặt AI → Telegram Device đã bị gỡ"
    - "Whitelist user, bot Telegram, service/DB/Rust bridge và cơ chế enforce policy hiện có không thay đổi"
  artifacts:
    - path: src/views/TelegramMonitorView.tsx
      provides: "Tabs Telegram sau khi gỡ tab device, không còn state/handler chỉ phục vụ tab đó"
      contains: "key: 'whitelist'"
    - path: src/components/ai/AISettingsDrawer.tsx
      provides: "STANDALONE_GROUPS không còn group Telegram Device"
      contains: "STANDALONE_GROUPS"
    - path: tests/phase51/AISettingsDrawer.test.tsx
      provides: "Kỳ vọng nav standalone sau khi gỡ group"
      contains: "SSH Connections"
    - path: tests/phase51/AIPopoutView.standalone.test.tsx
      provides: "Kỳ vọng thông báo blocked sau khi đổi text"
      contains: "messages.error"
  key_links:
    - from: src/views/TelegramMonitorView.tsx
      to: src/services/telegram/telegramSettingsService.ts
      via: "recordStandaloneAccessRequest / denyStandaloneAccessRequest vẫn giữ cho hàng pending trong tab whitelist"
      pattern: "recordStandaloneAccessRequest"
    - from: src/components/ai/AISettingsDrawer.tsx
      to: src/components/ai/AIChatDrawer.tsx
      via: "Không còn đường dẫn Cài đặt AI → Telegram Device trong thông báo blocked"
      pattern: "policyState === 'blocked'"
---

<objective>
Gỡ UI quản lý thiết bị standalone AI chat theo phạm vi hẹp đã chốt: (RKH-01) bỏ tab **AI Chat Devices** trong `TelegramMonitorView`, (RKH-02) bỏ nhóm **Telegram Device** khỏi AI Settings standalone kèm card và test chỉ phục vụ card đó, (RKH-03) đổi các thông báo blocked trong AI chat không còn dẫn tới mục cài đặt đã gỡ.

Purpose: tính năng này đã bị bỏ; giữ tab/setting chết tạo đường dẫn hỏng cho người dùng. Chỉ gỡ UI + dead code trực tiếp, không đụng whitelist user, bot Telegram, service/DB/Rust bridge, không đụng whitelist model theo API key (đã có ở 9router).

Output: 3 tab Telegram, AI Settings standalone sạch group Telegram Device, thông báo blocked trung tính, test/scoped gate xanh.

**Quyết định chốt của sếp (không mở lại):**
- "Bỏ mỗi cái tab device thôi, tab device đó thêm khi thêm tính năng quản lý standalone AI chat này."
- "Chỉ cần remove cái setting telegram ở ai chat standalone đi thôi."
- Xoá `StandaloneDevicePolicyCard.tsx` nếu không còn mount và xoá test chỉ test card đó.
- Giữ tab whitelist/bot/settings nguyên vẹn. Không xoá service/DB/Rust bridge.
- Ngoài phạm vi (cố tình giữ nguyên theo yêu cầu): text bot `/policy` trong `src/services/telegram/telegramHeadlessWorker.ts` vẫn nhắc đường dẫn cũ; logic load/enforce policy trong `src/views/AIPopoutView.tsx` và `chatTurnRuntime.ts` không đổi, chỉ đổi text thông báo hướng người dùng.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/quick/261127-01z-qu-n-l-thi-t-b-ai-chat-standalone-qua-te/261127-01z-SUMMARY.md
@src/views/TelegramMonitorView.tsx
@src/components/ai/AISettingsDrawer.tsx
@src/components/ai/AIChatDrawer.tsx
@src/components/ai/runtime/chatTurnRuntime.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1 (RKH-01): Gỡ tab AI Chat Devices khỏi trang Telegram</name>
  <files>src/views/TelegramMonitorView.tsx</files>
  <action>
    Trong `src/views/TelegramMonitorView.tsx` xoá hoàn toàn item tab `key: 'devices'` (label `<SafetyCertificateOutlined /> AI Chat Devices` và toàn bộ `children` chứa bảng `devices`: cột Telegram User ID / Tên / Trạng thái / Model được phép / Model mặc định / Pairing hết hạn / Thao tác, nút Áp dụng gọi `upsertDeviceEnrollment` + `buildPolicyPayload` + `invokeAccessBridge('standalone_access_apply', ...)`, nút Thu hồi).

    Xoá state/import/chỉ phục vụ tab đó: type `'devices'` trong union của `activeTab`, `modelDrafts`, `defaultModelDrafts`, `devices` liveQuery (`db.telegramWhitelist.filter(row => Boolean(row.telegramUserId))`), `cachedModelsRecord`/`cachedModels` liveQuery, import `upsertDeviceEnrollment` và `buildPolicyPayload`. Giữ `Select`, `Space`, `Tag`, `SafetyCertificateOutlined` nếu còn dùng ở tab whitelist (icon đang dùng cho label Whitelist; `Select` dùng ở form whitelist/settings/send modal).

    Xử lý nhánh pending standalone trong tab whitelist: nhánh điều kiện `p.telegramUserId === p.chatId && standaloneRequests.includes(...)` đang có nút **"Duyệt & setup whitelist"** gọi `setActiveTab('devices')` + `message.info(... tab AI Chat Devices ...)` — đây là dead path sau khi bỏ tab, xoá nhánh ternary đó để hàng pending standalone dùng cùng luồng duyệt thường (`Phê duyệt nhanh` + `Tuỳ chỉnh & Duyệt`). Giữ nguyên tag **"Yêu cầu từ Chat standalone"**, nút **Từ chối** (`denyStandaloneAccessRequest` + `invokeAccessBridge`), effect poll `standalone_access_list`/`recordStandaloneAccessRequest`, master switch, bot settings và mọi cột/bảng whitelist khác. Không đụng service, DB, Rust bridge.
  </action>
  <verify>
    <automated>npx tsc --noEmit && test "$(grep -v '^#' src/views/TelegramMonitorView.tsx | grep -c "AI Chat Devices\|key: 'devices'\|modelDrafts\|defaultModelDrafts\|buildPolicyPayload\|upsertDeviceEnrollment")" -eq 0</automated>
  </verify>
  <done>Trang Telegram còn đúng 3 tab; không còn import/state/handler/dead path dẫn tới tab device; whitelist pending standalone vẫn duyệt/từ chối được; tsc clean.</done>
</task>

<task type="auto">
  <name>Task 2 (RKH-02): Gỡ nhóm Telegram Device khỏi AI Settings standalone</name>
  <files>src/components/ai/AISettingsDrawer.tsx, src/components/settings/StandaloneDevicePolicyCard.tsx, tests/phase51/AISettingsDrawer.test.tsx, tests/telegram/StandaloneDevicePolicyCard.test.tsx</files>
  <action>
    Trong `src/components/ai/AISettingsDrawer.tsx`: xoá import `StandaloneDevicePolicyCard` và phần tử đầu tiên của `STANDALONE_GROUPS` (label/header `Telegram Device`, `render: (db) => <StandaloneDevicePolicyCard db={db} />`). Giữ nguyên cấu trúc còn lại `...GROUPS.slice(0, 5)`, `{ label: 'SSH Connections', ...SshConfigCard }`, `...GROUPS.slice(5)` và prop `standalone` — chỉ bỏ group Telegram Device, không đổi thứ tự nhóm nào khác.

    Xoá file `src/components/settings/StandaloneDevicePolicyCard.tsx` (sau RKH-01 + thay đổi trên, không còn nơi mount) và file `tests/telegram/StandaloneDevicePolicyCard.test.tsx` (test duy nhất của card đó). Trong `tests/phase51/AISettingsDrawer.test.tsx`, bỏ `'Telegram Device'` khỏi `STANDALONE_GROUP_LABELS`, giữ các assertion exact-array ở Test 9/Test 10 để khoá nav standalone không có mục này; không đổi mock card khác.
  </action>
  <verify>
    <automated>npx vitest run tests/phase51/AISettingsDrawer.test.tsx --bail=1 && test "$(grep -v '^#' src/components/ai/AISettingsDrawer.tsx | grep -c 'Telegram Device\|StandaloneDevicePolicyCard')" -eq 0 && test ! -e src/components/settings/StandaloneDevicePolicyCard.tsx && test ! -e tests/telegram/StandaloneDevicePolicyCard.test.tsx</automated>
  </verify>
  <done>AI Settings standalone hiển thị đúng 8 nhóm không có Telegram Device; card và test riêng bị xoá; scoped test xanh.</done>
</task>

<task type="auto">
  <name>Task 3 (RKH-03): Đổi thông báo blocked không còn dẫn tới setting đã gỡ</name>
  <files>src/components/ai/AIChatDrawer.tsx, src/components/ai/runtime/chatTurnRuntime.ts, tests/phase51/AIPopoutView.standalone.test.tsx</files>
  <action>
    Trong `src/components/ai/AIChatDrawer.tsx`, đổi cả 2 thông báo ở `handleSendTurn` và `handleRetry` (hai dòng giống hệt): thay `Chưa có quyền dùng Chat. Vào Cài đặt AI → Telegram Device để gửi lại yêu cầu.` bằng `Chưa có quyền dùng Chat. Liên hệ admin để được cấp quyền.` Giữ nguyên điều kiện `policyState === 'blocked'` và hành vi return sớm.

    Trong `src/components/ai/runtime/chatTurnRuntime.ts`, đổi `message` của `POLICY_BLOCKED_TURN_ERROR` từ `Chính sách thiết bị hết hạn hoặc bị thu hồi. Vào Cài đặt AI → Telegram Device để cập nhật /policy.` sang `Chính sách thiết bị hết hạn hoặc bị thu hồi. Liên hệ admin để cập nhật quyền.` Giữ nguyên `code: 'policy_blocked'`, luồng `onError`/trả outcome trong `start()`. Không đụng logic enforce model/policy.

    Trong `tests/phase51/AIPopoutView.standalone.test.tsx`, cập nhật kỳ vọng tại dòng 167 theo text mới của `AIChatDrawer`; giữ nguyên fixture policy, phần source-assert (`ACCESS_STATE_SETTINGS_KEY`, `saveAccessState`, `pollStandaloneAccess`) và các bước render/click.
  </action>
  <verify>
    <automated>npx vitest run tests/phase51/AIPopoutView.standalone.test.tsx --bail=1 && test "$(grep -v '^#' src/components/ai/AIChatDrawer.tsx src/components/ai/runtime/chatTurnRuntime.ts | grep -c 'Cài đặt AI → Telegram Device')" -eq 0</automated>
  </verify>
  <done>Không còn thông báo nào trong AI chat dẫn tới mục cài đặt đã gỡ; blocked vẫn chặn gửi/retry đúng; scoped test xanh.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Telegram admin UI → whitelist | Hàng pending từ bot/bridge vẫn được duyệt/từ chối trong tab whitelist; thay đổi chỉ là bỏ nút chuyển sang tab đã xoá |
| AI chat → policy block | Thông báo/block error là text hướng dẫn; không đổi luồng enforce hay nguồn dữ liệu policy |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-261127rkh-01 | Tampering | Nhánh duyệt pending standalone trong `TelegramMonitorView` | mitigate | Bỏ nút chuyển tab chết, nhưng giữ nguyên `quickApprove`/`denyStandaloneAccessRequest` + Popconfirm; không thêm writer hay handler mới. |
| T-261127rkh-02 | Information disclosure | Text bot `/policy` trong `telegramHeadlessWorker.ts` | accept | Theo phạm vi chốt của sếp: không đụng bot Telegram; text cũ còn nhắc đường dẫn setting đã gỡ, chỉ là hướng dẫn, không lộ secret hay làm thay đổi dữ liệu. |
| T-261127rkh-03 | Tampering | `POLICY_BLOCKED_TURN_ERROR` | mitigate | Chỉ đổi `message`; giữ `code: 'policy_blocked'` và cơ chế chặn turn trước provider call để consumer phân loại lỗi không bị vỡ. |
| T-261127rkh-SC | Tampering | npm/pip/cargo installs | mitigate | Không cài package mới; chỉ xoá UI/text và cập nhật test có sẵn. |
</threat_model>

<verification>
Chạy từ checkout root, trên `pre-v1.6-baseline`. Tuyệt đối không chạy full vitest suite (quy tắc dự án: > 1 tiếng); chỉ scoped path:

- Task 1: `npx tsc --noEmit` + grep gate xoá tab/state.
- Task 2: `npx vitest run tests/phase51/AISettingsDrawer.test.tsx --bail=1` + grep gate + kiểm tra 2 file bị xoá.
- Task 3: `npx vitest run tests/phase51/AIPopoutView.standalone.test.tsx --bail=1` + grep gate.
- Gate cuối: `npx tsc --noEmit`, `npx vitest run tests/phase51/AISettingsDrawer.test.tsx tests/phase51/AIPopoutView.standalone.test.tsx tests/telegram/devicePolicy.test.ts --bail=1` (xác nhận domain policy nguyên vẹn), review `git diff`, verify trong Chrome/Tauri: trang Telegram 3 tab, AI Settings standalone không có Telegram Device, bot/whitelist vẫn thao tác được. Không đụng PWA/GitHub Pages. Mỗi task commit riêng.
</verification>

<success_criteria>
- Trang Telegram chỉ còn Live Monitor / Whitelist & Phân quyền / Cấu hình Bot; không còn biến, import hay handler nào chỉ phục vụ tab device.
- AI Settings standalone mất group Telegram Device; `StandaloneDevicePolicyCard.tsx` và test riêng bị xoá; 8 nhóm còn lại đúng thứ tự.
- Mọi thông báo blocked trong AI chat dùng text trung tính, không còn dẫn tới setting đã gỡ; `policyState === 'blocked'` vẫn chặn gửi/retry.
- Whitelist/bot/service/DB/Rust bridge/enforce policy không đổi; scoped Vitest + tsc xanh; diff reviewed + Chrome verified; không dependency mới, không full suite.
</success_criteria>

<output>
Create `.planning/quick/261127-rkh-b-qu-n-l-user-theo-tele-id-tr-n-ai-chat-/261127-rkh-SUMMARY.md` when done
</output>
