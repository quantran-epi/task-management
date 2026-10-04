---
phase: 14-knowledge-base-integration-docs-linking-ai-retrieval
verified: 2026-10-04T16:27:00Z
status: human_needed
score: 18/18 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Open Notes & Docs view and test 3-column workspace layout"
    expected: "View displays 3 responsive columns: Folder Tree (~220px), Document List (~300px), and Split Markdown Editor/Preview. Switching to Grid mode via Segmented control toggles back to classic sticky notes card grid."
    why_human: "Visual layout proportions, smooth scrolling, and CSS responsive styling cannot be verified programmatically."
  - test: "Paste markdown with Jira keys and test Smart Ingestion flow"
    expected: "DocEditorPane displays '💡 Gợi ý liên kết liên quan' banner with detected Jira keys/tasks; clicking 'Áp dụng tất cả' inserts bidirectional wiki-links and updates backlinks."
    why_human: "Interactive paste handler, banner rendering transition, and DOM focus dynamics require browser user interaction."
  - test: "Open TaskDrawer on a task with linked docs and launch QuickPreviewDrawer"
    expected: "TaskDrawer renders 'Tài liệu & Tri thức liên kết' section with doc pills; clicking a doc pill opens 480px QuickPreviewDrawer on right side without closing TaskDrawer."
    why_human: "Multi-drawer z-index layering and visual backdrop containment cannot be verified by headless tests."
---

# Phase 14: Knowledge Base Integration (Docs, Linking & AI Retrieval) Verification Report

**Phase Goal:** Deliver an offline-first Personal Knowledge Management (PKM) engine with 3-column Docs workspace, folder tree taxonomy, Markdown split preview with outline ToC, Wiki-link bidirectional linking, 1-Click Smart Ingestion flow, lexical BM25 search with Vietnamese diacritic tolerance, and grounded AI retrieval with clickable citations.
**Verified:** 2026-10-04T16:27:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth   | Status     | Evidence       |
| --- | ------- | ---------- | -------------- |
| 1   | Dexie schema upgrades to Version 9 with indexed note type, parentId, tags, and deletedAt while preserving existing sticky notes | ✓ VERIFIED | `src/db/schema.ts` lines 68-71, `src/db/index.ts` lines 147-162, verified in `tests/db/schemaV9.test.ts` |
| 2   | Notes repository creates, updates, queries by folder (parentId), filters by tag, soft deletes, and restores documents | ✓ VERIFIED | `src/db/repositories/noteRepo.ts` methods `softDeleteNote`, `restoreNote`, `getNotesByFolder`, `getTrashNotes` |
| 3   | BM25 scoring utility ranks documents with Title x3, Tags x2, Body x1 weights and handles Vietnamese text with or without diacritics | ✓ VERIFIED | `src/utils/bm25.ts` functions `normalizeVietnamese`, `tokenize`, `rankBM25`, tested in `tests/utils/bm25.test.ts` |
| 4   | Markdown parser renders wiki-links `[[doc:...]]`, `[[task:...]]`, `[[project:...]]` into interactive, clickable chip elements with icons and display titles without XSS risk | ✓ VERIFIED | `src/utils/markdown.ts` lines 38-46, tested in `tests/ai/markdown.test.ts` |
| 5   | Smart ingestion extracts first H1 as document title, extracts #hashtags as tags, and regex-detects Jira keys and known task/project names | ✓ VERIFIED | `src/utils/smartIngestion.ts` functions `extractMarkdownMetadata`, `detectReferencedEntities` |
| 6   | SmartIngestionBanner displays suggested entity links with checkboxes and an Apply All 1-click button that persists two-way links | ✓ VERIFIED | `src/components/notes/SmartIngestionBanner.tsx`, wired into `DocEditorPane.tsx` |
| 7   | Two-way backlinks repository queries all tasks, projects, and notes referencing a given document ID | ✓ VERIFIED | `src/db/repositories/documentLinkRepo.ts` methods `getBacklinksForDoc`, `linkEntitiesToDoc` |
| 8   | AI Tool search_knowledge_base performs offline BM25 search on documents, filters deleted notes, and returns ranked snippets within character budgets | ✓ VERIFIED | `src/services/ai/aiTools.ts` lines 2807-2849, tested in `tests/ai/aiTools.test.ts` |
| 9   | AI Tool get_document_details retrieves full document content and attachment metadata by document ID | ✓ VERIFIED | `src/services/ai/aiTools.ts` lines 2851-2885, tested in `tests/ai/aiTools.test.ts` |
| 10  | ChatInputBar autocomplete supports @doc: trigger, allowing users to mention and ground AI conversation in a specific document | ✓ VERIFIED | `src/components/ai/ChatInputBar.tsx` lines 321-326, tested in `tests/ai/ChatInputBar.test.tsx` |
| 11  | CitationChip renders clickable citations [📄 Doc Title §Heading] in AI responses that open the QuickPreviewDrawer | ✓ VERIFIED | `src/components/ai/CitationChip.tsx`, tested in `tests/ai/CitationChipAndQuickPreview.test.tsx` |
| 12  | QuickPreviewDrawer renders the referenced document in a slide-out drawer preserving ongoing task or chat context | ✓ VERIFIED | `src/components/notes/QuickPreviewDrawer.tsx` (480px right-side drawer with zIndex 1100) |
| 13  | NotesView renders a unified 3-column layout: Navigation/Folder Tree (~220px), Document List (~300px), and Editor/Reader Split View Pane | ✓ VERIFIED | `src/views/NotesView.tsx` lines 378-417, tested in `tests/views/NotesView.test.tsx` |
| 14  | DocFolderTree manages multi-level folder hierarchy (parentId), quick filters (Inbox, Pinned, All Docs, Sticky Notes, Trash), and drag-and-drop / select actions | ✓ VERIFIED | `src/components/notes/DocFolderTree.tsx` |
| 15  | DocEditorPane supports Markdown editing, split view preview, heading-based Outline Table of Contents, and debounce autosave | ✓ VERIFIED | `src/components/notes/DocEditorPane.tsx` and `src/components/notes/DocOutlineToC.tsx` |
| 16  | TaskDrawer includes a Linked Knowledge section displaying linked docs and launching the QuickPreviewDrawer | ✓ VERIFIED | `src/components/tasks/LinkedKnowledgeSection.tsx`, wired into `TaskDrawer.tsx` line 753 |
| 17  | BacklinksSection renders all referencing tasks and projects at the bottom of the document viewer | ✓ VERIFIED | `src/components/notes/BacklinksSection.tsx`, rendered inside `DocEditorPane.tsx` |
| 18  | Trash bin view allows restoring or permanently deleting documents with warning on existing backlinks | ✓ VERIFIED | `src/views/NotesView.tsx` lines 250-279 checking backlinks count before delete modal |

