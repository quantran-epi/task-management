---
phase: 50-full-app-adoption
plan: 04
subsystem: ui
tags: [antd, react, change-requests, notes, hooks, css-vars, codemod, adoption]

requires:
  - phase: 50-full-app-adoption
    provides: 50-01 foundation (ThemeAppHolder, useMessage/useTaskMateModal, codemod, guards), 50-02 tasks/planner wave, 50-03 settings wave
provides:
  - 19 CR/notes views importing all runtime controls from the UI barrel with context-bound useMessage instances
  - CR type/status colors sourced from the shared token contract via Tag status and CSS custom properties
  - Token-valued inline styles replaced by CSS vars in 18 CR/notes files
  - wave-04.txt manifest of 19 migrated paths driving static-API and inline-style guards
affects: [50-full-app-adoption waves 5-9, 50-UAT.md U3 CR detail actions flow, U4 modal forms flow, final eslint src gate]

tech-stack:
  added: []
  patterns:
    - Compound AntD statics resolve to named barrel exports (FormItem, FormList, useForm, RadioGroup, RadioButton, TextArea, InputSearch, EmptyImageSimple, UPLOAD_LIST_IGNORE, ImagePreviewGroup, SpaceCompact, TreeSelectSHOW_CHILD)
    - Static message.* call sites become const message = useMessage() with byte-for-byte Vietnamese copy
    - Status-bearing Tag uses status prop backed by tokens.contract statusColorMap; accent/warning/success reach icons through CSS vars
    - Token-valued inline literals become --font-size-xs/--font-size-small/--radius-control/--accent/--fg-secondary/--bg-island

key-files:
  created:
    - tests/fixtures/adoption/wave-04.txt
  modified:
    - src/components/changeRequests/ChangeRequestModal.tsx
    - src/components/changeRequests/ChangeRequestTable.tsx
    - src/components/changeRequests/TargetSystemsSelector.tsx
    - src/components/notes/BacklinksSection.tsx
    - src/components/notes/DocEditorPane.tsx
    - src/components/notes/DocFolderContentsView.tsx
    - src/components/notes/DocFolderTree.tsx
    - src/components/notes/DocListPane.tsx
    - src/components/notes/DocOutlineToC.tsx
    - src/components/notes/DocsLibraryActions.tsx
    - src/components/notes/EntityNotesSection.tsx
    - src/components/notes/NormalizeDocModal.tsx
    - src/components/notes/NoteAttachmentsPanel.tsx
    - src/components/notes/NoteDetailModal.tsx
    - src/components/notes/NoteEditor.tsx
    - src/components/notes/QuickNoteEntry.tsx
    - src/components/notes/QuickPreviewDrawer.tsx
    - src/components/notes/SmartIngestionBanner.tsx
    - src/components/notes/ZipImportPreviewModal.tsx

key-decisions:
  - "CR_TYPE_CONFIG now carries a StatusKind instead of a raw hex; ChangeRequestTable and ChangeRequestModal render Tag with status so the token map owns light/dark colors"
  - "Call-site props confirmLoading={loading}, danger and loading={creatingEpic} stayed untouched, preserving WR-03/WR-04 wrapper regression coverage"
  - "No new wrapper or package was added; every needed compound slot already existed as a named barrel export"
  - "Near-token values 11.5/12.5px and radius 6/8 normalized to --font-size-small and --radius-control per D-09"

patterns-established:
  - "CR/notes surface follows the same barrel + context-hook migration as earlier waves; no runtime AntD import remains in the surface"
  - "wave-04.txt is the whitelist for both source guards, so the manifest must stay in sync if a CR/notes path is renamed"

requirements-completed: [ADOPT-01, ADOPT-02]

duration: 13min
completed: 2026-11-21
---

# Phase 50 Plan 04: CR and Notes Surface Adoption Summary

**Nineteen CR/notes views moved to the UI barrel and context message hooks, with status colors sourced from the shared token contract and token-valued inline styles replaced by CSS vars**

## Performance

- **Duration:** 13 min
- **Started:** 2026-11-21T13:32:23Z
- **Completed:** 2026-11-21T13:45:24Z
- **Tasks:** 2/2
- **Files modified:** 19 views + 1 manifest

## Accomplishments
- All 19 CR/notes views import runtime controls only from `src/components/ui` and icons from `src/components/ui/icon`; only `import type` from `antd`/`antd/es/...` remains.
- 41 static `message.*` calls in eight views now use a context-bound `const message = useMessage()`; no `Modal.confirm` existed in this surface.
- Compound AntD statics (`Form.Item`, `Form.List`, `Form.useForm`, `Radio.Group`, `Input.TextArea`, `Empty.PRESENTED_IMAGE_SIMPLE`, `Upload.LIST_IGNORE`, `Image.PreviewGroup`, `Space.Compact`, `TreeSelect.SHOW_CHILD`) resolve to the existing named barrel exports.
- CR type/status colors no longer use ad-hoc hex at view sites: `Tag status` reads the shared token map, and icon accents use `--accent`/`--warning`/`--success`.
- 163 token-valued inline literals in 18 files replaced with CSS custom properties; near-token font sizes and radii normalized per D-09.
- Vietnamese string literals verified unchanged across all 19 files; wrapper regression tests (`button.test.tsx`, `controls.test.tsx`) pass.
- `wave-04.txt` registers the 19 migrated paths; static-API guard and inline-style sweep now cover the CR/notes surface.

