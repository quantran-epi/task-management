# Phase 39: Skill versioning + enrichment approval — Research

**Researched:** 2026-11-14
**Domain:** Dexie skill-version ledger semantics, team-tool proposal surface, prepared-diff approval card generalization, per-attempt version pinning, backup `strictObject` forward-compat
**Confidence:** HIGH on current-code facts (every anchor below was opened or grepped this session, and the Dexie compound-index behaviour was reproduced experimentally against the project's own `dexie@4.4.6` + `fake-indexeddb@6.2.5`); HIGH on the D-14/D-15 blast radius (enumerated by exhaustive grep of every `aiSkillVersions` reader); MEDIUM on the UI generalization shape (the card's prop contract is read, but the host wiring for a second decision channel does not exist yet); LOW on nothing material — no external services, no new dependencies, no provider behaviour involved.

## Summary

The phase is **not greenfield**. `aiSkillVersions` already exists end to end: table (`schema.ts:139`), type (`types/aiOffice.ts:126-138`), repo (`aiSkillVersionRepo.ts`, 101 lines), zod input (`aiOfficeSchemas.ts:143-150`), backup record schema (`backupSchemas.ts:690-701`), all five coordinated lists, and 9 passing repo tests. What is missing is every **production** caller: `grep -rn 'createSkillVersion\|decideSkillVersion\|listSkillVersions\|getLatestSkillVersion' src/` returns **only** `aiSkillVersionRepo.ts` itself. The table is dead weight wired into backup and nothing else. Phase 39 connects it to the real paths — it does not rebuild it.

Three things are actively **wrong** for the decisions D-14/D-15/D-17 require, and each is a hard blocker rather than a refactor:

1. **`createSkillVersion` numbers at creation** (`aiSkillVersionRepo.ts:68`: `version: (latest?.version ?? 0) + 1`). D-14 requires numbering at *approval*. Three concurrent pendings today become v1/v2/v3, and approving only one leaves permanent holes. Worse, the number is derived from `getLatestSkillVersion`, which reads the `[skillId+version]` index and therefore **counts pending rows** — exactly what D-14 forbids.
2. **`decideSkillVersion` touches only `status` + `decidedAt`** (`:87-100`) and its `rw` scope is `[db.aiSkillVersions]` only. D-07 requires it to also overwrite `aiSkills.name/description/body` in the *same* transaction. Today approving a version changes nothing the runtime reads.
3. **`updateSkill` writes `aiSkills` directly with no version row** (`aiOfficeRepo.ts:253-270`). D-09 makes every manual edit produce an approved version, which means the only unversioned write path in the app must be closed.

Two landmines were found that CONTEXT.md does not name, and both would fail the phase gate:

- **`BackupAiSkillVersionRecordSchema.version` is `z.number().int().positive()`** (`backupSchemas.ts:693`). A pending row carrying `version: 0` is **rejected at import**. A backup exported after this phase would be unrestorable. Verified with the project's zod 4.6.5.
- **`validateBackup`'s duplicate-version guard keys on `${skillId}:${version}`** (`validateBackup.ts:564`). Two pendings at `version: 0` collide → `Duplicate AiSkillVersion for skillId "S" version 0` → the whole payload is refused. Verified by replaying the exact loop.

Both disappear if pending rows **omit** `version` entirely instead of carrying `0` (CONTEXT.md leaves this to Claude's discretion, D-14). Verified experimentally: with the field absent, Dexie's `[skillId+version]` compound index **skips the row** (count 0), `where('skillId')` still finds it (count 5), and `getLatestSkillVersion` returns the highest *numbered* row. That makes "pending does not consume a version number" true by construction rather than by a filter every reader must remember.

A third landmine, unrelated to numbers: **employee turns run under `mutationPolicy: 'read-only'`** (`teamRunCoordinator.ts:1784`) and the employee system prompt states *"Bạn chỉ được đọc dữ liệu. Mọi thao tác ghi đều bị từ chối tự động"* (`teamPrompts.ts:82-84`). `propose_skill_version` writes a row. It is legal (the runtime guard only fires for `isMutationTool`, and D-05 keeps it out of that set) but the prompt copy would be a lie, and a model told "every write is refused" will not call the tool. The read-only policy paragraph must be amended in the same change.

**Primary recommendation:** Make `version` **optional** on `AiSkillVersion` (absent = pending, never `0`), assign it only inside `decideSkillVersion`'s approval transaction from `max(version)` over `status === 'approved'` rows, add `baseVersion` as an optional non-negative integer, pin `skillVersion` on the assignment **only when > 0** (omit at baseline — the backup schema's `positive()` forbids `0`), and thread the pinned number to `read_skill` through `AttemptRef` → a per-agent `pinnedSkillVersion` map → `TeamToolContext`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Cơ chế đề xuất**
- **D-01:** Agent proposes via team tool `propose_skill_version` it calls itself in-turn. No post-turn automation, no user button. Reversibility: reversible — add/remove one entry in `TEAM_TOOL_DEFINITIONS` and the agent payload.
- **D-02:** Tool only allows proposing for the skill assigned to the calling agent (`ctx.skillId`). Leader has no skill so is excluded naturally; no separate leader guard. Empty `ctx.skillId` → refusal `SKILL_NOT_ASSIGNED` (reuse existing code in `teamTools.ts`).
- **D-03:** Proposal carries the **full new body** + `name` + `description` + optional `evidence`. **No** section patching. Diff via `createUnifiedLineDiff(bodyCũ, bodyMới)`; one tool call, no `baseHash`/`sectionId`, no prior `get_artifact`. `patch_artifact_section` stays as-is for notes and manual edits.
- **D-04:** Tool **writes the `pending` row immediately** when called and returns the diff. **No** parking on an approval card. Pending is inert data — nothing changes until the user approves, per AIO-SKILL-02. Parking on a card would force two clicks for one decision.
- **D-05:** Tool is **not** in `MUTATION_TOOLS`. Writing one `pending` row is not a mutation in the approval-gate sense. Consequence: `isMutationTool('propose_skill_version')` must return `false`, and there must be a test asserting it — otherwise `onMutationCheck` parks it and breaks D-04.
- **D-06:** Tool lives in the **employee payload** (not `LEAD_ONLY_TEAM_TOOLS`). Leader also receives it and gets `SKILL_NOT_ASSIGNED` on call — acceptable, cheaper than a separate payload. **Not** in `EMPLOYEE_READ_ONLY_ALLOWLIST` (that is a DB-tool allowlist, not a team-tool one).

**Ngữ nghĩa version**
- **D-07:** Approval **overwrites `aiSkills.name`/`description`/`body`** from the version row in the **same transaction** as `status='approved'` + `decidedAt`. `aiSkills` remains the current approved copy; runtime `read_skill` and prompt sources are unchanged.
- **D-08:** **Keep `aiSkills.body`.** Do not drop the field. Backup schema is `strictObject`; dropping `body` forces an envelope bump and edits to `read_skill`, `patchProposal`, every `skill.body` reader. Keeping it is the smallest, safest diff.
- **D-09:** **Manual edits in `SkillEditorDrawer` also create a new `approved` version** (user-authored, `decidedAt` = save time) and update `aiSkills` in the same transaction. Consequence: **one rule** — every name/description/body change has history. No write path skips versioning.
- **D-10:** **First version row of a skill = version 1.** The implicit baseline (current `aiSkills` body while the version table is empty) exists only when no row exists. No implicit row, no migration. The first approval/edit creates `version = 1` and replaces the baseline.
- **D-11:** Version row carries **all three fields** `name`/`description`/`body`. Agent proposals may change the description — the description is what the agent sees upfront and is where improvement is needed.
- **D-12:** Old versions are **view-only, not restorable**. R-12 not approved. History shows full content per version, no Restore button.
- **D-13:** **No `approvedBy`/`decidedBy` field.** Single-user app; existing `decidedAt` is enough. A constant `'user'` carries no information.

**Số version và phát hiện bản cũ**
- **D-14:** **Pending does not consume a version number.** `version` is assigned only at approval (`max(version) + 1` over `approved` rows). Consequence: `createSkillVersion` must change — pending is created with `version = 0` (or the field omitted) instead of `latest + 1`. Reason: three simultaneous pendings must not become v2/v3/v4 and leave holes when only one is approved.
- **D-15:** Add field **`baseVersion`** on the version row = the highest `approved` version at proposal time (`0` when no approved version exists). Compare `baseVersion` to the current approved version to detect "based on an older version". Field **optional** so old backups still read through `strictObject` (absent = valid).
- **D-16:** Multiple pendings per skill. **Approving one leaves the others `pending`** (no auto-reject — that would contradict C-13), but their cards show a "based on an older version" warning and the **Approve button is blocked** until the agent proposes again. Reason: approving a stale proposal would overwrite the just-approved content with an older diff.

**Pin version**
- **D-17:** Pin `skillVersion` **on the assignment row** at `createAssignment` = the highest `approved` version at that moment (`0` when no approved row → implicit baseline). `AiTeamAssignment.skillVersion` already exists in the type and backup schema; this phase only fills the value at all 3 `createAssignment` sites (`teamRunCoordinator.ts:2303`, `:3245`, and the initial dispatch at `:2857`).
- **D-18:** `read_skill` **resolves the version row matching the pinned number**, falling back to `aiSkills.body` when no row exists (implicit baseline or `skillVersion = 0`). `skillVersion` must be passed into `TeamToolContext`. This is **real pin enforcement** — writing the number while still reading `aiSkills.body` would let a mid-batch approval change a running agent's skill, violating criterion 5 and Pitfall 18.
- **D-19:** **Fixed at turn start, not changed mid-turn.** Roster is read fresh at the start of each turn (Phase 36 D-07); the attempt row pins the number at creation. Approval mid-batch **does not** affect a running agent. **Next turn, retry, and a new agent in the same group get the new version immediately** — no new group, no relaunch.
- **D-20:** Prompt **does not state the version number**. Prompt keeps name + description only. The version number is a technical trace, not something that helps the model.

**Bảo mật prompt**
- **D-21:** Wrap **both `description` and body** with `wrapUntrusted` in `buildEmployeeTurnRequest` (`teamPrompts.ts:90-98`), not just the body. Reason: after approval the description may be model-written → prompt-injection channel. Matches AIO-SKILL-06.
- **D-22:** `read_skill` keeps wrapping the body (already correct, `teamTools.ts:290`). When reading a pinned version, still wrap — approved does **not** mean trusted.

**Duyệt và UI**
- **D-23:** Approve/reject **writes the DB immediately at the UI** via `decideSkillVersion(id, status)`. Do not resolve the tool and let the agent call again — that adds a model round and the model may not call, leaving the user believing it was approved. Matches AIO-SKILL-04: only a user action writes.
- **D-24:** Chat card **reuses `PatchDiffApprovalCard`** (already renders note/skill diffs). Add a skill-proposal branch: Approve/Reject call `decideSkillVersion`. No new component.
- **D-25:** Approval in **two places**: the transcript card (immediate) and the "Chờ duyệt" section in `SkillEditorDrawer` (later, including after relaunch). Both read the same pending row and call the same function.
- **D-26:** Version history **extends the existing `SkillEditorDrawer`**: version list (number, date, status) + "Chờ duyệt" section with diff and Approve/Reject. No new view/drawer.

**Phạm vi CRUD**
- **D-27:** Phase 39 does **skill CRUD only** (create/edit/delete skill + version history + pending list). Leader/agent CRUD → Phase 40.
- **D-28:** Deleting a skill **also deletes all version rows** in the same transaction (current code is already correct — `deleteSkill` at `aiOfficeRepo.ts:276-298`). Still blocked while agents are assigned or a turn is running (Phase 36 D-12/D-13). No behaviour change.
- **D-29:** Pending proposals **hang until the user decides**. No expiry, no cleanup job, no time threshold.
- **D-30:** Record the D-27 override in `ROADMAP.md` §Phase 39 success criterion 1 and `REQUIREMENTS.md` (`AIO-SKILL-01`) so a later agent does not read the old wording and treat leader/agent CRUD as a gap in this phase. Same approach Phase 37/38 used.
- **D-31:** **Skill management UI lives in `AiStaffExplorer`** (tool window `ai_staff`, "AI Staff"). Add a third "Kỹ năng" section beside employees and leads, reusing `SkillCard` + `SkillEditorDrawer`. Reason: `AiStaffExplorer` already has list + create button + edit drawer + error notices; AI Staff is where AI profiles are managed, not where chat groups are managed. Phase 40 will merge into a 2-level explorer.
- **D-32:** `AiOfficeView` (`src/views/AiOfficeView.tsx`, rendered via `viewType: 'agents'`) is **dead code in the current runtime** — no trigger opens the `'agents'` tab. **Leave it alone**, do not delete this phase; Phase 40 decides. Do not edit that file except where a test requires it.
- **D-33:** The entry point for skill UI is the **"Kỹ năng" section in `AiStaffExplorer`** (see D-31). Create button, list, edit, delete all live there. No new route/tab, no resurrecting `AiOfficeView`.

