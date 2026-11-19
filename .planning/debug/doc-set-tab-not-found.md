---
status: awaiting_human_verify
trigger: "Ấn vào bộ tài liệu trong Docs workspace thì tab doc_set mở ra nhưng hiện 'Không tìm thấy bộ tài liệu'"
created: 2026-11-19
updated: 2026-11-19
---

# Debug: doc_set tab mở nhưng "Không tìm thấy bộ tài liệu"

## Symptoms

- expected: Click một document set trong Docs workspace → tab `doc_set` mở và hiển thị bounded document list của set đó.
- actual: Tab `doc_set` mở, nhưng nội dung hiện Empty state "Không tìm thấy bộ tài liệu. Bộ tài liệu có thể đã bị xóa hoặc chưa được đồng bộ cục bộ." (`DocumentSetDetail` nhánh `!set`).
- error: Không có lỗi hiển thị; chỉ là Empty state.
- timeline: Ngay sau khi nâng cấp phase 45 (Docs workspace + persistent doc_set tab); trước đó chưa từng thấy.
- repro: Mở Docs workspace → click vào một bộ tài liệu → tab mới mở → hiện thông báo trên.
- user_confirmed_message: Đúng chuỗi "Không tìm thấy bộ tài liệu" (không phải crash/spinner).

## Current Focus

bug_class: Bohrbug (deterministic — missing default value, fails every time on production entry path)

hypothesis: `DocumentSetDetail` nhận `db === undefined` trên đường dẫn production nên `useLiveQuery` trả `null` → nhánh `!set` render thông báo "Không tìm thấy bộ tài liệu". setId/params/rehydrate đều đúng.
test: Trace db prop từ AppIntelliJ → WorkbenchLayout → EditorArea → DocumentSetDetail; so sánh với các view khác; render test không truyền db.
expecting: Evidence xác nhận production path không truyền db và DocumentSetDetail là view duy nhất thiếu default `db = defaultDb`.

reasoning_checkpoint:
  hypothesis: "AppIntelliJ renders <WorkbenchLayout /> without db (AppIntelliJ.tsx:73) → WorkbenchLayout.db=undefined → EditorArea sets dbProp={} (EditorArea.tsx:536) → DocumentSetDetail receives no db → useLiveQuery `if (!db) return null` → set=null → `!set` Empty state, regardless of the set existing in IndexedDB"
  confirming_evidence:
    - "AppIntelliJ.tsx:73 renders <WorkbenchLayout /> with no db prop; WorkbenchLayoutProps.db is optional and has no internal default (WorkbenchLayout.tsx:88-97)"
    - "EditorArea.tsx:536 `const dbProp = db ? { db } : {}` -> doc_set case (line 577) spreads no db when db undefined"
    - "DocumentSetDetail.tsx:33 props has `db?` but signature does NOT default it; line 46 `if (!db) return null` -> line 74 `if (!set)` shows the exact reported Vietnamese message"
    - "Sibling views NotesView (line 102) and ChangeRequestDetailView (line 71) both use `db = defaultDb`; DocsExplorer (line 38) uses `db = defaultDb` — so all working views default db, only the newly added doc_set view (phase 45) does not"
    - "DocsExplorer.handleOpenDocumentSet passes params {setId} with set.id (local documentSets id) and EditorArea reads tab.params?.setId (line 577) — param key matches; no mismatch present"
  falsification_test: "If the hypothesis is wrong, rendering DocumentSetDetail with no db prop while the target set exists in the singleton defaultDb would still show the set (or render a different error). It currently shows 'Không tìm thấy bộ tài liệu' because !db short-circuits before any query."
  fix_rationale: "Add the missing `db = defaultDb` default to DocumentSetDetail so it matches every other detail view; the query then runs against the real local IndexedDB and the existing set is found. Fixing the missing default addresses the mechanism directly, not the Empty-state symptom."
  blind_spots: "Not yet verified via an explicit no-db render test against seeded defaultDb; not checked whether any alternative production entry point injects db. Also assuming the reported set is genuinely present in local documentSets (repro confirms other Docs views use the same local DB fine)."
  candidate_causes:
    - "code: missing default param `db = defaultDb` in DocumentSetDetail.tsx (introduced with phase 45 doc_set tab)"
    - "config/environment: a different production build entry point might inject db into WorkbenchLayout, which would mask the missing default — verified AppIntelliJ.tsx:73 does NOT inject db"
  and_gate: "no — the single code defect (missing db default) is sufficient on the confirmed production path; no second contributing condition required"
