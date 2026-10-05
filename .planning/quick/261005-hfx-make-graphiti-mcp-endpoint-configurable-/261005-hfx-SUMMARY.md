---
phase: quick
plan: 261005-hfx
status: complete
date: 2026-10-05
commits:
  - 5596e35
  - 16e0241
  - 127990a
---

# Quick Task Summary: Make Graphiti MCP Endpoint Configurable and Inject SmartVista Dictionary Instructions

## Overview
Made the Graphiti MCP endpoint configurable via Dexie settings and the Settings > Trợ lý AI UI, with native Rust proxy validation for LAN/private IP safety. Injected official SmartVista banking domain dictionary rules into the AI Assistant system prompt covering `SVFE_SHB` and `MAIN1` schemas, mandatory workflow (`list_advertised_groups` first, explicit `group_ids`, foreign key query patterns), and anti-hallucination boundaries.

## Key Changes
1. **Rust Proxy Endpoint Validation (`src-tauri/src/ai_proxy.rs`)**:
   - Added `is_allowed_graphiti_target` supporting http (loopback / private LAN) and https.
   - Updated `graphiti_mcp_request` command to accept optional `endpoint`, defaulting to `http://10.4.97.70:30456/mcp`.
2. **TypeScript Client Configuration (`src/services/ai/graphitiMcpClient.ts`)**:
   - Added `getGraphitiMcpEndpoint`, `setGraphitiMcpEndpoint`, and `testGraphitiMcpConnection`.
   - Updated tool discovery and invocation to use configured endpoint reactively.
3. **Settings UI (`src/components/settings/NineRouterConfigCard.tsx`)**:
   - Added dedicated Graphiti MCP card section in Trợ lý AI settings.
   - Provided input for endpoint, Reset Default button, and Test Connection button with status badge and discovered tool count.
4. **SmartVista Domain Dictionary & MCP Workflow (`src/components/ai/AIChatDrawer.tsx`)**:
   - Injected domain dictionary for SmartVista CMS, payment switch, ISO 8583 message flows, response codes, and dispute/reconciliation terms.
   - Documented mandatory 4-step workflow: `list_advertised_groups` -> `search_nodes` with explicit `group_ids` -> `search_memory_facts` with `ForeignKeyTo` -> `get_catalog_object_context`.
5. **Unit Tests (`tests/ai/graphitiMcpClient.test.ts`, `tests/ai/AIChatDrawer.test.tsx`)**:
   - Added tests covering endpoint persistence, custom endpoint proxy calls, connection testing, and system prompt SmartVista grounding.

## Verification
- `npm test -- tests/ai/AIChatDrawer.test.tsx tests/ai/graphitiMcpClient.test.ts` passed (31/31 tests passing).
