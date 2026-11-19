---
phase: 47-ssh-remote-explorer-ai-code-understanding
plan: 03
subsystem: ai-remote-read-tools
tags: [remote-target, dispatcher, git-read, ssh-fs, tool-gating, prompt-grounding, asvs-v4, read-only, vitest]

# Dependency graph
requires:
  - phase: 47-ssh-remote-explorer-ai-code-understanding
    provides: "47-01 remote:<uuid> scope + structured selection anchor; 47-02 one-shot initialLine tab params"
  - phase: 42-read-only-git-inspection
    provides: "git_read team tool, confineRepoPath/escapeShellArg bounds, D-11 untrusted-wrap precedent"
provides:
  - "Shared RemoteToolTarget (sshConfigId + repoPath + branch) threaded through the real drawer dispatcher chain"
  - "Explicit target wins over global config and model selectors in both SSH FS tools and git_read (ASVS V4)"
  - "Remote prompt-grounding serializer with bounded target identity + path:line anchors as data"
  - "Remote-turn tool gating: git_read advertised, SSH tools enabled without a global config"
  - "Remote scope auto-activation via registerActiveItem with manual customScope precedence"
affects:
  - "Phase 47 plans 04-05 (inline popover, path:line citations) — reuse remoteTarget and the remote grounding block"
  - "AI drawer send path, git_read/SSH FS dispatch, Prompt grounding (D-07)"

# Actuals (#2632) — same estimateTokens scale (chars/4 over the realized diff).
actuals:
  tokens: 11623
  tasks: 2
  commits: 2

# Measured commit range (#3968). The ledger base predates two parallel phase-45 commits that
# landed on this shared branch mid-execution; the two 47-03 task commits are 7780098e, a9974a9e.
commits: 4
plan_head_before: 4f16332b25a39815df063c806b980c7221c79ae5
plan_head_after: a9974a9efe9fb20995a59cdf3ed4be47c9f3813a

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Explicit remote target injected at ChatTurnRequest -> DispatchAiToolCallOptions (both call sites) -> ExecuteAiToolOptions; no target falls back to global config"
    - "git_read remote-turn dispatch via executeTeamTool with a target-bearing TeamToolContext and no team identity"
    - "Pure getToolsForTurnWithRemote helper makes remote gating (git_read advertisement, SSH-ready without global config) unit-testable"
    - "Remote grounding serialized as <item_context type='remote'> with untrusted leaves wrapped as data"

key-files:
  created:
    - tests/ai/chatTurnRemoteTarget.test.ts
    - .planning/phases/47-ssh-remote-explorer-ai-code-understanding/deferred-items.md
  modified:
    - src/types/sshFsTool.ts
    - src/services/ai/aiTools.ts
    - src/services/ai/sshFsToolService.ts
    - src/services/ai/office/teamTools.ts
    - src/services/ai/aiOrchestratorLoop.ts
    - src/components/ai/runtime/chatTurnRuntime.ts
    - src/services/ai/contextGrounding.ts
    - src/components/ai/AIChatDrawer.tsx
    - src/services/ai/chatTurnTools.ts
    - tests/ai/chatTurnTools.test.ts
    - tests/services/__tests__/gitRemoteReadPipeline.test.ts
    - tests/ai/chatTurnRuntime.test.ts
    - tests/ai/contextGrounding.test.ts

key-decisions:
  - "D-13 preserved in full: BOTH git_read and the SSH FS tools accept the explicit remote target; the target is threaded through the real drawer dispatcher chain, not only ExecuteAiToolOptions."
  - "D-14 is a one-way safety boundary: no write/redirect/patch tool and no headless explore_repo were added; escapeShellArg(14), confineRepoPath(6), shellQuote(3), isMutationTool(3) baselines unchanged."
  - "The scope target wins over model args and global config at both resolveSshConfig and resolveGitRepo; no fallback to another host or the local filesystem (ASVS V4)."
  - "Remote grounding is its own bounded shape, never cast to Task/System; untrusted leaves wrapped as data per the Phase 42 D-11 precedent."
  - "Remote scope auto-activates via registerActiveItem so a manual customScope still wins; no new panel or persisted remote scope (D-05/D-08)."
  - "D-01 isolation honored: no edit to shared .planning/ROADMAP.md or .planning/STATE.md."

