---
task: 261004-cct-context-char-limit-and-token-preview
description: Make AI context char limit freely configurable with estimated token preview and presets
date: 2026-10-04
status: in-progress
---

# Plan: Make AI Context Char Limit Freely Configurable with Token Preview

## Goal
Allow user to set any context character limit for AI grounding (from small local models up to large frontier models like Claude/GPT-4o), with a live estimated token equivalent preview (~1 token ≈ 4 characters) and convenient preset buttons.

## Changes
1. `src/components/settings/NineRouterConfigCard.tsx`:
   - Remove the restrictive `max={32000}` limit (allow up to e.g. 2,000,000 chars, min 1,000, or unbounded).
   - Display a live estimated token count: `~{Math.round(charLimit / 4).toLocaleString()} tokens (1 token ≈ 4 chars)`.
   - Provide quick preset tags/buttons for common model budgets:
     - 12k chars (~3k tokens, default / local small)
     - 32k chars (~8k tokens, local medium)
     - 128k chars (~32k tokens, cloud balanced)
     - 500k chars (~125k tokens, large context like GPT-4o / Claude)
     - 1M chars (~250k tokens, massive context)
   - Keep `DEFAULT_NINEROUTER_CHAR_LIMIT = 12000` as default fallback.
2. Verify / run tests to ensure no regressions.
