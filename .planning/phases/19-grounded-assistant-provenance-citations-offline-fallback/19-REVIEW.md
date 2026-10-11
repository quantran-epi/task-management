---
phase: 19-grounded-assistant-provenance-citations-offline-fallback
reviewed: 2026-10-11T16:25:00Z
depth: standard
files_reviewed: 34
files_reviewed_list:
  - src/services/knowledge/retrievalProtocol.ts
  - src/services/knowledge/knowledgeClient.ts
  - src/services/ai/groundedAnswerSchemas.ts
  - src/services/ai/nineRouterClient.ts
  - src/services/ai/intentRouter.ts
  - src/services/ai/semanticScopeRouter.ts
  - src/services/search/localGroundedRetrieval.ts
  - src/services/ai/evidencePack.ts
  - src/services/ai/groundedSynthesis.ts
  - src/services/ai/groundedTurn.ts
  - src/db/repositories/chatRepo.ts
  - src/validation/backupSchemas.ts
  - src/components/ai/CitationChip.tsx
  - src/components/ai/grounded/GroundedBanner.tsx
  - src/components/ai/grounded/CitationGroup.tsx
  - src/components/ai/grounded/ClaimBlock.tsx
  - src/components/ai/grounded/ScopeVariationCard.tsx
  - src/components/ai/grounded/GroundedAnswerCard.tsx
  - src/components/ai/grounded/GraphPathCard.tsx
  - src/components/ai/grounded/SourcesPanel.tsx
  - src/components/ai/grounded/CandidateChipList.tsx
  - src/components/ai/grounded/IntentRoutingPrompt.tsx
  - src/components/ai/grounded/DiagnosticsPanel.tsx
  - src/components/ai/grounded/EvidenceOnlyCard.tsx
  - src/components/ai/grounded/ScopeChipsBar.tsx
  - src/components/notes/QuickPreviewDrawer.tsx
  - src/components/knowledge/DocumentSetForm.tsx
  - src/components/ai/AIChatDrawer.tsx
  - src/components/ai/ChatMessageBubble.tsx
  - src/components/ai/ChatMessageList.tsx
  - knowledge-server/src/types/retrievalProtocol.ts
  - knowledge-server/src/retrieval/graphTraversal.ts
  - knowledge-server/src/retrieval/fusion.ts
  - knowledge-server/src/services/retrievalService.ts
  - knowledge-server/src/services/federatedRetrievalService.ts
  - knowledge-server/src/routes/retrieval.ts
findings:
  critical: 5
  warning: 11
  info: 0
  total: 16
status: issues_found
---

# Phase 19: Code Review Report

**Reviewed:** 2026-10-11T16:25:00Z  
**Depth:** standard  
**Files Reviewed:** 34  
**Status:** issues_found  

## Summary

Standard depth review conducted across 34 source files spanning the grounded assistant pipeline, citation UI, offline BM25 fallback, knowledge server retrieval service, and backup schemas.

Multiple critical bugs and logic defects were identified:
1. Data loss risk in backup schema validation where Phase 19 DocumentSet scope metadata is stripped during backup restoration.
2. Complete failure of entity clarification routing where actual candidate entity URNs are discarded and replaced with newly generated random document UUIDs.
3. Outcome status desynchronization in stored evidence synthesis where the synthesized answer remains permanently trapped behind a "Model Unavailable" error banner.
4. Empty query payload passed into stored evidence synthesis resulting in ungrounded English answers to blank prompts.
5. Form input unmounting on the first keystroke when specifying a custom environment in DocumentSetForm.
6. Multiple logic issues in repair prompt construction, override claim validation, trailing punctuation matching in intent routing, and SSE line buffering.

## Narrative Findings (AI reviewer)

### Critical Issues

#### CR-01: Backup Schema Strips DocumentSet Scope Metadata Causing Data Loss

