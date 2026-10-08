---
phase: 16-knowledge-server-foundation-dlp-checks-ast-ingestion
verified: 2026-10-08T16:50:00Z
status: gaps_found
score: 3/5 must-haves verified
overrides_applied: 0
gaps:
  - truth: "User can trigger document set publishing preview and DLP check flow from Docs UI workspace"
    status: failed
    reason: "DocumentSetDrawer in NotesView.tsx has hardcoded configured={false} and onPreview={() => {}} stub, with PublishPreviewModal omitted from component tree. User cannot publish document sets."
    artifacts:
      - path: "src/views/NotesView.tsx"
        issue: "Lines 1029-1040 pass configured={false} and onPreview={() => {}} to DocumentSetDrawer; PublishPreviewModal is never rendered"
    missing:
      - "Wire knowledge client/daemon configuration state to NotesView"
      - "Wire onPreview handler to open PublishPreviewModal with selected DocumentSet"
      - "Mount PublishPreviewModal in NotesView and connect to PublishSession/publishOrchestrator"
  - truth: "Encrypted and JSON backup export/restore preserves all knowledge publishing metadata and document sets without silent data loss"
    status: failed
    reason: "exportBackup.ts and restoreBackup.ts do not include Schema V10 tables (documentSets, publishedDocuments, publishAttempts, dlpAudits), violating local-first data durability and backup safety constraints."
    artifacts:
      - path: "src/services/backup/exportBackup.ts"
        issue: "exportBackupPayload omits documentSets, publishedDocuments, publishAttempts, and dlpAudits from backup bundle"
      - path: "src/services/backup/restoreBackup.ts"
        issue: "restoreBackupPayload does not clear or restore documentSets, publishedDocuments, publishAttempts, or dlpAudits"
    missing:
      - "Add documentSets, publishedDocuments, publishAttempts, and dlpAudits to backup schema and exportBackupPayload"
      - "Add transactional restore and schema validation for the 4 Phase 16 tables in restoreBackup.ts"
---

# Phase 16: Knowledge Server Foundation, DLP Checks & AST Ingestion Verification Report

**Phase Goal:** Establish an optional knowledge-server publishing pipeline with pre-ingestion sensitive-data warnings and fresh explicit override, AST-based evidence chunking, and SHA-256 incremental chunk projection.
**Verified:** 2026-10-08T16:50:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Lossless section-first AST chunking splits Markdown on H2/H3 while preserving code blocks, tables, and ASCII diagrams with 50k character atomic safety limit | ✓ VERIFIED | `knowledge-server/src/parser/sectionChunker.ts`, `markdownAst.ts`, `atomicBlockValidator.ts` verified. Pilot acceptance test suite confirms 0 character loss on banking fixtures. |
| 2 | Client DLP scanner catches PAN, CVV, PIN, HSM keys, credentials, and customer PII before egress, displays masked previews, and requires fresh non-reusable confirmation nonce | ✓ VERIFIED | `src/services/knowledge/dlpScanner.ts`, `publishOrchestrator.ts`, `tests/knowledge/phase16Acceptance.test.tsx` verify pre-send gate, masked context, single-use nonce, and zero-secret audit records in `dlpAudits`. |
| 3 | SHA-256 incremental projection preview classifies added, changed, removed, and unchanged documents/chunks without network roundtrips | ✓ VERIFIED | `src/services/knowledge/changePreview.ts` and `knowledge-server/src/indexing/incrementalProjector.ts` share canonical hashing policy in `chunkHashPolicy.ts`. |
| 4 | User can trigger document set publishing preview and DLP check flow from Docs UI workspace | ✗ FAILED | `src/views/NotesView.tsx` mounts `DocumentSetDrawer` with hardcoded `configured={false}` and stubbed `onPreview={() => {}}`. `PublishPreviewModal` is absent from `NotesView`. |
| 5 | Encrypted and JSON backup export/restore preserves all knowledge publishing metadata and document sets without silent data loss | ✗ FAILED | `src/services/backup/exportBackup.ts` and `src/services/backup/restoreBackup.ts` omit the 4 Schema V10 Dexie tables (`documentSets`, `publishedDocuments`, `publishAttempts`, `dlpAudits`). Restoring a backup wipes or leaves orphaned document sets. |

