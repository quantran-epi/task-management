---
phase: 16-knowledge-server-foundation-dlp-checks-ast-ingestion
verified: 2026-10-08T15:20:00Z
status: gaps_found
score: 1/5 must-haves verified
re_verification: true
previous_status: gaps_found
previous_score: 3/5 must-haves verified
overrides_applied: 0
gap_count: 5
gaps:
  - truth: "Optional knowledge daemon starts through the supplied command and exposes one consistent authenticated API contract"
    status: failed
    reason: "The dev script executes server.ts, but server.ts only exports a builder and never calls listen(); Settings probes /api/v1/health while daemon exposes /health."
  - truth: "User can configure the daemon and create the first document set through the application UI"
    status: failed
    reason: "Settings nests a second KnowledgeConfigProvider, isolating the session token from NotesView, and NotesView supplies no onCreate handler to DocumentSetDrawer."
  - truth: "Publishing preview cannot hide remote removals when manifest state is uncertain"
    status: failed
    reason: "NotesView converts every manifest lookup failure into a null manifest, treating network, authentication, protocol, and server failures as never-published state."
  - truth: "Sensitive-data override is explicitly approved and enforced at the publish service boundary"
    status: failed
    reason: "PublishSession.confirmFindings() creates a valid nonce without accepting or validating explicit override approval; protection exists only in React presentation state."
  - truth: "Accepted publish attempts reach terminal state and reconcile durable per-document metadata"
    status: failed
    reason: "Production UI never calls pollAcceptedAttempt(), publishedDocuments is not updated after success, and drawer state remains hardcoded/default Never published."
---

# Phase 16: Knowledge Server Foundation, DLP Checks & AST Ingestion Verification Report

**Phase Goal:** Establish an optional knowledge-server publishing pipeline with pre-ingestion sensitive-data warnings and fresh explicit override, AST-based evidence chunking, SHA-256 incremental projection, durable publish metadata, and fully local/offline PlannerMate behavior when the daemon is absent.

**Verified:** 2026-10-08
**Status:** `gaps_found`
**Mode:** Re-verification after Plans 16-14 and 16-15

## Goal Achievement

### Observable Truths

| Requirement | Status | Evidence |
|---|---|---|
| `INGEST-01` | ✗ BLOCKER | Stable document-set repository exists, but `NotesView` provides no `onCreate` path for the first set. Nested configuration provider prevents Settings token from reaching Docs publishing. |
| `INGEST-02` | ✗ BLOCKER | Deterministic DLP scanning and masking exist, but `confirmFindings()` does not require explicit approval when findings exist. Service callers can bypass UI checkbox consent. |
| `INGEST-03` | ✓ VERIFIED | MDAST parsing, source-range preservation, heading paths, atomic block handling, occurrence IDs, SHA-256 identity, 6,000-character target, and 50,000-character rejection exist and pass pilot coverage. |
| `INGEST-04` | ✗ BLOCKER | Incremental projector and candidate activation exist, but supplied daemon command starts no listener. Snapshot lookup also fails open and can hide remote removals. |
| `INGEST-05` | ✗ BLOCKER | Accepted attempts are not polled by production UI, successful publication does not update `publishedDocuments`, stale rows are not removed, and drawer status remains inaccurate. |

**Score:** 1/5 must-haves verified

All Phase 16 requirement IDs are accounted for. No orphaned IDs found.

## Closed Previous Gaps

### Docs preview and DLP modal integration

Closed by Plan 16-14:

- App-level `KnowledgeConfigProvider` exists.
- `NotesView` builds a local change preview.
- `PublishPreviewModal` is mounted.
- DLP review can run without mutating canonical Markdown.

Key files:

- `src/App.tsx`
- `src/services/knowledge/knowledgeConfig.tsx`
- `src/views/NotesView.tsx`
- `tests/knowledge/NotesWorkspacePublishingIntegration.test.tsx`

### Schema V10 backup lifecycle

Closed by Plan 16-15:

- `documentSets`, `publishedDocuments`, `publishAttempts`, and `dlpAudits` are exported.
- Records are validated at import boundary.
- Restore, pre-import snapshot, and rollback cover all four tables transactionally.
- Legacy backups without these optional arrays remain accepted.

Key files:

- `src/types/backup.ts`
- `src/validation/backupSchemas.ts`
- `src/services/backup/exportBackup.ts`
- `src/services/backup/validateBackup.ts`
- `src/services/backup/restoreBackup.ts`
- `tests/services/backup/knowledgeBackupRestore.test.ts`

These closures fix the two prior verification gaps but do not close deeper end-to-end blockers found during re-verification.

## Blocking Gaps

### GAP-01: Daemon runtime contract is not executable

**Evidence:**

- `knowledge-server/src/server.ts` exports `buildKnowledgeServer()` and a listener wrapper but never constructs and starts the server.
- `knowledge-server/package.json` runs `tsx watch src/server.ts`.
- Runtime probe against `http://127.0.0.1:3001/health` failed with `ECONNREFUSED`.
- `KnowledgeServerConfigCard` probes `/api/v1/health`, while the daemon registers `/health`.

