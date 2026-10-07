---
task_id: 261007-gce
title: Allow choosing Claude Code executable in Ghost Dev configuration
status: in_progress
created: "2026-10-07"
---

# Allow choosing Claude Code executable in Ghost Dev configuration

## Context
Currently, Ghost Dev spawns Claude Code with binary resolved only from environment variable `CLAUDE_PATH` or defaulting to `"claude"`.
Users need to be able to configure a custom Claude Code executable path or command (e.g. custom PATH, `C:\...\npm\claude.cmd`, `/usr/local/bin/claude`) in the Settings UI so Ghost Dev can use it when spawning the orchestration process.

## Changes
1. `src/services/agents/ghostDevConfig.ts`:
   - Add `claudePath?: string` to `GhostDevConfig`.
   - Update `DEFAULT_GHOST_DEV_CONFIG` with default empty string (fallback to default `claude`).
   - Update `getGhostDevConfig` & `setGhostDevConfig` to safely load/persist `claudePath`.
2. `src/components/settings/GhostDevConfigCard.tsx`:
   - Add form input for `claudePath` (Claude Code CLI Path / Executable).
   - In Tauri environment, provide a "Duyệt tập tin..." (Browse file) button using `browseLocalFile`.
3. `src/components/agents/RunGhostDevModal.tsx`:
   - Pass `claudePath: config.claudePath?.trim() || undefined` in `StartSessionPayload` to `start_ghost_dev_session`.
4. `src-tauri/src/agent_manager.rs`:
   - Add `pub claude_path: Option<String>` to `StartSessionPayload`.
   - In `start_ghost_dev_session`: resolve `claude_binary` prioritizing `payload.claude_path` -> `CLAUDE_PATH` env -> `"claude"`.
5. Targeted tests:
   - Add targeted unit tests for `ghostDevConfig.ts` verifying loading, saving, and defaults.
   - Run targeted tests only (no unrelated tests).