patterns-established:
  - "Explicit-target precedence is enforced at the resolution seam (config lookup / repo resolver), not by trusting model-provided selectors."
  - "Remote-turn gating lives in a pure helper so security-critical tool advertisement is deterministically testable."

requirements-completed: [D-05, D-07, D-08, D-13, D-14]

# Coverage metadata (#1602) — one entry per shipped deliverable.
coverage:
  - id: D1
    description: "Explicit scope target reaches SSH tool config resolution and wins over the global config at the dispatch layer"
    requirement: D-13
    verification:
      - kind: unit
        ref: "tests/ai/chatTurnTools.test.ts#dispatchAiToolCall explicit remote target (Phase 47 D-13)"
        status: pass
    human_judgment: false
  - id: D2
    description: "git_read on a remote turn dispatches through the team adapter with the explicit target in TeamToolContext, overriding model selectors"
    requirement: D-13
    verification:
      - kind: unit
        ref: "tests/ai/chatTurnTools.test.ts#dispatches git_read on a remote turn through the team adapter with the explicit target"
        status: pass
    human_judgment: false
  - id: D3
    description: "ChatTurnRequest.remoteTarget reaches the dispatcher chain: loop options and executeToolFn dispatch options"
    requirement: D-13
    verification:
      - kind: unit
        ref: "tests/ai/chatTurnRemoteTarget.test.ts#injects request.remoteTarget into dispatchAiToolCall options from executeToolFn"
        status: pass
      - kind: unit
        ref: "tests/ai/chatTurnRuntime.test.ts#forwards request.remoteTarget into loop options"
        status: pass
    human_judgment: false
  - id: D4
    description: "Remote prompt grounds bounded target identity and path:line anchors as data, never a fake Task/System entity"
    requirement: D-07
    verification:
      - kind: unit
        ref: "tests/ai/contextGrounding.test.ts#serializeRemoteContext (Phase 47 D-07)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Remote turn advertises git_read and keeps SSH tools enabled with no global config; no other team tool leaks"
    requirement: D-13
    verification:
      - kind: unit
        ref: "tests/ai/chatTurnTools.test.ts#remote turn advertises git_read and keeps SSH tools with no global config"
        status: pass
    human_judgment: false
  - id: D6
    description: "Confinement/escape bounds unchanged: leading-dash branch/pattern and ../ path still refused"
    requirement: D-14
    verification:
      - kind: unit
        ref: "tests/services/__tests__/gitRemoteReadPipeline.test.ts#keeps a leading-dash branch as a revision, never an option"
        status: pass
    human_judgment: false
  - id: D7
    description: "Remote scope reuses drawer tabs and auto-activates via registerActiveItem with manual override (D-05/D-08)"
    requirement: D-05
    verification:
      - kind: other
        ref: "src/components/ai/AIChatDrawer.tsx#registerActiveItem effect (customScope ?? registeredTop ?? global); buildScopeKey remote:<uuid> reuse from 47-01"
        status: pass
    human_judgment: false
  - id: D8
    description: "Live SSH/Tauri walkthrough: a remote-scope cross-file question reads the looked-at host/repo/branch end to end"
    requirement: D-13
    verification: []
    human_judgment: true
    rationale: "No configured SSH remote host in this environment; mocked contract tests prove the wiring, not live host behavior. Live read-only walkthrough is manual UAT."

# Metrics
duration: 54min
completed: 2026-11-19
status: complete
---

# Phase 47 Plan 03: Explicit Remote Target & Remote-Scope Grounding Summary

**An explicit scope target threaded through the real drawer dispatcher chain so cross-file git/SSH reads hit exactly the looked-at host/repo/branch, with bounded remote prompt grounding and read-only tool gating intact**

## Performance