next_action: CHECKPOINT — chờ user xác nhận click bộ tài liệu trong Docs workspace giờ hiển thị đúng bounded document list trong app thật.

## Evidence

- timestamp: 2026-11-19
  checked: Phase 0 knowledge base + full data-flow trace (DocsExplorer → layoutStore.openTab → EditorArea → DocumentSetDetail) and sibling views
  found: param key `setId` matches end-to-end; db param is the only broken link. AppIntelliJ.tsx:73 renders WorkbenchLayout with no db; DocumentSetDetail is the only detail view lacking `db = defaultDb`.
  implication: deterministic missing-default bug on the production entry path, not a param/rehydrate/id mismatch.
- timestamp: 2026-11-19
  checked: Wrote agent-authored regression test rendering <DocumentSetDetail setId={...} /> with NO db prop against a seeded default singleton.
  found: test FAILS with the exact message "Không tìm thấy bộ tài liệu." before the fix.
  implication: reproduces the reported symptom deterministically; confirms falsification test.
- timestamp: 2026-11-19
  checked: Applied fix (default db) and reverted/reapplied.
  found: fix → test passes; revert → exact empty-state message returns; reapply → passes again.
  implication: the single default-param line is causally responsible (guardrail signal 5 pass).
- timestamp: 2026-11-19
  checked: Focused test suites + tsc --noEmit.
  found: DocumentSetDetailPublished (1), EditorArea (13), DocsWorkspace (2) all pass (17 total). tsc errors only pre-existing in tests/ai/chatTurnTools.test.ts; changed files clean.
  implication: no adjacent regressions; fix is type-safe.

## Resolution

root_cause: "DocumentSetDetail (introduced phase 45) was the only detail view without the `db = defaultDb` default param. The production shell AppIntelliJ renders <WorkbenchLayout /> with no db prop → WorkbenchLayout.db undefined → EditorArea passes dbProp={} → DocumentSetDetail.db undefined → useLiveQuery `if (!db) return null` → set null → the `!set` Empty state 'Không tìm thấy bộ tài liệu' even though the set exists in local IndexedDB."
fix: "Added `import { db as defaultDb }` and defaulted the prop: `DocumentSetDetail({ setId, db = defaultDb })`, matching NotesView / ChangeRequestDetailView / DocsExplorer."
verification:
  target_test:        { result: pass, test: "DocumentSetDetailDefaultDb.test.tsx — renders set from default DB with no db prop" }
  mutation_check:     { result: skipped, reason: "Stryker not installed and no stryker.conf present in this project" }
  no_op_deletion:     { result: pass, deletion_justified_by_rca: false, note: "diff is additive (import + default param) — no behavior deleted or short-circuited" }
  adjacent_tests:     { result: pass, suites_run: ["DocumentSetDetailPublished.test.tsx", "EditorArea.test.tsx", "DocsWorkspace.test.tsx"], total: 17 passed }
  typecheck:          { result: pass_for_changed_files, note: "tsc --noEmit errors are pre-existing only in tests/ai/chatTurnTools.test.ts; no errors in changed files" }
  revert_and_reconfirm: { result: pass, bug_returned_on_revert: true, fixed_on_reapply: true }
  guardrail_verdict:  accepted
files_changed:
  - src/workbench/DocumentSetDetail.tsx
  - src/workbench/__tests__/DocumentSetDetailDefaultDb.test.tsx
