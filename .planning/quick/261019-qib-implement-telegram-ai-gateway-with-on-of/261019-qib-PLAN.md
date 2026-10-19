---
phase: quick
plan: 261019-qib
type: execute
wave: 1
depends_on: []
files_modified:
  - src-tauri/Cargo.toml
  - src-tauri/src/lib.rs
  - src-tauri/src/telegram_gateway.rs
  - src/types/models.ts
  - src/types/navigation.ts
  - src/db/schema.ts
  - src/db/index.ts
  - src/services/telegram/telegramTypes.ts
  - src/services/telegram/telegramSettingsService.ts
  - src/services/telegram/telegramHeadlessWorker.ts
  - src/views/TelegramMonitorView.tsx
  - src/components/shell/Navigation.tsx
  - src/components/shell/AppShell.tsx
  - src/App.tsx
  - tests/db.test.ts
  - tests/telegram/telegramSettingsService.test.ts
  - tests/telegram/telegramHeadlessWorker.test.ts
autonomous: true
requirements:
  - QUICK-TELEGRAM-AI-GATEWAY-ON-OFF-CONTROLS
must_haves:
  truths:
    - "Telegram polling runs in background via Rust tokio task with CancellationToken support and immediate shutdown on stop command."
    - "Telegram 409 Conflict triggers automatic polling termination and emits telegram-conflict-detected to frontend, switching off is_enabled."
    - "IndexedDB Schema V12 defines telegramSettings, telegramWhitelist, and telegramSessionLogs tables with reactive Dexie bindings."
    - "Headless worker verifies chat_id against whitelist, enforces daily quotas, resolves context per data_scope, and replies back to Telegram via AI pipeline."
    - "TelegramMonitorView provides Realtime status badges, On/Off switch, Auto-start checkbox, Live Monitor logs, and Whitelist/Scope configuration."
  artifacts:
    - path: "src-tauri/src/telegram_gateway.rs"
      provides: "Tauri Rust long-polling getUpdates loop, cancellation token, 409 conflict detection, and Telegram Bot API command handlers"
      exports: ["start_telegram_polling", "stop_telegram_polling", "get_telegram_status", "send_telegram_reply", "send_telegram_action"]
    - path: "src/services/telegram/telegramSettingsService.ts"
      provides: "Dexie persistence for telegramSettings, telegramWhitelist, and telegramSessionLogs"
      exports: ["getTelegramSettings", "saveTelegramSettings", "getWhitelist", "upsertWhitelistUser", "deleteWhitelistUser", "checkAndConsumeQuota", "logTelegramSession", "getRecentTelegramLogs"]
    - path: "src/services/telegram/telegramHeadlessWorker.ts"
      provides: "Event listener for telegram-inbound, whitelist/quota verification, scope-based context injection, AI dispatch, and reply chunking"
      exports: ["useTelegramHeadlessWorker", "processTelegramInboundMessage"]
    - path: "src/views/TelegramMonitorView.tsx"
      provides: "Ant Design UI for live message monitoring, whitelist/scope editing, bot token management, and on/off controls"
      exports: ["TelegramMonitorView"]
  key_links:
    - from: "src-tauri/src/telegram_gateway.rs"
      to: "src/services/telegram/telegramHeadlessWorker.ts"
      via: "app.emit('telegram-inbound', update) & app.emit('telegram-conflict-detected')"
      pattern: "telegram-inbound|telegram-conflict-detected"
    - from: "src/services/telegram/telegramHeadlessWorker.ts"
      to: "src/services/telegram/telegramSettingsService.ts"
      via: "checkAndConsumeQuota / logTelegramSession"
      pattern: "checkAndConsumeQuota|logTelegramSession"
    - from: "src/views/TelegramMonitorView.tsx"
      to: "src-tauri/src/telegram_gateway.rs"
      via: "invoke('start_telegram_polling') / invoke('stop_telegram_polling')"
      pattern: "start_telegram_polling|stop_telegram_polling"
---

<objective>
Implement the Telegram AI Gateway with headless background polling and comprehensive on/off controls in TaskMate.

