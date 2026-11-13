---
phase: "38"
slug: "hard-token-budget-accurate-measurement"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-11-14"
updated: "2026-11-14"
---

# Phase 38 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Register authored across `38-01-PLAN.md` … `38-12-PLAN.md` `<threat_model>` blocks.
> Verified against implemented code at HEAD (`feature/intellij-workbench`, after `ff2c10ba`).

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Settings drawer / team form → Dexie | User-typed `budgetWarnThresholdPct`, budget totals, per-member shares | Numbers, null (clear), undefined (leave alone) |
| Backup artifact → restore | Arbitrary JSON file becomes database rows | Whole AI Office rows incl. split usage columns |
| Database → export artifact | Local rows leave the machine as a file | Same rows, `diagnosticDetail` stripped |
| Provider response → runtime accumulator | Untrusted `usage` numbers and arbitrary text | `prompt_tokens`, cache fields, `streamingText` |
| Coordinator live state → OS notification | Numbers and names leave the app into the desktop channel | Percentage, team/agent name only |
| Dexie rows → rendered numbers | Persisted counts become what the user believes was spent | Granted / used / remaining, split in/out |
| npm registry → dependency tree | External package becomes executable build input | `js-tiktoken@1.0.21` |
| TypeScript table list → Rust allowlist | Textual contract across two languages | Table names |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-38-01 | Tampering | `AiTeamUpdateSchema` / `updateTeam` | high | mitigate | `warnThresholdPctSchema = z.number().int().min(1).max(100).optional()` (`aiOfficeSchemas.ts:46`) on both `AiTeamInputSchema:110` and `AiTeamUpdateSchema:123`; `clampBudgetWarnThresholdPct` re-clamps at every repo write (`aiTeamRepo.ts:121`, `:221`, `:650`; helper `types/aiOffice.ts:300-306`). Tests: `aiTeamRepo.test.ts:815-826` (1/100 stored, 0/101/2.5 rejected), `:528-543` (0→1, 120→100). | closed |
| T-38-02 | Tampering | new member/attempt usage columns | medium | mitigate | Every member creation path seeds `inputTokens: 0, outputTokens: 0` (`aiTeamRepo.ts:138-139`, `:150-151`, `:277-278`, `:462-463`); attempt rows are created without the optional columns (`aiTeamRunRepo.ts:139-152`) and receive only flush-derived non-negative values (`teamRunCoordinator.ts:985-991`). Backup boundary: `aiTokensSchema = z.number().int().nonnegative()` (`backupSchemas.ts:612`) on member `:675-676` and assignment `:801-802`. Tests: `backupSchemas.test.ts:234-252` (-1, 1.5, `'yes'` refused). | closed |
| T-38-03 | Information disclosure | new column names | medium | mitigate | `inputTokens`, `outputTokens`, `usageEstimated`, `budgetWarnThresholdPct`, `cacheReadTokens`, `cacheCreationTokens` re-tested against `FORBIDDEN_BACKUP_KEYS` (`backupSchemas.ts:194-199`) and the key regex (`:212`): no set hit, no regex hit (audit re-ran both). No prompt/error/runtime/stack/diagnostic fragment. | closed |
| T-38-04 | Repudiation | `ROADMAP.md` / `REQUIREMENTS.md` | medium | mitigate | REQUIREMENTS keeps both struck-through originals beside the override (`REQUIREMENTS.md:65`, `:73`, `grep -c '~~'` = 4). ROADMAP carries the override annotation only (`ROADMAP.md:235`, `:240` — 2 × `overrides the original wording`), no strikethrough. Amendment A-1. | closed |
| T-38-05 | Tampering | `incrementMemberUsage` | high | mitigate | Read-modify-write inside one `db.transaction('rw', db.aiTeamMembers, …)` (`aiTeamRepo.ts:691-716`). 20-way concurrency test against real Dexie, no mock (`aiTeamRepo.test.ts:556-575`, `:577-596`, same-tick `:598-608`). | closed |
| T-38-06 | Tampering | `splitEvenly` | medium | mitigate | `count === 0` returns `[]` before dividing; total normalized via `Math.round(Math.max(0, Number.isFinite(total) ? total : 0))` (`budgetSplit.ts:20-24`). Single implementation imported by `aiTeamRepo.ts:5` and `TeamSettingsDrawer.tsx:11`. Tests: `aiTeamRepo.test.ts:936-1004` (lead-alone, empty, 0, 1001 remainder, no-lead, -5→0). | closed |
| T-38-07 | Denial of service | budget write path | low | **accept** | A rejected increment throws to the caller, which swallows it: `incrementMemberUsage(...).then(() => undefined, () => undefined)` (`teamRunCoordinator.ts:1600-1605`). No user-visible hang. Logged in Accepted Risks Log. | closed |
| T-38-08 | Tampering | `applyTopUp` | high | mitigate | One `rw` over `[aiTeams, aiTeamMembers]` (`aiTeamRepo.ts:530`); fresh roster read inside (`:534`); missing member throws at `:538-540` before any write; `added === 0` returns early (`:541`). Test asserts both tables equal their pre-call values (`aiTeamRepo.test.ts:295-310`). | closed |
| T-38-09 | Tampering | stale roster in `topUp` | high | mitigate | Roster read with `where('teamId')` inside the transaction (`aiTeamRepo.ts:534`); `topUp` calls `applyTopUp` directly with no `ensureMembers()` on the path (`teamRunCoordinator.ts:3561-3572`). Mid-turn-add regression test (`teamRunCoordinator.test.ts:1317-1365`). | closed |
| T-38-10 | Elevation of privilege | negative or ambiguous budget write | low | mitigate | `nonNegativeInt` = `Number.isFinite ? Math.max(0, Math.round(v)) : 0` (`aiTeamRepo.ts:505-507`), used at `:536`, `:626`, `:637`, `:668`. Absolute writer sets values only (`:621-657`). Test pins 3000→4000 (`SettingsSaveBudget.test.tsx:186-204`). | closed |
| T-38-11 | Tampering | `resolveThresholdPct` | high | mitigate | Every branch rounds and clamps to 1..100 via `inBand` (`budgetGate.ts:70-87`); non-finite/out-of-band falls through to the global, then the 80 default. Tests: NaN→80, 0.5→1, 0→80, -3→80, 1000→global (`budgetGate.test.ts:66-71`). | closed |
| T-38-12 | Tampering | `setGlobalBudgetWarnThresholdPct` | medium | mitigate | Writer clamps before `put` (`budgetWarnSettings.ts:31-34`); reader re-validates type, finiteness and band, falling back to 80 (`:15-24`). Tests both directions (`budgetWarnSettings.test.ts:36-59`). | closed |
| T-38-13 | Information disclosure | notification body | high | mitigate | `bodyFor` interpolates only rounded percentage and agent/team name (`budgetWarning.ts:49-55`); title is names only (`:67-71`). Prohibition recorded in `38-08-PLAN.md:57-59` (`must_haves.prohibitions`). | closed |
| T-38-14 | Tampering | `splitUsage` inputs | high | mitigate | Every component `?? 0`; negative sum cannot pass `input + output > 0` (`budgetGate.ts:47-63`). Write path adds only non-negative deltas: `Math.max(0, split - acc)` (`teamRunCoordinator.ts:1385-1386`) and estimates (`tokenEstimate.ts:52-70`). Tests: `budgetGate.test.ts:50-53` (-5/-1 → ≥0). WR-02 normalization keeps the sum equal to the provider's `prompt_tokens` (`nineRouterClient.ts:46-63`; `nineRouterClient.test.ts:40-63`), so no double charge and no negative. | closed |
| T-38-15 | Denial of service | estimation on the hot path | medium | mitigate | `estimateTokens` has exactly three call sites: the dispatch measurement (`teamRunCoordinator.ts:1506`) and the terminal estimate (`:1574-1575`). Never per delta. Load and encode failures degrade to chars÷4 and never throw (`tokenEstimate.ts:34-46`, `:56-68`); the dispatch call is wrapped in `try/catch` (`:1512-1514`), the terminal branch in `try/catch` (`:1570-1588`). Amendment A-2 (register says "never before `registry.start`"; the implemented D-07 design measures at dispatch, before `registry.start` at `:1834`). | closed |
| T-38-16 | Information disclosure | estimation source text | low | mitigate | `estimateTokens(text)` returns only `encode(text).length` or `Math.ceil(len/4)` (`tokenEstimate.ts:52-70`); the text is discarded. `currentRequests` is an in-memory `Map` (`teamRunCoordinator.ts:645`), never written to Dexie; no row or notification carries prompt text. | closed |
| T-38-17 | Tampering | `BackupAiTeam*RecordSchema` | high | mitigate | `strictObject` on team/member/assignment (`backupSchemas.ts:646`, `:667`, `:746`); `aiTokensSchema` (`:612`) on usage columns; threshold `int().min(1).max(100)` (`:662`). Tests: `backupSchemas.test.ts:280-296` (0/101/2.5/`'65'` refused), `:234-252` (negative/fractional/non-boolean refused). | closed |
| T-38-18 | Information disclosure | new backup keys | high | mitigate | Keys re-tested against `FORBIDDEN_BACKUP_KEYS` and the key regex (audit run: no hit). `strictObject` refuses undeclared keys — test asserts an undeclared `promptTokens` key is refused (`backupSchemas.test.ts:297-305`). | closed |
| T-38-19 | Repudiation | envelope version | medium | mitigate | One constant: `BACKUP_SCHEMA_VERSION = 13` (`backupSchemas.ts:846`), re-exported as `CURRENT_SCHEMA_VERSION` (`exportBackup.ts:10`), used as `z.literal(...)` (`backupSchemas.ts:850`) and as the export value (`exportBackup.ts:353`). Fixtures read the constant (`validateBackup.test.ts:11`, `:90`); the single literal `13` is a deliberate pin with `expect(CURRENT_SCHEMA_VERSION).toBe(13)` (`:109-110`). Loud-failure intent holds: `schemaVersion > CURRENT` rejects with an explicit message, `< CURRENT` rejects with `LEGACY_BACKUP_MESSAGE` (`validateBackup.ts:97-108`). Amendment A-3 (register said 14; CR-01 reverted to 13 because every phase-38 column is `.optional()`). | closed |
| T-38-20 | Information disclosure | `dispatchBudgetWarning` body | high | mitigate | Body/title built from percentage and names only (`budgetWarning.ts:49-55`, `:67-71`). Two tests: `budgetWarning.test.ts:106-118` (no `sk-`, no URL), `teamRunCoordinator.test.ts:1154-1178` (secret prompt and model output absent from every captured title/body). | closed |
| T-38-21 | Denial of service (attention) | notification spam | medium | mitigate | Marker set keyed `${teamId}:${level}` added before the await, cleared on failure (`budgetWarning.ts:29-47`, `:62-81`). Tests: second call dropped (`budgetWarning.test.ts:46-49`), different teammate dropped (`:58-62`), five rounds → one per level (`teamRunCoordinator.test.ts:988-1030`). | closed |
| T-38-22 | Tampering | gate removal | high | mitigate | No `createBudgetGate` / `shouldNotifyPause` / `bucketOf` / `normalizeUsageTotal` anywhere in `src/` or `tests/` (audit grep, 0 hits). `beforeToolRoundFor` drains the inbox and honours abort only (`teamRunCoordinator.ts:1678-1692`). No producer of `awaiting-budget`; tests poll the snapshot across a full over-budget turn (`teamRunCoordinator.test.ts:664`, `:1267`, `:1556`). Gap G-1 CLOSED: the five symbols (`createBudgetGate`, `shouldNotifyPause`, `bucketOf`, `normalizeUsageTotal`, `parkForBudget`) are now permanent `check_gone` guards in `.planning/scripts/verify-team-chat-architecture.sh`; the gate exits 0. | closed |
| T-38-23 | Repudiation | displayed budget numbers | high | mitigate | Figures come from member rows plus the coordinator `liveUsage` snapshot (`TeamSidebar.tsx:93-139`); no component recomputes from prompt text. Test asserts settled sidebar text equals the `listTeamMembers` rows (`TeamsView.test.tsx:487-512`). | closed |
| T-38-24 | Tampering | per-team override form | medium | mitigate | `InputNumber min={1} max={100}` is advisory (`TeamSettingsDrawer.tsx:391-393`); enforcement is `AiTeamUpdateSchema` + `clampBudgetWarnThresholdPct` at the repo (`aiTeamRepo.ts:219-227`, `:647-653`). | closed |
| T-38-25 | Denial of service | division by zero | low | mitigate | Every ratio guards: `teamPercent = teamTotal > 0 ? … : 0` (`TeamSidebar.tsx:137`), `ratio = total > 0 ? … : 0` (`TeamCard.tsx:53`), `percentOf` returns 0 for `budget <= 0` (`teamRunCoordinator.ts:1423-1426`). Tests assert no `NaN`/`Infinity`/`undefined` in the DOM (`TeamsView.test.tsx:398-400`, `:484-486`, `:510-512`). | closed |
| T-38-26 | Tampering | supply-chain substitution | high | mitigate | Installed metadata re-read by audit: `js-tiktoken@1.0.21`, `license: MIT`, `repository: github.com/dqbd/tiktoken`, scripts `build`/`test` only (no postinstall), one runtime dep `base64-js`. Exact pin, no range (`package.json:41`, `package-lock.json:27`). | closed |
| T-38-27 | Denial of service | 1.14 MB gzip chunk | low | **accept** | Loaded through a dynamic import of the `lite` + `ranks/o200k_base` subpaths inside the loader (`tokenEstimate.ts:26-46`); a load or encode failure degrades to chars÷4 (`:37-43`, `:62-69`). Logged in Accepted Risks Log. | closed |
| T-38-28 | Repudiation | stale/superseded usage report | high | mitigate | Report dropped unless `acc.key === accountingKey` and the key is unflushed (`teamRunCoordinator.ts:1374-1379`); flushed key added before the first await (`:1567`), second flush returns zeros (`:1552`). Tests: stale key ignored (`teamRunCoordinator.test.ts:5671-5690`), duplicate terminal seam charges once (`:5924-5960`). | closed |
| T-38-29 | Repudiation | double-incremented budget | high | mitigate | Separate verbs: `applyTopUp` (additive, `aiTeamRepo.ts:524`) vs `applyTeamBudgetSettings` (absolute, `:621`). `handleSaveSettings` makes exactly one repo call (`TeamWorkspace.tsx:692-724`). Tests: one `applyTeamBudgetSettings` call per save and 4000 total (`SettingsSaveBudget.test.tsx:186-204`, `:212`, `:242`). | closed |
| T-38-30 | Repudiation | override vs effective conflation | medium | mitigate | Two snapshot fields: `budgetWarnThresholdPct` and `budgetWarnThresholdPctOverride` (`teamRunCoordinator.ts:140-142`); `undefined` is the inherit sentinel and the only clear path (`budgetGate.ts:107-112`; `aiTeamRepo.ts:646-653`). Tests: absent override never materializes 80 (`budgetGate.test.ts:120-146`), override stays undefined on the snapshot (`teamRunCoordinator.test.ts:971-985`). | closed |
| T-38-31 | Information disclosure | settings key | low | mitigate | `ai_budget_warn_threshold_pct` holds a percentage, matches no denylist entry and no secret suffix; `isSafeBackupSetting` asserted, not widened (`budgetWarnSettings.test.ts:68`; `backupSchemas.test.ts:307-309`). Filter applied on export (`exportBackup.ts:277`) and restore (`restoreBackup.ts:204`, `:326`). | closed |
| T-38-32 | Tampering | table-list drift | medium | mitigate | Membership test reads all three lists from source (`tableListParity.test.ts:18-46`, `:107-124`); a single-list removal fails. `aiTeams`/`aiTeamMembers` asserted in Dexie, V23 stores and the TS SQLite list. | closed |
| T-38-33 | Tampering | cross-team warning reset | medium | mitigate | Reset filters on the `${teamId}:` prefix (`budgetWarning.ts:37-42`); `resetAllBudgetWarnings` has no production caller (`grep` in `src/`: definition only). Tests: top-up on team A leaves team B intact (`teamRunCoordinator.test.ts:1050-1100`), dispose scoped the same way (`:1102-1140`). | closed |
| T-38-34 | Repudiation | backup restore scope | high | mitigate | A restore must not destroy local rows the payload omits. `captureSnapshot` now carries `teamMessages` and `teamReadCursors` so a rollback replays what it cleared (`restoreBackup.ts`); the two log clears are gated on the payload actually carrying those keys (`clearTeamLog`), so an export that omits an empty log no longer wipes a local transcript; `teamParticipants` is cleared with the AI Office group and added to `RESTORE_TABLES`. Tests in `tests/services/backup/restoreBackup.test.ts` pin all three. Found by code review (CR-02, CR-03, WR-15), fixed in `c131e352` / `8bcb9115`. | closed |
| T-38-SC | Tampering | npm/pip/cargo installs | high | mitigate | Only dependency change in the phase is `js-tiktoken@1.0.21` (`9493b2b9`): lockfile diff is the package entry plus the already-present `base64-js` edge, nothing else. Exact pin via `--save-exact`. Human checkpoint recorded as pre-approved with the five legitimacy facts verified read-only before install (`38-10-SUMMARY.md:77`, `:88-90`). Amendment A-4. | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Amendments (register text vs implemented intent)

