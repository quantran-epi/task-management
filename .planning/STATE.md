---
gsd_state_version: 1.0
milestone: v1.3
milestone_name: SDLC Closed-Loop Engine & Repository Autonomy
status: complete
last_updated: "2026-11-07T09:38:00.000Z"
last_activity: 2026-11-07 -- Phase 31 execution completed
progress:
  total_phases: 9
  completed_phases: 6
  total_plans: 26
  completed_plans: 21
  percent: 60
current_phase: 31
current_phase_name: organization-conventions-in-the-solution-pipeline
---

# Project State: TaskMate — Milestone v1.3

See: .planning/PROJECT.md (updated 2026-11-03)

**Core value:** Make planned work realistically fit available time while giving the personal user evidence-grounded access to their local banking IT knowledge.
**Current focus:** Phase 31 — organization-conventions-in-the-solution-pipeline

## Current Position

Phase: 31 (organization-conventions-in-the-solution-pipeline) — COMPLETE
Plan: 4 of 4
Status: Phase complete
Last activity: 2026-11-07 -- Plan 31-04 completed (SDLC-CONV-06 exemplar and conflict witness tests)

Phase sequence: 26 → 27 → 28 → 29 → 29.1 → 30 → 31
(28 is independent of 26/27; 31 depends on 26 and 27.)

## Session Continuity

Last session: 2026-11-07T09:38:00.000Z
Resume file: None

Progress: [██████░░░░] 60%

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

## Quick Tasks Completed

| Task | Date | Scope | Outcome |
|------|------|-------|---------|
| `261106-rfe-remote-explorer-picker-and-step2-header-fix` | 2026-11-06 | RemoteGitExplorer & Step2SolutionView | Added remote folder picker modal via SFTP; fixed Step 2 header title nowrap & flex wrap |
| `261107-0cw-fix-remote-file-explorer-state-loss-when` | 2026-11-06 | RemoteGitExplorer & layoutStore | Auto-reload branches and tree on remount; retain selected branch across toolwindow toggles |
| `261107-0jk-support-uncommitted-files-in-remotegitex` | 2026-11-06 | RemoteGitExplorer & BottomToolWindow | Show uncommitted files with status tags; fallback reader for untracked; inline rename for xterm tabs |
| `20261107-sdlc-repo-config-tab` | 2026-11-07 | SDLC Sidebar & RepoConfigView & Step3 | Added dedicated "Cấu hình Repo & SSH" tab to SDLC sidebar; explicit save button and conventions card to Step 3 |
| `20261107-ai-chat-conventions` | 2026-11-07 | AIChatDrawer & conventionService | Wires Global and Repo conventions into General AI Chat systemPromptContent with fail-safe resolution |

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
