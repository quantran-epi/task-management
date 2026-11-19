---
phase: 47-ssh-remote-explorer-ai-code-understanding
plan: 01
subsystem: ai-chat-remote-scope
tags: [remote-scope, backup-validation, dexie, zod, scope-picker, selection-anchor, uuid, vitest]

# Dependency graph
requires:
  - phase: 31.2-data-model
    provides: "ChatScopeType union, buildScopeKey, chatTabRepo scope whitelist, backup schema versions"
  - phase: 42-read-only-git-inspection
    provides: "Remote target identity model and read-only remote explorer seams"
provides:
  - "ChatScopeType widened with 'remote' across all source whitelists (types, chatTabRepo, V20 repair set, backup Zod enum)"
  - "Stable target-derived v4 UUID for remote:<uuid> scope keys (deriveRemoteTargetUuid)"
  - "Remote target entry in the AI scope picker with UUID id, empty-state when no target"
  - "RemoteSelectionAnchor module (target/path/startLine/endLine/text) with DOM-to-line extractor"
  - "Remote selection mention formatting with relativeFilePath:startLine-endLine, no fake doc entity"
affects:
  - "Phase 47 plans 02-05 (explorer search, tool target injection, inline popover, citations)"
  - "backup export/import (chat scope enum), AIChatDrawer scope grounding"

# Actuals (#2632) — same estimateTokens scale (chars/4 over the realized diff).
actuals:
  tokens: 5252
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "remote:<v4-uuid> target-based scope key; entityId is a stable derived UUID, never a raw path/branch"
    - "Deterministic target UUID derivation (FNV-style hash shaped as RFC 4122 v4) so backup uuidSchema accepts it"
    - "Structured remote selection anchor resolved from its own payload, never via db.notes.get()"

key-files:
  created:
    - src/components/ai/RemoteSelectionAnchor.ts
    - src/utils/remoteTarget.ts
    - tests/ai/remoteScope.test.ts
  modified:
    - src/types/models.ts
    - src/db/repositories/chatTabRepo.ts
    - src/db/index.ts
    - src/validation/backupSchemas.ts
    - src/components/ai/ScopePickerModal.tsx
    - src/utils/selectionContext.ts
    - tests/ai/chatRepo.test.ts
    - tests/validation/backupSchemas.test.ts
    - tests/ai/ScopePickerModal.test.tsx
    - src/utils/selectionContext.test.ts

key-decisions:
  - "Remote is added alongside existing task/CR/system/document/team scopes; none replaced or narrowed (D-05/D-06/D-07)."
  - "Scope key is exactly remote:<v4-uuid>; target details (sshConfigId/repoPath/branch) resolve from live layout state, not the key (D-06, Pitfall 1)."
  - "A deterministic per-target UUID (deriveRemoteTargetUuid) supplies the same id to the scope picker and the selection anchor, so backup validation and anchor identity agree."
  - "V20 repair Set widened in place (no new Dexie version) — forward-safe, no applied migration semantics changed."
  - "Remote selection anchors never fabricate a doc entity; resolveEntityHierarchy('remote', ...) returns from the anchor payload without db.notes.get() (D-11, Pitfall 4)."
  - "D-01 isolation honored: no edit to .planning/ROADMAP.md or .planning/STATE.md."

patterns-established:
  - "Scope widening is atomic: type union + string whitelists + Zod enum + repair set, proven by one round-trip test."
  - "Target-derived UUID: stable hash with v4 version/variant nibbles, accepted by uuidSchema without storing target metadata in backup."

requirements-completed: [D-01, D-06, D-11]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "remote:<uuid> key survives buildScopeKey -> threadScopeParts -> backup schema -> restore without global fallback"
    requirement: D-06
    verification:
      - kind: unit
        ref: "tests/ai/remoteScope.test.ts#remote:<uuid> scope round-trip (Phase 47 D-06)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Non-UUID entityId (raw path) rejected by backup validation; backup still validates with remote thread"
    requirement: D-06
    verification:
      - kind: unit
        ref: "tests/validation/backupSchemas.test.ts#accepts a remote chat scope with a v4 UUID entityId but rejects a raw path"
        status: pass
    human_judgment: false
  - id: D3
    description: "Scope picker lists active remote target and selects it with a v4 UUID id; no entry without a target"
    requirement: D-06
    verification:
      - kind: unit
        ref: "tests/ai/ScopePickerModal.test.tsx#remote target scope (Phase 47 D-06)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Structured remote selection anchor carries target/path/startLine/endLine/text; mention includes path:line with no fake doc lookup"
    requirement: D-11
    verification:
      - kind: unit
        ref: "src/utils/selectionContext.test.ts#remote selection anchor (Phase 47 D-11)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Phase artifacts isolated: no edit to shared ROADMAP.md or STATE.md"
    requirement: D-01
    verification:
      - kind: other
        ref: "git diff-tree over plan commits — none touch .planning/ROADMAP.md or .planning/STATE.md"
        status: pass
    human_judgment: false

# Metrics
duration: 20min
completed: 2026-11-19
status: complete
plan_head_before: 13df631a938992a5d2dca7b608afb62a35f67cf9
plan_head_after: b5ad470a497233a4d8cbcba43892b855a9a1c90b
---

# Phase 47 Plan 01: Remote Chat Scope Foundation Summary

**Widened the chat scope system with a backup-safe `remote:<v4-uuid>` key, a stable target-UUID picker entry, and a structured remote selection anchor with `path:line` mentions**

## Performance

- **Duration:** 20 min
- **Started:** 2026-11-19T09:26:48Z
- **Completed:** 2026-11-19T09:47:19Z
- **Tasks:** 3 (1 tracer + 2 auto)
- **Files modified:** 13

