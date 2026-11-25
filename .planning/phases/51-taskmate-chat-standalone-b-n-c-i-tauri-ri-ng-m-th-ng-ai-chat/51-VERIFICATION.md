---
phase: 51-taskmate-chat-standalone
verified: 2026-11-26T01:10:00Z
status: gaps_found
score: 15/17 must-haves verified
overrides_applied: 0
must_haves:
  truths:
    - id: T1
      truth: "Bundle Tauri thứ hai có productName 'TaskMate Chat', identifier 'com.personal.taskmate.chat', cửa sổ mở index.html#ai-popout"
      status: VERIFIED
    - id: T2
      truth: "npm run tauri:build:chat dùng -c tauri.conf.chat.json; marker VITE_CHAT_STANDALONE được định nghĩa trong vite.chat.config.ts"
      status: VERIFIED
    - id: T3
      truth: "Cấu hình TaskMate gốc, Cargo.toml, capabilities, script cũ giữ nguyên; không thêm dependency npm"
      status: VERIFIED
    - id: T4
      truth: "#ai-popout bản standalone chỉ render chat ngay lần vẽ đầu và sau reload, không workbench/rail/task view"
      status: VERIFIED
    - id: T5
      truth: "Standalone không listener cửa sổ cha (scope/draft/geometry), không close/pin/popout affordance"
      status: VERIFIED
    - id: T6
      truth: "Tab, scope chip global, composer và lịch sử tin nhắn vẫn hoạt động trong standalone"
      status: VERIFIED
    - id: T7
      truth: "Hành vi #ai-popout của TaskMate không đổi khi marker là false"
      status: VERIFIED
    - id: T8
      truth: "Gear mở drawer phải, side nav đúng 7 nhóm theo thứ tự khóa D-09"
      status: VERIFIED
    - id: T9
      truth: "Nhóm Provider chứa đủ field NineRouter, nhập key lần đầu không cần TaskMate"
      status: VERIFIED
    - id: T10
      truth: "6 nhóm còn lại mount card thật, dùng chung Dexie/keyring, không tự triển khai storage"
      status: VERIFIED
    - id: T11
      truth: "Đổi nhóm chỉ hiện nội dung nhóm đó; chat giữ nguyên mount và state"
      status: VERIFIED
    - id: T12
      truth: "Lượt chat standalone không inject global context, global conventions hay grounding task/CR/system/document"
      status: VERIFIED
    - id: T13
      truth: "Standalone không暴露 task action (checklist/sticky note/Claude code)"
      status: VERIFIED
    - id: T14
      truth: "Knowledge/MCP/Graphiti/Oracle SQLcl/SSH FS vẫn bật đầy đủ trong standalone"
      status: VERIFIED
    - id: T15
      truth: "Grounding và copy của TaskMate không đổi khi isStandaloneChat=false"
      status: VERIFIED
    - id: T16
      truth: "Bundle TaskMate Chat cài đặt, khởi chạy và cùng tồn tại với TaskMate trên một máy macOS"
      status: UNCERTAIN
    - id: T17
      truth: "Bề mặt chat standalone dùng copy trung tính theo UI-SPEC đã duyệt, không quick prompt/empty state đặc thù tác vụ TaskMate"
      status: FAILED
