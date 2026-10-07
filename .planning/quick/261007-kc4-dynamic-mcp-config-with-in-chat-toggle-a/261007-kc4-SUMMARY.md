---
phase: quick-261007-kc4
plan: 01
status: complete
date: 2026-10-07
subsystem: ai
tags:
  - mcp
  - ai-chat
  - dynamic-config
  - authors-fingerprint
dependency_graph:
  requires: []
  provides:
    - dynamic-multi-server-mcp
    - in-chat-mcp-toggle
    - sidebar-author-fingerprint
  affects:
    - src/components/shell/AppShell.tsx
    - src/services/ai/mcpClient.ts
    - src/services/ai/graphitiMcpClient.ts
    - src/components/ai/McpSettingsModal.tsx
    - src/components/ai/ChatHeader.tsx
    - src/components/ai/AIChatDrawer.tsx
actuals:
  tokens: 18000
  tasks: 3
  commits: 3
---

# Quick Plan 261007-kc4: Dynamic MCP Config with In-Chat Toggle and Authorship Fingerprint Summary

## Substantive One-liner
Configured dynamic multi-server HTTP MCP management with Dexie settings persistence, in-chat quick toggle popover in ChatHeader, and sidebar footer authorship fingerprint.

## Key Changes
1. **AppShell Sidebar Authorship Fingerprint**:
   - Configured Sider layout with sticky full-height column and independent scrollable navigation.
   - Added Sider footer rendering "v0.1.1 • Built by Quan Tran Duc" when expanded, and centered "QT" badge with tooltip "Built by Quan Tran Duc" when collapsed.
2. **Dynamic Multi-Server MCP Service (`mcpClient.ts`)**:
   - Added `McpServerConfig` interface with `id`, `name`, `url`, `enabled`, `instruction`, and `desktopOnly`.
   - Seeded default Graphiti Banking MCP with SmartVista domain instruction dictionary.
   - Built full CRUD operations (`getMcpServers`, `saveMcpServers`, `upsertMcpServer`, `deleteMcpServer`, `toggleMcpServer`).
   - Implemented `discoverAllMcpTools`, `executeDynamicMcpTool`, `getEnabledMcpInstructions`, and `testMcpServerConnection`.
   - Backward-compatibility delegation from `graphitiMcpClient.ts`.
3. **McpSettingsModal & ChatHeader In-Chat Toggle**:
   - Replaced static modal with full server CRUD and connection test feedback.
   - Added quick in-chat MCP toggle popover in ChatHeader with active server badge counter and shortcut to settings.
4. **AIChatDrawer Runtime Integration**:
   - Replaced hardcoded single Graphiti tool calls with `discoverAllMcpTools(db)` and `getEnabledMcpInstructions(db)`.
   - Dynamically routed non-local database tool calls to `executeDynamicMcpTool`.

## Verification
- Unit test suite passed: `npx vitest run src/services/ai/__tests__/mcpClient.test.ts` (7 tests passed).
- AI test suite passed: `npx vitest run src/services/ai/ --run` (28 tests passed).
- Production build verified: `npm run build` completed with zero TypeScript errors.

## Commits
- `b5c1cb9`: feat(ai): sidebar authorship fingerprint and dynamic mcp configuration service
- `0b653ef`: feat(ai): dynamic mcp settings modal with crud and in-chat toggle
- `18d65c7`: feat(ai): integrate dynamic multi-server mcp into AIChatDrawer runtime
