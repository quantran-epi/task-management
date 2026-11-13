---
gsd_state_version: 1.0
milestone: v1.4
milestone_name: Unified AI Office
status: verifying
stopped_at: Completed 38-09-PLAN.md
last_updated: "2026-11-13T15:49:43.338Z"
last_activity: 2026-11-13 -- Phase 38 plan 10 complete (js-tiktoken pinned, real o200k_base BPE counting)
progress:
  total_phases: 7
  completed_phases: 3
  total_plans: 48
  completed_plans: 44
  percent: 43
current_phase: 38
current_phase_name: Hard token budget + accurate measurement
---

# Project State: TaskMate — Milestone v1.4

See: .planning/PROJECT.md (updated 2026-11-09)

**Core value:** Hợp nhất SDLC Studio và AI Office thành Unified AI Office dạng chat-first, free-style với token budget cứng và làm giàu skill.
**Current focus:** Phase 38 — hard-token-budget-accurate-measurement

## Current Position

Phase: 38 (hard-token-budget-accurate-measurement) — EXECUTING
Plan: 12 of 12
Status: Phase complete — ready for verification
Last activity: 2026-11-13 -- Phase 38 plan 10 complete (js-tiktoken pinned, real o200k_base BPE counting)

## Session Continuity

Last session: 2026-11-13T15:49:43.332Z
Stopped at: Completed 38-09-PLAN.md
Resume file: None

Progress: [█████████░] 90%

## Milestone v1.4 Map

- [x] Phase 35: Shared-primitive extraction + SDLC behavior removal
- [x] Phase 36: Data model, multi-chat identity, backup/migration
- [ ] Phase 37: Runtime reliability + concurrency
- [ ] Phase 37.1: Live steering — leader amends assignments, steers running agents (INSERTED)
- [ ] Phase 38: Hard token budget + accurate measurement
- [ ] Phase 39: Skill versioning + enrichment approval
- [ ] Phase 40: Explorer UX, CRUD correctness, observed walkthrough

## Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 261111-c35 | Fix WR-05 + WR-10 data-safety warnings from phase 36 review | 2026-11-11 | 505e780d | [261111-c35-fix-wr-05-wr-10-data-safety-warnings-fro](./quick/261111-c35-fix-wr-05-wr-10-data-safety-warnings-fro/) |
| 261111-d2p | Close remaining phase-36 review findings: WR-07/08/09/11/12 and IN-01..IN-04/06/07/08, record WR-13 in ROADMAP phase 38 | 2026-11-11 | 89186433 | [261111-d2p-close-phase-36-review-findings-part-two](./quick/261111-d2p-close-phase-36-review-findings-part-two/) |
| 261113-ita | Fix team notification focus, unread viewport and missing-leader warning | 2026-11-13 | e8ce7e4f | [261113-ita-fix-confirmed-team-chat-focus-unread-and](./quick/261113-ita-fix-confirmed-team-chat-focus-unread-and/) |
| 261113-ko9 | Restore last-read chat position, viewport read receipts, collapse plans and expose leader budget wait | 2026-11-13 | fa96058b | [261113-ko9-open-team-chat-at-latest-messages-and-co](./quick/261113-ko9-open-team-chat-at-latest-messages-and-co/) |

## Accumulated Context

### Roadmap Evolution

- Phase 37.1 inserted after Phase 37 (URGENT): Live steering — leader amends assignments and steers running agents mid-run. Scope deferred from 37-CONTEXT.md D-19: outbox+inbox agent, drain at `beforeToolRound`, `amend_assignments` tool, leader re-plan mid-batch, steer UI.

- Phase 34 marked complete with zero tests covering the AI Office runtime and five live defects (hung batch run, unguarded double-submit, phantom active turn, `targetAgentId` stripped on restore, bare deletes breaking export). "Phase 34 complete" is not evidence of quality.
- Research verdict: keep and harden the existing coordinator/budget gate; zero new npm dependencies.
- Phase 35 completed under fresh-data-only scope: SDLC schema modules removed, no legacy compatibility requirement. Targeted tests/typecheck/build passed; exact copy, legacy-layout walkthrough, and existing unrelated selector test recorded as non-blocking debt.
- Seven surviving modules import SDLC code on the hot path — extraction must precede deletion.

## Decisions