| ID | Threat | Register said | Code says | Intent still satisfied? |
|----|--------|---------------|-----------|--------------------------|
| A-1 | T-38-04 | "struck-through original is kept beside the override" in ROADMAP and REQUIREMENTS | REQUIREMENTS keeps both struck-through originals; ROADMAP replaced the wording at phase-plan time (`fe1c42ca`) and carries only `overrides the original wording per D-01/D-02` | Yes — the gate-drop decision is auditable in REQUIREMENTS, the ROADMAP annotation names the authority, and git history holds the original. Register wording should be narrowed to REQUIREMENTS. |
| A-2 | T-38-15 | "never before `registry.start`" | Measured at dispatch, immediately before `registry.start` (`teamRunCoordinator.ts:1791` then `:1834`), because D-07 requires a pre-call number | Yes — the DoS property is "no per-delta estimation and a failure never blocks the turn"; both hold. The clause was written before D-07's pre-call measurement was specified. |
| A-3 | T-38-19 | "Version 14 is a literal in one constant; restore of a v13 payload fails loudly" | `BACKUP_SCHEMA_VERSION = 13`; v13 payloads validate because every phase-38 column is `.optional()`; a higher version is rejected loudly | Yes — loud failure on an unreadable payload, and no silent column loss is possible (the columns are absent, not dropped). CR-01's revert is the correct reading of the intent. |
| A-4 | T-38-SC | "Blocking human checkpoint before install" | Checkpoint was pre-approved by the user in-session; the five legitimacy facts were verified read-only before `npm install` ran | Yes — a human authorised the pin, and the facts were checked. Recorded rather than presented interactively. |