### Claude's Discretion
- Exact field name for `baseVersion` (must pass `FORBIDDEN_BACKUP_KEYS`; avoid `error`, `runtime`, `prompt`, `stack`, `diagnostic`).
- How to represent `version = 0` for pending: the number `0` or the field omitted (must be consistent across type, schema, and the `[skillId+version]` index).
- Exact placement of the "Chờ duyệt" section and version list inside `SkillEditorDrawer`.
- How to render the diff when `aiSkills.body` is the implicit baseline (no row to compare against).
- Exact content of `evidence` and how it renders in the approval card.
- Whether a new Dexie index is needed or the existing `[skillId+version]` suffices.

### Deferred Ideas (OUT OF SCOPE)
- Leader/agent CRUD → Phase 40 (AIO-LEAD-01..04, criterion 3).
- Restoring an old version (R-12) — not approved; this phase is view-only history.
- Multiple skills per agent (R-11) — `AiEmployee.skillId` stays scalar.
- 2-level explorer, full walkthrough → Phase 40.
- Pending proposal expiry — user chose hang-until-decided (D-29).
- A new proposal superseding an old pending — not needed; multiple pendings are decided independently (D-16).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AIO-SKILL-01 | ~~Leader, agent, and skill CRUD~~ → **OVERRIDDEN by D-27/D-30**: skill CRUD only; leader/agent CRUD is Phase 40 | Skill CRUD surface = new "Kỹ năng" section in `AiStaffExplorer` (`AiStaffExplorer.tsx:106-355`, sections at `:166` and `:246`); `SkillCard` + `SkillEditorDrawer` already exist and are currently reachable only from dead `AiOfficeView`. Docs edit per D-30 lands in the same phase |
| AIO-SKILL-02 | After a run an agent can propose a lesson; the proposal changes nothing until approved | `propose_skill_version` in `TEAM_TOOL_DEFINITIONS` (`teamTools.ts:53`), handler in `executeTeamTool` switch (`:496-515`), writes a `pending` row with no `version` and no `aiSkills` write. D-05 keeps it out of `MUTATION_TOOLS` (`aiTools.ts:4707-4752`) |
| AIO-SKILL-03 | User reviews as a diff; approval creates exactly one new approved version; previous stays retrievable | `decideSkillVersion` gains the numbering + `aiSkills` overwrite in one `rw` over `[aiSkillVersions, aiSkills]`; `listSkillVersions` (`:35-41`) already returns history; diff from `createUnifiedLineDiff` (`utils/lineDiff.ts:110`) |
| AIO-SKILL-04 | No AI tool can write an approved version; only the user's approval action can | `decideSkillVersion` is the only writer that sets `status='approved'` or a `version` number; no tool handler calls it. Test asserts `isMutationTool('propose_skill_version') === false` **and** that the tool's row is `pending` with no `version` |
| AIO-SKILL-05 | Mid-batch approval does not change a running agent's skill — the assignment pins its version | `AiTeamAssignment.skillVersion` (`types/aiOffice.ts:213`), written at 3 `createAssignment` sites (`teamRunCoordinator.ts:2298-2311`, `:2852-2862`, `:3240-3252`); `read_skill` resolves by pinned number (`teamTools.ts:277-292`), threaded via `TeamToolContext` (`:21-28`) |
| AIO-SKILL-06 | Skill bodies, including approved ones, are wrapped as untrusted data in the prompt | `wrapUntrusted` (`teamPrompts.ts:47-54`) applied to `description` at `:90-98` (D-21) and to body in `readSkill` at `:290` (D-22, already correct) |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

Actionable directives extracted from `./CLAUDE.md`, to be verified by the planner:

- **Tauri is the only supported runtime.** Do not research, add, debug or validate PWA / GitHub Pages behaviour. `vite-plugin-pwa` and `navigateFallback` in `vite.config.ts` are pre-existing and out of scope — do not "fix" them here.
- **No new dependencies without explicit user approval.** This phase needs **zero** new packages: `createUnifiedLineDiff` (`utils/lineDiff.ts`) already exists, `wrapUntrusted` already exists, `PatchDiffApprovalCard` already exists, zod/dexie/antd already installed. Any instinct to add a diff library is a violation.
- **IndexedDB (Dexie) is the canonical store**; domain state belongs in Dexie, not Zustand. Pending rows and versions are domain state → Dexie only.
- **Data safety:** backup import must validate format and must not replace good local data without confirmation. New backup fields therefore need validation **and** round-trip coverage, not just an export change. This phase adds two optional fields; both need export→validate→restore tests.
- **Stable client-generated UUIDs** — `generateId()` (`src/utils/uuid.ts`); never add a `uuid` package.
- **UI is Ant Design.** Interactions must stay simple, fast, responsive, accessible — the approval card already carries `role="alert"`, `role="status"`, `role="region"` and a keyboard-focusable diff region (`PatchDiffApprovalCard.tsx:55-70`); keep them.
- **Dates:** timestamps stay ISO strings (`new Date().toISOString()`), matching every existing write (`createdAt`, `decidedAt`).
- **No full Vitest suite** — focused files only (also a user memory rule). `npm test` is `vitest run` with no path filter; every plan must pass explicit paths.
- **GSD workflow enforcement:** file changes go through a GSD command; research writes only this document.
- **User's explicit quality bar (37-CONTEXT):** *"đừng bao giờ suggest tôi là làm cái này thì đơn giản, cái tôi cần là chất lượng"* — do not propose simplifications that drop schema rigour or edge cases. Where this research recommends "omit the field", it is because omission is the **more correct** model (see §2), not because it is less work.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Proposal capture (agent → pending row) | AI runtime / service (`teamTools.ts` handler, dispatched by `teamRunCoordinator.makeExecuteToolFn`) | DB / repository (`aiSkillVersionRepo`) | The tool handler is the only place with request-bound identity (`ctx.skillId`, `ctx.agentId`); the repo owns the transaction |
| Version numbering + approval write | DB / repository (`aiSkillVersionRepo.decideSkillVersion`) | — | Only a Dexie `rw` over both tables can make "assign number + overwrite `aiSkills`" atomic |
| Manual edit → approved version | DB / repository (`aiOfficeRepo.updateSkill`) | UI (`SkillEditorDrawer`) | D-09 makes versioning a property of the write path, not of the caller |
| Version pinning | AI runtime / service (`teamRunCoordinator` at `createAssignment`) | DB (`aiTeamRunAssignments.skillVersion`) | The coordinator is the only place that knows "an attempt is starting now" |
| Pinned-version read | AI runtime / service (`teamTools.readSkill` + `TeamToolContext`) | DB | The tool context is the only carrier of per-request identity |
| Diff rendering + decision | UI (`PatchDiffApprovalCard`, `SkillEditorDrawer`) | DB (`decideSkillVersion` called directly) | D-23: the UI writes; it does not ask the agent to write |
| Prompt-injection boundary | AI service (`teamPrompts.wrapUntrusted`) | — | The prompt assembler is the only place that knows provenance |
| Backup parity | Service (`backup/*`, `localSqlitePersistence`) + Rust allowlist | — | Five coordinated lists; a miss breaks the app's own next restore |

## Anchor Verification

Every line-number claim in CONTEXT.md `<canonical_refs>` was checked against the live tree this session. **Drift is mostly small (1-9 lines); the four marked ⚠ matter because a planner quoting them would land in the wrong function.**

| CONTEXT.md claim | Verified anchor | Status |
|---|---|---|
| `aiSkillVersionRepo.ts:52-83` `createSkillVersion` | `:54-80` | ⚠ drift (+2 start, -3 end) |
| `aiSkillVersionRepo.ts:85-101` `decideSkillVersion` | `:82-101` | ⚠ drift (-3 start) |
| `aiSkillVersionRepo.ts:40-50` `getLatestSkillVersion` | `:44-52` | ⚠ drift (+4 start) |
| `aiOfficeRepo.ts:233-252` `createSkill` | `:233-251` | ✅ |
| `aiOfficeRepo.ts:254-272` `updateSkill` | `:253-270` | ⚠ drift (-1 / -2) |
| `aiOfficeRepo.ts:285-301` `deleteSkill` | `:276-298` | ⚠ drift (-9 / -3) |
| `aiOfficeRepo.ts:303+` `countAgentsUsingSkill` | `:300-305` | ⚠ drift (-3) |
| `schema.ts:139` `aiSkillVersions` | `:139` | ✅ |
| `schema.ts:125` `aiSkills` | `:125` | ✅ |
| `types/aiOffice.ts:69-76` `AiSkill` | `:69-76` | ✅ |
| `types/aiOffice.ts:126-138` `AiSkillVersion` | `:126-138` | ✅ |
| `types/aiOffice.ts:124` `AiSkillVersionStatus` | `:124` | ✅ |
| `types/aiOffice.ts:52-53` `AiEmployee.skillId` | `:52-53` | ✅ |
| `types/aiOffice.ts:212-213` `skillId`/`skillVersion` | `:212-213` | ✅ |
| `aiOfficeSchemas.ts:143-150` `AiSkillVersionInputSchema` | `:143-150` | ✅ |
| `aiOfficeSchemas.ts` `AiSkillInputSchema`/`AiSkillUpdateSchema` | `:86-90` / `:92-96` | ✅ (no lines given) |
| `backupSchemas.ts:637-644` `BackupAiSkillRecordSchema` | `:637-644` | ✅ |
| `backupSchemas.ts:690-701` `BackupAiSkillVersionRecordSchema` | `:690-701` | ✅ |
| `backupSchemas.ts:194-198` `FORBIDDEN_BACKUP_KEYS` | `:194-198` | ✅ |
| `backupSchemas.ts:753` assignment `skillVersion` | `:753` | ✅ |
| `teamTools.ts:53` `TEAM_TOOL_DEFINITIONS` | `:53` | ✅ |
| `teamTools.ts:216-219` `LEAD_ONLY_TEAM_TOOLS` | `:216-219` | ✅ |
| `teamTools.ts:21-29` `TeamToolContext` | `:21-28` | ✅ |
| `teamTools.ts:31-41` `TeamToolRefusalCode` | `:30-40` | ⚠ drift (-1) |
| `teamTools.ts:277-292` `readSkill` | `:277-292` | ✅ |
| `teamTools.ts:494-516` `executeTeamTool` switch | fn `:490-516`, switch `:496-515` | ⚠ drift (-4) |
| `teamPrompts.ts:47-54` `wrapUntrusted` | `:47-54` | ✅ |
| `teamPrompts.ts:36-41` `neutralizeDelimiters` | `:35-40` | ✅ |
| `teamPrompts.ts:90-98` skill block | `:89-98` | ✅ |
| `teamRunCoordinator.ts:1072-1076` `skillFor` | `:1072-1076` | ✅ |
| `teamRunCoordinator.ts:1092-1094` `employeeTools` | `:1092-1094` | ✅ |
| `teamRunCoordinator.ts:1078-1090` `leadTools` | `:1078-1090` | ✅ |
| `teamRunCoordinator.ts:1062-1070` `toolContext` | `:1060-1070` | ⚠ drift (-2) |
| `teamRunCoordinator.ts:2303` createAssignment site 1 | call `:2298`, `skillVersion` spread `:2304` | ✅ (arg line) |
| `teamRunCoordinator.ts:2857` createAssignment site 2 | call `:2852`, `skillId` spread `:2857` | ✅ (arg line) — **no `skillVersion` spread today** |
| `teamRunCoordinator.ts:3245` createAssignment site 3 | call `:3240`, `skillVersion` spread `:3246` | ✅ (arg line) |
| `teamRunCoordinator.ts:205` `TurnRoster.skills` | `:205` | ✅ |
| `patchProposal.ts:60-74` `ArtifactPatchProposal` | `:60-73` | ✅ |
| `patchProposal.ts:191+` `preparePatch` | `:191` | ✅ |
| `patchProposal.ts:97-122` `readPatchTarget` | `:100-120` | ⚠ drift (+3) |
| `AiChatWidget.tsx:485-486` card render | `:484-487` | ✅ |
| `AiChatWidget.tsx:75-76` props | `:75-76` | ✅ |
| `chatTurnRuntime.ts:400-435` patch branch | comment `:400`, branch `:402-435` | ✅ |
| `chatTurnRuntime.ts:160` `PATCH_TOOL_NAME` | `:160` | ✅ |
| `aiTools.ts:4706-4752` `MUTATION_TOOLS` | `:4707-4752` | ✅ |
| `aiTools.ts:4763-4773` `isMutationTool` | `:4764-4773` | ✅ |
| `aiTools.ts:2152-2154` patch case | `:2152-2154` | ✅ |
| `chatTurnTools.ts:15-32` `EMPLOYEE_READ_ONLY_ALLOWLIST` | `:15-32` | ✅ |
| `chatTurnTools.ts:35-40` `LEAD_TOOL_ALLOWLIST` | `:35-40` | ✅ |
| `LeftToolWindow.tsx:140-141` `ai_staff` | render `:141` | ✅ |
| `WorkbenchLayout.tsx:66-72` `DEFAULT_BOTTOM_LEFT_ITEMS` | `:65-72` | ✅ |
| `EditorArea.tsx:596` `AiOfficeView` render | `:596-597` | ✅ |

