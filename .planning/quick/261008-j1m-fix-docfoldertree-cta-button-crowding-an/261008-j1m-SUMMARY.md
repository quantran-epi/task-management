---
phase: quick
plan: 261008-j1m
status: complete
date: 2026-10-08
summary: "Fixed DocFolderTree top CTA button crowding by adding flexShrink: 0 to icon buttons, minWidth: 0 to primary button, and increasing panel width from 240px to 260px"
requirements: [QUICK-261008-J1M]
files_modified:
  - src/components/notes/DocFolderTree.tsx
  - src/views/NotesView.tsx
---

# Quick Task 261008-j1m: Fix DocFolderTree CTA Button Crowding and Panel Width

## Changes Made
1. **`src/components/notes/DocFolderTree.tsx`**:
   - Expanded panel `width` and `minWidth` from `240` to `260` for better breathing room.
   - Added `flexShrink: 0` to both icon buttons (`<FolderAddOutlined />` root folder creation and `<UploadOutlined />` zip import) so they cannot be crushed or distorted.
   - Enhanced primary button flex resilience with `minWidth: 0`, `padding: '4px 8px'`, `overflow: 'hidden'`, `textOverflow: 'ellipsis'`, and `whiteSpace: 'nowrap'` so "Tạo ghi chú nhanh" fits cleanly without pushing sibling buttons.
2. **`src/views/NotesView.tsx`**:
   - Updated layout comment to reflect `~260px` tree panel width.

## Verification
- Ran `npx vitest run tests/components/notes/DocFolderTree.test.tsx tests/views/NotesView.test.tsx` -> 2 test files passed (13/13 tests).
