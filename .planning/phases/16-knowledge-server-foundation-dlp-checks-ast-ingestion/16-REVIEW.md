---
phase: 16-knowledge-server-foundation-dlp-checks-ast-ingestion
reviewed: 2026-10-09T08:45:00Z
depth: standard
files_reviewed: 58
files_reviewed_list:
  - knowledge-server/package.json
  - knowledge-server/src/indexing/chunkHasher.ts
  - knowledge-server/src/indexing/incrementalProjector.ts
  - knowledge-server/src/indexing/snapshotStore.ts
  - knowledge-server/src/main.ts
  - knowledge-server/src/routes/attempts.ts
  - knowledge-server/src/routes/snapshots.ts
  - knowledge-server/src/server.ts
  - knowledge-server/src/services/attemptService.ts
  - knowledge-server/tests/attemptService.test.ts
  - knowledge-server/tests/incrementalProjector.test.ts
  - knowledge-server/tests/main.test.ts
  - knowledge-server/tests/pilotAcceptance.test.ts
  - knowledge-server/tests/server.test.ts
  - src/App.tsx
  - src/components/knowledge/AttemptHistoryList.tsx
  - src/components/knowledge/DlpWarningPanel.tsx
  - src/components/knowledge/DocPublishBadge.tsx
  - src/components/knowledge/DocumentSetDrawer.tsx
  - src/components/knowledge/DocumentSetForm.tsx
  - src/components/knowledge/PublishPreviewModal.tsx
  - src/components/knowledge/PublishProgressPanel.tsx
  - src/components/notes/DocEditorPane.tsx
  - src/components/notes/DocListPane.tsx
  - src/components/settings/KnowledgeServerConfigCard.tsx
  - src/db/index.ts
  - src/db/repositories/documentSetRepo.ts
  - src/db/repositories/publishAttemptRepo.ts
  - src/db/schema.ts
  - src/services/backup/exportBackup.ts
  - src/services/backup/restoreBackup.ts
  - src/services/backup/validateBackup.ts
  - src/services/knowledge/changePreview.ts
  - src/services/knowledge/knowledgeClient.ts
  - src/services/knowledge/knowledgeConfig.tsx
  - src/services/knowledge/publishOrchestrator.ts
  - src/types/backup.ts
  - src/types/models.ts
  - src/validation/backupSchemas.ts
  - src/validation/knowledgeSchemas.ts
  - src/views/NotesView.tsx
  - src/views/SettingsView.tsx
  - tests/db/schemaV9.test.ts
  - tests/knowledge/DocumentSetPublishFlow.test.tsx
  - tests/knowledge/KnowledgeServerConfigCard.test.tsx
  - tests/knowledge/NotesKnowledgePublishing.test.tsx
  - tests/knowledge/NotesWorkspacePublishingIntegration.test.tsx
  - tests/knowledge/changePreview.test.ts
  - tests/knowledge/documentSetRepo.test.ts
  - tests/knowledge/knowledgeClient.test.ts
  - tests/knowledge/offlineIsolation.test.ts
  - tests/knowledge/phase16Acceptance.test.tsx
  - tests/knowledge/publishDlpGate.test.ts
  - tests/knowledge/publishStatus.test.ts
  - tests/knowledge/schemaV10.test.ts
  - tests/services/backup/exportBackup.test.ts
  - tests/services/backup/knowledgeBackupRestore.test.ts
  - tests/services/backup/validateBackup.test.ts
findings:
  critical: 0
  warning: 4
  info: 0
  total: 4
status: issues_found
---

# Phase 16: Code Review Report

**Reviewed:** 2026-10-09T08:45:00Z  
**Depth:** standard  
**Files Reviewed:** 58  
**Status:** issues_found

## Summary

