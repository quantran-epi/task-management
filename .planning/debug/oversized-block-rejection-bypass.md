---
status: diagnosed
trigger: "not pass, exceed 50k character publish success to knowledge server, one of the docs has character count exceed 50k, but can ignore for now, fix later if its not too important and affect the rightness of the data"
created: 2026-10-09T16:00:00.000Z
updated: 2026-10-09T16:35:00.000Z
---

## Current Focus

hypothesis: Document character count exceeding 50,000 characters was published without rejection because:
1. Architectural specification (D-25, INGEST-03) only bounds individual atomic blocks (table, fenced code block, blockquote) to 50,000 characters, while total document length is unconstrained. Regular text/sections naturally split across 6,000 character boundaries into multiple chunks. A test user pasting >50k of non-atomic text or multiple smaller sections succeeds because no block exceeded 50,000 characters.
2. In the parser (sectionChunker.ts), `ast.children` is only scanned shallowly at root level (`for (const node of ast.children)`). Any oversized atomic block nested inside lists, list items, or containers is bypassed completely.
3. In client UI (NotesView.tsx), when `buildPreview()` throws `OversizedAtomicBlockError`, it is caught by an unhandled generic `catch { message.error('Không thể tạo bản xem trước xuất bản.'); }`. Line, column, 50,000 limit, and split guidance are never presented.
test: Verified via reproduction tests and codebase AST inspection.
expecting: Root cause confirmed across requirements, parser traversal, and error surface.
next_action: Return structured diagnosis.

## Symptoms

expected: Publishing a note containing a code block, table, or blockquote over 50,000 characters stops before activation. Error shows line, column, the 50,000-character limit, and guidance to split the source block. The prior remote snapshot remains active.
actual: User reported: "not pass, exceed 50k character publish success to knowledge server, one of the docs has character count exceed 50k, but can ignore for now, fix later if its not too important and affect the rightness of the data"
errors: None reported.
reproduction: Test 9 in Phase 16 UAT.
started: Discovered during UAT Test 9.

## Eliminated

- hypothesis: Server fails to promote snapshot or fails to reject oversized atomic block when top-level table/code exceeds 50,000 characters
  evidence: atomicBlock.test.ts passes (4/4 passed). When a top-level code block or table exceeds 50k chars, chunkMarkdownSnapshot throws OversizedAtomicBlockError.
  timestamp: 2026-10-09T16:15:00.000Z

## Evidence

- timestamp: 2026-10-09T16:05:00.000Z
  checked: knowledge-server/src/types/protocol.ts and 16-CONTEXT.md D-25
  found: HARD_ATOMIC_BLOCK_LIMIT = 50,000 and TARGET_CHUNK_SIZE = 6,000. D-25 explicitly specifies limit applies per atomic block (table, code, blockquote), not total document character count. PublishedDocumentInputSchema allows arbitrary length `body: z.string()`.
  implication: If a document has 50,000+ characters composed of regular text, paragraphs, or multiple sections, it is legitimately split into multiple 6,000-character chunks and published successfully without error.

- timestamp: 2026-10-09T16:25:00.000Z
  checked: knowledge-server/src/parser/sectionChunker.ts lines 132-136
  found: `for (const node of ast.children) { validateAtomicBlockNode(node, documentId, hardLimit); }` only checks direct children of MDAST Root.
  implication: If an atomic block (>50k code fence, blockquote, or table) is nested within a list item or block container, root loop does not visit it. Reproduction test confirmed: nested code block over 50k chars did not throw.

- timestamp: 2026-10-09T16:30:00.000Z
  checked: src/views/NotesView.tsx lines 507-519
  found: `buildPreview()` throws OversizedAtomicBlockError, caught by `catch { message.error('Không thể tạo bản xem trước xuất bản.'); }`.
  implication: Even when triggered during client pre-publish preview, exact line, column, limit, and guidance are suppressed from the user.

- timestamp: 2026-10-09T16:32:00.000Z
  checked: src/components/knowledge/PublishPreviewModal.tsx lines 112-114 and PublishProgressPanel.tsx lines 17-26
  found: Server poll error handler only extracts `pollResult.error?.message`, omitting line, column, and remedy.
  implication: Server-side projection failure display omits line, column, and split guidance required by UI-SPEC.

## Resolution

root_cause: |
  1. Semantic misunderstanding of 50k limit: D-25 and protocol enforce 50,000 characters per atomic block (code block, table, blockquote), not total document length. A document exceeding 50,000 characters without an oversized atomic block is intentionally split into 6k chunks and publishes successfully.
  2. Shallow AST traversal bug: sectionChunker.ts validates only top-level `ast.children`, bypassing nested atomic blocks (e.g. inside list items).
  3. Swallowed error feedback: NotesView.tsx catches buildPreview errors with generic `message.error('Không thể tạo bản xem trước xuất bản.')`, hiding line, column, 50,000 limit, and split guidance from the user.
fix:
verification:
files_changed: []
