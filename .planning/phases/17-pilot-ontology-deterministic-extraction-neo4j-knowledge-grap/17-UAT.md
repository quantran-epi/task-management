---
status: partial
phase: 17-pilot-ontology-deterministic-extraction-neo4j-knowledge-grap
source: 17-01-SUMMARY.md, 17-02-SUMMARY.md, 17-03-SUMMARY.md, 17-04-SUMMARY.md, 17-05-SUMMARY.md
started: 2026-10-10T06:51:29Z
updated: 2026-10-10T08:23:07Z
---

## Current Test

[testing paused — 4 items blocked pending rebuild fixes]

## Tests

### 1. Cold Start Smoke Test
expected: Stop the app and Knowledge Server, then start both from scratch. Startup completes without errors. Open PlannerMate, load Docs, and open a published document set; live local document data appears and the knowledge-graph section loads a real status instead of crashing.
result: pass

### 2. Graph Status Summary
expected: In a published document set drawer, `Đồ thị tri thức` appears before publish history. It shows active or never-built state, snapshot/version information, node/fact/evidence counts, and visible conflict and quarantine counts.
result: issue
reported: "Graph status returns 200 with Never built, but the client calls the status endpoint repeatedly without stopping and the section remains/loading repeatedly."
severity: major

### 3. Safe Graph Rebuild
expected: `Xây dựng lại đồ thị` asks for confirmation, then shows candidate build progress through preparation, structured extraction, prose extraction, validation, and activation. Existing active graph remains labeled and usable until successful activation; repeated action does not start duplicate builds.
result: issue
reported: "After confirmation, the UI shows start and finished toasts at nearly the same time, then the graph section displays a Failed badge with no explanation."
severity: major

### 4. Evidence and Classification Inspection
expected: `Xem bằng chứng` opens a nested drawer without closing the document-set drawer. Facts show subject, controlled relation, object, explicit `OBSERVED`, `INFERRED`, or `BUSINESS_APPROVED` classification, evidence count, and status. Expanding a fact shows source document, heading, exact line/range, extraction method, and available excerpt.
result: blocked
blocked_by: prior-phase
reason: "User reported: this button disabled, cannot tests. Evidence inspection requires an active graph, but Test 3 rebuild failed and produced no activeGraphSnapshotId."

### 5. Pilot Identity and Deterministic Facts
expected: For process 60000006, process and container records remain separate despite sharing native ID. Structured facts from process steps, cycles, dispatch, and data-object tables appear once per semantic fact, with repeated source occurrences attached as evidence rather than duplicate facts.
result: blocked
blocked_by: prior-phase
reason: "User confirmed this cannot be tested through the UI because Test 3 rebuild failed, no active graph exists, and the pilot corpus is not included in the remote build."

### 6. Conflict and Quarantine Safety
expected: Contradictory functional facts show both branches under a visible conflict warning. Unqualified or ambiguous Oracle identifiers appear in quarantine with source location and never appear as active graph facts.
result: blocked
blocked_by: prior-phase
reason: "Requires an active graph and evidence inspection, but Test 3 rebuild failed."

### 7. Durable Rebuild and Failure Isolation
expected: After restarting Knowledge Server, published snapshot and approval state remain available. Rebuilding unchanged Markdown produces the same logical projection. A failed or stale rebuild leaves the prior active graph unchanged; approved facts whose source disappeared remain marked `Thiếu nguồn hiện tại`.
result: blocked
blocked_by: prior-phase
reason: "Requires at least one successfully activated graph before restart and failure-isolation checks, but Test 3 rebuild failed."

### 8. Offline Local-App Isolation
expected: With Knowledge Server stopped or unreachable, local Docs CRUD, autosave, IndexedDB persistence, and BM25 search continue working. Graph actions report network unavailability without an unhandled error or loss of local data.
result: pass

## Summary

total: 8
passed: 2
issues: 2
pending: 0
skipped: 0
blocked: 4

## Gaps

- truth: "Graph status loads once for the selected document set and then displays a stable Never built or active summary."
  status: failed
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
  status: failed
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
