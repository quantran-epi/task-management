---
phase: 39-skill-versioning-enrichment-approval
plan: 06
subsystem: ai-office / skill-versioning / approval-ui
tags: [skill-version, drawer, approval-queue, version-history, d-09, d-12, d-14, d-16, d-25, d-26]
requires:
  - "39-01 listPendingSkillVersions + decideSkillVersion + listSkillVersions"
  - "39-02 updateSkill writes an approved version row (D-09)"
  - "39-04 prepareSkillVersionDiff (three-field diff)"
  - "39-05 PatchDiffApprovalCard skill variant"
provides:
  - "SkillEditorDrawer pending section with a decided-row overlay + version history + title badge + save hint"
  - "SkillCardProps.pendingCount?: number | undefined with a {n} chờ duyệt warning Tag"
  - "tests/components/ai/office/SkillEditorDrawer.test.tsx (9 tests)"
affects:
  - "39-07 (AiStaffExplorer passes pendingCount into SkillCard)"
tech-stack:
  added: []
  patterns:
    - "pre-write snapshot overlay: the live query drops a decided row, so the drawer holds row AND diff until it closes"
    - "one shared card, two render sites, one decideSkillVersion call (D-25)"
key-files:
  created:
    - tests/components/ai/office/SkillEditorDrawer.test.tsx
  modified:
    - src/components/ai/office/SkillCard.tsx
    - src/components/ai/office/SkillEditorDrawer.tsx
decisions:
  - "D-26: the drawer is the durable queue and the history — no new view, form stays first"
  - "D-25: the drawer calls the same decideSkillVersion as the transcript; no second decision path"
  - "D-12: history is view-only — no restore, no edit affordance"
  - "D-14: a rejected row renders 'Đề xuất bị từ chối', never v0/vundefined"
  - "D-16: stale derived from the same versions array, so Approve is disabled in the queue too"
  - "D-32: pendingCount is optional so the dead AiOfficeView keeps compiling"
metrics:
  duration: "~20 min"
  completed: "2026-11-14"
---

# Phase 39 Plan 06: Drawer approval queue + version history Summary

`SkillEditorDrawer` is now the durable approval queue and the version history — form first, then `Chờ duyệt ({n})` with the shared approval card, then `Lịch sử phiên bản ({n})` — and a card decided inside the drawer stays mounted with its `role="status"` line until the drawer closes.

## What changed

**`src/components/ai/office/SkillCard.tsx`**
- `pendingCount?: number | undefined` added to `SkillCardProps` — optional because `AiOfficeView` is dead but live-tested (D-32).
- A `Tag color="warning"` with `data-testid={`skill-card-pending-${skill.id}`}`, `fontSize: 12`, `margin: 0`, copy `{n} chờ duyệt`, between the description clamp and the usage caption, only when `n > 0`.
- Everything else byte-identical: surface, padding 16, gap 8, 14/600 name, 2-line clamp, hover border, `Sửa`/`Xóa` footer, existing `Popconfirm` copy. No `onClick` on the card body.

