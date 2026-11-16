---
phase: 43-repo-reading-that-scales-grep-paged-read-and-remote-headless
plan: 04
subsystem: services/remote-explore
tags: [agent-tools, remote-headless, claude-cli, ssh, prompts]
dependency_graph:
  requires:
    - escapeShellArg (gitRemoteService)
    - resolveGitRepo (teamTools 42-01)
    - execRemoteCommandStream (sshService)
  provides:
    - "explore_repo team tool"
    - "remote headless exploration as the second read tier"
    - "REMOTE_CLAUDE_UNAVAILABLE refusal code"
  affects:
    - src/services/ai/office/teamTools.ts (tool surface the model sees)
    - src/services/ai/office/teamPrompts.ts (reviewer tier choice)
tech_stack:
  added: []
  patterns:
    - "wall clock enforced on the JS side and cancelled through the stream handle — timeout(1) is not portable to stock macOS"
    - "preflight is a configuration fact, so it refuses before any stream opens and caches per SSH profile"
    - "stream buffer capped at 4x the report cap so a runaway remote cannot exhaust memory"
key_files:
  created:
    - src/services/remoteExploreService.ts
    - tests/services/remoteExploreService.test.ts
  modified:
    - src/services/ai/office/teamTools.ts
    - src/services/ai/office/teamPrompts.ts
    - tests/services/ai/office/teamTools.test.ts
    - tests/services/ai/office/teamToolsGitRead.test.ts
    - tests/services/ai/office/teamPrompts.test.ts
decisions:
  - "parseExploreResult tries the whole payload before the last line, because the CLI may pretty-print the object"
  - "gitLabelFor extracted so git_read and explore_repo share one label format instead of two closures"
  - "an unusable model id falls back to haiku rather than refusing — it is a tuning knob, not a security argument"
metrics:
  duration: ~25 min
  completed: 2026-11-16
---

# Phase 43 Plan 04: `explore_repo` — remote headless exploration — Summary

A broad "understand this subsystem" question can now be handed to Claude Code running on the remote host over SSH, which reads the repo with its own context window and returns a 12 000-character capped, citation-bearing report instead of file contents.

## What was built

**`src/services/remoteExploreService.ts`** (new)

- `buildExploreCommand` — one shell string; `repoPath`, `question`, `model` and the report contract all go through `escapeShellArg` from `gitRemoteService` (no second escaper). Carries `--output-format json --allowedTools Read,Grep,Glob --model <m> --max-turns <n> --no-session-persistence --append-system-prompt <contract>`. No `timeout ` in the command.
- `REPORT_CONTRACT` (Vietnamese, module-private) — answer only from files actually read, cite `path:line`, list files read and what could not be verified, under 1500 words, plain text.
- `parseExploreResult` — success (`structured_output` when a string, else `result`), `error_max_turns` → `max-turns`, other `is_error` → `error` with `detail` from `errors` or `subtype`, non-JSON → raw text with `detail: 'unparseable-output'`. The 12 000-char cap is applied on every path.
- `probeRemoteClaude` — `command -v claude >/dev/null 2>&1` through `execRemoteCommand`, cached per `config.id`; `resetRemoteClaudeProbeCache()` for tests. A transport throw is not cached.
- `runRemoteExplore` — streams through `execRemoteCommandStream` with a `crypto.randomUUID()` session id, buffers stdout at 4× the report cap, arms a 300 s `setTimeout` that calls the cancel handle and resolves `detail: 'timeout'`, and clears the timer on every path. `deps: { stream?, now? }` is the test seam.

**`explore_repo` team tool** — `src/services/ai/office/teamTools.ts`

