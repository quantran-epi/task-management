---
phase: quick
plan: 261126-diw
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/ai/AISettingsDrawer.tsx
  - src/components/ai/ChatHeader.tsx
  - src/components/ai/AIChatDrawer.tsx
  - src/components/ai/ChatTabToolbox.tsx
  - src/components/ai/AiChatWidget.tsx
  - src/views/AIPopoutView.tsx
  - src/workbench/toolwindows/RightToolWindow.tsx
  - tests/ai/ChatInputBar.test.tsx
  - tests/ai/AIChatDrawerToolbox.test.tsx
  - tests/ai/AIChatDrawer.test.tsx
  - tests/ai/AiChatWidget.test.tsx
  - tests/phase51/AISettingsDrawer.test.tsx
  - tests/phase51/AIPopoutView.standalone.test.tsx
  - tests/phase51/AIPopoutView.legacy.test.tsx
  - tests/phase51/standaloneConnectionStatus.test.tsx
  - tests/ai/AISettingsModal.integration.test.tsx
  - e2e/aiChatSettings.spec.ts
autonomous: true
requirements:
  - AI-CHAT-SETTINGS-FULLWIDTH-MODAL
  - AI-CHAT-SETTINGS-IN-APP
  - AI-CHAT-NO-AUTOAPPROVE-UI
  - AI-CHAT-FULLSCREEN-COMPOSER
  - AI-CHAT-CONFIG-LOADED
  - REVIEW-CLEAN
user_setup: []
must_haves:
  truths:
    - "AI settings mở trong full-width Ant Design Modal (drawer biến mất), dùng chung một component cho popout và chat trong workbench chính"
    - "Chat trong workbench chính có nút Mở Cài đặt AI, bấm ra modal settings đọc cấu hình từ db.settings đang dùng"
    - "Không còn affordance tự duyệt trong UI chat (toolbox button, compact dropdown, props/handler thừa); turn chat không tự ghi DB"
    - "Composer có affordance mở Modal soạn thảo gần toàn màn hình với textarea cao, gửi/apply vẫn dùng chung draft và không mutate dữ liệu TaskMate"
    - "Modal settings và composer modal render đúng token sáng/tối TaskMate; kiểm tra trong Chromium thật, light + dark, không lỗi console"
    - "Targeted Vitest + tsc + e2e Chromium xanh; review critical/warning trên diff đã sửa sạch; không chạy full suite"
  artifacts:
    - path: src/components/ai/AISettingsDrawer.tsx
      provides: "Wrapper Modal full-width, giữ export AISettingsDrawer / AISettingsDrawerBody để tương thích host và test"
      contains: "AI Settings · tất cả"
    - path: src/workbench/toolwindows/RightToolWindow.tsx
      provides: "Settings state và một AISettingsDrawer duy nhất cho chat trong workbench chính"
      contains: "chat-settings-gear"
    - path: src/components/ai/ChatHeader.tsx
      provides: "isStandalone tách khỏi onOpenSettings; gear xuất hiện ở header chat thường khi có onOpenSettings"
      contains: "Mở Cài đặt AI"
    - path: src/components/ai/ChatTabToolbox.tsx
      provides: "Toolbox chỉ còn điều khiển phân tích/MCP/clear, không còn toggle tự duyệt"
      contains: "chat-tab-toolbox"
    - path: src/components/ai/AIChatDrawer.tsx
      provides: "Không đọc config tự duyệt, truyền autoApprove: false cho runtime, vẫn mở settings từ repair/popout"
      contains: "autoApprove: false"
    - path: src/components/ai/ChatInputBar.tsx
      provides: "Modal soạn thảo gần full-width với textarea cao, giữ handleSendFromFullscreen và handleApplyFullscreen"
      contains: "Soạn thảo tin nhắn mở rộng"
    - path: tests/ai/AISettingsModal.integration.test.tsx
      provides: "Test card thật đọc giá trị từ db.settings thay vì card bị mock"
      contains: "ninerouter_endpoint"
    - path: e2e/aiChatSettings.spec.ts
      provides: "Chromium smoke cho settings modal + composer modal ở light/dark và lưu cấu hình persistence"
      contains: "Chuyển đổi giao diện sáng/tối"
  key_links:
    - from: src/workbench/toolwindows/RightToolWindow.tsx (onOpenSettings)
      to: src/components/ai/AIChatDrawer.tsx -> src/components/ai/ChatHeader.tsx (gear)
      via: "prop onOpenSettings; ChatHeader.isStandalone do AIChatDrawer truyền thẳng, không còn suy từ onOpenSettings"
    - from: src/components/ai/AIChatDrawer.tsx (onAuthRepair/onConfigRepair, McpSettingsModal)
      to: src/components/ai/AISettingsDrawer.tsx (Modal)
      via: "cùng callback onOpenSettings; một instance settings được mount ở RightToolWindow hoặc AIPopoutView"
    - from: src/components/ai/ChatInputBar.tsx (fullscreen Modal)
      to: src/components/ai/AiChatWidget.tsx -> src/components/ai/AIChatDrawer.tsx (draft + onSubmit)
      via: "fullscreenDraft chỉ là scratchpad; Gửi ngay gọi onSubmit, Xong gọi onValueChange, cả hai giữ cùng draft của tab"
    - from: src/components/ai/ChatTabToolbox.tsx (đã bỏ auto-approve)
      to: src/components/ai/runtime/chatTurnRuntime.ts (autoApprove)
      via: "AIChatDrawer truyền false cố định; stored config.autoApproveMutations chỉ giữ để tương thích dữ liệu cũ"
