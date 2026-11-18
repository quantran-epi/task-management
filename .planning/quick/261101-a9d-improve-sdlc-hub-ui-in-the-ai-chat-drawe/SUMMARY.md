---
status: complete
date: 2026-11-01
commits: [9f25228c, a9db68de, bbcd43e4, 32ff0934]
---

# Quick Task 261101-a9d — SDLC hub UI in the AI chat drawer

Three reported UI defects, presentation only. No service, coordinator, artifact or
persistence code changed.

## What changed

1. **Drawer shows only the current step.** `SdlcWorkflowHub` gained
   `variant?: 'full' | 'drawer'`. The drawer variant renders a compact card for
   `state.currentStep` — feature name, cycle state, step number/title, status tag,
   hint, the current step's own panel, and the actions it needs (`Cập nhật lại`,
   `Sửa PL01/PL02`, `Cập nhật yêu cầu`/`Cập nhật solution`). The six-step timeline,
   the other steps' panels, cycle history and `Làm mới workflow` live behind a
   `Chi tiết` button in a `Modal` (`width: min(1100px, calc(100vw - 32px))`,
   `zIndex 1400`, body `maxHeight: calc(100vh - 200px)` + `overflowY: auto`).
   The modal renders `<SdlcWorkflowHub {...props} variant="full" inDetailModal />`,
   so every existing hub interaction is reused rather than reimplemented.

2. **Nested source picker hidden.** `NoteSourcePickerModal` now sets `zIndex={1310}`
   — its parent `StepInputDocsModal` is 1300 and antd's default 1000 put the picker
   behind it, making "Chọn nguồn" look like a no-op.

3. **Preview overflow + cramped modals.** Added `gridTemplateRows: 'minmax(0, 1fr)'`
   to the picker grid and `minWidth: 0` / `minHeight: 0` to both grid children, so
   the Markdown body scrolls inside its pane instead of spilling below the modal
   footer. The outer preview pane is `overflow: hidden` and the inner Markdown block
   is the scroll container — the shorthand `overflow` would otherwise override the
   child's `overflowY: 'auto'` and kill scrolling. Both modals widened to
   `min(1000px, calc(100vw - 32px))` with a taller content area.

## Gotcha found during execution

The drawer card and the modal can show the same step simultaneously, so both
rendered `data-testid="hub-panel-<step>"` and every DOM lookup became ambiguous.
The modal copy is now `hub-panel-modal-<step>`; the drawer keeps the original id
since it is the primary surface.

## Verification

```
npx tsc --noEmit                                                  exit 0
npx vitest run src/components/ai/wizard/__tests__/                94 passed (5 files)
npx vitest run src/components/ai/wizard/__tests__/ \
  tests/phase25_1SafetyGates.test.ts                             105 passed
npx vitest run tests/ai/AIChatDrawerSdlcRecovery.test.tsx          17 passed (alone)
npx vitest run tests/ai/AIChatDrawerSdlcIntake.test.tsx             5 passed (alone)
npx playwright test e2e/sdlcHubFlow.spec.ts \
  e2e/sdlcFlowHardening.spec.ts                                    19 passed
```

Whole-repo vitest never run (it exceeds an hour).

## Still open (not addressed here)

Feature-level behaviour was not retested beyond the suites above; the user asked
for UI only. Manual Tauri UAT gates G1/G2/G3 from phase 25.1 remain unsigned.