Purpose: Allow personal users to query their TaskMate AI assistant and grounded knowledge directly from Telegram, with full local control over device-specific on/off toggles, automatic 409 conflict cancellation, whitelist authorization, daily quota enforcement, and real-time live monitoring.
Output: Rust Telegram long-polling gateway, Dexie Schema V12 tables, Headless React worker, TelegramMonitorView with tabs for Live Monitor, Whitelist/Scope, and Bot Settings, plus unit tests.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@docs/TELEGRAM_AI_GATEWAY_PLAN.md
@src-tauri/src/lib.rs
@src/db/schema.ts
@src/db/index.ts
@src/types/models.ts
@src/types/navigation.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Rust Telegram Gateway with Long-Polling, CancellationToken, and 409 Conflict Handling</name>
  <files>src-tauri/Cargo.toml, src-tauri/src/telegram_gateway.rs, src-tauri/src/lib.rs</files>
  <behavior>
    - Add `tokio-util` with feature `sync` (or standard `tokio::sync::watch` / `CancellationToken`) to manage background polling lifetime cleanly.
    - Implement `TelegramGatewayState` with active polling cancellation handle, bot token, and running state.
    - Implement `start_telegram_polling(app_handle, token)`: validates non-empty token, cancels existing poll if running, creates new `CancellationToken`, spawns background tokio task.
    - Long-polling loop calls Telegram Bot API `getUpdates` with `timeout=25` and offset tracking.
    - On HTTP 409 Conflict: cancel polling loop immediately, update state to stopped, emit `telegram-conflict-detected` (with reason and timestamp) and `telegram-status-changed` (running: false) to webview.
    - On valid update containing a message with text: emit `telegram-inbound` event payload (`{ update_id, message_id, chat_id, from_name, text, date }`) to webview.
    - Implement `stop_telegram_polling(app_handle)`: triggers cancellation token, waits/cleans up task handle, emits `telegram-status-changed` (running: false).
    - Implement `get_telegram_status()` returning `{ running: bool, error: Option<String> }`.
    - Implement `send_telegram_reply(token, chat_id, text, reply_to_message_id)`: sends `sendMessage` request to Telegram Bot API with markdown/HTML or plain text fallback.
    - Implement `send_telegram_action(token, chat_id, action)`: sends `sendChatAction` (e.g. "typing") to Telegram Bot API.
  </behavior>
  <action>
1. In `src-tauri/Cargo.toml`, add `tokio-util = { version = "0.7", features = ["sync"] }` under `[dependencies]`.
2. Create `src-tauri/src/telegram_gateway.rs`:
   - Define structures `TelegramUpdate`, `TelegramMessage`, `TelegramChat`, `TelegramInboundPayload`, `TelegramGatewayState`.
   - Implement commands:
     - `start_telegram_polling(app: tauri::AppHandle, state: tauri::State<TelegramGatewayState>, token: String) -> Result<(), String>`
     - `stop_telegram_polling(app: tauri::AppHandle, state: tauri::State<TelegramGatewayState>) -> Result<(), String>`
     - `get_telegram_status(state: tauri::State<TelegramGatewayState>) -> Result<TelegramStatusResponse, String>`
     - `send_telegram_reply(token: String, chat_id: String, text: String, reply_to_message_id: Option<i64>) -> Result<(), String>`
     - `send_telegram_action(token: String, chat_id: String, action: String) -> Result<(), String>`
   - In the polling loop, check `cancellation_token.is_cancelled()`. Call `https://api.telegram.org/bot{token}/getUpdates?offset={offset}&timeout=25`.
   - If HTTP response status is 409, trigger `cancellation_token.cancel()`, emit `telegram-conflict-detected`, emit `telegram-status-changed`, and break.
   - For network timeouts or transient errors, back off 3 seconds and retry unless cancelled.