---

<objective>
Sửa cửa sổ AI chat: settings thành Modal full-width có thể mở ngay trong workbench chính, bỏ hoàn toàn affordance tự duyệt khỏi chat UI, và bảo đảm Modal soạn thảo toàn màn hình hoạt động gọn với draft có sẵn. Kèm rà soát chất lượng: targeted test, tsc, Chromium thật ở light/dark, review diff sạch critical/warning.

Purpose: sếp mở app không thấy cài đặt AI vì gear chỉ tồn tại ở popout standalone; drawer 460px làm form bị dính; tự duyệt là con đường ghi DB không có xác nhận. Chat là Q&A, mọi thay đổi dữ liệu vẫn phải qua thẻ xác nhận.

Output: một AISettings Modal dùng chung, gear trong chat workbench chính, toolbox không còn tự duyệt, composer fullscreen đã có sẵn được kiểm chứng, regression tests + e2e Chromium, diff review sạch. Không đổi schema, không thêm dependency, không đụng PWA/GitHub Pages, không chạy full suite.

Quan sát lúc lập plan:
- `ChatInputBar.tsx` đã có sẵn fullscreen Modal (nút `Mở rộng soạn thảo`, textarea `Soạn thảo tin nhắn mở rộng`, `Gửi ngay`, `Xong`) và 2 test trong `tests/ai/ChatInputBar.test.tsx`; task này chỉ chuẩn hóa độ rộng/chiều cao và verify trong browser.
- `AISettingsDrawer.tsx` là Drawer 460px, mount duy nhất ở `src/views/AIPopoutView.tsx`; `ChatHeader` dùng `Boolean(onOpenSettings)` để nhận diện standalone nên không thể truyền callback ở workbench chính mà không tách prop.
- `RightToolWindow.tsx` mount `AIChatDrawer` không có `onOpenSettings`; `AIChatDrawer` đã có sẵn `onAuthRepair`/`onConfigRepair` gọi callback này.
- `ChatTabToolbox.tsx` có tự duyệt ở compact dropdown (`key: 'auto-approve'`) lẫn nút `data-testid="tab-auto-approve-btn"`; `AIChatDrawer.tsx` đọc `activeTab.config.autoApproveMutations`, có handler toggle và truyền `autoApprove: turnAutoApprove` vào `runtime.start`.
- Feature AI Office/TeamWorkspace (`src/components/ai/office/*`) có cơ chế tự duyệt riêng — nằm ngoài scope, không đụng vào.
- `e2e/aiChat.spec.ts` là harness `page.setContent` giả; e2e mới phải `page.goto('/task-management/')` như `e2e/adoption.spec.ts`. Chromium có sẵn qua `channel: 'chrome'`.
- `npm test` >1 tiếng theo memory dự án — chỉ chạy file targeted. CSS lấy `useAntdToken()` / CSS var có sẵn, không thêm màu hardcode.
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Settings full-width Modal + mở được từ chat workbench chính</name>
  <files>src/components/ai/AISettingsDrawer.tsx, src/components/ai/ChatHeader.tsx, src/components/ai/AIChatDrawer.tsx, src/views/AIPopoutView.tsx, src/workbench/toolwindows/RightToolWindow.tsx, tests/phase51/AISettingsDrawer.test.tsx, tests/phase51/AIPopoutView.standalone.test.tsx, tests/phase51/AIPopoutView.legacy.test.tsx, tests/phase51/standaloneConnectionStatus.test.tsx</files>
  <behavior>
    - `AISettingsDrawer` render AntD `Modal` có title `AI Settings · tất cả`, width `calc(100vw - 48px)`, maxWidth ~1200, body đủ cao để rail trái 190px và form không bị ép; `AISettingsDrawerBody` và thứ tự 7 group giữ nguyên.
    - Gear `Mở Cài đặt AI` / `data-testid="chat-settings-gear"` xuất hiện trong header chat workbench chính khi `onOpenSettings` được truyền; header standalone vẫn giữ nguyên chip Global và connection status.
    - Popout standalone dùng cùng component Modal; draft trong composer không mất khi mở/đóng settings; đóng bằng close button, Esc, mask đều trả focus về gear.
    - Legacy popout không truyền `onOpenSettings` thì vẫn không có gear.
  </behavior>
  <action>
    Viết/sửa test trước (đỏ), rồi sửa production theo thứ tự atomic commit: (1) wrapper Modal + test phase51, (2) wiring workbench + test header/popout.

    Trong `src/components/ai/AISettingsDrawer.tsx`: đổi import `Drawer` -> `Modal` từ `../ui`. Giữ nguyên tên export `AISettingsDrawer`, `AISettingsDrawerProps`, `AISettingsDrawerBody`, `GROUPS` và nội dung body. Dùng `open`, `onCancel={onClose}`, `title="AI Settings · tất cả"`, `width="calc(100vw - 48px)"`, `style={{ top: 24, maxWidth: 1200 }}`, `styles={{ body: { padding: 0, height: 'min(72vh, 760px)' } }}`, `mask`, `closable`, `closeIcon={<span aria-label="Đóng Cài đặt AI">✕</span>}`. Thay `afterOpenChange` bằng `afterClose` để focus lại `triggerRef`; giữ logic capture `document.activeElement` lúc render như cũ. Không đổi `AISettingsDrawerBody`.

    Trong `src/components/ai/ChatHeader.tsx`: thêm prop optional `isStandalone?: boolean` vào `ChatHeaderProps`; đổi `const isStandalone = Boolean(onOpenSettings)` thành `const isStandalone = isStandaloneProp ?? Boolean(onOpenSettings)` (đặt tên biến nhận prop rõ ràng). Nhánh standalone giữ nguyên. Nhánh header thường: khi `onOpenSettings` tồn tại, thêm `IconButton` trước nút Đóng với `icon={<SettingOutlined />}`, `aria-label="Mở Cài đặt AI"`, `data-testid="chat-settings-gear"`, `onClick={onOpenSettings}`, style `minWidth/minHeight: 28` theo các nút khác — màu kế thừa token, không hardcode.

    Trong `src/components/ai/AIChatDrawer.tsx`: truyền `isStandalone={isStandaloneChat}` cho `ChatHeader` (dòng gần `onOpenSettings={isStandaloneChat ? onOpenSettings : undefined}`). Giữ nguyên mọi chỗ gọi `onOpenSettings` khác (repair, McpSettingsModal). Không đổi prop `onOpenSettings` theo hướng thu hẹp.

    Trong `src/workbench/toolwindows/RightToolWindow.tsx`: import `useState` từ React và `AISettingsDrawer`; thêm state `settingsOpen`; truyền `onOpenSettings={() => setSettingsOpen(true)}` cho `AIChatDrawer` trong nhánh `ai_chat`; mount một `<AISettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} {...(db ? { db } : {})} />` cạnh drawer chat trong cùng nhánh. Không mount component settings ở `src/AppIntelliJ.tsx` — tránh duplicate với `AIPopoutView`.

    Trong `src/views/AIPopoutView.tsx`: chỉ đổi nếu cần truyền thêm `isStandalone` rõ ràng cho `AIChatDrawer`; giữ nguyên một instance `<AISettingsDrawer ... />` hiện có.

    Cập nhật test: `tests/phase51/AISettingsDrawer.test.tsx` đổi assertion `.ant-drawer-right`, `.ant-drawer-mask`, `.ant-drawer-open` sang `.ant-modal-content` / `.ant-modal-wrap`, giữ title, nav, focus restore, draft preservation, và source assertion `source.match(/<AISettingsDrawer\b/g)).toHaveLength(1)` + không còn `<Drawer` trong `AIPopoutView.tsx`. `tests/phase51/AIPopoutView.standalone.test.tsx` đổi `expect(document.querySelector('.ant-drawer-right')).not.toBeNull()` thành assert modal content và width/style gần full. `tests/phase51/AIPopoutView.legacy.test.tsx` giữ assert không có gear. `tests/phase51/standaloneConnectionStatus.test.tsx` giữ accessible name gear.
  </action>
  <verify>
    <automated>npx vitest run tests/phase51/AISettingsDrawer.test.tsx tests/phase51/AIPopoutView.standalone.test.tsx tests/phase51/AIPopoutView.legacy.test.tsx tests/phase51/standaloneConnectionStatus.test.tsx --bail=1 && npx tsc --noEmit</automated>
  </verify>
  <done>Settings là Modal full-width, gear hiện trong chat workbench chính và popout dùng chung component; draft/focus/mock card assertions cũ vẫn xanh; targeted tests + tsc clean.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Bỏ tự duyệt khỏi chat UI + chuẩn hóa composer fullscreen</name>
  <files>src/components/ai/ChatTabToolbox.tsx, src/components/ai/AiChatWidget.tsx, src/components/ai/AIChatDrawer.tsx, src/components/ai/ChatInputBar.tsx, tests/ai/AIChatDrawerToolbox.test.tsx, tests/ai/AIChatDrawer.test.tsx, tests/ai/AiChatWidget.test.tsx, tests/ai/ChatInputBar.test.tsx</files>
  <behavior>
    - Không còn nút `tab-auto-approve-btn`, mục menu `auto-approve`, text `Tự duyệt`, icon `Thunderbolt*`, prop `autoApproveMutations` hay `onToggleAutoApproveMutations` trong `ChatTabToolbox` / `AiChatWidget` / `AIChatDrawer`.
    - Khi stored tab config vẫn mang `autoApproveMutations: true` từ dữ liệu cũ, turn chat vẫn truyền `autoApprove: false` tới runtime; mutation đi qua thẻ xác nhận như thường.
    - Composer fullscreen: nút `Mở rộng soạn thảo` mở title `Soạn thảo tin nhắn AI toàn màn hình`, textarea `Soạn thảo tin nhắn mở rộng` có `rows` ≥ 15; `Gửi ngay` emit đúng chữ đã sửa, `Xong` copy về composer; Cmd/Ctrl+Enter vẫn gửi.
  </behavior>
  <action>
    Viết/sửa test trước (đỏ), rồi production. Giữ DB schema và field `autoApproveMutations` trong stored config nguyên vẹn để tương thích dữ liệu cũ — chỉ bỏ UI, handler và đường truyền vào runtime. Không đụng `src/components/ai/office/*`, `src/components/ai/runtime/chatTurnRuntime.ts`, `src/services/ai/office/teamRunCoordinator.ts`.

    Trong `tests/ai/AIChatDrawerToolbox.test.tsx`: bỏ assert nút tự duyệt ở ca `renders ChatTabToolbox with tab-isolated controls`; đổi ca toggle thành `assertTabFlagsAreIsolatedAfterMcpToggle` — vẫn seed 2 tab với config `autoApproveMutations: true` ở tab 2 để chứng minh stored flag không bị đụng, nhưng không click nút tự duyệt nữa; giữ nguyên phần toggle MCP atomic và kiểm tra tab 2 không đổi. Thêm assert `queryByTestId('tab-auto-approve-btn')` và `queryByText(/Tự duyệt/)` đều vắng mặt.

    Trong `tests/ai/AIChatDrawer.test.tsx`: thay ca `bypasses confirmation prompt and automatically executes mutation when auto-approve is enabled` bằng ca ghi rõ stored flag cũ không được phép bypass: seed `autoApproveMutations: true` trong tab config, mock stream emit `create_task`, assert toolbox không có nút tự duyệt, assert approval card vẫn xuất hiện và DB chưa có task trước khi bấm xác nhận. Giữ nguyên các ca khác.

    Trong `tests/ai/AiChatWidget.test.tsx`: bỏ 2 field auto-approve khỏi `makeToolbox` và mọi override liên quan; nếu test nào assert prop đó thì đổi sang assert toolbox không render nút tự duyệt.

    Trong `tests/ai/ChatInputBar.test.tsx`: giữ 2 ca fullscreen hiện có, bổ sung assert textarea modal có `rows` ≥ 15 và modal title/role dialog; không đổi handler test.

    Trong `src/components/ai/ChatTabToolbox.tsx`: xóa prop `autoApproveMutations`, `onToggleAutoApproveMutations`, 2 import `ThunderboltFilled`/`ThunderboltOutlined`, mục `key: 'auto-approve'` trong compact menu, và khối nút `Auto Approve Toggle` ở nhánh thường. Cập nhật comment nhắc "Tab Toggles" cho đúng các toggle còn lại.

    Trong `src/components/ai/AiChatWidget.tsx`: xóa 2 field auto-approve khỏi `AiChatToolboxProps` và chỗ forward sang `ChatTabToolbox`.

    Trong `src/components/ai/AIChatDrawer.tsx`: xóa `const autoApproveMutations = ...`, `handleToggleAutoApproveMutations` và 2 dòng truyền vào toolbox. Tại `runtime.start` thay `autoApprove: turnAutoApprove` bằng `autoApprove: false`; xóa biến `turnAutoApprove` và comment cũ về global fallback. Trong system prompt ANALYSIS MODE, đổi câu "unless auto-approve is on, it is shown to the user for approval" thành "it is always shown to the user for approval before it is applied" — không nói về toggle đã gỡ. Giữ `onAuthRepair/onConfigRepair` và `isStandalone` từ Task 1.

    Trong `src/components/ai/ChatInputBar.tsx`: giữ handler và cấu trúc Modal hiện có; chỉ đổi `width="80vw"` thành `width="calc(100vw - 48px)"` với `style={{ top: 32, maxWidth: 1200 }}` giữ nguyên, và bảo đảm `rows`/`autoSize` cho textarea modal cho chiều cao lớn (tối thiểu 15 rows). Mọi màu/chữ viết bằng token hoặc `useAntdToken()`, không thêm hex hardcode mới.
  </action>
  <verify>
    <automated>npx vitest run tests/ai/AIChatDrawerToolbox.test.tsx tests/ai/AIChatDrawer.test.tsx tests/ai/AiChatWidget.test.tsx tests/ai/ChatInputBar.test.tsx --bail=1 && npx tsc --noEmit && grep -v '^#' src/components/ai/ChatTabToolbox.tsx | grep -c 'autoApproveMutations\|Tự duyệt' | grep '^0$'</automated>
  </verify>
  <done>Toolbox/chat không còn UI tự duyệt hay prop thừa; stored flag cũ không bypass xác nhận; composer modal rộng gần full màn hình với textarea cao; 4 file test + tsc + grep gate xanh; office/team feature nguyên vẹn.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Config-load integration, Chromium light/dark, review và final gates</name>
  <files>tests/ai/AISettingsModal.integration.test.tsx, e2e/aiChatSettings.spec.ts</files>
  <behavior>
    - Với db thật có `settings.put({ key: 'ninerouter_endpoint', value: 'https://ai.example.test/v1' })`, mở `AISettingsDrawer` (card thật, không mock) thì ô `API Endpoint` hiện đúng giá trị đó.
    - Trong Chromium: mở app -> AI Assistant -> gear -> Modal settings full-width, nav 7 group; đổi endpoint, bấm `Lưu tất cả cấu hình`, reload, mở lại modal vẫn thấy endpoint đã lưu.
    - Composer: bấm `Mở rộng soạn thảo`, gõ vào textarea modal, bấm `Gửi ngay`; draft được gửi, ô chat rỗng, không có thay đổi dữ liệu TaskMate ngoài cấu hình đã lưu chủ đích.
    - Light/dark: đổi theme bằng `Chuyển đổi giao diện sáng/tối`, mở lại cả 2 modal; computed background của `.ant-modal-content` đổi theo theme, `--accent` đổi còn radius/font giữ nguyên; console/page errors rỗng.
    - Review diff ở effort medium: zero critical, zero warning thuộc phạm vi 3 task; fix xong rerun gates.
  </behavior>
  <action>
    Tạo `tests/ai/AISettingsModal.integration.test.tsx`: dùng `fake-indexeddb/auto`, `TaskPlannerDatabase` riêng, KHÔNG mock các card settings. Seed `db.settings.put({ key: 'ninerouter_endpoint', value: 'https://ai.example.test/v1' })`; render `<AISettingsDrawer open onClose={() => {}} db={db} />`; tìm input bằng `screen.getByText('API Endpoint').closest('.ant-form-item')?.querySelector('input')` và assert value. Assert modal width style `calc(100vw - 48px)` và `.ant-modal-content` tồn tại, `.ant-drawer` vắng mặt. Đóng db trong afterEach.

    Tạo `e2e/aiChatSettings.spec.ts` theo pattern `e2e/adoption.spec.ts`: `page.goto('/task-management/')`, chờ `.taskmate-workbench-theme` visible; mở AI Assistant bằng `getByRole('button', { name: /AI Assistant/ }).first()`; gear bằng `getByTestId('chat-settings-gear')`. Dùng helper `themeMode`, `cssVar`, `toggleTheme` (đóng modal trước khi toggle vì overlay chặn), `expectNoErrors` (console + pageerror). Check 1: modal title + nav `Cài đặt AI` + boundingBox width > 70% viewport; input `API Endpoint` visible; fill endpoint, click `Lưu tất cả cấu hình`, reload, mở lại, assert giá trị vẫn còn. Check 2: Escape, toggle theme, mở lại, assert `data-theme` đổi, `--accent` đổi, computed background `.ant-modal-content` khác light; `--radius-control` và `--font-size-ui` giữ nguyên. Check 3: đóng settings, bấm `Mở rộng soạn thảo`, textbox `Soạn thảo tin nhắn mở rộng` có boundingBox height > 300, fill câu hỏi, `Gửi ngay`, assert ô composer chính rỗng; lặp check modal composer ở dark theme. Không assert nội dung câu trả lời AI (không gọi network thật). Dùng `widthScale`/token có sẵn; không inject CSS màu hardcode trong spec.

    Chạy review `code-review` effort medium trên diff của cả 3 task; sửa mọi finding critical/warning thuộc `files_modified`, ghi rõ lý do nếu finding ngoài diff; chạy lại targeted tests, tsc và e2e nếu có sửa. Ba task được commit riêng (atomic); nếu orchestrator chạy FULL_MODE thì để auto code review chạy sau khi execute thay vì gộp review vào commit của task 1/2.
  </action>
  <verify>
    <automated>npx vitest run tests/ai/AISettingsModal.integration.test.tsx tests/ai/ChatInputBar.test.tsx tests/ai/AIChatDrawerToolbox.test.tsx tests/ai/AIChatDrawer.test.tsx tests/ai/AiChatWidget.test.tsx tests/phase51/AISettingsDrawer.test.tsx tests/phase51/AIPopoutView.standalone.test.tsx tests/phase51/AIPopoutView.legacy.test.tsx tests/phase51/standaloneConnectionStatus.test.tsx --bail=1 && npx tsc --noEmit && npm run test:e2e -- e2e/aiChatSettings.spec.ts</automated>
  </verify>
  <done>Card thật đọc cấu hình từ db; Chromium xác nhận settings/composer modal full-width ở light + dark, endpoint persist sau reload, không console error; review sạch critical/warning; targeted + tsc + e2e xanh, không chạy full suite.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Người dùng -> settings Modal | API endpoint/key do người dùng nhập, lưu vào db.settings / keyring; Modal mới không được làm lộ giá trị hoặc bỏ validation. |
