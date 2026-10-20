---
phase: 22
slug: federated-mcp-knowledge-hybrid-tool-grounding
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-10-20
---

# Phase 22 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 5.0.2 |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npm test -- tests/ai/intentRouter.test.ts` |
| **Full suite command** | `npm test -- tests/ai/ tests/telegram/` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick test corresponding to the modified file
- **After every plan wave:** Run `npm test -- tests/ai/ tests/telegram/`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 22-01-01 | 01 | 1 | MCP-ROUTE-01 | T-22-01 | Zod strict validation on IntentResultSchema | unit | `npm test -- tests/ai/intentRouter.test.ts` | ✅ | ⬜ pending |
| 22-01-02 | 01 | 1 | MCP-ROUTE-01 | T-22-02 | Compact MCP capability summary without token explosion | unit | `npm test -- tests/ai/mcpClient.test.ts` | ✅ | ⬜ pending |
| 22-02-01 | 02 | 2 | MCP-FEDERATED-01 | T-22-03 | Fail-soft 15s timeout on MCP runner without hanging grounded turn | unit | `npm test -- tests/ai/mcpRetrievalRunner.test.ts` | ❌ W0 | ⬜ pending |
| 22-02-02 | 02 | 2 | MCP-FEDERATED-01 | T-22-04 | Parallel execution of Docs and MCP retrieval | integration | `npm test -- tests/ai/groundedTurn.test.ts` | ✅ | ⬜ pending |
| 22-02-03 | 02 | 2 | MCP-SYNTH-01 | T-22-05 | Pack M* citations with server authority and closure verification | unit | `npm test -- tests/ai/evidencePack.test.ts` | ✅ | ⬜ pending |
| 22-03-01 | 03 | 3 | MCP-SYNTH-01 | T-22-06 | Distinct MCP citation tag [M*] rendering in answer card and sources | unit | `npm test -- tests/ai/CitationChip.test.tsx` | ❌ W0 | ⬜ pending |
| 22-04-01 | 04 | 4 | MCP-TELE-01 | T-22-07 | Telegram bot scope-restricted dynamic MCP tool dispatch | integration | `npm test -- tests/telegram/telegramHeadlessWorker.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/ai/mcpRetrievalRunner.test.ts` — stubs for MCP runner timeout, loop termination, and result packing
- [ ] `tests/ai/CitationChip.test.tsx` — stubs for [M1] badge rendering with MCP server tag

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real live Graphiti Banking MCP response in Chat Drawer | MCP-FEDERATED-01 | Requires active local Tauri app and reachable Graphiti MCP server on VPN | 1. Enable Graphiti MCP in Settings<br>2. Open AI Chat Drawer<br>3. Ask "Bảng nào lưu thông tin thẻ trong SmartVista?"<br>4. Verify live MCP chips and citations render |