gaps:
  - truth: "Bề mặt chat standalone dùng copy trung tính theo UI-SPEC đã duyệt, không quick prompt/empty state đặc thù tác vụ TaskMate (T17)"
    status: failed
    reason: "DRAWER_QUICK_PROMPTS và emptyState được hardcode task-specific, không có cổng isStandaloneChat. Bản standalone vẫn hiển thị 'Lập kế hoạch hôm nay', 'Báo cáo tiến độ', 'Tác vụ quá hạn' và 'Đặt câu hỏi về tác vụ hiện tại, phân tích tiến độ, gợi ý checklist...'. UI-SPEC 51-UI-SPEC.md:99-100 (status: approved) yêu cầu 'Chưa có hội thoại' / 'Nhập tin nhắn bên dưới...'. Vi phạm D-08 (không ngữ cảnh TaskMate) và locked goal 'không task UI'."
    artifacts:
      - path: "src/components/ai/AIChatDrawer.tsx"
        issue: "Dòng 191-196 định nghĩa DRAWER_QUICK_PROMPTS gồm 3 quick prompt đặc thù tác vụ; dòng 2695 truyền không điều kiện vào AiChatWidget; dòng 2698-2701 hardcode emptyState body/heading 'Trợ lý AI TaskMate'."
      - path: "src/components/ai/AiChatWidget.tsx"
        issue: "Dòng 523-527: click quick prompt gọi onSubmit(prompt.prompt), đẩy nội dung tác vụ TaskMate vào lượt chat standalone; widget không có prop nhận biết standalone."
      - path: ".planning/phases/51-taskmate-chat-standalone-b-n-c-i-tauri-ri-ng-m-th-ng-ai-chat/51-UI-SPEC.md"
        issue: "Dòng 99-100 copy contract bị vi phạm; dòng 124 (D-08) cũng bị bỏ sót trong implementation."
    missing:
      - "Gate quickPrompts và emptyState theo isStandaloneChat trong AIChatDrawer: bản standalone dùng prompt trung tính (ví dụ 'Giải thích mã', 'Tra cứu tài liệu') và copy 'Chưa có hội thoại' / 'Nhập tin nhắn bên dưới để bắt đầu. Enter để gửi, Shift+Enter để xuống dòng.' theo UI-SPEC."
      - "Giữ nguyên DRAWER_QUICK_PROMPTS và emptyState cũ cho legacy TaskMate (isStandaloneChat=false)."
      - "Thêm test phase51 khẳng định standalone không render 3 nhãn task-specific và render đúng copy trung tính; test này hiện không tồn tại (grep tests/phase51 trả về 0 kết quả)."
---

# Phase 51: TaskMate Chat standalone — Báo cáo Verification

**Phase Goal:** Bản cài Tauri riêng "TaskMate Chat" mở thẳng AI chat full-window, không task UI hay ngữ cảnh TaskMate, kèm drawer AI settings side-nav 7 nhóm; chạy độc lập và cùng tồn tại với TaskMate.
**Verified:** 2026-11-26T01:10:00Z
**Status:** gaps_found
**Re-verification:** Không — lần verify đầu tiên (không có VERIFICATION.md trước đó).

## Goal Achievement

