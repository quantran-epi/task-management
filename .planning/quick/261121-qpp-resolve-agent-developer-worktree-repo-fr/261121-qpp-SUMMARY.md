# 261121-qpp — Resolve Agent Developer worktree repo từ CR-linked systems

**Status:** complete (3/3 tasks)
**Date:** 2026-11-21

## One-liner

Shared `listLinkedSystems` + `resolveAgentDeveloperWorktree` resolver: CR-target systems now auto-provision the Agent Developer worktree, and ambiguity is surfaced to the lead as framed names instead of a guessed path.

## Tasks & Commits

| Task | Commit | Files |
|------|--------|-------|
| 1 — extract linked-system helper + resolver | `eb10620e` | `src/services/ai/office/teamTools.ts`, `tests/services/ai/office/teamTools.test.ts` |
| 2 — ambiguity field + prompt block + coordinator glue | `4d3cd3b9` | `src/services/ai/office/teamPrompts.ts`, `src/services/ai/office/teamRunCoordinator.ts`, `tests/services/ai/office/teamPrompts.test.ts` |
| 3 — TeamWorkspace uses resolver at both sites | `f5efc9be` | `src/components/ai/office/TeamWorkspace.tsx`, `tests/components/ai/office/TeamWorkspaceWorktreeTarget.test.tsx` |

## What shipped

- `listLinkedSystems(teamId, db)` extracted from `resolveGitRepo`: direct `system` links + `cr.targets[].systemId`, deduped by `System.id`, missing rows skipped. `resolveGitRepo` behavior unchanged.
- `resolveAgentDeveloperWorktree(teamId, db)`: usable = system has BOTH `sshConfigId` and `remoteRepoPath`. Exactly 1 → auto-select. >1 → names only, no path, no worktree. 0 → empty result (existing refusal preserved).
- `BuildLeadTurnRequestInput.worktreeAmbiguitySegment` (pure builder), exported `WORKTREE_AMBIGUITY_LINE` (Vietnamese: ask user to name the system, never pick repo), positioned after `pinnedContextSegment`.
- `TeamRunCoordinatorOptions.worktreeAmbiguousSystems`: coordinator builds the segment with each name through `wrapUntrusted('TÊN HỆ THỐNG', name)` under `[CÁC HỆ THỐNG ỨNG VIÊN]`; no ssh/path reaches the prompt.
- `TeamWorkspace`: coordinator effect and Coding Zone chip both call the shared resolver; ambiguity names spread into coordinator options; `provisionAgentSession` / `codeEditGranted` / role gate / worktree lifecycle untouched; no per-turn resolution.

## Verification (scoped only, full suite never run)

- `vitest run tests/services/ai/office/teamTools.test.ts` → 78 passed, 1 failed (pre-existing, see Deviations). New resolver block: 5/5 passed.
- `vitest run tests/services/ai/office/teamPrompts.test.ts` → 65/65 passed.
- `vitest run tests/components/ai/office/TeamWorkspaceWorktreeTarget.test.tsx` → 4/4 passed.
- `tsc --noEmit` → clean after each task.

## Deviations from Plan

### Pre-existing failure (Rule: out of scope — left untouched)

**1. Stale tool-count assertion in `teamTools.test.ts`**
- Found during: Task 1 verification.
- Issue: `exposes the twelve team tool definitions` asserts `toHaveLength(12)` but `TEAM_TOOL_DEFINITIONS` has 13 entries — the 13th is `code_edit` added in Phase 48. Confirmed at HEAD (`git show HEAD:...` shows the same assertion and 12 literal `name:` entries plus `codeEditToolName`). Unrelated to this plan's changes.
- Action: not fixed. Plan explicitly says "KHÔNG đụng handler `code_edit`"; fixing the assertion is out of scope. All 5 new resolver tests pass; the failing case is isolated to the stale count.

### Test adjustments (implementation detail, no behavior change)

- TeamWorkspace ambiguity-name test asserts order-independent membership (`arrayContaining`) because `listTeamLinks` orders by `createdAt` and two links created in the same millisecond can swap. The resolver's contract is "list candidates", not a fixed order.
- Test system ids switched to `crypto.randomUUID()` because `addTeamLink`/`AiTeamLinkInputSchema` requires RFC 4122 v4 ids; the original fixture used a bare `'sys-1'`.

## Threat / safety note

Candidate system names enter the lead prompt only through `wrapUntrusted`; a test with a forged closing-tag delimiter confirms the injected text stays inside the wrapper. No `sshConfigId` or `remoteRepoPath` is emitted on the ambiguity path. Model still cannot select a repo — `options.agentDeveloperWorktree` remains the sole provisioning input.

## Success criteria check

- [x] CR-only link auto-selects the single usable system; no `WORKTREE_NOT_AVAILABLE` in that path.
- [x] Direct / CR / overlap dedupe by `System.id`.
- [x] 0 candidates → unchanged refusal; >1 → no selection, lead asks, names framed, no path.
- [x] Model never selects repo path.
- [x] Coding Zone chip and coordinator share one resolver.
- [x] Three scoped verify commands green (except documented pre-existing assertion); no full suite.
