---
status: complete
phase: 17-pilot-ontology-deterministic-extraction-neo4j-knowledge-grap
source: 17-01-SUMMARY.md, 17-02-SUMMARY.md, 17-03-SUMMARY.md, 17-04-SUMMARY.md, 17-05-SUMMARY.md
started: 2026-10-10T06:51:29Z
updated: 2026-10-10T16:30:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Stop the app and Knowledge Server, then start both from scratch. Startup completes without errors. Open PlannerMate, load Docs, and open a published document set; live local document data appears and the knowledge-graph section loads a real status instead of crashing.
result: pass

### 2. Graph Status Summary
expected: In a published document set drawer, `Đồ thị tri thức` appears before publish history. It shows active or never-built state, snapshot/version information, node/fact/evidence counts, and visible conflict and quarantine counts.
result: pass
retest_note: "Fixed by 17-06 (commit 2333e96). Confirmed single GET /graph/status per open."

### 3. Safe Graph Rebuild
expected: `Xây dựng lại đồ thị` asks for confirmation, then shows candidate build progress through preparation, structured extraction, prose extraction, validation, and activation. Existing active graph remains labeled and usable until successful activation; repeated action does not start duplicate builds.
result: pass
retest_note: "Fixed by 17-06 (commits a3aaf9b, 7579297). Failed state surfaces error code/message; no false success toast."

### 4. Evidence and Classification Inspection
expected: `Xem bằng chứng` opens a nested drawer without closing the document-set drawer. Facts show subject, controlled relation, object, explicit `OBSERVED`, `INFERRED`, or `BUSINESS_APPROVED` classification, evidence count, and status. Expanding a fact shows source document, heading, exact line/range, extraction method, and available excerpt.
result: pass
retest_note: "Unblocked after Test 3 fix. Evidence drawer, classification tags, source location verified."

### 5. Pilot Identity and Deterministic Facts
expected: For process 60000006, process and container records remain separate despite sharing native ID. Structured facts from process steps, cycles, dispatch, and data-object tables appear once per semantic fact, with repeated source occurrences attached as evidence rather than duplicate facts.
result: pass
retest_note: "Unblocked after Test 3 fix. Process/container identity separation and deterministic fact deduplication verified."

### 6. Conflict and Quarantine Safety
expected: Contradictory functional facts show both branches under a visible conflict warning. Unqualified or ambiguous Oracle identifiers appear in quarantine with source location and never appear as active graph facts.
result: pass
retest_note: "Marked pass per user review; deeper automated fixture check recommended for edge cases."

### 7. Durable Rebuild and Failure Isolation
expected: After restarting Knowledge Server, published snapshot and approval state remain available. Rebuilding unchanged Markdown produces the same logical projection. A failed or stale rebuild leaves the prior active graph unchanged; approved facts whose source disappeared remain marked `Thiếu nguồn hiện tại`.
result: issue
reported: "Snapshot disappear after restart. Knowledge Server runs SnapshotStore in memory by default without persistent storageDir configured in server/main."
severity: major

### 8. Offline Local-App Isolation
expected: With Knowledge Server stopped or unreachable, local Docs CRUD, autosave, IndexedDB persistence, and BM25 search continue working. Graph actions report network unavailability without an unhandled error or loss of local data.
result: pass

## Summary

total: 8
passed: 7
issues: 1
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "Graph status loads once for the selected document set and then displays a stable Never built or active summary."
  status: addressed
  addressed_by: 17-06
  reason: "User reported: Graph status returns 200 with Never built, but the client calls the status endpoint repeatedly without stopping and the section remains/loading repeatedly."
  severity: major
  test: 2
  root_cause: "DocumentSetDrawer creates a new KnowledgeClient object during every render. The graph-status effect depends on client, so each successful setGraphStatus render creates another client and reruns GET /graph/status indefinitely."
  artifacts:
    - path: "src/components/knowledge/DocumentSetDrawer.tsx"
      issue: "Inline createKnowledgeClient at lines 141-145 gives the useEffect client dependency a new identity on every render."
  missing:
    - "Memoize KnowledgeClient from stable configuration values, or depend on stable request inputs instead of a freshly created object."
    - "Add a regression test proving one graph status request per stable selected set/configuration."
  debug_session: ""

- truth: "A rebuild reports success only after a candidate activates; failures display a clear reason while preserving any prior active graph."
  status: addressed
  addressed_by: 17-06
  reason: "User reported: After confirmation, the UI shows start and finished toasts at nearly the same time, then the graph section displays a Failed badge with no explanation."
  severity: major
  test: 3
  root_cause: "pollGraphStatus treats every non-Building terminal state, including Failed, as successful completion. DocumentSetDrawer always emits the success toast after polling unless connectivity is uncertain. Graph status DTO also omits the stored build error, so the Failed badge has no actionable explanation."
  artifacts:
    - path: "src/components/knowledge/DocumentSetDrawer.tsx"
      issue: "handleTriggerRebuild emits success for finalStatus.state === 'Failed'."
    - path: "src/services/knowledge/knowledgeClient.ts"
      issue: "pollGraphStatus returns Failed as an ordinary terminal result."
    - path: "knowledge-server/src/services/graphBuildService.ts"
      issue: "Build error is stored internally but getStatus exposes only state Failed, without safe error details."
    - path: "knowledge-server/src/routes/graph.ts"
      issue: "GraphStatusDTO has no optional safe failure field."
  missing:
    - "Handle Failed terminal status as failure, not success."
    - "Expose and render a safe graph-build error code/message with next action."
    - "Add regression tests for Failed polling and failure copy."
  debug_session: ""

- truth: "Published snapshots and approval state remain available across Knowledge Server restarts."
  status: failed
  reason: "User reported: snapshot disappear after restart. Knowledge Server runs SnapshotStore in memory by default without persistent storageDir."
  severity: major
  test: 7
  root_cause: "buildKnowledgeServer and startKnowledgeServer in server.ts/main.ts do not wire SnapshotStore options.storageDir or read KNOWLEDGE_STORAGE_DIR env var, so SnapshotStore operates purely in-memory and loses all state on restart."
  artifacts:
    - path: "knowledge-server/src/server.ts"
      issue: "buildKnowledgeServer does not pass storageDir to AttemptService/SnapshotStore."
    - path: "knowledge-server/src/main.ts"
      issue: "readKnowledgeServerOptions does not read KNOWLEDGE_STORAGE_DIR or default storage directory."
  missing:
    - "Wire KNOWLEDGE_STORAGE_DIR environment variable or default persistence directory in main.ts and server.ts."
    - "Ensure AttemptService and SnapshotStore persist and reload snapshots and approvals on startup."
  debug_session: ""
