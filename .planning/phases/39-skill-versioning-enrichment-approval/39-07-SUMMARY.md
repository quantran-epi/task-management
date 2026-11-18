---
phase: 39-skill-versioning-enrichment-approval
plan: 07
subsystem: ai-office / skill-crud / explorer-ui
tags: [skill-crud, ai-staff-explorer, d-27, d-30, d-31, d-33, scope-override]
requires:
  - "39-02 deleteSkill / updateSkill / listSkills (version-writing write paths)"
  - "39-06 SkillCard pendingCount + SkillEditorDrawer"
provides:
  - "AiStaffExplorer Kỹ năng section — the only skill CRUD entry point in the running app"
  - "createKind: 'employee' | 'lead' | 'skill' | null as the single drawer-open source"
  - "ROADMAP §Phase 39 criterion 1 + REQUIREMENTS AIO-SKILL-01 D-27/D-30 override"
  - "tests/workbench/AiExplorers.test.tsx skill describe block (7 tests)"
affects:
  - "Phase 40 (leader/agent CRUD now explicitly out of Phase 39 scope)"
tech-stack:
  added: []
  patterns:
    - "one open/closed state for N drawers — createKind carries the kind, editingSkill carries create-vs-edit"
    - "counts derived from the reads already on the page, reduced into Maps (no N+1)"
    - "delete confirmed once, by the card's own Popconfirm; the explorer only reports the refusal"
key-files:
  created: []
  modified:
    - src/workbench/toolwindows/AiStaffExplorer.tsx
    - tests/workbench/AiExplorers.test.tsx
    - .planning/ROADMAP.md
    - .planning/REQUIREMENTS.md
decisions:
  - "D-31/D-33: the Kỹ năng section in AiStaffExplorer is the only skill CRUD entry point — no route, no tab, no revived AiOfficeView"
  - "D-32: AiOfficeView untouched, its 19 tests still pass"
  - "D-30: both planning documents now say skill CRUD only, leader/agent CRUD is Phase 40"
metrics:
  duration: "~25 min"
  completed: "2026-11-14"
---

# Phase 39 Plan 07: Skill CRUD home in the AI Staff explorer Summary

Skill CRUD now lives where the user can actually reach it: a third `Kỹ năng ({n})` section in `AiStaffExplorer`, a third toolbar button, one `createKind` state driving all three drawers, and live agent/pending counts derived from the two reads already on the page.

## What changed

**`src/workbench/toolwindows/AiStaffExplorer.tsx`** (+116/−2)

- `createKind` widened from `'employee' | 'lead' | null` to `'employee' | 'lead' | 'skill' | null`. It remains the **only** drawer-open state; `EmployeeEditorDrawer`/`LeadEditorDrawer` keep their existing `open={createKind === …}` expressions byte-identical.
- New `editingSkill: AiSkill | null` — create vs edit for the skill drawer. It never decides whether the drawer is open.
- Three new reads: `skills` (`listSkills`), `pendingRows` (`db.aiSkillVersions.where('status').equals('pending')`), and the existing `employees`. Two `useMemo` reductions turn them into `agentCountBySkill` and `pendingCountBySkill`; `countAgentsUsingSkill` is never called per card (T-39-30).
- `filteredSkills` filters on `name`/`description` through the same `matches` helper the other two sections use, so one query filters all three.
- Search placeholder is now `Tìm lead, nhân viên, kỹ năng...`.
- Third toolbar button: `BookOutlined`, `Tooltip`/`aria-label` both `Thêm Kỹ năng`, `data-testid="ai-staff-skill-create"`, same `size="small" type="text"` footprint as its two siblings, and it clears `editingSkill` so it always opens create mode.
- Section appended after `Nhân viên AI`: `data-testid="ai-staff-skills-section"`, `marginTop: 12`, header styled identically to the two existing headers, label `Kỹ năng ({filteredSkills.length})`. Empty state is the single line `Chưa có kỹ năng nào`. Otherwise a `flex column gap 8` stack of `SkillCard`s, each in a `ai-staff-skill-{id}` wrapper.
- `handleDeleteSkill` calls `applyRefusal(await deleteSkill(...))` directly — **not** through `confirmDelete`. `SkillCard`'s own `Popconfirm` already asked, so a `Modal.confirm` on top would be a double prompt (T-39-28, UI-SPEC §5). The existing `ai-staff-delete-error` Alert and `refusalMessage()` copy are reused verbatim, so a refusal names agents and never an id (T-39-27).
- `SkillEditorDrawer` rendered beside the two existing drawers with `open={createKind === 'skill'}`, both callbacks clearing `createKind` **and** `editingSkill`.
- `src/views/AiOfficeView.tsx` untouched (D-32).