**Required closure:**

1. Add a dedicated executable entrypoint that reads validated runtime configuration and calls `listen()`.
2. Point daemon dev/start scripts at that entrypoint.
3. Define one authenticated health-route contract used by both client and daemon.
4. Add an integration test using the exact browser route.

### GAP-02: Shared configuration and first-set creation are unwired

**Evidence:**

- `App.tsx` provides root `KnowledgeConfigProvider`.
- `SettingsView.tsx` creates a nested provider around the settings card.
- Session token entered in Settings updates only nested context; `NotesView` consumes outer context.
- `NotesView.tsx` does not pass `onCreate` to `DocumentSetDrawer`.
- Drawer create buttons call optional `onCreate`, so initial creation does nothing.

**Required closure:**

1. Remove nested Settings provider and consume app-level provider.
2. Add explicit create mode to drawer/form flow.
3. Wire `createDocumentSet` from `NotesView`.
4. Test token entry followed by Docs preview through one shared provider.

### GAP-03: Manifest lookup fails open

**Evidence:**

`NotesView.tsx` catches every `getSnapshotManifest()` error and substitutes `activeManifest = null`.

**Impact:**

- Offline, timeout, 401, 403, malformed response, and server failure all appear as never-published state.
- Remote-only documents disappear from preview.
- A later successful POST could remove unseen remote documents without removal consent.

**Required closure:**

1. Treat only authoritative 404 as absent snapshot.
2. Surface authentication, protocol, and server failures.
3. During network uncertainty, use a trusted content-free cached manifest or allow preview while disabling submission.
4. Test remote-removal visibility and blocked submission under uncertainty.

### GAP-04: DLP override consent is not enforced by service

**Evidence:**

`PublishSession` permits `scan()` → `confirmFindings()` → `submitConfirmedAttempt()` without an explicit approval argument. Checkbox gating exists only in `PublishPreviewModal`.

**Required closure:**

1. Require explicit override approval in `confirmFindings()` when findings exist.
2. Reject direct service calls lacking approval.
3. Pass checkbox state into the service call.
4. Add direct bypass-rejection coverage.

### GAP-05: Attempt lifecycle and published metadata reconciliation are incomplete

**Evidence:**

- `PublishPreviewModal.tsx` hardcodes `Publishing` after submission.
- No production caller invokes `pollAcceptedAttempt()`.
- `knowledgeClient.ts` reconciles `PublishAttemptCache` only.
- Production code does not replace `publishedDocuments` after successful activation.
- Removed documents can retain stale metadata.
- `DocumentSetDrawer.tsx` renders false/default `Never published` states.

**Required closure:**

1. Poll accepted attempts through terminal state.
2. Preserve attempt ID when modal observation closes.
3. On success, atomically persist terminal attempt plus active document hashes/snapshot IDs.
4. Delete stale metadata only after successful activation.
5. Render actual per-set and per-document state.

## Additional Data-Safety Finding

Code review finding `CR-08` is confirmed: runtime supports document-scoped chat threads, but `BackupChatThreadRecordSchema` rejects `scopeType: 'document'`. An app-generated backup containing Docs chat history can therefore fail its own validation.

This defect must be included in the next gap-closure plan even though it is not one of the five ingestion truths above.

## Independent Checks

| Check | Result |
|---|---|
| PlannerMate production build | ✓ Passed |
| Phase 16 gap-focused suites | ✓ 5 files, 25/25 tests |
| Connected Phase 14/15 regression gate | ✓ 14 files, 149/149 tests |
| Root Phase 16 suites | ✓ 11 files, 82/82 tests |
| Knowledge daemon suites | ✓ 7 files, 44/44 tests |
| Combined Phase 16 targeted coverage | ✓ 18 files, 126/126 tests |
| Knowledge daemon TypeScript build | ✓ Passed |
| Daemon runtime probe | ✗ `ECONNREFUSED` |
| Phase 16 code review | ✗ 9 critical, 6 warning findings |
| Schema drift gate | ✓ No drift detected |
| Codebase drift gate | Skipped: no `STRUCTURE.md` |

Passing unit and component tests do not currently cover real daemon startup, one-provider token flow, first-set creation, safe manifest error classification, service-level DLP approval, terminal polling, or successful metadata reconciliation.

## Code Review Cross-Check

Directly confirmed blockers from `16-REVIEW.md`:

- `CR-01`: daemon entrypoint does not listen.
- `CR-02`: health-route mismatch.
- `CR-03`: nested provider isolates token.
- `CR-04`: first set cannot be created through UI.
- `CR-05`: manifest errors fail open.
- `CR-06`: accepted attempt is never polled.
- `CR-07`: published-document metadata is never reconciled.
- `CR-08`: document-scoped chat backup validation mismatch.
- `CR-09`: explicit DLP approval is absent from service boundary.

No later roadmap phase clearly owns these gaps. No deferral applied.

## Verdict

Phase goal is not achieved. Do not mark Phase 16 complete. Create new gap-closure plans from this report, execute them, rerun code review, and re-verify.

---

_Verified: 2026-10-08_
_Verifier: Claude (gsd-verifier)_