3. In `src-tauri/src/lib.rs`, register `mod telegram_gateway;`, initialize `TelegramGatewayState`, and add all 5 commands to `tauri::generate_handler!`.
  </action>
  <verify>
    <automated>cargo check --manifest-path src-tauri/Cargo.toml</automated>
  </verify>
  <done>Rust backend compiles without warnings or errors, exports all 5 telegram commands, and properly handles cancellation and 409 conflict detection.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Dexie Schema V12, Settings Service, and Headless Telegram Worker</name>
  <files>src/types/models.ts, src/db/schema.ts, src/db/index.ts, src/services/telegram/telegramTypes.ts, src/services/telegram/telegramSettingsService.ts, src/services/telegram/telegramHeadlessWorker.ts, tests/db.test.ts, tests/telegram/telegramSettingsService.test.ts, tests/telegram/telegramHeadlessWorker.test.ts</files>
  <behavior>
    - Add `SCHEMA_V12` with tables:
      - `telegramSettings`: `'id'` (storing `id: 'default'`, `botToken`, `isEnabled`, `autoStartOnLaunch`, `defaultScope`)
      - `telegramWhitelist`: `'chatId, name, status, dataScope, dailyLimit, usedToday, lastActiveDate'`
      - `telegramSessionLogs`: `'id, chatId, dataScopeUsed, createdAt'`
    - Update `src/db/index.ts` to register version 12 and table properties.
    - Update `tests/db.test.ts` to expect the 3 new tables in database table list test.
    - In `telegramSettingsService.ts`:
      - `getTelegramSettings(db)` / `saveTelegramSettings(settings, db)`.
      - `getWhitelist(db)` / `upsertWhitelistUser(user, db)` / `deleteWhitelistUser(chatId, db)`.
      - `checkAndConsumeQuota(chatId, db)`: resets `usedToday` if `lastActiveDate !== today`, checks `usedToday < dailyLimit`, increments `usedToday` if permitted.
      - `logTelegramSession(log, db)` and `getRecentTelegramLogs(limit, db)`.
    - In `telegramHeadlessWorker.ts`:
      - React hook `useTelegramHeadlessWorker()` mounted in `AppShell`:
        - On startup: if `isEnabled && autoStartOnLaunch && botToken`, calls `invoke('start_telegram_polling', { token: botToken })`.
        - Listens to Tauri `telegram-conflict-detected`: sets `isEnabled = false` in `telegramSettings`, pops user notification warning of multi-device conflict.
        - Listens to Tauri `telegram-inbound`:
          - Step 1: Whitelist check. If unauthorized or blocked, send Telegram reply mentioning Chat ID for admin approval, record to pending queue, and exit.
          - Step 2: Quota check. If quota exceeded, send notice and exit.
          - Step 3: Send typing status action via Tauri command.
          - Step 4: Resolve context per `dataScope` (`full`, `knowledge_only`, `tasks_only`, `pure_llm`).
          - Step 5: Invoke AI chat generation (via `nineRouterClient` or AI service).
          - Step 6: Chunk response if length > 4096 characters, send via `send_telegram_reply`.
          - Step 7: Record session to `telegramSessionLogs`.
  </behavior>
  <action>
1. In `src/types/models.ts` and `src/services/telegram/telegramTypes.ts`, define TypeScript interfaces: `TelegramSettingsRecord`, `TelegramWhitelistUser`, `TelegramSessionLog`, `TelegramInboundEvent`, `TelegramDataScope`.
2. In `src/db/schema.ts`, export `SCHEMA_V12 = { ...SCHEMA_V11, telegramSettings: 'id', telegramWhitelist: 'chatId, name, status, dataScope, dailyLimit, usedToday, lastActiveDate', telegramSessionLogs: 'id, chatId, dataScopeUsed, createdAt' }`.
3. In `src/db/index.ts`, add table definitions to `TaskPlannerDatabase` and `this.version(12).stores(SCHEMA_V12)`.
4. Update `tests/db.test.ts` to include `'telegramSettings', 'telegramWhitelist', 'telegramSessionLogs'`.
5. Implement `src/services/telegram/telegramSettingsService.ts` with all CRUD operations and quota management.
6. Implement `src/services/telegram/telegramHeadlessWorker.ts` with the worker pipeline, message chunking (<4096 characters), context injection, and Tauri event listener bindings.
7. Write Vitest unit tests in `tests/telegram/telegramSettingsService.test.ts` and `tests/telegram/telegramHeadlessWorker.test.ts`.
  </action>
  <verify>
    <automated>npx vitest run tests/db.test.ts tests/telegram/telegramSettingsService.test.ts tests/telegram/telegramHeadlessWorker.test.ts</automated>
  </verify>
  <done>Schema V12 is registered, database tests pass, and headless worker logic cleanly handles whitelist verification, quota bounds, context extraction, and error conditions.</done>
</task>

