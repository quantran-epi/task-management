---
phase: 51-taskmate-chat-standalone
verified: 2026-11-26T10:00:00Z
status: passed
score: 17/17 must-haves verified
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
      status: VERIFIED
    - id: T17
      truth: "Bề mặt chat standalone dùng copy trung tính theo UI-SPEC đã duyệt, không quick prompt/empty state đặc thù tác vụ TaskMate"
      status: VERIFIED
gaps: []
---

# Phase 51: TaskMate Chat standalone — Báo cáo Verification

**Phase Goal:** Bản cài Tauri riêng "TaskMate Chat" mở thẳng AI chat full-window, không task UI hay ngữ cảnh TaskMate, kèm drawer AI settings side-nav 7 nhóm; chạy độc lập và cùng tồn tại với TaskMate.
**Verified:** 2026-11-26T10:00:00Z
**Status:** passed
**Re-verification:** Có — xem `## Final Re-verification (2026-11-26)`. T17 và T16 đã đóng; 17/17 must-haves VERIFIED, `gaps: []`. Lần verify đầu giữ lại phía dưới để truy vết.

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
| T16 | Cài đặt/khởi chạy/cùng tồn tại | ✓ VERIFIED (re-verify) | Đã human UAT: mount DMG, copy vào `/Applications/TaskMate Chat.app`, detach thành công; PlistBuddy xác nhận 2 bundle ID riêng; `open -a` cả hai cho PID 42114 (Chat) và PID 42681 (TaskMate) chạy cùng lúc; AppleScript trả đúng tên `TaskMate` / `TaskMate Chat`. Chi tiết ở Final Re-verification. |
| T17 | Copy trung tính trên bề mặt standalone | ✓ VERIFIED (re-verify) | Đã fix qua quick task `261126-1kz`: mã nguồn có `STANDALONE_QUICK_PROMPTS` / `STANDALONE_EMPTY_STATE`; `tests/phase51/standaloneCopy.test.tsx` khẳng định standalone không render quick prompt TaskMate và render copy UI-SPEC. Chi tiết ở Final Re-verification. |

**Score ban đầu:** 15/17 truths verified (1 UNCERTAIN, 1 FAILED). **Score cuối:** 17/17 truths verified — xem Final Re-verification.

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
| `AIChatDrawer.tsx` | `AiChatWidget` quickPrompts/emptyState | prop truyền trực tiếp | ✓ WIRED (re-verify) | Ban đầu ✗ NOT_GATED tại `:2695,2698-2701`; sau quick task `261126-1kz` đã chọn theo `isStandaloneChat` qua `STANDALONE_QUICK_PROMPTS` / `STANDALONE_EMPTY_STATE`, legacy giữ nguyên. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `AIChatDrawer.tsx` → `AiChatWidget` | `quickPrompts` | `DRAWER_QUICK_PROMPTS` hằng tĩnh `:191-196` (ban đầu) | Có dữ liệu, ban đầu là task copy cố định không đổi theo marker | ✓ FLOWING (re-verify) — sau fix chọn `STANDALONE_QUICK_PROMPTS` khi standalone, legacy giữ cũ |
| `AIChatDrawer.tsx` → `AiChatWidget` | `emptyState` | object literal `:2698-2701` (ban đầu) | Có dữ liệu, ban đầu heading `'Trợ lý AI TaskMate'` (APP_NAME), body task-specific | ✓ FLOWING (re-verify) — sau fix dùng `STANDALONE_EMPTY_STATE` trung tính, legacy giữ cũ |
| `AIChatDrawer.tsx` → turn assembly | `globalConvText`, `systemInstruction` | DB qua service, đã gate | Không chạy khi standalone | ✓ FLOWING (đúng D-08) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Type-check toàn repo | `npx tsc --noEmit` | exit 0, 0 dòng output | ✓ PASS |
| Test phase 51 | `npx vitest run tests/phase51 --bail=1` | exit 0, 6 files / 28 tests pass | ✓ PASS |
| Build + identity bundle | `CI=true npm run tauri:build:chat` + `hdiutil verify` + PlistBuddy (bằng chứng coordinator) | .app + dmg tạo ra, checksum VALID, đúng identifier/name | ✓ PASS |
| Copy trung tính trên standalone | Browser verify `http://localhost:4178/task-management/index.html#ai-popout` (coordinator, verify đầu) | 3 quick prompt task-specific + empty-state task copy vẫn hiện | ✗ FAIL (T17) — đã đóng ở re-verify; xem Final Re-verification |
| Gate final toàn phase | `npx vitest run tests/phase51 tests/ai/chatTurnTools.test.ts --bail=1` | exit 0, 11 files / 64 tests pass | ✓ PASS (re-verify) |
| Type-check cuối | `npx tsc --noEmit` | exit 0 | ✓ PASS (re-verify) |
| Build cuối | `npm run tauri:build:chat`; `hdiutil verify` | exit 0, `.app` + `.dmg`, VALID | ✓ PASS (re-verify) |

