---
id: 261018-resizable-sidebars-docs
title: add resizable sidebars to document page (folder tree, editor, table of contents)
status: complete
date: 2026-10-18
---

# Quick Summary: Resizable Sidebars for Document Page

## What Was Done
1. **Created `ResizeSplitter` (`src/components/common/ResizeSplitter.tsx`)**:
   - Resizable divider with standard accessibility (`role="separator"`, `aria-orientation="vertical"`).
   - Smooth pointer capture (`onPointerDown`, `setPointerCapture`, `onPointerMove`, `onPointerUp`).
   - Supports both `side="left"` (dragging right grows pane) and `side="right"` (dragging left grows pane).
   - Bounds clamping between `minWidth` and `maxWidth`.
   - Double-click to reset width back to default.
2. **Updated `DocFolderTree` & `NotesView`**:
   - `DocFolderTree` accepts customizable `width` prop.
   - `NotesView` adds `ResizeSplitter` between Folder Tree and Editor Workspace.
   - Folder tree width bounds: 220px - 600px (default 320px).
   - Persisted in `localStorage` under `planner:docs_tree_width`.
3. **Updated `DocEditorPane`**:
   - Adds `ResizeSplitter` between Editor/Preview area and Table of Contents (ToC) Rail when ToC is visible and headings exist.
   - ToC rail width bounds: 140px - 420px (default 200px).
   - Persisted in `localStorage` under `planner:docs_toc_width`.
4. **Automated Testing & Build Verification**:
   - Created comprehensive unit tests in `tests/components/common/ResizeSplitter.test.tsx` (drag resize, bounds clamping, inverted right side, double-click reset).
   - Added persistence & splitter tests in `tests/views/NotesView.test.tsx` and `tests/components/notes/DocEditorPane.test.tsx`.
   - Verified clean typecheck and production build (`tsc && vite build`).