**File:** `/Users/tranducquan/Working/Personal/task-management/src/validation/backupSchemas.ts:365-373`
**Issue:** `BackupDocumentSetRecordSchema` defines only `id`, `name`, `description`, `documentIds`, `createdAt`, and `updatedAt`. It omits all Phase 19 metadata fields added to `DocumentSet`: `preset`, `scope`, `aliases`, `relations`, and `isBase`. When backups are imported and validated via `validateBackup.ts`, Zod strips all unmodeled properties by default. Restoring a backup permanently destroys all scope configurations, aliases, relations, and base flags across all document sets.
**Fix:**
```typescript
export const BackupDocumentSetRecordSchema = z.object({
  id: uuidSchema,
  name: z.string().trim().min(1).max(120),
  description: z.string().optional(),
  documentIds: z.array(uuidSchema),
  preset: z.enum(['Chung', 'TheoMoiTruong', 'TheoModule', 'TheoPhienBan', 'BoSung', 'TuyChinh']).optional(),
  scope: z
    .object({
      domain: z.string().min(1),
      environment: z.string().nullable(),
      version: z.string().nullable(),
    })
    .optional(),
  aliases: z.array(z.string()).optional(),
  relations: z
    .array(
      z.object({
        kind: z.enum(['EXTENDS', 'SUPPLEMENTS', 'SUPERSEDES']),
        targetSetId: uuidSchema,
      })
    )
    .optional(),
  isBase: z.boolean().optional(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
```

#### CR-02: Entity Clarification Replaces Candidate URNs with Fabricated Random Document UUIDs

**File:** `/Users/tranducquan/Working/Personal/task-management/src/components/ai/AIChatDrawer.tsx:605-622` and `/Users/tranducquan/Working/Personal/task-management/src/components/ai/ChatMessageBubble.tsx:239-245`
**Issue:** When the server returns `NEEDS_CLARIFICATION` with candidates like `urn:plannermate:crm:ScheduledProcess:BATCH_01`, `AIChatDrawer` attempts `rawId = c.urn.split(':').pop()`. Because `BATCH_01` is not a UUID, `isValidUuid` returns false and `generateId()` assigns a brand-new random UUID as `documentId`, discarding the candidate's actual URN. Subsequently, `ChatMessageBubble.tsx` builds `candidateChips` as `urn: urn:plannermate:docs:doc:${c.documentId}`. When the user clicks a candidate chip, the application sends this invented document URN to the model instead of the user's selected candidate entity URN.
**Fix:**
Preserve candidate URNs directly in the clarification message payload:
```typescript
// In AIChatDrawer.tsx
const entityCitations: PersistedCitation[] = groundedResult.candidates.map((c, idx) => ({
  citationId: `S${idx + 1}`,
  documentId: isValidUuid(c.urn.split(':').pop() || '') ? (c.urn.split(':').pop() as string) : generateId(),
  documentTitle: c.canonicalName,
  sectionAnchor: c.urn, // retain original candidate URN
  lineStart: 1,
  lineEnd: 1,
  authority: 'server' as const,
  evidenceClass: 'OBSERVED' as const,
  snapshotId: 'gsnap_00000000',
  publishedContentHash: '0'.repeat(64),
  citedExcerpt: c.urn,
}));

// In ChatMessageBubble.tsx
const candidateChips = (g.citations ?? []).map((c) => ({
  id: c.documentId,
  label: c.documentTitle,
  urn: c.sectionAnchor || c.citedExcerpt,
}));
```

#### CR-03: Stored Evidence Synthesis Does Not Update Outcome Leaving Answer Trapped in Model-Unavailable Alert

**File:** `/Users/tranducquan/Working/Personal/task-management/src/services/ai/groundedTurn.ts:772-777`
**Issue:** `synthesizeFromStoredEvidence()` creates the updated message grounding via `const newGrounding: ChatMessageGrounding = { ...storedGrounding, answer: synthResult.answer, modelId: model, createdAt: nowIso };`. Because `storedGrounding.outcome` was `'MODEL_UNAVAILABLE'`, `newGrounding.outcome` remains `'MODEL_UNAVAILABLE'`. In `ChatMessageBubble.tsx` line 282 and `GroundedAnswerCard.tsx` line 151, `outcome === 'MODEL_UNAVAILABLE'` unconditionally renders `EvidenceOnlyCard` with the "Model unavailable" alert. The successfully generated answer is never displayed.
**Fix:**
```typescript
  const newGrounding: ChatMessageGrounding = {
    ...storedGrounding,
    outcome: storedGrounding.authority === 'server' ? 'READY' : 'LOCAL_FALLBACK_SYNTHESIS',
    answer: synthResult.answer,
    modelId: model,
    createdAt: nowIso,
  };
```

