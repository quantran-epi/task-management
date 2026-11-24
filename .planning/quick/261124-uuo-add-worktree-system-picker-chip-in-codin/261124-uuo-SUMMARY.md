---
phase: quick
plan: 261124-uuo
subsystem: ui
tags: [react, antd, dexie, worktree, coordinator, runtime-only-override]

requires:
  - phase: 261121-qpp
    provides: resolveAgentDeveloperWorktree + live coordinator push (WR-02)
provides:
  - Header worktree-system picker shown when >1 usable linked system
  - Runtime-only override pushed into the alive coordinator; no AiTeam write
  - Refusal handling and stale-override invalidation
affects: [team-workspace, coding-zone, agent-developer worktree target]

tech-stack:
  added: []
  patterns: [runtime-only React state override for live coordinator, derived primitive effect deps, deterministic candidate key]

key-files:
  created: []
  modified:
    - src/components/ai/office/TeamWorkspace.tsx
    - tests/components/ai/office/TeamWorkspaceWorktreeTarget.test.tsx

key-decisions:
  - "Picker lives in TeamWorkspace header, not CodingZoneTrigger, so ambiguity can be resolved before a session exists."
  - "Selection is React state only; no Dexie/settings write, reload returns to resolver."
  - "Coordinator setter is called first; false result blocks override commit and shows fixed Vietnamese copy."
  - "Effective target primitives drive the existing push effect; candidateKey deterministic to avoid false invalidation."

patterns-established:
  - "Live override validation: derived overrideStillValid + candidateKey, clear stale override instead of pushing stale target."

requirements-completed: [WT-PICKER-CANDIDATES, WT-PICKER-OVERRIDE, WT-PICKER-REFUSAL, WT-PICKER-NO-PERSIST]

duration: ~8min
completed: 2026-11-24
---

# Quick 261124-uuo: Worktree system picker in TeamWorkspace Summary

**Header AntD Select resolves multi-system worktree ambiguity by pushing a runtime-only target into the alive coordinator, with refusal and stale-candidate guards**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-11-24T15:37:00Z
- **Completed:** 2026-11-24T15:45:37Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Picker in TeamWorkspace header using `listLinkedSystems` filtered to rows with both `sshConfigId` + `remoteRepoPath`, shown only when >1 candidate; options `name (code)`, no auto-select.
- Runtime override wins over resolver in all effective primitives (target, ambiguity key, Coding Zone descriptor) and is pushed through the existing coordinator effect (primitive deps only).
- Refusal path: `setAgentDeveloperWorktree(target) === false` sets fixed error copy and does not commit override; retry after success commits.
- Stale override cleared when the selected candidate disappears or its ssh/repo identity changes; coordinator receives `undefined` + restored ambiguity names.
- 4 new regression tests (10 total in file) covering picker visibility, live push/no persistence, refusal, invalidation.

## Task Commits

Không commit theo yêu cầu ràng buộc (workflow.use_worktrees=false, session refactor docs đang chạy). Không đụng STATE.md / ROADMAP.

## Files Created/Modified
- `src/components/ai/office/TeamWorkspace.tsx` - picker UI, override state/validation, effective target wiring, refusal copy.
- `tests/components/ai/office/TeamWorkspaceWorktreeTarget.test.tsx` - 4 new tests + harness (fireEvent/screen imports, `code` arg, `vi.clearAllMocks`).

## Decisions Made
- Used barrel `../../ui` `Select` (no new dependency), `value ?? null` for placeholder under `exactOptionalPropertyTypes`.
- Validation effect uses `candidateKey` (sorted identity strings) plus `overrideStillValid`; no array identity from liveQuery in push effect deps.
- Chat fallback (`teamRunCoordinator`), `CodingZoneTrigger.tsx`, `CodingZoneModal.tsx` unchanged.

## Deviations from Plan

None - plan executed as written. Minor test mechanics adjusted during RED/GREEN: AntD combobox queried by accessible name instead of raw `.ant-select-selector` (wrapper DOM), and assertion counts target-specific calls since the push effect legitimately sends `undefined` once before selection.

## Issues Encountered
- Plan verification path `tests/components/agents/__tests__/CodingZoneDiffPanel.test.tsx` does not exist; actual path `src/components/agents/__tests__/CodingZoneDiffPanel.test.tsx` used (9 passed).
- `tsc` initially flagged `value: string | undefined` and a typed `vi.fn()` tuple access; fixed in-scope with `?? null` and an explicit cast in the test.

## User Setup Required
None.

## Next Phase Readiness
Ready for sếp review UI trong Chrome. Scoped verification passed; no commit made, diff limited to 2 files.

## Verification

- `npx tsc --noEmit` — pass (no output).
- `npx vitest run tests/components/ai/office/TeamWorkspaceWorktreeTarget.test.tsx --bail=1` — 10/10 pass.
- `npx vitest run tests/services/ai/office/teamRunCoordinator.test.ts -t "ambiguity" --bail=1` — 1 pass, 209 skipped.
- `npx vitest run src/components/agents/__tests__/CodingZoneDiffPanel.test.tsx --bail=1` — 9/9 pass.
- `git diff --name-only` — exactly 2 plan files.

---
*Phase: quick*
*Completed: 2026-11-24*
