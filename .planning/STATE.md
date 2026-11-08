---
gsd_state_version: 1.0
milestone: v1.3
milestone_name: SDLC Closed-Loop Engine & Repository Autonomy
status: executing
last_updated: "2026-11-08T06:11:28.606Z"
last_activity: 2026-11-07 -- Phase 31.2 execution started
progress:
  total_phases: 11
  completed_phases: 7
  total_plans: 58
  completed_plans: 26
  percent: 45
current_phase: 31.2
current_phase_name: enterprise-systems-catalog-and-cr-normalization
---

# Project State: TaskMate — Milestone v1.3

See: .planning/PROJECT.md (updated 2026-11-03)

**Core value:** Make planned work realistically fit available time while giving the personal user evidence-grounded access to their local banking IT knowledge.
**Current focus:** Phase 31.2 — enterprise-systems-catalog-and-cr-normalization

## Current Position

Phase: 31.2 (enterprise-systems-catalog-and-cr-normalization) — EXECUTING
Plan: 1 of 24
Status: Ready to execute
Last activity: 2026-11-07 -- Phase 31.2 execution started

Phase sequence: 26 → 27 → 28 → 29 → 29.1 → 30 → 31 → 31.1
(28 is independent of 26/27; 31 depends on 26 and 27; 31.1 depends on 31.)

## Session Continuity

Last session: 2026-11-07T11:21:41.570Z
Resume file: .planning/phases/31.2-enterprise-systems-catalog-and-cr-normalization/31.2-UI-SPEC.md

Progress: [███████░░░] 70%

## Milestone v1.3 Map

- [x] Phase 25.4: IntelliJ EXPUI Workbench UI/UX Migration
- [x] Phase 25.5: TaskMate Workbench UI/UX Precision Layout
- [x] Phase 26: Grounded Context & Safe Model Protocol
- [x] Phase 27: Studio Artifact Tools & Diff Approval
- [ ] Phase 28: Query-Only Knowledge Retrieval
- [x] Phase 29: Safe Local Agent Automation
- [x] Phase 29.1: Remote SSH Git Explorer & Headful Claude Code Terminal Flow
- [ ] Phase 30: Automatic Change Packs, Fallback & Run Reliability
- [x] Phase 31: Organization Conventions in the Solution Pipeline
- [x] Phase 31.1: Enterprise Systems Catalog & CR Transformation (COMPLETE)
- [ ] Phase 32: External Research via Claude Code

## Performance Metrics

| Phase | Plan | Duration | Notes |
|-------|------|----------|-------|
| Phase 25.4 P04 | 10 min | 2 tasks | 8 files |
| Phase 25.4 P03 | 10 min | 2 tasks | 7 files |
| Phase 25.4 P02 | 15 min | 2 tasks | 7 files |
| Phase 25.4 P01 | 15 min | 3 tasks | 7 files |
| Phase 25.3 P13 | 30 min | 3 tasks | 6 files |
| Phase 25.3 P16 | 15 min | 2 tasks | 2 files |
| Phase 27 P01 | 38 min | 3 tasks | 11 files |
| Phase 27 P02 | 33 min | 3 tasks | 8 files |
| Phase 27 P05 | 16 min | 2 tasks | 6 files |
| Phase 27 P03 | 46 min | 2 tasks | 6 files |
| Phase 27 P04 | 24 min | 2 tasks | 7 files |
| Phase 29.1 P01 | 8 min | 3 tasks | 9 files |
| Phase 29.1 P02 | 40 min | 3 tasks | 10 files |
| Phase 29.1 P03 | 10 min | 3 tasks | 13 files |
| Phase 30 P01 | 19 min | 2 tasks | 3 files |
| Phase 30 P02 | 13 min | 2 tasks | 3 files |
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 31.1 P04 | 12m | 2 tasks | 8 files |
| Phase 31.1 P03 | 10m | 2 tasks | 7 files |
| Phase 31.1 P02 | 12m | 2 tasks | 10 files |
| Phase 31.1 P01 | 15m | 2 tasks | 11 files |
| Phase 30 P03 | 9min | 2 tasks | 2 files |
| Phase 31 P01 | 10m | 2 tasks | 4 files |
| Phase 31 P02 | 12m | 2 tasks | 3 files |
| Phase 31 P03 | 10m | 3 tasks | 8 files |
| Phase 31 P04 | 5m | 2 tasks | 1 file |

## Accumulated Context

- Phase 26 grounded context + bounded tool loops verified.
- Phase 27 artifact diff cards + scoped approval verified.
- Phase 25.4/25.5 IntelliJ workbench + SSH & SFTP backend verified.
- Phase 29.1 Remote SSH Git Explorer + headful interactive terminal in bottom panel verified.
- Phase 31.1 Enterprise Systems Catalog & CR Transformation verified.

## Quick Tasks Completed

| Task | Date | Scope | Outcome |
|------|------|-------|---------|
| `261106-rfe-remote-explorer-picker-and-step2-header-fix` | 2026-11-06 | RemoteGitExplorer & Step2SolutionView | Added remote folder picker modal via SFTP; fixed Step 2 header title nowrap & flex wrap |
| `261107-0cw-fix-remote-file-explorer-state-loss-when` | 2026-11-06 | RemoteGitExplorer & layoutStore | Auto-reload branches and tree on remount; retain selected branch across toolwindow toggles |
| `261107-0jk-support-uncommitted-files-in-remotegitex` | 2026-11-06 | RemoteGitExplorer & BottomToolWindow | Show uncommitted files with status tags; fallback reader for untracked; inline rename for xterm tabs |
| `20261107-sdlc-repo-config-tab` | 2026-11-07 | SDLC Sidebar & RepoConfigView & Step3 | Added dedicated "Cấu hình Repo & SSH" tab to SDLC sidebar; explicit save button and conventions card to Step 3 |
| `20261107-ai-chat-conventions` | 2026-11-07 | AIChatDrawer & conventionService | Wires Global and Repo conventions into General AI Chat systemPromptContent with fail-safe resolution |
| `261107-repo-path-picker-cr-explorer` | 2026-11-07 | SystemModal, CR Explorer, SdlcSidebar, SystemsExplorer | Added SSH remote directory picker; rebranded CR Explorer with New CR button; unified SDLC Studio on CR; opened SystemDetailView on system click |
| `261108-hga-cai-thien-icon-workbench` | 2026-11-08 | Workbench Layout, TitleBar, EditorArea, Explorers | Redesigned Diagram icon to flowchart; added 3D isometric Systems icon, Git branch Remote icon, SDLC infinity loop; added tab icons to EditorArea; synchronized tree view folder/leaf icon system |

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