**`src/components/ai/office/SkillEditorDrawer.tsx`**
- One live read: `versions = useLiveQuery(() => skill ? listSkillVersions(skill.id, db) : Promise.resolve([]), [open, skill?.id, db]) ?? []`.
- `recentlyDecided: Map<versionId, { row, patch }>` snapshots **both** the row and the built diff before the write. `versions` is live and approving flips `status` in place, so the row would leave the pending filter and unmount its card before the decision line rendered; and because the approval overwrites `aiSkills`, a recomputed diff against the live `skill` prop would collapse to zero lines. On a thrown write the id is removed again so the card is not duplicated. Reset to a new `Map` in an effect keyed on `[open, skill?.id]`, so a reopened drawer starts clean.
- One `useMemo` derives, in order: `pending` (status filter), `patches` (`prepareSkillVersionDiff` per row, base = the approved row at `baseVersion` when `> 0` else the drawer's `skill`; a refusal or an unresolvable base is skipped), `pendingSectionRows` (decided snapshots first, then the pending rows, sorted by `createdAt` desc), `historyRows` (decided rows **minus** the session-decided ones — a row decided here is already visible above with its decision line), `highestApproved`, and `pendingCount`.
- `stale={(row.baseVersion ?? 0) < highestApproved}` — derived here, not left undefined. An always-enabled Approve on a stale proposal would silently revert content just approved elsewhere (D-16).
- `subtitle={`Kỹ năng · ${skill.name}`}` with a code comment: the drawer has no roster prop, so the ` · đề xuất bởi …` segment is a transcript-only affordance; inventing one here would render a guess.
- Decision handler mirrors plan 05: snapshot → `applying` → `await decideSkillVersion(row.id, status, db)` → `decision`; on throw, drop the snapshot and set the fixed error copy.
- Body order: form (unchanged) → save hint `Lưu sẽ tạo một phiên bản mới trong lịch sử.` (edit mode only) → `Xem trước` collapse (unchanged) → pending section (`skill !== null && pendingCount > 0`, `paddingTop: 24`, `borderTop`, heading `Chờ duyệt ({n})`, one card per `{row, patch}` in `skill-pending-card-{row.id}`) → history section (`skill !== null`, heading `Lịch sử phiên bản ({n})`, `Collapse size="small"`).
- History row label: `v{n}` in a bordered chip for approved rows; `Đề xuất bị từ chối` at 12/600 `colorTextSecondary` with no border for rejected rows (never `v0`/`vundefined`); name at 13.5/400 ellipsis `flex: 1`; `DD/MM/YYYY HH:mm` from `decidedAt` via dayjs; `Tag` `Đã duyệt` (success) / `Đã từ chối` (default). Children: name 14/600, description 13.5/400, body through `MarkdownContentRenderer`, evidence as plain text. **No buttons of any kind** (D-12). Empty history renders `Chưa có phiên bản nào — lần lưu đầu tiên sẽ tạo phiên bản 1.`
- Title: `Sửa kỹ năng` plus a `Tag color="warning"` `data-testid="skill-editor-pending-badge"` `{n} chờ duyệt` when `n > 0`; create mode stays the bare string.
- `handleSave` unchanged — `updateSkill` already writes the version (D-09); no approval step was added (Pitfall 9).

**`tests/components/ai/office/SkillEditorDrawer.test.tsx`** (new, 9 tests, real Dexie, fresh DB per test)
1. create mode: no pending section, no history, no save hint
2. edit mode with no versions: empty-history line (D-10)
3. save writes exactly one approved row and a `v1` / `Đã duyệt` history entry (D-09)
4. pending card renders, badge shows `1 chờ duyệt`, approving keeps `skill-pending-card-{id}` mounted with its decision line, row becomes `approved` `version === 1`, `aiSkills.body` is the proposal body (D-25)
5. rejected row shows `Đề xuất bị từ chối`, no `v0`, no `vundefined` (D-14)
6. history is view-only: no `/khôi phục|restore/i` and no `/sửa|edit/i` button inside it (D-12)
7. a session-decided row is not duplicated into history — `skill-version-row-{id}` is null while the pending card is still mounted
8. stale proposal: Approve disabled, Reject enabled, stale alert copy present (D-16)
9. subtitle is exactly `Kỹ năng · {name}` with no `đề xuất bởi`

## Verification

- `npx tsc --noEmit -p tsconfig.json` — 0 `error TS` lines
- `npx vitest run tests/components/ai/office/SkillEditorDrawer.test.tsx tests/views/AiOfficeView.test.tsx` — 2 files, 28 passed (9 new + 19 pre-existing)
- `git diff --stat tests/views/AiOfficeView.test.tsx` — empty (D-32 honoured)
- `bash .planning/scripts/verify-team-chat-architecture.sh` — exit 0, including the dead-module check
- Acceptance greps in the drawer: `skill-pending-section` 1×, `skill-version-history` 1×, `skill-editor-pending-badge` 1×, `recentlyDecided` 4×, `Lưu sẽ tạo một phiên bản mới trong lịch sử.` 1×, `Đề xuất bị từ chối` 1×, `MarkdownContentRenderer` 4×, `decideSkillVersion` 2×, `Restore|Khôi phục` 0×
- Acceptance greps in `SkillCard`: `pendingCount?: number | undefined` present, `skill-card-pending-` present, `chờ duyệt` present, `onClick` only on the two footer buttons

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The save hint would have rendered in create mode**
- **Found during:** Task 2
- **Issue:** the plan places the hint "directly under the body field and above the preview" while also requiring create mode to be exactly today's component. Rendered unconditionally, it would appear in create mode and break both the plan's own truth ("in create mode both are absent") and test 1.
- **Fix:** gated the hint on `skill !== null`, matching the pending and history sections.
- **Files modified:** `src/components/ai/office/SkillEditorDrawer.tsx`
- **Commit:** a44c5cc4

**2. [Rule 2 - Missing critical behaviour] The decision overlay was never reset between drawer sessions**
- **Found during:** Task 2
- **Issue:** the plan asks for `recentlyDecided` to be reset "inside the existing `useEffect` that resets the form", but that effect is keyed on `[open, skill]` — the `skill` object identity changes on every live-query re-render, so resetting there would wipe a snapshot mid-session and reintroduce the unmount bug the overlay exists to prevent.
- **Fix:** a separate effect keyed on `[open, skill?.id]` resets `recentlyDecided`, `decision`, `applying` and `error`; the form effect keeps its original key. The reset fires only when the drawer opens or the edited skill actually changes.
- **Files modified:** `src/components/ai/office/SkillEditorDrawer.tsx`
- **Commit:** a44c5cc4

No architectural changes, no auth gates, no package installs (`dayjs`, `Tag`, `Collapse`, `useLiveQuery` were all already dependencies).

## Known Stubs

None.

## Threat Flags

None beyond the plan's register. T-39-23 holds — both buttons call `decideSkillVersion` and nothing else, and `handleSave` gained no approval step. T-39-24 holds — history bodies render only through `MarkdownContentRenderer` and evidence is plain text. T-39-25 is covered by tests 5 and 7: a rejected proposal stays visible as a decision the user made, and a session-decided row appears in the pending section only until the drawer closes. T-39-26 is covered by test 6 (no restore button exists).

## Self-Check: PASSED

- FOUND: src/components/ai/office/SkillCard.tsx
- FOUND: src/components/ai/office/SkillEditorDrawer.tsx
- FOUND: tests/components/ai/office/SkillEditorDrawer.test.tsx
- FOUND: 28db794b
- FOUND: a44c5cc4
- FOUND: 1487936f
