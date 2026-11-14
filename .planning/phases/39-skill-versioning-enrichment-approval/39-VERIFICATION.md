---
phase: 39-skill-versioning-enrichment-approval
verified: 2026-11-14T09:45:00Z
status: passed
score: 6/6 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 6/6
  gaps_closed:
    - "UAT 1 — the evidence panel rendered above the decision buttons, pushing Chấp thuận/Từ chối down on every proposal carrying evidence. Moved below (d23ff037)."
    - "UAT 2 — the version-history list had no height bound, so 13 versions grew the drawer without limit. Bounded at maxHeight 320 / overflowY auto (d23ff037)."
  gaps_remaining: []
  regressions: []
deferred: []
human_verification: []
---

# Phase 39: Skill versioning + enrichment approval Verification Report

**Phase Goal:** An agent can propose a lesson, the user reviews it as a diff, and only an explicit approval creates a new skill version.
**Verified:** 2026-11-14T09:45:00Z
**Status:** passed
**Re-verification:** Yes — after UAT closure (`d23ff037`, `52fa8571`)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Skill CRUD works with validation, empty states, and error handling — no crash on network or AI failure. Leader/agent CRUD is Phase 40. | ✓ VERIFIED | `AiStaffExplorer.tsx:391` `ai-staff-skills-section`, header `Kỹ năng ({n})` :408, empty line `Chưa có kỹ năng nào` :410, create button `ai-staff-skill-create` :214 (aria-label `Thêm Kỹ năng`), single `createKind` source :43 driving all three drawers (:446, :453, :460). `SkillEditorDrawer` gates Save on `AiSkillInputSchema.safeParse` + `dirty` (:259-262, :273-277, :417), surfaces `skill-editor-save-error` (:433), catches every write (:294, :335, :372). Delete via the card's `Popconfirm` → `deleteSkill` → `refusalMessage()`. Skill CRUD is local-only, so the network clause is vacuous. Explorer + drawer suites pass. |
| 2 | After a run an agent can propose a lesson; the proposal changes nothing until approved. | ✓ VERIFIED | `propose_skill_version` is `TEAM_TOOL_DEFINITIONS[9]` (`teamTools.ts:204`), dispatched at :729 and advertised through `EMPLOYEE_TEAM_TOOLS` (`teamRunCoordinator.ts:1107`). Handler (:628-706) writes exactly one `pending` row through `createSkillVersion`, which throws unless `status === 'pending'` (`aiSkillVersionRepo.ts:125`). Test asserts one row, no `version` key, `aiSkills` untouched (`teamTools.test.ts:1108-1141`). |
| 3 | The user reviews the proposal as a diff and approves or rejects; approval creates exactly one new approved version and the previous stays retrievable. | ✓ VERIFIED | Two render sites recompute the diff from Dexie: `PendingSkillProposals.tsx:116` and `SkillEditorDrawer.tsx:208`, both feeding `PatchDiffApprovalCard`. Both call `decideSkillVersion(row.id, status, db, row.baseVersion ?? 0)` directly (`PendingSkillProposals.tsx:157`; `SkillEditorDrawer.tsx:292,333`). `decideSkillVersion` (`aiSkillVersionRepo.ts:149-239`) runs one `rw` over `[aiSkillVersions, aiSkills]`, numbers over approved rows only, snapshots the pre-approval row as v1 on first approval (:205-220), then overwrites `aiSkills`. History is view-only — no Restore affordance anywhere in the drawer. |
| 4 | No AI tool can write an approved version. | ✓ VERIFIED | `createSkillVersion` is the only insert path and throws on any non-`pending` status (`aiSkillVersionRepo.ts:124-125`). Only writers of `status: 'approved'` are `decideSkillVersion` (:212) and `updateSkill` (`aiOfficeRepo.ts:332,346`); callers are UI-only (`PendingSkillProposals.tsx:157`, `SkillEditorDrawer.tsx:292,333,362`). `propose_skill_version` is absent from `MUTATION_TOOLS` (`aiTools.ts:4722-4766`), so the read-only employee turn neither refuses nor parks it. `patch_artifact_section` returns a proposal and never writes `aiSkills`; `getToolsForTurn` excludes it unless an allowlist names it, and no allowlist does (`chatTurnTools.ts:74`). |
| 5 | Approving mid-batch does not change a running agent's skill — the assignment pins its version. | ✓ VERIFIED | Pin computed at dispatch (`teamRunCoordinator.ts:2882-2889`), inherited at amend (:2329, :2369), recomputed at retry (:3276-3283), carried on `AttemptRef` into `startEmployeeTurn` (:1871-1873), cleared on pin-less turns (:1842) and at finalize behind the identity guard (:1061). `read_skill` resolves the exact `[skillId+version]` row and requires `status === 'approved'` (`teamTools.ts:334-343`). `teamRunCoordinator.test.ts:6355-6372` proves the running agent still reads `# Bản 1` after v2 is approved; :6374-6390 proves the next attempt reads `# Bản 2`. |
| 6 | Skill bodies, including approved ones, are wrapped as untrusted data. | ✓ VERIFIED | All three paths wrap. `read_skill` wraps name, description and body (`teamTools.ts:362-364`). `buildEmployeeTurnRequest` wraps name and description and never sends the body (`teamPrompts.ts:75-76`). `propose_skill_version` returns `diffText: wrapUntrusted('BẢN KHÁC BIỆT ĐỀ XUẤT', diff.diffText)` (`teamTools.ts:704`). The regression test now asserts **enclosure**, not presence: the base-side body sits strictly between two tags sharing one nonce (`teamTools.test.ts:1128-1141`). Mutation-checked — reverting :704 to the raw diff fails that test. |

