---
phase: quick
plan: 261127-fzv
type: execute
wave: 1
depends_on: []
files_modified:
  - src-tauri/src/standalone_access.rs
  - src-tauri/src/lib.rs
  - src/services/telegram/standaloneAccessService.ts
  - src/services/telegram/telegramSettingsService.ts
  - src/components/settings/StandaloneDevicePolicyCard.tsx
  - src/components/ai/AISettingsDrawer.tsx
  - src/components/ai/AIChatDrawer.tsx
  - src/views/AIPopoutView.tsx
  - src/views/TelegramMonitorView.tsx
  - tests/telegram/standaloneAccessService.test.ts
  - tests/telegram/StandaloneDevicePolicyCard.test.tsx
  - tests/telegram/telegramDeviceEnrollment.test.ts
  - tests/phase51/AIPopoutView.standalone.test.tsx
autonomous: true
requirements:
  - STANDALONE_REQUEST_ACCESS
  - LOCAL_CROSS_APP_DELIVERY
  - ADMIN_APPLY_WHITELIST
  - FAIL_CLOSED_STATES
  - NO_NEW_DEPS_NO_TOKEN
must_haves:
  truths:
    - "Standalone chỉ gửi yêu cầu từ AI Settings → Telegram Device: nhập Telegram User ID, bấm Request access; không dán policy, không nhập bot token"
    - "Admin thao tác trong TaskMate #/telegram, dùng pending card và tab AI Chat Devices có sẵn: duyệt, chọn whitelist model + model mặc định, bấm Áp dụng"
    - "Sau Apply, standalone đang mở nhận cấu hình realtime qua bridge file Tauri local (poll 2s), cập nhật model list và gửi chat ngay không copy/paste"
    - "Pending/denied/revoked/expired đều chặn gửi ở standalone; Cài đặt AI vẫn mở được để gửi lại yêu cầu"
    - "Bridge dùng chung crate Tauri hiện có, không server, không knowledge daemon, không bot token trong bundle standalone, không thêm npm dependency"
  artifacts:
    - path: src-tauri/src/standalone_access.rs
      provides: "Lệnh Tauri ghi/đọc record truy cập standalone trong ~/.taskmate/standalone-access/<telegramUserId>.json"
      contains: "standalone_access_list"
    - path: src/services/telegram/standaloneAccessService.ts
      provides: "Request, poll, validate policy token, ghi/xoá policy trong chatWindowDb theo trạng thái từ admin"
      contains: "pollStandaloneAccess"
    - path: src/components/settings/StandaloneDevicePolicyCard.tsx
      provides: "UI Request access + trạng thái fail-closed, thay thế luồng dán /policy"
      contains: "Request access"
    - path: src/views/TelegramMonitorView.tsx
      provides: "Import request vào pending whitelist, Áp dụng/Từ chối/Thu hồi ghi bridge file"
      contains: "Yêu cầu từ Chat standalone"
  key_links:
    - from: src/components/settings/StandaloneDevicePolicyCard.tsx
      to: src/services/telegram/standaloneAccessService.ts
      via: "requestStandaloneAccess(db, telegramUserId) ghi record pending + state local"
    - from: src/services/telegram/standaloneAccessService.ts
      to: src-tauri/src/standalone_access.rs
      via: "invoke standalone_access_request / standalone_access_apply / standalone_access_list"
    - from: src/views/TelegramMonitorView.tsx
      to: src/services/telegram/telegramSettingsService.ts + buildPolicyPayload + standalone_access_apply
      via: "Apply: upsertDeviceEnrollment → policy token → bridge file theo telegramUserId"
    - from: standaloneAccessService.ts
      to: src/views/AIPopoutView.tsx → src/components/ai/AIChatDrawer.tsx
      via: "saveDevicePolicy + accessState key → policyState active/blocked → enforceRequest và visible models"
---

<objective>
Thay luồng dán payload `/policy` bằng luồng xin quyền nội bộ giữa hai app Tauri đã có: standalone yêu cầu bằng Telegram User ID, admin duyệt trong `#/telegram`, cấu hình whitelist model riêng, bấm Áp dụng và standalone nhận cấu hình ngay. Không bot token trong bundle standalone, không knowledge daemon, không npm dependency mới, không đụng PWA/GitHub Pages hay provider client.

