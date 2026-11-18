---
phase: 39-skill-versioning-enrichment-approval
plan: 05
subsystem: ai-office / skill-versioning / approval-ui
tags: [skill-version, approval-card, transcript-extension, d-16, d-23, d-24, d-29]
requires:
  - "39-01 listPendingSkillVersions + decideSkillVersion (atomic aiSkills overwrite)"
  - "39-04 prepareSkillVersionDiff (three-field sync diff)"
  - "src/components/ai/widget/PatchDiffApprovalCard.tsx (shared note card)"
provides:
  - "PatchDiffApprovalCard variant/subtitle/evidence/staleReason props (note path byte-identical)"
  - "PendingSkillProposals component + skillSubtitle helper"
  - "TeamWorkspace transcriptExtensions hosts the pending queue after AssignmentPlanCard"
affects:
  - "39-06 (SkillEditorDrawer reuses the same card and the same decideSkillVersion call)"
tech-stack:
  added: []
  patterns:
    - "pre-write snapshot overlay: a decided row leaves the live query, so the component keeps row AND diff in local state until unmount"
    - "one shared card, a variant prop — never a second approval surface that drifts"
key-files:
  created:
    - src/components/ai/office/PendingSkillProposals.tsx
    - tests/components/ai/office/PendingSkillProposals.test.tsx
  modified:
    - src/components/ai/widget/PatchDiffApprovalCard.tsx
    - src/components/ai/office/TeamWorkspace.tsx
    - tests/ai/PatchDiffApprovalCard.test.tsx
decisions:
  - "D-24: extend the shared card with a variant prop; the 5 pre-existing tests pass untouched"
  - "D-23: both buttons call decideSkillVersion directly — the card never resolves a tool promise"
  - "D-16: stale disables Approve only; Reject stays enabled so a stale proposal is dismissible"
  - "D-29: the 3-card cap is display only — decided cards take slots first, overflow is never a delete"
  - "D-13: no proposer field; skillSubtitle derives it from the roster, first match in employees order"
metrics:
  duration: "~14 min"
  completed: "2026-11-14"
---

# Phase 39 Plan 05: Transcript approval surface Summary

A pending skill proposal now renders in the live team transcript as the existing `PatchDiffApprovalCard` with a `skill` variant, and one click on `Chấp thuận` writes the approval to Dexie while the card stays mounted showing `Đã chấp thuận — kỹ năng đã cập nhật sang bản mới.`

## What changed

**`src/components/ai/widget/PatchDiffApprovalCard.tsx`**
- Four optional props, all `?: T | undefined` (`exactOptionalPropertyTypes`): `variant` (`'patch'` default), `subtitle`, `evidence`, `staleReason` (`'document-changed'` default).
- Two `as const` copy maps — `STALE_COPY` and `STALE_BLOCKED_COPY` — keyed by `staleReason`, so the note strings stay verbatim and the skill strings never drift between the `Alert`, the `Tooltip` and the `aria-label`.
- Subtitle line renders `subtitle ?? <default>` for both the text and its `title` attribute; the skill path passes a subtitle so no UUID reaches the screen.
- Evidence panel: antd `Collapse size="small"`, label `Bằng chứng`, body a plain `<div>` with `whiteSpace: 'pre-wrap'`, 13.5/1.5, `colorTextSecondary`, `maxHeight: 160`. Rendered only when `evidence` is defined and non-blank. No `MarkdownContentRenderer` — model-authored content is never markup on this surface (T-39-20).
- Decision copy switches on `variant`; buttons keep `Chấp thuận` / `Từ chối` in both variants (UI-SPEC verb decision — the note surface and its tests assert them).
- Untouched: `data-testid="patch-diff-approval"`, the `role="region"` diff block, the `+/−` chips, `isDarkBase`, and the `applying`-only Reject disable.

**`src/components/ai/office/PendingSkillProposals.tsx`** (new)
- `export const PendingSkillProposals: React.FC<...>` with `{ team, members, employees, skills, db? }`.
- `pending = useLiveQuery(() => listPendingSkillVersions(db), [db]) ?? []`; `approvedRows` is one `status === 'approved'` query serving both the base lookup and `currentApproved`.
- `rosterSkillIds` from `members` joined against `employees` — a proposal from another team's agent never renders (T-39-21).
- `patches` is a `useMemo` over `remaining` calling `prepareSkillVersionDiff`; a row whose base resolves to neither the approved version nor the current `aiSkills` row is skipped rather than rendered with an empty base. A refusal result is skipped (defensive — the tool already refused at write time).
- `recentlyDecided: Map<id, { row, patch }>` snapshots **both** the row and the diff before the write. The pending live query drops the row on commit and the approval overwrites `aiSkills`, so a recomputed diff would collapse to zero lines; the snapshot is what keeps the decided card honest. On a thrown write the id is removed again so the row does not appear twice.
- Render list: decided entries first (newest `createdAt` first), then `remaining.slice(0, max(0, 3 - decided.length))`; `overflow` counts only the pending remainder. Decided cards therefore always hold a slot and can never be folded into the overflow line.
- `skillSubtitle(skillId, skillName, employees)` is exported and unit-tested: `Kỹ năng · {name} · đề xuất bởi {agent}` when a carrier resolves, `Kỹ năng · {name}` otherwise. First match in `employees` order (D-13 forbids a proposer column).
- Decision handler: snapshot → set `applying` → `await decideSkillVersion(id, status, db)` → set `decision`; on throw, drop the snapshot and set the fixed error copy. `role="status"` renders on the still-mounted card; nothing is removed optimistically.
- Zero visible rows → `null`. Overflow line `data-testid="skill-pending-overflow"`, copy `Còn {n} đề xuất chờ duyệt — xem trong AI Staff › Kỹ năng.`

