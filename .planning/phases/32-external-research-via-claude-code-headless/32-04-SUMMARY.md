---
phase: 32-external-research-via-claude-code-headless
plan: "04"
subsystem: ai
tags: [research, ssh, streaming, orchestrator, timeout, cancellation]
dependency_graph:
  requires:
    - 32-03 (schemas, escapeShellArg, parseResearchOutput, checkResearchAvailability, ResearchRunError)
    - src/services/sshService.ts (getSshConfigById, execRemoteCommandStream, testSshConnection)
    - src/services/wizard/artifactRepo.ts (saveResearchArtifact)
    - src/services/wizard/workflowCoordinator.ts (defaultSha256)
  provides:
    - buildResearchPrompt
    - buildResearchCommand
    - renderResearchMarkdown
    - executeMultiSystemResearch
  affects:
    - 32-06 (UI step panel consumes the { promise, cancel } handle)
tech_stack:
  added: []
  patterns:
    - Closure-local cancel handle per run (no module-level active stream)
    - Promise + external settle guards (settled flag) for timeout/cancel races
    - Exact-string unit test as the only automated guard for remote command syntax
key_files:
  created: []
  modified:
    - src/services/ai/researchService.ts
    - src/services/ai/__tests__/researchService.test.ts
decisions:
  - "buildResearchCommand is the single place the remote command string is built; exec sits on claude, never on cd, so the captured PID is the real process"
  - "SSH failure maps to RESEARCH_SSH_ERROR from both a thrown execRemoteCommandStream and a non-null error on the exit event — a dropped connection never resolves with partial data"
  - "Cancel handle is closure-local (cancelActive inside executeMultiSystemResearch), so two concurrent runs cannot overwrite each other's handle"
  - "renderResearchMarkdown emits one bullet per finding carrying [EXTERNAL:WEB] or [EXTERNAL:REPO:{code}] plus source and confidence"
metrics:
  duration: "~8 min"
  completed: "2026-11-08T06:38:00Z"
  tasks: 1
  files: 2
---

# Phase 32 Plan 04: Research Run Orchestrator Summary

Sequential per-system headless Claude Code research over SSH with live line streaming, a 300s timeout, an idempotent cancel handle returned alongside the promise, explicit skipped-system reporting, and versioned RESEARCH artifact persistence.

## What Was Built

`src/services/ai/researchService.ts` gained the runtime half of the external research feature, extending (not rewriting) the pure half from plan 03:

- **`buildResearchPrompt(questions, systemCode)`** — names the target system, enumerates the questions, forbids file edits and write-side git commands, and pins the strict output shape `{ summary, findings: [{ claim, scope, source, confidence }] }` (D-04).
- **`buildResearchCommand(remoteRepoPath, prompt, includeWeb)`** — returns exactly `cd <escapeShellArg(path || '.')> && exec claude -p <escapeShellArg(prompt)> --output-format json --allowedTools <tools>`. `--allowedTools` is `WebSearch,WebFetch,Glob,Grep,Read`, or `Glob,Grep,Read` when `includeWeb` is false (D-13, T-32-04). `exec` is on `claude`, not `cd`, so the PID the Rust side captures is the claude process (D-02). No nested shell wrapper, so the single quotes from `escapeShellArg` reach the remote login shell intact (T-32-03).
- **`renderResearchMarkdown(payload)`** — summary section, one bullet per finding tagged `[EXTERNAL:WEB]` or `[EXTERNAL:REPO:{code}]` with source and confidence, plus skipped-systems and raw-output sections when present.
- **`executeMultiSystemResearch(options)`** — returns `{ promise, cancel }`; cancel is part of the return value, never a side channel.
  - Availability pre-flight via `checkResearchAvailability`; every unavailable target lands in `skippedSystems` and is `onLog`-ed as a Vietnamese line naming its code and reason (SDLC-RES-05).
  - All targets unavailable → rejects `RESEARCH_UNAVAILABLE`.
  - Sequential per-system: `getSystem` → `getSshConfigById` → `buildResearchCommand` → `execRemoteCommandStream`, accumulating stdout lines and `onLog`-ing each.
  - The stream cancel handle is a closure-local `cancelActive`, one per run, so concurrent runs cannot cancel each other (D-02).
  - SSH throw and non-null exit-event `error` both reject `RESEARCH_SSH_ERROR` after cancelling — a dropped connection never resolves with partial data (D-03).
  - 300s default timeout cancels the remote process and rejects `RESEARCH_TIMEOUT`; the timer is cleared on every settle path.
  - `cancel()` is idempotent and rejects `RESEARCH_CANCELLED`; no artifact is persisted on cancel or error.
  - Success persists one versioned artifact via `saveResearchArtifact` with `inputRevision: 0`, `draftRevision: 0`, `inputHash: defaultSha256(JSON.stringify(payload))`, and the rendered Markdown.

## Tests

`src/services/ai/__tests__/researchService.test.ts` — 26 tests total (14 from plan 03, 12 new):

- Exact remote command string for `'/srv/repo'` and `"Fix the 'auth' flow"`, plus `not.toContain('sh -c')` and `not.toMatch(/exec cd /)`.
- `includeWeb: false` ends the command with `--allowedTools Glob,Grep,Read`.
- Empty repo path falls back to `.`.
- Prompt names the system code, includes every question, and carries the no-edit rule.
- Markdown render tags web and repo findings.
- All targets unavailable → `RESEARCH_UNAVAILABLE`, no stream call, no persistence.
- Partially unavailable → resolves, `skippedSystems` names the missing system, `onLog` mentions its code.
- Timeout (`timeoutMs: 10`) → `RESEARCH_TIMEOUT` and the mocked cancel handle was invoked.
- SSH throw → `RESEARCH_SSH_ERROR`.
- Exit event with `error: 'connection reset'` → `RESEARCH_SSH_ERROR`, not a partial-data resolve.
- Success → tagged findings (`systemCode: 'CORE'`), one `saveResearchArtifact` call keyed by `changeRequestId` with a UUID `sessionId`.
- `cancel()` → `RESEARCH_CANCELLED`, remote cancel invoked exactly once, second `cancel()` is a no-op.

## Verification

- `npx vitest run src/services/ai/__tests__/researchService.test.ts` — 26/26 pass
- `npx tsc --noEmit` — exit 0

## Deviations from Plan

None — plan executed as written.

## Known Stubs

None.

## Threat Flags

None — the new surface (remote command construction, remote process lifecycle) is covered by T-32-02, T-32-03, and T-32-04 in the plan's threat model.

## TDD Gate Compliance

- RED: `f43cddbf` — `test(32-04): add failing tests for research command, markdown, and orchestrator` (12 failures before implementation)
- GREEN: `800b77f7` — `feat(32-04): add research prompt, remote command, markdown render, and multi-system orchestrator`

## Self-Check: PASSED

- `src/services/ai/researchService.ts` exists with all four exports
- `src/services/ai/__tests__/researchService.test.ts` exists with `describe('executeMultiSystemResearch`
- Commits `f43cddbf` and `800b77f7` present in `git log`
