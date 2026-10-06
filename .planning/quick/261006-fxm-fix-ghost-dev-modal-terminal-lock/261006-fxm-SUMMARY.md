---
phase: quick
plan: 261006-fxm
subsystem: agents
tags: [ghost-dev, modal, prompt, terminal, windows-lock]
status: complete
requires: []
provides:
  - Editable model input and VI/EN prompt language toggle in Ghost Dev trigger modal
  - Stream JSON result event and tool_result array unwrapping in AgentTerminalLog
  - Turn completion indicator showing duration and cost instead of stuck spinner
  - Windows worktree read-only clearing and diff hook debouncing to prevent file locks
affects:
  - src/components/agents/RunGhostDevModal.tsx
  - src/utils/ghostDevPrompt.ts
  - src/services/agents/ghostDevConfig.ts
  - src/components/agents/AgentTerminalLog.tsx
  - src-tauri/src/agent_manager.rs
  - src/hooks/useGhostDevDiff.ts
decisions:
  - Language toggle in modal only affects the generated prompt and extra instructions header sent to AI; modal UI labels remain in Vietnamese
metrics:
  tasks: 2
  completed_date: "2026-10-06"
---

# Quick Plan 261006-fxm: Ghost Dev Modal Inputs, Terminal Result Parsing, and File Lock Defense Summary

Fixed Ghost Dev trigger modal model inputs to editable inputs with arbitrary model name support, added VI/EN prompt template toggle, cleaned up raw JSON in terminal logs with proper completion status indicators, and added Windows file lock defenses.

## Tasks Completed

| Task | Name | Status | Files |
| ---- | ---- | ------ | ----- |
| 1 | Modal editable model inputs, arbitrary model ID support, and VI/EN prompt language switcher | Complete | `src/components/agents/RunGhostDevModal.tsx`, `src/utils/ghostDevPrompt.ts`, `src/services/agents/ghostDevConfig.ts`, `tests/agents/promptBuilder.test.ts` |
| 2 | Terminal result event parsing, tool_result unwrapping, completion indicator, and file lock defense | Complete | `src/components/agents/AgentTerminalLog.tsx`, `src-tauri/src/agent_manager.rs`, `src/hooks/useGhostDevDiff.ts`, `tests/agents/AgentTerminalLog.test.tsx` |

## Verification

Targeted tests executed and passed cleanly:
- `tests/agents/promptBuilder.test.ts`
- `tests/agents/AgentTerminalLog.test.tsx`
- `tests/agents/AgentControlView.test.tsx`
- `npx tsc --noEmit` passed with 0 errors.
