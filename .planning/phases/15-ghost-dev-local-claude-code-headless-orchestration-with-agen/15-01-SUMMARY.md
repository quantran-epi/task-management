# Phase 15 Plan 01: Core Agent Contracts, Git Diff Parser, Prompt Builder, and Shell Whitelist Summary

**One-liner:** Delivered core Ghost Dev TypeScript domain models, zero-dependency Git unified diff parser, Master and inline feedback prompt builders, and ASVS-compliant shell command whitelist with 100% unit test coverage.

## Frontmatter

- **phase:** 15-ghost-dev-local-claude-code-headless-orchestration-with-agen
- **plan:** 01
- **subsystem:** agents
- **tags:** [ghost-dev, multi-agent, git-diff, shell-whitelist, prompt-builder]
- **dependency_graph:**
  - **requires:** []
  - **provides:**
    - `src/types/agent.ts` (AgentSession, WorkerSession, GhostDevStreamChunk, DiffFile, DiffHunk, DiffLine)
    - `src/utils/gitDiffParser.ts` (parseGitDiff)
    - `src/utils/ghostDevPrompt.ts` (generateGhostDevMasterPrompt, formatInlineFeedbackPrompt)
    - `src/utils/shellWhitelist.ts` (SAFE_COMMAND_PREFIXES, isCommandWhitelisted)
  - **affects:**
    - Downstream Ghost Dev hooks (`useGhostDevStream`, `useGhostDevDiff`, `useGhostDevSessions`)
    - Downstream UI components (`AgentTerminalLog`, `AgentDiffReviewer`, `ShellPermissionModal`)
    - Downstream Tauri IPC command contracts (`src-tauri/src/agent_manager.rs`)
- **tech_stack:**
  - **added:** None (Zero external dependencies)
  - **patterns:**
    - Zero-dependency parser for Git unified diffs
    - Fenced Markdown feedback templates for inline diff comments (D-13)
    - Command chaining injection mitigation (STRIDE T-15-01 / ASVS V14.2)
- **key_files:**
  - **created:**
    - `src/types/agent.ts`
    - `src/utils/gitDiffParser.ts`
    - `src/utils/ghostDevPrompt.ts`
    - `src/utils/shellWhitelist.ts`
    - `tests/agents/gitDiffParser.test.ts`
    - `tests/agents/promptBuilder.test.ts`
    - `tests/agents/whitelist.test.ts`
  - **modified:** []
- **decisions:**
  - Strict injection rejection: `isCommandWhitelisted` forbids any command containing `;`, `&&`, `||`, or `|` to prevent shell evasion attacks before prefix validation.
  - Diff parser ignores `\ No newline at end of file` markers and handles multi-hunk offset recalculations deterministically.
- **metrics:**
  - **duration:** ~4 minutes
  - **completed_date:** 2026-10-05

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Define Agent contracts and build zero-dependency Git unified diff parser with unit test | `ecb01bd` | `src/types/agent.ts`, `src/utils/gitDiffParser.ts`, `tests/agents/gitDiffParser.test.ts` |
| 2 | Build Ghost Dev master prompt generator, inline feedback formatter, and shell whitelist with unit tests | `4dabe11` | `src/utils/ghostDevPrompt.ts`, `src/utils/shellWhitelist.ts`, `tests/agents/promptBuilder.test.ts`, `tests/agents/whitelist.test.ts` |
| Fix | Add required createdAt and updatedAt in test mock Task | `f57a37b` | `tests/agents/promptBuilder.test.ts` |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added missing createdAt and updatedAt properties to test Task fixture**
- **Found during:** Task 2 verification (`npx tsc --noEmit`)
- **Issue:** Mock `Task` in `tests/agents/promptBuilder.test.ts` lacked required `createdAt` and `updatedAt` properties, triggering TS2739.
- **Fix:** Provided valid ISO strings for `createdAt` and `updatedAt`.
- **Files modified:** `tests/agents/promptBuilder.test.ts`
- **Commit:** `f57a37b`

## Verification Results

- `npx vitest run tests/agents/gitDiffParser.test.ts tests/agents/promptBuilder.test.ts tests/agents/whitelist.test.ts`: Passed (3 test files, 8 tests, 0 failures).
- `npx tsc --noEmit`: Passed without any diagnostic errors.

## Self-Check: PASSED
- `src/types/agent.ts`: FOUND
- `src/utils/gitDiffParser.ts`: FOUND
- `src/utils/ghostDevPrompt.ts`: FOUND
- `src/utils/shellWhitelist.ts`: FOUND
- `tests/agents/gitDiffParser.test.ts`: FOUND
- `tests/agents/promptBuilder.test.ts`: FOUND
- `tests/agents/whitelist.test.ts`: FOUND
- Commits `ecb01bd`, `4dabe11`, `f57a37b`: FOUND in git log.