Quan sát đã verify: hai app là hai process/build Tauri riêng (`src-tauri/tauri.conf.json` và `src-tauri/tauri.conf.chat.json`) với hai DB IndexedDB riêng (`db` và `chatWindowDb`). Cả hai dùng chung crate Rust (`src-tauri/src/lib.rs`) và đã có `serde_json`, `base64`; `invoke` dùng được từ mọi window theo `src-tauri/capabilities/default.json`. Event Tauri có thể đi qua window cùng app, nhưng không có cách đáng tin để app này emitInto webview của app kia và standalone không được đảm bảo đang mở lúc admin Apply. Vì vậy chọn bridge là file JSON nhỏ trên `HOME`/`USERPROFILE`, ghi atomic, poll 2s ở standalone và 3s ở trang admin: record tồn tại trên disk, standalone mở sau vẫn nhận, không cần discovery cửa sổ. Token policy vẫn dùng `buildPolicyPayload`/`parsePolicyPayload` và zod schema hiện có.

Tham chiếu UI (chỉ để định hướng, không source of truth): `.planning/sketches/ACCESS-REQUEST-DRAFT.md` và `.planning/sketches/013-standalone-access-request/index.html`; không commit các artifact sketch untracked.
</objective>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Bridge file Tauri local + standalone access service</name>
  <files>src-tauri/src/standalone_access.rs, src-tauri/src/lib.rs, src/services/telegram/standaloneAccessService.ts, tests/telegram/standaloneAccessService.test.ts</files>
  <behavior>
    - Record bridge `{ telegramUserId, status: 'pending'|'approved'|'denied'|'revoked', requestedAt?, policyToken?, issuedAt?, updatedAt }` lưu tại `<home>/.taskmate/standalone-access/<telegramUserId>.json`. `telegramUserId` phải khớp `^\d{6,12}$`; mọi giá trị khác bị từ chối trước khi tạo đường dẫn.
    - Lệnh `standalone_access_request { telegramUserId, requestedAt }` ghi status pending, xoá policyToken cũ (fail closed khi xin lại). `standalone_access_apply { telegramUserId, status, policyToken? }` chỉ giữ token khi status approved; denied/revoked ghi marker, không token. `standalone_access_list` trả danh sách record, bỏ qua file hỏng thay vì panic.
    - Ghi file dùng file tạm cùng thư mục + rename atomic; trên Unix đặt mode 0600. Không log hay trả nội dung token ra console.
    - TS service validate input ở trust boundary, bọc `invoke` bằng `isTauriApp()`: browser fallback chỉ giữ state local, không tạo timer/gọi API giả. `requestStandaloneAccess` lưu state `{ status:'pending', telegramUserId, requestedAt }` vào settings key `telegram:accessState` của DB injectable.
    - `pollStandaloneAccess(db, identity, onState)` mỗi 2s: approved + token parse được bằng `parsePolicyPayload` + issuedAt mới hơn bản đã lưu → `saveDevicePolicy` rồi state approved; denied/revoked/pending → `clearDevicePolicy` rồi state tương ứng; record biến mất thì giữ cache policy còn hạn (offline), state expired do expiry tự tính. Token hỏng/expired bị bỏ qua, không ghi policy.
    - `readAccessState`/`clearStandaloneAccess` đọc/xoá state local; "Gỡ liên kết" ghi revoked lên bridge rồi xoá policy local. Trả cleanup function cho mọi interval/listener.
  </behavior>
  <action>
    Viết `tests/telegram/standaloneAccessService.test.ts` trước (đỏ), mock `vi.mock('@tauri-apps/api/core')` theo idiom `tests/telegram/*`, DB test riêng `new TaskPlannerDatabase('StandaloneAccessTestDB')`, fake timer cho poll. Implement `src-tauri/src/standalone_access.rs` với struct serde `#[serde(rename_all = "camelCase")]`, helper `access_dir`, `sanitize_identity`, `write_record_atomic`, `read_all`; unit test Rust dùng thư mục tạm riêng cho sanitize + roundtrip. Đăng ký 3 command trong `invoke_handler` tại `src-tauri/src/lib.rs`; giữ nguyên mọi command khác. Không thêm crate hay package.
  </action>
  <verify>
    <automated>npx vitest run tests/telegram/standaloneAccessService.test.ts --bail=1 && cargo test --manifest-path src-tauri/Cargo.toml standalone_access && npx tsc --noEmit</automated>
  </verify>
  <done>Bridge ghi/đọc record theo ID số, an toàn khi file hỏng; service poll áp dụng/thu hồi policy đúng; scoped test + Rust test + tsc xanh.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Standalone Request access card + fail-closed chat</name>
  <files>src/components/settings/StandaloneDevicePolicyCard.tsx, src/views/AIPopoutView.tsx, src/components/ai/AIChatDrawer.tsx, tests/telegram/StandaloneDevicePolicyCard.test.tsx, tests/phase51/AIPopoutView.standalone.test.tsx</files>
  <behavior>
    - Card giữ `Card size="small" title="Telegram Device"` và ô Telegram User ID. Thay TextArea `/policy` + nút "Áp dụng chính sách" bằng nút **Request access**, disabled khi ID không khớp `^\d{6,12}$`. Không còn validate "ID trong policy không khớp".
    - Trạng thái card: chưa gửi → "Chưa có quyền dùng Chat. Gửi yêu cầu để admin cấp model."; pending → "Đã gửi yêu cầu lúc HH:MM. Giữ app mở để nhận cấu hình." + "Gửi lại"; approved → tags model được phép, model mặc định, hạn policy + "Gỡ liên kết"; denied/revoked/expired → thông báo riêng + "Gửi lại yêu cầu" giữ ID cũ. Drawer Settings luôn mở được.
    - Với `standaloneChat`, `AIPopoutView` đọc cả policy key lẫn `telegram:accessState` bằng `useLiveQuery`. `policyState` chỉ là `active` khi có policy approved còn hạn VÀ accessState approved; mọi trạng thái khác (kể cả chưa có policy) là `blocked`. Không đổi đường dẫn chat docked.
    - `AIPopoutView` khởi động poll bridge với identity lấy từ state/card, cleanup khi unmount; cập nhật policy qua live query tự động khi service ghi DB.
    - `AIChatDrawer`: model list khi active là hợp của `devicePolicy.allowedModels` và model đã cache/fetch, không còn hiện model ngoài whitelist; khi policy mới có `remoteSettings.defaultModel` hợp lệ thì ghi model đó vào tab một lần theo khóa `issuedAt:telegramUserId:tabId`. Giữ nguyên guard `enforceRequest`, `handleSendTurn`, `handleRetry`; đổi thông báo chặn thành tiếng Việt đúng trạng thái "Chưa có quyền dùng Chat. Vào Cài đặt AI → Telegram Device để gửi lại yêu cầu.".
  </behavior>
  <action>
    Viết test card và bổ sung test standalone trước: mock `@tauri-apps/api/core`, giữ mock event/webview/window hiện có; assert nút disabled với ID sai, state pending/blocked, gear vẫn mở Settings khi blocked, model list lọc theo whitelist. Implement ngắn gọn trong 3 file TS, dùng wrapper `../components/ui`, không import AntD trực tiếp, không màu hex mới, không sửa ChatHeader (status nằm trong card + error message khi gửi).
  </action>
  <verify>
    <automated>npx vitest run tests/telegram/StandaloneDevicePolicyCard.test.tsx tests/phase51/AIPopoutView.standalone.test.tsx tests/phase51/AISettingsDrawer.test.tsx --bail=1 && npx tsc --noEmit</automated>
  </verify>
  <done>Standalone xin quyền không cần dán policy; trạng thái pending/denied/revoked/expired chặn gửi nhưng Settings vẫn dùng được; model hiển thị đúng whitelist.</done>