**Score:** 18/18 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/types/models.ts` | Extended Note model with type, parentId, tags, slug, deletedAt | ✓ VERIFIED | Contains `NoteType = 'quick_note' \| 'document' \| 'folder'`, `parentId`, `tags`, `deletedAt` |
| `src/db/schema.ts` | SCHEMA_V9 database definition | ✓ VERIFIED | Defines `SCHEMA_V9` with indexes on `id, type, parentId, entityType, entityId, isPinned, deletedAt, *tags, createdAt, updatedAt` |
| `src/utils/bm25.ts` | Offline lexical BM25 ranking and Vietnamese normalization | ✓ VERIFIED | Exports `rankBM25`, `tokenize`, `normalizeVietnamese`, `extractRelevantSnippet` |
| `src/db/repositories/noteRepo.ts` | Folder hierarchy, soft-delete, and tag query methods | ✓ VERIFIED | Exports `softDeleteNote`, `restoreNote`, `getNotesByFolder`, `getTrashNotes` |
| `src/utils/markdown.ts` | Wiki-link and attachment:uuid rendering | ✓ VERIFIED | Renders `.wiki-link-chip` and `.note-attachment-image` with full XSS escaping |
| `src/utils/smartIngestion.ts` | Markdown metadata extraction and entity detection algorithms | ✓ VERIFIED | Exports `extractMarkdownMetadata`, `detectReferencedEntities` |
| `src/db/repositories/documentLinkRepo.ts` | Two-way linking queries and backlinks resolution | ✓ VERIFIED | Exports `getBacklinksForDoc`, `linkEntitiesToDoc`, `unlinkEntityFromDoc` |
| `src/components/notes/SmartIngestionBanner.tsx` | 1-Click suggested links banner component | ✓ VERIFIED | Exports `SmartIngestionBanner`, wired into `DocEditorPane` |
| `src/services/ai/aiTools.ts` | AI tools search_knowledge_base and get_document_details | ✓ VERIFIED | Implements tools and handlers returning character-bounded snippets |
| `src/components/ai/CitationChip.tsx` | Interactive citation chip for AI responses | ✓ VERIFIED | Renders tag with tooltip and click dispatch to open preview |
| `src/components/notes/QuickPreviewDrawer.tsx` | Slide-out document reader preserving main workflow | ✓ VERIFIED | Renders drawer at zIndex 1100 with navigation action to full Docs |
| `src/views/NotesView.tsx` | Unified 3-column Docs & Notes application shell | ✓ VERIFIED | 3-column workspace with Segmented toggle to classic Grid view |
| `src/components/notes/DocFolderTree.tsx` | Folder tree navigation with quick filters and trash | ✓ VERIFIED | Folder tree with Inbox, Pinned, Trash, Tags, and modal creation |
| `src/components/notes/DocListPane.tsx` | Document list with search, sorting, and tag filters | ✓ VERIFIED | Search input, pin/delete actions, relative time formatting |
| `src/components/notes/DocEditorPane.tsx` | Markdown split editor/preview with auto-save and ToC | ✓ VERIFIED | Split editor/preview, debounced autosave, SmartIngestionBanner, ToC drawer |
| `src/components/notes/DocOutlineToC.tsx` | Outline table of contents generated from headings | ✓ VERIFIED | Smooth-scrolling anchor list extracted from markdown headings |
| `src/components/notes/BacklinksSection.tsx` | Backlinks list footer in document viewer | ✓ VERIFIED | Lists referencing tasks, projects, and notes with direct navigation |
| `src/components/tasks/LinkedKnowledgeSection.tsx` | Linked documents section in TaskDrawer | ✓ VERIFIED | Renders purple doc tags in TaskDrawer launching QuickPreviewDrawer |
| `src/utils/documentExport.ts` | Exporting documents to Markdown files or zip archives | ✓ VERIFIED | Exports `exportDocumentAsMarkdown`, `exportAllDocumentsAsZip` with filename sanitization |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `src/db/index.ts` | `src/db/schema.ts` | `version(9).stores(SCHEMA_V9).upgrade(...)` | ✓ WIRED | Line 147 in `src/db/index.ts` |
| `src/utils/bm25.ts` | `src/types/models.ts` | `BM25Document` matches `Note` fields | ✓ WIRED | Line 6 in `src/utils/bm25.ts` |
| `src/components/notes/SmartIngestionBanner.tsx` | `src/db/repositories/documentLinkRepo.ts` | `linkEntitiesToDoc` on Apply All | ✓ WIRED | Line 96 in `src/components/notes/DocEditorPane.tsx` |
| `src/services/ai/aiTools.ts` | `src/utils/bm25.ts` | `rankBM25` execution in `search_knowledge_base` | ✓ WIRED | Line 2834 in `src/services/ai/aiTools.ts` |
| `src/components/ai/CitationChip.tsx` | `src/components/notes/QuickPreviewDrawer.tsx` | `onOpenDoc` callback triggering drawer | ✓ WIRED | Wired in `ChatMessageBubble.tsx` and `AIChatDrawer.tsx` |
| `src/views/NotesView.tsx` | `src/components/notes/DocEditorPane.tsx` | `<DocEditorPane />` selection and edit callbacks | ✓ WIRED | Line 411 in `src/views/NotesView.tsx` |
| `src/components/tasks/TaskDrawer.tsx` | `src/components/tasks/LinkedKnowledgeSection.tsx` | `<LinkedKnowledgeSection />` rendering | ✓ WIRED | Line 753 in `src/components/tasks/TaskDrawer.tsx` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `NotesView.tsx` | `allNotes` | `useLiveQuery(() => db.notes.toArray())` | IndexedDB `db.notes` query | ✓ FLOWING |
| `DocListPane.tsx` | `notes` | Passed down from `filteredDocList` derived from `allNotes` | Reactive Dexie records | ✓ FLOWING |
| `DocEditorPane.tsx` | `doc` | `activeDocument` derived from `allNotes` by `selectedDocId` | Live note entity | ✓ FLOWING |
| `LinkedKnowledgeSection.tsx` | `linkedDocs` | `useLiveQuery(() => db.notes.bulkGet(docIds))` | Live IndexedDB lookup by parsed UUIDs | ✓ FLOWING |
| `QuickPreviewDrawer.tsx` | `doc`, `backlinks` | `db.notes.get(docId)` and `getBacklinksForDoc(docId)` | Dexie query + reverse join on references | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| BM25 non-diacritic query matching diacritic content | `npx vitest run tests/utils/bm25.test.ts -t "matches non-diacritic query terms"` | 1 passed (488ms) | ✓ PASS |
| Schema V9 migration of legacy V8 notes | `npx vitest run tests/db/schemaV9.test.ts -t "migrates legacy v8 notes"` | 1 passed (237ms) | ✓ PASS |
| Full Phase 14 test suite (9 test files) | `npx vitest run tests/db/schemaV9.test.ts tests/utils/bm25.test.ts tests/utils/smartIngestion.test.ts tests/ai/markdown.test.ts tests/ai/aiTools.test.ts tests/ai/CitationChipAndQuickPreview.test.tsx tests/utils/documentExport.test.ts tests/views/NotesView.test.tsx tests/components/TaskDrawer.test.tsx` | 9 passed, 93 tests passed (40.28s) | ✓ PASS |
| Production build & strict typecheck | `npm run build` | Zero TypeScript errors, bundle generated in 797ms | ✓ PASS |

### Probe Execution

No probes declared or required for Phase 14.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| REQ-14.1 | 14-01-PLAN.md | Database schema upgrades to Dexie SCHEMA_V9 supporting document type, folder hierarchy (parentId), tags, and soft delete (deletedAt) without data loss on existing sticky notes | ✓ SATISFIED | `SCHEMA_V9` in `schema.ts`, upgrade handler in `index.ts`, `schemaV9.test.ts` passes |
| REQ-14.2 | 14-01-PLAN.md | Offline lexical BM25 search engine with field weighting (Title x3, Tags x2, Body x1) and Vietnamese diacritic normalization | ✓ SATISFIED | `bm25.ts` functions `normalizeVietnamese`, `tokenize`, `rankBM25`, `bm25.test.ts` passes |
| REQ-14.3 | 14-02-PLAN.md | Markdown renderer parses inline Wiki-links (`[[doc:id\|Title]]`, `[[task:id\|Title]]`, `[[project:id\|Title]]`) into interactive chips and binary attachments (`attachment:uuid`) safely without XSS | ✓ SATISFIED | `markdown.ts` safe escaping, wiki-link chips, and attachment rendering; `markdown.test.ts` passes |
| REQ-14.4 | 14-02-PLAN.md | Smart Ingestion flow extracts markdown headings/hashtags and regex-detects Jira keys and existing task/project titles with a 1-click "Áp dụng tất cả" banner | ✓ SATISFIED | `smartIngestion.ts`, `SmartIngestionBanner.tsx`, `documentLinkRepo.ts`; `smartIngestion.test.ts` passes |
| REQ-14.5 | 14-03-PLAN.md | AI tools `search_knowledge_base` and `get_document_details` provide BM25-ranked snippets within character budget, supported by `@doc:` autocomplete and clickable citation chips opening a Quick Preview Drawer | ✓ SATISFIED | AI tools in `aiTools.ts`, `@doc:` in `ChatInputBar.tsx`, `CitationChip.tsx`, `QuickPreviewDrawer.tsx`; `aiTools.test.ts` passes |
| REQ-14.6 | 14-04-PLAN.md | NotesView provides a unified 3-column document workspace (Folder Tree + Document List + Split Editor/Reader with ToC and Backlinks), TaskDrawer Linked Knowledge integration, and Markdown/Zip export | ✓ SATISFIED | `NotesView.tsx`, `DocFolderTree.tsx`, `DocListPane.tsx`, `DocEditorPane.tsx`, `LinkedKnowledgeSection.tsx`, `documentExport.ts`; `NotesView.test.tsx` passes |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| None | - | No TBD/FIXME/XXX debt markers, no stubs, no placeholder code found | None | Clean codebase |

### Human Verification Required

### 1. 3-Column Docs Workspace Layout & Toggle Mode

**Test:** Navigate to "Ghi chú & Tài liệu" in application sidebar. Confirm 3 columns appear side-by-side (Folder Tree ~220px, Document List ~300px, Split Editor/Preview). Toggle Segmented control to "Ghi chú nhanh (Grid)" and back to "Docs (3 Cột)".
**Expected:** Layout renders neatly with clean borders and no overflow clipping. Segmented switch toggles instantly between classic grid cards and 3-column document view.
**Why human:** CSS layout flexbox rendering, scrollbar behavior, and responsive feel require visual browser check.

### 2. Smart Ingestion Flow & 1-Click Link Application

**Test:** Create a new document in Docs workspace. Paste markdown containing an existing Jira key (e.g. `SHB-1234`) or task title.
**Expected:** The "💡 Gợi ý liên kết liên quan" banner appears above editor with detected entities. Clicking "Áp dụng tất cả" appends wiki-links and updates the document backlinks list.
**Why human:** Real user copy-paste event handling and visual banner interaction cannot be verified headlessly.

### 3. TaskDrawer Linked Knowledge & QuickPreviewDrawer

**Test:** Open any task drawer that has linked documents or add a wiki-link `[[doc:...]]` in task notes. Click on the document chip in the "Tài liệu & Tri thức liên kết" section.
**Expected:** A 480px slide-out `QuickPreviewDrawer` opens on the right edge over the TaskDrawer, displaying the document markdown and backlinks, with a "Mở trong Docs" CTA button.
**Why human:** Multi-drawer z-index layering, backdrop dimming, and dismissal interactions require browser verification.

### Gaps Summary

No programmatic or architectural gaps found. All 18 must-have truths, 19 key artifacts, and 7 key links are fully implemented, wired, and verified with 93 passing unit/integration tests and clean production build. Status set to `human_needed` exclusively for the 3 browser UX verification flows listed above.

---

_Verified: 2026-10-04T16:27:00Z_
_Verifier: Claude (gsd-verifier)_
