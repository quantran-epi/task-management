---
phase: quick
plan: 261003-wib
type: execute
wave: 1
depends_on: []
files_modified:
  - src/App.tsx
  - src/components/shell/AppShell.tsx
  - src/components/shell/Navigation.tsx
  - src/components/tasks/InlineStatusTag.tsx
  - public/favicon.svg
  - public/pwa-192x192.png
  - public/pwa-512x512.png
  - public/pwa-512x512-maskable.png
  - index.html
  - tests/shell.test.tsx
autonomous: true
requirements:
  - UI-AESTHETICS-ENHANCEMENT
  - MODERN-APP-ICON-AND-DESIGN-TOKENS
user_setup: []
must_haves:
  truths:
    - "Application uses modern Indigo design tokens (#4f46e5 / #4338ca), 8px border radius, controlHeight 36, and soft layout background."
    - "Dangerous 'Đặt lại CSDL' button is removed from AppShell header and safely accessed only via SettingsView Danger Zone."
    - "AppShell header contains streamlined visual hierarchy: Brand/Logo on the left, Status dot & Timer in center, Search pill (Cmd+K), Daily Review, AI Assistant, and Notifications on the right."
    - "Sidebar header displays modern brand icon and typography instead of plain text 'Menu', with rounded and refined menu items."
    - "InlineStatusTag renders modern pastel pill tags with soft backgrounds and matching borders for all task statuses."
    - "App icon and favicon are updated with modern indigo/violet gradient, crisp planner glyph, and matching PWA icon assets."
  artifacts:
    - path: "src/App.tsx"
      provides: "ConfigProvider theme design tokens (Indigo primary, borderRadius 8, modern font stack, subtle shadows)"
    - path: "src/components/shell/AppShell.tsx"
      provides: "Clean header layout without danger button, brand logo integration, and Cmd+K search pill"
    - path: "src/components/shell/Navigation.tsx"
      provides: "Modern sidebar navigation with polished menu items"
    - path: "src/components/tasks/InlineStatusTag.tsx"
      provides: "Pastel pill status tags with soft background, border, and text styling"
    - path: "public/favicon.svg"
      provides: "High-end indigo/violet vector app icon and favicon"
---

