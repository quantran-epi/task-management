---
phase: "46"
slug: "configuration-profiles"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-19"
---

# Phase 46 — Validation Strategy

> Per-phase validation contract. Focused Vitest commands only — do not run the full suite locally (user memory).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest + jsdom + fake-indexeddb |
| **Config file** | `vite.config.ts` (`test.environment='jsdom'`, setup `tests/setup.ts`) |
| **Quick run command** | `npx vitest run <file> -x` |
| **Full suite command** | `npm test` (CI / final gate only; not local default) |
| **Estimated runtime** | ~10–60 seconds per focused file |

---

## Sampling Rate

- **After every task commit:** Run the focused command mapped to the task below.
- **After every plan wave:** Run the union of focused commands for that wave plus `npx tsc --noEmit -p tsconfig.json`.
- **Before `/gsd-verify-work`:** All focused tests green plus typecheck; full suite only if explicitly requested.
- **Max feedback latency:** 60 seconds.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 46-01-01 | 01 | 1 | — | — | Schema rejects non-profile JSON and secret values in export | unit | `npx vitest run tests/validation/configProfileSchemas.test.ts -x` | ❌ W0 | ⬜ pending |
| 46-01-02 | 01 | 1 | — | T-46-01 | Export payload contains blank secrets and no current-user data | unit | `npx vitest run tests/services/configProfiles/exportProfile.test.ts -x` | ❌ W0 | ⬜ pending |
| 46-01-03 | 01 | 1 | — | T-46-02 | Import merges settings key-by-key without wholesale clear and never overwrites keyring secrets | unit | `npx vitest run tests/services/configProfiles/importProfile.test.ts -x` | ❌ W0 | ⬜ pending |
| 46-02-01 | 02 | 2 | — | — | Authoring screen seeds from defaults, never reads current settings; named profiles CRUD works | component | `npx vitest run tests/views/ConfigProfilesView.test.tsx -x` | ❌ W0 | ⬜ pending |
| 46-02-02 | 02 | 2 | — | — | Export one selected profile via 3-layer save helper | component | `npx vitest run tests/components/settings/ConfigProfileExportButton.test.tsx -x` | ❌ W0 | ⬜ pending |
| 46-03-01 | 03 | 2 | — | — | Import preview flags machine-specific fields and secret re-entry items | component | `npx vitest run tests/components/settings/ImportProfilePreviewModal.test.tsx -x` | ❌ W0 | ⬜ pending |
| 46-03-02 | 03 | 2 | — | — | Post-import checklist lists all blank-secret fields | component | `npx vitest run tests/components/settings/PostProfileImportChecklist.test.tsx -x` | ❌ W0 | ⬜ pending |
| 46-03-03 | 03 | 2 | — | — | SettingsView still locks six tabs | component | `npx vitest run tests/views/SettingsView.test.tsx -x` | ✅ | ⬜ pending |
| 46-04-01 | 04 | 3 | — | — | Focused suite + typecheck gate across plans 01-03 | unit+integration | `npx tsc --noEmit -p tsconfig.json && npx vitest run tests/validation/configProfileSchemas.test.ts tests/services/configProfiles/exportProfile.test.ts tests/services/configProfiles/importProfile.test.ts tests/views/ConfigProfilesView.test.tsx tests/components/settings/ImportProfilePreviewModal.test.tsx tests/views/SettingsView.test.tsx -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/validation/configProfileSchemas.test.ts` — schema + secret blank rules
- [ ] `tests/services/configProfiles/exportProfile.test.ts` — export one profile, no live settings read
- [ ] `tests/services/configProfiles/importProfile.test.ts` — merge/no-clear/secret preservation
- [ ] `tests/views/ConfigProfilesView.test.tsx` — named profile CRUD + defaults seeding
- [ ] `tests/components/settings/ImportProfilePreviewModal.test.tsx` — preview warnings
- [ ] `tests/components/settings/PostProfileImportChecklist.test.tsx` — re-entry checklist

*Existing infrastructure otherwise covers the phase.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Native Tauri save/open dialog fallback chain | — | jsdom cannot exercise native dialogs | Run the Tauri app, export a profile, confirm native save dialog writes valid JSON; import the file from normal Settings. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending 2026-11-19
