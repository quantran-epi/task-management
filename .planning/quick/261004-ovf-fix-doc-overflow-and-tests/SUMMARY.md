---
status: complete
date: 2026-10-04
task: fix-doc-overflow-and-tests
---

# Quick Task Summary: Fix Doc Detail Width Overflow and Vitest Failures

## What Was Done
1. **Resolved Doc Editor Width Overflow and Header Tool Button Disappearance**:
   - Fixed missing `minWidth: 0` on flex items across `DocEditorPane.tsx`, its main content container, editor area, preview area, and title input so wide content (long unbroken strings, wide code blocks, tables, images) cannot expand the flex item beyond its parent container width.
   - Enforced `max-width: 100%`, `overflow-x: hidden`, `word-break: break-word`, and `overflow-wrap: break-word` on `.markdown-rendered-view`.
   - Prevented header tool buttons from wrapping or hiding with `flexShrink: 0, wrap: false` on toolbar actions `<Space>`.
   - Prevented ToC rail from collapsing or overflowing with `flexShrink: 0, overflowX: 'hidden'`.
   - Added `flexShrink: 0` to `DocFolderTree` and `DocListPane` to protect side columns against shrinkage.
   - Updated `src/styles/markdown.css` to include `.markdown-rendered-view` for scoped styling of tables (`overflow-x: auto; max-width: 100%`), code blocks (`overflow-x: auto; max-width: 100%`), and images (`max-width: 100%; height: auto`).

2. **Fixed Vitest Failures**:
   - `tests/ai/aiTools.test.ts`: Updated `AI_DATABASE_TOOLS` expected count from 43 to 44 and verified `generate_file` tool registration.
   - `tests/components/notes/DocFolderTree.test.tsx`: Corrected selector to find `<FolderAddOutlined />` (`.anticon-folder-add`), match modal title, placeholder, and submit button `Tạo thư mục`, and assert handler called with folder name and `undefined` parent ID.

## Verification
- `npx vitest run tests/components/notes/DocFolderTree.test.tsx tests/ai/aiTools.test.ts` passed (41/41).
- `npx vitest run tests/components/notes/ tests/ai/` passed (20 test files, 179 tests).
- `npm run build` succeeded cleanly with TypeScript checks.
