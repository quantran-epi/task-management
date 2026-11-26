---
phase: quick
plan: 261126-vuy
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/ai/ChatHeader.tsx
  - tests/phase51/standaloneThemeToggle.test.tsx
  - e2e/aiChatStandalone.tsx
  - e2e/aiChatSettings.spec.ts
autonomous: true
requirements:
  - AI-CHAT-STANDALONE-THEME-TOGGLE
  - SHARED-THEME-STATE
  - TOKEN-PARITY
  - E2E-REAL-CONTROL
  - NARROW-WIDTH-NO-OVERLAP
  - ZERO-REGRESSION
user_setup: []
must_haves:
  truths:
    - "Standalone AI chat có nút đổi sáng/tối ngay trong header, click là đổi tức thì, không cần reload"
    - "Toggle dùng chung useThemeMode / broadcastThemeMode / taskmate_theme, không tạo state theme thứ hai"
    - "Icon và tooltip theo mode đúng chuẩn TitleBar: light hiện Moon, dark hiện Sun"
    - "Token TaskMate đổi đúng (accent, nền modal), radius/font giữ nguyên; data-theme và CSS var đồng bộ"
    - "E2E harness không còn nút giả; spec bấm control thật trong header"
    - "Header vẫn cao 34px, control 28x28, không chồng lấn ở 360px; không console error ở cả 2 theme"
  artifacts:
    - path: src/components/ai/ChatHeader.tsx
      provides: "Standalone header có theme toggle dùng useThemeMode, data-testid chat-theme-toggle, data-testid chat-standalone-header"
      contains: "Chuyển đổi giao diện sáng/tối"
    - path: tests/phase51/standaloneThemeToggle.test.tsx
      provides: "Unit/component test cho icon theo mode, click/keyboard đổi mode, persist localStorage, không ảnh hưởng header thường"
      contains: "chat-theme-toggle"
    - path: e2e/aiChatStandalone.tsx
      provides: "Harness mount thẳng AppIntelliJ standaloneChat, không còn nút theme synthetic"
      contains: "<AppIntelliJ standaloneChat />"
    - path: e2e/aiChatSettings.spec.ts
      provides: "Playwright Chrome kiểm tra control thật, token parity, geometry 360px, console sạch"
      contains: "chat-theme-toggle"
  key_links:
    - from: src/components/ai/ChatHeader.tsx (useThemeMode)
      to: src/hooks/useThemeMode.ts -> src/workbench/themeBroadcast.ts
      via: "toggle() gọi setMode() -> broadcastThemeMode(); không setState cục bộ, không gọi lại subscribeToThemeBroadcast"
    - from: src/components/ai/ChatHeader.tsx (toggle)
      to: src/workbench/AntdThemeAdapter.tsx (data-theme + applyCssVariables)
      via: "cùng THEME_LOCAL_EVENT / storage / Tauri emitTo; wrapper .taskmate-workbench-theme đổi mode tức thì"
    - from: e2e/aiChatSettings.spec.ts (getByTestId chat-theme-toggle)
      to: src/components/ai/ChatHeader.tsx (nút thật)
      via: "harness e2e/aiChatStandalone.tsx bỏ nút giả để role name chỉ còn 1 control"
---

<objective>
Thêm công tắc sáng/tối thật vào header của cửa sổ AI chat standalone, dùng chung cơ chế theme của TaskMate, rồi đưa E2E từ nút giả sang control thật và verify kỹ trong Chrome.

Purpose: standalone chat hiện đã có token light/dark nhờ `AntdThemeAdapter` nhưng người dùng không đổi được từ trong cửa sổ; nút E2E hiện là nút synthetic trong harness nên chưa chứng minh UI thật hoạt động.

Output: theme toggle trong `ChatHeader` nhánh standalone, test unit/component phủ hành vi, harness + spec E2E dùng control thật, bằng chứng Chrome light/dark ở desktop và 360px không lỗi. Không thêm dependency, không thêm global state, không đổi schema, không đụng PWA/GitHub Pages, không chạy full vitest suite.