| Stored tab config -> chat turn | Flag `autoApproveMutations` cũ trong IndexedDB không được phép tự ghi DB khi chat là Q&A. |
| Browser e2e -> IndexedDB | Endpoint lưu trong test browser phải tách biệt bằng origin/profile Playwright; không dùng secret thật. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-diw-01 | T (Tampering) | `AISettingsDrawer` Modal | medium | mitigate | Giữ nguyên `AISettingsDrawerBody`, card và validation của từng field; chỉ đổi lớp bao, không thêm `dangerouslySetInnerHTML` hay bỏ save handler. |
| T-diw-02 | E (Elevation of privilege) | `AIChatDrawer` runtime turn | high | mitigate | Truyền `autoApprove: false` cố định; bỏ UI toggle; mutation vẫn đi qua approval card của runtime hiện có. |
| T-diw-03 | I (Information disclosure) | e2e settings persistence | low | mitigate | Dùng endpoint giả `https://ai.example.test/v1`, không ghi token/key thật; Playwright dùng browser profile riêng. |
| T-diw-SC | Tampering | npm/pip/cargo installs | high | accept | Không cài package mới; chỉ dùng AntD/token và component có sẵn trong repo. |
</threat_model>

<verification>
1. `npx vitest run tests/ai/AISettingsModal.integration.test.tsx tests/ai/ChatInputBar.test.tsx tests/ai/AIChatDrawerToolbox.test.tsx tests/ai/AIChatDrawer.test.tsx tests/ai/AiChatWidget.test.tsx tests/phase51/AISettingsDrawer.test.tsx tests/phase51/AIPopoutView.standalone.test.tsx tests/phase51/AIPopoutView.legacy.test.tsx tests/phase51/standaloneConnectionStatus.test.tsx --bail=1` — pass. Không chạy `npm test`.
2. `npx tsc --noEmit` — clean.
3. `npm run test:e2e -- e2e/aiChatSettings.spec.ts` — Chromium thật, light + dark, console/page errors rỗng.
4. `grep -v '^#' src/components/ai/ChatTabToolbox.tsx src/components/ai/AiChatWidget.tsx | grep -c 'autoApproveMutations\|Tự duyệt'` chỉ đếm 0 trên từng file; `grep -n "autoApprove:" src/components/ai/AIChatDrawer.tsx` hiện `false`.
5. `git diff --name-only` — chỉ các file trong `files_modified`; `src/db/*`, `src/components/ai/office/*`, `src/components/ai/runtime/chatTurnRuntime.ts`, `src/services/ai/office/*` không đổi.
6. Review `code-review` effort medium trên diff: zero critical, zero warning thuộc diff; nếu có sửa thì rerun bước 1-3.
</verification>

<success_criteria>
- AI settings là full-width Modal, mở được từ gear trong chat workbench chính lẫn popout, dùng chung một component, không còn Drawer.
- Self-approve đã biến mất khỏi UI chat và đường runtime; stored flag cũ không tự ghi DB; approval flow hiện tại không đổi.
- Composer fullscreen có sẵn được giữ và verify: modal gần toàn màn hình, textarea cao, gửi/apply đúng draft, light/dark theo token TaskMate.
- Config card đọc giá trị thật từ `db.settings`; e2e Chromium xác nhận UI + persistence + dark mode; targeted tests + tsc + e2e xanh, diff review sạch; full suite không chạy.
</success_criteria>

<output>
Create `.planning/quick/261126-diw-fix-ai-chat-window-convert-settings-draw/261126-diw-SUMMARY.md` when done
</output>
