# Phase 48: Agent Developer Workbench - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-21
**Phase:** 48-Agent Developer Workbench
**Areas discussed:** product flow, UI source of truth, worktree confinement, diff review, synchronization, quality bar
**Mode:** autonomous; user explicitly requested no further questions and review only at phase completion.

---

## Product Flow and UI Source of Truth

| Option | Description | Selected |
|--------|-------------|----------|
| Keep chat UI and add Coding Zone layer | Preserve existing AI team chat, open Coding Zone modal from chat/activity | ✓ |
| Redesign team chat around Coding Zone | Replace or restyle existing chat surface | |
| Standalone coding workspace only | Drop team-chat integration | |

**User's choice:** Keep chat UI and add Coding Zone layer.
**Notes:** User liked the approved draft UI and wants it implemented similarly.

## Popout Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Popout Coding Zone | Open real secondary window with tree, tabs/diff, compact chat strip | ✓ |
| Popout chat | Open chat in secondary window | |
| No popout | Modal only | |

**User's choice:** Popout Coding Zone.
**Notes:** Draft was explicitly corrected from chat popout to Coding Zone popout.

## Worktree Confinement

| Option | Description | Selected |
|--------|-------------|----------|
| SSH remote worktree only | Agent edits only in allocated SSH worktree; user merges outside | ✓ |
| Local worktree writes | Agent can edit local checkout worktree | |
| Main checkout writes | Agent can edit current branch directly | |

**User's choice:** SSH remote worktree only.
**Notes:** User stated agent edits repo via SSH remote, in a separate worktree, and merges outside after review.

## Diff Review

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse Ghost Dev hunk mechanics | Use existing diff parse/view/apply/revert patterns with worktree-local semantics | ✓ |
| Build new diff system | Independent parser and review flow | |
| File-level only review | No hunk-level accept/reject | |

**User's choice:** Reuse Ghost Dev hunk mechanics.
**Notes:** Must ensure accept/reject affects only the agent worktree.

## Quality and Delivery

| Option | Description | Selected |
|--------|-------------|----------|
| Full verification then merge and push | Research, plan, execute, verify, Chrome test, merge feature/intellij-workbench, push | ✓ |
| Stop after implementation | No merge/push | |
| Minimal checks | Skip review or browser verification | |

**User's choice:** Full verification then merge and push.
**Notes:** User wants warnings and critical issues fixed, Chrome testing, then merge/push after phase completion.

## Claude's Discretion

- Component names, event payload shapes, state transport, exact tests, and which existing utilities to wrap or refactor.

## Deferred Ideas

- Multi-agent parallel coding workflows.
- Built-in merge/PR automation.
- PWA behavior for Coding Zone.
