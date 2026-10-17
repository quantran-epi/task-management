---
id: 261017-dti-fix-document-tree-item-indentation
title: Fix Document Tree Item Indentation for Special Folders and Subfolders
date: 2026-10-17
status: in-progress
---

# Plan: Fix Document Tree Item Indentation in DocFolderTree

## Problem
In `DocFolderTree.tsx`, when special folders (`pinned`, `trash`, `quick_notes`, `root_docs`) or regular folders are opened, child documents inside render with insufficient indentation (`paddingLeft: 22px`). Because the parent folder header's icon sits at ~24px, the child document's file icon (~22px) appears slightly to the left of the parent folder's icon, breaking visual nesting hierarchy.

## Tasks
1. Adjust indentation in `DocFolderTree.tsx`:
   - Set `paddingLeft` in `renderDocItem` to `depth === 0 ? 8 : 34 + (depth - 1) * 16` so depth 1 documents clearly indent past parent icons (~34px).
   - Update `renderSpecialFolder` empty text and "Xem thêm" button padding/margins to match (`paddingLeft: 34px`, `marginLeft: 34px`).
   - Align `renderFolderNode` folder item `paddingLeft` and "Xem thêm" margin with standard 16px step.
2. Verify with unit tests in `tests/components/notes/DocFolderTree.test.tsx`.
