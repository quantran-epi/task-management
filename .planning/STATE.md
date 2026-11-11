---
gsd_state_version: "1.0"
milestone: v1.4
milestone_name: Unified AI Office (Phase Details)
current_phase: 37
current_phase_name: Runtime reliability + concurrency
status: executing
stopped_at: Completed 37-07-PLAN.md
last_updated: "2026-11-11T21:35:20.588Z"
last_activity: 2026-11-12
last_activity_desc: Phase 37 execution started
state_head: 06ff92d726a5e24624713c34f0cd779afcd4680f
progress:
  total_phases: 6
  completed_phases: 3
  total_plans: 25
  completed_plans: 24
  percent: 50
---

# Project State: TaskMate — Milestone v1.4

See: .planning/PROJECT.md (updated 2026-11-09)

**Core value:** Hợp nhất SDLC Studio và AI Office thành Unified AI Office dạng chat-first, free-style với token budget cứng và làm giàu skill.
**Current focus:** Phase 37 — Runtime reliability + concurrency

## Current Position

Phase: 37 (Runtime reliability + concurrency) — EXECUTING
Plan: 8 of 8
Status: Ready to execute
Last activity: 2026-11-12 — Phase 37 execution started

## Session Continuity

Last session: 2026-11-11T21:35:20.272Z
Stopped at: Completed 37-07-PLAN.md
Resume file: None

Progress: [█████░░░░░] 50%

## Milestone v1.4 Map

- [x] Phase 35: Shared-primitive extraction + SDLC behavior removal
- [x] Phase 36: Data model, multi-chat identity, backup/migration
- [ ] Phase 37: Runtime reliability + concurrency
- [ ] Phase 38: Hard token budget + accurate measurement
- [ ] Phase 39: Skill versioning + enrichment approval
- [ ] Phase 40: Explorer UX, CRUD correctness, observed walkthrough

## Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 261111-c35 | Fix WR-05 + WR-10 data-safety warnings from phase 36 review | 2026-11-11 | 505e780d | [261111-c35-fix-wr-05-wr-10-data-safety-warnings-fro](./quick/261111-c35-fix-wr-05-wr-10-data-safety-warnings-fro/) |
| 261111-d2p | Close remaining phase-36 review findings: WR-07/08/09/11/12 and IN-01..IN-04/06/07/08, record WR-13 in ROADMAP phase 38 | 2026-11-11 | 89186433 | [261111-d2p-close-phase-36-review-findings-part-two](./quick/261111-d2p-close-phase-36-review-findings-part-two/) |

## Accumulated Context

- Phase 34 marked complete with zero tests covering the AI Office runtime and five live defects (hung batch run, unguarded double-submit, phantom active turn, `targetAgentId` stripped on restore, bare deletes breaking export). "Phase 34 complete" is not evidence of quality.
- Research verdict: keep and harden the existing coordinator/budget gate; zero new npm dependencies.
- Phase 35 completed under fresh-data-only scope: SDLC schema modules removed, no legacy compatibility requirement. Targeted tests/typecheck/build passed; exact copy, legacy-layout walkthrough, and existing unrelated selector test recorded as non-blocking debt.
- Seven surviving modules import SDLC code on the hot path — extraction must precede deletion.

## Decisions

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
