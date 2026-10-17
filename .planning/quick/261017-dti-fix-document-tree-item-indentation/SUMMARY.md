---
id: 261017-dti-fix-document-tree-item-indentation
title: Fix Document Tree Item Indentation for Special Folders and Subfolders
date: 2026-10-17
status: complete
---

# Summary: Fix Document Tree Item Indentation

## What Changed
- In `src/components/notes/DocFolderTree.tsx`:
  - Increased `paddingLeft` of `renderDocItem` from `22px` to `34px` for `depth >= 1` (`34 + (depth - 1) * 16`).
  - Updated `renderSpecialFolder` empty state ("Trống") and "Xem thêm" button padding/margin to `34px` to match child items.
  - Aligned `renderFolderNode` folder row `paddingLeft` and "Xem thêm" margin to standard 16px steps.
- In `tests/components/notes/DocFolderTree.test.tsx`:
  - Added unit test asserting `paddingLeft: 34px` on documents inside special folders (`pinned`, `trash`).

## Verification
- `npm run test -- tests/components/notes/DocFolderTree.test.tsx` passed (9/9 tests).
- `npm run test -- tests/views/NotesView.test.tsx` passed (8/8 tests).
