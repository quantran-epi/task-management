# Phase 16: Knowledge Server Foundation, DLP Checks & AST Ingestion - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves alternatives considered.

**Date:** 2026-10-08
**Phase:** 16-knowledge-server-foundation-dlp-checks-ast-ingestion
**Areas discussed:** Server contract, Publish concurrency, DLP matching, Chunk semantics

---

## Server contract

### Server location

| Option | Description | Selected |
|--------|-------------|----------|
| One base URL | User configures one root URL; client derives fixed `/api/v1/...` routes. | ✓ |
| Discovery manifest | Server publishes routes and capabilities through a bootstrap manifest. | |
| Separate URLs | User configures each endpoint independently. | |

**User's choice:** One base URL.
**Notes:** Prefer smallest contract for one internal deployment.

### Publish lifecycle

| Option | Description | Selected |
|--------|-------------|----------|
| Async attempt resource | One content POST returns `attemptId`; client polls terminal state. | ✓ |
| Synchronous request | Keep POST open through parse, projection, and activation. | |
| Upload plus finalize | Upload documents separately, then finalize candidate. | |

**User's choice:** Async attempt resource.
**Notes:** Supports longer processing, browser reload, and bounded attempt history without multipart complexity.

### API authentication

| Option | Description | Selected |
|--------|-------------|----------|
| Session-only Bearer token | HTTPS, in-memory token, exact CORS allow-list. | ✓ |
| Internal network only | No API credential; rely on network and CORS. | |
| Enterprise SSO/OIDC | PKCE login and short-lived enterprise access token. | |

**User's choice:** Session-only Bearer token.
**Notes:** Token must not enter IndexedDB, localStorage, logs, backup, or deployed configuration.

### Status authority

| Option | Description | Selected |
|--------|-------------|----------|
| Server authority plus local cache | Server owns attempt/snapshot truth; IndexedDB keeps last-known state and reconciles. | ✓ |
| IndexedDB authority | Local status remains final even after lost responses. | |
| Always query server | Keep no local status cache. | |

**User's choice:** Server authority plus local cache.
**Notes:** Client-generated `attemptKey` makes initial POST retry idempotent.

---

## Publish concurrency

### Edits during publish

| Option | Description | Selected |
|--------|-------------|----------|
| Freeze attempt snapshot | Attempt publishes confirmed input; local editing continues and later changes stay stale. | ✓ |
| Lock editor | Block member-document edits during publish. | |
| Automatically restart | Restart attempt when local content changes. | |

**User's choice:** Freeze attempt snapshot.
**Notes:** New edits require new preview, DLP scan, and confirmation.

### Same-set concurrency

| Option | Description | Selected |
|--------|-------------|----------|
| Reject second active attempt | One active attempt per set; structured conflict error. | ✓ |
| Queue per set | Accept and process attempts serially. | |
| Newest wins | Run concurrently but activate newest generation only. | |

**User's choice:** Reject second active attempt.
**Notes:** Different sets may publish concurrently.

### Cancellation after send

| Option | Description | Selected |
|--------|-------------|----------|
| No cancellation after send | Attempt runs to terminal state; closing UI only stops polling. | ✓ |
| Best-effort cancellation | Cancel only before activation begins. | |
| Snapshot rollback | Restore prior active snapshot after activation. | |

**User's choice:** No cancellation after send.
**Notes:** Preview and DLP confirmation are final pre-send gates.

### Disconnect handling

| Option | Description | Selected |
|--------|-------------|----------|
| Publishing plus warning | Keep primary state and show connectivity uncertainty; reconcile later. | ✓ |
| Timeout to Failed | Infer failure after client timeout. | |
| Add Unknown state | Add seventh primary state. | |

**User's choice:** Publishing plus warning.
**Notes:** Only explicit terminal server result becomes `Failed`.

---

## DLP matching

### Detector depth

| Option | Description | Selected |
|--------|-------------|----------|
| Simple deterministic baseline | PAN plus Luhn and keyword/context rules; no advanced classification. | ✓ |
| High-recall advanced validators | Broader detector framework with category validators and tuning. | |
| Strict precision | Report only near-certain matches. | |
| Broad regex | Report loose patterns without validation. | |

**User's choice:** “Just do it simple, DLP is not priority.”
**Notes:** No ML, entropy scoring, custom rules, allow-list, or persistent suppression. Fixed rule-set version supports repeatable tests.

### Scan scope

| Option | Description | Selected |
|--------|-------------|----------|
| Every outbound user-authored string | Scan title, body, tags, set name, and other user-entered payload text. | ✓ |
| Markdown body only | Ignore title, tags, and set name. | |

**User's choice:** Every outbound user-authored string.
**Notes:** Generated UUIDs, hashes, and timestamps need no scan.

---

## Chunk semantics

### Section boundaries

| Option | Description | Selected |
|--------|-------------|----------|
| Preamble plus H2/H3 | Preamble separate; H2/H3 open sections; H4–H6 stay in parent. | ✓ |
| H1 root section | Whole document belongs to H1. | |
| Every heading splits | H1–H6 each opens a section. | |

**User's choice:** Preamble plus H2/H3.
**Notes:** Heading-less documents use a synthetic section without source mutation.

### Hash normalization

| Option | Description | Selected |
|--------|-------------|----------|
| Newline only | Canonicalize CRLF/CR to LF; preserve all other content. | ✓ |
| Strong whitespace normalization | Trim/collapse whitespace and blank lines. | |
| Raw bytes | Hash exact bytes with no normalization. | |

**User's choice:** Newline only.
**Notes:** Protects semantic whitespace in code, SQL, tables, and ASCII diagrams.

### Duplicate content

| Option | Description | Selected |
|--------|-------------|----------|
| Content plus occurrence identities | Reuse content representation but preserve each evidence range. | ✓ |
| One chunk with multiple ranges | Merge duplicate occurrences into one record. | |
| Heading in identity | Use heading path to distinguish duplicates. | |

**User's choice:** Content plus occurrence identities.
**Notes:** Duplicate evidence must not disappear through deduplication.

### Size policy

| Option | Description | Selected |
|--------|-------------|----------|
| 6k target / 50k hard limit | Character-based versioned constants; no UI setting. | ✓ |
| Token-based limits | Couple chunking to a tokenizer/model. | |
| Hard limit only | Keep sections intact until one atomic block exceeds hard limit. | |

**User's choice:** 6,000-character target and 50,000-character hard atomic-block limit.
**Notes:** Atomic blocks may exceed target but never hard limit; over-limit document fails without truncation.

---

## Claude's Discretion

- Exact deterministic precedence for overlapping DLP categories and masked-context length.
- Poll/backoff timing, structured error-envelope fields, and retry ceiling.
- Status badge colors and exact Vietnamese copy within existing Ant Design/accessibility patterns.
- AST parser/library and exact source-offset convention, subject to lossless reconstruction tests.

## Deferred Ideas

- Manual active-snapshot rollback after activation.
- Enterprise SSO/OIDC.
- Discovery manifest and multi-server capability negotiation.
- Advanced DLP rule engine, ML/NLP classification, entropy detection, and approved allow-lists.