**`src/components/ai/office/TeamWorkspace.tsx`**
- `<PendingSkillProposals team={team} members={liveMembers} employees={employees} skills={skills} db={db} />` appended after the `AssignmentPlanCard` block inside `transcriptExtensions` (line 763 vs 748). No new widget prop, no new store, no route. `AiChatWidget.tsx` is untouched — no `pendingApproval` branch was added, because D-04 forbids parking this tool.

## Verification

- `npx tsc --noEmit -p tsconfig.json` — 0 `error TS` lines
- `npx vitest run tests/ai/PatchDiffApprovalCard.test.tsx` — 10 passed (5 pre-existing, untouched + 5 new)
- `npx vitest run tests/components/ai/office/PendingSkillProposals.test.tsx` — 8 passed
- `npx vitest run tests/components/ai/office/TeamWorkspaceReceipts.test.tsx tests/components/ai/office/TeamWorkspaceSteer.test.tsx` — 34 passed
- All four suites together — 52 passed
- `bash .planning/scripts/verify-team-chat-architecture.sh` — exit 0, including the dead-module check
- Acceptance greps: `staleReason` 4×, `newer-version-approved` 3×, `Bằng chứng` present, `MarkdownContentRenderer` 0×, `patch-diff-approval` present, `export const PendingSkillProposals` present, `listPendingSkillVersions` 2×, `recentlyDecided` 6×, `pendingApproval` 0× in the new component, `decideSkillVersion` 2×, `prepareSkillVersionDiff` 2×, `PendingSkillProposals` 0× in `AiChatWidget.tsx`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The "no id rendered" assertion matched the diff body, not the subtitle**
- **Found during:** Task 1
- **Issue:** the plan's test asserted `queryByText(new RegExp(proposal.id))` is absent. `note-1` also appears inside `diffText` (`--- a/note:note-1`), so the query matched several nodes and threw `getMultipleElementsFoundError` — the assertion could never pass regardless of the subtitle.
- **Fix:** assert the *default* subtitle string (`Ghi chú · note-1 · mục 1.1`) is absent instead, which is exactly the claim the prop makes.
- **Files modified:** `tests/ai/PatchDiffApprovalCard.test.tsx`
- **Commit:** 29c4e921

**2. [Rule 1 - Bug] `toBeVisible()` cannot see inside a collapsed-then-expanded antd `Collapse`**
- **Found during:** Task 1
- **Issue:** after clicking `Bằng chứng`, the evidence body was in the DOM but `toBeVisible()` failed — antd's collapse motion leaves the panel wrapper at zero height under jsdom.
- **Fix:** assert presence plus the real security property: `innerHTML` equals the raw string and contains no `<a>`/`<strong>`, proving plain-text rendering (T-39-20). Visibility of the collapsed state is still proven by the preceding `queryByText(evidence)` being `null`.
- **Files modified:** `tests/ai/PatchDiffApprovalCard.test.tsx`
- **Commit:** 29c4e921

**3. [Rule 1 - Bug] The plan's test 5 asserted a state the component cannot reach**
- **Found during:** Task 2
- **Issue:** the plan asked to unassign the employee's `skillId` and then assert the card's subtitle drops the proposer segment. But the roster filter derives `rosterSkillIds` from the *same* `employees` array, so unassigning removes the skill from the roster and the card disappears entirely — the two required behaviours are mutually exclusive at the component level.
- **Fix:** split the proof. The component test now asserts the honest outcome (the card leaves the transcript, T-39-21), and a direct `skillSubtitle` unit test asserts both branches — with a carrier and without — including that no `undefined` is produced. Both behaviours are covered; neither is asserted through a state the code cannot produce.
- **Files modified:** `tests/components/ai/office/PendingSkillProposals.test.tsx`
- **Commit:** 9a8f5071

**4. [Rule 3 - Blocking] The test harness passed `employees={[]}`, so no roster existed**
- **Found during:** Task 2
- **Issue:** the first harness passed an empty `employees` array, which makes `rosterSkillIds` empty and every card filtered out — six of seven tests rendered nothing.
- **Fix:** the fixture now creates the employee in `beforeEach` and passes it through `renderPanel()`'s default, with an override for the unassigned case.
- **Files modified:** `tests/components/ai/office/PendingSkillProposals.test.tsx`
- **Commit:** 9a8f5071

No architectural changes, no auth gates, no package installs (`Collapse` was already in `antd`).

## Known Stubs

None. The `team` prop is accepted per the plan's host contract but not read — the roster filter needs only `members` + `employees`. It is a declared interface, not a stub: no rendered value depends on it.

## Threat Flags

None beyond the plan's register. T-39-18 holds — both buttons call `decideSkillVersion` and nothing else; T-39-19 is proven by the stale test (Approve disabled, Reject enabled, `role="alert"` copy); T-39-20 by the `innerHTML` plain-text assertion plus the zero `MarkdownContentRenderer` grep; T-39-21 by the foreign-skill test; T-39-22 by the 3-card cap plus overflow line with decided cards taking slots first.

## Self-Check: PASSED

- FOUND: src/components/ai/widget/PatchDiffApprovalCard.tsx
- FOUND: src/components/ai/office/PendingSkillProposals.tsx
- FOUND: src/components/ai/office/TeamWorkspace.tsx
- FOUND: tests/ai/PatchDiffApprovalCard.test.tsx
- FOUND: tests/components/ai/office/PendingSkillProposals.test.tsx
- FOUND: 29c4e921
- FOUND: 9a8f5071
- FOUND: d6007861