## Unregistered Flags (WARNING — not a blocker)

No plan SUMMARY carries a `## Threat Flags` section; each carries `## Threat Surface Notes` instead, and every bullet there maps to a declared threat ID.

| Flag | Surface | Mapping |
|------|---------|---------|
| `unregistered_flag` — restore/rollback integrity of the team log | `restoreBackup.ts` `captureSnapshot` / `clearAiOffice` / `replaceTables` and the `teamMessages` / `teamReadCursors` / `teamParticipants` clears (review CR-02, CR-03, WR-15) | **Registered as T-38-34** during this audit. The class was found by code review, not by the original threat model; the fix (`c131e352` / `8bcb9115`) and its tests are now covered by a declared threat. |
| WR-02 cache normalization | `nineRouterClient.ts:46-63` | T-38-14 (no negative delta, no double charge) — verified |
| CR-05 `writeLeadRow` rewrite | `aiTeamRepo.ts:249-280` | T-38-02 (seeded non-negative usage) + T-38-23 (displayed numbers from rows) — verified |
| CR-01 envelope revert 14 → 13 | `backupSchemas.ts:846` | T-38-19 — verified, Amendment A-3 |

## Residual Gaps (non-blocking)

| ID | Threat | Gap | Recommended follow-up |
|----|--------|-----|-----------------------|
| G-1 | T-38-22 | **CLOSED 2026-11-14.** The permanent source-grep guard is now in `.planning/scripts/verify-team-chat-architecture.sh` as `check_gone` entries for `createBudgetGate`, `shouldNotifyPause`, `bucketOf`, `normalizeUsageTotal` and `parkForBudget`; the gate exits 0 at HEAD. | — |

