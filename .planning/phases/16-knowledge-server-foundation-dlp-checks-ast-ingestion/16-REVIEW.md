---
phase: 16-knowledge-server-foundation-dlp-checks-ast-ingestion
reviewed: 2026-10-08T14:53:13Z
depth: standard
files_reviewed: 54
files_reviewed_list:
  - knowledge-server/src/indexing/chunkHasher.ts
  - knowledge-server/src/indexing/incrementalProjector.ts
  - knowledge-server/src/indexing/snapshotStore.ts
  - knowledge-server/src/routes/attempts.ts
  - knowledge-server/src/routes/snapshots.ts
  - knowledge-server/src/server.ts
  - knowledge-server/src/services/attemptService.ts
  - knowledge-server/tests/attemptService.test.ts
  - knowledge-server/tests/incrementalProjector.test.ts
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
findings:
  critical: 9
  warning: 6
  info: 0
  total: 15
status: issues_found
---

# Phase 16: Code Review Report

**Reviewed:** 2026-10-08T14:53:13Z  
**Depth:** standard  
**Files Reviewed:** 54  
**Status:** issues_found

## Summary

Phase has blocking end-to-end gaps despite passing tests. Knowledge daemon cannot start through supplied script, connection diagnostics target nonexistent route, configured token never reaches publishing flow, first document set cannot be created through UI, offline preview can silently omit remote removals, and accepted attempts are never polled to completion. Backup validation also rejects app-generated document-scoped chat data.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: Knowledge server entrypoint never starts listener

**Classification:** BLOCKER  
**File:** `knowledge-server/src/server.ts:36-122`  
**Issue:** File only exports `buildKnowledgeServer`. It never reads configuration, constructs server, or calls `listen()`. `knowledge-server/package.json` runs `tsx watch src/server.ts`, so documented `knowledge:dev` command starts no HTTP listener. Entire daemon remains unavailable outside unit tests.

**Fix:** Add dedicated executable entrypoint and point `dev` at it. Keep builder side-effect free for tests.

```ts
// src/main.ts
import 'dotenv/config';
import { buildKnowledgeServer } from './server.js';

const server = buildKnowledgeServer({
  token: process.env.KNOWLEDGE_SERVER_TOKEN ?? '',
  allowedOrigins: (process.env.KNOWLEDGE_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  host: process.env.HOST,
  port: process.env.PORT ? Number(process.env.PORT) : undefined,
  httpsTerminated: process.env.HTTPS_TERMINATED === 'true',
});

await server.listen();
```

Update script to `tsx watch src/main.ts`.

### CR-02: Connection test calls route server does not expose

**Classification:** BLOCKER  
**Files:** `src/components/settings/KnowledgeServerConfigCard.tsx:93-99`, `knowledge-server/src/server.ts:74-89`  
**Issue:** Client tests `${baseUrl}/api/v1/health`. Server exposes only `/health`. Every real connection test returns 404. Existing tests mock client response and separately test `/health`, so mismatch escapes coverage.

**Fix:** Use one contract. Preferred: expose authenticated `/api/v1/health` so connection test verifies origin and token too.

```ts
app.get('/api/v1/health', async () => ({ status: 'ok' }));
```

Update server integration test to request exact browser route with configured origin and bearer token.

### CR-03: Nested configuration provider isolates token from publishing flow

**Classification:** BLOCKER  
**Files:** `src/App.tsx:174-178`, `src/views/SettingsView.tsx:231-233`  
**Issue:** App already supplies `KnowledgeConfigProvider`. Settings creates second nested provider around configuration card. Token entered in card updates inner provider only. `NotesView` consumes outer provider and receives empty token. Saved enabled/base URL state also remains stale in outer provider until reload; after reload token is intentionally gone. User therefore has no state where token entered in Settings is available to Docs publishing.

**Fix:** Remove nested provider from `SettingsView` and let card consume app-level provider.

```tsx
<KnowledgeServerConfigCard />
```

Tests needing custom DB should wrap `SettingsView` once with `KnowledgeConfigProvider db={db}`.

### CR-04: UI provides no working path to create first document set

