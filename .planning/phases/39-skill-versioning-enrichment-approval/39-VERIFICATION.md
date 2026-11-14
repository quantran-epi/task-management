---
phase: 39-skill-versioning-enrichment-approval
verified: 2026-11-14T09:27:05Z
status: human_needed
score: 6/6 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 5/6
  gaps_closed:
    - "Skill bodies, including approved ones, are wrapped as untrusted data (AIO-SKILL-06) — `propose_skill_version` now returns `diffText` through `wrapUntrusted` (teamTools.ts:704); probe confirms the base body and a forged closing tag both land inside a nonce-matched block."
  gaps_remaining: []
  regressions: []
deferred: []
human_verification:
  - test: "Open the AI Staff chat, trigger a skill proposal with a long diff, and read the card in the transcript."
    expected: "The diff is legible, Approve/Reject are reachable without scrolling past the fold, and the evidence panel is collapsed by default."
    why_human: "Visual density and fold position are not assertable in jsdom."
  - test: "Create 10+ versions for one skill, then open the drawer's `Lịch sử phiên bản` section."
    expected: "The list scrolls, each row shows number (or `Đề xuất bị từ chối`), name, DD/MM/YYYY HH:mm and status, and no row is duplicated."
    why_human: "List density and overflow behaviour are visual."
---

# Phase 39: Skill versioning + enrichment approval Verification Report

**Phase Goal:** An agent can propose a lesson, the user reviews it as a diff, and only an explicit approval creates a new skill version.
**Verified:** 2026-11-14T09:27:05Z
**Status:** human_needed
**Re-verification:** Yes — after gap closure (commit `1ce3cb44`)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Skill CRUD works with validation, empty states, and error handling — no crash on network or AI failure. Leader/agent CRUD is Phase 40. | ✓ VERIFIED | `AiStaffExplorer.tsx:391` `ai-staff-skills-section`, empty line `Chưa có kỹ năng nào` (:410), create button `ai-staff-skill-create` (:214), `createKind` single drawer source (:43), drawer at `:460`. `SkillEditorDrawer` gates Save on `AiSkillInputSchema.safeParse` + `dirty` (:260, :273, :417), surfaces `skill-editor-save-error` (:433), catches every write (:294, :335, :372). Delete via `Popconfirm` → `deleteSkill` → `refusalMessage()`. Skill CRUD is local-only, so the network clause is vacuous. Explorer + drawer suites pass. |
| 2 | After a run an agent can propose a lesson; the proposal changes nothing until approved. | ✓ VERIFIED | `propose_skill_version` is `TEAM_TOOL_DEFINITIONS[9]` (`teamTools.ts:204`), reachable through `executeTeamTool` (:729) and advertised to employees via `EMPLOYEE_TEAM_TOOLS` (`teamRunCoordinator.ts:1107`). Handler (:628-706) writes exactly one `pending` row through `createSkillVersion`, which throws unless `status === 'pending'` (`aiSkillVersionRepo.ts:125`). Probe: one row, no `version` key, `aiSkills` untouched. |
| 3 | The user reviews the proposal as a diff and approves or rejects; approval creates exactly one new approved version and the previous stays retrievable. | ✓ VERIFIED | Two render sites recompute the diff from Dexie: `PendingSkillProposals.tsx:116` and `SkillEditorDrawer.tsx:208`, both feeding `PatchDiffApprovalCard`. Both call `decideSkillVersion(row.id, status, db, row.baseVersion ?? 0)` directly (`PendingSkillProposals.tsx:157`; `SkillEditorDrawer.tsx:292,333`). `decideSkillVersion` (`aiSkillVersionRepo.ts:149-239`) runs one `rw` over `[aiSkillVersions, aiSkills]`, numbers over approved rows only, snapshots the pre-approval row as v1 on first approval (:205-220), then overwrites `aiSkills`. History is view-only (D-12). |
| 4 | No AI tool can write an approved version. | ✓ VERIFIED | `createSkillVersion` is the only insert path and throws on any non-`pending` status (`aiSkillVersionRepo.ts:124-125`). Only writers of `status: 'approved'` are `decideSkillVersion` (`aiSkillVersionRepo.ts:164`) and `updateSkill` (`aiOfficeRepo.ts:287`); callers are UI-only (`PendingSkillProposals.tsx:157`, `SkillEditorDrawer.tsx:292,333,362`). `propose_skill_version` is absent from `MUTATION_TOOLS` (`aiTools.ts:4722-4765`), so the read-only employee turn neither refuses nor parks it. `patch_artifact_section` returns a proposal and never writes `aiSkills`; it is not advertised to any team agent (`getToolsForTurn` excludes it unless an allowlist names it, and no allowlist does — `chatTurnTools.ts:74`, `:15-51`). |
| 5 | Approving mid-batch does not change a running agent's skill — the assignment pins its version. | ✓ VERIFIED | Pin computed at dispatch (`teamRunCoordinator.ts:2882-2889`), inherited at amend (:2329, :2369), recomputed at retry (:3276-3283), carried on `AttemptRef` into `startEmployeeTurn` (:1871-1873), cleared on pin-less turns (:1842) and at finalize behind the identity guard (:1061). `read_skill` resolves the exact `[skillId+version]` row and requires `status === 'approved'` (`teamTools.ts:334-343`). `teamRunCoordinator.test.ts:6355-6385` proves the running agent still reads `# Bản 1` after v2 is approved and the next attempt reads `# Bản 2`. |
| 6 | Skill bodies, including approved ones, are wrapped as untrusted data. | ✓ VERIFIED | All three paths now wrap. `read_skill` wraps name, description and body (`teamTools.ts:362-364`). `buildEmployeeTurnRequest` wraps name and description and never sends the body (`teamPrompts.ts:70-78`). `propose_skill_version` now returns `diffText: wrapUntrusted('BẢN KHÁC BIỆT ĐỀ XUẤT', diff.diffText)` (`teamTools.ts:704`). Probe against the real handler: the only result field carrying the approved body is `diffText`; the marker sits at offset 336 and a forged closing tag at 360, both between open (1) and close (480), and both tags carry the same nonce `dcea60ba`. |