- [Phase 37.1]: D-24: `delegate_batch` returns an ack `{dispatched,batchId,status,agents[]}`; settled results reach the lead only through the synthesis turn opened by `onBatchSettled`
- [Phase 37.1]: Agent cancellation is owned by a per-batch `AbortController`; the leader tool-call signal is never wired to an agent
- [Phase 37.1]: The `kind:'unfinished'` tail travels in the synthesis prompt (`KẾT QUẢ CỦA LÔ`), not in the tool result
- [Phase 37.1]: `usageTotals` is keyed per TURN (`usageBaselineKey`), so the dispatch turn's tokens survive the synthesis turn
- [Phase ?]: D-01: Global conventions stored in Dexie settings under global_conventions key
- [Phase ?]: D-02: GlobalConventionsCard embedded inside SDLC / AI tab of SettingsView
- [Phase ?]: D-03: Setting key complies with isSafeBackupSetting whitelist, included in encrypted backups
- [Phase ?]: D-04: Empty state returns empty string without generating default/fabricated text
- [Phase 31]: D-09: Conventions segment placed between toolPolicy and fewShot layers inside untrusted delimiters
- [Phase 31]: D-10: Global conventions precede repository conventions in prompt segment
- [Phase 31]: D-11: Mandatory CONVENTIONS_CONFLICT_POLICY requires AI to cite both sources and stop for user resolution
- [Phase 31]: D-12: Entire convention document retained without character caps or truncation
- [Phase 31]: D-13: ConventionsSummaryCard renders on Step 1 and Step 2 with manual refresh and detail modal
- [Phase 31]: D-14: ResponseEnvelope<T> and correlationId mandate verified in SOLUTION prompt without user prompt mention
- [Phase 31]: D-15: Conflict witness test confirms both sources and CONVENTIONS_CONFLICT_POLICY are surfaced cleanly
- [Phase 31.1]: D-16: systems table added in Dexie SCHEMA_V15; projects table migrated to changeRequests with backward-compatibility for tasks
- [Phase 31.1]: D-17: 3 explicit CR types with designated colors: New Feature (#1677ff), Enhancement (#52c41a), Bugfix (#faad14)
- [Phase 31.1]: D-18: Subsystems own SSH profiles and repository paths; CRs multi-target subsystems
- [Phase 31.1]: D-19: Systems Explorer accessed via Left Stripe (Alt+6) and Search Everywhere; TitleBar kept uncluttered
- [Phase 31.1]: D-20: ChangeRequestTable exhibits 3 CR type badges (#1677ff, #52c41a, #faad14) and cyan subsystem chips
- [Phase 31.1]: D-21: ProjectExplorer displays CR nodes with type icons and target system pills, preserving task/milestone tree
- [Phase 31.1]: D-22: loadMultiRepoConventions aggregates CONVENTIONS.md across all target subsystems of CR, layered with system code headers
- [Phase 31.1]: D-23: SDLC Studio Step 3 dynamically provides Subsystem Switcher to inspect diffs and branches across multi-system CRs
- [Phase 31.2]: D-24: systems table holds both LOGICAL_GROUP and deployable types; parent has no ssh/repo/branch, subsystem binds exactly one remote repo
- [Phase 31.2]: D-25: changeRequests stores targets: CrTarget[] ({ systemId, featureBranch? }) instead of targetSystemIds; only deployable subsystems allowed; featureBranch defaults to feature/{cr.code} and is stored explicitly, baseBranch stays on the subsystem
- [Phase 31.2]: D-26: Task.crId required, Task.systemId optional and must belong to cr.targets
- [Phase 31.2]: D-27: projects and milestones tables removed from Dexie; test data reset allowed, no shadow aliases
- [Phase 31.2]: D-28: SDLC workflow state keyed by crId; per-subsystem content lives inside steps, not as separate workflows
- [Phase 31.2]: D-29: CR Explorer is default left tool window (Alt+1), tree CR -> Subsystem -> Task, no Milestone tier
- [Phase 31.2]: D-30: Systems Explorer parent nodes have no create-CR action; subsystem nodes do, pre-selecting themselves
- [Phase 31.2]: D-31: Clicking a CR opens a ChangeRequestDetailView tab, never a popup or inline swap
- [Phase 31.2]: D-32: CR Detail is a single screen: header, 6-step progress strip, flat task table with Subsystem column, collapsed Jira/docs block
- [Phase 31.2]: D-33: SystemDetailView has 4 tabs; Git & Branches tab exists only for subsystems
- [Phase 31.2]: D-35: 1-click Git sets activeRemoteTarget and opens the LEFT `remote_explorer` tool window (amended — no bottom Remote Git panel exists); 1-click Terminal opens the bottom Terminal; both disabled with Catalog link when unconfigured
- [Phase 31.2]: D-36: SDLC Studio is 3 zones (sidebar with CR picker + steps + Subsystems & Repos, workspace with context bar, step chat)
- [Phase 31.2]: D-37: Subsystems & Repos is read-only observation; editing stays in System Catalog
- [Phase 31.2]: D-38: selectedSystemId lives at SDLC view level and drives both Step 3 and Step 4; bar hidden for single-subsystem CRs
- [Phase 31.2]: D-39: Step 2 solution is split into one section per subsystem with repo-scoped conventions
- [Phase 31.2]: D-40: Step 4 packs per subsystem card plus Pack All with per-subsystem failure reporting; drift matrix is one table with a Subsystem column
- [Phase 31.2]: D-41: AI subsystem proposals are structured artifacts constrained to existing Catalog ids
- [Phase 31.2]: D-42: Proposals never auto-attach; user ticks and confirms before cr.targets changes
- [Phase 31.2]: D-43: Proposals can supplement an already-populated CR, listing only the missing subsystems
- [Phase 31.2]: D-44: Delete components/projects, ProjectsView, ProjectExplorer, RepoConfigView; rename ProjectSdlcView; rewrite CRExplorer; add CR Detail, SubsystemsReposPanel, SubsystemContextBar, SubsystemProposalCard
- [Phase 31.2]: D-45: All project/milestone tests removed or rewritten; new invariant and proposal-gate tests added
- [Phase 31.2]: D-46: Global Tasks tab stays; axes become CR + Subsystem (filter, table columns, TaskDrawer form, QuickAddBar)
- [Phase 31.2]: D-47: ItemInsightView itemType drops project/milestone, adds cr/system
- [Phase 31.2]: D-48: ChatScopeType drops project/milestone, adds cr/system; old project/milestone threads deleted on upgrade (test data, acceptable loss)
- [Phase 31.2]: D-49: Backup schema version bumped; legacy backups containing projects/milestones rejected with explicit message, never auto-mapped
- [Phase 31.2]: D-50: Every label surface (notifications, standup, dayInsight, weekly planner, dashboard, timer, feasibility, palette, selectionContext, filter, recurrence, docx export) resolves names from CR/Subsystem instead of Project
- [Phase 31.2]: D-51: Left stripe id renamed projects -> cr_explorer with layout persist key bump
- [Phase 31.2]: D-52: Mandatory execution order — schema/types/Zod/repo first, then legacy deletion, then daily surfaces, then CR/System views, then SDLC, then AI proposal, then tests
- [Phase 31.2]: D-53: Step 3 reads featureBranch from cr.targets and baseBranch from system; no branch-name guessing from crCode
- [Quick 261109-eme]: Refactor AI Office & Staff to Left Stripe tool windows (ai_office on top, ai_staff above remote_explorer); open dedicated staff_detail and team_workspace editor tabs; hide Ghost Dev entry points
- [Phase 38]: D-23 parity is membership per table per list, never length equality — at HEAD the lists differ (35 Dexie / 27 TS+local / 27 Rust) for reasons outside phase 38, so a length gate would be false and un-greenable
- [Phase 38]: No Rust or SQLite structural change for the new columns — they ride inside opaque `payload_json` rows; `aiTeams`/`aiTeamMembers` were already in `ALLOWED_TABLES`
- [Phase 37-runtime-reliability-concurrency]: Ledger lands at Dexie V22 (V20/V21 taken by post-36 repairs); transitionAssignment is the only runStatus writer and returns null on a lost race; attemptNo allocated inside the insert transaction so retries append 2,3 never 2,2; concurrencyLimit default 3, range 1-12, clamped at the trust boundary.
- [Phase 37]: Scheduler acquire(signal) requires the signal; cancel(handle) is release-equivalent only — a queued assignment is cancelled by aborting its own AbortController (no handle exists before admission)
- [Phase 37]: Coordinator phase writes all route through setPhase(), which drops the write and its notify() once disposed, so runBatch/topUp tails cannot resurrect a dead run
- [Phase 37]: teamRunManager deletes the map entry before awaiting a stale dispose, so a concurrent get during the dispose window constructs fresh rather than observing a half-torn-down coordinator
- [Phase 37]: diagnosticDetail stripped by row projection (projectSafeAssignment) in export AND captureSnapshot, not at envelope level
- [Phase 37]: assignment backup record omits diagnosticDetail entirely so a hand-crafted payload carrying it is rejected by strictObject
- [Phase 37]: parity test pins LATEST_SCHEMA_VERSION = 22 so a future schema bump cannot silently desync its store source
- [Phase 37]: finalizeAttempt is exported on the coordinator interface so 37-04 and the concurrency test share one terminal writer
- [Phase 37]: a userStopped marker is required: settleAgent state cannot prove who ended the turn, and without it the ledger recorded done for a stopped attempt
- [Phase 37]: 37-04: dispatchAssignment owns the whole acquire->start->settle->release span; release happens only in its finally
- [Phase 37]: 37-04: userStopped is a Map<agentId, stopReason> so the stop path and the settle path record the same reason
- [Phase 37]: 37-04: the report-link stamp and finalizeAttempt share one rw transaction, so a settled attempt can never own two bubbles
- [Phase 37]: 37-06: a throw inside sendTurn is a fourth blocked cause (TURN_FAILED) — draft restored, text never dropped
- [Phase 37]: 37-06: the API-error-card retry shares the composer's BUSY_PHASES entry rule, so one decision governs every dispatch path
- [Phase 37]: retryAssignment claims the assignment id before any await and checks it before the busy-phase guard, so a double click is ignored rather than refused as a busy team
- [Phase 37]: the delegate_batch result keeps its array shape and gains a final kind:'unfinished' entry, because a wrapper object would break every caller and the tool contract
- [Phase 37]: persisted message.runStatus beats the live agentStatus: terminal agents are filtered out of snapshot.agents, so a stopped attempt has no live status and a remount has none at all
- [Phase ?]: beforeToolRound returns messages instead of being fire-and-forget; the loop appends them verbatim
- [Phase ?]: The round-boundary hook runs after in-loop compaction and fires on round 1 too
- [Phase 37.1]: 'steer' is widened in all six messageKind declarations at once — a partial widen either fails tsc or silently strips the row on restore
- [Phase 37.1]: steerMessageIds is declared on the strictObject assignment backup schema (an undeclared key fails loudly) and is safe against the forbidden-key gate
- [Phase 37.1]: the steer contract adds no table, no Dexie version and no BACKUP_SCHEMA_VERSION bump — every addition is optional
- [Phase ?]: The amend validator owns argument shape only; ledger membership stays in the coordinator, the only holder of openBatchId
- [Phase ?]: A non-queued row refuses the whole amend list, so the leader's report always matches the ledger
- [Phase ?]: Amend-cancel sets userStopped before aborting so leader-amend wins the from:queued guard; a rewrite appends an attempt and re-dispatches it
- [Phase 37.1]: Team chat UI: a queued-only pending set still renders the indicator trigger so Stop stays reachable
- [Phase 37.1]: AgentLiveStep is runtime-only; the delivered-steer set is derived from a batchId-scoped read because steerMessageIds is unindexed
- [Phase 38]: Migration tests assert against LATEST_SCHEMA_VERSION instead of a literal so a schema bump cannot re-break them
- [Phase 38]: V25 is purely additive with no .upgrade() hook; split usage columns are optional on the type and seeded 0 on every write path
- [Phase ?]: AIO-BUDGET-01/09 keep their unchecked box; the override note records the decision and the checkmark lands when the implementation plans close
- [Phase ?]: ROADMAP.md criteria 1 and 6 were already warning-only at HEAD, so plan 38-02 was a verify-and-noop for that file
- [Phase 38]: incrementMemberUsage is the atomic delta sink; usedTokens stays the legacy scalar until plan 09
- [Phase 38]: splitEvenly in budgetSplit.ts is the single home of the even-split rule; evenSplitRows is a thin adapter
- [Phase 38]: backup envelope v14 and the nine-file fixture sweep ship in one changeset; validateBackup.ts stays unchanged because the record schemas already own the numeric guards
- [Phase 38]: Out-of-band threshold reads fall back to 80 rather than clamping: a corrupt row is treated as unset, not silently rewritten to a boundary the user never chose
- [Phase 38]: ai_budget_warn_threshold_pct passes isSafeBackupSetting by construction; a test pins it so a future suffix rule cannot silently drop it
- [Phase 38]: The legacy BudgetGate stays byte-identical until plan 08; budgetGate.ts's docstring states this tree is not gate-free yet
- [Phase 38]: Override and effective threshold are two snapshot fields; the override key is omitted when inheriting (exactOptionalPropertyTypes), never set to undefined
- [Phase 38]: nextThresholdOverride(undefined) is the only clear mechanism — no separate clear method exists
- [Phase 38]: tests/helpers/teamRunSnapshot.ts owns the snapshot stub; five drifted literals collapsed into it
- [Phase 38]: applyTopUp (additive) and applyTeamBudgetSettings (absolute) are separate repo verbs, each one rw transaction over [aiTeams, aiTeamMembers]; mixing them is the double-increment bug
- [Phase 38]: The roster is read inside the top-up transaction, never from the coordinator cache — WR-13's membersLoaded early return is off the path
- [Phase 38]: The coordinator mirrors a persisted budget result (applyBudgetSettings) and never re-derives a delta; null and undefined both mean inherit at that boundary
- [Phase 38]: applyTeamBudgetSettings clamps rather than zod-validates the threshold on purpose: zod refuses 0 at the trust boundary, the settings path clamps 0 to 1 as a runtime belt
- [Phase 38]: The pre-call token estimate lives on the accounting record only, never in the live charge maps, so a guess cannot park a turn the reported number would not have parked
- [Phase 38]: An estimated charge updates live counters but skips gate evaluation — D-07 says an estimate is never a decision, and plan 08 deletes the gate
- [Phase 38]: flushAccounting marks the key flushed BEFORE awaiting the increment; that guard, not a zeroed record, is the duplicate-charge defence
- [Phase 38]: The employee turn's finally flushes and reconciles too, covering mention-started turns that own no attempt row
- [Phase 38]: tokenEstimate loads js-tiktoken through widened string specifiers with @vite-ignore so an absent package reaches the runtime catch; plan 10 switches them to literal lazy subpaths
- [Phase 38]: js-tiktoken is pinned at exactly 1.0.21 and imported only through the lite + ranks/o200k_base subpaths (never the 5 MB root), so the tokenizer lands in its own lazy chunk
- [Phase 38]: The Vietnamese token-count test asserts a positive integer, stability and inequality with chars÷4 — never a direction, because o200k_base can land either side of the heuristic
- [Phase 38]: Two failure seams, not one: a rejecting loader proves the absent-package path, a throwing encode proves the present-but-failing path; both degrade to chars÷4
- [Phase ?]: Budget warning identity is (teamId, level): the member level dispatches once per team, never once per teammate
- [Phase ?]: budgetWarnings.member is the aggregate flag; the per-member badge stays plan 09's surface
- [Phase ?]: pausedAgentId/pausedAgentName stay on the snapshot as always-null legacy fields because the parked phase value is still legal in old backups
- [Phase ?]: Split budget rendering sums every member row so the header agrees with the ledger the coordinator reconciles against
- [Phase ?]: A provisional pre-call measurement renders with the ~ estimate marker because it is not a provider number
- [Phase ?]: AgentPausedBanner deleted: awaiting-budget has no producer and its copy claimed a parked turn plus a literal 80%

## Performance Metrics

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 37-runtime-reliability-concurrency P01 | 6 min | 3 tasks | 10 files |
| Phase 37 P02 | 15 min | 3 tasks | 6 files |
| Phase 37 P05 | 10 min | 3 tasks | 18 files |
| Phase 37 P03 | 68 min | 3 tasks | 5 files |
| Phase 37 P04 | 48 min | 3 tasks | 10 files |
| Phase 37 P06 | 32 min | 3 tasks | 6 files |
| Phase 37 P07 | 42 min | 2 tasks | 5 files |
| Phase 37 P08 | 22 min | 2 tasks | 8 files |
| Phase 37.1 P01 | 55 min | 3 tasks | 2 files |
| Phase 37.1 P02 | ~12m | 3 tasks | 4 files |
| Phase 37.1 P03 | ~6m | 3 tasks | 7 files |
| Phase 37.1 P05 | 12 | 2 tasks | 4 files |
| Phase 37.1 P06 | 35m | 3 tasks | 12 files |
| Phase 38 P01 | 4min | 3 tasks | 9 files |
| Phase 38 P02 | 2min | 2 tasks | 1 files |
| Phase 38 P03 | 3min | 3 tasks | 4 files |
| Phase 38 P10 | 5min | 2 tasks | 4 files |
| Phase 38 P06 | 4min | 3 tasks | 10 files |
| Phase 38 P11 | 2min | 2 tasks | 4 files |
| Phase 38 P05 | 12min | 3 tasks | 10 files |
| Phase 38 P12 | 4min | 2 tasks | 3 files |
| Phase 38 P04 | 7min | 3 tasks | 7 files |
| Phase 38 P07 | 22min | 3 tasks | 9 files |
| Phase 38 P08 | 14min | 3 tasks | 8 files |
| Phase 38 P09 | 26min | 3 tasks | 12 files |
