---
phase: quick
plan: 261017-iyd
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/settings/NineRouterConfigCard.tsx
  - tests/components/settings/NineRouterConfigCard.test.tsx
autonomous: true
requirements:
  - QUICK-REMOVE-SEPARATE-GRAPHITI-CONFIG-SECTION
must_haves:
  truths:
    - "NineRouterConfigCard no longer renders the standalone Graphiti MCP section, endpoint field, reset button, or test connection button."
    - "NineRouter and Image Generation configuration, testing, and saving in NineRouterConfigCard remain fully intact."
    - "McpConfigCard continues to serve as the unified, dynamic configuration interface for MCP servers including Graphiti Banking MCP."
    - "Targeted tests for NineRouterConfigCard, McpConfigCard, and SettingsView pass cleanly."
  artifacts:
    - path: "src/components/settings/NineRouterConfigCard.tsx"
      provides: "NineRouter and Image Generation settings card without redundant Graphiti MCP section"
    - path: "tests/components/settings/NineRouterConfigCard.test.tsx"
      provides: "Component test verifying NineRouter and Image Generation UI without Graphiti section"
  key_links:
    - from: "src/views/SettingsView.tsx"
      to: "src/components/settings/NineRouterConfigCard.tsx"
      via: "Rendering in AI settings tab"
      pattern: "<NineRouterConfigCard"
    - from: "src/views/SettingsView.tsx"
      to: "src/components/settings/McpConfigCard.tsx"
      via: "Rendering dynamic MCP servers in AI settings tab"
      pattern: "<McpConfigCard"
---

<objective>
Remove redundant standalone Graphiti MCP configuration section from NineRouterConfigCard since dynamic MCP configuration in McpConfigCard already covers it.

Purpose: Eliminate duplicated and confusing settings UI where Graphiti endpoint was configured in two different cards on the same Settings tab.
Output: Cleaned NineRouterConfigCard.tsx without Graphiti UI/state and focused unit test in NineRouterConfigCard.test.tsx.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@src/components/settings/NineRouterConfigCard.tsx
@src/components/settings/McpConfigCard.tsx
@src/views/SettingsView.tsx
@tests/components/settings/McpConfigCard.test.tsx
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create unit test for NineRouterConfigCard verifying clean UI without Graphiti section</name>
  <files>tests/components/settings/NineRouterConfigCard.test.tsx</files>
  <behavior>
    - Test 1: Renders NineRouter API settings (endpoint, default model, character budget) and Image Generation settings.
    - Test 2: Does NOT render Graphiti MCP section title, endpoint input, or "Kiểm tra kết nối Graphiti MCP" button.
    - Test 3: Saves configuration without error and emits screen reader announcement for AI and image config only.
  </behavior>
  <action>
    Create tests/components/settings/NineRouterConfigCard.test.tsx with fake-indexeddb / in-memory TaskPlannerDatabase.
    Mock timerPopout isTauriApp as false.
    Verify that "Graphiti MCP" does not appear in document queries while NineRouter and Image Generation elements render as expected.
  </action>
  <verify>
    <automated>npm test -- tests/components/settings/NineRouterConfigCard.test.tsx</automated>
  </verify>
  <done>Failing test confirms presence of Graphiti elements in NineRouterConfigCard to be removed.</done>
</task>

<task type="auto">
  <name>Task 2: Remove Graphiti section, state, handlers, and imports from NineRouterConfigCard</name>
  <files>src/components/settings/NineRouterConfigCard.tsx</files>
  <action>
    In src/components/settings/NineRouterConfigCard.tsx:
    1. Remove unused imports: ClusterOutlined, ReloadOutlined from @ant-design/icons, and DEFAULT_GRAPHITI_MCP_ENDPOINT, getGraphitiMcpEndpoint, setGraphitiMcpEndpoint, testGraphitiMcpConnection from ../../services/ai/graphitiMcpClient.
    2. Remove Graphiti state variables: graphitiEndpoint, testingGraphiti, graphitiConnectionResult.
    3. In loadData useEffect: remove getGraphitiMcpEndpoint query and setGraphitiEndpoint call.
    4. In handleSaveConfig: remove setGraphitiMcpEndpoint call; update notification and screen reader messages to mention 9router and image generation only (omit Graphiti MCP).
    5. Remove handleTestGraphitiConnection handler.
    6. In JSX: remove the entire Graphiti MCP section (divider, title, paragraph, endpoint Form.Item with default reset button, connection alert, and test connection button).
    7. Ensure NineRouter and Image Generation sections, models, testing, and saving remain fully intact.
  </action>
  <verify>
    <automated>npm test -- tests/components/settings/NineRouterConfigCard.test.tsx tests/components/settings/McpConfigCard.test.tsx tests/views/SettingsView.test.tsx</automated>
  </verify>
  <done>NineRouterConfigCard renders cleanly without Graphiti section, and all related settings tests pass.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Settings UI -> Dexie DB | Settings persistence boundary |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-QUICK-01 | Tampering | db.settings | mitigate | Keep McpConfigCard as canonical editor for graphiti-banking server config; removal from NineRouterConfigCard avoids conflicting writes |
</threat_model>

<verification>
npm test -- tests/components/settings/NineRouterConfigCard.test.tsx tests/components/settings/McpConfigCard.test.tsx tests/views/SettingsView.test.tsx tests/ai/graphitiMcpClient.test.ts
</verification>

<success_criteria>
- Standalone Graphiti MCP UI section removed from NineRouterConfigCard.
- No unused Graphiti imports, states, or handlers in NineRouterConfigCard.
- McpConfigCard continues managing MCP servers including Graphiti Banking MCP.
- All related unit and integration tests pass.
</success_criteria>

<output>
Create .planning/quick/261017-iyd-remove-separate-graphiti-config-section-/SUMMARY.md when executed.
</output>