ROADMAP phase 51 không có mảng `success_criteria` (`gsd-tools query roadmap.get-phase 51` → `"success_criteria": []`). Must-haves được trình bày từ **Goal + 15 quyết định khóa D-01–D-15** trong `51-CONTEXT.md`, hợp nhất với `must_haves` frontmatter của cả 4 PLAN. UI-SPEC `51-UI-SPEC.md` có `status: approved` (commit `440d1ed3`) nên copy contract là ràng buộc bắt buộc.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| T1 | Bundle identity + URL chat | ✓ VERIFIED | `src-tauri/tauri.conf.chat.json:3-5,16`: productName/identifier/`index.html#ai-popout`, window 1280×800. Bằng chứng thực tế từ coordinator: `CI=true npm run tauri:build:chat` xuất `TaskMate Chat.app` + dmg, `hdiutil verify` VALID, PlistBuddy xác nhận `com.personal.taskmate.chat` / `TaskMate Chat`. |
| T2 | Build script + marker | ✓ VERIFIED | `package.json:24-25` (`tauri:* -c src-tauri/tauri.conf.chat.json`), `package.json:9-10` (`--config vite.chat.config.ts`), `vite.chat.config.ts:8-10` define `VITE_CHAT_STANDALONE='1'`. |
| T3 | TaskMate base byte-identical, không dependency mới | ✓ VERIFIED | `git diff b3523d9c^..HEAD -- src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/capabilities/default.json vite.config.ts index.html src/main.tsx` → rỗng. `package.json` chỉ thêm 4 script chat; block `dependencies`/`devDependencies` không đổi. `git status` sạch với source. |
| T4 | Chat-only từ lần vẽ đầu + reload | ✓ VERIFIED | `src/AppIntelliJ.tsx:32,38,114-126`: marker → prop → nhánh `ai-popout` chỉ bọc `AIPopoutView` (không `WorkbenchLayout`); `showSplash = !isPopout` nên không flash splash. Coordinator browser-verify tại `#ai-popout` xác nhận. Test `standaloneRoute.test.tsx` kiểm tra first paint cả 2 dạng hash. |
| T5 | Không parent coupling / affordance | ✓ VERIFIED | `src/views/AIPopoutView.tsx:50` (`if (standaloneChat) return undefined;` chặn toàn bộ scope/draft/geometry listeners); `src/components/ai/ChatHeader.tsx:40-82` nhánh standalone chỉ gear + scope chip. Test `AIPopoutView.standalone.test.tsx` khẳng định 0 listener, 0 geometry call. |
| T6 | Tab/scope/composer/history | ✓ VERIFIED | `AIPopoutView.tsx:32-46` scope=global khi standalone; `AIChatDrawer.tsx:2573+` render `ChatTabBar`; `AiChatWidget` render composer/history. Test shell khẳng định tab bar + composer hiện. |
| T7 | Legacy #ai-popout không đổi | ✓ VERIFIED | Mọi cổng đều dạng `isStandaloneChat ? ... : ...` hoặc `!isStandaloneChat`; default `false` (`AIChatDrawer.tsx:239`, `AIPopoutView.tsx:26`). `AIPopoutView.legacy.test.tsx` + `groundingSuppression.test.tsx` phần legacy pass. |
| T8 | Drawer 7 nhóm đúng thứ tự | ✓ VERIFIED | `AISettingsDrawer.tsx:26-43` `GROUPS` = Provider, Knowledge Server, MCP, Graphiti, Oracle SQLcl, SSH File System, Tool Catalog; `:106-120` `Drawer placement="right" width={460}`. Test 1 asserts đúng mảng; coordinator browser-verify 7 nhóm render card thật. |
| T9 | Provider fields + first-run key | ✓ VERIFIED | `AISettingsDrawer.tsx:30-35` mount `NineRouterConfigCard` + `GlobalConventionsCard` với `db`; test 3 kiểm tra field label và `KEYRING_SERVICE='task-planner'` / key `ninerouter_api_key`. Provider được bọc trong `KnowledgeConfigProvider` (`AppIntelliJ.tsx:118`). |
| T10 | Card thật, storage dùng chung | ✓ VERIFIED | `AISettingsDrawer.tsx:4-11` import trực tiếp 6 card, `render(db)` truyền cùng `db`. Test 4 kiểm tra mọi card nhận `db.name` giống nhau; không có schema/keyring namespace mới (xem T3). |
| T11 | Đổi nhóm giữ chat state | ✓ VERIFIED | `AISettingsDrawer.tsx:48-55` `activeIndex` + `Collapse activeKey`; `:81 forceRender`. Test 2 (chỉ 1 card hiện), Test 5 & 8 (draft sống qua đóng/mở drawer) pass. |
| T12 | Không TaskMate grounding trong turn | ✓ VERIFIED | `AIChatDrawer.tsx:1548` gate `getGlobalConventions`; `:1889-1895` gate `buildGlobalContextPrompt`; `:1903-1909,1916-1970` gate mention grounding; `globalConvText` khởi tạo rỗi `:1546` và chỉ gán khi `!isStandaloneChat`. Test 1/2/3 assert zero-call + không có `<global_context>` / `TOAN-CUC-QUY-UOC-LEAK` / `<mentioned_entities>`. |
| T13 | Không task action | ✓ VERIFIED | `AIChatDrawer.tsx:2742-2751`: `canAddToChecklist/canSaveStickyNote/canRunClaudeCode` = false và bỏ callback khi standalone. Test 5 kiểm tra 3 nút biến mất, 0 mutation call. |
| T14 | Knowledge/MCP/Graphiti/Oracle/SSH intact | ✓ VERIFIED | Không có cổng `isStandaloneChat` trên các đường `fetchSetCatalog` (`:1558`), `createDefaultGroundedTurnDeps` (`:1559`), `discoverGraphitiSqlMcpTools` (`:1983`), `discoverGatedMcpTools` (`:1995`), `getGraphitiSkillSegment` (`:2002`), `getOracleToolConfig`/`getSshFsToolConfig` (`:2008-2010`) và `getToolsForTurnWithRemote` (`:2016`). Test 4 assert từng call. |
| T15 | Legacy grounding/copy không đổi | ✓ VERIFIED | Xem T7; toàn bộ gate là nhánh additive. 28/28 test phase51 pass, trong đó có legacy non-regression. |
| T16 | Cài đặt/khởi chạy/cùng tồn tại | ? UNCERTAIN | Bằng chứng build và identity VALID (xem T1), nhưng **chưa có bằng chứng cài đặt + khởi chạy thực tế + coexistence trên cùng máy**. `51-04-PLAN.md:163` tự để `<human-check>` cho owner. Chuyển sang mục Human Verification. |
| T17 | Copy trung tính trên bề mặt standalone | ✗ FAILED | Xem Gaps Summary. `AIChatDrawer.tsx:191-196,2695,2698-2701`; vi phạm `51-UI-SPEC.md:99-100` (approved) và D-08. Coordinator browser-verify xác nhận render thực tế. |