## Accomplishments

- Made `remote` a first-class `ChatScopeType`: a `remote:<uuid>` thread now round-trips buildScopeKey -> threadScopeParts -> backup Zod enum -> restoreBackup without falling back to global.
- Added `deriveRemoteTargetUuid`, a deterministic RFC 4122 v4-shaped UUID from `{sshConfigId, repoPath, branch}` so scope ids never encode raw paths and pass the backup `uuidSchema` refine.
- Wired the AI scope picker to the live remote target from `layoutStore`: one entry with host/repo/branch title and a stable UUID id; no entry when no target is active.
- Added `RemoteSelectionAnchor` (target/path/startLine/endLine/text) plus a DOM-to-line extractor over the viewer's numbered-line divs, and `path:line` mention formatting with no fabricated doc entity.
- Kept all changes isolated to Phase 47 artifacts — shared ROADMAP.md/STATE.md untouched (D-01).

## Task Commits

Each task was committed atomically:

1. **Task 1 (tracer): `remote:<uuid>` scope round-trips across all whitelists** — `f3f1cbca` (feat)
2. **Task 2: Remote target entry in the scope picker** — `59d21055` (feat)
3. **Task 3: Structured remote selection anchor + mention formatting** — `b5ad470a` (feat)

**Plan metadata:** pending (orchestrator-owned docs commit)

_Note: Task 1 was a tracer; its end-to-end verify was re-run after commit per the tracer feedback gate (automated-only verify, end-of-phase mode) before expanding to Tasks 2-3._

## Files Created/Modified

- `src/types/models.ts` — `ChatScopeType += 'remote'`; scopeKey comment lists `remote:<uuid>`
- `src/db/repositories/chatTabRepo.ts` — `threadScopeParts` whitelist accepts remote (no global fallback)
- `src/db/index.ts` — V20 repair `Set` widened with `remote`
- `src/validation/backupSchemas.ts` — `BackupChatThreadRecordSchema` scopeType enum includes `remote`; document-only entityId refine unchanged
- `src/utils/remoteTarget.ts` (new) — deterministic target-derived v4 UUID
- `src/components/ai/ScopePickerModal.tsx` — remote tab, remote entry from layoutStore, icon, UUID select
- `src/components/ai/RemoteSelectionAnchor.ts` (new) — anchor shape, DOM extractor, payload converter
- `src/utils/selectionContext.ts` — `'remote'` entity type, remote hierarchy branch (no doc lookup), `path:line` mention header
- `tests/ai/remoteScope.test.ts` (new), `tests/ai/chatRepo.test.ts`, `tests/validation/backupSchemas.test.ts`, `tests/ai/ScopePickerModal.test.tsx`, `src/utils/selectionContext.test.ts` — focused contract tests

## Decisions Made

- Stable per-target UUID derivation instead of persisting a target-id row: backup entities must be UUIDs, and remote target details are intentionally resolved from live layout state (deferred-persistence semantics).
- V20 repair set widened in place rather than a new Dexie version: forward-safe, no applied-migration semantics changed.
- `resolveEntityHierarchy` gained an optional remote-context argument so a remote anchor resolves from its own payload, structurally preventing the fake-doc path.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test targeted the wrong DOM node after async re-render**
- **Found during:** Task 2 (scope picker tests)
- **Issue:** Clicking the first `/ssh-prod/` match returned a node detached by a later `useLiveQuery` re-render; `onSelectScope` was not called.
- **Fix:** Wait for an async-listed item to settle and click the exact unique title before asserting.
- **Files modified:** `tests/ai/ScopePickerModal.test.tsx`
- **Verification:** Focused test passes (6/6).
- **Committed in:** `59d21055`

**2. [Rule 1 - Bug] TS2869 unreachable `??` in anchor extractor**
- **Found during:** Task 3 (typecheck)
- **Issue:** `container.getAttribute('data-remote-path') ?? (... ?? '')` had an unreachable right operand under TS control-flow analysis.
- **Fix:** Simplified to a single `?? ''` chain.
- **Files modified:** `src/components/ai/RemoteSelectionAnchor.ts`
- **Verification:** `tsc --noEmit` clean.
- **Committed in:** `b5ad470a`

---

**Total deviations:** 2 auto-fixed (both Rule 1 bugs). **Impact on plan:** Both test/typecheck fixes only; no scope creep, no contract change.

## Issues Encountered

- None blocking. `test(\"narrows chat thread scopeType to cr and system\")` title predates this plan but still passes (it asserts cr/system acceptance plus project/milestone rejection; the new remote assertion lives in a separate test).

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Remote scope identity, backup safety, picker entry, and structured anchor are ready for Phase 47 plans 02-05 (explorer search, explicit remote tool target injection, inline popover, `path:line` citation navigation).
- Live SSH/Tauri walkthrough remains a manual UAT item (no configured remote host in this environment); automated contract evidence is recorded above.
- Orchestrator to own STATE.md/ROADMAP.md updates after all wave agents complete.

## Self-Check: PASSED

- All created files exist on disk (SUMMARY, RemoteSelectionAnchor.ts, remoteTarget.ts, remoteScope.test.ts).
- All three task commits verified as ancestors of HEAD (f3f1cbca, 59d21055, b5ad470a).
- Overall verification: `tsc --noEmit` clean; 5 focused test files, 50 tests passed.
- D-01 isolation: no plan commit touched .planning/ROADMAP.md or .planning/STATE.md.

---
*Phase: 47-ssh-remote-explorer-ai-code-understanding*
*Completed: 2026-11-19*
