---
phase: quick
plan: 261024-kq4
subsystem: ai
tags: [intent-router, zod, retry, mcp-routing, telegram]
requires: []
provides:
  - "IntentResultSchema requires require_mcp and target_mcp_servers"
  - "Retry repair prompt derived from INTENT_JSON_SCHEMA.required"
affects:
  - src/services/ai/intentRouter.ts
  - tests/ai/intentRouter.test.ts
tech-stack:
  added: []
  patterns:
    - "Schema-derived prompt content (single source of truth)"
key-files:
  created: []
  modified:
    - src/services/ai/intentRouter.ts
    - tests/ai/intentRouter.test.ts
decisions:
  - "Remove Zod defaults rather than post-validate: off-schema retry output now throws after 2 attempts, never silently disables MCP"
  - "Repair key list derived from INTENT_JSON_SCHEMA.required so prompt cannot drift from contract"
metrics:
  duration: ~10m
  completed: 2026-10-24
---

# Quick 261024-kq4: Fix Telegram intent router retry dropping MCP fields Summary

## One-liner

Intent schema now requires `require_mcp`/`target_mcp_servers` and the retry repair prompt is generated from `INTENT_JSON_SCHEMA.required`, so a 7-key retry payload throws instead of silently disabling MCP retrieval.

## What changed

**`src/services/ai/intentRouter.ts`**
- `IntentResultSchema`: removed `.default(false)` from `require_mcp` and `.default([])` from `target_mcp_servers`. Omission now fails `safeParse`.
- `routeIntent` retry branch: repair message key list interpolates `INTENT_JSON_SCHEMA.required.join(', ')` instead of a hardcoded 7-key string. Attempt budget (2), responseFormat, normalization, and ABORTED propagation unchanged.
- `INTENT_JSON_SCHEMA`, taxonomy, prompt examples untouched. Not exported.

**`tests/ai/intentRouter.test.ts`**
- Existing fixtures that intentionally omit MCP fields now carry `require_mcp: false, target_mcp_servers: []`, preserving their original assertions as pass-through (not defaulting).
- Replaced defaulting test with rejection test: 7-key payload fails and issues include paths `require_mcp` and `target_mcp_servers`.
- Retry test asserts call #2's last message contains both MCP keys.
- New regression test: attempt 1 `NineRouterClientError('TIMEOUT', ...)` + attempt 2 historical 7-key payload -> `IntentRouterUnavailableError` after exactly 2 calls.

## Verification

- `npx vitest run tests/ai/intentRouter.test.ts` — 11/11 pass (RED state observed first: exactly 3 failures).
- `npx tsc --noEmit` — clean.
- `groundedTurn.ts` untouched; its `as any` reads of both fields remain valid.

## Deviations from Plan

None - plan executed exactly as written.

## Commits

- `5960a7e`: `test(quick-261024-kq4): require MCP keys in intent schema and repair prompt`
- `e213b63`: `fix(quick-261024-kq4): require MCP fields and derive repair prompt from schema`