</task>

<task type="auto">
  <name>Task 3: Admin request import, Apply whitelist, final gates</name>
  <files>src/views/TelegramMonitorView.tsx, src/services/telegram/telegramSettingsService.ts, tests/telegram/telegramDeviceEnrollment.test.ts</files>
  <action>
    Trong `telegramSettingsService.ts` thêm `recordStandaloneAccessRequest(request)`: `findWhitelistByIdentity` trước; nếu chưa có thì `upsertWhitelistUser` với `chatId = telegramUserId`, `telegramUserId`, `name: 'Standalone <id>'`, `status:'pending'`, `deviceStatus:'pending'`; nếu có thì không đụng status/quota/chatId hiện có. Helper deny dùng `upsertWhitelistUser({ chatId: identity, status:'blocked', deviceStatus:'revoked' })`; mọi write vẫn trong transaction/service hiện có.
    Trong `TelegramMonitorView.tsx`: giữ tabs hiện tại. Thêm `useEffect` poll `standalone_access_list` mỗi 3s khi `isTauriApp()`, import từng record pending qua helper trên (idempotent), cleanup interval. Trong card "Hàng chờ phê duyệt", thêm nhãn nhỏ "Yêu cầu từ Chat standalone" khi `p.telegramUserId === p.chatId` và có bridge record pending.
    Trong tab "AI Chat Devices": giữ Select tags cho whitelist model; thêm Select "Model mặc định" lấy options từ `cachedModels` + draft models. Đổi nút "Duyệt" thành **Áp dụng**, không disable khi đã approved để admin có thể cập nhật whitelist. Trình tự Apply: `upsertDeviceEnrollment({ telegramUserId, chatId, deviceStatus:'approved', allowedModels, remoteSettings: { defaultModel, maxHistoryTurns: row.maxHistoryTurns } })` → `buildPolicyPayload(rowMới, now + 24h)` → `invoke('standalone_access_apply', { telegramUserId, status:'approved', policyToken })`. "Thu hồi" gọi upsert revoke rồi ghi marker revoked; thêm "Từ chối" cho request pending ghi marker denied rồi block row. Mọi message/error tiếng Việt, không dựng trang admin mới.
    Bổ sung test vào `tests/telegram/telegramDeviceEnrollment.test.ts` cho import pending idempotent, không overwrite quota của row đã có, remoteSettings.defaultModel đi cùng whitelist. Không sửa bot gateway, backup/profile schema, provider client.
    UAT ngắn bằng Tauri (sếp tự confirm): standalone → Settings → Telegram Device → Request access; TaskMate `#/telegram` thấy request; AI Chat Devices chọn 2 model + default → Áp dụng; standalone (đang mở) tự chuyển sang active, model list đúng, gửi được; Thu hồi → standalone chặn gửi, Settings vẫn mở; gửi lại yêu cầu → pending. Kiểm tra `git diff --name-only` chỉ nằm trong files_modified, không commit file `.planning/sketches/`.
  </action>
  <verify>
    <automated>npx vitest run tests/telegram/standaloneAccessService.test.ts tests/telegram/StandaloneDevicePolicyCard.test.tsx tests/telegram/telegramDeviceEnrollment.test.ts tests/telegram/devicePolicy.test.ts tests/phase51/AIPopoutView.standalone.test.tsx tests/phase51/AISettingsDrawer.test.tsx --bail=1 && npx tsc --noEmit && cargo check --manifest-path src-tauri/Cargo.toml</automated>
  </verify>
  <done>Admin thấy request trong UI có sẵn, Apply đẩy whitelist/default model xuống standalone theo Telegram user ID; revoke/deny fail closed; gates scoped xanh, không chạy `npm test`.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Mitigation |
