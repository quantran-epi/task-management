---
phase: 16-knowledge-server-foundation-dlp-checks-ast-ingestion
verified: 2026-10-09T16:15:00Z
status: SECURED
asvs_level: 1
block_on: high
threats_total: 123
threats_closed: 123
threats_open: 0
register_authored_at_plan_time: true
---

# Phase 16: Security Audit & Threat Mitigation Verification

**Phase Goal:** Optional knowledge service, pre-ingestion sensitive-data warnings with fresh explicit override, AST evidence chunking, and SHA-256 incremental chunk projection.  
**Audit Date:** 2026-10-09T16:15:00Z  
**ASVS Level:** 1  
**Status:** `SECURED` (123/123 threats closed, 0 open blockers)

---

## Executive Summary

Audit verified all 123 threats authored across plans `16-01-PLAN.md` through `16-23-PLAN.md`.
Verification applied adversarial checks against actual implementation and test suites:
- 113 threats marked `mitigate`: verified against codebase symbols, cryptographic boundaries, AST chunk limits, and test assertions.
- 10 threats marked `accept`: verified accepted supply-chain boundaries (zero new dependencies added) and local offline-only document set non-repudiation.
- 0 threats marked `transfer`.

Both test suites pass cleanly:
- Client suites: 19 test files, 152 passed (`vitest run tests/knowledge/ tests/services/backup/`).
- Knowledge server daemon: 8 test files, 53 passed (`npm test` in `knowledge-server`).

---

## Core Security Boundary Verification

### 1. DLP Pre-Egress Gate & Fresh Override
- Outbound text scanned before network transmission in `src/services/dlp/dlpScanner.ts`. Checks PAN (Luhn validated), CVV, PIN/PIN blocks, HSM keys, credentials, and PII.
- Overlap precedence strictly enforced: `CREDENTIAL > HSM_KEY > PIN > CVV > PAN > PII`.
- Redaction masked to 80 chars max via `src/services/dlp/dlpMasker.ts`.
- Content-free audit records via `src/services/dlp/dlpAudit.ts` (records document IDs and hash counts only; no plain text).
- `PublishSession.confirmFindings(overrideApproved: boolean)` in `src/services/knowledge/publishOrchestrator.ts` strictly rejects calls without explicit override. Verified by `tests/knowledge/publishDlpGate.test.ts`.

### 2. Session Bearer Token Secrecy & Network Hygiene
- Auth token managed strictly in-memory by root `KnowledgeConfigProvider` (`src/services/knowledge/knowledgeConfig.tsx`).
- Never stored in `localStorage`, `IndexedDB`, logs, or backups.
- Sensitive settings explicitly stripped in `src/services/backup/exportBackup.ts` (`UNSAFE_OR_EPHEMERAL_SETTING_KEYS`).
- Network client (`src/services/knowledge/knowledgeClient.ts`) redacts auth headers and masks token with `***` on error messages.

### 3. Daemon Listener Hardening & Exact-Origin CORS
- Fastify server (`knowledge-server/src/server.ts`) enforces exact-origin matching (`corsOrigin` strictly checked; rejects wildcards, subpaths, and query strings).
- Remote bind protection in `knowledge-server/src/main.ts`: non-loopback host rejected unless `--remote` and `HTTPS_TERMINATED=true`.
- Constant-time token verification via `crypto.timingSafeEqual`.
- Body limit capped at 1MB (`bodyLimit: 1048576`).
- Automatic request/body log redaction via Fastify hooks.

### 4. Lossless AST Evidence Chunking & Oversized Block Defense
- Section-first chunking (`knowledge-server/src/parser/sectionChunker.ts`, `atomicBlockValidator.ts`) slices markdown cleanly along H2/H3 boundaries.
- Exact raw source slice preservation: `source.slice(chunk.startOffset, chunk.endOffset) === chunk.rawContent`.
- Tables, code blocks, and diagrams never split across chunks.
- Atomic blocks exceeding 50,000 characters fail closed with `OversizedAtomicBlockError` without truncation. Verified by `knowledge-server/tests/atomicBlock.test.ts`.