**Score:** 15/17 truths verified (1 UNCERTAIN, 1 FAILED).

### Deferred Items

Không có. `gsd-tools query roadmap.analyze` chỉ trả các phase 49/50/51 trong milestone; **không có phase nào sau 51** để tiếp nhận gap. Gap T17 phải xử lý trong phase này, không được defer.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|--------|
| `src-tauri/tauri.conf.chat.json` | Chat bundle identity + URL chat | ✓ VERIFIED | 52 dòng, mọi field của base config được giữ, đổi identity/title/url/build commands. |
| `vite.chat.config.ts` | Marker tĩnh standalone | ✓ VERIFIED | 12 dòng, `mergeConfig` với define marker. |
| `package.json` | Script `tauri:build:chat` / `tauri:dev:chat` | ✓ VERIFIED | 90 dòng, 4 script mới, 0 dependency mới. |
| `src/AppIntelliJ.tsx` | Nhánh route standalone + provider chain | ✓ VERIFIED | 158 dòng, `standaloneChat` prop, wrapper `KnowledgeConfigProvider`. |
| `src/views/AIPopoutView.tsx` | Neutralize parent coupling + mount drawer | ✓ VERIFIED | 234 dòng, early-return ở effect, prop chain đầy đủ. |
| `src/components/ai/AIChatDrawer.tsx` | 4 cổng grounding + task action | ⚠️ PARTIAL | Grounding/task-action gate đúng (T12/T13), nhưng constant copy ở `:191-196` và prop ở `:2695,2698-2701` **không có cổng** → nguyên nhân T17. |
| `src/components/ai/ChatHeader.tsx` | Header standalone chỉ gear | ✓ VERIFIED | 264 dòng, nhánh `isStandalone` tách biệt, không pin/close/more. |
| `src/components/ai/AISettingsDrawer.tsx` | Drawer 7 nhóm card thật | ✓ VERIFIED | 122 dòng, 7 group, side nav + accordion. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `package.json` | `tauri.conf.chat.json` | `-c src-tauri/tauri.conf.chat.json` | ✓ WIRED | `package.json:24-25`. |
| `tauri.conf.chat.json` | `index.html#ai-popout` | `app.windows[0].url` | ✓ WIRED | `:16`. |
| `vite.chat.config.ts` | `AppIntelliJ.tsx` | `import.meta.env.VITE_CHAT_STANDALONE === '1'` | ✓ WIRED | define `:9`, read `AppIntelliJ.tsx:32`. |
| `AppIntelliJ.tsx` | `AIPopoutView.tsx` | prop `standaloneChat` | ✓ WIRED | `:120`. |
| `AIPopoutView.tsx` | `AISettingsDrawer.tsx` | `<AISettingsDrawer ... db={db}>` | ✓ WIRED | `:5,231`. |
| `AIChatDrawer.tsx` | `contextGrounding.ts` / `conventionService.ts` | 4 cổng `!isStandaloneChat` | ✓ WIRED | `:1548,1889,1903,1916`. |
| `AIChatDrawer.tsx` | `AiChatWidget` quickPrompts/emptyState | prop truyền trực tiếp | ✗ NOT_GATED | `:2695,2698-2701` — nguyên nhân T17. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `AIChatDrawer.tsx` → `AiChatWidget` | `quickPrompts` | `DRAWER_QUICK_PROMPTS` hằng tĩnh `:191-196` | Có dữ liệu, nhưng là task copy cố định không đổi theo marker | ✗ STATIC_LEAK — dẫn thẳng TaskMate task copy vào standalone |
| `AIChatDrawer.tsx` → `AiChatWidget` | `emptyState` | object literal `:2698-2701` | Có dữ liệu, heading `'Trợ lý AI TaskMate'` (APP_NAME), body task-specific | ✗ STATIC_LEAK |
| `AIChatDrawer.tsx` → turn assembly | `globalConvText`, `systemInstruction` | DB qua service, đã gate | Không chạy khi standalone | ✓ FLOWING (đúng D-08) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Type-check toàn repo | `npx tsc --noEmit` | exit 0, 0 dòng output | ✓ PASS |
| Test phase 51 | `npx vitest run tests/phase51 --bail=1` | exit 0, 6 files / 28 tests pass | ✓ PASS |
| Build + identity bundle | `CI=true npm run tauri:build:chat` + `hdiutil verify` + PlistBuddy (bằng chứng coordinator) | .app + dmg tạo ra, checksum VALID, đúng identifier/name | ✓ PASS |
| Copy trung tính trên standalone | Browser verify `http://localhost:4178/task-management/index.html#ai-popout` (coordinator) | 3 quick prompt task-specific + empty-state task copy vẫn hiện | ✗ FAIL (T17) |