## Task Commits

1. **Task 1: Codemod + static API → hook cho 19 file CR/notes** — `e55f8b70` (feat)
2. **Task 2: Dọn inline token-valued + manifest wave-04** — `c15b1c51` (test)

**Plan metadata commit:** orchestrator owns the final metadata commit after the wave.

## Files Created/Modified
- `tests/fixtures/adoption/wave-04.txt` — 19-path manifest for source guards
- `src/components/changeRequests/*.tsx` — 3 views migrated to barrel imports, context hooks and token-derived colors
- `src/components/notes/*.tsx` — 16 views migrated to barrel imports, context hooks and CSS vars

## Decisions Made
- No new wrapper was needed: all compound statics had named barrel equivalents, so D-03 was satisfied without touching `src/components/ui/`.
- `CR_TYPE_CONFIG.color` became `CR_TYPE_CONFIG.status: StatusKind`; `ChangeRequestTable` renders `<Tag status={cfg.status}>`, keeping one light/dark source of truth.
- Near-token values changed: `fontSize 11.5/12.5 → var(--font-size-small)` (12px) and `borderRadius 6/8 → var(--radius-control)` (4px) — slightly tighter corners in the affected notes panels.
- Token-equal replacements: `#1677ff`/`#4f46e5 → var(--accent)`, `#8c8c8c → var(--fg-secondary)`, `#ffffff → var(--bg-island)`, `fontSize 11 → var(--font-size-xs)`, `fontSize 12 → var(--font-size-small)`.
- Dynamic inline values (widths, transforms, computed positions) left untouched per D-08.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Compound statics are not properties of the named wrappers**
- **Found during:** Task 1 type check after codemod (78 TS2339 errors)
- **Issue:** `Form.Item`, `Form.useForm`, `Radio.Group`, `Input.TextArea`, `Empty.PRESENTED_IMAGE_SIMPLE`, `Upload.LIST_IGNORE`, `Image.PreviewGroup`, `Space.Compact`, `TreeSelect.SHOW_CHILD` are not reachable through the wrapper components; `NormalizeDocModal` also destructured `const { TextArea } = Input`.
- **Fix:** Rewrote call sites to existing named barrel exports and removed the destructured `Input.TextArea`; added the used names to each barrel import clause.
- **Files modified:** 13 of the 19 migrated views
- **Commit:** `e55f8b70`

**2. [Rule 1 - Bug] Decimal font sizes corrupted by literal replacement**
- **Found during:** Task 2 type check
- **Issue:** Replacing `fontSize: 11` with a quoted CSS var also matched the prefix of `11.5` and `12.5`, producing invalid `'var(--font-size-xs)'.5` expressions.
- **Fix:** Normalized those near-token decimals to `var(--font-size-small)` and re-ran `tsc --noEmit` clean.
- **Files modified:** `src/components/changeRequests/ChangeRequestTable.tsx`, `src/components/notes/DocFolderTree.tsx`
- **Commit:** `c15b1c51`

**3. [Rule 2 - Security/correctness] Status colors still came from ad-hoc hex**
- **Found during:** Task 2 token audit
- **Issue:** CR type colors `#52c41a`/`#faad14` sat in `CR_TYPE_CONFIG` and Tag color props, outside the guard's hex regex but still bypassing the D-12 status map and theme parity.
- **Fix:** Moved them to `status: 'success' | 'warning'` on `CR_TYPE_CONFIG`, rendered `Tag status`, and used `--warning`/`--success` CSS vars for the matching icons.
- **Files modified:** `src/components/changeRequests/ChangeRequestModal.tsx`, `ChangeRequestTable.tsx`, `TargetSystemsSelector.tsx`
- **Commit:** `c15b1c51`

**Total deviations:** 3 auto-fixed (1 Rule 3, 1 Rule 1, 1 Rule 2). No scope creep; no new package or duplicate wrapper.

## Issues Encountered
- Two pre-existing `eslint-disable-next-line react-hooks/exhaustive-deps` directives report as unused warnings in scoped lint (exit 0); they were present at HEAD and were left unchanged under D-04.

## User Setup Required
None.

## Next Phase Readiness
U3 (CR detail actions) and U4 (modal forms) are ready for Chrome light/dark UAT. The static-API and inline-style guards now read `wave-04.txt`; later waves can add their own manifests, and the final wave still owns the `npm run lint = eslint src` promotion per D-11.

## Self-Check: PASSED

- `tests/fixtures/adoption/wave-04.txt` exists with exactly 19 non-empty lines and every path resolves to a file.
- Task commits `e55f8b70` and `c15b1c51` verified in git history; no unexpected deletions.
- Gates: `npx tsc --noEmit`, `npm run lint`, scoped `eslint src/components/changeRequests src/components/notes` (0 errors), `npm run test:foundation` (14 files / 83 tests), wrapper regression tests (26 tests), static-API guard and inline-style sweep (4 tests) — all green.
- Vietnamese string-literal comparison across all 19 files: 0 differences.

---
*Phase: 50-full-app-adoption*
*Completed: 2026-11-21*
