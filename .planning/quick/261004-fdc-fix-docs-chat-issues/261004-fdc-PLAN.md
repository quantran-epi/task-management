---
id: 261004-fdc
slug: fix-docs-chat-issues
title: Fix Docs Entity Detection, Title Auto-detection, Markdown Viewer Syntax, and Folder Creation
date: 2026-10-04
status: in-progress
---

# Fix 4 Docs and Chat Issues

## Objectives
1. **Entity Detection Word Boundaries (`smartIngestion.ts`)**: Prevent substring false positives (e.g., project "MPA" matching inside "company", "impact", "campaign") by enforcing Unicode word boundary checks for projects, tasks, and milestones.
2. **Auto-detect Doc Title (`DocEditorPane.tsx`)**: Ensure `# Heading` in markdown auto-populates doc title when doc has default/placeholder title ("Tài liệu mới", "Untitled", etc.) or is empty, on both paste and content edit.
3. **Markdown Viewer Full GFM Support (`markdown.ts`, `markdown.css`, `ChatMessageBubble.tsx`)**:
   - GFM tables with column alignment (`:---`, `:---:`, `---:`)
   - Nested lists with 2-4 space indentation
   - Standard web images (`![alt](https://...)`) with safe URL checks alongside attachment images
   - Autolinks (`<https://...>` and bare URLs)
   - Code block copy action and styling
4. **Folder Creation Fix (`schemas.ts`, `NotesView.tsx`)**: Allow empty/optional `body` in `NoteInputSchema` and `NoteUpdateSchema` so creating a folder with `body: ''` does not fail Zod validation.

## Tasks
- [x] Task 1: Update `src/validation/schemas.ts` to allow empty body in NoteInputSchema and NoteUpdateSchema; verify folder creation in `src/views/NotesView.tsx`.
- [x] Task 2: Refactor `src/utils/smartIngestion.ts` to use Unicode word boundaries for project/milestone/task name matching.
- [x] Task 3: Enhance `src/components/notes/DocEditorPane.tsx` to detect `# Heading` and auto-fill doc title when current title is empty or placeholder.
- [x] Task 4: Extend `src/utils/markdown.ts` and `src/styles/markdown.css` with GFM tables, nested lists, web images, autolinks, and copy support.
- [x] Task 5: Run only related tests (`tests/utils/smartIngestion.test.ts`, `tests/ai/markdown.test.ts`, `tests/db/schemaV9.test.ts`), add new test cases covering all 4 issues, and verify build.
