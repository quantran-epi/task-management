---
title: "Quick Task: Optimize AI Chat Pipeline (Drawer First)"
status: planned
date: 2026-10-20
slug: 261020-tif-optimize-ai-chat-pipeline
---

# Quick Task: Optimize AI Chat Pipeline (Drawer First)

## Goals
1. Optimize `mcpRetrievalRunner.ts` with Dynamic MCP Granularity Planner (domain-agnostic depth inspection rule, no hardcoding) and tool output pruning.
2. Optimize `AIChatDrawer.tsx` Operational Tool Loop with Contextual Tool Pruning (prune out personal task/timer tools when inspecting knowledge/technical fields).
3. Ensure knowledge queries find exact attributes/fields in Step 1 (or with minimal tokens in Step 2), reducing token explosion from 150k to ~10k-20k.
4. Verify tests pass without regression.

## Tasks
- [ ] Task 1: Update `mcpRetrievalRunner.ts` to include Dynamic MCP Granularity Rules and JSON output pruning.
- [ ] Task 2: Update `AIChatDrawer.tsx` to implement Contextual Tool Pruning before starting `streamChatEvents`.
- [ ] Task 3: Run existing unit tests & verify TypeScript build.
- [ ] Task 4: Complete GSD quick summary and commit.