**Additional anchors this research adds** (not in CONTEXT.md, needed by the planner):

| What | Anchor |
|---|---|
| `createAssignment` repo (writes `skillVersion`) | `aiTeamRunRepo.ts:109-157`; field write `:148` |
| `CreateAssignmentInput.skillVersion` | `aiTeamRunRepo.ts:49` |
| `AttemptRef` (batch/assignment/attemptNo — **no skillVersion**) | `teamRunCoordinator.ts:1712-1718` |
| `startEmployeeTurn` (where `skillFor` is called) | `teamRunCoordinator.ts:1739`, `skillFor` call `:1762` |
| `activeAssignmentByAgent` (declared / set) | `:561-564` / `:1844-1848` |
| `EMPLOYEE_TEAM_TOOLS` derivation | `:324-327` |
| `TEAM_TOOL_NAMES` set | `:320-322` |
| `makeExecuteToolFn` + team-tool branch | `:1100-1134`; branch `:1128-1130` |
| `resolveTeamToolName` | `:467-478` |
| Employee turn `mutationPolicy: 'read-only'` | `:1784` |
| Lead turn `mutationPolicy: 'approve'` | `:1975` |
| `onToolEvent` / `onAwaitingApproval` wiring | `:1296-1313` |
| `resolveApproval` | `:3430-3435` |
| `validateBackup` duplicate-version guard | `validateBackup.ts:559-569` |
| `exportBackup` skill-version touchpoints | `:213, :249, :309, :344` |
| `restoreBackup` skill-version touchpoints | `:53, :72, :196-197, :215, :267, :319` |
| `localSqlitePersistence` table list | `:33` |
| Rust `ALLOWED_TABLES` | `sqlite_persistence.rs:25` |
| `BACKUP_SCHEMA_VERSION` | `backupSchemas.ts:846` |
| `LATEST_SCHEMA_VERSION` | `schema.ts:184` (= 25) |
| `this.version(25)` | `db/index.ts:649` |
| `ChatTurnApprovalInfo` | `chatTurnRuntime.ts:44-49` |
| `PatchDiffApprovalCardProps` | `PatchDiffApprovalCard.tsx:6-14` |
| `TeamRunSnapshot.pendingApproval` | `teamRunCoordinator.ts:122` |
| `isMutationTool` call site in the loop | `aiOrchestratorLoop.ts:395-397` |
| Dead-module gate (new office module needs a production importer) | `.planning/scripts/verify-team-chat-architecture.sh:60-73` |

---

## Focus Area 1 — Anchor verification

Done above. Two findings the planner must act on:

1. **`teamRunCoordinator.ts:2857` (the initial dispatch site) does not spread `skillVersion` at all today.** The other two sites (`:2304`, `:3246`) copy `row.skillVersion` / `source.skillVersion` from a *previous* attempt — they are retry/amend paths that inherit. Only `:2852-2862` creates a fresh attempt from the roster, so **that is the only site that needs to compute a number**; the other two must keep inheriting (a retry of a pinned attempt must run the same skill version, D-19). A planner that "fills all three" by recomputing at all three would silently repin a retry to the newest version — a direct D-19 violation.

2. **`AttemptRef` (`:1712-1718`) carries `batchId`/`assignmentId`/`attemptNo`/`instructionMessageId` but not `skillVersion`.** `startEmployeeTurn` receives only `AttemptRef`, so at the moment it builds `toolContext` it has no number. Either `AttemptRef` gains `skillVersion` (smallest diff, and the value is already known at the call site) or `startEmployeeTurn` re-reads the assignment row (an extra await on the hot path). Recommend extending `AttemptRef`.

---

## Focus Area 2 — D-14 blast radius: every `aiSkillVersions` reader

Exhaustive grep result (`grep -rn 'aiSkillVersions\|createSkillVersion\|decideSkillVersion\|listSkillVersions\|getLatestSkillVersion' src/`), 8 files:

| # | Reader / writer | Anchor | Breaks if pending carries `version: 0` | Breaks if pending **omits** `version` |
|---|---|---|---|---|
| 1 | `listSkillVersions` — `where('skillId').equals().toArray()` then `sort((a,b) => b.version - a.version)` | `aiSkillVersionRepo.ts:35-41` | Sort still works (`0` is a number) but **all pendings tie at 0 → arbitrary order** (verified: `['z1','z2']` in insertion order, no `createdAt` tiebreak) | `b.version - a.version` → `NaN` → sort order undefined. **Must become `(b.version ?? 0) - (a.version ?? 0)`, plus a `createdAt` tiebreak** |
| 2 | `getLatestSkillVersion` — `where('[skillId+version]').between([skillId,0],[skillId,MAX]).last()` | `:44-52` | **Returns a pending row at v0 when no approved exists** (verified) → `createSkillVersion`'s `latest+1` would produce v1, which happens to be right, but the *meaning* is wrong and the function is used by nothing else yet | Compound index **skips** the row (verified: count 0) → returns the highest *numbered* row. Correct by construction |
| 3 | `createSkillVersion` — assigns `(latest?.version ?? 0) + 1` | `:54-80` | Must stop assigning entirely (D-14) | Same |
| 4 | `decideSkillVersion` — reads, guards `status !== 'pending'`, writes `status`+`decidedAt` | `:82-101` | Must gain numbering + `aiSkills` overwrite; `rw` scope must add `db.aiSkills` | Same |
| 5 | `deleteSkill` — `where('skillId').equals(id).delete()` | `aiOfficeRepo.ts:294` | Unaffected (keyed by `skillId`) | Unaffected |
| 6 | `exportBackup` — `toArray()` whole table | `exportBackup.ts:249` | Row exported with `version: 0` → **import rejects** (`positive()`) | Row exported without the key → validates |
| 7 | `restoreBackup` — `add(targetDb.aiSkillVersions, …)` | `restoreBackup.ts:319` | Unaffected (rows already validated) | Unaffected |
| 8 | `validateBackup` — duplicate guard keyed `${skillId}:${version}` | `validateBackup.ts:559-569` | **Two pendings collide → whole payload refused** (verified: `Duplicate AiSkillVersion for skillId "S" version 0`) | Key becomes `S:undefined` for every pending → **still collides**. Guard must skip rows without a `version` (or scope to `status === 'approved'`) |
| 9 | `BackupAiSkillVersionRecordSchema.version` | `backupSchemas.ts:693` | `z.number().int().positive()` → **`0` fails** (verified with zod 4.6.5) | Must become `.optional()` |
| 10 | `localSqlitePersistence` — opaque `payload_json` | `localSqlitePersistence.ts:33` | Unaffected (whole row serialized) | Unaffected |
| 11 | Rust `ALLOWED_TABLES` | `sqlite_persistence.rs:25` | Unaffected (table-level allowlist) | Unaffected |
| 12 | `AiSkillVersion.version` type | `types/aiOffice.ts:130` | `version: number` accepts 0 | Must become `version?: number \| undefined` |
| 13 | `tests/services/ai/office/aiSkillVersionRepo.test.ts` (9 tests) | whole file | **4 tests fail**: `'creates version 1 as pending'` (`:46-60`), `'numbers versions monotonically'` (`:60-70`), `'returns the highest version row as the latest'` (`:72-82`), `'never assigns the same version to two concurrent creates'` (`:140-152`) | Same 4 fail; the concurrency test becomes meaningless (nothing is assigned) and should be **replaced** by a concurrency test on the *approval* path |
| 14 | `tests/services/ai/office/aiOfficeRepo.test.ts` | `:213-235, :238-264, :266-…` | Seeds literal `version: 1` / `version: 2` rows directly — still valid (they bypass the repo) | Still valid |
| 15 | `tests/services/backup/officeBackup.test.ts` | `:144-166` (`pendingVersion` has `version: 2`) | Round-trip test would now export a `version: 0` pending → the fixture must be updated to omit `version` **or** keep a number (it is a hand-built row, so either validates) | Fixture must drop `version` from `pendingVersion` to represent the new model |
| 16 | `tests/db/schemaV19Migration.test.ts` | `:140-149` | Seeds a row with a literal version — unaffected | Unaffected |

### Dexie `[skillId+version]` behaviour with duplicate / missing values — measured, not assumed

Run against the project's own `dexie@4.4.6` + `fake-indexeddb@6.2.5`:

```
rows after 3 version-less pending:            3
compound index count (missing version):       0        ← the index SKIPS rows with an absent key part
latest via compound index:                    {version: 2, status: 'approved'}
duplicate [skillId,0] accepted:               2        ← the index is NON-unique, so 0 does not collide
where(skillId) S1 count:                      5        ← the plain skillId index still sees every row
sort b.version - a.version with equal versions: ['z1','z2']   ← insertion order, no tiebreak
sort with one numbered row:                   [['a1',1],['p1',undefined],['p2',undefined]]
```

Two consequences:

- **A non-unique compound index cannot enforce "one approved version per number".** Uniqueness must be enforced inside `decideSkillVersion`'s transaction (read `max(version)` over approved rows, then write) — exactly the pattern `createSkillVersion` uses today for its own numbering. Do **not** change the index to `&[skillId+version]`: pending rows would then collide on a shared key, and a restore of a hand-edited backup would fail at write time rather than validation time.
- **Omitting `version` is strictly better than `0`**: it removes the row from the compound index (so `getLatestSkillVersion` is correct without a filter), keeps `positive()` intact, and needs one guard in `validateBackup` instead of a schema relaxation plus a semantic overload of `0`.

**Recommendation:** omit `version` on pending. Type `version?: number | undefined`. `decideSkillVersion` is the only writer that sets it. `listSkillVersions` sorts `(b.version ?? 0) - (a.version ?? 0)` with a `createdAt` tiebreak so pendings render newest-first deterministically.

---

## Focus Area 3 — D-15 `baseVersion` and backup forward-compat

**Does the `strictObject` + optional-field pattern actually work?** Yes, with one caveat that is easy to get wrong.