|---|---|
| Standalone → bridge request | ID số validate bằng regex ở TS và Rust trước khi tạo path; không tin text tự do, không gửi bot token. |
| Admin Apply → bridge grant | Chỉ gọi khi row whitelist đã approve + whitelist model không rỗng; token tạo bằng `buildPolicyPayload`, expiry 24h. |
| Bridge → standalone policy | Parse lại bằng `parsePolicyPayload` (zod strict + expiry); file hỏng/token hỏng bị bỏ qua, không nâng quyền. |
| Revoke/deny/expire | Ghi marker hoặc clear policy local; `policyState: 'blocked'` chặn mọi đường gửi, Settings vẫn mở. |
| File local 2 app | Ghi atomic, mode 0600 trên Unix, path cố định theo ID số; không chia sẻ chat session, vẫn hoạt động khi app kia tắt (record nằm trên disk). |

Giới hạn đã biết: bridge và policy là điều khiển local trên cùng máy, không phải chữ ký/mật mã học; user có quyền sửa file/DB thì tự chịu trách nhiệm. Ghi rõ trong comment/service.
</threat_model>

<verification>
1. `npx vitest run tests/telegram/standaloneAccessService.test.ts --bail=1 && cargo test --manifest-path src-tauri/Cargo.toml standalone_access && npx tsc --noEmit`.
2. `npx vitest run tests/telegram/StandaloneDevicePolicyCard.test.tsx tests/phase51/AIPopoutView.standalone.test.tsx tests/phase51/AISettingsDrawer.test.tsx --bail=1 && npx tsc --noEmit`.
3. `npx vitest run tests/telegram/standaloneAccessService.test.ts tests/telegram/StandaloneDevicePolicyCard.test.tsx tests/telegram/telegramDeviceEnrollment.test.ts tests/telegram/devicePolicy.test.ts tests/phase51/AIPopoutView.standalone.test.tsx tests/phase51/AISettingsDrawer.test.tsx --bail=1 && npx tsc --noEmit && cargo check --manifest-path src-tauri/Cargo.toml`.
4. UAT Tauri các bước ở Task 3; review diff; không chạy `npm test` (quy án dự án: >1 tiếng).
</verification>

<success_criteria>
- Request access chỉ nằm trong standalone `AI Settings → Telegram Device`; admin chỉ dùng `#/telegram`, không màn hình/page mới.
- Apply trong tab AI Chat Devices cấu hình whitelist model + default model theo từng Telegram user ID; standalone đang mở nhận realtime qua bridge local, active ngay.
- Pending/denied/revoked/expired fail closed cho gửi chat nhưng Settings luôn mở để xin lại; bot token/knowledge daemon không bao giờ là dependency.
- Scoped Vitest, Rust test/check, tsc, UAT xanh; không npm dependency mới, không commit artifact sketch untracked.
</success_criteria>

<output>
Create `.planning/quick/261127-fzv-implement-standalone-access-request-flow/261127-fzv-SUMMARY.md` when done.
</output>