---

## Accepted Risks Log

| Threat ID | Risk | Why accepted | Residual exposure |
|-----------|------|--------------|-------------------|
| T-38-07 | A usage increment whose member row is missing throws to the caller instead of retrying | The only production caller is the fire-and-forget flush chain, which swallows both outcomes (`teamRunCoordinator.ts:1600-1605`); the turn is never blocked and the user sees no hang | That attempt's tokens are not charged. `flushAccounting` returns zeros and leaves the key unflushed (WR-06), so a later flush can still charge it. |
| T-38-27 | The BPE rank table is a ~1.14 MB gzip chunk | Loaded lazily off the startup path through a dynamic import; a failure degrades to chars÷4 rather than breaking a turn | First estimation in a session may wait on the chunk; a permanent load failure means estimates are heuristic (still marked `~` and still charged). |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-14 | 34 | 34 | 0 | gsd-security-auditor |
| 2026-11-14 | 35 | 35 | 0 | follow-up: G-1 guard added, T-38-34 registered |

Threat count includes T-38-21, T-38-22, T-38-32 and T-38-33, which are declared in the plan `<threat_model>` blocks but were omitted from the caller-supplied register summary.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed (no open threat at or above `high`)
- [x] `status: verified` set in frontmatter
- [x] Implementation files not modified by this audit

**Approval:** verified 2026-11-14