**Score:** 3/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `knowledge-server/src/parser/sectionChunker.ts` | AST section chunker | ✓ VERIFIED | Substantive AST visitor, handles H2/H3 splitting, preserves tables and fences |
| `knowledge-server/src/indexing/chunkHashPolicy.ts` | SHA-256 hashing rules | ✓ VERIFIED | Deterministic newline and whitespace normalization, builds content hashes |
| `src/services/knowledge/dlpScanner.ts` | Pre-send DLP regex + Luhn | ✓ VERIFIED | Scans PAN with Luhn, CVV, PIN, HSM keys, secrets, PII |
| `src/services/knowledge/publishOrchestrator.ts` | Publish session & nonce | ✓ VERIFIED | `PublishSession` coordinates scan, nonce confirmation, and client push |
| `src/components/knowledge/DocumentSetDrawer.tsx` | UI drawer for sets | ⚠️ PARTIAL | Exists and substantive, but unwired in parent view |
| `src/components/knowledge/PublishPreviewModal.tsx` | UI preview & DLP modal | ⚠️ ORPHANED | Exists and substantive, but not mounted in `NotesView.tsx` |
| `src/views/NotesView.tsx` | Docs workspace integration | ✗ STUB / UNWIRED | `configured={false}` and `onPreview={() => {}}` stubbed; modal missing |
| `src/services/backup/exportBackup.ts` | Local backup export | ✗ INCOMPLETE | Does not export V10 knowledge tables |
| `src/services/backup/restoreBackup.ts` | Local backup restore | ✗ INCOMPLETE | Does not restore V10 knowledge tables |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `NotesView.tsx` | `DocumentSetDrawer.tsx` | JSX props | ⚠️ PARTIAL | Drawer rendered but `configured={false}` hardcoded and `onPreview={() => {}}` |
| `NotesView.tsx` | `PublishPreviewModal.tsx` | JSX modal | ✗ NOT_WIRED | Modal not imported or rendered in `NotesView.tsx` |
| `PublishSession` | `dlpScanner.ts` | method call | ✓ WIRED | `PublishSession.scan()` calls `scanDlp()` directly |
| `PublishSession` | `knowledgeClient.ts` | `submitConfirmedAttempt` | ✓ WIRED | Calls `client.publishDocumentSet()` with validated payload and nonce |
| `exportBackup.ts` | `TaskPlannerDatabase` | Dexie tables | ✗ NOT_WIRED | Tables `documentSets`, `publishedDocuments`, `publishAttempts`, `dlpAudits` omitted |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| `INGEST-01` | 16-01, 16-02 | Document sets and publishing management | ⚠️ PARTIAL | Repositories and models exist; UI trigger in `NotesView.tsx` is unwired (`onPreview={() => {}}`) |
| `INGEST-02` | 16-03 | Pre-send DLP checks and fresh consent | ✓ SATISFIED | Deterministic scanner, masking, nonces, and zero secret leakage verified in `dlpScanner.ts` |
| `INGEST-03` | 16-04, 16-05 | Lossless Markdown AST section chunking | ✓ SATISFIED | Remark AST parser, 50k character atomic limit, zero data loss on banking fixtures |
| `INGEST-04` | 16-05, 16-06 | SHA-256 incremental chunk projection | ✓ SATISFIED | `changePreview.ts` and `incrementalProjector.ts` share hash policy |
| `INGEST-05` | 16-07 | Publish UI, progress, and primary states | ⚠️ PARTIAL | Component implementations complete (`DocPublishBadge`, `DocumentSetDrawer`), but drawer action unwired in `NotesView.tsx` |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| `src/views/NotesView.tsx` | 1034 | `configured={false}` | 🛑 Blocker | Disables publish flow in Docs view permanently |
| `src/views/NotesView.tsx` | 1039 | `onPreview={() => {}}` | 🛑 Blocker | Clicking "Xem trước xuất bản" performs no action |
| `src/services/backup/exportBackup.ts` | 122-150 | Missing V10 tables | 🛑 Blocker | Silent data loss on backup export/restore |

### Gaps Summary

Phase 16 core algorithms (AST section chunker, SHA-256 hash policy, DLP scanner, Dexie V10 schema, knowledge server daemon) are implemented and substantive. However, two critical blockers prevent phase completion:

1. **Docs Workspace UI Unwired (CR-01):**
   In `src/views/NotesView.tsx`, `DocumentSetDrawer` has `configured={false}` hardcoded, `onPreview={() => {}}` stubbed out, and `PublishPreviewModal` is completely missing from the component tree. A user cannot trigger document publishing or review DLP warnings from the Docs workspace.

2. **Backup Safety Violation (CR-02):**
   In `src/services/backup/exportBackup.ts` and `src/services/backup/restoreBackup.ts`, the new Dexie V10 tables (`documentSets`, `publishedDocuments`, `publishAttempts`, `dlpAudits`) are omitted from backup export and restore envelopes. This violates PlannerMate's local-first data durability and offline safety constraints.

---

_Verified: 2026-10-08T16:50:00Z_
_Verifier: Claude (gsd-verifier)_