#### CR-04: Synthesizing from Stored Evidence Passes Empty Query to LLM

**File:** `/Users/tranducquan/Working/Personal/task-management/src/services/ai/groundedTurn.ts:755-764` and `/Users/tranducquan/Working/Personal/task-management/src/components/ai/AIChatDrawer.tsx:1341-1359`
**Issue:** In `synthesizeFromStoredEvidence()`, `deps.synthesizeGroundedAnswer` is invoked with `query: ''`. Because the query is empty, `detectQueryLanguage('')` defaults to English, and the model receives `{ query: "", evidence: [...] }`. The model is instructed to answer a completely empty prompt, resulting in nonsensical or ungrounded synthesis.
**Fix:**
Allow passing the original query text into `synthesizeFromStoredEvidence` and retrieve it from the preceding user turn in `AIChatDrawer.tsx`:
```typescript
// In groundedTurn.ts:
export async function synthesizeFromStoredEvidence(
  storedGrounding: ChatMessageGrounding,
  deps: GroundedTurnDeps,
  options?: {
    query?: string;
    endpoint?: string;
    apiKey?: string;
    model?: string;
    promptVersion?: string;
    signal?: AbortSignal;
  }
): Promise<GroundedTurnResult> {
  // ...
  const synthResult = await deps.synthesizeGroundedAnswer({
    query: options?.query ?? '',
    pack: rebuiltPack,
    // ...
  });
```

#### CR-05: Custom Environment Input in DocumentSetForm Unmounts on First Keystroke

**File:** `/Users/tranducquan/Working/Personal/task-management/src/components/knowledge/DocumentSetForm.tsx:252-261`
**Issue:** When selecting `'Khac'` from the environment dropdown, `environment` is set to `'Khac'`. An `<Input>` renders conditionally under `{environment === 'Khac' && ...}`. Its change handler runs `setEnvironment(e.target.value)`. Typing the first character changes `environment` from `'Khac'` to that character, causing `{environment === 'Khac'}` to evaluate to `false`. The input field immediately unmounts, making it impossible to enter a custom environment name.
**Fix:**
Use a dedicated state variable for custom environment mode or text:
```typescript
  const [customEnvSelected, setCustomEnvSelected] = useState<boolean>(false);

  // In Select onChange:
  onChange={(val) => {
    if (val === 'Khac') {
      setCustomEnvSelected(true);
      setEnvironment('');
    } else {
      setCustomEnvSelected(false);
      setEnvironment(val);
    }
  }}

  // Render input when customEnvSelected is true:
  {customEnvSelected && (
    <Input
      aria-label="Tên môi trường khác"
      placeholder="Nhập tên môi trường..."
      style={{ marginTop: 8 }}
      value={environment ?? ''}
      onChange={(e) => setEnvironment(e.target.value)}
    />
  )}
```

---

### Warnings

#### WR-01: Valid Override Claims Render Error Alert in UI Due to Missing `evidenceKind` on `PersistedCitation`

**File:** `/Users/tranducquan/Working/Personal/task-management/src/components/ai/grounded/ClaimBlock.tsx:59-65` and `/Users/tranducquan/Working/Personal/task-management/src/services/ai/groundedTurn.ts:130-146`
**Issue:** `evidencePack.ts` permits override claims if all cited sources have `evidenceKind` in `ALLOWED_EVIDENCE_KINDS` (`policy_change`, `release_note`, `migration_record`). However, `toPersistedCitations()` in `groundedTurn.ts` omits `evidenceKind`, and `PersistedCitationSchema` is `strictObject` without `evidenceKind`. In `ClaimBlock.tsx`, `(c as any).evidenceKind` is always undefined. As a consequence, valid override claims approved during synthesis trigger the UI error gate: `"Không thể khẳng định ghi đè — thiếu bằng chứng SUPERSEDES..."`.
**Fix:**
Allow optional `evidenceKind` in `PersistedCitationSchema` and preserve it in `toPersistedCitations`:
```typescript
// In groundedAnswerSchemas.ts:
evidenceKind: z.enum(['policy_change', 'release_note', 'migration_record', 'other']).optional(),

// In groundedTurn.ts toPersistedCitations():
evidenceKind: source.evidenceKind,
```

#### WR-02: Fabricated Dummy Fact Keys Rendered in Conflict Variation UI