Lưu ý INFO: `tests/ai/AIChatDrawer.test.tsx` có lỗi pre-existing ngoài phạm vi quanh `discoverAllMcpTools` (theo coordinator). Không chạy full suite (theo quy ước test scope của dự án); không tính vào gap phase 51.

### Probe Execution

| Probe | Command | Result | Status |
|-------|---------|--------|--------|
| — | — | — | SKIPPED — `find scripts -path '*/tests/probe-*.sh'` không trả file nào và không có probe nào được khai báo trong 4 PLAN/SUMMARY của phase 51. |

### Requirements Coverage

Phase 51 dùng D-01–D-15 thay vì REQ ID (`grep P51- .planning/REQUIREMENTS.md` → rỗng).

| Requirement | Source | Description | Status | Evidence |
|-------------|--------|-------------|--------|----------|
| D-01 | 51-01/51-CONTEXT | Bundle riêng, identity mới, coexist | ✓ SATISFIED | T1, T16 (build-only; coexist chờ human) |
| D-02 | 51-01 | Dùng lại dist/#ai-popout | ✓ SATISFIED | T4 |
| D-03 | 51-01 | Config chat + script + window lớn | ✓ SATISFIED | T1/T2 |
| D-04 | 51-01/02 | Chat-only ngay từ lần vẽ đầu, reload vẫn chat-only | ✓ SATISFIED | T4 |
| D-05 | 51-02 | Full-bleed, một gear, không rail/menu | ✓ SATISFIED | T4/T5/T8 |
| D-06 | 51-02/03 | Drawer phải, chat giữ state | ✓ SATISFIED | T8/T11 |
| D-07 | 51-02 | Bỏ close/pin/parent draft | ✓ SATISFIED | T5 |
| D-08 | 51-04 | Global scope, không TaskMate context/grounding | ⚠️ PARTIAL | T12 ✓ grounding sạch, nhưng task-specific quick prompt/empty state vẫn là TaskMate context trên bề mặt → T17 FAILED |
| D-09 | 51-03 | Drawer side nav đúng 7 nhóm | ✓ SATISFIED | T8 |
| D-10 | 51-03 | Provider đủ field, first-run key | ✓ SATISFIED | T9 |
| D-11 | 51-03 | Dùng card có sẵn | ✓ SATISFIED | T10 |
| D-12 | 51-03 | Cùng Dexie/keyring | ✓ SATISFIED | T3/T10 |
| D-13 | 51-02/04 | TaskMate additive, không đổi hành vi | ✓ SATISFIED | T3/T7/T15 |
| D-14 | 51-01 | Capabilities kế thừa cho chat tools | ✓ SATISFIED | `tauri.conf.chat.json` giữ cấu trúc bundle/window đầy đủ; capabilities `windows:["*"]` không đổi (T3) |
| D-15 | 51-01 | Không dependency mới | ✓ SATISFIED | T3 |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/components/ai/AIChatDrawer.tsx` | 191-196, 2695, 2698-2701 | Hardcoded user-visible task copy, không có alternate path cho standalone | 🛑 Blocker | T17: vi phạm approved UI-SPEC copy contract + D-08; đã được xác nhận bằng browser verify. |

Không có marker `TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER` nào trong 7 file nguồn đã sửa ở phase 51. Không có stub `return null`/`return []` ở các artifact mới. Tool Catalog hiển thị catalog công cụ DB của TaskMate — **đánh giá INFO, không phải defect**: D-09/D-11 bắt buộc giữ nhóm Tool Catalog và `chatTurnTools.ts:169-172` ghi rõ catalog "never feeds a dispatch path — it is inventory only".

### Human Verification Required

1. **Cài đặt / khởi chạy / cùng tồn tại (T16, D-01)**
   **Test:** Cài `TaskMate Chat_0.1.1_aarch64.dmg` trên máy macOS đã cài TaskMate, mở cả 2 app.
   **Expected:** Cả hai cùng hiện trong Applications/Finder, bundle ID riêng (`com.personal.taskmate.chat` vs base), TaskMate Chat mở thẳng chat full-window, reload vẫn chat-only, gear mở 7 nhóm, TaskMate cũ chạy bình thường và dùng chung keyring.
   **Why human:** Verification này cần thao tác cài đặt GUI và quan sát lifecycle app thật; build + `hdiutil verify` + PlistBuddy chỉ chứng minh artifact đúng, không chứng minh đã cài/chạy/coexist. `51-04-PLAN.md:163` cũng để item này cho owner.

### Gaps Summary

Một blocker duy nhất, tuy nhiên đủ để chặn phase: **copy đặc thù TaskMate rò rỉ sang bề mặt chat standalone**. `src/components/ai/AIChatDrawer.tsx:191-196` định nghĩa `DRAWER_QUICK_PROMPTS` với `Lập kế hoạch hôm nay`, `Báo cáo tiến độ`, `Tác vụ quá hạn`; `:2695` truyền vào `AiChatWidget` không điều kiện; `:2698-2701` hardcode empty-state `Trợ lý AI TaskMate` và `Đặt câu hỏi về tác vụ hiện tại, phân tích tiến độ, gợi ý checklist...`. `AiChatWidget.tsx:523-527` biến mỗi quick prompt thành `onSubmit(...)`. Trong khi phần *grounding dữ liệu* đã được chặn sạch (T12), phần *copy/affordance* vẫn mời người dùng thực hiện công việc tác vụ TaskMate — trái trực tiếp D-08, locked goal "không task UI", và bảng copywriting đã duyệt tại `51-UI-SPEC.md:99-100` (`Chưa có hội thoại` / `Nhập tin nhắn bên dưới để bắt đầu...`). Browser verify của coordinator xác nhận hiển thị thực tế. Bộ test `tests/phase51` có 0 assertion về copy này nên 28/28 vẫn xanh — đây là điểm mù cần sửa cùng lúc với code.

Cách sửa tối thiểu: thêm 2 hằng standalone trung tính và chọn theo `isStandaloneChat` tại dòng 2695/2698, giữ nguyên giá trị cũ cho legacy. Không cần component hay dependency mới.

---

_Verified: 2026-11-26T01:10:00Z_
_Verifier: Claude (gsd-verifier)_