- **Duration:** 54 min
- **Started:** 2026-11-19T10:07:43Z
- **Completed:** 2026-11-19T11:02:30Z
- **Tasks:** 2 (1 tracer + 1 auto)
- **Files modified:** 14 code/test files + 2 created

## Accomplishments

- Added a shared `RemoteToolTarget` and threaded `remoteTarget` end-to-end: `ChatTurnRequest` → `DispatchAiToolCallOptions` (exported dispatcher and loop fallback) → `ExecuteAiToolOptions` → SSH FS tools and git_read.
- The scope target now WINS over the global config and model-supplied host/path/branch selectors in both `resolveSshConfig` and `resolveGitRepo`; no fallback to another host or the local filesystem (ASVS V4).
- `git_read` is advertised and dispatched on the ordinary remote drawer turn through the team adapter with a target-bearing `TeamToolContext` and no team identity; team-only callers are unchanged.
- Added a bounded remote prompt-grounding serializer (`<item_context type="remote">`) with target identity and `path:line` anchors as wrapped data, never a fabricated Task/System entity.
- Remote scope reuses the existing drawer tabs/threads, auto-activates via `registerActiveItem` (manual `customScope` still wins), and keeps SSH tools enabled with no global config.
- All read paths stayed read-only/confined/escaped/bounded; security baselines unchanged and no write tool or headless `explore_repo` added.

## Task Commits

Each task was committed atomically:

1. **Task 1 (tracer): explicit remote target through the dispatcher chain** — `7780098e` (feat)
2. **Task 2: remote-scope grounding, tool gating and drawer/tab reuse** — `a9974a9e` (feat)

_Note: Task 1 was a tracer. Its automated-only `<verify>` (tsc + two focused files) was re-run end-to-end after commit per the tracer feedback gate (interactive, `end-of-phase` mode) — it passed, then expansion to Task 2 proceeded._

**Plan metadata:** pending (orchestrator-owned docs commit)

The measured range `{plan_head_before}..HEAD` contains 4 commits: the two 47-03 task commits above plus two parallel phase-45 commits (`f8fe3197`, `4bb5ea0c`) that landed on this shared branch mid-execution; only the two listed are this plan's work.

## Files Created/Modified

- `src/types/sshFsTool.ts` — shared `RemoteToolTarget` type
- `src/services/ai/aiTools.ts` — `ExecuteAiToolOptions.remoteTarget` forwarded to the three SSH exec functions
- `src/services/ai/sshFsToolService.ts` — `resolveSshConfig(remoteTarget)` preference; no host/local-fs fallback; caps/escaping unchanged
- `src/services/ai/office/teamTools.ts` — `TeamToolContext.remoteTarget`, authoritative first-source in `resolveGitRepo`
- `src/services/ai/aiOrchestratorLoop.ts` — `DispatchAiToolCallOptions.remoteTarget`, git_read team-adapter routing, both dispatch sites
- `src/components/ai/runtime/chatTurnRuntime.ts` — `ChatTurnRequest.remoteTarget` forwarded into dispatch + loop options
- `src/services/ai/contextGrounding.ts` — bounded `serializeRemoteContext` with wrapped untrusted leaves
- `src/components/ai/AIChatDrawer.tsx` — remote grounding, `remoteTarget` on the real turn request, `registerActiveItem` scope activation
- `src/services/ai/chatTurnTools.ts` — pure `getToolsForTurnWithRemote` gating helper
- `tests/ai/chatTurnTools.test.ts`, `tests/services/__tests__/gitRemoteReadPipeline.test.ts`, `tests/ai/chatTurnRemoteTarget.test.ts` (new), `tests/ai/chatTurnRuntime.test.ts`, `tests/ai/contextGrounding.test.ts` — focused contract tests

## Decisions Made