- `BackupAiSkillVersionRecordSchema` is `z.strictObject` (`backupSchemas.ts:690`). An **undeclared** key is rejected; a **declared-but-optional** key that is absent is accepted. Verified: `z.strictObject({a:z.string()}).safeParse({a:'x',b:1}).success === false`, and adding `baseVersion: z.number().int().nonnegative().optional()` makes both `{...}` and `{..., baseVersion: 3}` valid.
- **The caveat:** `strictObject` rejects; a plain `z.object` **strips**. `BackupEnvelopeSchema` is `z.object` (`backupSchemas.ts:848`) but the per-table record schemas are the ones that matter, and they are all `strictObject`. So `baseVersion` must be declared in `BackupAiSkillVersionRecordSchema` — it cannot ride along undeclared.
- **`FORBIDDEN_BACKUP_KEYS` check** (`backupSchemas.ts:194-198` + the regex at `:212`): verified programmatically that `baseVersion`, `baseSkillVersion`, `derivedFromVersion`, `parentVersion`, `basedOnVersion` all pass. Recommend **`baseVersion`** — it is the name CONTEXT.md uses and it names the concept exactly.
- **Envelope version:** do **not** bump `BACKUP_SCHEMA_VERSION` (13). The comment at `backupSchemas.ts:836-845` states the rule explicitly: a bump is only warranted when a field becomes *required* or changes meaning. Both new fields are optional-absent, so a v13 payload still validates and a post-39 payload validates against the same schema. Bumping would send every pre-39 backup down `validateBackup`'s `schemaVersion < CURRENT` branch for nothing.
- **No Dexie version bump either**, unless an index changes. `SCHEMA_V25` (`schema.ts:178-180`) is `{...SCHEMA_V24}`; a new unindexed field on an existing table needs no `.upgrade()` (C-16: no backfill). `LATEST_SCHEMA_VERSION` stays 25.

**The five lists that must move together** (verified anchors; here the change is *two optional fields on one existing table*, so only the schema-bearing lists actually change):

| # | List | Verified anchor | What changes for this phase |
|---|---|---|---|
| 1 | Dexie schema | `schema.ts:139` (`aiSkillVersions` store spec), `:184` (`LATEST_SCHEMA_VERSION = 25`), `db/index.ts:649` (`this.version(25)`) | **Nothing** — `baseVersion` is unindexed; `version` becomes optional but the index spec is unchanged. Do not add a version(26) |
| 2 | Export | `exportBackup.ts:213` (key list), `:249` (`toArray()`), `:309` (tables object), `:344` (counts) | **Nothing structural** — whole rows flow through. Only the fixture in `officeBackup.test.ts:144-154` needs `version` removed |
| 3 | Restore | `restoreBackup.ts:53` (txn list), `:72` (`AI_OFFICE_TABLE_KEYS`), `:196-197` (reads), `:215` (tables object), `:267` (clear), `:319` (`add`) | **Nothing** — rows are already validated upstream |
| 4 | Validate | `backupSchemas.ts:690-701` (record schema), `:846` (version literal); `validateBackup.ts:261-262` (table validation), `:559-569` (duplicate guard) | **Two edits**: `version: z.number().int().positive().optional()`, `baseVersion: z.number().int().nonnegative().optional()`; and the duplicate guard must skip rows with no `version` |
| 5 | SQLite TS + Rust | `localSqlitePersistence.ts:33`; `sqlite_persistence.rs:25` | **Nothing** — rows are opaque `payload_json`; only a new *table* would need a Rust edit |

**Plus the type and zod write boundary** (not one of the five, but must move with them):

- `types/aiOffice.ts:126-138` — `version?: number | undefined`, `baseVersion?: number | undefined`.
- `validation/aiOfficeSchemas.ts:143-150` — `AiSkillVersionInputSchema` must **not** accept `version` (the repo assigns it); it may accept `baseVersion` if the proposal path passes it, or the repo can compute it. Recommend: the repo computes `baseVersion` inside the transaction (it already reads the table there) so the input schema stays unchanged and no caller can forge it.

---

## Focus Area 4 — D-17/D-18: the real execution path of `read_skill`

### How `TeamToolContext` is built today

`toolContext(agentId)` (`teamRunCoordinator.ts:1060-1070`) is called on **every** tool dispatch from `makeExecuteToolFn` (`:1108`):

```ts
function toolContext(agentId: string): TeamToolContext {
  const employee = roster.employees.find((row) => row.id === agentId);
  const skillId = employee?.skillId;
  return { db, teamId, threadId: options.threadId, agentId, ...(skillId ? { skillId } : {}) };
}
```

It reads `roster` (the turn-start snapshot) and nothing else. There is **no** per-attempt state in it, so `skillVersion` is **not** available at context-construction time today. Three call sites construct it: `:1108` (the dispatch path), `:1682` (`toolContext(roster.lead.id)` for linked items), `:2135` (`toolContext(roster.lead!.id)`).

### Is `skillVersion` available at context-construction time? Not yet — but it is available one frame up

`createAssignment` is called in three places, and each has a different answer:

| Site | Anchor | Where the number comes from | What D-17/D-19 require |
|---|---|---|---|
| Initial dispatch (batch) | `:2852-2862` | Nothing today — must be **computed** from the roster's skill: `max(version)` over `approved` rows | Compute once per assignment at creation. This is the **only** site that computes |
| Amend replacement | `:2298-2311` | `row.skillVersion` (the retired attempt) | **Inherit** — an amend rewrites the task, not the skill. Recomputing would repin a live batch (D-19 violation) |
| Retry | `:3240-3252` | `source.skillVersion` (the attempt being retried) | **Inherit** — D-19 says a retry gets the *new* version. ⚠ **This is a genuine conflict**: D-19 states "Lượt sau, retry, và agent mới trong cùng nhóm nhận version mới ngay" (next turn, retry, and a new agent in the same group get the new version immediately), but the code at `:3246` copies the source attempt's pin. A retry is a new attempt and per D-19 must **recompute**, not inherit. The planner must decide explicitly and write a test either way; the current code's inheritance is the behaviour D-19 overrides |

⚠ **Flagged conflict (D-19 vs the retry site's existing inheritance).** Recommend: recompute at `:3240` (retry) and at `:2852` (dispatch); inherit only at `:2298` (amend, which is explicitly "the same attempt, new task"). If the user meant retries to keep the old pin, D-19's wording needs correcting in the plan — do not leave it ambiguous.

### Threading the number to `read_skill`

Two hops are needed, both small:

1. **`AttemptRef` gains `skillVersion?: number`** (`:1712-1718`). `startEmployeeTurn` (`:1739`) then has it without an extra DB read.
2. **A per-agent map** `pinnedSkillVersion: Map<string, number>` set in `startEmployeeTurn` right beside `activeAssignmentByAgent.set(...)` (`:1844-1848`) and cleared in `finalizeAttempt`'s cleanup (`:1049-1051`). `toolContext(agentId)` reads it.

Why a map and not `activeAssignmentByAgent`: that map is only set **after** `transitionAssignment` succeeds (`:1834-1848`), and it is absent for mention-started turns (`:2462`) and `send_message`-started turns (`:2573`), which have no assignment at all. Those turns legitimately have **no pin** → baseline → `read_skill` falls back to `aiSkills`. That is the correct behaviour and needs no special case beyond `undefined`.

### The fallback when no approved version row exists (implicit baseline)

`readSkill` today (`teamTools.ts:277-292`) reads `ctx.db.aiSkills.get(ctx.skillId)`. The D-18 shape:

```
if (!ctx.skillId) → refuse SKILL_NOT_ASSIGNED            (unchanged)
row = ctx.skillVersion ? (await db.aiSkillVersions.where('[skillId+version]')
        .equals([ctx.skillId, ctx.skillVersion]).first()) : undefined
skill = row ?? (await db.aiSkills.get(ctx.skillId))       // baseline fallback
if (!skill) → refuse SKILL_NOT_ASSIGNED                   (unchanged)
return { name, description, body: wrapUntrusted(...) }    (unchanged wrapping)
```

Three details the planner must not miss:

- **`equals([skillId, version])` is exact and needs the compound index** — verified it resolves. Do **not** use `.between(...).last()` here: that would return the *highest* version ≤ pinned, silently serving a different content than the pin.
- **A pinned version row can be `pending` or `rejected`?** No — the pin is always a number that was assigned at approval, so only `approved` rows carry a number. But a hand-edited backup could pair a pin with a `rejected` row. Guard: accept the row only if `status === 'approved'`, else fall back to `aiSkills`. Cheap and closes a tampering path.
- **`description` must be wrapped too, on the tool path** (D-22 says wrap the body; D-21 says wrap the description in the *prompt*). The tool result currently returns `description` raw (`:289`). Since the description can now be model-authored, wrap it here as well — the same argument as D-21 applies, and AIO-SKILL-06 says "skill bodies, including approved ones" while D-21 extends the intent to descriptions.

### Does `TurnRoster.skills` need to carry the pinned version?

**No.** `TurnRoster.skills` is `AiSkill[]` (`:205`) — the *current approved* rows, read fresh at turn start (`TeamWorkspace.tsx:302-320` → `listSkills(db)`). It feeds `skillFor(employee)` (`:1072-1076`) which produces the **prompt** description. Within one batch every attempt shares the same roster snapshot, so the prompt description is stable for the whole batch — which is what D-19 needs. The pin only has to reach `read_skill`, and that path does not go through the roster.

⚠ **One consequence worth stating in the plan:** if a user approves a version mid-batch, a *new* agent dispatched in the same batch (via `amend_assignments` adding an agent) would get a fresh `createAssignment` with a recomputed pin, while its prompt description comes from the stale roster snapshot. The pin and the prompt would disagree. This is acceptable (the pin is authoritative for `read_skill`, and D-20 says the prompt does not state a version), but the plan should note it rather than discover it in UAT.

---

## Focus Area 5 — D-05: the gate that would break `propose_skill_version`

The mechanism is a two-step chain, and it is worth reading precisely because the failure is silent (the tool would appear to work but never write).

**Step 1 — the loop decides whether to consult the gate** (`aiOrchestratorLoop.ts:395-397`):

```ts
if (isMutationTool(tc.function.name, args)) {
  if (onMutationCheck) {
    const check = await onMutationCheck(tc.function.name, args);
    if (!check.proceed) { /* tool result replaced by a cancellation payload; `continue` */ }
  }
}
```

So the gate is **only** consulted for names in `MUTATION_TOOLS`. `isMutationTool` (`aiTools.ts:4764-4773`) normalizes the name (strips `_ide`/`_cc`/`_tool` suffixes and `proxy_`/`tool_` prefixes) then does `MUTATION_TOOLS.has(normalized)`.

**Step 2 — if it *were* in the set, the employee path would hard-refuse before any parking** (`chatTurnRuntime.ts:397-399`):

```ts
if (request.mutationPolicy === 'read-only') {
  return { proceed: false, cancellationResult: READ_ONLY_REFUSAL };
}
```

Employee turns set `mutationPolicy: 'read-only'` (`teamRunCoordinator.ts:1784`). So adding the tool to `MUTATION_TOOLS` would **not** park it on a card — it would return `READ_ONLY_REFUSAL` ("Nhân viên AI chỉ được đọc dữ liệu…") and **no row would ever be written**. That is a worse failure than parking: the model sees a refusal, reports it, and the user never learns a proposal was attempted. (For the lead, `mutationPolicy: 'approve'` at `:1975` would park it on `MutationApprovalCard` — the two-click problem D-04 rejects.)

**The exact mechanism that would park/refuse it:** membership in `MUTATION_TOOLS` (`aiTools.ts:4707-4752`) → `isMutationTool` returns true → `onMutationCheck` fires → employee branch returns `READ_ONLY_REFUSAL`.

**The tests that prove it does not:**

1. `expect(isMutationTool('propose_skill_version')).toBe(false)` — belongs in `tests/ai/aiTools.test.ts` beside the existing block at `:397-413`.
2. `expect(isMutationTool('propose_skill_version_ide')).toBe(false)` — the normalized-name guard, same block.
3. `expect(payloadHasMutationTool(employeeTools)).toBe(false)` — **already exists** at `tests/services/ai/office/teamRunCoordinator.test.ts:444` and `:1508`, and it iterates the real payload. Adding a mutation-classified team tool would turn this red immediately. This is the strongest existing guard and needs no new test.
4. A behavioural test: an employee turn that calls `propose_skill_version` produces a **pending row** and **no** `READ_ONLY_REFUSAL` in the tool result. This is the one that actually proves D-04 end to end; put it in `teamTools.test.ts` (handler level) and one coordinator-level case.

⚠ **Secondary hazard the tests above do not catch:** the employee system prompt (`teamPrompts.ts:82-84`) tells the model *"Bạn chỉ được đọc dữ liệu. Mọi thao tác ghi đều bị từ chối tự động và không có thay đổi nào được thực hiện."* If that copy is not amended, a compliant model will never call the tool, and every test above still passes (they call the tool directly). The plan must include the copy change **and** a prompt test asserting the new sentence exists.

---

## Focus Area 6 — D-24: generalizing `PatchDiffApprovalCard`

### What the card is today

`PatchDiffApprovalCardProps` (`PatchDiffApprovalCard.tsx:6-14`):

```ts
export interface PatchDiffApprovalCardProps {
  patch: ArtifactPatchProposal;
  stale?: boolean | undefined;
  applying?: boolean | undefined;
  error?: string | undefined;
  decision?: 'approved' | 'rejected' | undefined;
  onApprove: () => void;
  onReject: () => void;
}
```

It is **already generic enough for the diff itself**: `patch.diffText`, `patch.addedLines`, `patch.removedLines`, `patch.sectionTitle`, `patch.target` (`'note' | 'skill'`), `patch.id`, `patch.sectionId`. It renders `stale` as a warning `Alert` **and disables the Approve button** with a tooltip (`:55-56`, `:76-81`) — which is exactly the D-16 "based on an older version" behaviour, already implemented.

### What must change

**a) `ArtifactPatchProposal` must be constructible for a whole-body skill proposal.** Today it is produced only by `preparePatch` (`patchProposal.ts:191-290`), which requires `sectionId` + `expectedHeading` + `baseHash` + `operation` and refuses `NO_CHANGES` / `PATCH_TOO_LARGE` / `DIFF_BUDGET_EXCEEDED`. D-03 explicitly rejects section patching. Two options:

- **Option A (recommended):** add a sibling pure function in `patchProposal.ts` — `prepareSkillVersionDiff(base: {name, description, body}, next: {name, description, body})` — returning an `ArtifactPatchProposal` with `sectionId: 'body'`, `sectionTitle: '<skill name>'`, `target: 'skill'`, and the three-field diff. Reuse `createUnifiedLineDiff` + `PATCH_LINE_CAP` + the `DIFF_BUDGET_EXCEEDED` refusal so the size guard is shared. This keeps one type and one card.
- **Option B:** widen the card's `patch` prop to a small union. Rejected — it would fork the render path and the test file for no gain.

⚠ **The three-field problem.** D-11 says a version carries `name` + `description` + `body`, but the card renders **one** `diffText`. A proposal that changes the name and description as well as the body must show all three or the user approves changes they never saw. Recommend: build `diffText` by concatenating three unified diffs with `fromLabel`/`toLabel` per field (`a/skill:<id>/name` … `b/skill:<id>/name`), and set `addedLines`/`removedLines` to the sums so the badge counts stay honest. The card's `whiteSpace: 'pre'` diff region (`:61-63`) renders multi-hunk text correctly. This is a real gap in CONTEXT.md that the planner must close.

**b) The decision callback signature.** Today the card takes `onApprove: () => void` — no arguments, because the host resolves a promise. D-23 requires the card to call `decideSkillVersion(id, status)` with the **version row id**, which is not the same as `patch.id` (that is the *skill* id). So the host must know the pending version id.

The cleanest wiring keeps the card unchanged and puts the knowledge in the host:

- `ChatTurnApprovalInfo` (`chatTurnRuntime.ts:44-49`) gains an optional discriminator: `skillVersion?: { versionId: string; baseVersion: number; currentApprovedVersion: number }`. The coordinator's `onAwaitingApproval` (`:1307-1313`) is **not** the right producer here — the tool does not park (D-04), so no approval info is ever published for it. Instead the pending row is rendered **from the transcript**, not from `pendingApproval`.

⚠ **This is the single biggest structural finding in this focus area.** `PatchDiffApprovalCard` is rendered from `turn.pendingApproval.patch` (`AiChatWidget.tsx:482-487`), and `pendingApproval` is set only by `onAwaitingApproval` (`teamRunCoordinator.ts:1307`), which fires only from the parked-patch branch in `chatTurnRuntime.ts:425`. **A D-04 tool that never parks can never populate `pendingApproval`.** Reusing the card therefore requires a *second* render site, not a branch inside the existing one.

Recommended shape:

- The tool's result (returned to the model) contains the diff summary, but the **durable** artifact is the `pending` row.
- The transcript renders pending proposals from Dexie via `useLiveQuery(() => listPendingSkillVersions(db))` in `TeamWorkspace`, passed down through the existing `transcriptExtensions` slot (`TeamWorkspace.tsx:737-800`, already used for `TeamActivityIndicator` and `AssignmentPlanCard`). No new widget API — the same extension path 37-08 D-13 used for `onRetryAgent`.
- That extension renders `<PatchDiffApprovalCard patch={proposal} stale={baseVersion < currentApproved} onApprove={() => decideSkillVersion(id,'approved')} onReject={() => decideSkillVersion(id,'rejected')} />` and calls `onSaved`-style refresh; `useLiveQuery` re-renders automatically after the write.
- The `SkillEditorDrawer` "Chờ duyệt" section (D-25/D-26) renders the same component from the same query.

**c) The "based on an older version" warning (D-16).** The card already has the exact mechanism: `stale` → warning `Alert` + **disabled** Approve with tooltip (`:55-56`, `:76-81`). Map `stale = (row.baseVersion ?? 0) < currentApprovedVersion`. Two details:

- The **existing copy is wrong for this case**: *"Tài liệu đã thay đổi sau khi đề xuất này… yêu cầu AI đề xuất lại trong khung chat."* It says "the document changed" — for a skill it must say the skill has a newer approved version. Either add a `staleReason?: 'document-changed' | 'newer-version-approved'` prop with two copy strings, or pass the message in. Recommend the former: one prop, two strings, no new component.
- The **Reject button must stay enabled** when stale. Verified: it is (`:75` — only `applying` disables it). A stale proposal must still be dismissible; D-16 only blocks Approve.

**d) Concrete type changes**

| Type | File:line | Change |
|---|---|---|
| `AiSkillVersion` | `types/aiOffice.ts:126-138` | `version?: number \| undefined`; add `baseVersion?: number \| undefined` |
| `ArtifactPatchProposal` | `patchProposal.ts:60-73` | No change needed if Option A is used (the new builder returns the same type) |
| `PatchDiffApprovalCardProps` | `PatchDiffApprovalCard.tsx:6-14` | Add `staleReason?: 'document-changed' \| 'newer-version-approved'` (optional, defaults to the current copy so the existing 7 tests keep passing) |
| `ChatTurnApprovalInfo` | `chatTurnRuntime.ts:44-49` | **No change** — pending skill proposals do not flow through it (see (b)) |
| `TeamToolContext` | `teamTools.ts:21-28` | Add `skillVersion?: number \| undefined` |
| `AttemptRef` | `teamRunCoordinator.ts:1712-1718` | Add `skillVersion?: number \| undefined` |
| `BackupAiSkillVersionRecordSchema` | `backupSchemas.ts:690-701` | `version: z.number().int().positive().optional()`; add `baseVersion: z.number().int().nonnegative().optional()` |

---

## Focus Area 7 — Testing strategy under the no-full-suite rule