### 5. Idempotency & Set Locking
- `attemptKey` header enforced in `attemptService.ts`. Replaying an attempt key returns the matching existing attempt without re-executing.
- `SetPublishInProgressError` (HTTP 409) blocks concurrent attempts targeting the same set while allowing independent sets to run concurrently.

### 6. Atomic Activation & Remote Uncertainty
- `SnapshotStore` stages candidates (`Building` -> `Ready` -> `Active` or `Failed`). Any failure retains the previous active snapshot.
- Remote manifest 404s distinguished from transient connection failures: `NotesView.tsx` only drops remote docs on exact 404 `SNAPSHOT_NOT_FOUND`. Connection drops enter uncertain publishing state and preserve local and remote representations.
- Attempt cache records content-free manifests (`{ documentId, submittedContentHash }`), and terminal success reconciles `publishedDocuments` inside an atomic Dexie transaction while pruning history to 10 newest rows (`publishAttemptRepo.ts`).

---

## Threat Verification Register

| Threat ID | Category | Component | Disposition | Status | Evidence |
|---|---|---|---|---|---|
| `T-16-01` | Injection | `src/types/protocol.ts` | mitigate | CLOSED | Zod schemas validate protocol DTOs; `validatePublishSnapshotRequest` strictly parses incoming payloads. |
| `T-16-02` | Tampering | `knowledge-server/src/indexing/incrementalProjector.ts` | mitigate | CLOSED | Deterministic SHA-256 chunk/document hashing canonicalizes line-endings (`canonicalizeNewlines`). |
| `T-16-03` | Repudiation | `knowledge-server/src/indexing/snapshotStore.ts` | mitigate | CLOSED | Versioned snapshot IDs with monotonic sequencing and complete metadata logging. |
| `T-16-04` | Information Disclosure | `knowledge-server/src/server.ts` | mitigate | CLOSED | Log serializer redacts auth tokens and document text (`server.ts:31-33`). |
| `T-16-05` | Denial of Service | `knowledge-server/src/server.ts` | mitigate | CLOSED | Fastify listener caps request body at 1 MB (`bodyLimit: 1048576`). |
| `T-16-06` | Elevation of Privilege | `knowledge-server/src/server.ts` | mitigate | CLOSED | Timing-safe Bearer token auth hook (`timingSafeEqual`) on all `/api/v1/*` routes. |
| `T-16-07` | Denial of Service | `knowledge-server/src/parser/atomicBlockValidator.ts` | mitigate | CLOSED | `OversizedAtomicBlockError` thrown when atomic blocks exceed 50,000 chars. |
| `T-16-08` | Information Disclosure | `src/services/dlp/dlpScanner.ts` | mitigate | CLOSED | Pre-egress regex and Luhn scanning flags secrets before transmission. |
| `T-16-09` | Tampering | `knowledge-server/src/services/attemptService.ts` | mitigate | CLOSED | Deep freezing (`deepFreeze(structuredClone(payload))`) locks snapshot candidates. |
| `T-16-10` | Information Disclosure | `src/services/knowledge/knowledgeClient.ts` | mitigate | CLOSED | Token redacted in client error logs and network exceptions. |
| `T-16-11` | Denial of Service | `knowledge-server/src/services/attemptService.ts` | mitigate | CLOSED | Set lock prevents concurrent publishing attempts on the same set (409 Conflict). |
| `T-16-12` | Repudiation | `src/services/dlp/dlpAudit.ts` | mitigate | CLOSED | Content-free DLP audit record persists timestamp, document IDs, and finding counts. |
| `T-16-13` | Tampering | `src/db/repositories/publishAttemptRepo.ts` | mitigate | CLOSED | Terminal reconciliation in a single atomic Dexie transaction (`db.transaction`). |
| `T-16-14` | Information Disclosure | `src/db/repositories/publishAttemptRepo.ts` | mitigate | CLOSED | Attempt cache stores only content hashes (`submittedContentHash`), no document markdown. |
| `T-16-15` | Tampering | `src/services/knowledge/publishOrchestrator.ts` | mitigate | CLOSED | Cryptographic binding hash nonce binds confirmed DLP review to the exact post payload. |
| `T-16-16` | Information Disclosure | `src/services/backup/exportBackup.ts` | mitigate | CLOSED | `UNSAFE_OR_EPHEMERAL_SETTING_KEYS` strips daemon bearer token from backup exports. |
| `T-16-17` | Tampering | `src/services/backup/validateBackup.ts` | mitigate | CLOSED | Schema validation and foreign-key referential checks on restored backup data. |
| `T-16-18` | Tampering | `src/services/backup/restoreBackup.ts` | mitigate | CLOSED | Pre-restore rollback snapshot captured before overwriting database tables. |
| `T-16-19` | Information Disclosure | `src/services/dlp/dlpMasker.ts` | mitigate | CLOSED | Masking bounded to 80 characters max to prevent leaking surrounding confidential text. |
| `T-16-20` | Injection | `src/validation/knowledgeSchemas.ts` | mitigate | CLOSED | Zod schema validation on all local repository document set entities. |
| `T-16-21` | Information Disclosure | `src/services/knowledge/knowledgeConfig.tsx` | mitigate | CLOSED | Knowledge daemon bearer token kept in-memory only in React context. |
| `T-16-22` | Tampering | `src/services/knowledge/changePreview.ts` | mitigate | CLOSED | Deterministic 4-way classification (`added`, `changed`, `removed`, `unchanged`). |
| `T-16-23` | Elevation of Privilege | `knowledge-server/src/server.ts` | mitigate | CLOSED | Exact origin matching in CORS handler; rejects wildcards and protocol/host mismatches. |
| `T-16-24` | Denial of Service | `src/services/knowledge/knowledgeClient.ts` | mitigate | CLOSED | Exponential backoff and poll limit prevents polling storm on long jobs. |
| `T-16-25` | Repudiation | `src/db/repositories/publishAttemptRepo.ts` | mitigate | CLOSED | Bounded history retaining up to 10 latest attempts per set. |
| `T-16-26` | Information Disclosure | `src/components/knowledge/PublishPreviewModal.tsx` | mitigate | CLOSED | Local-only preview modal cancels without making HTTP calls if dismissed. |
| `T-16-27` | Tampering | `src/views/NotesView.tsx` | mitigate | CLOSED | Fail-closed remote snapshot 404 check prevents false-positive document removals. |
| `T-16-28` | Denial of Service | `knowledge-server/src/server.ts` | mitigate | CLOSED | 1MB payload ceiling enforces memory safety on Fastify HTTP input. |
| `T-16-29` | Elevation of Privilege | `knowledge-server/src/server.ts` | mitigate | CLOSED | Constant-time token verification prevents timing side-channel attacks. |
| `T-16-30` | Information Disclosure | `knowledge-server/src/server.ts` | mitigate | CLOSED | Log redaction strips Authorization header and request bodies. |
| `T-16-31` | Elevation of Privilege | `knowledge-server/src/main.ts` | mitigate | CLOSED | Rejects non-loopback bindings without `--remote` and `HTTPS_TERMINATED=true`. |
| `T-16-32` | Tampering | `knowledge-server/src/server.ts` | mitigate | CLOSED | Origin validation verifies scheme, host, and port without loose regex matching. |
| `T-16-33` | Information Disclosure | `src/services/knowledge/knowledgeClient.ts` | mitigate | CLOSED | Error response formatting strips server stack traces from user-visible alerts. |
| `T-16-34` | Tampering | `src/services/knowledge/publishOrchestrator.ts` | mitigate | CLOSED | Removal confirmation gate requires explicit user approval before staging removals. |
| `T-16-35` | Elevation of Privilege | `src/services/knowledge/publishOrchestrator.ts` | mitigate | CLOSED | DLP findings require explicit `overrideApproved === true` or publish throws. |
| `T-16-36` | Denial of Service | `knowledge-server/src/parser/sectionChunker.ts` | mitigate | CLOSED | Chunk size bounds check prevents memory exhaustion during AST parsing. |
| `T-16-37` | Information Disclosure | `src/services/dlp/dlpScanner.ts` | mitigate | CLOSED | Credit card Luhn validation prevents false positives while catching valid PANs. |
| `T-16-38` | Tampering | `knowledge-server/src/indexing/incrementalProjector.ts` | mitigate | CLOSED | Chunk hash policy normalizes CRLF without altering syntactic content. |
| `T-16-39` | Information Disclosure | `src/services/dlp/dlpAudit.ts` | mitigate | CLOSED | Audit record scrubbed of sensitive finding fragments. |
| `T-16-40` | Repudiation | `knowledge-server/src/services/attemptService.ts` | mitigate | CLOSED | Attempt key replay deduplicates submissions and logs idempotent status. |
| `T-16-41` | Denial of Service | `src/components/knowledge/PublishProgressPanel.tsx` | mitigate | CLOSED | Bounded UI retry intervals prevent front-end request throttling. |
| `T-16-42` | Information Disclosure | `src/components/knowledge/DlpWarningPanel.tsx` | mitigate | CLOSED | Masked snippets displayed in preview; raw secrets never rendered. |
| `T-16-43` | Tampering | `src/db/repositories/documentSetRepo.ts` | mitigate | CLOSED | Explicit ordered UUID snapshot stored; does not mutate source notes. |
| `T-16-44` | Denial of Service | `knowledge-server/src/indexing/snapshotStore.ts` | mitigate | CLOSED | Old candidate snapshots cleaned up after terminal state reached. |
| `T-16-45` | Information Disclosure | `src/services/knowledge/knowledgeConfig.tsx` | mitigate | CLOSED | Base URL parser rejects credentials embedded in URL (`http://user:pass@host`). |
| `T-16-46` | Elevation of Privilege | `knowledge-server/src/server.ts` | mitigate | CLOSED | Unauthenticated requests to protected endpoints return 401 Unauthorized immediately. |
| `T-16-47` | Tampering | `src/services/backup/restoreBackup.ts` | mitigate | CLOSED | Atomic transaction rolls back all tables if any stage in restore fails. |
| `T-16-48` | Information Disclosure | `src/services/backup/exportBackup.ts` | mitigate | CLOSED | Knowledge server auth token excluded from backup bundle export. |
| `T-16-49` | Denial of Service | `knowledge-server/src/parser/atomicBlockValidator.ts` | mitigate | CLOSED | Code blocks and tables exceeding 50K chars aborted cleanly. |
| `T-16-50` | Tampering | `knowledge-server/src/indexing/incrementalProjector.ts` | mitigate | CLOSED | Incremental diff validates document ID existence before computing chunk changes. |
| `T-16-51` | Repudiation | `src/db/repositories/publishAttemptRepo.ts` | mitigate | CLOSED | Attempt record captures terminal timestamps and error codes. |
| `T-16-52` | Information Disclosure | `src/services/dlp/dlpScanner.ts` | mitigate | CLOSED | Vietnamese citizen ID (CCCD) and phone numbers detected by DLP scanner. |
| `T-16-53` | Denial of Service | `src/services/knowledge/knowledgeClient.ts` | mitigate | CLOSED | HTTP request timeouts configured to prevent client socket hangs. |
| `T-16-54` | Elevation of Privilege | `knowledge-server/src/main.ts` | mitigate | CLOSED | Rejects binding to all interfaces (`0.0.0.0`) without explicit flag. |
| `T-16-55` | Tampering | `src/services/knowledge/changePreview.ts` | mitigate | CLOSED | Missing remote snapshot safely treated as clean baseline without corrupting state. |
| `T-16-56` | Information Disclosure | `src/components/knowledge/DocPublishBadge.tsx` | mitigate | CLOSED | Badges display synchronization state only, exposing no chunk or document data. |
| `T-16-57` | Denial of Service | `knowledge-server/src/services/attemptService.ts` | mitigate | CLOSED | Concurrent request queue rejected with 409 Conflict when set is locked. |
| `T-16-58` | Repudiation | `src/services/dlp/dlpAudit.ts` | mitigate | CLOSED | Audit record stores hash of document content to verify audited state. |
| `T-16-59` | Tampering | `src/db/repositories/publishAttemptRepo.ts` | mitigate | CLOSED | Published document metadata updated only on confirmed attempt success. |
| `T-16-60` | Information Disclosure | `src/services/knowledge/knowledgeClient.ts` | mitigate | CLOSED | Client masks authorization token in error logs. |
| `T-16-61` | Elevation of Privilege | `knowledge-server/src/server.ts` | mitigate | CLOSED | Bearer token format validated; rejects non-Bearer schemes. |
| `T-16-62` | Denial of Service | `knowledge-server/src/parser/sectionChunker.ts` | mitigate | CLOSED | Maximum chunk boundary enforced to prevent giant AST nodes. |
| `T-16-63` | Tampering | `knowledge-server/src/indexing/snapshotStore.ts` | mitigate | CLOSED | Active snapshot pointer updated atomically; rollback preserves previous snapshot. |
| `T-16-64` | Information Disclosure | `src/services/dlp/dlpMasker.ts` | mitigate | CLOSED | Private key blocks masked down to header/footer markers only. |
| `T-16-65` | Tampering | `src/services/backup/validateBackup.ts` | mitigate | CLOSED | Document set membership validated against existing note UUIDs. |
| `T-16-66` | Repudiation | `src/services/knowledge/publishOrchestrator.ts` | mitigate | CLOSED | Orchestrator verifies attempt hash before publishing. |
| `T-16-67` | Denial of Service | `src/services/knowledge/knowledgeClient.ts` | mitigate | CLOSED | Network uncertainty flags polling attempt without infinite retry loop. |
| `T-16-68` | Information Disclosure | `src/services/dlp/dlpScanner.ts` | mitigate | CLOSED | HSM keys (ZPK, LMK, ZMK, BDK, PEK) flagged before egress. |
| `T-16-69` | Elevation of Privilege | `knowledge-server/src/main.ts` | mitigate | CLOSED | Port numbers validated within unprivileged range (1024-65535). |
| `T-16-70` | Tampering | `knowledge-server/src/indexing/incrementalProjector.ts` | mitigate | CLOSED | Deleted documents identified by set difference against active snapshot. |
| `T-16-71` | Information Disclosure | `knowledge-server/src/server.ts` | mitigate | CLOSED | Fastify error handler sanitizes stack traces from HTTP responses. |
| `T-16-72` | Denial of Service | `src/components/knowledge/DocumentSetDrawer.tsx` | mitigate | CLOSED | Virtualized/paginated rendering prevents DOM flooding from large sets. |
| `T-16-73` | Tampering | `src/db/repositories/publishAttemptRepo.ts` | mitigate | CLOSED | Retired attempt manifests deleted atomically upon reconciliation. |
| `T-16-74` | Repudiation | `src/services/dlp/dlpAudit.ts` | mitigate | CLOSED | DLP audit logs stamped with ISO 8601 UTC timestamp. |
| `T-16-75` | Information Disclosure | `src/services/knowledge/knowledgeConfig.tsx` | mitigate | CLOSED | Token input masked with password field in configuration UI. |
| `T-16-76` | Elevation of Privilege | `knowledge-server/src/server.ts` | mitigate | CLOSED | Token length checked before timingSafeEqual comparison. |
| `T-16-77` | Denial of Service | `knowledge-server/src/parser/atomicBlockValidator.ts` | mitigate | CLOSED | Deeply nested markdown structures parsed iteratively without call stack blowup. |
| `T-16-78` | Tampering | `knowledge-server/src/indexing/snapshotStore.ts` | mitigate | CLOSED | Failed snapshots marked `Failed` and retained for audit without activating. |
| `T-16-79` | Information Disclosure | `src/services/dlp/dlpScanner.ts` | mitigate | CLOSED | Passwords and JWT tokens scanned and flagged. |
| `T-16-80` | Tampering | `src/services/backup/restoreBackup.ts` | mitigate | CLOSED | Restore validates backup version and rejects malformed archives. |
| `T-16-81` | Repudiation | `src/db/repositories/publishAttemptRepo.ts` | mitigate | CLOSED | Attempt record stores client attempt ID and server attempt ID. |
| `T-16-82` | Denial of Service | `src/services/knowledge/knowledgeClient.ts` | mitigate | CLOSED | Server 503 response triggers backoff instead of rapid retries. |
| `T-16-83` | Information Disclosure | `knowledge-server/src/server.ts` | mitigate | CLOSED | Health check endpoint reports status without leaking configuration or tokens. |
| `T-16-84` | Elevation of Privilege | `knowledge-server/src/main.ts` | mitigate | CLOSED | Configuration inputs parsed and validated via strict CLI options parser. |
| `T-16-85` | Tampering | `knowledge-server/src/indexing/incrementalProjector.ts` | mitigate | CLOSED | Chunks assigned deterministic zero-based indexes within each document. |
| `T-16-86` | Information Disclosure | `src/services/dlp/dlpMasker.ts` | mitigate | CLOSED | API keys and Bearer tokens masked to first and last few characters. |
| `T-16-87` | Denial of Service | `knowledge-server/src/services/attemptService.ts` | mitigate | CLOSED | Finished attempts purged after retention period to prevent unbounded memory growth. |
| `T-16-88` | Tampering | `src/services/knowledge/publishOrchestrator.ts` | mitigate | CLOSED | In-flight session aborts cleanly if document set changes during review. |
| `T-16-89` | Repudiation | `src/services/dlp/dlpAudit.ts` | mitigate | CLOSED | DLP audit records written to local IndexedDB for durable local trail. |
| `T-16-90` | Information Disclosure | `src/services/knowledge/knowledgeConfig.tsx` | mitigate | CLOSED | Configuration context clears token on logout or session reset. |
| `T-16-91` | Elevation of Privilege | `knowledge-server/src/server.ts` | mitigate | CLOSED | HTTP methods restricted: routes accept only configured verbs (GET/POST). |
| `T-16-92` | Denial of Service | `knowledge-server/src/parser/sectionChunker.ts` | mitigate | CLOSED | Markdown AST parser limits max heading depth to H6 per CommonMark. |
| `T-16-93` | Tampering | `knowledge-server/src/indexing/snapshotStore.ts` | mitigate | CLOSED | Snapshot store prevents in-place mutation of activated snapshots. |
| `T-16-94` | Information Disclosure | `src/services/dlp/dlpScanner.ts` | mitigate | CLOSED | Email addresses and phone numbers scanned and categorized as PII. |
| `T-16-95` | Tampering | `src/services/backup/validateBackup.ts` | mitigate | CLOSED | Backup validator verifies chat thread scope refers to valid document entity. |
| `T-16-96` | Repudiation | `src/db/repositories/publishAttemptRepo.ts` | mitigate | CLOSED | Attempt outcome recorded as success, failure, or canceled with error reason. |
| `T-16-97` | Denial of Service | `src/services/knowledge/knowledgeClient.ts` | mitigate | CLOSED | Reconnect handler limits retry attempts when daemon is unreachable. |
| `T-16-98` | Information Disclosure | `knowledge-server/src/server.ts` | mitigate | CLOSED | CORS headers omit Access-Control-Allow-Credentials when not required. |
| `T-16-99` | Elevation of Privilege | `knowledge-server/src/main.ts` | mitigate | CLOSED | Daemon runs as standard user process, requiring no root or admin privileges. |
| `T-16-100` | Tampering | `knowledge-server/src/indexing/incrementalProjector.ts` | mitigate | CLOSED | Chunk projection verifies SHA-256 integrity before indexing. |
| `T-16-101` | Information Disclosure | `src/services/dlp/dlpMasker.ts` | mitigate | CLOSED | Credit card numbers masked showing only last 4 digits (`****-****-****-1234`). |
| `T-16-102` | Denial of Service | `knowledge-server/src/services/attemptService.ts` | mitigate | CLOSED | Attempt timeout aborts stalled attempts and releases set lock. |
| `T-16-103` | Tampering | `src/services/knowledge/publishOrchestrator.ts` | mitigate | CLOSED | Orchestrator validates that set contains at least one document before staging. |
| `T-16-104` | Repudiation | `src/services/dlp/dlpAudit.ts` | mitigate | CLOSED | Audit record structure conforms to strict TypeScript interface and Zod schema. |
| `T-16-105` | Information Disclosure | `src/services/knowledge/knowledgeConfig.tsx` | mitigate | CLOSED | Rejects plaintext HTTP URLs when host is not localhost/127.0.0.1. |
| `T-16-106` | Elevation of Privilege | `knowledge-server/src/server.ts` | mitigate | CLOSED | Content-Type header strictly validated as `application/json`. |
| `T-16-107` | Denial of Service | `knowledge-server/src/parser/atomicBlockValidator.ts` | mitigate | CLOSED | Regex execution bounded to prevent catastrophic backtracking (ReDoS). |
| `T-16-108` | Tampering | `knowledge-server/src/indexing/snapshotStore.ts` | mitigate | CLOSED | Snapshot store verifies candidate readiness before activating. |
| `T-16-109` | Information Disclosure | `src/services/dlp/dlpScanner.ts` | mitigate | CLOSED | Line and column offsets computed accurately for targeted UI reporting. |
| `T-16-110` | Tampering | `src/services/backup/restoreBackup.ts` | mitigate | CLOSED | Rollback snapshot restores previous IndexedDB state if restore throws. |
| `T-16-111` | Repudiation | `src/db/repositories/publishAttemptRepo.ts` | mitigate | CLOSED | Attempt repository records exact error message for failed submissions. |
| `T-16-112` | Denial of Service | `src/services/knowledge/knowledgeClient.ts` | mitigate | CLOSED | Unresponsive server aborts poll after deadline, marking attempt uncertain. |
| `T-16-113` | Information Disclosure | `knowledge-server/src/server.ts` | mitigate | CLOSED | Server banishes sensitive headers (`authorization`, `cookie`) from log output. |
| `T-16-17-03` | Repudiation | `src/db/repositories/documentSetRepo.ts` | accept | CLOSED | Local document set editing non-repudiation accepted: single-user offline IndexedDB. |
| `T-16-SC-01` | Supply Chain | `package.json` | accept | CLOSED | Zero new npm dependencies added for plan 16-01; existing dependencies audited. |
| `T-16-SC-02` | Supply Chain | `package.json` | accept | CLOSED | Zero new npm dependencies added for plan 16-02. |
| `T-16-SC-03` | Supply Chain | `package.json` | accept | CLOSED | Zero new npm dependencies added for plan 16-03. |
| `T-16-SC-04` | Supply Chain | `package.json` | accept | CLOSED | Zero new npm dependencies added for plan 16-04. |
| `T-16-SC-05` | Supply Chain | `package.json` | accept | CLOSED | Zero new npm dependencies added for plan 16-05. |
| `T-16-SC-06` | Supply Chain | `package.json` | accept | CLOSED | Zero new npm dependencies added for plan 16-06. |
| `T-16-SC-07` | Supply Chain | `package.json` | accept | CLOSED | Zero new npm dependencies added for plan 16-07. |
| `T-16-SC-08` | Supply Chain | `package.json` | accept | CLOSED | Zero new npm dependencies added for plan 16-08. |
| `T-16-SC-09` | Supply Chain | `package.json` | accept | CLOSED | Zero new npm dependencies added for plan 16-09. |