- D-13 kept in full (git_read AND SSH FS tools with explicit target through the real dispatcher chain), per the locked CONTEXT decision — not narrowed to the SSH FS trio.
- The target overrides model args at the resolution seam rather than trusting or filtering arguments downstream, so there is a single authoritative source.
- Remote gating extracted into a pure helper so the security-critical "git_read only on remote, SSH ready without global config" behavior is deterministically testable.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Stale `ORACLE_READ_TOOLS` assertion blocked the verification gate**
- **Found during:** Task 1 (focused test run)
- **Issue:** `tests/ai/chatTurnTools.test.ts` asserted exactly two Oracle read tools, but the source (changed by parallel phase 45) has three (`oracle_list_connections` added). The stale assertion failed at HEAD and blocked Task 1's mandatory `<verify>`.
- **Fix:** Updated the assertion to the three actual read tools and renamed the test; no production behavior changed.
- **Files modified:** `tests/ai/chatTurnTools.test.ts`
- **Verification:** focused test file passes (task 1 + task 2 cases green).
- **Committed in:** `7780098e`

**2. [Rule 1 - Refactor] Unused `target` param naming missed an acceptance grep**
- **Found during:** Task 1 (acceptance criteria check)
- **Issue:** `sshFsToolService.ts` used a param named `target`, so `grep -c "remoteTarget" sshFsToolService.ts` was 0 against a required minimum of 1.
- **Fix:** Renamed the param/field to `remoteTarget` across `resolveSshConfig` and the three exec functions. Behavior unchanged.
- **Files modified:** `src/services/ai/sshFsToolService.ts`
- **Verification:** grep count now 10; typecheck and focused tests clean.
- **Committed in:** `7780098e`

---

**Total deviations:** 2 auto-fixed (both Rule 1 correctness/gate fixes). **Impact:** no scope creep and no contract change; one stale test assertion from a parallel phase and one naming fix to satisfy the plan's acceptance grep.

## Out-of-Scope Discoveries (logged, not fixed)

- `tests/ai/AIChatDrawerIsolation.test.tsx` has 8 failing cases at HEAD (verified by restoring HEAD source files and running it). Its send-path harness leaves `streamSignals`/`streamPayloads` empty under the current grounded-router setup. This pre-dates 47-03 and is unrelated to the remote-target wiring. Recorded in `deferred-items.md`; not modified here.

## Issues Encountered

- The plan's `<verify>` union command includes the pre-existingly-broken `AIChatDrawerIsolation.test.tsx`. The deterministic focused union for this plan's actual changes (5 files: `chatTurnTools`, `chatTurnRemoteTarget`, `chatTurnRuntime`, `contextGrounding`, `gitRemoteReadPipeline`) passes 107/107 with a clean `tsc --noEmit`.
- No blocking issues. No authentication gates. No package installs (zero dependencies added).

## User Setup Required

None — no external service configuration for the automated contract tests. A live SSH host is needed only for the manual UAT walkthrough (no configured remote here).

## Next Phase Readiness

- Plans 04-05 can reuse the `RemoteToolTarget` seam, remote grounding serializer, and one-shot `initialLine` tab param for the inline popover and `path:line` citation navigation.
- Live SSH/Tauri walkthrough remains a manual UAT item; automated mocked coverage records the contract.
- D-01 isolation honored: no edit to shared `ROADMAP.md` or `STATE.md`; orchestrator owns any tracking update.

## Self-Check: PASSED

- All created files exist (`tests/ai/chatTurnRemoteTarget.test.ts`, `deferred-items.md`, this SUMMARY).
- Both task commits (`7780098e`, `a9974a9e`) are ancestors of HEAD.
- Acceptance greps: `remoteTarget` in aiTools/sshFsToolService/aiOrchestratorLoop/chatTurnRuntime all ≥1; `remoteTarget`/`git_read`/`registerActiveItem` each present in AIChatDrawer.tsx.
- Security baselines unchanged: `escapeShellArg` 14, `confineRepoPath` 6, `shellQuote` 3, `isMutationTool` 3; no explore_repo/write tool added.
- Verification: `npx tsc --noEmit -p tsconfig.json` clean; focused union 107/107 pass; no file deletions in either task commit.

---
*Phase: 47-ssh-remote-explorer-ai-code-understanding*
*Completed: 2026-11-19*
