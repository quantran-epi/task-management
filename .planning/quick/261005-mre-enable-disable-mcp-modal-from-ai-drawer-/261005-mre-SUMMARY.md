---
phase: quick
plan: 261005-mre
status: complete
subsystem: ai
tags: [mcp, modal, ai-drawer, settings, graphiti]
key-files:
  created:
    - src/components/ai/McpSettingsModal.tsx
  modified:
    - src/services/ai/graphitiMcpClient.ts
    - src/components/ai/ChatHeader.tsx
    - src/components/ai/AIChatDrawer.tsx
    - tests/ai/graphitiMcpClient.test.ts
    - tests/ai/AIChatDrawer.test.tsx
decisions:
  - "MCP servers management is placed strictly in the ChatHeader 'Tùy chọn khác' dropdown menu to avoid header clutter"
  - "Disabling an MCP server excludes both its tool definitions and its domain instructions from the AI turn, with execution guarded at dispatch time"
  - "State persists in IndexedDB settings under 'graphiti_mcp_enabled' with default value true"
actuals:
  tasks: 3
  commits: 3
---

# Quick Task 261005-mre: Enable/Disable MCP Modal from AI Drawer Summary

## Objective
Add an MCP Server Management Modal accessible from the AI Drawer's header dropdown menu, allowing users to enable or disable MCP servers (starting with Graphiti MCP). When disabled, MCP tools and instructions are excluded from AI tool calls. Persistence is backed by IndexedDB settings.

## What Was Done

1. **Persistence Helpers in `graphitiMcpClient.ts`**
   - Added `isGraphitiMcpEnabled(db)` returning `true` by default when no setting exists.
   - Added `setGraphitiMcpEnabled(enabled, db)` saving boolean to `db.settings` under `graphiti_mcp_enabled`.
   - Clears session cache when disabled.
   - Added unit test suite in `tests/ai/graphitiMcpClient.test.ts`.

2. **`McpSettingsModal` and `ChatHeader` Trigger**
   - Created `McpSettingsModal.tsx` displaying configured MCP servers (Graphiti Banking MCP) with toggle `Switch`, endpoint badge, tag, and description.
   - Designed with an extensible array structure to easily accommodate future MCP servers.
   - Added `onOpenMcpSettings` prop to `ChatHeader.tsx` and dropdown menu item 'Quản lý máy chủ MCP' with `ApiOutlined` icon.

3. **Wiring into `AIChatDrawer.tsx` & Tool Execution Guarding**
   - Added state and modal rendering in `AIChatDrawer`.
   - Checked `await isGraphitiMcpEnabled(db)` before discovering tools in `handleSendMessage`: when disabled, tools are empty array and SmartVista instructions are omitted.
   - Added safety check in tool execution handler: if a Graphiti tool is invoked when disabled, execution is blocked and an error explanation is returned to the model.
   - Added unit tests in `tests/ai/AIChatDrawer.test.tsx` verifying dropdown trigger, prompt exclusion, and tool execution guarding.

## Verification
- `npm test tests/ai/graphitiMcpClient.test.ts` passed (14 tests).
- `npm test tests/ai/AIChatDrawer.test.tsx` passed (26 tests).
- `npx tsc --noEmit` passed with 0 errors.

## Commits
- `267c46e`: feat(quick-261005-mre): add mcp enabled persistence helpers to graphitiMcpClient
- `ae1ae7e`: feat(quick-261005-mre): create McpSettingsModal and header dropdown trigger
- `63d725b`: feat(quick-261005-mre): wire McpSettingsModal and exclude tools when disabled