**Classification:** BLOCKER  
**Files:** `src/views/NotesView.tsx:1083-1096`, `src/components/knowledge/DocumentSetDrawer.tsx:76-84`  
**Issue:** Drawer create buttons invoke optional `onCreate`, but `NotesView` never supplies it. With no existing sets, drawer renders only nonfunctional create buttons. `DocumentSetForm` appears only after selecting an existing set, making initial creation impossible through application UI.

**Fix:** Add explicit create mode to drawer and wire `onCreate` from `NotesView`. Create mode should render `DocumentSetForm` with no `initialSet`, then call existing `onSave(undefined, value)`.

### CR-05: Any snapshot lookup failure is treated as empty remote state

**Classification:** BLOCKER  
**File:** `src/views/NotesView.tsx:388-400`  
**Issue:** Catch block converts every failure—offline, timeout, 401, 403, invalid JSON, server error—into `activeManifest = null`. Preview then labels all local documents as additions and omits remote-only documents. If server recovers before POST, submitted set can remove remote documents without showing removals or obtaining removal consent. Authentication and protocol failures are also falsely presented as valid previews.

**Fix:** Treat only authoritative 404 as “never published.” For network failure, use previously cached manifest or allow read-only preview while disabling submission. Surface authorization and invalid-response errors.

```ts
try {
  activeManifest = await client.getSnapshotManifest(set.id);
} catch (error) {
  if (error instanceof KnowledgeClientError && error.status === 404) {
    activeManifest = null;
  } else {
    throw error;
  }
}
```

Persist content-free active manifests locally if offline preview must remain publish-capable.

### CR-06: Accepted publish attempts are never polled or reconciled

**Classification:** BLOCKER  
**Files:** `src/components/knowledge/PublishPreviewModal.tsx:60-65`, `src/components/knowledge/PublishPreviewModal.tsx:84-90`, `src/services/knowledge/publishOrchestrator.ts:160-166`  
**Issue:** Modal submits attempt, hardcodes `status="Publishing"`, and never invokes `pollAcceptedAttempt()`. Poll method has no production caller. Successful and failed attempts remain permanently shown as Publishing unless some unrelated code manually refreshes them. Closing modal loses session and attempt ID.

**Fix:** Start polling after accepted POST, hold returned terminal state in component/controller, and render `In sync`, `Failed`, uncertainty, and error details. Closing should abort local observation only; retained attempt ID must allow later reconciliation.

### CR-07: Successful polling cannot update published-document metadata

**Classification:** BLOCKER  
**Files:** `src/services/knowledge/knowledgeClient.ts:232-244`, `src/db/repositories/publishAttemptRepo.ts:23-69`  
**Issue:** Client reconciles only `PublishAttemptCache`. It never supplies `publishedDocuments`, and no other production code writes this table. Consequently `getDocumentPublishStatuses()` cannot transition documents to `In sync`; they remain `Never published` or stale. Successful replacement also never deletes metadata for documents removed from active snapshot.

**Fix:** On terminal success, combine frozen submitted snapshot with server `activeSnapshotId`, then atomically replace published metadata for that set:

1. Delete stale `publishedDocuments` rows for set.
2. Insert one row per active document with content hash and active IDs.
3. Store terminal attempt in same transaction.
4. Preserve prior metadata on failed attempts.

### CR-08: Backup validator rejects app-generated document chat threads

**Classification:** BLOCKER  
**Files:** `src/types/models.ts:199-205`, `src/validation/backupSchemas.ts:199-207`, `src/components/notes/DocEditorPane.tsx:438-447`  
**Issue:** Runtime supports `ChatScopeType = 'document'`, and Docs opens document-scoped AI chat. Backup schema allows only `global`, `task`, `project`, and `milestone`. Once user creates document chat history, app exports it but rejects its own backup during validation, blocking restore of otherwise valid user data.

**Fix:**

```ts
scopeType: z.enum(['global', 'task', 'project', 'milestone', 'document']),
```

Add export-validation-restore test containing document-scoped thread and messages.

### CR-09: DLP service does not enforce explicit override approval

**Classification:** BLOCKER  
**File:** `src/services/knowledge/publishOrchestrator.ts:106-117`  
**Issue:** After scan finds sensitive data, `confirmFindings()` creates valid nonce without receiving or checking explicit user approval. Checkbox exists only in current React component. Any alternate caller, refactor, keyboard race, or API use can call `scan()`, `confirmFindings()`, and submit sensitive content without override consent. Security boundary therefore depends on presentation layer rather than publish service.