Lưu ý INFO: `tests/ai/AIChatDrawer.test.tsx` có lỗi pre-existing ngoài phạm vi quanh `discoverAllMcpTools` (theo coordinator). Không chạy full suite (theo quy ước test scope của dự án); không tính vào gap phase 51.

### Probe Execution

| Probe | Command | Result | Status |
|-------|---------|--------|--------|
| — | — | — | SKIPPED — `find scripts -path '*/tests/probe-*.sh'` không trả file nào và không có probe nào được khai báo trong 4 PLAN/SUMMARY của phase 51. |

### Requirements Coverage

Phase 51 dùng D-01–D-15 thay vì REQ ID (`grep P51- .planning/REQUIREMENTS.md` → rỗng).

| Requirement | Source | Description | Status | Evidence |
|-------------|--------|-------------|--------|----------|
| D-01 | 51-01/51-CONTEXT | Bundle riêng, identity mới, coexist | ✓ SATISFIED | T1, T16 (đã human UAT — xem Final Re-verification) |
| D-02 | 51-01 | Dùng lại dist/#ai-popout | ✓ SATISFIED | T4 |
| D-03 | 51-01 | Config chat + script + window lớn | ✓ SATISFIED | T1/T2 |
| D-04 | 51-01/02 | Chat-only ngay từ lần vẽ đầu, reload vẫn chat-only | ✓ SATISFIED | T4 |
| D-05 | 51-02 | Full-bleed, một gear, không rail/menu | ✓ SATISFIED | T4/T5/T8 |
| D-06 | 51-02/03 | Drawer phải, chat giữ state | ✓ SATISFIED | T8/T11 |
| D-07 | 51-02 | Bỏ close/pin/parent draft | ✓ SATISFIED | T5 |
| D-08 | 51-04 | Global scope, không TaskMate context/grounding | ✓ SATISFIED (re-verify) | T12 ✓ grounding sạch; T17 ✓ copy trung tính sau fix `261126-1kz` |
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
| `src/components/ai/AIChatDrawer.tsx` | 191-196, 2695, 2698-2701 | Hardcoded user-visible task copy, không có alternate path cho standalone | 🛑 Blocker (verify đầu) → ✓ FIXED (re-verify) | T17: vi phạm approved UI-SPEC copy contract + D-08; đã fix qua `261126-1kz` với `STANDALONE_QUICK_PROMPTS` / `STANDALONE_EMPTY_STATE`. |

Không có marker `TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER` nào trong 7 file nguồn đã sửa ở phase 51. Không có stub `return null`/`return []` ở các artifact mới. Tool Catalog hiển thị catalog công cụ DB của TaskMate — **đánh giá INFO, không phải defect**: D-09/D-11 bắt buộc giữ nhóm Tool Catalog và `chatTurnTools.ts:169-172` ghi rõ catalog "never feeds a dispatch path — it is inventory only".

### Human Verification — ĐÃ HOÀN THÀNH (T16, D-01)

1. **Cài đặt / khởi chạy / cùng tồn tại (T16, D-01)** — ✓ VERIFIED qua human UAT, chi tiết ở Final Re-verification.
   **Test đã chạy:** mount DMG, copy app vào `/Applications/TaskMate Chat.app`, `hdiutil detach` thành công; PlistBuddy; `open -a` cả hai app; AppleScript kiểm tra tên app; dọn process sau UAT.
   **Kết quả:** 2 bundle ID riêng (`/Applications/TaskMate.app` = `com.personal.taskplanner`; `/Applications/TaskMate Chat.app` = `com.personal.taskmate.chat`), 2 process cùng chạy, tên app trả đúng `TaskMate` / `TaskMate Chat`.
   **Ghi chú:** System Events AppleEvent timeout (-1712) là hạn chế automation, không ảnh hưởng bằng chứng cài đặt/identity/coexist.

### Gaps Summary — ĐÃ ĐÓNG TOÀN BỘ

