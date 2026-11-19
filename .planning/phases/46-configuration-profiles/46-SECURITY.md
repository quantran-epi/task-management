---
phase: "46"
slug: "configuration-profiles"
status: verified
threats_open: 0
asvs_level: 1
created: "2026-11-19"
---

# Phase 46 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| in-memory profile → exported JSON file | User-authored profile becomes a portable file that may be shared; secrets must not travel. | Profile config (non-secret values + blank secret markers) |
| imported JSON file → Dexie settings | Untrusted file crosses into the canonical local store at `applyConfigProfile`. | Validated envelope → settings/capacity/Ghost Dev rows |
| profile import → OS keyring / Telegram | Keyring and Telegram table must never be a write target of profile import (owner-machine-only). | No profile data crosses; strict schema rejects Telegram section |
| profile list row → plaintext backup | `configuration_profiles` holds machine paths and blank secrets; excluded from plaintext backup. | Denylisted setting key |
| authoring form → exported file | Form is untrusted-by-design input; secrets blanked and values clamped before file export. | Validated draft envelope |
| preview confirm → apply | Exact `IMPORT` confirmation is the only path from reviewed file to db writes. | Validated envelope + injected `db` |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-46-01 | Information disclosure | `exportProfile.ts` buildProfileExportPayload | high | mitigate | Catalog-driven blanking of every secret field; export reads only the passed-in profile, never live db/keyring. Verified `exportProfile.ts:38-48` and `exportProfile.test.ts`. | closed |
| T-46-02 | Tampering | `importProfile.ts` `applyConfigProfile` trust boundary | high | mitigate | `ConfigProfileEnvelopeSchema` strictObject validation before any write; key-by-key merge; zero writes on invalid input. Verified `configProfileSchemas.ts:64`, `importProfile.ts:56-68`, tests. | closed |
| T-46-03 | Tampering | `importProfile.ts` key-by-key merge | high | mitigate | Every secret-like key skipped regardless of value; real secret of recipient survives; no keyring writes. Verified `importProfile.ts:37-38,70`, `importProfile.test.ts`. | closed |
| T-46-04 | Information disclosure | `exportBackup.ts` denylist | medium | mitigate | `configuration_profiles` denylisted from plaintext backup; Oracle keys also denylisted (phase 45). Verified `exportBackup.ts:37`. | closed |
| T-46-05 | Information disclosure | `ConfigProfileExportButton` → `exportProfileToFile` | high | mitigate | Button exports only the selected profile, secrets blanked; test asserts saved JSON has no secret value. Verified `ConfigProfileExportButton.test.tsx`. | closed |
| T-46-06 | Tampering | `ImportProfilePreviewModal` confirm gate | high | mitigate | Exact `IMPORT` confirm text plus valid payload required in `okButtonProps.disabled`; zero writes during preview. Verified `ImportProfilePreviewModal.tsx:126,279-285`. | closed |
| T-46-07 | Denial of service | `ConfigProfileImportCard` size guard | medium | mitigate | 50 MB limit in `beforeUpload` with `LIST_IGNORE` and notification before `JSON.parse`. Verified `ConfigProfileImportCard.tsx:13,44-48`. | closed |
| T-46-08 | Information disclosure | Exported profile JSON in human walkthrough | high | mitigate | Automated proof: export tests assert all secret fields empty and no keyring value. Observed-proof step 3 of the Tauri walkthrough remains a user checkpoint. Verified `exportProfile.test.ts`. | closed |
| T-46-09 | Tampering | Real settings store during import walkthrough | high | mitigate | Automated proof: merge tests assert pre-existing secret unchanged and no table clear. Observed-proof step 5 of the Tauri walkthrough remains a user checkpoint. Verified `importProfile.test.ts`. | closed |
| T-46-10 | Tampering | `applyConfigProfile` → `db.telegramSettings` | medium | mitigate | Telegram excluded by user decision: strict schema rejects `telegramSettings`, no read/write of the table; tests assert row unchanged. Verified `configProfileSchemas.ts:60`, `profileRoundTrip.test.ts`. | closed |
| T-46-11 | Tampering | Preview → `applyConfigProfile` db prop | medium | mitigate | `db` threaded card → modal → apply; no defaultDb import; test asserts injected db is written. Verified `ImportProfilePreviewModal.tsx:67`, tests. | closed |
| T-46-12 | Information disclosure | Preview / checklist Telegram leakage | low | mitigate | No Telegram field or checklist item rendered; invalid `telegramSettings` rejected by strict schema. Verified component tests. | closed |
| T-46-13 | Information disclosure | Owner `telegramSettings` in walkthrough | medium | mitigate | Automated proof: no `telegramSettings` in exported JSON and Telegram row unchanged after import. Observed-proof step 5 remains a user checkpoint. Verified schema + import tests. | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above `workflow.security_block_on` count toward `threats_open`*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

No accepted risks.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-19 | 13 | 13 | 0 | Orchestrator (L1 evidence scan; register authored at plan time, ASVS=1) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented (none)
- [x] `threats_open: 0` confirmed

**User checkpoint:** the six-step Tauri walkthrough (46-04 Task 2) remains open for human observation of exported file contents, recipient secret preservation, and Telegram settings. Automated evidence above is complete; the walkthrough is observational UAT, not an open technical threat.