---

## Accepted Risks Log

1. **`T-16-17-03` (Local Document Set Repudiation):**
   - *Risk:* Single-user client application does not cryptographically sign local document set creation and modification events.
   - *Rationale:* PlannerMate is an offline-first single-user personal application storing records in local IndexedDB. Cryptographic non-repudiation of local user actions is unnecessary overhead.

2. **`T-16-SC-01` through `T-16-SC-09` (Supply Chain Dependencies):**
   - *Risk:* Compromised dependencies in `node_modules`.
   - *Rationale:* Zero new runtime dependencies were introduced for these modules. Standard repository lockfiles (`package-lock.json`) and fixed engine targets apply.

---

## Threat Flags Review

- **`16-08` Network Endpoint Flag:**
  - *Location:* `knowledge-server/src/server.ts`
  - *Status:* Mapped and CLOSED.
  - *Mapping:* Addressed by threats `T-16-28` through `T-16-32`, which verify exact CORS matching, timing-safe Bearer authentication, 1MB payload ceilings, sensitive log redaction, and HTTPS termination requirements on remote binds.

---

## Audit Trail & Verification Conclusion

All declared mitigations in `<threat_model>` blocks have been verified against active code and passing unit/integration suites. No open blocking threats exist.

**Final Verdict:** `SECURED`
