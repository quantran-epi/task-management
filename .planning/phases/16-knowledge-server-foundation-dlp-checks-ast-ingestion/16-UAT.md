---
status: partial
phase: 16-knowledge-server-foundation-dlp-checks-ast-ingestion
source: 16-01-SUMMARY.md, 16-02-SUMMARY.md, 16-03-SUMMARY.md, 16-04-SUMMARY.md, 16-05-SUMMARY.md, 16-06-SUMMARY.md, 16-07-SUMMARY.md, 16-08-SUMMARY.md, 16-09-SUMMARY.md, 16-10-SUMMARY.md, 16-11-SUMMARY.md, 16-12-SUMMARY.md, 16-13-SUMMARY.md, 16-14-SUMMARY.md, 16-15-SUMMARY.md, 16-16-SUMMARY.md, 16-17-SUMMARY.md, 16-18-SUMMARY.md, 16-19-SUMMARY.md, 16-20-SUMMARY.md, 16-21-SUMMARY.md, 16-22-SUMMARY.md, 16-23-SUMMARY.md
started: 2026-10-09T12:09:16Z
updated: 2026-10-09T15:44:51Z
---

## Current Test

[testing paused — 1 item outstanding]

## Tests

### 1. Cold Start Smoke Test
expected: Stop PlannerMate and the knowledge daemon, then start both from scratch. Database setup and migrations complete without errors, the app loads, the daemon health check returns live data, and no stale cache, lock, or temporary state is required.
result: pass

### 2. Knowledge Server Settings and Connection Diagnostic
expected: Open Settings > "Trợ lý AI & Ghost Dev". A disabled-by-default Knowledge Server card appears. Invalid or unreachable URLs produce distinct localized errors without crashing; a valid server and session token produce a successful connection result. Reloading clears the session token input.
result: pass

### 3. Offline Docs Isolation and Continuity
expected: With the knowledge daemon stopped or disabled, creating, editing, reordering, autosaving, and BM25-searching notes continues normally. The "Đã lưu" indicator appears without blocking spinners, network-failure popups, or crashes.
result: pass

### 4. Document Set Creation
expected: In Docs, click "Bộ tài liệu". A right drawer titled "Bộ tài liệu xuất bản" opens. Create a named set from the current folder or selected documents; it saves locally, appears with the correct member count, and starts as "Chưa xuất bản" without network egress.
result: pass

### 5. Document Set Member Reordering and Isolation
expected: Move documents with "Đưa lên" and "Đưa xuống", then save. The set order changes while original notes, tags, and folder hierarchy remain unchanged.
result: pass

### 6. Pre-Publish Delta Preview
expected: Click "Xem trước xuất bản". The "Xem trước thay đổi" modal shows exact Thêm, Thay đổi, Gỡ khỏi máy chủ, and Không đổi counts. Manifest network or authentication failures block publishing with a localized diagnostic. Removed remote documents show "Gỡ khỏi máy chủ" and confirm local documents remain intact.
result: pass

### 7. DLP Scan and Masked Warning
expected: Click "Kiểm tra dữ liệu nhạy cảm". The local scan reports its ruleset, finding count, document, line/column, and masked previews for detected PAN, CVV, PIN, HSM key, password/token, or PII. No raw-secret reveal control exists, and publishing stays blocked until the one-time warning acknowledgement is checked.
result: pass

### 8. Preview Cancellation Safety
expected: Cancel the preview or press Escape after changes or DLP findings appear. The modal closes without sending a publish POST, changing note contents, or storing unmasked secrets in history.
result: pass

### 9. Oversized Block Rejection
expected: Publishing a note containing a code block, table, or blockquote over 50,000 characters stops before activation. The error shows line, column, the 50,000-character limit, and guidance to split the source block. The prior remote snapshot remains active.
result: issue
reported: "not pass, exceed 50k character publish success to knowledge server, one of the docs has character count exceed 50k, but can ignore for now, fix later if its not too important and affect the rightness of the data"
severity: minor

### 10. Publish Progress and Uncertainty Reconciliation
expected: Confirm a clean or acknowledged preview and publish. The UI shows publishing stages and only an observer close action. Disconnecting the network produces an unknown-outcome warning rather than Failed; after reconnecting, manually choosing "Kiểm tra trạng thái" reconciles the set to "Đã đồng bộ".
result: pass
note: "User accepted manual reconciliation; automatic retry on reconnect is not required."

### 11. Document Status Badges
expected: Document list and editor show status icons and labels for unpublished, synced, locally changed, publishing, warning, and failed states. Narrow screens collapse the list badge to an icon with tooltip. Editing a published note immediately changes its status to "Có thay đổi cục bộ" while local save still completes.
result: pass

### 12. Bounded Content-Free Publish History
expected: Document set history shows exactly the newest 10 attempts first, with timestamp, duration, delta counters, DLP warning count, and terminal status. No raw note body, payload, or unmasked secret appears in history or DOM.
result: pass

### 13. Backup and Restore Knowledge Data
expected: Backup includes document sets, publication metadata, attempt cache, and DLP audit records with counts, but excludes bearer tokens and raw note bodies. Restoring into a clean workspace reconstructs sets, statuses, and history. An invalid chat thread lacking its note reference is rejected with full rollback.
result: blocked
blocked_by: prior-phase
reason: "the sync from github feature broken now, so i cannot check the backup feature. ignore for now after fix sync feature"

## Summary

total: 13
passed: 11
issues: 1
pending: 0
skipped: 0
blocked: 1

## Gaps

- truth: "Publishing a note containing a code block, table, or blockquote over 50,000 characters stops before activation. The error shows line, column, the 50,000-character limit, and guidance to split the source block. The prior remote snapshot remains active."
  status: failed
  reason: "User reported: not pass, exceed 50k character publish success to knowledge server, one of the docs has character count exceed 50k, but can ignore for now, fix later if its not too important and affect the rightness of the data"
  severity: minor
  test: 9
  root_cause: "The 50,000-character limit applies to one atomic Markdown block, not total document length. Real defect remains: sectionChunker validates only root AST children, so nested oversized code/table/blockquote nodes bypass rejection; client error handling also hides structured location and remedy details."
  artifacts:
    - path: "knowledge-server/src/parser/sectionChunker.ts"
      issue: "Atomic block validation walks only top-level ast.children, missing nested oversized blocks."
    - path: "src/views/NotesView.tsx"
      issue: "Generic preview error handler hides line, column, limit, and split guidance."
    - path: "src/components/knowledge/PublishPreviewModal.tsx"
      issue: "Server projection errors display only message, omitting structured location and remedy."
  missing:
    - "Recursively validate atomic Markdown nodes at any AST depth."
    - "Surface OversizedAtomicBlockError line, column, 50,000-character limit, and split guidance in client UI."
    - "Clarify UAT that total document length above 50,000 characters is valid unless one atomic block exceeds the limit."
  debug_session: ".planning/debug/oversized-block-rejection-bypass.md"