Quan sát lúc lập plan (đã verify trực tiếp):
- `src/AppIntelliJ.tsx:115-128` đã bọc route `ai-popout` trong `<AntdThemeAdapter><ThemeAppHolder>`; `AntdThemeAdapter` gọi `applyCssVariables(mode, wrapperRef)` và đặt `data-theme={mode}`.
- `src/hooks/useThemeMode.ts` đã có `{ mode, setMode, toggle }`, đọc `taskmate_theme`/`prefers-color-scheme`, dùng một subscription chung cho mọi consumer; `themeBroadcast.ts` validate payload trước khi đưa vào state.
- `src/workbench/TitleBar.tsx:310-329` là pattern toggle hiện có: `Tooltip` + `IconButton`, `SunOutlined` khi dark / `MoonOutlined` khi light, `aria-label="Chuyển đổi giao diện sáng/tối"`, 28x28.
- `src/components/ai/ChatHeader.tsx:45-101` là nhánh standalone: chip Global, connection status, gear `chat-settings-gear`; prop `onOpenSettings` không nhận theme toggle. Nhánh thường (`:162-295`) không đổi.
- `src/components/ui/icon.tsx` đã export `SunOutlined` / `MoonOutlined` qua `wrapIcon`; class icon trong test là `.anticon-sun` / `.anticon-moon`.
- `e2e/aiChatStandalone.tsx:39-42,197-208` có `toggleTheme()` + nút `<button aria-label="Chuyển đổi giao diện sáng/tối">` trong `HarnessShell`; `e2e/aiChatSettings.spec.ts:39-45,321,332` click vào tên đó. Khi bỏ nút giả, control thật trong header sẽ khớp cùng accessible name.
- `tests/phase51/standaloneConnectionStatus.test.tsx`, `tests/phase51/AIPopoutView.standalone.test.tsx`, `src/hooks/__tests__/themeBroadcast.test.ts`, `src/workbench/__tests__/AntdThemeAdapter.test.tsx` là các test scoped liên quan. `npm test` >1 tiếng theo memory dự án — chỉ chạy scoped paths.
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Theme toggle thật trong standalone ChatHeader + test hành vi</name>
  <files>src/components/ai/ChatHeader.tsx, tests/phase51/standaloneThemeToggle.test.tsx</files>
  <behavior>
    - Render `<ChatHeader isStandalone ... />` với `taskmate_theme='light'`: có button `data-testid="chat-theme-toggle"`, accessible name `Chuyển đổi giao diện sáng/tối`, icon `.anticon-moon`, tooltip `Giao diện: Tối`.
    - Với `taskmate_theme='dark'`: icon `.anticon-sun`, tooltip `Giao diện: Sáng`.
    - Click vào toggle đổi localStorage `taskmate_theme` và icon theo hướng ngược lại; trong jsdom dùng `fireEvent.click` sau `focus()` (KHÔNG dùng `fireEvent.keyDown`, không cài `user-event`); chip `chat-global-scope-chip`, status `chat-connection-status`, gear `chat-settings-gear` vẫn render và gear vẫn gọi `onOpenSettings`.
    - Header không phải standalone không có `chat-theme-toggle` (tránh nhân đôi với TitleBar).
    - Geometry: root header `data-testid="chat-standalone-header"` cao 34px; toggle 28x28; ở 360px chip bị ellipsis và không cắt vào nhóm control.
  </behavior>
  <action>
    Viết `tests/phase51/standaloneThemeToggle.test.tsx` trước (đỏ), rồi sửa `src/components/ai/ChatHeader.tsx` (xanh). Không sửa `useThemeMode.ts`, `themeBroadcast.ts`, `AntdThemeAdapter.tsx`, `TitleBar.tsx`, `AIChatDrawer.tsx`.

    Trong test (`// @vitest-environment jsdom`): import `cleanup, fireEvent, render, screen` từ `@testing-library/react`, `useThemeMode` KHÔNG mock, `THEME_STORAGE_KEY` từ `../../src/workbench/themeBroadcast`. `beforeEach`: xóa `__TAURI_INTERNALS__`, `localStorage.clear()`, seed mode mong muốn, stub `window.matchMedia` trả `matches:false` kèm `addEventListener/removeEventListener` no-op. `afterEach`: `cleanup()`, restore matchMedia, xóa `__TAURI_INTERNALS__`. Render trực tiếp `<ChatHeader isStandalone isPinned={false} onTogglePin={undefined} onClose={vi.fn()} onOpenSettings={vi.fn()} connectionStatus="Knowledge · MCP sẵn sàng" />`. Assert bằng `getByTestId('chat-theme-toggle')`, `toHaveAccessibleName`, `container.querySelector('.anticon-moon' | '.anticon-sun')`, `localStorage.getItem(THEME_STORAGE_KEY)`, và `fireEvent.click` sau `focus()`. Thêm assertion tooltip: `fireEvent.mouseEnter(toggle)` rồi `await screen.findByRole('tooltip')` với text 'Giao diện: Tối' (light) / 'Giao diện: Sáng' (dark), theo precedent `tests/components/ai/office/TeamWorkspacePinnedContext.test.tsx:104-106`. Thêm ca render `isStandalone={false}` với `onClose` + `onTogglePin` và assert `queryByTestId('chat-theme-toggle')` vắng mặt. Không mock `useThemeMode` — test phải chứng minh dùng hook thật.

    Trong `src/components/ai/ChatHeader.tsx`: thêm import `SunOutlined, MoonOutlined` từ `'../ui/icon'` và `useThemeMode` từ `'../../hooks/useThemeMode'`. Gọi `const { mode, toggle } = useThemeMode();` ngay sau `const { token } = useAntdToken();` (unconditional, đúng hooks rule; transport đã được chia sẻ nên không tăng subscription IPC). Trong nhánh `if (isStandalone)`: thêm `data-testid="chat-standalone-header"` vào div root (giữ nguyên height 34, padding, border, background). Ở nhóm control bên phải, bọc toggle + gear trong `<div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-4)', flexShrink: 0 }}>`; trước gear đặt `Tooltip` title `mode === 'dark' ? 'Giao diện: Sáng' : 'Giao diện: Tối'` chứa `IconButton` `type="text"` icon `mode === 'dark' ? <SunOutlined /> : <MoonOutlined />`, `onClick={toggle}`, `aria-label="Chuyển đổi giao diện sáng/tối"`, `data-testid="chat-theme-toggle"`, style y hệt TitleBar: width/height/minWidth 28, padding 0, borderRadius 4, flex center. Giữ gear nguyên accessible name/testid/onClick. Ở chip `chat-global-scope-chip` và status `chat-connection-status`: thêm `minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis'` để 360px không đẩy control; nhóm trái đã có `flex: 1, minWidth: 0`. Không đổi nhánh header thường, không thêm màu hex hay style token mới.
  <verify>
    <automated>npx vitest run tests/phase51/standaloneThemeToggle.test.tsx tests/phase51/standaloneConnectionStatus.test.tsx --bail=1 && npx tsc --noEmit</automated>
  </verify>
  <done>Header standalone có toggle thật dùng useThemeMode, icon/tooltip/persist đúng; header thường không đổi; test scoped + tsc xanh.</done>