<objective>
Elevate the visual aesthetics and brand identity of the Personal Task & Workload Planner.
Modernize design tokens (Indigo primary #4f46e5, borderRadius 8px, soft shadows, layout background #f8fafc), clean up the header by removing the dangerous reset button, transform Cmd+K search into an elegant pill, polish sidebar navigation with brand glyph and rounded items, apply soft pastel colors to task status tags, and refresh app icons and favicons.

Purpose: Provide a modern, distraction-free, professional visual experience that aligns with high-end modern productivity tools.
Output: Refreshed design tokens, clean AppShell header, elegant navigation sidebar, pastel status badges, and upgraded app vector icons and PWA assets.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@src/App.tsx
@src/components/shell/AppShell.tsx
@src/components/shell/Navigation.tsx
@src/components/tasks/InlineStatusTag.tsx
@public/favicon.svg
</context>

<tasks>

<task type="auto">
  <name>Task 1: Upgrade Design Tokens in App.tsx, Modernize Favicon SVG and PWA Assets</name>
  <files>
    src/App.tsx
    public/favicon.svg
    public/pwa-192x192.png
    public/pwa-512x512.png
    public/pwa-512x512-maskable.png
    index.html
  </files>
  <action>
    1. In `src/App.tsx`, update ConfigProvider theme tokens for all views (main app shell and popout views):
       - `colorPrimary`: `#4f46e5` (Indigo-600)
       - `colorPrimaryHover`: `#4338ca` (Indigo-700)
       - `colorPrimaryActive`: `#3730a3` (Indigo-800)
       - `borderRadius`: 8
       - `controlHeight`: 36
       - `fontFamily`: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
       - In light mode token, set `colorBgLayout: '#f8fafc'` (Slate-50) and subtle shadows:
         `boxShadowSecondary: '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05)'`,
         `boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)'`, `wireframe: false`
    2. In `index.html`, update `<meta name="theme-color" content="#4f46e5" />`.
    3. In `public/favicon.svg`, design a sleek modern icon:
       - Rounded squircle with smooth gradient (from `#6366f1` to `#4338ca`)
       - High-end minimalist planner/calendar sheet with subtle translucent glass layer and crisp checkmark glyph
    4. Render sharp PNG assets for `public/pwa-192x192.png`, `public/pwa-512x512.png`, and `public/pwa-512x512-maskable.png` to match the new vector favicon design using headless Chrome or equivalent rendering.
  </action>
  <verify>
    <automated>npm run build</automated>
  </verify>
  <done>
    Design tokens reflect Indigo theme with 8px radius and soft shadows across all views, and favicon/PWA icons are refreshed with crisp modern vector graphics.
  </done>
</task>

<task type="auto">
  <name>Task 2: Streamline AppShell Header and Polish Sidebar Navigation</name>
  <files>
    src/components/shell/AppShell.tsx
    src/components/shell/Navigation.tsx
  </files>
  <action>
    1. In `src/components/shell/AppShell.tsx`:
       - Remove dangerous "Đặt lại CSDL" button, `ResetDbModal`, and `resetModalOpen` state from Header (confirmed already safely housed under SettingsView > Danger Zone).
       - Create a modern brand identity on the left:
         * Mini brand logo glyph (gradient container with check/planner icon) + app title "Task Planner" with subtle badge or subtitle.
       - Transform Cmd+K search trigger into an elegant pill button:
         * Rounded pill shape (`borderRadius: 20px`), subtle border (`1px solid ${token.colorBorderSecondary}`), background tint (`token.colorFillAlter`), search icon, placeholder text "Tìm kiếm & Lệnh...", and keyboard shortcut chip "⌘K" / "Ctrl K".
       - Restructure header action groups with balanced visual hierarchy:
         * Left: Brand logo & title + mobile menu hamburger
         * Center: GitHub sync status dot & ActiveTimerWidget
         * Right: Search pill, Daily Review button, AI Assistant button (with Cmd+J tooltip), NotificationBell, InstallButton, UpdateBadge.
    2. In `src/components/shell/Navigation.tsx` & `AppShell.tsx`:
       - Replace plain "Menu" header on Sider and Mobile Drawer with brand logo icon + "Task Planner" typography. When collapsed, show centered brand icon.
       - Apply polished styling to Ant Design Menu: rounded items (`borderRadius: 8px`), comfortable padding, subtle active background and hover state.
  </action>
  <verify>
    <automated>npm test -- tests/components/shell</automated>
  </verify>
  <done>
    Header is clean, well-spaced, and free of accidental database reset risk; search is an elegant pill; sidebar has brand identity and refined menu items.
  </done>
</task>

<task type="auto">
  <name>Task 3: Modernize Pastel Status Tags and Align Test Assertions</name>
  <files>
    src/components/tasks/InlineStatusTag.tsx
    tests/shell.test.tsx
  </files>
  <action>
    1. In `src/components/tasks/InlineStatusTag.tsx`:
       - Replace harsh default tag colors with modern pastel color palettes:
         * Open: Slate soft pastel (`bg: #f1f5f9, color: #475569, border: 1px solid #e2e8f0`)
         * Pending: Amber soft pastel (`bg: #fffbeb, color: #b45309, border: 1px solid #fde68a`)
         * In Progress: Indigo soft pastel (`bg: #eef2ff, color: #4338ca, border: 1px solid #c7d2fe`)
         * Resolved: Purple soft pastel (`bg: #faf5ff, color: #7e22ce, border: 1px solid #e9d5ff`)
         * In Review: Sky/Cyan soft pastel (`bg: #f0f9ff, color: #0284c7, border: 1px solid #bae6fd`)
         * Done: Emerald soft pastel (`bg: #ecfdf5, color: #047857, border: 1px solid #a7f3d0`)
         * Cancelled: Muted gray pastel (`bg: #f8fafc, color: #94a3b8, border: 1px solid #e2e8f0, line-through`)
       - Set pill tag styling (`borderRadius: 12px`, padding: `1px 10px`, `fontSize: 12px`, `fontWeight: 500`).
       - Ensure dropdown menu items and dark mode contrast remain legible and crisp.
    2. In `tests/shell.test.tsx`:
       - Update tests that previously asserted the "Đặt lại CSDL" button in the header.
       - Verify header renders brand title, search pill button, status badge, and navigation items.
       - Verify that the header does not render the danger reset button.
    3. Run full test suite for shell and task components to verify zero regressions.
  </action>
  <verify>
    <automated>npm test -- tests/shell.test.tsx tests/components/tasks/InlineStatusTag.test.tsx</automated>
  </verify>
  <done>
    Status tags exhibit a high-end pastel appearance, and test suite cleanly passes with updated header expectations.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Header UI -> Database operations | Accidental user clicks causing immediate destructive database wipe |
| Static assets -> PWA Cache | SVG and PNG icon updates cached by service worker |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-UI-01 | Tampering / Denial of Service | AppShell Header | mitigate | Remove dangerous "Đặt lại CSDL" button from header so users cannot accidentally purge IndexedDB from main navigation; retain only inside SettingsView danger zone with confirm modal. |
| T-UI-02 | Tampering | PWA manifest & cache | mitigate | Keep asset file names and dimensions identical (favicon.svg, pwa-192x192.png, pwa-512x512.png) so existing service worker cache-busting and manifests stay valid. |
</threat_model>

<verification>
Run test suite: `npm test -- tests/components/shell tests/components/tasks tests/shell.test.tsx`
Run build: `npm run build`
</verification>

<success_criteria>
- Ant Design tokens updated to Indigo primary (#4f46e5 / #4338ca), 8px border radius, controlHeight 36, and soft layout background.
- "Đặt lại CSDL" removed from AppShell header.
- Search button styled as an elegant pill with Cmd+K shortcut indicator.
- Header and sidebar incorporate modern brand icon and typography.
- Status tags display modern soft pastel colors with pill border radius.
- Vector favicon and PWA icons updated.
- All unit and integration tests pass cleanly.
</success_criteria>

<output>
Create `.planning/quick/261003-wib-enhance-ui-aesthetics-and-modern-app-ico/261003-wib-SUMMARY.md` when done
</output>
