---
phase: 25-interactive-sdlc-document-wizards
plan: 17
subsystem: acceptance
status: blocked
completed: 2026-10-29
requires:
  - 25-15
  - 25-16
provides:
  - "Active F01-F16 deterministic acceptance coverage"
  - "Actual-app Playwright lifecycle/offline acceptance suite without skip/fixme tests"
  - "Project-scoped wizard transport and approved PL02 export integration"
affects:
  - 25-interactive-sdlc-document-wizards
tech-stack:
  added: []
  patterns:
    - "Serial targeted Vitest acceptance execution"
    - "Playwright actual Vite app at /task-management/ with transport interception"
key-files:
  created:
    - e2e/documentWizards.spec.ts
    - .planning/phases/25-interactive-sdlc-document-wizards/25-17-SUMMARY.md
  modified:
    - tests/ai/wizardService.test.ts
    - tests/ai/reconciliation.test.ts
    - tests/export/wizardDocx.test.ts
    - src/components/ai/AIChatDrawer.tsx
    - src/services/wizard/wizardCoordinator.ts
    - e2e/documentWizards.spec.ts
key-decisions:
  - "Keep all F01-F16 deterministic assertions active; no todo, skip, or fixme remains in Phase 25-17 target files."
  - "Use actual app Playwright interactions and route mocks; no page.setContent or paid/network model dependency."
  - "Normalize coordinator-generated PL02 approval payload into the dedicated builder envelope before DOCX build."
  - "Bind change-pack expected CR to coordinator metadata and retain explicit unknown identity values for missing base/head/branch."
metrics:
  duration: "resumed execution"
  tasks: 2
  files: 6
---

# Phase 25 Plan 17: Acceptance Conversion and Actual-App Proof Summary

**F01-F16 deterministic gates are active and the actual PlannerMate wizard suite now exercises real project scope, metadata, transport, reload, offline, pack, and export paths without skipped tests.**

## Task Commits

1. `cb844f0` — `test(25-17): activate deterministic wizard acceptance gates`
2. `3e7b047` — `fix(25-17): close wizard UI acceptance wiring`
3. `fc82fd0` — `fix(25-17): restore CAB builder acceptance import`
4. `4933b67` — `feat(25-17): close wizard acceptance integration`
5. `a5deb6d` — `fix(25-17): preserve wizard stage progress after local errors`
6. `2d00632` — `fix(25-17): harden wizard stage and snapshot selection`
7. `b51a9cd` — `fix(25-17): harden actual wizard stage integration`
8. `b9e080d` — `fix(25-17): align F16 app stage contract`
9. `bfacbaa` — `test(25-17): narrow F16 transport interception`
10. `043778d` — `fix(25-17): route gap skip by field identity`

## Accomplishments

- Activated deterministic service, reconciliation, builder, component, and backup acceptance coverage.
- Added CAB builder import restoration after stale conflict resolution; four-kind DOCX suite passes.
- Replaced six Playwright `test.fixme` contracts with actual-app flows using project creation, scope selection, metadata entry, file chooser, reload, offline context, and download events.
- Wired project metadata into coordinator pack identity and corrected actual wizard stage payload shape for `runWizardStage`.
- Added coordinator-side PL02 approved export normalization so the dedicated DOCX builder receives its strict payload envelope.
- Preserved intentional `tests/ai/changePack.test.ts` changes.

## Verification

### Passed

```text
npm test -- tests/ai/wizardState.test.ts tests/ai/wizardService.test.ts tests/ai/changePack.test.ts tests/ai/reconciliation.test.ts tests/export/wizardDocx.test.ts src/components/ai/wizard/__tests__/documentWizard.test.tsx tests/backup/wizardBackup.test.ts --reporter=dot --pool=forks --maxWorkers=1
7 test files passed, 121 tests passed

npm test -- tests/ai/reconciliation.test.ts --reporter=dot
1 test file passed, 16 tests passed

npm test -- tests/export/wizardDocx.test.ts --reporter=dot
1 test file passed, 23 tests passed

npm run test:e2e -- e2e/documentWizards.spec.ts --project=chromium
1 actual-app boot/base-path smoke passed
```

