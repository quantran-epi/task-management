---
phase: 22
plan: 01
subsystem: ai
tags: [mcp, intent-routing, dynamic-discovery]
requires: []
provides:
  - IntentResultSchema with require_mcp and target_mcp_servers
  - getEnabledMcpCapabilitySummaries function
  - Compact prompt injection for enabled MCP servers
affects:
  - src/services/ai/intentRouter.ts
  - src/services/ai/mcpClient.ts
  - tests/ai/intentRouter.test.ts
  - tests/ai/mcpClient.test.ts
tech-stack:
  added: []
  patterns:
    - Dynamic capability prompt injection capped to 10 servers and 10 tools per server
    - Backward-compatible Zod defaults for new intent fields
key-files:
  created:
    - tests/ai/mcpClient.test.ts
  modified:
    - src/services/ai/intentRouter.ts
    - src/services/ai/mcpClient.ts
    - tests/ai/intentRouter.test.ts
decisions:
  - "Default require_mcp to false and target_mcp_servers to [] for strict backward compatibility with existing tests and callers"
  - "Cap MCP capability server list to max 10 servers and 10 tools per server to avoid prompt blowup (T-22-02)"
metrics:
  duration: 8m
  completed_date: "2026-10-20"
---

# Phase 22 Plan 01: Dynamic MCP Server Discovery & Intent Routing Summary

Dynamic discovery of enabled MCP server capabilities with generic intent routing expansion across all enabled servers without hardcoded server IDs.

## Accomplishments

1. **IntentResultSchema Extended**: Added `require_mcp: boolean` and `target_mcp_servers: string[]` with backward-compatible defaults.
2. **Dynamic Capability Prompt Injection**: `buildSystemPrompt` appends `<enabled_mcp_servers>` section with ID, Name, Scope, and key tools capped at 10 items.
3. **Capability Summarizer**: Exported `getEnabledMcpCapabilitySummaries(db)` in `src/services/ai/mcpClient.ts` to extract compact summaries for enabled servers.
4. **Automated Verification**: Complete Vitest coverage in `tests/ai/intentRouter.test.ts` and `tests/ai/mcpClient.test.ts` (13 tests passed).

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED
- FOUND: src/services/ai/intentRouter.ts
- FOUND: src/services/ai/mcpClient.ts
- FOUND: tests/ai/intentRouter.test.ts
- FOUND: tests/ai/mcpClient.test.ts
- FOUND: 5885972 (Task 1 commit)
- FOUND: aba3a39 (Task 2 commit)