**The invocation pattern the project uses** (confirmed against `package.json` and Phase 38's plans): `npm test` is bare `vitest run` with **no** path filter, so every plan must pass explicit paths. Phase 38's plans use exactly this shape (`38-01-PLAN.md:100`, `38-03-PLAN.md:90,122,160`):

```
npx vitest run tests/services/ai/office/aiSkillVersionRepo.test.ts
npx vitest run tests/services/ai/office/aiTeamRepo.test.ts -t "AIO-BUDGET-04"
npx vitest run tests/db/tableListParity.test.ts tests/db/schemaV22Migration.test.ts
```

Config: `vite.config.ts` `test:` block, `setupFiles: ['./tests/setup.ts']` (which loads `fake-indexeddb/auto` at `:1`), `fileParallelism: false`. Per-file `// @vitest-environment node` is used by every office/repo test.

### Files to extend (all exist; none is created from scratch except one)

| File | Anchor | What it must gain |
|---|---|---|
| `tests/services/ai/office/aiSkillVersionRepo.test.ts` | 156 lines, 9 tests; concurrency test `:140-152` | **Rewrite 4 tests** for the new numbering model: pending has no `version`; approval assigns `max(approved)+1`; `baseVersion` recorded; approval overwrites `aiSkills` in the same transaction (assert both tables after a mid-transaction throw → neither changed); a concurrency test on **approval** (two approvals racing must not take the same number) |
| `tests/services/ai/office/teamTools.test.ts` | 744 lines; tool-count assert `:79` (`toHaveLength(8)`) | **Fix `:79` → 9.** Add `propose_skill_version`: writes a pending row with no `version`; refuses `SKILL_NOT_ASSIGNED` with no `ctx.skillId`; returns a diff; `read_skill` serves the **pinned** version when `ctx.skillVersion` is set; falls back to `aiSkills` at baseline; refuses/falls back on a non-approved pinned row |
| `tests/services/ai/office/teamPrompts.test.ts` | 389 lines; skill block test `:115-121` | `description` is wrapped in the untrusted delimiters; the body still never appears; the read-only policy copy no longer claims every write is refused |
| `tests/ai/chatTurnRuntime.test.ts` | 940 lines; mutation block `:800-846` | A `propose_skill_version` call under `mutationPolicy: 'read-only'` is **not** refused and does **not** park (proves D-05 end to end) |
| `tests/ai/aiTools.test.ts` | `isMutationTool` block `:397-413` | `isMutationTool('propose_skill_version') === false` and the `_ide`-suffixed form |
| `tests/ai/PatchDiffApprovalCard.test.tsx` | 7 tests | `staleReason: 'newer-version-approved'` renders the new copy and still disables only Approve (Reject stays enabled) |
| `tests/services/ai/office/teamRunCoordinator.test.ts` | 6245 lines; harness `:113-250`; payload asserts `:420-444`, `:1507-1508` | Pin is written at dispatch; a retry/amend inherits or recomputes per the decision in Focus Area 4; `read_skill` inside a batch serves the pinned body after a mid-batch approval |
| `tests/services/backup/officeBackup.test.ts` | `pendingVersion` fixture `:144-154` | Fixture drops `version`; add `baseVersion` round-trip; assert a v13 payload **without** `baseVersion` still validates (Pitfall 20 forward-compat) |
| `tests/workbench/AiExplorers.test.tsx` | 252 lines; `AiStaffExplorer` block `:29-188` | The "Kỹ năng" section renders; create/edit/delete work from it; refusal copy names the agent |
| `tests/views/AiOfficeView.test.tsx` | 4 skill tests `:254-275` etc. | **Do not delete** (D-32 leaves the view in place) but it must still pass — `updateSkill` now writes a version row, so the test's `listSkills` assertion is unaffected. Verify, do not rewrite |

**Sampling rate**

- **Per task commit:** the single focused file for that task.
- **Per wave merge:** the union of touched files, e.g.
  `npx vitest run tests/services/ai/office/aiSkillVersionRepo.test.ts tests/services/ai/office/teamTools.test.ts tests/services/ai/office/teamPrompts.test.ts tests/ai/aiTools.test.ts`
- **Phase gate:** every command above green + the D-30 doc edits landed. Full suite explicitly out of scope (user rule).

---

## Focus Area 8 — What CONTEXT.md missed

Ordered by the damage if a planner does not see them.

1. **The employee read-only prompt copy contradicts the new tool** (`teamPrompts.ts:82-84`). *"Mọi thao tác ghi đều bị từ chối tự động"* is false once `propose_skill_version` writes a row. A compliant model will not call it. Must be amended in the same change as the tool, with a prompt test.

2. **`propose_skill_version` cannot render through `pendingApproval`.** The card's only render site is `turn.pendingApproval.patch` (`AiChatWidget.tsx:482-487`), and `pendingApproval` is set only by the parked-patch branch (`chatTurnRuntime.ts:425` → `teamRunCoordinator.ts:1307`). D-04 forbids parking, so a second render site (transcript extension) is **required**, not optional. CONTEXT.md's D-24 reads as if a branch inside the existing render would do; it will not.

3. **`BackupAiSkillVersionRecordSchema.version` is `positive()`** — `0` is rejected at import. Verified.

4. **`validateBackup`'s duplicate guard keys `${skillId}:${version}`** — multiple pendings collide. Verified.

5. **`listSkillVersions`' sort has no tiebreak** — with equal (or absent) versions the order is insertion order, so the "Chờ duyệt" list would jump around. Needs `createdAt` as a secondary key.

6. **The retry site (`:3246`) inherits the source pin, which contradicts D-19's "retry gets the new version immediately".** Must be decided explicitly.

7. **A three-field proposal needs a three-field diff.** D-11 says name+description+body change together; the card renders one `diffText`. Approving unseen name/description changes is a correctness hole.

8. **`read_skill` returns `description` unwrapped** (`teamTools.ts:289`). D-21 covers the prompt; the tool path is a second injection channel with the same argument.

9. **`updateSkill` is called from exactly one place** (`SkillEditorDrawer.tsx:74`) but is exported and tested as a general repo function (`aiOfficeRepo.test.ts:170-182`). Making it create a version row changes the meaning of an existing public function — the test at `:179` asserts `updated.body` and `updated.description`, which still holds, but a planner must add an assertion that a version row appeared, or the D-09 guarantee is untested.

10. **`createSkill` does not create version 1.** Correct per D-10 (implicit baseline), but worth an explicit test so a later "helpful" change does not add one and break the "first row = v1" invariant.

11. **`AiSkillVersionInputSchema` (`aiOfficeSchemas.ts:143-150`) still accepts `status` with a default of `'pending'`.** A caller could pass `status: 'approved'` straight into `createSkillVersion` and bypass D-23 entirely. The tool handler must never pass `status`; better, the repo should reject a non-`pending` status on create. This is a direct AIO-SKILL-04 hole that no current test covers.

12. **`decideSkillVersion`'s `rw` scope is `[db.aiSkillVersions]` only** (`:87`). Adding the `aiSkills` write without adding `db.aiSkills` to that array throws `NotFoundError` at runtime in Dexie 4. Easy to miss because the type system does not catch it.

13. **`AiOfficeView` is dead but `tests/views/AiOfficeView.test.tsx` is live** and exercises the skill drawer. D-32 says do not touch the view; the test must keep passing. Do not "clean up" either.

14. **The dead-module gate** (`.planning/scripts/verify-team-chat-architecture.sh:60-73`) fails if any file in `src/services/ai/office/` has zero production importers. If the plan adds a helper module there (e.g. a `skillVersionProposal.ts`), it needs a real production importer or the gate goes red. Safest: put the new diff builder in `src/services/ai/patchProposal.ts`, which is outside that directory and already has importers.

15. **`teamTools.test.ts:79` asserts exactly 8 team tools.** Adding a ninth is a deliberate test edit, not a regression.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Unified line diff | A diff library or a hand-rolled LCS | `createUnifiedLineDiff` (`utils/lineDiff.ts:110`) + `MAX_DIFF_CELLS` | Already bounded (`1_000_000` cells), deterministic tie-break, EOL-preserving, and already used by the note path |
| Diff size guard | A new char/line cap | `PATCH_LINE_CAP` (120) + the `DIFF_BUDGET_EXCEEDED` refusal shape (`patchProposal.ts:15, 257-260`) | Sharing the cap keeps the two proposal surfaces consistent and reuses the refusal codes the UI already renders |
| Prompt-injection boundary | New delimiters or escaping | `wrapUntrusted` + `neutralizeDelimiters` (`teamPrompts.ts:35-54`) | The delimiter-redaction regex is the control; a second implementation would drift |
| Approval card | A `SkillVersionApprovalCard` | `PatchDiffApprovalCard` + a `staleReason` prop | It already renders diff lines, `+/−` counts, a stale warning that blocks Approve, `role="alert"/"status"/"region"`, and a keyboard-focusable diff region |
| Version numbering | A counter column on `aiSkills` | `max(version)` over `approved` rows inside the approval transaction | A counter is a second source of truth that a restore or a hand-edited backup desynchronises |
| Pending-row lifecycle | An expiry job / status sweep | Nothing — rows hang (D-29) | An expiry job is a scheduler the app does not have (Phase 37 owns scheduling) |
| Atomic multi-table write | Compensating writes | One `db.transaction('rw', [db.aiSkillVersions, db.aiSkills], …)` | Dexie rolls both back (Phase 38 verified the same pattern) |
| Backup field enumeration | Ad-hoc JSON pass-through | The declared `strictObject` record schemas | An undeclared key is **rejected**, not stripped |
| UUIDs | `uuid` package | `generateId()` (`utils/uuid.ts`) | Native `crypto.randomUUID()` wrapper already in use |
| Markdown rendering in the drawer | Raw HTML | `MarkdownContentRenderer` (`ChatMessageBubble.tsx:311`) | The only permitted path to `renderSafeMarkdown` (T-34-47); the drawer already uses it at `:147` |

## Common Pitfalls

### Pitfall 1: Pending rows carrying `version: 0` poison the backup
**What goes wrong:** export succeeds, import rejects with `Unrecognized/invalid` on `version`, or worse, `validateBackup` refuses the whole payload with a duplicate-version error because two pendings share `S:0`.
**Why it happens:** `0` looks like a harmless sentinel, but the backup schema is `positive()` and the duplicate guard keys on the number.
**How to avoid:** omit `version` on pending; make it optional in the type and the record schema; scope the duplicate guard to rows that have a `version`.
**Warning signs:** a backup round-trip test that passes only because the fixture has one pending.

### Pitfall 2: Adding `aiSkills` to `decideSkillVersion` without adding it to the `rw` scope
**What goes wrong:** `db.aiSkills.put(...)` inside `db.transaction('rw', [db.aiSkillVersions], …)` throws `NotFoundError` at runtime. TypeScript does not catch it; a test that only reads `aiSkillVersions` does not either.
**How to avoid:** `db.transaction('rw', [db.aiSkillVersions, db.aiSkills], …)` and a test that asserts **both** tables after a successful approval and **neither** after a thrown one.
**Warning signs:** the approval "works" in a unit test that mocks the repo but fails in the drawer.

### Pitfall 3: Numbering from the wrong set
**What goes wrong:** `max(version)` computed over **all** rows lets a pending row's number (if any leaked in) or a rejected row's number set the next value, producing gaps or duplicates.
**How to avoid:** filter `status === 'approved'` explicitly. Verified query shape: `.where('[skillId+version]').between([id,0],[id,MAX]).filter(r => r.status === 'approved').last()` returns the true maximum.
**Warning signs:** an approved version numbered 3 after only one prior approval.

### Pitfall 4: Pin written but not read
**What goes wrong:** the assignment row gets `skillVersion: 2` and `read_skill` still returns `aiSkills` — criterion 5 is not actually enforced, and the test "the pin is set" passes. This is exactly Pitfall 18's warning sign.
**How to avoid:** a test that (a) pins v1, (b) approves v2 mid-batch, (c) calls `read_skill` for the running agent and asserts the **v1 body**, (d) calls it for a fresh attempt and asserts the **v2 body**.
**Warning signs:** the only pin test asserts the row field.

### Pitfall 5: `read_skill` using `between(...).last()` for the pinned lookup
**What goes wrong:** `.between([id,0],[id,pinned]).last()` returns the highest version ≤ pinned — silently serving different content than the pin when the pinned row is missing.
**How to avoid:** `.where('[skillId+version]').equals([id, pinned]).first()` and an explicit `status === 'approved'` guard, else fall back to `aiSkills`.

### Pitfall 6: The card rendered from `pendingApproval`
**What goes wrong:** the plan adds a branch to `AiChatWidget.tsx:484` expecting the proposal to appear; it never does, because nothing sets `pendingApproval` for a non-parking tool.
**How to avoid:** render from Dexie (`listPendingSkillVersions`) through `transcriptExtensions`, exactly as `AssignmentPlanCard` does.

### Pitfall 7: Approving a stale proposal silently reverts content
**What goes wrong:** two pendings based on v1; approving the second after the first was approved writes v1-era content as v3, discarding the v2 content the user just accepted.
**How to avoid:** `stale = (row.baseVersion ?? 0) < currentApprovedVersion` → the card's existing `stale` path disables Approve. Do **not** auto-reject (D-16 forbids it). Reject stays enabled.

### Pitfall 8: The retry path repins against D-19
**What goes wrong:** `:3246` copies `source.skillVersion`, so a retry after an approval runs the old skill — the opposite of D-19's "retry gets the new version immediately".
**How to avoid:** decide explicitly; if D-19 governs, recompute at `:3240` and add a test that a retry after an approval pins the new number.

### Pitfall 9: `updateSkill` versioning breaks the dead view's tests
**What goes wrong:** `AiOfficeView.test.tsx:254-275` creates a skill through the drawer and asserts `listSkills`. That still passes. But if the plan also changes the drawer's save to require a pending approval, it breaks.
**How to avoid:** keep manual save immediate (D-09 says it creates an **approved** version, not a pending one). Run `tests/views/AiOfficeView.test.tsx` in the wave that touches the drawer.

### Pitfall 10: New office module trips the dead-module gate
**What goes wrong:** `verify-team-chat-architecture.sh` fails on any `src/services/ai/office/*.ts` with zero production importers.
**How to avoid:** put new pure helpers in `src/services/ai/patchProposal.ts` (outside that directory), or ensure a real importer.

## Code Examples

### Approval transaction — numbering + `aiSkills` overwrite (D-07, D-14, D-15)

```ts
export async function decideSkillVersion(
  id: string,
  status: Extract<AiSkillVersionStatus, 'approved' | 'rejected'>,
  db: TaskPlannerDatabase = defaultDb
): Promise<AiSkillVersion> {
  // D-07: both tables in ONE rw scope, or the aiSkills.put throws NotFoundError.
  return db.transaction('rw', [db.aiSkillVersions, db.aiSkills], async () => {
    const existing = await db.aiSkillVersions.get(id);
    if (!existing) throw new Error(MISSING_VERSION_MESSAGE);
    if (existing.status !== 'pending') throw new Error(ALREADY_DECIDED_MESSAGE);

    const decidedAt = new Date().toISOString();

    if (status === 'rejected') {
      const rejected: AiSkillVersion = { ...existing, status, decidedAt };
      await db.aiSkillVersions.put(rejected);
      return rejected;
    }

    // D-14: number only over APPROVED rows — pending/rejected carry no number.
    const latestApproved = await db.aiSkillVersions
      .where('[skillId+version]')
      .between([existing.skillId, 0], [existing.skillId, Number.MAX_SAFE_INTEGER])
      .filter((row) => row.status === 'approved')
      .last();
    const version = (latestApproved?.version ?? 0) + 1;

    const approved: AiSkillVersion = { ...existing, status, version, decidedAt };
    await db.aiSkillVersions.put(approved);

    // D-07: aiSkills stays the current approved copy — the runtime read source is unchanged.
    const skill = await db.aiSkills.get(existing.skillId);
    if (!skill) throw new Error(MISSING_SKILL_MESSAGE);
    await db.aiSkills.put({
      ...skill,
      name: approved.name,
      description: approved.description,
      body: approved.body,
      updatedAt: decidedAt,
    });
    return approved;
  });
}
```

### Pending creation — no number, `baseVersion` recorded (D-04, D-14, D-15)

```ts
export async function createSkillVersion(
  input: AiSkillVersionDraft,
  db: TaskPlannerDatabase = defaultDb
): Promise<AiSkillVersion> {
  const validated = AiSkillVersionInputSchema.parse(input);
  // AIO-SKILL-04: a create can never mint an approved row.
  if (validated.status !== 'pending') throw new Error(ONLY_PENDING_ON_CREATE_MESSAGE);

  return db.transaction('rw', [db.aiSkillVersions, db.aiSkills], async () => {
    const skill = await db.aiSkills.get(validated.skillId);
    if (!skill) throw new Error(MISSING_SKILL_MESSAGE);

    const latestApproved = await db.aiSkillVersions
      .where('[skillId+version]')
      .between([validated.skillId, 0], [validated.skillId, Number.MAX_SAFE_INTEGER])
      .filter((row) => row.status === 'approved')
      .last();

    const row: AiSkillVersion = {
      id: generateId(),
      skillId: validated.skillId,
      // NO `version` — D-14: pending does not consume a number, and the compound
      // index skips the row so `getLatestSkillVersion` stays correct by construction.
      status: 'pending',
      name: validated.name,
      description: validated.description,
      body: validated.body,
      baseVersion: latestApproved?.version ?? 0,   // D-15
      createdAt: new Date().toISOString(),
    };
    if (validated.evidence !== undefined) row.evidence = validated.evidence;
    await db.aiSkillVersions.add(row);
    return row;
  });
}
```

### `read_skill` with the pinned version (D-18, D-22)

```ts
async function readSkill(ctx: TeamToolContext): Promise<string> {
  if (!ctx.skillId) {
    return JSON.stringify(refuse('SKILL_NOT_ASSIGNED', 'Nhân viên này chưa được gán kỹ năng nào.'));
  }
  // D-18: exact match on the pinned number. NEVER `.between(...).last()` — that would
  // serve the highest version <= the pin, which is a different skill than the pin names.
  const pinned = ctx.skillVersion
    ? await ctx.db.aiSkillVersions
        .where('[skillId+version]')
        .equals([ctx.skillId, ctx.skillVersion])
        .first()
    : undefined;
  // A hand-edited backup could pair a pin with a rejected row — treat it as absent.
  const row = pinned?.status === 'approved' ? pinned : undefined;
  const skill = row ?? (await ctx.db.aiSkills.get(ctx.skillId));
  if (!skill) {
    return JSON.stringify(refuse('SKILL_NOT_ASSIGNED', 'Nhân viên này chưa được gán kỹ năng nào.'));
  }
  return JSON.stringify({
    name: skill.name,
    // D-21/D-22: the description is model-writable after approval, so it is untrusted here too.
    description: wrapUntrusted(`MÔ TẢ KỸ NĂNG ${skill.name}`, skill.description),
    body: wrapUntrusted(`KỸ NĂNG ${skill.name}`, skill.body),
  });
}
```

### Pin at the dispatch site only (D-17, D-19)

```ts
// teamRunCoordinator.ts, the initial-dispatch createAssignment (~:2852)
const skill = skillFor(employee);
const pinned = skill ? await getLatestApprovedVersionNumber(skill.id, db) : undefined; // 0/undefined = baseline
const attemptRow = await createAssignment(
  {
    batchId: batch.id,
    agentId: employee.id,
    agentName: employee.name,
    ...(skill ? { skillId: skill.id } : {}),
    // D-17: omit at baseline — BackupAiTeamAssignmentRecordSchema.skillVersion is
    // z.number().int().positive(), so a literal 0 would make the backup unrestorable.
    ...(pinned !== undefined && pinned > 0 ? { skillVersion: pinned } : {}),
    model: employee.model || options.model,
    task: assignment.task,
  },
  db
);
```

## Runtime State Inventory

> This is not a rename, but the phase changes the *meaning* of a persisted column and adds two fields. The canonical question: after every file is updated, what runtime state still carries the old shape?

| Category | Items Found | Action Required |
|---|---|---|
| Stored data | `aiSkillVersions` rows: **zero production rows exist** (grep proves no production writer), so only test fixtures carry the old `version: 1`-at-create shape. `aiTeamAssignments.skillVersion`: the field exists in the type and backup schema but **is never written by production** (`grep skillVersion src/` → only the type, the repo's conditional copy, and the backup schema). `aiSkills` rows: unchanged shape (D-08 keeps `body`) | **No data migration** (C-16). Update the two test fixtures (`officeBackup.test.ts:144-154`, `aiSkillVersionRepo.test.ts` expectations) |
| Live service config | None — no external service holds skill state | None |
| OS-registered state | None — no scheduled tasks, no pm2, no launchd entries | None |
| Secrets/env vars | None added. `baseVersion` passes `FORBIDDEN_BACKUP_KEYS` (verified) | None |
| Build artifacts | None — no new dependency, no new table, no Rust change. `src-tauri/target` unaffected | None |
| Dexie version | `LATEST_SCHEMA_VERSION = 25` (`schema.ts:184`), `this.version(25)` (`db/index.ts:649`) | **No bump.** `baseVersion` is unindexed; making `version` optional does not change the index spec |
| Backup envelope | `BACKUP_SCHEMA_VERSION = 13` (`backupSchemas.ts:846`) | **No bump** — both fields are optional-absent (see Focus Area 3) |
| Test literals | `teamTools.test.ts:79` (`toHaveLength(8)`); `aiSkillVersionRepo.test.ts` (4 numbering tests); `officeBackup.test.ts:144-154` (fixture) | Deliberate edits, not regressions |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.2 (jsdom global; `// @vitest-environment node` per office/repo file) |
| Config file | `vite.config.ts` (`test:` block; `setupFiles: ['./tests/setup.ts']` → `fake-indexeddb/auto`; `fileParallelism: false`) |
| Quick run command | `npx vitest run tests/services/ai/office/aiSkillVersionRepo.test.ts` |
| Full suite command | **not run** (project rule — the suite takes ~1 hour) |

### Phase Requirements → Test Map

| Req / Criterion | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| AIO-SKILL-01 (overridden) | Skill CRUD works from `AiStaffExplorer` with validation, empty state, error handling | component | `npx vitest run tests/workbench/AiExplorers.test.tsx -t "Kỹ năng"` | ❌ Wave 0 (new section tests) |
| AIO-SKILL-02 / Crit 2 | An agent proposes; version count unchanged; a `pending` row exists with no `version` | unit | `npx vitest run tests/services/ai/office/teamTools.test.ts -t "propose_skill_version"` | ❌ Wave 0 |
| AIO-SKILL-03 / Crit 3 | Approval creates exactly one approved version; previous still retrievable | unit | `npx vitest run tests/services/ai/office/aiSkillVersionRepo.test.ts -t "approv"` | ✅ (rewrite of 4 tests) |
| AIO-SKILL-04 / Crit 4 | `isMutationTool('propose_skill_version') === false`; no tool writes an approved row | unit | `npx vitest run tests/ai/aiTools.test.ts -t "isMutationTool"` and `npx vitest run tests/ai/chatTurnRuntime.test.ts -t "read-only"` | ✅ (extend both) |
| AIO-SKILL-05 / Crit 5 | Mid-batch approval does not change a running agent's skill | integration | `npx vitest run tests/services/ai/office/teamRunCoordinator.test.ts -t "pin"` | ❌ Wave 0 |
| AIO-SKILL-06 / Crit 6 | `description` and `body` both wrapped; approved ≠ trusted | unit | `npx vitest run tests/services/ai/office/teamPrompts.test.ts -t "untrusted"` and `teamTools.test.ts -t "read_skill"` | ✅ (extend) |
| D-16 stale warning | Approve disabled, Reject enabled, new copy | component | `npx vitest run tests/ai/PatchDiffApprovalCard.test.tsx` | ✅ (extend) |
| Backup parity | New fields survive export→validate→restore; a v13 payload without `baseVersion` still validates | integration | `npx vitest run tests/services/backup/officeBackup.test.ts` | ✅ (extend) |
| No schema drift | No new table, no version bump | migration | `npx vitest run tests/db/tableListParity.test.ts tests/db/schemaV22Migration.test.ts` | ✅ (should stay green untouched) |

### Sampling Rate
- **Per task commit:** the single focused file for that task.
- **Per wave merge:** the union of touched files (see Focus Area 7).
- **Phase gate:** every command in the table green + the D-30 doc edits landed. Full suite out of scope.

### Wave 0 Gaps
- [ ] `tests/services/ai/office/aiSkillVersionRepo.test.ts` — rewrite the 4 numbering tests for the "no number until approval" model; add the approval-concurrency test; add the atomicity test (both tables unchanged after a throw).
- [ ] `tests/services/ai/office/teamTools.test.ts` — fix `:79` to 9; add the `propose_skill_version` block and the pinned `read_skill` block.
- [ ] `tests/services/ai/office/teamRunCoordinator.test.ts` — add the mid-batch pin test (the one that proves criterion 5).
- [ ] `tests/ai/aiTools.test.ts` — the `isMutationTool` negative assertions.
- [ ] `tests/services/backup/officeBackup.test.ts` — fixture update + `baseVersion` round-trip + v13-without-`baseVersion` acceptance.
- [ ] `tests/workbench/AiExplorers.test.tsx` — the "Kỹ năng" section.

**What "pass" looks like (observable):** after an agent proposes, `db.aiSkillVersions.where('skillId').equals(id).count()` is unchanged in `approved` count and the new row has **no** `version` key; after approval, exactly one row has `status === 'approved'` with `version === max+1` and `aiSkills.body` equals that row's body; a running agent's `read_skill` returns the pre-approval body while a fresh attempt returns the post-approval body; a backup exported and re-imported keeps both fields and a v13 payload without `baseVersion` still validates.

## Security Domain

> `workflow.security_enforcement: true`, ASVS level 1.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---|---|---|
| V2 Authentication | no | Single local user; no auth surface added |
| V3 Session Management | no | — |
| V4 Access Control | **yes** | Only a user action may set `status='approved'` or assign a `version`. Enforced structurally: `createSkillVersion` rejects a non-`pending` input; `decideSkillVersion` is the sole writer of both. No tool handler calls it |
| V5 Input Validation | **yes** | zod at every boundary: `AiSkillVersionInputSchema` (`aiOfficeSchemas.ts:143-150`, `evidence` ≤ 2000), `BackupAiSkillVersionRecordSchema` (`strictObject`, `version` optional-positive, `baseVersion` optional-non-negative) |
| V6 Cryptography | no | No crypto in this phase; backup encryption untouched |
| V7 Error handling / logging | **yes** | Refusal messages carry no ids (existing convention: `MISSING_SKILL_MESSAGE`, `MISSING_VERSION_MESSAGE` are id-free by design, `aiSkillVersionRepo.ts:24-33`). Keep that |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---|---|---|
| A model-authored description becoming a persistent prompt-injection channel | Tampering / Elevation | `wrapUntrusted` on `description` in the prompt (D-21) **and** on the tool result (Focus Area 8 #8); `neutralizeDelimiters` redacts forged closing tags (`teamPrompts.ts:35-40`) |
| A tool smuggling `status: 'approved'` into `createSkillVersion` | Elevation of privilege | Repo rejects a non-`pending` status on create (Pitfall/AIO-SKILL-04) |
| Approving a stale proposal to silently revert content | Tampering | `baseVersion` vs current approved → card `stale` → Approve disabled (D-16) |
| A hand-edited backup pairing a pin with a `rejected`/`pending` row | Tampering | `readSkill` accepts a pinned row only when `status === 'approved'`, else falls back to `aiSkills` |
| Unbounded proposal spam filling the DB | DoS (nuisance) | Not mitigated by design (D-29: pending hangs until decided). Acceptable for a single-user local app; note it rather than adding an expiry job |
| A backup field named like a secret being exported | Information disclosure | `baseVersion` verified against `FORBIDDEN_BACKUP_KEYS` + the key regex (`backupSchemas.ts:194-216`) |
| Model-supplied body exceeding a sane size | DoS | `PATCH_LINE_CAP` (120 lines) + `MAX_DIFF_CELLS` (1e6) reused from `patchProposal.ts`; the body field itself is already bounded by `z.string().trim().min(1)` and the diff refusal |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Omitting `version` on pending is acceptable to the user (CONTEXT.md leaves `0` vs omitted to Claude's discretion) | Focus Area 2 | If the user prefers `0`, the backup schema must become `nonnegative()`, the duplicate guard must include `status`, and `getLatestSkillVersion` needs a filter — three extra edits, no behaviour change |
| A2 | D-19 governs retries, i.e. a retry must repin to the newest approved version rather than inherit the source pin | Focus Area 4 | If retries should inherit, D-19's wording is wrong and the plan must say so; the code at `:3246` already inherits |
| A3 | The three-field diff (name + description + body) is the right way to render a D-11 proposal | Focus Area 6 | If the user wants body-only diffs, a proposal could change name/description without showing it — a correctness hole, so this assumption is load-bearing |
| A4 | `transcriptExtensions` is the right slot for the pending-proposal card (no new widget API) | Focus Area 6 | If the transcript slot cannot host a per-row card, a new widget prop is needed; the precedent (`AssignmentPlanCard`, `onRetryAgent`) says it can |
| A5 | No Dexie version bump and no envelope bump are needed | Focus Area 3 | Both follow from "optional, unindexed" — if either field becomes required, both bumps are needed plus a `13 → N` normalization step |

**If this table is non-empty:** A1 and A2 are genuine user decisions surfaced by research; the planner should confirm them (or record the chosen default) rather than silently pick.

## Open Questions

1. **Retry pin semantics (A2).** D-19 says retries get the new version immediately; the code at `:3246` inherits the source pin.
   - What we know: the amend site (`:2304`) must inherit (same attempt, new task); the retry site is a *new* attempt.
   - What's unclear: whether the user considers a retry a continuation or a fresh run.
   - Recommendation: recompute at retry (matches D-19's literal wording), and state it in the plan so it is a decision rather than an accident.

2. **Baseline diff rendering (Claude's Discretion in CONTEXT.md).** When `aiSkills.body` is the implicit baseline there is no row to diff against.
   - What we know: `createUnifiedLineDiff(aiSkills.body, proposedBody)` works with the current row as `base` — no row needed.
   - Recommendation: use `aiSkills.body` (and `aiSkills.name`/`description`) as the base whenever `baseVersion === 0`; label the diff `a/skill:<id> (bản hiện tại)`.

3. **`evidence` rendering.** `evidence` is optional, ≤ 2000 chars, and currently rendered nowhere.
   - Recommendation: render it in the card below the diff as a collapsed `Collapse` panel (the drawer already uses `Collapse` at `:141-150`), labelled "Bằng chứng". Never wrap it into the prompt — it is display-only.

## Recommended Plan Decomposition (advisory)

Six plans, three waves. The ordering is driven by one rule: **the repo semantics must be correct and tested before anything renders them**, and the pin must exist before the tool can be proven not to break a running agent.

**Wave 1 — data semantics (no UI, no tool)**

- **Plan 01 — Version model + repo rewrite.** `AiSkillVersion.version` optional, `baseVersion` added; `createSkillVersion` stops numbering and rejects non-`pending`; `decideSkillVersion` numbers over approved rows and overwrites `aiSkills` in one `rw`; `listSkillVersions` sort tiebreak; `getLatestApprovedVersionNumber` helper. Backup: record schema (both fields optional), `validateBackup` duplicate guard scoped to numbered rows. Tests: rewrite `aiSkillVersionRepo.test.ts`, extend `officeBackup.test.ts`.
  *Gate:* `npx vitest run tests/services/ai/office/aiSkillVersionRepo.test.ts tests/services/backup/officeBackup.test.ts`

- **Plan 02 — `updateSkill` creates an approved version (D-09).** Same transaction as the `aiSkills` write; one rule, no unversioned path. Extend `aiOfficeRepo.test.ts`.
  *Gate:* `npx vitest run tests/services/ai/office/aiOfficeRepo.test.ts tests/views/AiOfficeView.test.tsx`

**Wave 2 — runtime (pin + tool + prompt)**

- **Plan 03 — Pin at creation, thread to `read_skill`.** `AttemptRef.skillVersion`; `pinnedSkillVersion` map; `TeamToolContext.skillVersion`; `readSkill` exact-match + approved guard + baseline fallback; pin at the dispatch site, inherit at amend, recompute at retry (per Open Question 1); omit at baseline. Tests: `teamRunCoordinator.test.ts` mid-batch pin test (the criterion-5 proof), `teamTools.test.ts` pinned-read block.
  *Gate:* `npx vitest run tests/services/ai/office/teamRunCoordinator.test.ts -t "pin" tests/services/ai/office/teamTools.test.ts`

- **Plan 04 — `propose_skill_version` tool + prompt boundary.** Tool definition, handler (creates pending, returns diff via the new `prepareSkillVersionDiff`), `executeTeamTool` case, `resolveTeamToolName` needs nothing (it derives from `TEAM_TOOL_NAMES`); **not** in `MUTATION_TOOLS`; amend the employee read-only policy copy; wrap `description` in `buildEmployeeTurnRequest` and in `readSkill`. Tests: `teamTools.test.ts` (fix `:79`), `teamPrompts.test.ts`, `aiTools.test.ts`, `chatTurnRuntime.test.ts`.
  *Gate:* `npx vitest run tests/services/ai/office/teamTools.test.ts tests/services/ai/office/teamPrompts.test.ts tests/ai/aiTools.test.ts tests/ai/chatTurnRuntime.test.ts`

**Wave 3 — UI (three surfaces)**

- **Plan 05 — Approval surfaces.** `PatchDiffApprovalCard` gains `staleReason`; a `PendingSkillProposals` component rendered through `transcriptExtensions` in `TeamWorkspace` (from `listPendingSkillVersions` via `useLiveQuery`); the "Chờ duyệt" section in `SkillEditorDrawer`; both call `decideSkillVersion`. Tests: `PatchDiffApprovalCard.test.tsx`, plus a `TeamWorkspace`-level test if one exists for `transcriptExtensions`.
  *Gate:* `npx vitest run tests/ai/PatchDiffApprovalCard.test.tsx`

- **Plan 06 — `AiStaffExplorer` "Kỹ năng" section + version history + docs.** Third section reusing `SkillCard` + `SkillEditorDrawer`; version list (number, date, status) and pending list inside the drawer; D-30 doc edits to `ROADMAP.md` §Phase 39 criterion 1 and `REQUIREMENTS.md` AIO-SKILL-01. Tests: `tests/workbench/AiExplorers.test.tsx`.
  *Gate:* `npx vitest run tests/workbench/AiExplorers.test.tsx`

**Why this order:** Plan 01 changes the meaning of an existing table that backup already round-trips — doing it first means every later plan builds on correct semantics. Plan 03 must precede Plan 05 because the pin is what makes the approval card safe to click mid-batch. Plan 06 is last because it is the only plan with no dependency from anything else and the highest churn risk.

## Sources

### Primary (HIGH confidence — read or executed this session)
- `src/db/repositories/aiSkillVersionRepo.ts` (whole file, 101 lines), `src/db/repositories/aiOfficeRepo.ts:227-305`, `src/db/repositories/aiTeamRunRepo.ts:35-60, 109-157`.
- `src/types/aiOffice.ts:1-20, 40-160, 195-260`; `src/types/models.ts:288-324`; `src/types/teamChat.ts:1-80`.
- `src/db/schema.ts:120-185`; `src/db/index.ts:636-655`.
- `src/validation/aiOfficeSchemas.ts:1-35, 86-150`; `src/validation/backupSchemas.ts:190-220, 590-710, 745-760, 810-855`.
- `src/services/ai/office/teamTools.ts` (whole file, 516 lines); `src/services/ai/office/teamPrompts.ts:30-100`; `src/services/ai/office/teamRunCoordinator.ts:110-235, 315-330, 435-500, 555-600, 1055-1135, 1288-1320, 1310-1400, 1710-1860, 2280-2330, 2370-2395, 2545-2585, 2600-2650, 2835-2900, 3215-3300, 3430-3450`.
- `src/services/ai/patchProposal.ts` (whole file, 291 lines); `src/utils/lineDiff.ts:1-150`.
- `src/components/ai/widget/PatchDiffApprovalCard.tsx` (whole file, 86 lines); `src/components/ai/AiChatWidget.tsx:60-110, 230-270, 398-415, 460-510`; `src/components/ai/runtime/chatTurnRuntime.ts:34-60, 155-170, 290-300, 385-455`; `src/components/ai/ChatMessageList.tsx:30-120, 300-345`; `src/components/ai/ChatMessageBubble.tsx:82-120, 311-340`.
- `src/components/ai/office/SkillEditorDrawer.tsx` (whole file, 156 lines); `src/components/ai/office/SkillCard.tsx` (whole file, 71 lines); `src/components/ai/office/TeamWorkspace.tsx:190-240, 295-330, 540-580, 737-800, 930-1000`; `src/workbench/toolwindows/AiStaffExplorer.tsx` (whole file, 359 lines); `src/workbench/toolwindows/LeftToolWindow.tsx:18, 37, 141`; `src/workbench/WorkbenchLayout.tsx:64-72`; `src/workbench/EditorArea.tsx:590-600`; `src/views/AiOfficeView.tsx:280-330`.
- `src/services/ai/aiTools.ts:4700-4785, 4878-4990`; `src/services/ai/aiOrchestratorLoop.ts:21-45, 390-420`; `src/services/ai/chatTurnTools.ts:1-60`.
- `src/services/backup/exportBackup.ts:200-350`; `restoreBackup.ts:45-80, 190-220, 260-325`; `validateBackup.ts:245-270, 550-575, 630-680`; `src/services/localSqlitePersistence.ts:16-40, 95-130`; `src-tauri/src/sqlite_persistence.rs:1-40`.
- `.planning/scripts/verify-team-chat-architecture.sh:1-80`.
- Tests: `tests/services/ai/office/aiSkillVersionRepo.test.ts` (whole file), `teamTools.test.ts:1-100, 262-295, 640-665`, `teamPrompts.test.ts:1-40, 110-125`, `teamRunCoordinator.test.ts:15-60, 113-250, 410-450, 1270-1300, 1490-1520`, `aiOfficeRepo.test.ts:160-280`, `tests/ai/aiTools.test.ts:397-413`, `tests/ai/chatTurnRuntime.test.ts:43-60, 756-850`, `tests/ai/PatchDiffApprovalCard.test.tsx`, `tests/services/backup/officeBackup.test.ts:140-170, 250-300, 415-430`, `tests/workbench/AiExplorers.test.tsx:15-190`, `tests/views/AiOfficeView.test.tsx:250-280`, `tests/db/tableListParity.test.ts:45-110`, `tests/db/schemaV22Migration.test.ts:60-80`.
- `.planning/phases/38-hard-token-budget-accurate-measurement/38-RESEARCH.md` (shape + scoped-test convention); `38-01-PLAN.md:100`, `38-03-PLAN.md:90,122,160`.
- `.planning/research/PITFALLS.md:480-550` (Pitfalls 18-20); `.planning/research/SUMMARY.md` §Phase 39; `.planning/research/ARCHITECTURE.md:83, 100, 236, 270`.
- `.planning/REQUIREMENTS.md:75-83`; `.planning/MILESTONE-CONTEXT.md:40-43, 61-62`; `.planning/ROADMAP.md` §Phase 39.
- **Executed probe** against `dexie@4.4.6` + `fake-indexeddb@6.2.5` (project's own versions): compound-index behaviour with missing/duplicate `version`, `getLatestSkillVersion` with pending-only rows, sort stability, `validateBackup` duplicate-key replay, `positive()` vs `nonnegative()` under zod 4.6.5, `FORBIDDEN_BACKUP_KEYS` regex against 8 candidate names.
- **Executed** `npx vitest run tests/services/ai/office/aiSkillVersionRepo.test.ts` → 9 passed (baseline is green).

### Secondary (MEDIUM confidence)
- None required — no external documentation was needed. Every claim is either a code fact or a locally reproduced behaviour.

### Tertiary (LOW confidence)
- None. No provider behaviour, no third-party API, no version-sensitive external contract is involved.

## Metadata

**Confidence breakdown:**
- Current-code facts and anchors: **HIGH** — every file:line above was opened or grepped this session; the 9-test baseline was executed.
- D-14 blast radius: **HIGH** — exhaustive grep of every `aiSkillVersions` reader (8 files) plus a live Dexie probe reproducing the index, sort, and duplicate-guard behaviour.
- D-15 backup forward-compat: **HIGH** — the `strictObject`/optional pattern was verified with the project's zod, and the envelope-bump rule is stated verbatim in the code's own comment.
- D-17/D-18 execution path: **HIGH** on the mechanics (all three `createAssignment` sites and `AttemptRef` read); **MEDIUM** on the retry semantics, which is a genuine open question (A2).
- D-05 gate mechanism: **HIGH** — both the loop guard and the read-only branch were read; the existing `payloadHasMutationTool` assertions at `teamRunCoordinator.test.ts:444,1508` are a ready-made guard.
- D-24 card generalization: **MEDIUM** — the card's prop contract and its existing stale/disabled behaviour are verified, but the second render site (transcript extension) does not exist yet and its exact shape is a design choice.
- Testing strategy: **HIGH** — the command pattern is copied from Phase 38's plans and the config was read.

**Research date:** 2026-11-14
**Valid until:** 2026-12-14 (stable area — no external dependencies, no provider contracts; the only expiry risk is concurrent edits to the files listed above)
