---
phase: quick
plan: 261005-mre
type: execute
wave: 1
depends_on: []
files_modified:
  - src/services/ai/graphitiMcpClient.ts
  - src/components/ai/McpSettingsModal.tsx
  - src/components/ai/ChatHeader.tsx
  - src/components/ai/AIChatDrawer.tsx
  - tests/ai/graphitiMcpClient.test.ts
  - tests/ai/AIChatDrawer.test.tsx
autonomous: true
requirements:
  - QUICK-261005-MRE-MCP-MODAL-AI-DRAWER
must_haves:
  truths:
    - "ChatHeader dropdown menu includes an option 'Quản lý MCP Servers' with an ApiOutlined or ToolOutlined icon."
    - "Clicking 'Quản lý MCP Servers' opens a modal (McpSettingsModal) showing configured MCP servers (Graphiti MCP as first entry, expandable)."
    - "Each MCP server item in modal has a Switch/toggle to enable or disable it, plus a status/endpoint summary."
    - "Enabled/disabled state persists in IndexedDB settings table (e.g. key `mcp_servers_enabled` or `graphiti_mcp_enabled`)."
    - "When an MCP server is disabled, its tool definitions and system instructions are excluded from the AI chat turn (zero tools contributed, no domain dictionary injected)."
    - "When enabled, tools and instructions function normally as before."
    - "Vitest unit tests verify modal toggle, persistence, and AI tool exclusion behavior."
  artifacts:
    - path: "src/services/ai/graphitiMcpClient.ts"
      provides: "Persistence helpers to check and toggle MCP enabled state in IndexedDB settings"
      exports: ["isGraphitiMcpEnabled", "setGraphitiMcpEnabled"]
    - path: "src/components/ai/McpSettingsModal.tsx"
      provides: "Ant Design Modal displaying MCP servers list with Switch controls and persistence"
    - path: "src/components/ai/ChatHeader.tsx"
      provides: "Dropdown menu entry for MCP settings trigger"
    - path: "src/components/ai/AIChatDrawer.tsx"
      provides: "Wiring of McpSettingsModal state and exclusion of disabled MCP tools from turn"
    - path: "tests/ai/graphitiMcpClient.test.ts"
      provides: "Tests for MCP enabled/disabled persistence helpers"
    - path: "tests/ai/AIChatDrawer.test.tsx"
      provides: "Tests for ChatHeader menu item, modal opening, and disabled MCP tool exclusion"
  key_links:
    - from: "src/components/ai/ChatHeader.tsx"
      to: "src/components/ai/AIChatDrawer.tsx"
      via: "onOpenMcpSettings callback prop"
      pattern: "onOpenMcpSettings"
    - from: "src/components/ai/AIChatDrawer.tsx"
      to: "src/components/ai/McpSettingsModal.tsx"
      via: "McpSettingsModal component render"
      pattern: "<McpSettingsModal"
    - from: "src/components/ai/AIChatDrawer.tsx"
      to: "src/services/ai/graphitiMcpClient.ts"
      via: "isGraphitiMcpEnabled check before getGraphitiMcpToolDefinitions"
      pattern: "isGraphitiMcpEnabled"
---

<objective>
Add an MCP Server Management Modal accessible from the AI Drawer's header dropdown menu, allowing users to enable or disable MCP servers (starting with Graphiti MCP). When disabled, MCP tools and instructions are excluded from AI tool calls. Persistence is backed by IndexedDB settings.

Purpose: Give users quick in-chat control over external MCP capabilities without cluttering the chat input bar or requiring navigation to app settings.
Output: McpSettingsModal component, persistence helpers in graphitiMcpClient, header dropdown trigger, conditional tool loading in AIChatDrawer, and updated test suite.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/services/ai/graphitiMcpClient.ts
@src/components/ai/ChatHeader.tsx
@src/components/ai/AIChatDrawer.tsx
@tests/ai/AIChatDrawer.test.tsx
@tests/ai/graphitiMcpClient.test.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add MCP enabled/disabled persistence helpers to graphitiMcpClient</name>
  <files>src/services/ai/graphitiMcpClient.ts, tests/ai/graphitiMcpClient.test.ts</files>
  <behavior>
    - Test 1: isGraphitiMcpEnabled returns true by default when no setting exists in DB.
    - Test 2: setGraphitiMcpEnabled(false, db) sets setting key 'graphiti_mcp_enabled' to false in db.settings.
    - Test 3: isGraphitiMcpEnabled returns false after setGraphitiMcpEnabled(false, db).
    - Test 4: setGraphitiMcpEnabled(true, db) sets setting key 'graphiti_mcp_enabled' to true.
  </behavior>
  <action>
    In src/services/ai/graphitiMcpClient.ts:
    1. Define setting key `const GRAPHITI_ENABLED_SETTINGS_KEY = 'graphiti_mcp_enabled';`.
    2. Export `async function isGraphitiMcpEnabled(db: TaskPlannerDatabase = defaultDb): Promise<boolean>`:
       Reads from `db.settings.get(GRAPHITI_ENABLED_SETTINGS_KEY)`. If value is boolean, return it. If undefined/null, return default `true` (enabled by default).
    3. Export `async function setGraphitiMcpEnabled(enabled: boolean, db: TaskPlannerDatabase = defaultDb): Promise<void>`:
       Writes `{ key: GRAPHITI_ENABLED_SETTINGS_KEY, value: enabled }` into `db.settings.put(...)`. Also call `clearSession()` if disabled to clean cached sessions.
    4. Add unit tests in tests/ai/graphitiMcpClient.test.ts verifying default behavior and toggle persistence with fake-indexeddb.
  </action>
  <verify>
    <automated>npm test tests/ai/graphitiMcpClient.test.ts</automated>
  </verify>
  <done>MCP enabled state reads and writes to Dexie settings table correctly with true default.</done>