<task type="auto">
  <name>Task 3: Telegram Live Monitor & Whitelist Management UI</name>
  <files>src/types/navigation.ts, src/components/shell/Navigation.tsx, src/components/shell/AppShell.tsx, src/App.tsx, src/views/TelegramMonitorView.tsx</files>
  <behavior>
    - Add route `'telegram'` to `AppRoute` in `src/types/navigation.ts`.
    - Add menu item "Telegram Bot" with icon (e.g. `SendOutlined` / `MessageOutlined`) in `Navigation.tsx`.
    - Mount `useTelegramHeadlessWorker()` in `AppShell` so it runs continuously in background regardless of active route.
    - Create `src/views/TelegramMonitorView.tsx`:
      - **Header & Quick Controls**:
        - Real-time Status Badge: Running (Green), Stopped (Gray), 409 Conflict (Red).
        - Master Switch: On/Off Bot listener (invokes start/stop polling and updates IndexedDB `isEnabled`).
        - Checkbox: "Tự khởi động cùng ứng dụng" (updates `autoStartOnLaunch`).
        - Alert banner when 409 Conflict occurs explaining that another device is running the bot.
      - **Tab 1: Live Monitor**:
        - List of incoming and outgoing messages with Chat ID, user query, data scope used, token usage, timestamp, and AI response.
        - Filter by Chat ID or search query.
      - **Tab 2: Whitelist & Scope**:
        - Table of authorized users: Chat ID, Name, Status (Active/Blocked toggle), Data Scope (Full / Knowledge only / Tasks only / Pure LLM), Daily Limit, Used Today with progress bar.
        - Add / Edit / Remove modal for whitelist users.
        - "Hàng chờ phê duyệt" (Pending Queue): lists unrecognized Chat IDs that attempted to chat, with 1-click "Phê duyệt" button to add them directly to whitelist.
      - **Tab 3: Bot Settings**:
        - Telegram Bot Token input (with mask/show toggle).
        - "Kiểm tra kết nối" button to verify token via getMe.
        - Default scope selector for new users.
  </behavior>
  <action>
1. Update `src/types/navigation.ts` to include `'telegram'` in `AppRoute`.
2. In `src/components/shell/Navigation.tsx`, add `{ key: 'telegram', icon: <SendOutlined />, label: 'Telegram Bot' }`.
3. In `src/components/shell/AppShell.tsx`, invoke `useTelegramHeadlessWorker()` to maintain background message processing.
4. In `src/App.tsx`, import `TelegramMonitorView` and render it for `case 'telegram':`.
5. Build `src/views/TelegramMonitorView.tsx` with Ant Design components (`Card`, `Tabs`, `Table`, `Switch`, `Badge`, `Tag`, `Modal`, `Form`, `Input`, `Select`, `InputNumber`, `Progress`, `Space`, `Button`, `Alert`).
6. Ensure responsive layout and dark/light theme consistency.
  </action>
  <verify>
    <automated>npm run build</automated>
  </verify>
  <done>Frontend builds successfully with Vite and TypeScript strict mode, Telegram navigation is available, and the Live Monitor view renders complete controls for bot lifecycle, whitelist, and log inspection.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Telegram API -> Tauri Rust Backend | Untrusted external network payload entering via getUpdates HTTP long-polling |
| Tauri Rust Backend -> React Webview | IPC event boundary (telegram-inbound) carrying external user chat messages |
| Whitelist & Quota Policy -> AI Pipeline | Authorization boundary preventing unauthorized access to personal tasks and knowledge base |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-QIB-01 | Spoofing / Elevation | Headless Worker Auth | mitigate | Enforce strict whitelist check on `chat_id` before processing any message; unknown users receive no data |
| T-QIB-02 | Information Disclosure | Context Resolver | mitigate | Enforce `data_scope` filtering so restricted users only receive pure LLM or knowledge docs without personal task data |
| T-QIB-03 | Denial of Service | Telegram Polling Loop | mitigate | Enforce daily message quota (`daily_limit`), rate limits, and 409 conflict auto-stop |
| T-QIB-04 | Tampering | Bot Token Storage | mitigate | Bot token stored in local Dexie settings and Rust memory only; never synced unencrypted or sent externally |
</threat_model>

<verification>
1. Rust compilation check: `cargo check --manifest-path src-tauri/Cargo.toml`
2. Database and unit tests: `npx vitest run tests/db.test.ts tests/telegram/`
3. Production app build: `npm run build`
</verification>

<success_criteria>
- Rust Telegram module with CancellationToken and 409 Conflict auto-cancellation compiles cleanly.
- IndexedDB Schema V12 stores settings, whitelist, and session logs with full TypeScript typing.
- Headless worker processes inbound Telegram messages, checks whitelist and quota, injects scoped context, and replies.
- TelegramMonitorView UI allows user to toggle bot on/off, configure auto-start, manage whitelist/scopes, and view real-time logs.
- All tests and TypeScript builds pass without errors.
</success_criteria>

<output>
Create `.planning/quick/261019-qib-implement-telegram-ai-gateway-with-on-of/261019-qib-SUMMARY.md` when done
</output>
