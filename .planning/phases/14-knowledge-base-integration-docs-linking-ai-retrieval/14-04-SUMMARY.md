---
phase: 14-knowledge-base-integration-docs-linking-ai-retrieval
plan: 04
subsystem: ui
tags:
  - knowledge-base
  - 3-column-view
  - document-editor
  - outline-toc
  - backlinks
  - task-drawer
  - document-export
requires:
  - 14-02
  - 14-03
provides:
  - 3-column-docs-workspace
  - doc-folder-tree
  - doc-list-pane
  - doc-editor-pane
  - doc-outline-toc
  - backlinks-section
  - task-drawer-linked-knowledge
  - document-export-utilities
affects:
  - src/views/NotesView.tsx
  - src/components/notes/DocFolderTree.tsx
  - src/components/notes/DocListPane.tsx
  - src/components/notes/DocEditorPane.tsx
  - src/components/notes/DocOutlineToC.tsx
  - src/components/notes/BacklinksSection.tsx
  - src/components/tasks/TaskDrawer.tsx
  - src/components/tasks/LinkedKnowledgeSection.tsx
  - src/utils/documentExport.ts
  - src/validation/schemas.ts
tech-stack:
  added: []
  patterns:
    - 3-column document workspace layout with folder tree, search list, and split editor
    - Heading outline extraction using regex /^(#{1,3})\s+(.+)$/gm for smooth scroll ToC
    - 500ms debounced autosave with visual sync state indicator
    - Protective soft-delete to trash bin with backlinks count warning on hard delete
    - Two-way task-knowledge linking in TaskDrawer with slide-out QuickPreviewDrawer
    - Markdown frontmatter serialization and filename directory traversal sanitization
key-files:
  created:
    - src/components/notes/DocFolderTree.tsx
    - src/components/notes/DocListPane.tsx
    - src/components/notes/DocEditorPane.tsx
    - src/components/notes/DocOutlineToC.tsx
    - src/components/notes/BacklinksSection.tsx
    - src/components/tasks/LinkedKnowledgeSection.tsx
    - src/utils/documentExport.ts
    - tests/utils/documentExport.test.ts
  modified:
    - src/views/NotesView.tsx
    - src/components/tasks/TaskDrawer.tsx
    - src/validation/schemas.ts
    - tests/views/NotesView.test.tsx
    - tests/components/TaskDrawer.test.tsx
decisions:
  - "Preserve legacy sticky notes grid view via top toolbar Segmented toggle while defaulting to 3-column Docs workspace"
  - "Allow document UUIDs in task documentLinks validation schema for cross-entity reference integrity"
  - "Check active backlinks on permanent trash delete and prompt confirmation modal with affected backlinks count"
metrics:
  duration: "18m"
  completed_date: "2026-10-04"
---

# Phase 14 Plan 04: 3-Column Docs Workspace, TaskDrawer Integration & Export Summary

Unified 3-column Knowledge Base workspace (Folder Tree + Document List + Split Markdown Editor/Reader with ToC and Backlinks), TaskDrawer Linked Knowledge integration with QuickPreviewDrawer, and document export utilities.

## Key Accomplishments

1. **3-Column Document Workspace (`src/views/NotesView.tsx`)**:
   - Assembled responsive 3-column layout: `DocFolderTree` (~220px), `DocListPane` (~300px), and `DocEditorPane` (flex: 1).
   - Preserved backward-compatible Sticky Notes Grid view toggleable via Ant Design `Segmented` control, persisted in `localStorage['planner:docs_layout_view']`.
   - Loaded and filtered documents reactively with pinned notes prioritized on top.

2. **Folder Tree Navigation (`src/components/notes/DocFolderTree.tsx`)**:
   - Quick filters with dynamic counts: Inbox (unassigned parentId), Pinned, All Docs, Sticky Notes, and Trash (soft-deleted notes).
   - Multi-level folder tree with "+" new folder modal and document count badges.
   - Tag taxonomy cloud at the bottom allowing instant tag filtering.

3. **Document List & Sorting (`src/components/notes/DocListPane.tsx`)**:
   - Instant search across document title, body, and tags.
   - Sort dropdown supporting update time, title, and creation time.
   - Active document highlight with 3px `#4f46e5` left border and accent background tint.
   - Action dropdowns for Pin, Move to Folder, and Move to Trash.

4. **Split Markdown Editor & Outline ToC (`src/components/notes/DocEditorPane.tsx`, `DocOutlineToC.tsx`, `BacklinksSection.tsx`)**:
   - View mode switcher between Edit, Split View, and Preview.
   - 500ms debounced autosave with visual "Đã lưu lúc HH:mm:ss" indicator.
   - Dynamic Heading outline ToC (H1-H3) with smooth-scroll section jumping.
   - Integration with `SmartIngestionBanner` on external Markdown paste with 1-click "Áp dụng tất cả".
   - Collapsible `BacklinksSection` rendering referring tasks, projects, and other docs.
   - "Hỏi AI về tài liệu này" header action opening `AIChatDrawer` with scoped document context.

5. **TaskDrawer Linked Knowledge Integration (`src/components/tasks/LinkedKnowledgeSection.tsx`, `TaskDrawer.tsx`)**:
   - Mounted `LinkedKnowledgeSection` in TaskDrawer Details tab under "Tài liệu & ghi chú".
   - Populated linked documents from `documentLinks` and markdown wiki-links `[[doc:...]]`.
   - Click on document chip slides out `QuickPreviewDrawer` without losing active task editing state.

6. **Document Export & Sanitization (`src/utils/documentExport.ts`)**:
   - `exportDocumentAsMarkdown`: Generates `.md` file with YAML frontmatter (title, tags, created, updated, slug).
   - `exportAllDocumentsAsZip`: Bundles documents and attachments into a structured JSON archive.
   - `sanitizeFilename`: Strips directory traversal (`../`, `..\\`) and illegal characters (`[\/:*?"<>|]`) per T-14-07.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] Allow document UUID in task documentLinks schema**
- **Found during:** Task 2 execution
- **Issue:** `TaskInputSchema`'s `linkSchema` strictly checked for URL or file path regex, rejecting document UUID strings.
- **Fix:** Added `isValidUuid(val)` to `linkSchema` in `src/validation/schemas.ts`.
- **Files modified:** `src/validation/schemas.ts`
- **Commit:** `be60a84`

**2. [Rule 1 - Bug] Updated timerSegments test for Schema V9 and Note default type**
- **Found during:** Verification
- **Issue:** Pre-existing test `tests/timerSegments.test.ts` expected `v7Db.verno === 8` and `Note` without `type: 'quick_note'`.
- **Fix:** Updated expectation to `verno === 9` and added `type: 'quick_note'` in `validNote` mock.
- **Files modified:** `tests/timerSegments.test.ts`
- **Commit:** `d532149`

## Self-Check: PASSED
- `src/views/NotesView.tsx`: FOUND
- `src/components/notes/DocFolderTree.tsx`: FOUND
- `src/components/notes/DocListPane.tsx`: FOUND
- `src/components/notes/DocEditorPane.tsx`: FOUND
- `src/components/notes/DocOutlineToC.tsx`: FOUND
- `src/components/notes/BacklinksSection.tsx`: FOUND
- `src/components/tasks/LinkedKnowledgeSection.tsx`: FOUND
- `src/utils/documentExport.ts`: FOUND
- All commits recorded: `84f894f`, `be60a84`, `d532149`