</task>

<task type="auto">
  <name>Task 2: Create McpSettingsModal component and trigger in ChatHeader dropdown</name>
  <files>src/components/ai/McpSettingsModal.tsx, src/components/ai/ChatHeader.tsx</files>
  <action>
    1. Create `src/components/ai/McpSettingsModal.tsx`:
       - Props: `{ open: boolean; onClose: () => void; db?: TaskPlannerDatabase; onSettingsChange?: () => void }`.
       - Uses Ant Design `Modal`, `List`, `Switch`, `Tag`, `Typography`, `Space`.
       - In modal body, render list of configured MCP servers:
         - Server 1: Graphiti Banking MCP.
           - Description: "Tri thức dữ liệu thẻ SmartVista (SVFE_SHB & MAIN1), tra cứu cấu trúc bảng, quan hệ khóa ngoại và nghiệp vụ chuyển mạch thanh toán."
           - Endpoint indicator: display current endpoint from `getGraphitiMcpEndpoint(db)`.
           - Switch: toggle calling `setGraphitiMcpEnabled(checked, db)`. Updates local state and triggers message or feedback.
       - Expandable architecture: define an array or record structure for MCP entries so future MCPs (e.g. Jira MCP, Git MCP, Filesystem MCP) can be added simply as items in the array.
       - Standard clean styling matching PlannerMate theme.
    2. In `src/components/ai/ChatHeader.tsx`:
       - Add optional prop `onOpenMcpSettings?: () => void` to `ChatHeaderProps`.
       - In `menuItems` array, add a menu item for MCP settings (before or near debug options):
         `{ key: 'mcp-settings', icon: <ApiOutlined />, label: 'Quản lý máy chủ MCP', onClick: onOpenMcpSettings }`.
       - Import `ApiOutlined` from `@ant-design/icons`.
       - Per user requirement: ONLY in the dropdown menu, NOT an extra icon button in the header bar.
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <done>ChatHeader dropdown contains 'Quản lý máy chủ MCP' item, and McpSettingsModal component renders list with toggle switch.</done>
</task>

<task type="auto">
  <name>Task 3: Wire McpSettingsModal into AIChatDrawer and exclude tools when disabled</name>
  <files>src/components/ai/AIChatDrawer.tsx, tests/ai/AIChatDrawer.test.tsx</files>
  <action>
    1. In `src/components/ai/AIChatDrawer.tsx`:
       - Add state `const [isMcpModalOpen, setIsMcpModalOpen] = useState(false);`.
       - Pass `onOpenMcpSettings={() => setIsMcpModalOpen(true)}` to `<ChatHeader />`.
       - Render `<McpSettingsModal open={isMcpModalOpen} onClose={() => setIsMcpModalOpen(false)} db={db} />`.
       - In `handleSendMessage`:
         Before calling `getGraphitiMcpToolDefinitions(db)`, check `await isGraphitiMcpEnabled(db)`.
         If `!isMcpEnabled`:
           `graphitiTools = [];` (do not fetch definitions, exclude completely).
           `graphitiInstruction = '';` (no SmartVista domain prompt injected).
         If enabled:
           Fetch definitions and inject instructions as before.
       - Also in tool execution handler in `AIChatDrawer`:
         If `isGraphitiMcpTool(name)` is called but Graphiti is disabled, return a clear tool response stating that Graphiti MCP is currently disabled by user.
    2. In `tests/ai/AIChatDrawer.test.tsx`:
       - Add test: ChatHeader dropdown contains 'Quản lý máy chủ MCP' and invokes `onOpenMcpSettings`.
       - Add test: When Graphiti MCP is disabled via `isGraphitiMcpEnabled`, `getGraphitiMcpToolDefinitions` is not called or tools/instructions are excluded from chat turn.
  </action>
  <verify>
    <automated>npm test tests/ai/AIChatDrawer.test.tsx</automated>
  </verify>
  <done>McpSettingsModal opens from ChatHeader dropdown; toggling off excludes MCP tools and prompt instructions from AI turn; all Vitest tests pass.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| User Settings → AI Drawer Context | Setting toggles in IndexedDB control whether external MCP tool definitions and endpoints are exposed to the AI model |
| AI Tool Execution → MCP Server | When MCP is disabled, tool calls targeting that MCP must be blocked at execution time even if model hallucinates a call |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-Q261005-01 | Tampering / Info Disclosure | src/components/ai/AIChatDrawer.tsx | medium | mitigate | Check isGraphitiMcpEnabled at send time and at tool dispatch time. If disabled, do not supply tools or instructions to prompt, and reject execution if invoked. |
| T-Q261005-02 | Denial of Service / Crash | src/components/ai/McpSettingsModal.tsx | low | mitigate | Wrap toggle and state loading in try/catch with user-friendly Ant Design message feedback. |
| T-Q261005-SC | Tampering | npm packages | high | mitigate | Use only existing Ant Design and project dependencies; no new external packages installed. |
</threat_model>

<verification>
- `npm test tests/ai/graphitiMcpClient.test.ts` passes
- `npm test tests/ai/AIChatDrawer.test.tsx` passes
- `npx tsc --noEmit` passes
</verification>

<success_criteria>
- McpSettingsModal created with Graphiti MCP toggle and expandable structure
- ChatHeader dropdown menu contains 'Quản lý máy chủ MCP' trigger without adding clutter to the header
- Disabling MCP persists in IndexedDB settings and excludes MCP tools and instructions from AI chat calls
- All tests and TypeScript checks pass
</success_criteria>

<output>
Create `.planning/quick/261005-mre-enable-disable-mcp-modal-from-ai-drawer-/261005-mre-PLAN.md`
</output>
