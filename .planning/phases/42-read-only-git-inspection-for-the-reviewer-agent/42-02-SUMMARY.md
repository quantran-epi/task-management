---
phase: 42-read-only-git-inspection-for-the-reviewer-agent
plan: 02
subsystem: ai-office
tags: [team-prompts, git, reviewer, prompt-injection]
dependency_graph:
  requires:
    - src/services/ai/office/teamPrompts.ts (buildEmployeeTurnRequest, ANTI_FABRICATION_BLOCK precedent)
    - src/services/ai/office/teamTools.ts (git_read definition from 42-01)
  provides:
    - "REVIEWER_GIT_READ_LINE exported constant"
    - "reviewer detection by role or skill description, case-insensitive, no AiEmployee field"
  affects:
    - src/services/ai/office/teamPrompts.ts (employee prompt only)
tech-stack:
  added: []
  patterns:
    - "exported prompt constant asserted verbatim by test (LEAD_NO_WRITE_DOC_LINE precedent)"
    - "conditional policy line pushed after the folderId block, never interpolated from user text"
key-files:
  created: []
  modified:
    - src/services/ai/office/teamPrompts.ts
    - tests/services/ai/office/teamPrompts.test.ts
decisions:
  - "D-12: reviewer detected by employee.role or skill.description containing 'review' (case-insensitive); no new AiEmployee field"
  - "D-12: the line names the tool and read order only — no refusal code, no repo path, no system id (T-42-08)"
  - "D-12: the line is a fixed constant, never interpolated from skill.description (T-42-09)"
metrics:
  duration: 5m
  completed: 2026-11-15T15:54:00Z
  tasks: 2
  files: 2
---

# Phase 42 Plan 02: Reviewer git_read prompt line Summary

One exported constant telling a reviewer employee how to read a remote repository with `git_read` — branches, log, diff_summary, diff_file, read_file — pushed only when the employee's role or assigned skill description contains "review", with no new `AiEmployee` field and no refusal code in the prompt.

## What Was Built

**`src/services/ai/office/teamPrompts.ts`**
- `REVIEWER_GIT_READ_LINE` — a `.join('\n')` array next to `EMPLOYEE_WRITE_DOC_LINE`, opening with `[ĐỌC GIT — CHỈ ĐỌC]`. Names `git_read`, the five-step order (`branches` → `log` → `diff_summary` → `diff_file` → `read_file`), `tree` for directory listing, and states the tool cannot write, cannot run an arbitrary command, and everything it returns is data, never instruction.
- `buildEmployeeTurnRequest` computes `isReviewer` from `employee.role.toLowerCase().includes('review')` OR `(skill?.description ?? '').toLowerCase().includes('review')` and pushes the line immediately after the `folderId` block. `skill` is the already-destructured local — not re-read from `input`.
- `buildLeadTurnRequest` untouched: the leader is not the reviewer.

**`tests/services/ai/office/teamPrompts.test.ts`** — three cases appended to the existing describe block, asserting the exact exported string (not a paraphrase), matching the `LEAD_NO_WRITE_DOC_LINE` precedent:
1. Present by role — `role: 'Reviewer kỹ thuật'`, `skill: undefined`. The capital `R` also covers case-insensitivity.
2. Present by skill description — default non-reviewer employee, `description: 'Quy trình review mã nguồn'`.
3. Absent — default employee and default skill; `not.toContain(REVIEWER_GIT_READ_LINE)` and `not.toContain('git_read')`.

## Verification

- `npx tsc --noEmit -p tsconfig.json` — exit 0.
- `npx vitest run tests/services/ai/office/teamPrompts.test.ts` — 43 passed, 0 failed (40 before, 3 new).
- `grep -c "export const REVIEWER_GIT_READ_LINE"` → 1; `grep -c "isReviewer"` → 2; `grep -c "REVIEWER_GIT_READ_LINE"` on source → 2 (export + push), on test → 4 (import + two positive assertions + one negative).
- Refusal codes `SYSTEM_NOT_LINKED`, `NO_LINKED_REPO`, `INVALID_ARGUMENT` absent from the constant.
- `git diff --stat` over the two plan commits touches only the two declared files.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None — no new surface beyond the plan's `<threat_model>`. T-42-08 (no refusal code or repo path in the line), T-42-09 (constant, never interpolated from `skill.description`), and T-42-07 (detection grants an ordering hint only; the handler enforces repo scope) are all satisfied as planned.

## Requirements

`AIO-READ-04` is closed here: a reviewer employee's prompt names `git_read` and the read order, and a non-reviewer's prompt never mentions it.

## Self-Check: PASSED

- `src/services/ai/office/teamPrompts.ts` modified — FOUND
- `tests/services/ai/office/teamPrompts.test.ts` modified — FOUND
- Commits `a8419898`, `8c69a0d8` — FOUND