**File:** `/Users/tranducquan/Working/Personal/task-management/src/services/ai/groundedTurn.ts:172-201`
**Issue:** `toPersistedConflicts()` generates fake conflict branches with `factKey: '1'.repeat(64)` and `'2'.repeat(64)`. In `ScopeVariationCard.tsx:107`, these dummy hashes are rendered to the user as `Khóa sự kiện: 11111111…` and `22222222…`. It also duplicates the first citation ID into both branches.
**Fix:**
Populate `branches` from actual conflicting edge and chunk items matched by `conflictGroupId`.

#### WR-03: Grounded Synthesis Repair Loop Drops Query and Evidence From Prompt

**File:** `/Users/tranducquan/Working/Personal/task-management/src/services/ai/groundedSynthesis.ts:163-172`
**Issue:** When an initial answer fails closure or schema validation, repair attempts 2 and 3 construct `userContent` with `issues`, `closureIssues`, and `previousJson`, but completely omit `input.query` and `input.pack.promptEvidence`. Because the LLM no longer receives the evidence text or query in the repair payload, it cannot accurately correct citation mappings.
**Fix:**
```typescript
    userContent = JSON.stringify({
      query: input.query,
      evidence: input.pack.promptEvidence,
      issues: lastIssues,
      closureIssues: lastClosureIssues,
      allowedCitationIds,
      allowedPathIds,
      previousJson: lastRaw,
      responseLanguage: targetLanguage,
    });
```

#### WR-04: Trailing Punctuation Breaks Keyword Matching in Intent Router

**File:** `/Users/tranducquan/Working/Personal/task-management/src/services/ai/intentRouter.ts:59-60`
**Issue:** `matchTerms` uses `new RegExp('(?:^|\\s)' + escapeRegex(normTerm) + '(?:$|\\s)', 'i')`. Because `normalizeVietnamese` preserves punctuation, queries ending with punctuation (e.g. `"Quy trình này là gì?"`, `"Tìm tài liệu?"`, `"Tác vụ này flow thế nào?"`) fail to match because trailing punctuation (`?`, `.`, `!`, `,`) satisfies neither `\s` nor `$`.
**Fix:**
```typescript
const regex = new RegExp(`(?:^|[\\s\\p{P}])${escapeRegex(normTerm)}(?:$|[\\s\\p{P}])`, 'iu');
```

#### WR-05: Chunk Boundary Duplication Corrupts `fullRawBody` in SSE Stream Reader

**File:** `/Users/tranducquan/Working/Personal/task-management/src/services/ai/nineRouterClient.ts:251-255`
**Issue:** In `streamChatEvents`, `lineBuffer += decoder.decode(value, { stream: true }); fullRawBody += lineBuffer; const lines = lineBuffer.split(/\r?\n/); lineBuffer = lines.pop() ?? '';`. If a chunk boundary splits a line, `fullRawBody += lineBuffer` appends the incomplete line fragment. On the next chunk, `lineBuffer` includes the fragment again, causing duplicate text in `fullRawBody` and breaking non-streaming JSON fallback parsing.
**Fix:**
```typescript
const decoded = decoder.decode(value, { stream: true });
fullRawBody += decoded;
lineBuffer += decoded;
const lines = lineBuffer.split(/\r?\n/);
lineBuffer = lines.pop() ?? '';
```

#### WR-06: Double Nested Accordion in Grounded Diagnostics UI

**File:** `/Users/tranducquan/Working/Personal/task-management/src/components/ai/grounded/GroundedAnswerCard.tsx:278-281` and `/Users/tranducquan/Working/Personal/task-management/src/components/ai/grounded/DiagnosticsPanel.tsx:131-152`
**Issue:** `GroundedAnswerCard` places `diagnosticsSlot` into a `<Collapse>` item titled "Chi tiết chẩn đoán truy xuất". `DiagnosticsPanel` itself renders an internal `<Collapse>` with the identical title "Chi tiết chẩn đoán truy xuất". The user is forced to expand two nested accordions with the same header to view diagnostic information.
**Fix:**
Remove the outer `<Collapse>` in `DiagnosticsPanel.tsx` or pass a prop to render `<Descriptions>` directly without wrapping in a second Collapse.

#### WR-07: Refinement Query Suggestions Displayed as Scope Warnings in Diagnostics Panel

