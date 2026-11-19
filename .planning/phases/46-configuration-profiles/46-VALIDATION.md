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
| 46-01-00 | 01 | 1 | — | T-46-01 | Tracer round-trip: export blanks secrets, import merges key-by-key, capacity/Ghost Dev restored, telegramSettings row unchanged, snapshot written | unit | `npx vitest run tests/services/configProfiles/profileRoundTrip.test.ts -x` | ❌ W0 | ⬜ pending |
| 46-01-01 | 01 | 1 | — | T-46-10 | Schema rejects non-profile JSON, backup envelopes, non-empty secrets and any `telegramSettings` section; accepts capacity rules/overrides + ghostDevConfig | unit | `npx vitest run tests/validation/configProfileSchemas.test.ts -x` | ❌ W0 | ⬜ pending |
| 46-01-02 | 01 | 1 | — | T-46-01 | Export payload contains blank secrets, no current-user data and no telegramSettings key; machine values preserved | unit | `npx vitest run tests/services/configProfiles/exportProfile.test.ts -x` | ❌ W0 | ⬜ pending |
| 46-01-03 | 01 | 1 | — | T-46-02, T-46-10 | Import merges key-by-key without wholesale clear, upserts capacity by natural key, guards Ghost Dev localStorage, never overwrites keyring secrets or touches db.telegramSettings | unit | `npx vitest run tests/services/configProfiles/importProfile.test.ts -x` | ❌ W0 | ⬜ pending |
| 46-02-01 | 02 | 2 | — | — | Authoring screen seeds from defaults, never reads current settings or renders Telegram; capacity + Ghost Dev sections present; named profiles CRUD works | component | `npx vitest run tests/views/ConfigProfilesView.test.tsx -x` | ❌ W0 | ⬜ pending |
| 46-02-02 | 02 | 2 | — | — | Export one selected profile via 3-layer save helper with blank secrets | component | `npx vitest run tests/components/settings/ConfigProfileExportButton.test.tsx -x` | ❌ W0 | ⬜ pending |
| 46-03-01 | 03 | 2 | — | T-46-11, T-46-12 | Import preview flags machine-specific fields and secret re-entry items, shows no Telegram item, db threaded explicitly to applyConfigProfile | component | `npx vitest run tests/components/settings/ImportProfilePreviewModal.test.tsx -x` | ❌ W0 | ⬜ pending |
| 46-03-02 | 03 | 2 | — | T-46-12 | Post-import checklist lists all blank-secret and machine fields, no Telegram item | component | `npx vitest run tests/components/settings/PostProfileImportChecklist.test.tsx -x` | ❌ W0 | ⬜ pending |
| 46-03-03 | 03 | 2 | — | — | SettingsView still locks six tabs | component | `npx vitest run tests/views/SettingsView.test.tsx -x` | ✅ | ⬜ pending |
| 46-04-01 | 04 | 3 | — | — | Focused suite + typecheck gate across plans 01-03 (mirrors Plan 04 Task 1 command verbatim) | unit+integration | `npx tsc --noEmit -p tsconfig.json && npx vitest run tests/validation/configProfileSchemas.test.ts tests/services/configProfiles/profileRoundTrip.test.ts tests/services/configProfiles/exportProfile.test.ts tests/services/configProfiles/importProfile.test.ts tests/views/ConfigProfilesView.test.tsx tests/components/settings/ConfigProfileExportButton.test.tsx tests/components/settings/ImportProfilePreviewModal.test.tsx tests/components/settings/PostProfileImportChecklist.test.tsx tests/views/SettingsView.test.tsx src/utils/__tests__/fileExport.test.ts -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/services/configProfiles/profileRoundTrip.test.ts` — tracer: export→validate→import across settings/capacity/Ghost Dev, telegramSettings unchanged
- [ ] `tests/validation/configProfileSchemas.test.ts` — schema + secret blank rules + telegramSettings rejected + capacity/Ghost Dev round-trip
- [ ] `tests/services/configProfiles/exportProfile.test.ts` — export one profile, no live settings read, no telegramSettings key
- [ ] `tests/services/configProfiles/importProfile.test.ts` — merge/no-clear/secret preservation + capacity upsert + Ghost Dev guard + telegramSettings untouched
- [ ] `tests/views/ConfigProfilesView.test.tsx` — named profile CRUD + defaults seeding + no Telegram field
- [ ] `tests/components/settings/ConfigProfileExportButton.test.tsx` — one-click export of selected profile
- [ ] `tests/components/settings/ImportProfilePreviewModal.test.tsx` — preview warnings + db threading + no Telegram item
- [ ] `tests/components/settings/PostProfileImportChecklist.test.tsx` — re-entry checklist, no Telegram item

*Existing infrastructure otherwise covers the phase.*

---

## Scope Decision — Telegram Excluded (user, 2026-11-19)

Telegram settings are owner-machine-only and are OUT of profile scope. Test boundary: `configProfileSchemas.test.ts` asserts a payload with `telegramSettings` is rejected; `importProfile.test.ts` / `profileRoundTrip.test.ts` assert a pre-existing `db.telegramSettings` row is unchanged after import; `ConfigProfilesView.test.tsx`, `ImportProfilePreviewModal.test.tsx` and `PostProfileImportChecklist.test.tsx` assert no Telegram field or item is rendered. Capacity rules/overrides and Ghost Dev localStorage config remain in scope.

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Native Tauri save/open dialog fallback chain | — | jsdom cannot exercise native dialogs | Run the Tauri app, export a profile, confirm native save dialog writes valid JSON; import the file from normal Settings. |
| Owner Telegram settings survive profile flow | — | requires real Tauri store + owner token | Walkthrough step 5: confirm exported JSON has no telegramSettings section and this machine's Telegram settings are unchanged after import. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending 2026-11-19