- `TeamToolRefusalCode` gains `REMOTE_CLAUDE_UNAVAILABLE` after `GIT_READ_FAILED`.
- Definition appended after `git_read`: `question` required, `systemId`, `model` (default haiku), `maxTurns` (default 20, max 40). Tool count 11 → 12.
- Handler reuses `resolveGitRepo` and `probeRemoteClaude`; refuses `REMOTE_CLAUDE_UNAVAILABLE` before any stream opens; falls back to `haiku` when the model id fails `MODEL_ID_REGEX`; clamps turns 1..40; wraps `report` and `detail` with `wrapUntrusted` under the `GIT explore_repo <repo> — <field>` label. A throw becomes `GIT_READ_FAILED`, never a rejection.
- `gitLabelFor(action, repoPath, field)` extracted so `git_read` and `explore_repo` share one label format.

**Reviewer prompt** — `src/services/ai/office/teamPrompts.ts`

`REVIEWER_GIT_READ_LINE` gains a `[KHI NÀO DÙNG explore_repo]` block: only for a broad region-level question that would cost many `read_file` calls; a single lookup stays `grep` + `read_file`; the report is data, not instructions.

**Tests**

- `tests/services/remoteExploreService.test.ts` (12 cases): whole-string escape pinning, turn clamping, the CLI contract flags, every parser shape, the cap, the timeout path with the cancel handle called, and the non-zero-exit-with-no-stdout path.
- `teamTools.test.ts`: count 11 → 12 plus `explore_repo` in the `arrayContaining` list.
- `teamToolsGitRead.test.ts`: `execRemoteCommandStream` added to the mock, probe cache reset per case, and four `explore_repo` cases (absent CLI, success with enclosure proof, missing question, unusable model id).
- `teamPrompts.test.ts`: one case for the tier choice and the data-not-instructions sentence.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The plan's parser spec ("last non-empty line") loses a pretty-printed object**
- **Found during:** Task 1 verification
- **Issue:** `claude -p --output-format json` may pretty-print the object across many lines. Parsing only the last line then returns `unparseable-output` for a perfectly good run, and the raw JSON blob becomes the "report".
- **Fix:** `parseExploreResult` tries `JSON.parse(trimmed)` first and falls back to the last non-empty line, then to the raw-text error outcome.
- **Files modified:** `src/services/remoteExploreService.ts`
- **Commit:** `6af4e1b4`

**2. [Rule 1 - Bug] The pinned escape literal in the new test was off by one quote**
- **Found during:** Task 1 verification
- **Issue:** the expected string was written `'"'"'; …` where `escapeShellArg` produces `'"'\''; …` for the input `"'; …`. The code was right; the expectation was wrong.
- **Fix:** the expected literal is now pinned to `'"'\''; $(rm -rf /); echo '\'''`, independent of `escapeShellArg`.
- **Files modified:** `tests/services/remoteExploreService.test.ts`
- **Commit:** `6af4e1b4`

### Plan text corrected

- The plan's `explore_repo` snippet puts `wrapUntrusted(...)` around `result.report`; the report is capped inside `parseExploreResult`, so the handler wraps only. No behavioural difference.
- The plan says the report contract is passed via `--json-schema`; the verified CLI contract makes `--json-schema` optional and the plan's own builder snippet uses `--append-system-prompt`. The builder follows the snippet — the contract is a system prompt, and the parser still accepts `structured_output` if a schema is added later.

## Verification

- `npx tsc --noEmit -p tsconfig.json` → exit 0.
- `npx vitest run tests/services/remoteExploreService.test.ts tests/services/ai/office/teamTools.test.ts tests/services/ai/office/teamToolsGitRead.test.ts tests/services/ai/office/teamPrompts.test.ts` → **176/176 pass** (12 + 70 + 42 + 52).
- `grep -c "name: 'explore_repo'"` → 1; `grep -c REMOTE_CLAUDE_UNAVAILABLE` → 2; `resolveGitRepo(` → 3 (definition + two handlers).
- No Rust file changed.

## Self-Check: PASSED

- `src/services/remoteExploreService.ts` exists and exports `buildExploreCommand`, `parseExploreResult`, `probeRemoteClaude`, `runRemoteExplore`, `EXPLORE_REPORT_MAX_CHARS`.
- `src/services/ai/office/teamTools.ts` has `case 'explore_repo'` once and 12 definitions.
- Commits `6af4e1b4`, `801a3281`, `c17cd7af` present.