- Phase target source scan: no `it.todo`, `test.todo`, `test.skip`, `it.skip`, `describe.skip`, or `test.fixme` remains in target files.
- `page.setContent` absent from actual-app E2E.
- `git diff --check` passed.

### Blocked

```text
npm run test:e2e -- e2e/documentWizards.spec.ts --project=chromium --workers=1
Boot smoke and lifecycle preview now execute on clean server; four F16 tests still fail (skip summary, reload scope restore, and approved export persistence/download paths).
```

Failure is real, not suppressed: actual app remains at `PL02 Bước 1/4` after the mocked answer, so preview/export assertions do not pass. Earlier runs also exposed a valid-pack identity error rendered as generic invalid-pack copy. No pass claim made.

Full TypeScript and clean Vite E2E server startup remain blocked by missing installed knowledge-server parser modules: `unified`, `remark-parse`, `remark-gfm`, `mdast`, and `mdast-util-to-string`. They are declared in `package.json` but absent from current `node_modules`; no package install attempted because package installation requires explicit legitimacy handling.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Restored CAB builder acceptance import**
- **Found during:** deterministic DOCX verification
- **Issue:** stale conflict resolution retained CAB tests but dropped `buildCabDocument` and `CabDocxPayload` imports.
- **Fix:** restored imports from `src/services/export/cabDocx.ts`.
- **Files:** `tests/export/wizardDocx.test.ts`
- **Commit:** `fc82fd0`

**2. [Rule 1 - Bug] Corrected actual drawer wizard stage payload shape**
- **Found during:** actual-app lifecycle proof
- **Issue:** drawer passed `WizardStageInput` directly to `runWizardStage`, while service requires `payload.evidence` and PL02 known/skipped field arrays.
- **Fix:** map drawer coordinator input to service payload before stage execution.
- **Files:** `src/components/ai/AIChatDrawer.tsx`
- **Commit:** `4933b67`

**3. [Rule 1 - Bug] Normalized PL02 approved export payload**
- **Found during:** actual export integration
- **Issue:** coordinator forwarded generic wizard render payload to strict PL02 DOCX dispatcher.
- **Fix:** construct bounded approved PL02 payload from metadata/render snapshot when caller payload is generic.
- **Files:** `src/services/wizard/wizardCoordinator.ts`
- **Commit:** `4933b67`

**4. [Rule 2 - Missing Critical] Bound pack identity to wizard metadata**
- **Found during:** actual change-pack proof
- **Issue:** drawer supplied title as CR and empty identity fields, causing valid pack rejection without truthful identity comparison.
- **Fix:** read CR from coordinator metadata and preserve explicit unknown base/head/branch values until a real pack identity is supplied.
- **Files:** `src/components/ai/AIChatDrawer.tsx`
- **Commit:** `4933b67`

## Known Stubs / Open Acceptance

- Actual-app F16 lifecycle tests remain active and still fail; clean-server run confirms app stage integration remains unresolved.
- Browser failure root cause: page exception in `detectWizardGaps`/stage integration. Empty evidence guards and deterministic snapshot ordering are committed, but preview transition still lacks proof.
- Valid-pack end-to-end confirmation needs fixture identity aligned with entered CR/base/head/branch; current test intentionally exercises mismatch rejection.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag:actual-app-transport | `e2e/documentWizards.spec.ts` | Browser test intercepts synthetic model transport and observes real DOM/download/local effects; no provider or secret is used. |
| threat_flag:approved-export-normalization | `src/services/wizard/wizardCoordinator.ts` | Generic wizard render payload crosses approval boundary into strict PL02 builder; normalization supplies bounded fields before build. |
| threat_flag:pack-identity | `src/components/ai/AIChatDrawer.tsx` | Pack validation uses project wizard metadata and explicit identity values; mismatches fail before persistence. |

## Dependency Gate

Phase 24-08 status was not changed. Phase 25 completion remains blocked until its required preflight and this plan's actual-app F16 suite pass.

## Self-Check: PASSED

- Summary file exists.
- Task commits `cb844f0`, `3e7b047`, `fc82fd0`, and `4933b67` exist.
- Deterministic acceptance suite passes 121/121.
- No STATE.md or ROADMAP.md changes made.
- Generated Playwright `test-results/` artifacts removed before summary creation.