Phase 16 gap closure implementations (Plans 16-16 through 16-23) resolved all 9 previous BLOCKER issues (CR-01 through CR-09):
- CR-01 / CR-02: `knowledge-server/src/main.ts` added with strict fail-closed option parsing; unified authenticated `/api/v1/health` contract exposed on Fastify.
- CR-03: `SettingsView` nested provider removed; app-level config provider supplies session token to publish flows.
- CR-04: `DocumentSetDrawer` wired with explicit create mode and connected to `handleSaveDocumentSet` in `NotesView`.
- CR-05: `NotesView` distinguishes authoritative 404 (`SNAPSHOT_NOT_FOUND`) from network/auth/protocol errors, preventing unprompted remote removals.
- CR-06: `PublishPreviewModal` invokes `session.pollAcceptedAttempt()` after POST acceptance and updates terminal progress panel.
- CR-07: `reconcileAttempt()` in `knowledgeClient.ts` combines frozen submitted manifest with remote `activeSnapshotId`, atomically updating `publishedDocuments` via transaction.
- CR-08: `backupSchemas.ts` and `validateBackup.ts` accept `'document'` in `chatThreads.scopeType` and enforce referential integrity with notes.
- CR-09: `PublishSession.confirmFindings(overrideApproved)` strictly gates confirmation nonce creation at service boundary.

4 non-blocking WARNING items remain open or partially addressed.

## Warnings

### WR-01: Windows CLI path normalization in daemon main entrypoint detection

**File:** `knowledge-server/src/main.ts:118-121`
**Issue:** `isDirectRun` relies on `import.meta.url === file://${process.argv[1]?.replace(/\\/g, '/')}` and suffix checks. On Windows when spawned via `process.execPath [tsxCli, 'src/main.ts']`, `process.argv[1]` is the path to `cli.mjs`, not `main.ts`, and `process.argv[2]` holds `'src/main.ts'`. This causes CLI direct-run invocation in child process wrappers to skip auto-execution unless `process.argv` argument inspection normalizes `tsx` forwarding arguments.
**Fix:**
```ts
const argv = process.argv;
const isDirectRun =
  argv[1]?.endsWith('main.ts') ||
  argv[1]?.endsWith('main.js') ||
  argv.some((arg) => arg.replace(/\\/g, '/').endsWith('src/main.ts'));
```

### WR-02: Active daemon projections are in-memory and lost across daemon process restarts

**File:** `knowledge-server/src/indexing/snapshotStore.ts:25-29`
**Issue:** Snapshots, candidates, and attempts are stored in JavaScript memory maps (`#candidates`, `#activeBySet`). When knowledge daemon restarts, active snapshot manifests reset to empty. PlannerMate will receive 404 (`SNAPSHOT_NOT_FOUND`) on subsequent publish attempts and treat active documents as new additions.
**Fix:** Persist projection snapshots and attempt metadata to local JSON or SQLite store in `knowledge-server/data/`, or document ephemeral state lifecycle with startup recovery.

### WR-03: Publish attempt request schema permits duplicate document IDs

**File:** `knowledge-server/src/types/protocol.ts:75-81`
**Issue:** `PublishAttemptRequestSchema` accepts array of `PublishedDocumentInputSchema` without validating document ID uniqueness. If client submits duplicate IDs in payload, projector deletes document state on first occurrence and recreates on second, producing potential chunk metadata inconsistencies.
**Fix:**
```ts
export const PublishAttemptRequestSchema = z
  .object({
    setName: z.string().trim().min(1).max(120),
    documents: z
      .array(PublishedDocumentInputSchema)
      .refine(
        (docs) => new Set(docs.map((d) => d.documentId)).size === docs.length,
        'Duplicate document IDs are not permitted'
      ),
  })
  .strict();
```

### WR-04: Document picker search input in DocumentSetForm has no filtering handler

**File:** `src/components/knowledge/DocumentSetForm.tsx:142-149`
**Issue:** In `DocumentSetForm`, `<Input.Search placeholder="Tìm tài liệu" />` has no value state or `onChange` callback. Query entered by user does not filter document checkboxes, leaving the search control inoperative.
**Fix:** Bind local `searchQuery` state to `Input.Search` and filter `documents` array before mapping to checkbox options:
```tsx
const [searchQuery, setSearchQuery] = useState('');
const filteredDocuments = useMemo(() => {
  const q = searchQuery.trim().toLowerCase();
  if (!q) return documents;
  return documents.filter((d) => (d.title || '').toLowerCase().includes(q));
}, [documents, searchQuery]);
```

---

_Reviewed: 2026-10-09T08:45:00Z_  
_Reviewer: Claude (gsd-code-reviewer)_  
_Depth: standard_