</task>

<task type="auto">
  <name>Task 2: E2E bỏ nút giả, dùng control thật + kiểm tra token và 360px</name>
  <files>e2e/aiChatStandalone.tsx, e2e/aiChatSettings.spec.ts</files>
  <action>
    Trong `e2e/aiChatStandalone.tsx`: xóa hẳn `toggleTheme()` (dòng ~39-42) và nút `<button ... aria-label="Chuyển đổi giao diện sáng/tối">` khỏi `HarnessShell` (dòng ~197-208); `HarnessShell` chỉ còn `<AppIntelliJ standaloneChat />` trong div flex. Bỏ import `broadcastThemeMode, THEME_STORAGE_KEY` nếu không còn dùng. Không đụng Tauri IPC shim, fixture SSH hay DB.

    Trong `e2e/aiChatSettings.spec.ts`: giữ helpers `themeMode`, `cssVar`, `expectNoErrors`, `watchErrors`, `settingsDialog`, `openStandaloneSettings`. Đổi comment của `toggleTheme(page)` (dòng ~39) từ "title-bar switch" thành "dùng control theme đang visible" nhưng GIẾP nguyên cách tìm theo accessible name để vẫn dùng được cho luồng workbench (TitleBar) lẫn standalone (header). Trong test token parity standalone (đoạn ~315-338): trước khi toggle assert `await expect(page.getByTestId('chat-theme-toggle')).toBeVisible()` và `await expect(page.getByRole('button', { name: 'Chuyển đổi giao diện sáng/tối' })).toHaveCount(1)` — chứng minh chỉ còn control thật; thay 2 lần click bằng `page.getByTestId('chat-theme-toggle').click()` (vẫn giữ đóng modal trước khi click). Giữ nguyên mọi assertion token parity: `data-theme` đổi, `--accent` đổi, `--radius-control` / `--font-size-ui` giữ nguyên, background `.ant-modal-container` giữa light/dark khác nhau, `expectNoErrors(errors)` ở cuối.

    Thêm một test scoped mới trong cùng file (dùng chung harness `?rfx=ui`, `watchErrors`): vì `beforeEach` để page ở `/task-management/`, đầu test gọi `await page.setViewportSize({ width: 360, height: 720 })` rồi `await page.goto('/task-management/e2e/aiChatStandalone.html?rfx=ui')` và chờ `chat-settings-gear` visible trước khi assert; assert `chat-standalone-header` bounding box height 34 và toggle width/height 28; evaluate DOM rect của `[data-testid="chat-global-scope-chip"]` và `[data-testid="chat-theme-toggle"]` để assert chip không cắt ngang control (`chip.right <= toggle.left`); chụp `test-results/ai-chat-theme-light-360.png`, click toggle, assert `data-theme` đổi, chụp `test-results/ai-chat-theme-dark-360.png`, assert geometry vẫn giữ nguyên và `expectNoErrors(errors)`. Không inject CSS, không dùng màu hardcode, không gọi network AI thật.
  <verify>
    <automated>grep -v '^#' e2e/aiChatStandalone.tsx | grep -c 'broadcastThemeMode\|Chuyển đổi giao diện' | grep '^0$' && npm run test:e2e -- e2e/aiChatSettings.spec.ts</automated>
  </verify>
  <done>Harness sạch nút giả; spec click control thật, token parity vẫn xanh, geometry 360px đúng 34/28 và không chồng lấn, console/page errors rỗng, có 2 screenshot light/dark để review.</done>
