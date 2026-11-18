---
phase: 34-ai-office-fixed-ai-employees-with-persona-role-per-model-mul
plan: 09
subsystem: ai-office-ui
tags: [ai-office, employee-tab, workbench, antd, dexie]
requires: [34-02, 34-08]
provides:
  - "AiOfficeView — the 'agents' shell with Văn phòng AI / Ghost Dev segments"
  - "EmployeeCard, LeadCard, SkillCard"
  - "EmployeeEditorDrawer, LeadEditorDrawer, SkillEditorDrawer"
  - "'teams' EditorViewType member, icon case and both title maps"
affects:
  - src/workbench/EditorArea.tsx
  - src/workbench/WorkbenchLayout.tsx
tech-stack:
  added: []
  patterns:
    - "antd Segmented two-level filter over one Dexie live list"
    - "one file, two exports for surfaces that differ only by labels"
key-files:
  created:
    - src/views/AiOfficeView.tsx
    - src/components/ai/office/EmployeeCard.tsx
    - src/components/ai/office/SkillCard.tsx
    - src/components/ai/office/EmployeeEditorDrawer.tsx
    - src/components/ai/office/SkillEditorDrawer.tsx
    - tests/views/AiOfficeView.test.tsx
  modified:
    - src/workbench/store/layoutStore.ts
    - src/workbench/EditorArea.tsx
    - src/workbench/WorkbenchLayout.tsx
decisions:
  - "Segment selection is local state, not layoutStore: the store has no per-tab slot and the plan forbids a new global localStorage key"
  - "Skill preview renders via MarkdownContentRenderer so no file outside the renderer emits raw HTML"
metrics:
  duration: "~35m"
  completed: 2026-11-08
  tasks: 3
  files: 9
---

# Phase 34 Plan 09: AI Office employee tab Summary

The `'agents'` view becomes a two-level shell: Văn phòng AI (employees / leads / skills over one filtered Dexie live list, with three card types and three editor drawers) with the existing Ghost Dev surface still mounted behind the second segment; `'teams'` is registered in the workbench type, icon and both title maps for plan 34-10.

## What Was Built

**`src/views/AiOfficeView.tsx`** — outer `Segmented` (`Văn phòng AI` default / `Ghost Dev`), `PageHeader` with the per-segment primary CTA, inner `Segmented` whose `data-testid`s sit on the `label` nodes (`ai-office-segment-employees|leads|skills`), the `SystemCatalogView` toolbar strip with a per-segment search placeholder and `Đặt lại bộ lọc`, a `repeat(auto-fill, minmax(280px, 1fr))` grid, and the exact UI-SPEC empty-state copy per segment. Team-usage and skill-usage counts are derived from one `aiTeamMembers` live read and one pass over employees, so no per-card query.

**`src/components/ai/office/EmployeeCard.tsx`** — exports both `EmployeeCard` and `LeadCard` (no `LeadCard.tsx`). Avatar color comes from the existing `agentColorFor` palette; lead is `shape="square"` with a crown and a `Lead` tag and omits the skill/team rows.

**`src/components/ai/office/SkillCard.tsx`** — name, 2-line clamped description, `Đang dùng bởi {n} nhân viên`.

**`src/components/ai/office/EmployeeEditorDrawer.tsx`** — exports both `EmployeeEditorDrawer` and `LeadEditorDrawer` over one shared body. Save stays disabled until `AiEmployeeInputSchema` / `AiLeadInputSchema` accepts the form (the same schemas the repo parses, T-34-48). Skill is a single `Select allowClear`; clearing persists `skillId: null` so `updateEmployee` deletes the field. Empty model list renders the warning alert; a team-used employee renders the shared-edit info alert (T-34-49).

**`src/components/ai/office/SkillEditorDrawer.tsx`** — description labelled `Mô tả (nhân viên chỉ thấy phần này)`, body textarea in code font, preview through `MarkdownContentRenderer` (the only `renderSafeMarkdown` path); zero `dangerouslySetInnerHTML` in the file (T-34-47).

**Workbench registration** — `'teams'` added to `EditorViewType` after `'agents'`, `case 'teams'` in `getEditorTabIcon`, and `teams: 'AI Office — Nhóm'` in both the `EditorArea` internal `titles` map and `WorkbenchLayout.handleOpenView` (T-34-51). `renderViewContent` was deliberately left untouched for plan 34-10.

## Verification

- `npx vitest run tests/views/AiOfficeView.test.tsx` — 16 passed
- `npx vitest run tests/workbench` — 18 passed (icon/title registration did not disturb existing workbench tests)
- `npx tsc --noEmit` — clean
- `git diff --stat package.json package-lock.json` — empty (no installs, T-34-SC)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Destructive delete had no confirmation**
- **Found during:** Task 2 review
- **Issue:** The card `Xóa` buttons called the repository delete directly. The UI-SPEC destructive contract requires a `Popconfirm` naming the consequence, and `CLAUDE.md` requires backup/data-safety confirmation before replacing good local data.
- **Fix:** Wrapped each `Xóa` in a `Popconfirm` with the exact UI-SPEC copy for employee, lead and skill, `okText="Xóa"`, `cancelText="Hủy"`, `okButtonProps={{ danger: true }}`.
- **Files modified:** `src/components/ai/office/EmployeeCard.tsx`, `src/components/ai/office/SkillCard.tsx`
- **Commit:** 9482ba38

### Plan-text deviations

**Segment persistence.** The plan asked for the outer segment to live in `layoutStore` "if the store has no suitable slot, use local state and note it". The store has no per-tab slot and the plan forbids adding a global `localStorage` key, so the segment is local `useState`. Consequence: the segment resets to Văn phòng AI when the tab remounts.

**Skill preview renderer.** The plan said "`renderSafeMarkdown(body)` inside a `.chat-markdown-body` div". Rendering it inline would have required a raw `dangerouslySetInnerHTML` in the drawer file, which the acceptance criteria forbid. Used the existing `MarkdownContentRenderer` (which calls `renderSafeMarkdown` and owns the `.chat-markdown-body` div) instead — same output, zero raw-HTML sites.

## Known Stubs

None. Every card reads live Dexie rows and every drawer writes through the repository.

## Threat Flags

None — no new network endpoints, auth paths or trust boundaries beyond the two already in the plan's threat model (form input → persisted row, skill body → preview).

## Self-Check: PASSED

- `src/views/AiOfficeView.tsx` — FOUND
- `src/components/ai/office/EmployeeCard.tsx` — FOUND
- `src/components/ai/office/SkillCard.tsx` — FOUND
- `src/components/ai/office/EmployeeEditorDrawer.tsx` — FOUND
- `src/components/ai/office/SkillEditorDrawer.tsx` — FOUND
- `tests/views/AiOfficeView.test.tsx` — FOUND
- Commits 994a471e, 042f98ca, b8753a03, 4241ec6c, 9482ba38 — FOUND
