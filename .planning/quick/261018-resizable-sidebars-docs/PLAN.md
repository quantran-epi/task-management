---
id: 261018-resizable-sidebars-docs
title: add resizable sidebars to document page (folder tree, editor, table of contents)
status: in_progress
created_at: 2026-10-18
---

# Quick Plan: Resizable Sidebars for Document Page

## Context & Objectives
In the Document Page (`NotesView` / `DocFolderTree` / `DocEditorPane` / `DocOutlineToC`):
- The Left Column (`DocFolderTree`) has a fixed/narrow width (`width: 320, minWidth: 280, maxWidth: 380`), causing long folder/file names to truncate and preventing user flexibility.
- The Right Rail (`DocOutlineToC` in `DocEditorPane`) has a fixed width (`width: 180, minWidth: 160, maxWidth: 220`), causing heading text to truncate.
- Users need to drag to resize:
  1. The Left sidebar (`DocFolderTree` width: e.g. 200px - 600px, default 320px).
  2. The Right sidebar (`DocOutlineToC` width: e.g. 140px - 400px, default 180px).
- Also support double-click on splitter to reset to default, and persist widths in `localStorage`.

## Proposed Architecture
1. Reusable Splitter / Resize Handle component (`ResizeSplitter.tsx`):
   - Vertical divider handle with `cursor: col-resize`, subtle hover/active highlight.
   - Pointer events tracking (`onPointerDown`, `setPointerCapture`, `onPointerMove`, `onPointerUp`) to work smoothly across mouse and touch/trackpads without iframe or text-selection glitches.
   - Double-click callback to reset to default width.
2. Update `NotesView.tsx`:
   - State `treeWidth` initialized from `localStorage` (`taskmate_notes_tree_width`, default 320, clamped between 200 and 600).
   - Render `ResizeSplitter` between `DocFolderTree` and Column 2 (`DocEditorPane`).
   - Pass width or allow `DocFolderTree` to accept custom width.
3. Update `DocFolderTree.tsx`:
   - Accept optional `width` prop (defaulting to 320, remove hardcoded `maxWidth: 380` when controlled).
4. Update `DocEditorPane.tsx`:
   - State `tocWidth` initialized from `localStorage` (`taskmate_notes_toc_width`, default 180, clamped between 140 and 420).
   - Render `ResizeSplitter` between Editor/Preview area and `DocOutlineToC`.
   - Update `DocOutlineToC` container width to use `tocWidth`.
5. Automated Tests:
   - Test `ResizeSplitter` component interactions (dragging, min/max bounds, double-click reset).
   - Ensure existing tests in `DocFolderTree.test.tsx` and `DocEditorPane.test.tsx` continue passing.