**`tests/workbench/AiExplorers.test.tsx`** (+171/−3, 13 tests total, was 6)

- The existing search test now asserts `Tìm lead, nhân viên, kỹ năng...` — a deliberate edit caused by the placeholder change.
- New `describe('AiStaffExplorer — Kỹ năng (AIO-SKILL-01, D-31, D-33)')` with 7 tests against real Dexie:
  1. section renders with `Kỹ năng (0)`, the empty line, and the create button's `aria-label`
  2. create through the drawer → `db.aiSkills.count() === 1` and the card testid appears
  3. edit → card body click is inert, `Sửa` opens the drawer, new name persists and renders live
  4. unreferenced delete after the card's Popconfirm → row gone, card gone, no error Alert
  5. refusal for a skill an agent carries → Alert names `Lan Kỹ Sư`, does not contain the skill id, card still rendered
  6. one query filters all three sections — lead and employee rows disappear, the skill card remains
  7. pending version row → `skill-card-pending-{id}` shows `1 chờ duyệt`

**`.planning/ROADMAP.md`** — §Phase 39 criterion 1 replaced with `Skill CRUD works with validation, empty states, and error handling — no crash on network or AI failure. Leader/agent CRUD is Phase 40 (AIO-LEAD-01..04).` Criteria 2–6 untouched.

**`.planning/REQUIREMENTS.md`** — `AIO-SKILL-01` keeps its original sentence struck through and appends `**Overridden by 39 D-27/D-30:** Phase 39 delivers skill CRUD only. Leader/agent CRUD moves to Phase 40 (AIO-LEAD-01..04). The surviving invariant is "skill CRUD works with validation, empty states, and error handling — no crash on network or AI failure."`, matching the `AIO-BUDGET-09` convention exactly. Checkbox left unticked.

## Verification

- `npx tsc --noEmit -p tsconfig.json` — 0 `error TS` lines
- `npx vitest run tests/workbench/AiExplorers.test.tsx tests/views/AiOfficeView.test.tsx` — 2 files, 32 passed (13 explorer + 19 dead-view)
- `git diff --stat src/views/AiOfficeView.tsx` — empty (D-32 honoured)
- Acceptance greps in the explorer: `ai-staff-skills-section` 1×, `ai-staff-skill-create` 1×, `Tìm lead, nhân viên, kỹ năng...` 1×, `Chưa có kỹ năng nào` 1×, `SkillEditorDrawer` 2×, `createKind|setCreateKind` 14×, `setDrawer|drawer ===` 0×, `countAgentsUsingSkill` 0×, `confirmDelete` only on the lead/employee paths
- Doc greps: ROADMAP `Leader/agent CRUD is Phase 40` 1× and the old wording 0×; REQUIREMENTS `Overridden by 39 D-27/D-30` 1×, the strikethrough 1×, `- [ ] **AIO-SKILL-01**` still 1×

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The delete test asserted the card was gone before the live query caught up**
- **Found during:** Task 2
- **Issue:** `await waitFor(() => db.aiSkills.get(id) === undefined)` resolves as soon as the Dexie write lands, but `useLiveQuery` re-renders on a later tick — the card was still in the DOM at that instant and the test failed.
- **Fix:** a second `waitFor` around the card's disappearance, so both the write and the render are awaited.
- **Files modified:** `tests/workbench/AiExplorers.test.tsx`
- **Commit:** 9e6602dd

No architectural changes, no auth gates, no package installs (`BookOutlined` ships in the already-installed `@ant-design/icons`). No doc edits beyond the two D-30 overrides.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register. T-39-27 holds — the refusal path is the shared `refusalMessage()`, names only, proven by test 5. T-39-28 holds — `handleDeleteSkill` never reaches `confirmDelete`, and the grep gate confirms `confirmDelete` appears only on the lead/employee paths. T-39-29 holds — the explorer's only skill write is `deleteSkill`; create and edit go through `SkillEditorDrawer`, which calls `createSkill`/`updateSkill`, and `updateSkill` writes the version row in its own transaction. T-39-30 holds — one pending query and one employees scan, both reduced into Maps; `countAgentsUsingSkill` is absent from the file. T-39-SC holds — zero installs.

## Self-Check: PASSED

- FOUND: src/workbench/toolwindows/AiStaffExplorer.tsx
- FOUND: tests/workbench/AiExplorers.test.tsx
- FOUND: .planning/ROADMAP.md
- FOUND: .planning/REQUIREMENTS.md
- FOUND: 7f0a18d2
- FOUND: 9e6602dd
- FOUND: c395de88