**Score:** 6/6 truths verified

### Deferred Items

None. No gap remains, so nothing required filtering against later phases.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/db/repositories/aiSkillVersionRepo.ts` | numbering at approval, aiSkills overwrite, approved-count reader, pending reader | ✓ VERIFIED | `listSkillVersions` :51, `getLatestApprovedVersionNumber` :69, `listPendingSkillVersions` :82, `createSkillVersion` :117, `decideSkillVersion` :149. Pending-only insert guard at :124-125. |
| `src/types/aiOffice.ts` | optional version + baseVersion | ✓ VERIFIED | `baseVersion?: number | undefined` at :136. |
| `src/validation/backupSchemas.ts` | optional version, new optional baseVersion | ✓ VERIFIED | `version` :698, `baseVersion` :700, `BACKUP_SCHEMA_VERSION = 13` :874. |
| `src/services/backup/validateBackup.ts` | duplicate-version guard skips unnumbered rows | ✓ VERIFIED | `if (version.version === undefined) continue;` :593. |
| `src/db/repositories/aiOfficeRepo.ts` | versioned updateSkill | ✓ VERIFIED | `db.transaction('rw', [db.aiSkills, db.aiSkillVersions]` :287; merged-row snapshot :341-355; baseline v1 snapshot :326-340; no-op early return :311-317. |
| `src/services/ai/office/teamTools.ts` | pinned read_skill, skillVersion on context, proposal tool, wrapped diff | ✓ VERIFIED | `skillVersion?: number | undefined` :38; `resolvePinnedSkill` :330; `propose_skill_version` definition :204, handler :628, dispatch :729; `wrapUntrusted` import :13; wrapped `diffText` :704. |
| `src/services/ai/untrustedData.ts` | nonce-based untrusted-data boundary | ✓ VERIFIED | `wrapUntrusted` :42-58 mints a per-call 8-hex nonce and stamps both tags; `wrapField` :33. Ceiling documented :16-19. Zero imports. |
| `src/services/ai/office/teamRunCoordinator.ts` | pin computation, inheritance, recomputation, per-agent map | ✓ VERIFIED | `pinnedSkillVersion` :571; `toolContext` spread :1075-1082; three pin sites as listed under truth 5. |
| `src/services/ai/patchProposal.ts` | three-field skill diff builder | ✓ VERIFIED | `prepareSkillVersionDiff` :207-273; fixed `name → description → body` order :198; refusals `NO_CHANGES`/`PATCH_TOO_LARGE`/`DIFF_BUDGET_EXCEEDED`. |
| `src/services/ai/office/teamPrompts.ts` | amended read-only policy + wrapped description | ✓ VERIFIED | `propose_skill_version` named as the one permitted write :62; description wrapped :76; body never interpolated. |
| `src/components/ai/widget/PatchDiffApprovalCard.tsx` | skill variant, subtitle, evidence, staleReason | ✓ VERIFIED | Props :18-47; two `as const` copy maps :23-33; renders `patch.diffText` :54. |
| `src/components/ai/office/PendingSkillProposals.tsx` | transcript extension with decided-row snapshot | ✓ VERIFIED | `recentlyDecided` :76; roster filter :82-89; `MAX_VISIBLE = 3` :24; recomputes diff from Dexie :116. |
| `src/components/ai/office/SkillEditorDrawer.tsx` | pending section, version history, badge | ✓ VERIFIED | `skill-pending-section` :500, `skill-version-history` :572, `skill-editor-pending-badge` :389; rejected rows render `Đề xuất bị từ chối` :618. |
| `src/components/ai/office/SkillCard.tsx` | pending-count badge | ✓ VERIFIED | `pendingCount?: number | undefined` :9; `{n} chờ duyệt` Tag :55-61. |
| `src/workbench/toolwindows/AiStaffExplorer.tsx` | Kỹ năng section + create button + drawer wiring | ✓ VERIFIED | `ai-staff-skills-section` :391; `ai-staff-skill-create` :214; drawer `createKind === 'skill'` :460. |
| `.planning/ROADMAP.md` | D-27/D-30 override on criterion 1 | ✓ VERIFIED | Phase 39 criterion 1 reads "Skill CRUD works with validation, empty states, and error handling … Leader/agent CRUD is Phase 40". |
| `.planning/REQUIREMENTS.md` | D-30 override on AIO-SKILL-01 | ✓ VERIFIED | Struck-through original + "Overridden by 39 D-27/D-30", checkbox left unticked. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `decideSkillVersion` | `aiSkills` | `db.transaction('rw', [db.aiSkillVersions, db.aiSkills])` | ✓ WIRED | `aiSkillVersionRepo.ts:164`; rollback test at `aiSkillVersionRepo.test.ts:162`. |
| `updateSkill` | version row | same `rw` scope | ✓ WIRED | `aiOfficeRepo.ts:287`. |
| `AttemptRef.skillVersion` | `pinnedSkillVersion` map | `startEmployeeTurn` | ✓ WIRED | `teamRunCoordinator.ts:1871-1873`; map read in `toolContext` :1075. |
| `pinnedSkillVersion` | `read_skill` | `[skillId+version].equals(...)` | ✓ WIRED | `teamTools.ts:337-340`; `.between(...).last()` absent. |
| `propose_skill_version` | `createSkillVersion` | no `status` passed | ✓ WIRED | `teamTools.ts:689-693`. |
| `propose_skill_version` | untrusted-data boundary | `wrapUntrusted` on `diffText` | ✓ WIRED | `teamTools.ts:704`; probe confirms nonce-matched block encloses the base body and a forged tag. |
| `PendingSkillProposals` | `decideSkillVersion` | direct call | ✓ WIRED | `PendingSkillProposals.tsx:157`. |
| `SkillEditorDrawer` | `decideSkillVersion` | direct call | ✓ WIRED | `SkillEditorDrawer.tsx:292, 333`. |
| `AiStaffExplorer` | `SkillEditorDrawer` | `createKind === 'skill'` | ✓ WIRED | `AiStaffExplorer.tsx:460`. |
| `TeamWorkspace` | `PendingSkillProposals` | `transcriptExtensions` | ✓ WIRED | `TeamWorkspace.tsx:763-768`. |

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
| `propose_skill_version` | `diffText` | `prepareSkillVersionDiff` over the pinned base row | Yes — real base content, now wrapped | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Typecheck clean | `npx tsc --noEmit -p tsconfig.json` | exit 0, 0 errors | ✓ PASS |
| Proposal result wraps the base body (real handler) | Probe: `executeTeamTool('propose_skill_version', …)` with `BÍ-MẬT-TOÀN-BỘ-BODY-42` + a forged close tag in the approved body | `PROBE_FIELDS=["proposalId","versionId","addedLines","removedLines","diffText"]`; `PROBE_CARRIERS=["diffText"]`; `OPEN=1 CLOSE=480 SECRET=336 FORGED=360 NONCE_MATCH=true`; refusal result has no body | ✓ PASS |
| Tool + coordinator + prompt suites | `npx vitest run tests/services/ai/office/{teamTools,teamRunCoordinator,teamPrompts}.test.ts` | 3 files, 230 passed | ✓ PASS |
| Repo + proposal UI suites | `npx vitest run tests/services/ai/office/{aiSkillVersionRepo,aiOfficeRepo}.test.ts tests/components/ai/office/{PendingSkillProposals,SkillEditorDrawer}.test.tsx tests/ai/PatchDiffApprovalCard.test.tsx` | 5 files, 93 passed | ✓ PASS |
| Diff/runtime suites | `npx vitest run tests/services/ai/patchProposal.test.ts tests/ai/aiTools.test.ts tests/ai/chatTurnRuntime.test.ts tests/services/ai/aiOrchestratorLoop.test.ts` | 4 files, 177 passed | ✓ PASS |
| Backup + migration + parity + view | `npx vitest run tests/services/backup/officeBackup.test.ts tests/db/schemaV26Migration.test.ts tests/db/tableListParity.test.ts tests/views/AiOfficeView.test.tsx tests/components/ai/office/TeamWorkspace{Receipts,Steer}.test.tsx` | 6 files, 87 passed | ✓ PASS |
| Explorer + backup validation/export | `npx vitest run tests/workbench/AiExplorers.test.tsx tests/services/backup/{validateBackup,exportBackup}.test.ts` | 3 files, 50 passed | ✓ PASS |
| Tool allowlist suite | `npx vitest run tests/ai/chatTurnTools.test.ts` | 1 file, 7 passed | ✓ PASS |
| Architecture gate | `bash .planning/scripts/verify-team-chat-architecture.sh` | exit 0, incl. dead-module check | ✓ PASS |

Total: 22 scoped suites, 644 tests, all passing. Full suite not run (project rule: scoped only).

### Probe Execution

No `scripts/*/tests/probe-*.sh` files exist and no plan declares one. Step 7c: SKIPPED (no probe scripts in this project). The ad-hoc Vitest probe used above was deleted after the run; `git status` shows only the untracked `39-VERIFICATION.md`.

Probe detail — every field of the `propose_skill_version` result was enumerated, not just `diffText`:

- `proposalId` — UUID string, no body content.
- `versionId` — UUID string, no body content.
- `addedLines` / `removedLines` — numbers.
- `diffText` — the only field carrying the approved body. The base body's context and removed lines appear at offset 336, a forged `[KẾT THÚC DỮ LIỆU KHÔNG ĐÁNG TIN …]` line at 360, both strictly between the opening tag at 1 and the closing tag at 480. Both real tags carry nonce `dcea60ba`; the forged tag carries `deadbeef`, so it cannot close the block.
- Refusal paths (`INVALID_ARGUMENT` probed; `NO_CHANGES`, `PATCH_TOO_LARGE`, `DIFF_BUDGET_EXCEEDED` return only code/message/counts by construction) carry no body.

Fields the handler deliberately does not return — `baseMarkdown`, `patchedMarkdown`, `sectionTitle` — are dropped by the 5-key result object, so no second leak exists.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| AIO-SKILL-01 | 39-02, 39-06, 39-07 | Skill CRUD with validation, empty states, error handling (D-27/D-30 override) | ✓ SATISFIED | Explorer section, drawer validation, refusal Alert, empty line; explorer + drawer suites pass. |
| AIO-SKILL-02 | 39-01, 39-04 | Agent proposes a lesson; pending until approved | ✓ SATISFIED | `propose_skill_version` handler + tests; pending row has no `version`; probe confirms `aiSkills` untouched. |
| AIO-SKILL-03 | 39-01, 39-02, 39-05, 39-06 | Diff review, approve/reject, one new approved version, previous retrievable | ✓ SATISFIED | Two render sites, `decideSkillVersion`, baseline v1 snapshot, view-only history. |
| AIO-SKILL-04 | 39-01, 39-04, 39-05 | No AI tool can write an approved version | ✓ SATISFIED | Pending-only insert guard; approved writers are UI-only; tool not in `MUTATION_TOOLS`. |
| AIO-SKILL-05 | 39-03 | Mid-batch approval does not change a running agent | ✓ SATISFIED | Pin on attempt + exact version lookup; mid-batch tests at `teamRunCoordinator.test.ts:6355-6385`. |
| AIO-SKILL-06 | 39-03, 39-04 | Skill bodies wrapped as untrusted data | ✓ SATISFIED | `read_skill` :362-364, `buildEmployeeTurnRequest` :70-78, `propose_skill_version` :704; probe confirms nonce-matched enclosure on the third path. |

No orphaned requirements: every AIO-SKILL ID is claimed by at least one plan, and no additional ID is mapped to Phase 39 in REQUIREMENTS.md.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `tests/services/ai/office/teamTools.test.ts` | 1128-1129 | Regression guard asserts only that both delimiter phrases are present, not that the body marker sits between them | ⚠️ Warning | A future change that wraps only part of the diff, or appends a raw copy after the close tag, would still pass this test. Behavior is correct today (probe-verified); the guard is weaker than the property. |
| `src/services/ai/aiTools.ts` | 3332-3349, 4474, 4513-4517 | `query_recurring_tasks.description/notes`, `search_knowledge_base.snippet`, `get_document_details.body` still raw | ⚠️ Warning | Not skill bodies, so outside criterion 6. `query_recurring_tasks` and `search_knowledge_base` are in `EMPLOYEE_READ_ONLY_ALLOWLIST`, so they violate the module's own "each handler wraps its own body" contract (`teamTools.ts:426-428`). Carried over from review round 7 WR-01/WR-02; hardening backlog, not a phase-39 criterion. |
| `src/services/ai/untrustedData.ts` | 16-19 | Nonce is a 32-bit signal, not a cryptographic check | ℹ️ Info | Documented ceiling in the file. The real fix is a separate message channel. Not a criterion failure. |
| `src/components/ai/office/PendingSkillProposals.tsx` | 186 | `return null` when empty | ℹ️ Info | Legitimate empty render, not a stub. |

No `TBD`/`FIXME`/`XXX` markers in any file this phase touched.

### Notable Deviations (not gaps)

- **Dexie bumped to v26.** Plan 39-01's truth said `LATEST_SCHEMA_VERSION` stays 25. Commit `781b3647` (review CR-01) added a v26 `.upgrade()` that strips `version` from non-approved rows. The feature needed no schema change; the bump is a data repair so `max(approved)+1` cannot collide with a pre-39 numbered pending. Covered by `tests/db/schemaV26Migration.test.ts`. Backup envelope stays 13 as planned.
- **Non-approved pin refuses instead of falling back.** Plan 39-03 said a pin resolving to a non-approved row "falls back to `aiSkills`". The code refuses with `SKILL_NOT_ASSIGNED` (`teamTools.ts:341-343`). Stricter; the intent (never serve a rejected body as approved) holds.
- **Concurrent approvals sort to [2, 3], not [1, 2].** The baseline v1 snapshot (CR-03) shifts the numbers. Documented in the test comment.
- **`getLatestSkillVersion` removed** by `ca53a99d`; no caller remains.
- **Wrapping `diffText` costs the model nothing.** Both UI surfaces recompute the diff from Dexie via `prepareSkillVersionDiff` (`PendingSkillProposals.tsx:116`, `SkillEditorDrawer.tsx:208`) and never read the tool result. `proposalId`, `versionId`, `addedLines`, `removedLines` have no `src/` consumer either, so the whole result is model-facing only. No consumer broke: the only `patch.diffText` reader is `PatchDiffApprovalCard.tsx:54`, fed by the recomputed proposal.

### Human Verification Required

1. **Transcript card legibility**
   **Test:** Open the AI Staff chat, trigger a skill proposal with a long diff, read the card.
   **Expected:** Diff legible, Approve/Reject reachable without scrolling past the fold, evidence collapsed by default.
   **Why human:** Visual density and fold position are not assertable in jsdom.

2. **Version history density**
   **Test:** Create 10+ versions for one skill, open `Lịch sử phiên bản`.
   **Expected:** List scrolls, each row shows number (or `Đề xuất bị từ chối`), name, DD/MM/YYYY HH:mm and status, no duplicates.
   **Why human:** List density and overflow are visual.

### Gaps Summary

The single gap from the previous pass is closed. `propose_skill_version` now routes its `diffText` through `wrapUntrusted` (`teamTools.ts:704`), and a probe against the real handler with a marked approved body and a forged closing tag shows both landing inside a nonce-matched block, with no other result field carrying body content and no body on the refusal paths. The five previously-verified criteria still hold after the shared-file change: 22 scoped suites (644 tests) pass, typecheck is clean, and the architecture gate exits 0. Nothing in `src/` consumed the tool-result `diffText`, so the wrap broke no downstream reader.

Two honest residual notes, neither a criterion failure: the new regression test asserts delimiter presence rather than enclosure (behavior verified by probe, guard weaker than the property), and the nonce remains a strong signal rather than a cryptographic proof — its ceiling is documented in `untrustedData.ts:16-19`, and the real fix is a separate message channel, outside this phase's criteria.

---

_Verified: 2026-11-14T09:27:05Z_
_Verifier: Claude (gsd-verifier)_