</task>

<task type="auto">
  <name>Task 3: Final gates — scoped vitest, tsc, review diff, Chrome visual</name>
  <files>e2e/aiChatSettings.spec.ts, src/components/ai/ChatHeader.tsx</files>
  <action>
    Chạy lần lượt các gate bên dưới; KHÔNG chạy `npm test` hay full vitest. Nếu gate fail, sửa đúng nguyên nhân trong `files_modified` rồi chạy lại từ đầu. Dùng `Read` trên 2 screenshot `test-results/ai-chat-theme-light-360.png` và `test-results/ai-chat-theme-dark-360.png` để kiểm tra trực quan: header 34px, icon sáng/tối đúng, chip ellipsis gọn, gear + toggle không chồng, nền/accent đổi theo theme, radius/font không đổi. Review `git diff` của 4 file: zero finding critical/warning; nếu có sửa thì rerun gate. Xác nhận `git diff --name-only` chỉ là 4 file trong frontmatter — `useThemeMode.ts`, `themeBroadcast.ts`, `AntdThemeAdapter.tsx`, `AIChatDrawer.tsx`, `src/db/*` nguyên vẹn.
  </action>
  <verify>
  <verify>
    <automated>npx vitest run tests/phase51/standaloneThemeToggle.test.tsx tests/phase51/standaloneConnectionStatus.test.tsx tests/phase51/AIPopoutView.standalone.test.tsx tests/phase51/AISettingsDrawer.test.tsx src/hooks/__tests__/themeBroadcast.test.ts src/workbench/__tests__/AntdThemeAdapter.test.tsx --bail=1 && npx tsc --noEmit && npm run test:e2e -- e2e/aiChatSettings.spec.ts</automated>
  </verify>
  <done>Mọi gate xanh, screenshot light/dark reviewed, diff sạch và đúng phạm vi; sếp có thể mở Chrome DevTools ở `/task-management/e2e/aiChatStandalone.html?rfx=ui` để tự confirm lần cuối.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Toggle -> theme broadcast | Giá trị mode từ UI đi qua `isValidThemeMode` trước khi vào state/localStorage/Tauri emit. |