**File:** `/Users/tranducquan/Working/Personal/task-management/src/components/ai/AIChatDrawer.tsx:686` and `/Users/tranducquan/Working/Personal/task-management/src/components/ai/grounded/DiagnosticsPanel.tsx:115-127`
**Issue:** When creating a `refine` grounding, `AIChatDrawer` puts user query refinement suggestions ("Thử với tên quy trình khác", "Mở rộng phạm vi tìm kiếm") into `coverageWarnings`. `DiagnosticsPanel` displays all `coverageWarnings` under "Cảnh báo phạm vi" (Scope coverage warnings) in warning color, presenting user query suggestions as index errors.
**Fix:**
Do not populate `coverageWarnings` with user refinement prompts. Keep refinement suggestions separate or render them only in `refinementsSlot`.

#### WR-08: LLM-Based Semantic Scope Routing is Never Called

**File:** `/Users/tranducquan/Working/Personal/task-management/src/services/ai/groundedTurn.ts:233-239`
**Issue:** `deps.routeScope()` is invoked with only `{ catalog: input.catalog, signal: input.signal }`. It never receives `completeJson` or `completeJsonArgs`. Because `completeFn && completeArgs` is always falsy, the structured output probe and LLM scope classification logic in `semanticScopeRouter.ts:284` never runs in production, permanently defaulting to `resolveDeterministicFallback`.
**Fix:**
Pass `completeJson` and configuration arguments when `input.capabilities.modelConfigured` is true:
```typescript
  const resolvedScope = await deps.routeScope(
    { query: input.query, routedIntent: intentDecision.route },
    {
      catalog: input.catalog,
      completeJsonArgs: input.capabilities.modelConfigured
        ? { endpoint: input.config.endpoint, apiKey: input.config.apiKey, model: input.config.model }
        : undefined,
      signal: input.signal,
    }
  );
```

#### WR-09: Soft-Deleted Notes Indexed and Cited in Local Offline Retrieval

**File:** `/Users/tranducquan/Working/Personal/task-management/src/services/ai/groundedTurnDeps.ts:98-102`
**Issue:** `localBm25Deps.loadNoteBody` fetches `database.notes.get(docId)` and returns it without checking `note.deletedAt`. Soft-deleted notes remain searchable and citeable in offline BM25 retrieval mode.
**Fix:**
```typescript
      loadNoteBody: async (docId) => {
        const note = await database.notes.get(docId);
        if (!note || note.deletedAt) return null;
        return { title: note.title, body: note.body, updatedAt: note.updatedAt };
      },
```

#### WR-10: Error Details Swallowed Without Logging in Fastify Retrieval Routes

**File:** `/Users/tranducquan/Working/Personal/task-management/knowledge-server/src/routes/retrieval.ts:42, 67`
**Issue:** Fastify `catch` blocks in `/api/v1/sets/:setId/retrieve` and `/api/v1/retrieve` omit the error variable (`catch`), logging only `{ code: 'INTERNAL_ERROR' }` without logging the error object or stack trace. Server-side debugging of retrieval exceptions is severely obstructed.
**Fix:**
```typescript
    } catch (err: unknown) {
      request.log.error({ err, code: 'INTERNAL_ERROR', setId: params.data.setId }, 'Retrieval failed');
      return reply.code(500).send({
        error: { code: 'INTERNAL_ERROR', message: 'Request could not be processed.' },
      });
    }
```

#### WR-11: Federated Result Assembly Truncation Fails to Emit Coverage Warnings

**File:** `/Users/tranducquan/Working/Personal/task-management/knowledge-server/src/services/federatedRetrievalService.ts:321-324`
**Issue:** During cross-set item combination, `if (totalCharsIncluded + itemChars > budgets.maxEvidenceChars && items.length > 0) break;` breaks out of the per-set item loop without breaking the outer set loop, without setting `budgetStopCode`, and without pushing a `BUDGET_EVIDENCE` coverage warning. As a result, `outcome` resolves to `'READY'` despite items being truncated by budget.
**Fix:**
Set a flag and push `BUDGET_EVIDENCE` into `coverageWarnings` when truncation occurs during item aggregation.

---

_Reviewed: 2026-10-11T16:25:00Z_  
_Reviewer: Claude (gsd-code-reviewer)_  
_Depth: standard_  