**Score:** 6/6 truths verified

### Deferred Items

None. No gap remains, so nothing required filtering against later phases.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/db/repositories/aiSkillVersionRepo.ts` | numbering at approval, aiSkills overwrite, approved-count reader, pending reader | ✓ VERIFIED | `listSkillVersions` :51, `getLatestApprovedVersionNumber` :69, `listPendingSkillVersions` :82, `createSkillVersion` :117, `decideSkillVersion` :149. Pending-only insert guard :124-125. |
| `src/types/aiOffice.ts` | optional version + baseVersion | ✓ VERIFIED | `baseVersion?: number \| undefined` at :136. |
| `src/validation/backupSchemas.ts` | optional version, new optional baseVersion | ✓ VERIFIED | `version` :698, `baseVersion` :700, `BACKUP_SCHEMA_VERSION = 13` :874. |
| `src/services/backup/validateBackup.ts` | duplicate-version guard skips unnumbered rows | ✓ VERIFIED | `if (version.version === undefined) continue;` :593. |
| `src/db/repositories/aiOfficeRepo.ts` | versioned updateSkill | ✓ VERIFIED | `db.transaction('rw', [db.aiSkills, db.aiSkillVersions]` :287; merged-row snapshot :341-355; baseline v1 snapshot :326-340; no-op early return :311-317. |
| `src/services/ai/office/teamTools.ts` | pinned read_skill, skillVersion on context, proposal tool, wrapped diff | ✓ VERIFIED | `skillVersion?: number \| undefined` :38; `resolvePinnedSkill` :330; `propose_skill_version` definition :204, handler :628, dispatch :729; `wrapUntrusted` import :13; wrapped `diffText` :704. |
| `src/services/ai/untrustedData.ts` | nonce-based untrusted-data boundary | ✓ VERIFIED | `wrapUntrusted` :42-58 mints a per-call 8-hex nonce and stamps both tags; `wrapField` :33. Ceiling documented :16-19. |
| `src/services/ai/office/teamRunCoordinator.ts` | pin computation, inheritance, recomputation, per-agent map | ✓ VERIFIED | `pinnedSkillVersion` :571; `toolContext` spread :1075-1082; three pin sites as listed under truth 5. |
| `src/services/ai/patchProposal.ts` | three-field skill diff builder | ✓ VERIFIED | `prepareSkillVersionDiff` :207-273; fixed `name → description → body` order :198; refusals `NO_CHANGES`/`PATCH_TOO_LARGE`/`DIFF_BUDGET_EXCEEDED`. |
| `src/services/ai/office/teamPrompts.ts` | amended read-only policy + wrapped description | ✓ VERIFIED | `propose_skill_version` named as the one permitted write :62; description wrapped :76; body never interpolated. |
| `src/components/ai/widget/PatchDiffApprovalCard.tsx` | skill variant, subtitle, evidence, staleReason | ✓ VERIFIED | Props :6-21; two `as const` copy maps :23-33; renders `patch.diffText` :54; bounded diff box :84; decision block :94-110; evidence panel **after** it :111-124. |
| `src/components/ai/office/PendingSkillProposals.tsx` | transcript extension with decided-row snapshot | ✓ VERIFIED | `recentlyDecided` :76; roster filter :82-89; `MAX_VISIBLE = 3` :24; recomputes diff from Dexie :116; `evidence={row.evidence}` :203. |
| `src/components/ai/office/SkillEditorDrawer.tsx` | pending section, version history, badge | ✓ VERIFIED | `skill-pending-section` :500, `skill-version-history` :572, bounded scroller :592, `skill-editor-pending-badge` :389; rejected rows render `Đề xuất bị từ chối` :620; date `DD/MM/YYYY HH:mm` :643. |
| `src/components/ai/office/SkillCard.tsx` | pending-count badge | ✓ VERIFIED | `pendingCount?: number \| undefined` :9; `{n} chờ duyệt` Tag :55-61. |
| `src/workbench/toolwindows/AiStaffExplorer.tsx` | Kỹ năng section + create button + drawer wiring | ✓ VERIFIED | `ai-staff-skills-section` :391; `ai-staff-skill-create` :214; drawer `createKind === 'skill'` :460. |
| `.planning/ROADMAP.md` | D-27/D-30 override on criterion 1 | ✓ VERIFIED | Phase 39 criterion 1 reads `Skill CRUD works with validation, empty states, and error handling … Leader/agent CRUD is Phase 40 (AIO-LEAD-01..04).` |
| `.planning/REQUIREMENTS.md` | D-30 override on AIO-SKILL-01 | ✓ VERIFIED | Struck-through original + `**Overridden by 39 D-27/D-30**`, checkbox unticked by design. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `decideSkillVersion` | `aiSkills` | `db.transaction('rw', [db.aiSkillVersions, db.aiSkills])` | ✓ WIRED | `aiSkillVersionRepo.ts:164`; rollback test at `aiSkillVersionRepo.test.ts:162`. |
| `updateSkill` | version row | same `rw` scope | ✓ WIRED | `aiOfficeRepo.ts:287`. |
| `AttemptRef.skillVersion` | `pinnedSkillVersion` map | `startEmployeeTurn` | ✓ WIRED | `teamRunCoordinator.ts:1871-1873`; map read in `toolContext` :1075. |
| `pinnedSkillVersion` | `read_skill` | `[skillId+version].equals(...)` | ✓ WIRED | `teamTools.ts:337-340`; no `.between(...).last()` range scan. |
| `propose_skill_version` | `createSkillVersion` | no `status` passed | ✓ WIRED | `teamTools.ts:689-693`. |
| `propose_skill_version` | untrusted-data boundary | `wrapUntrusted` on `diffText` | ✓ WIRED | `teamTools.ts:704`; enclosure test at `teamTools.test.ts:1128-1141`. |
| `PendingSkillProposals` | `decideSkillVersion` | direct call | ✓ WIRED | `PendingSkillProposals.tsx:157`. |
| `SkillEditorDrawer` | `decideSkillVersion` | direct call | ✓ WIRED | `SkillEditorDrawer.tsx:292, 333`. |
| `AiStaffExplorer` | `SkillEditorDrawer` | `createKind === 'skill'` | ✓ WIRED | `AiStaffExplorer.tsx:460`. |
| `TeamWorkspace` | `PendingSkillProposals` | `transcriptExtensions` | ✓ WIRED | `TeamWorkspace.tsx:763`. |
| `PatchDiffApprovalCard` (note path) | `AiChatWidget` | `turn.pendingApproval.patch` | ✓ WIRED | `AiChatWidget.tsx:485`; never passes `evidence` (0 matches), so the moved panel is unreachable on the note path. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `PendingSkillProposals` | `pending` | `listPendingSkillVersions(db)` live query :72 | Yes — Dexie `status = 'pending'` index | ✓ FLOWING |
| `PendingSkillProposals` | `approvedRows` | `db.aiSkillVersions.where('status').equals('approved')` :74 | Yes | ✓ FLOWING |
| `SkillEditorDrawer` | `versions` | `listSkillVersions(skill.id, db)` :185-190 | Yes | ✓ FLOWING |
| `SkillEditorDrawer` | `liveSkill` | `db.aiSkills.get(skill.id)` :94 | Yes | ✓ FLOWING |
| `AiStaffExplorer` | `pendingRows` | `db.aiSkillVersions.where('status').equals('pending')` :56 | Yes | ✓ FLOWING |
| `AiStaffExplorer` | `agentCountBySkill` | reduction over `employees` :76-84 | Yes | ✓ FLOWING |
| `read_skill` | `skill` | pinned `[skillId+version]` row, else `aiSkills` | Yes | ✓ FLOWING |
| `propose_skill_version` | `diffText` | `prepareSkillVersionDiff` over the pinned base row | Yes — real base content, wrapped | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Typecheck clean | `npx tsc --noEmit -p tsconfig.json` | exit 0, 0 errors | ✓ PASS |
| Approval card + drawer + transcript queue | `npx vitest run tests/ai/PatchDiffApprovalCard.test.tsx tests/components/ai/office/{SkillEditorDrawer,PendingSkillProposals}.test.tsx` | 3 files, 43 passed | ✓ PASS |
| Tool + coordinator + prompt + repos | `npx vitest run tests/services/ai/office/{teamTools,teamRunCoordinator,teamPrompts,aiSkillVersionRepo,aiOfficeRepo}.test.ts` | 5 files, 282 passed | ✓ PASS |
| Widget + view + explorer | `npx vitest run tests/ai/AiChatWidget.test.tsx tests/views/AiOfficeView.test.tsx tests/workbench/AiExplorers.test.tsx` | 3 files, 49 passed | ✓ PASS |
| Diff/runtime suites | `npx vitest run tests/services/ai/patchProposal.test.ts tests/ai/aiTools.test.ts tests/ai/chatTurnRuntime.test.ts tests/services/ai/aiOrchestratorLoop.test.ts tests/ai/chatTurnTools.test.ts` | 5 files, 184 passed | ✓ PASS |
| Backup + migration + parity + workspace | `npx vitest run tests/services/backup/{officeBackup,validateBackup,exportBackup}.test.ts tests/db/{schemaV26Migration,tableListParity}.test.ts tests/components/ai/office/TeamWorkspace{Receipts,Steer}.test.tsx` | 7 files, 103 passed | ✓ PASS |
| Architecture gate | `bash .planning/scripts/verify-team-chat-architecture.sh` | exit 0, incl. dead-module check | ✓ PASS |

Total: 23 scoped suites, 661 tests, all passing. Full suite not run (project rule: scoped only).

**UAT mutation checks (each fix reverted in isolation, then restored; `git status` clean afterwards):**

| Fix | Mutation | Result |
|-----|----------|--------|
| Evidence panel below buttons | Move the panel back above the decision block | ✗ `bounds the diff and keeps the decision buttons ahead of the evidence panel (UAT)` fails — the assertion bites |
| Diff box bounded | Remove `maxHeight` from the diff region | ✗ same test fails |
| History list bounded | Remove `maxHeight` + `overflowY` wrapper | ✗ `scrolls the version history instead of growing the drawer (UAT)` fails |
| `diffText` wrapped | Revert `teamTools.ts:704` to the raw diff | ✗ `writes exactly one pending row with no version key and returns a diff` fails — the nonce-enclosure assertion bites |

### Probe Execution

No `scripts/*/tests/probe-*.sh` files exist and no plan declares one. Step 7c: SKIPPED (no probe scripts in this project).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| AIO-SKILL-01 | 39-02, 39-06, 39-07 | Skill CRUD with validation, empty states, error handling (D-27/D-30 override) | ✓ SATISFIED | Explorer section, drawer validation, refusal Alert, empty line; explorer + drawer suites pass. |
| AIO-SKILL-02 | 39-01, 39-04 | Agent proposes a lesson; pending until approved | ✓ SATISFIED | `propose_skill_version` handler + tests; pending row has no `version`; `aiSkills` untouched. |
| AIO-SKILL-03 | 39-01, 39-02, 39-05, 39-06 | Diff review, approve/reject, one new approved version, previous retrievable | ✓ SATISFIED | Two render sites, `decideSkillVersion`, baseline v1 snapshot, view-only history. |
| AIO-SKILL-04 | 39-01, 39-04, 39-05 | No AI tool can write an approved version | ✓ SATISFIED | Pending-only insert guard; approved writers are UI-only; tool not in `MUTATION_TOOLS`. |
| AIO-SKILL-05 | 39-03 | Mid-batch approval does not change a running agent | ✓ SATISFIED | Pin on attempt + exact version lookup; mid-batch tests at `teamRunCoordinator.test.ts:6355-6390`. |
| AIO-SKILL-06 | 39-03, 39-04 | Skill bodies wrapped as untrusted data | ✓ SATISFIED | `read_skill` :362-364, `buildEmployeeTurnRequest` :75-76, `propose_skill_version` :704; enclosure test with nonce matching. |

No orphaned requirements: every AIO-SKILL ID in the ROADMAP list is claimed by at least one plan's `requirements` field, and no additional ID is mapped to Phase 39.

**Checkbox state (not a gap):** all six `AIO-SKILL-*` boxes are still `- [ ]` in `REQUIREMENTS.md`. The orchestrator's `phase.complete` step owns that write (`bin/lib/phase.cjs:1119-1125` rewrites `- [ ] **<ID>**` → `- [x]` for every ID on the phase's `**Requirements**:` line). Plan 39-07 deliberately left them unticked ("that happens at verification, not planning"). Nothing for the executor to fix; it resolves when the phase is marked complete.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `tests/ai/PatchDiffApprovalCard.test.tsx` | 154-155 | Asserts the diff box's style string contains `max-height` and `overflow-y` — the *keys*, not their values. Changing `overflowY: 'auto'` to `'visible'` still passes. | ⚠️ Warning | The property holds in code (`:84` sets `maxHeight: 240, overflowY: 'auto'`) and removing `maxHeight` does fail the test. The residual gap is that a non-scrolling value would slip through. |
| `tests/components/ai/office/SkillEditorDrawer.test.tsx` | 95-102 | Finds the scroller with `history.querySelector('div[style*="overflow-y"]')` (first match) and asserts row count document-wide, so it does not prove the rows are *inside* the bounded element. A decoy bounded div inserted before the list still passes (verified). | ⚠️ Warning | The property holds in code — rows are children of the bounded div at `SkillEditorDrawer.tsx:592-674`. The guard is weaker than the property it names. |
| `tests/components/ai/office/SkillEditorDrawer.test.tsx` | — | No assertion covers the `DD/MM/YYYY HH:mm` date cell (UAT item 2 lists it as expected content). | ℹ️ Info | Verified by inspection: `SkillEditorDrawer.tsx:643` formats `row.decidedAt` with dayjs `'DD/MM/YYYY HH:mm'`. Deterministic, not a visual-only property — just unasserted. |
| `src/services/ai/aiTools.ts` | 3332-3349, 4474, 4513-4517 | `query_recurring_tasks.description/notes`, `search_knowledge_base.snippet`, `get_document_details.body` still raw | ⚠️ Warning | Not skill bodies, so outside criterion 6. `query_recurring_tasks` and `search_knowledge_base` are in `EMPLOYEE_READ_ONLY_ALLOWLIST`, so they violate the module's own "each handler wraps its own body" contract (`teamTools.ts:426-428`). Carried over from review round 7 WR-01/WR-02; hardening backlog, not a phase-39 criterion. |
| `src/services/ai/untrustedData.ts` | 16-19 | Nonce is a 32-bit signal, not a cryptographic check | ℹ️ Info | Documented ceiling in the file. The real fix is a separate message channel. Not a criterion failure. |
| `src/components/ai/office/PendingSkillProposals.tsx` | 186 | `return null` when empty | ℹ️ Info | Legitimate empty render, not a stub. |

No `TBD`/`FIXME`/`XXX` markers in any file this phase touched (grep across all 15 source artifacts, exit 1).

### Shared-Component Regression Check (`PatchDiffApprovalCard`)

The card is used by three call sites; both fixes touched it, so each was re-checked:

| Call site | Passes `evidence`? | Affected by the move? | Status |
|-----------|--------------------|-----------------------|--------|
| `AiChatWidget.tsx:485` (note patch) | No — 0 matches for `evidence` in the file | No. The panel is conditional on a non-empty `evidence`, so the note path renders exactly as before. | ✓ Unchanged |
| `PendingSkillProposals.tsx:195` (transcript) | Yes — `:203` | Yes, and correctly: buttons now precede the panel. | ✓ Intended |
| `SkillEditorDrawer.tsx:516` (drawer) | Yes — `:526` | Yes, same intended effect. | ✓ Intended |

The bounded history list is drawer-only; no other surface renders it. `AiChatWidget.test.tsx` (note approve/reject), `PatchDiffApprovalCard.test.tsx` ("keeps the note decision copy when variant is omitted"), and `AiOfficeView.test.tsx` all pass unchanged.

### Human Verification Required

None. Both previously-outstanding visual items are now structurally asserted and mutation-checked:

1. **Card fold density** — the diff owns a bounded scroll box (`maxHeight: 240, overflowY: 'auto'`, `PatchDiffApprovalCard.tsx:84`), the decision buttons precede the evidence panel in document order (`:94-110` before `:111-124`), and the panel is collapsed by default (antd `Collapse` with no `defaultActiveKey`). Asserted at `PatchDiffApprovalCard.test.tsx:140-164`; reverting either half fails the test.
2. **Version-history overflow** — the list is wrapped in `maxHeight: 320, overflowY: 'auto'` (`SkillEditorDrawer.tsx:592`). Asserted at `SkillEditorDrawer.test.tsx:84-103` with 13 rows; removing the bound fails the test.

What jsdom cannot measure is the *rendered pixel density* — whether 240px of diff is comfortably readable and whether 320px of history is the right height. Those are taste calls on values the UI-SPEC already fixed (`39-UI-SPEC.md:56` pins the diff region at 240px). They are not acceptance criteria and do not block the phase.

### Gaps Summary

No gaps. The two UAT items were real defects, not false alarms: the evidence panel did sit above the decision buttons, and the history list did grow without bound. Both are fixed in `d23ff037`, both fixes are covered by tests that fail when reverted, and neither broke the note-patch path that shares the same card.

All six roadmap criteria and all six requirement IDs hold against the current code. `tsc --noEmit` exits 0, 23 scoped suites (661 tests) pass, and the team-chat architecture gate exits 0.

Three honest residual notes, none a criterion failure: two of the new assertions check that a CSS *key* is present rather than that its value scrolls (the values are correct in code), the history test does not prove row containment inside the scroller (the code does contain them), and the `DD/MM/YYYY HH:mm` cell is verified by inspection rather than by test.

---

_Verified: 2026-11-14T09:45:00Z_
_Verifier: Claude (gsd-verifier)_