| localStorage `taskmate_theme` | Dữ liệu origin-local có thể bị sửa tay; hook đọc qua `isValidThemeMode`, fallback hệ thống khi giá trị không hợp lệ. |
| E2E harness -> app | Harness chỉ mount app thật, không inject theme giả; console/pageerror được thu và ép rỗng. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-vuy-01 | T (Tampering) | `chat-theme-toggle` -> `useThemeMode` | mitigate | Chỉ gọi `toggle()` của hook có sẵn; không tự viết localStorage/event, không nhận mode từ props hay query string. |
| T-vuy-02 | I (Information disclosure) | `themeBroadcast` storage event | mitigate | Giữ nguyên `isValidThemeModePayload`; toggle không đọc/ghi secret, chỉ 'light'/'dark'. |
| T-vuy-03 | D (Denial of service) | 360px header | mitigate | Chip/status ellipsis + nhóm control `flexShrink: 0`; E2E đo rect chống chồng lấn. |
| T-vuy-SC | Tampering | npm/pip/cargo installs | accept | Không cài package mới; chỉ dùng AntD/token và component có sẵn trong repo. |
</threat_model>

<verification>
1. `npx vitest run tests/phase51/standaloneThemeToggle.test.tsx tests/phase51/standaloneConnectionStatus.test.tsx tests/phase51/AIPopoutView.standalone.test.tsx tests/phase51/AISettingsDrawer.test.tsx src/hooks/__tests__/themeBroadcast.test.ts src/workbench/__tests__/AntdThemeAdapter.test.tsx --bail=1` — pass. Không gọi `npm test`.
2. `npx tsc --noEmit` — clean.
3. `npm run test:e2e -- e2e/aiChatSettings.spec.ts` — Chrome thật (`channel: 'chrome'`), cả luồng workbench lẫn standalone harness; token parity + geometry 360px + console errors rỗng.
4. `grep -v '^#' e2e/aiChatStandalone.tsx | grep -c 'broadcastThemeMode\|Chuyển đổi giao diện' | grep '^0$'` — nút giả đã biến mất.
5. Chrome DevTools (human): mở `/task-management/e2e/aiChatStandalone.html?rfx=ui`, bật device toolbar 360px, click toggle ở header; kiểm tra height 34, control 28x28, tooltip đúng chiều, accent/nền đổi còn radius/font giữ nguyên, Console không error. Lặp lại ở width desktop.
6. `git diff --name-only` — đúng 4 file; không đụng theme hook/broadcast/adapter, DB, PWA.
</verification>

<success_criteria>
- Người dùng standalone AI chat đổi sáng/tối ngay trong header, tức thì, persist và broadcast sang cửa sổ khác nhờ `useThemeMode` hiện có.
- E2E harness chỉ còn control thật; spec chứng minh token parity và geometry 34/28, 360px không chồng lấn, zero console error.
- Scoped vitest + tsc + Playwright Chrome xanh; screenshot light/dark đã review; diff zero critical/warning; không chạy full suite.
</success_criteria>

<output>
Create `.planning/quick/261126-vuy-th-m-dark-light-theme-switch-cho-ai-chat/261126-vuy-SUMMARY.md` when done
</output>
