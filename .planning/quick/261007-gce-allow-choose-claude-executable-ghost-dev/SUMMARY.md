---
task_id: 261007-gce
title: Allow choosing Claude Code executable in Ghost Dev configuration
status: complete
completed: "2026-10-07"
---

# Summary: Allow choosing Claude Code executable in Ghost Dev configuration

## Changes Implemented
1. `src/services/agents/ghostDevConfig.ts`:
   - Added `claudePath?: string` field to `GhostDevConfig` interface and `DEFAULT_GHOST_DEV_CONFIG` (defaults to empty string `''`).
   - Updated `getGhostDevConfig` and `setGhostDevConfig` to load, sanitize/trim, and persist `claudePath`.
2. `src/components/settings/GhostDevConfigCard.tsx`:
   - Added `claudePath` Form item with descriptive tooltip and placeholder.
   - Added "Duyệt tập tin..." (Browse file) button when running in Tauri to select the executable directly via native file picker dialog.
3. `src/components/agents/RunGhostDevModal.tsx`:
   - Included `claudePath: config.claudePath?.trim() || undefined` in `StartSessionPayload` passed to `start_ghost_dev_session`.
4. `src-tauri/src/agent_manager.rs`:
   - Added `pub claude_path: Option<String>` to `StartSessionPayload`.
   - Updated CLI resolution to prioritize: `payload.claude_path` -> `CLAUDE_PATH` env var -> default `"claude"`.
5. Targeted tests:
   - Added `tests/agents/ghostDevConfig.test.ts` verifying default behavior, persistence, and invalid input fallbacks.
   - Ran targeted Vitest tests for agent services (`ghostDevConfig.test.ts`, `promptBuilder.test.ts`, `agentSessionHistoryRepo.test.ts`). All passed.