Ban đầu có một blocker: **copy đặc thù TaskMate rò rỉ sang bề mặt chat standalone** (T17) tại `src/components/ai/AIChatDrawer.tsx:191-196,2695,2698-2701`, vi phạm `51-UI-SPEC.md:99-100` và D-08, cùng điểm mù test (0 assertion copy). **Đã fix và đóng** qua quick task `261126-1kz` (`STANDALONE_QUICK_PROMPTS`, `STANDALONE_EMPTY_STATE`, `tests/phase51/standaloneCopy.test.tsx`). T16 cũng đã đóng qua human UAT. Ratify bổ sung CR-01/WR-03 (`261126-1od`) và WR-02/04/05/06 (`261126-1q1`). `status: passed`, điểm 17/17, `gaps: []` — không còn blocker hay gap mở.

---

## Final Re-verification (2026-11-26)

Tổng hợp bằng chứng sau các quick task fix và human UAT. Các bảng/đoạn ở trên được giữ nguyên làm lịch sử verify đầu; mục này ghi trạng thái cuối.

### 1. T17 — Copy trung tính (đã fix)

- Quick task `261126-1kz`: `17f62fdc` RED → `ecf24db4` GREEN → `90d73452` docs.
- Mã nguồn hiện tại có `STANDALONE_QUICK_PROMPTS` và `STANDALONE_EMPTY_STATE`; lựa chọn theo `isStandaloneChat`, legacy (`isStandaloneChat=false`) giữ nguyên copy cũ.
- `tests/phase51/standaloneCopy.test.tsx` khẳng định standalone không render quick prompt TaskMate (`Lập kế hoạch hôm nay`, `Báo cáo tiến độ`, `Tác vụ quá hạn`) và render đúng copy UI-SPEC.
- Tại thời điểm fix: scoped phase51 7 files / 30 tests pass; `npx tsc --noEmit` exit 0.

### 2. CR-01 tool scope leak + WR-03 system prompt (đã fix)

- Quick task `261126-1od`, commits `b6d9af2a`, `f12361e0`, `5ef274be`, `0ed5efa7`, `bb60fca8`.
- `tests/ai/chatTurnTools.test.ts`: 22/22 pass; phase51 scoped 32/32 pass lúc đó; `npx tsc --noEmit` exit 0.

### 3. WR-02/04/05/06 (đã fix)

- Quick task `261126-1q1`, commits `3d34abcc`, `9a50bfd7`, `5f6c79a8`, `9adabcf0`, `56a77f57`, `468df1a7`, `63545583`, harness fix `98bb7424`.
- Phase51 scoped 42/42 pass lúc đó.
- Gate cuối: `npx vitest run tests/phase51 tests/ai/chatTurnTools.test.ts --bail=1` → exit 0, **11 files / 64 tests pass**.
- `npx tsc --noEmit` → exit 0.

### 4. T16 — Human UAT cài đặt / identity / coexist (đã chạy)

- Mount DMG, copy app vào `/Applications/TaskMate Chat.app`, `hdiutil detach` success.
- PlistBuddy: `/Applications/TaskMate.app` = `com.personal.taskplanner`; `/Applications/TaskMate Chat.app` = `com.personal.taskmate.chat`.
- `open -a` cả hai app → cùng lúc có 2 process: PID 42114 (`/Applications/TaskMate Chat.app/...`) và PID 42681 (`/Applications/TaskMate.app/...`).
- AppleScript `tell application "..."` trả đúng tên `TaskMate` và `TaskMate Chat`.
- Sau UAT đã quit/kill sạch process.
- System Events AppleEvent timeout (-1712) là hạn chế automation; không ảnh hưởng bằng chứng cài đặt/identity/process coexist.

### 5. Build cuối

- `npm run tauri:build:chat` exit 0, tạo `.app` + `.dmg`; `hdiutil verify` → VALID.

### Kết luận

| Item | Trạng thái cuối | Bằng chứng |
|------|-----------------|------------|
| T16 | ✓ VERIFIED | Human UAT: cài đặt, 2 bundle ID, 2 process cùng chạy, tên app đúng |
| T17 | ✓ VERIFIED | `STANDALONE_QUICK_PROMPTS` / `STANDALONE_EMPTY_STATE` + `standaloneCopy.test.tsx` |
| CR-01 / WR-03 | ✓ FIXED | `261126-1od`, chatTurnTools 22/22 |
| WR-02/04/05/06 | ✓ FIXED | `261126-1q1`, gate cuối 64/64 |
| Gate cuối | ✓ PASS | 11 files / 64 tests, `tsc --noEmit` exit 0 |
| Build/DMG | ✓ PASS | `tauri:build:chat` exit 0, `hdiutil verify` VALID |

**Status: passed — 17/17 must-haves VERIFIED, `gaps: []`.**

---

_Verified ban đầu: 2026-11-26T01:10:00Z_
_Final re-verification: 2026-11-26T10:00:00Z_
_Verifier: Claude (gsd-verifier)_
