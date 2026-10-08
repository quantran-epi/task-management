# Phase 16: Knowledge Server Foundation, DLP Checks & AST Ingestion - Pattern Map

**Mapped:** 2026-10-08
**Files analyzed:** 37
**Analogs found:** 18 / 37

## File Classification

| New/Modified File(s) | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/types/models.ts`, `src/types/dlp.ts` | model | transform | `src/types/models.ts` | exact/role-match |
| `src/db/schema.ts`, `src/db/index.ts` | config | CRUD | same files | exact |
| `src/db/repositories/documentSetRepo.ts`, `publishAttemptRepo.ts` | service | CRUD | `src/db/repositories/noteRepo.ts` | exact |
| `src/services/dlp/dlpScanner.ts`, `dlpMasker.ts`, `dlpAudit.ts` | utility/service | transform/CRUD | `src/services/ai/nineRouterClient.ts`, `noteRepo.ts` | role-match |
| `src/services/knowledge/knowledgeClient.ts` | service | request-response | `src/services/ai/nineRouterClient.ts` | exact |
| `src/services/knowledge/knowledgeConfig.ts` | provider | event-driven | `src/components/settings/GitHubConfigCard.tsx` | partial |
| `src/services/knowledge/changePreview.ts` | utility | transform | shared isomorphic MDAST/hash policy from `knowledge-server/src/parser/*` and `indexing/chunkHashPolicy.ts` | role-match |
| `src/components/knowledge/DocumentSetDrawer.tsx` | component | CRUD | `GitHubConfigCard.tsx` | role-match |
| `PublishPreviewModal.tsx`, `DlpWarningModal.tsx` | component | request-response | `src/components/notes/NormalizeDocModal.tsx` | role-match |
| `AttemptHistoryList.tsx`, `DocPublishBadge.tsx` | component | CRUD/transform | `src/components/notes/DocListPane.tsx` | role-match |
| `src/views/NotesView.tsx` | component | event-driven | same file | exact |
| `knowledge-server/package.json`, `tsconfig.json` | config | batch | root configs | role-match |
| `knowledge-server/src/server.ts`, `routes/*.ts` | controller/route | request-response | none | none |
| `knowledge-server/src/parser/*.ts` | service/utility | transform | research MDAST example | partial |
| `knowledge-server/src/indexing/*.ts` | service/utility | batch/CRUD | research hash/snapshot patterns | partial |
| `knowledge-server/src/types/protocol.ts` | model | request-response | `src/types/models.ts` | role-match |
| `tests/knowledge/documentSetRepo.test.ts`, `publishStatus.test.ts` | test | CRUD | `tests/db/schemaV9.test.ts` | exact/role-match |
| remaining `tests/knowledge/*.test.ts` | test | transform/request-response/file-I/O | `tests/ai/nineRouterClient.test.ts` | role-match/none |

## Pattern Assignments

### Client models, schema, repositories

**Apply to:** model, schema, repository, audit files.

**Model pattern — `src/types/models.ts` lines 171-185:**
```typescript
export interface Note {
  id: string;
  type?: NoteType | undefined;
  parentId?: string | undefined;
  tags?: string[] | undefined;
  body: string;
  createdAt: string;
  updatedAt: string;
}
```
Use stable UUIDs, ISO timestamps, explicit optional types. Keep canonical `Note.body` unchanged.

**Additive schema — `src/db/schema.ts` lines 61-70:**
```typescript
export const SCHEMA_V9 = {
  ...SCHEMA_V8,
  notes: 'id, type, parentId, entityType, entityId, isPinned, deletedAt, *tags, createdAt, updatedAt',
} as const;
```
Add `SCHEMA_V10` by spreading V9. Register typed tables and `this.version(10).stores(SCHEMA_V10)` following `src/db/index.ts` lines 29-48 and 144-161.

**Validated CRUD — `src/db/repositories/noteRepo.ts` lines 16-40:**
```typescript
const validated = NoteInputSchema.parse(input);
const now = new Date().toISOString();
const note = { id: generateId(), ...validated, createdAt: now, updatedAt: now };
await db.notes.add(note);
return note;
```

**Atomic writes — `noteRepo.ts` lines 131-142:**
```typescript
await db.transaction('rw', [db.notes, db.noteAttachments], async () => {
  await db.noteAttachments.bulkDelete(attachments.map((a) => a.id));
  await db.notes.delete(id);
});
```
Use one transaction for set plus ordered memberships and attempt insertion plus trimming to newest 10. Audit persists version, timestamp, IDs, categories/counts, hashes only.

### DLP and preview

**Apply to:** `dlpScanner.ts`, `dlpMasker.ts`, `dlpAudit.ts`, `changePreview.ts`.

No close scanner analog. Copy Luhn and deterministic regex pipeline from `16-RESEARCH.md` lines 288-315 and 397-471. Fixed rule version; precedence collapses overlapping source ranges. Scan set name, titles, bodies, tags, and every user string before content POST. D-04 preview runs before DLP using shared isomorphic AST/hash modules and performs no network I/O.

**Masking analog — `src/services/ai/nineRouterClient.ts` lines 20-23:**
```typescript
export function redactApiKey(text: string, apiKey?: string): string {
  if (!apiKey || apiKey.length < 4) return text;
  return text.replaceAll(apiKey, '***');
}
```
Return constructed masked context; never persist raw matches. Preview remains pure and executable in browser: frozen notes are parsed/chunked with the same isomorphic `chunkMarkdownSnapshot` and LF-only hash policy used by daemon projection, then compared with cached active manifest to produce exact document and chunk added/changed/removed/unchanged arrays before DLP or transport.

### Knowledge client and configuration

**HTTP/auth — `src/services/ai/nineRouterClient.ts` lines 149-205:**
```typescript
const headers: Record<string, string> = { 'Content-Type': 'application/json' };
headers.Authorization = `Bearer ${options.apiKey.trim()}`;
const response = await fetch(targetUrl, {
  method: 'POST', headers, body: JSON.stringify(options.payload), signal: options.signal,
});
if (!response.ok) {
  const rawError = await response.text().catch(() => '');
  throw new Error(redactApiKey(`API Error (${response.status}): ${rawError}`, options.apiKey));
}
```
Derive fixed `/api/v1` routes from one base URL. Add unique attempt key. Zod-parse responses. Poll with `AbortSignal`; network loss means uncertain `Publishing`, not `Failed`.

**Credential boundary — `src/components/settings/GitHubConfigCard.tsx` lines 57-87, 105-115:**
```typescript
// Persist only non-sensitive coordinates
await db.settings.put({ key: 'github_owner', value: owner.trim() });
// credential enters provider memory
setCredentials(newPatValue.trim(), passphrase ?? undefined);
```
Persist base URL only. Bearer token stays React/provider memory. Do not copy Tauri keychain persistence.

### UI and Notes integration

**Modal lifecycle — `src/components/notes/NormalizeDocModal.tsx` lines 57-132:**
```typescript
const abortControllerRef = useRef<AbortController | null>(null);
const handleCancel = () => {
  abortControllerRef.current?.abort();
  abortControllerRef.current = null;
  onClose();
};
try { /* work */ } catch (err: any) {
  if (err?.name === 'AbortError' || controller.signal.aborted) return;
  setError(err?.message || 'Lỗi');
} finally { setIsStreaming(false); }
```
Use controlled Ant Design modal, Vietnamese copy, `Alert`, explicit confirmation, reset confirmation each open. Closing stops polling only.

**List/badge integration — `src/components/notes/DocListPane.tsx` lines 319-444:** retain `role="button"`, `tabIndex`, Enter/Space behavior, and nested-control propagation handling. Add compact badge without touching BM25 or auto-save paths. Primary states exactly `Never published`, `In sync`, `Local changes`, `Publishing`, `Warning`, `Failed`; connectivity warning stays subordinate. Render findings as escaped React text, never HTML.

### Server parser and projection

No in-repo Fastify analog. Use independently deployed optional Fastify 5 daemon, exact CORS allow-list, auth hook, Zod boundaries, stable structured errors including `SET_PUBLISH_IN_PROGRESS`. POST deduplicates `attemptKey`, enforces one active attempt/set, freezes payload, returns 202 `{ attemptId }`, then processes async. PlannerMate never starts or requires daemon; sidecar packaging remains deferred.

**MDAST pattern — `16-RESEARCH.md` lines 473-560:**
```typescript
const tree = unified().use(remarkParse).use(remarkGfm).parse(rawMarkdown) as Root;
const start = first?.position?.start.offset ?? currentStartOffset;
const end = last?.position?.end.offset ?? rawMarkdown.length;
const slice = rawMarkdown.slice(start, end);
const normalized = slice.replace(/\r\n|\r/g, '\n');
```
Raw offsets always address immutable source. H2/H3 open sections; preamble includes H1; H4-H6 extend heading path. Split only at AST block boundaries. Tables/code/blockquote stay atomic. Reject atomic blocks over 50,000 chars with line/column; never truncate.

Use `node:crypto` SHA-256. `contentHash` identifies reusable content; independent `occurrenceId` preserves duplicate ranges. Build candidate separately; atomically swap active pointer only after every document succeeds. Failure retains previous active snapshot.

### Tests

**Dexie pattern — `tests/db/schemaV9.test.ts` lines 15-67:**
```typescript
const dbName = 'TestMigrationV9DB_' + Math.random().toString(36).slice(2);
afterEach(async () => { await Dexie.delete(dbName); });
const v8Db = new Dexie(dbName);
v8Db.version(8).stores(SCHEMA_V8);
await v8Db.open();
```
Copy for V9-to-V10 migration, stable membership after folder move, transactions, and 10-record bound.

**Transport pattern — `tests/ai/nineRouterClient.test.ts` lines 25-68:**
```typescript
const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
vi.stubGlobal('fetch', mockFetch);
expect(result.error).not.toContain('test-key');
```
Assert zero fetch before/cancelled DLP confirmation, fresh confirmation next attempt, token redaction, idempotent retry, and offline uncertainty.

AST tests load `docs/sample-markdown-flow/60000006-SHB-Credit-calculations/*.md`; assert exact `raw.slice(startOffset,endOffset)`, Unicode and CRLF offsets, intact tables/fences, 50,001 rejection, duplicate occurrences, and zero unchanged mutations.

## Shared Patterns

- **Validation:** Zod parse before DB/API side effects (`noteRepo.ts` lines 20-21, 75-77).
- **IDs/time:** `generateId()`/`crypto.randomUUID()` plus ISO timestamps; never mutable names/paths.
- **Transactions:** Dexie transaction for related local writes; frozen payload detached from live notes.
- **Errors/secrets:** preserve AbortError, redact credentials, separate HTTP terminal errors from network uncertainty (`nineRouterClient.ts` lines 187-205).
- **Reactive state:** `useLiveQuery` for persisted non-sensitive state (`GitHubConfigCard.tsx` lines 57-77); token memory-only.

## No Analog Found

| File | Reason |
|---|---|
| `knowledge-server/src/server.ts` | No server runtime exists. |
| `knowledge-server/src/routes/attempts.ts`, `snapshots.ts` | No HTTP route layer exists. |
| `knowledge-server/src/indexing/incrementalProjector.ts` | No incremental projection exists. |
| `tests/knowledge/astChunker.test.ts` | No MDAST fixture/range tests exist. |

Use locked `16-SPEC.md` plus research examples. Do not add retrieval indexes, graph extraction, or answer generation.

## Metadata

**Analog search scope:** `src/`, `tests/`, Phase 16 spec/context/research
**Strong analog files read:** 10
**Pattern extraction date:** 2026-10-08