**Fix:** Require approval at service boundary.

```ts
async confirmFindings(overrideApproved: boolean): Promise<{ nonce: string }> {
  const preview = this.requirePreview();
  if (!this.findings) throw new Error('Publish requires a completed DLP scan');
  if (this.findings.length > 0 && !overrideApproved) {
    throw new Error('Sensitive-data findings require explicit approval');
  }
  // create bound confirmation
}
```

Pass checkbox state from modal and test direct-call bypass rejection.

## Warnings

### WR-01: Scan and publish failures leave modal stuck and create unhandled rejections

**Classification:** WARNING  
**File:** `src/components/knowledge/PublishPreviewModal.tsx:50-66`  
**Issue:** `session.scan()`, `confirmFindings()`, and `submitConfirmedAttempt()` have no error handling. Failed scan leaves step at `scanning`; failed POST produces unhandled promise rejection with no user-visible recovery state. Buttons also lack in-flight guards, allowing duplicate clicks and duplicate audit records.

**Fix:** Wrap operations in `try/catch/finally`, track busy state, restore actionable step on failure, show fixed content-free error text, and disable all submit controls while request runs.

### WR-02: Drawer displays false “Never published” state for every list item

**Classification:** WARNING  
**File:** `src/components/knowledge/DocumentSetDrawer.tsx:65-67`, `src/components/knowledge/DocumentSetDrawer.tsx:89-92`  
**Issue:** List rows hardcode `Never published`. Selected detail also defaults to one global `props.state`, but `NotesView` passes no state. Existing attempts and metadata therefore do not affect drawer state display, misleading users about active, failed, or synchronized sets.

**Fix:** Pass state keyed by set ID or derive it from cached attempts and published metadata. Use per-set state in both list row and selected detail.

### WR-03: Active daemon projections vanish on every process restart

**Classification:** WARNING  
**Files:** `knowledge-server/src/indexing/snapshotStore.ts:24-28`, `knowledge-server/src/services/attemptService.ts:85-94`  
**Issue:** Candidates, attempts, and active snapshots exist only in process-local maps. Restart loses all published projection state and idempotency history. Client then receives 404 and may treat set as never published. This undermines daemon reliability and worsens removal-consent issue.

**Fix:** Persist active snapshots and attempts to local durable storage, or implement explicit startup reconstruction from durable projection artifacts. At minimum, document ephemeral ceiling and block destructive republish when state was lost.

### WR-04: Server accepts duplicate document IDs in one attempt

**Classification:** WARNING  
**Files:** `knowledge-server/src/types/protocol.ts:74-79`, `knowledge-server/src/indexing/incrementalProjector.ts:135-169`  
**Issue:** Request schema does not enforce unique `documentId`. Duplicate entries produce duplicate documents in candidate snapshot and inconsistent delta classification because previous document entry is deleted after first occurrence.

**Fix:**

```ts
documents: z
  .array(PublishedDocumentInputSchema)
  .refine(
    (documents) => new Set(documents.map((document) => document.documentId)).size === documents.length,
    'Duplicate document IDs are not allowed'
  ),
```

### WR-05: Configuration load failure leaves provider permanently unready

**Classification:** WARNING  
**File:** `src/services/knowledge/knowledgeConfig.tsx:80-89`  
**Issue:** Initial IndexedDB `Promise.all` has no rejection handler. Any settings read failure leaves `ready=false` forever and emits unhandled rejection. Configuration UI remains loading with no recovery path.

**Fix:** Add `catch` with safe disabled defaults and `finally` that sets ready while component remains active.

### WR-06: Document picker search control does nothing

**Classification:** WARNING  
**File:** `src/components/knowledge/DocumentSetForm.tsx:141-149`  
**Issue:** Search input has no value state or filtering callback. Users can type but document list never changes, making advertised search nonfunctional.

**Fix:** Track query and filter `documents` by normalized title before rendering checkboxes.

---

_Reviewed: 2026-10-08T14:53:13Z_  
_Reviewer: Claude (gsd-code-reviewer)_  
_Depth: standard_
