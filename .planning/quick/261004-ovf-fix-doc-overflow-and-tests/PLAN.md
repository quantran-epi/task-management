# Quick Plan: Fix Doc Detail Width Overflow and Vitest Failures

## Context
1. Docs view layout issue: Viewing some documents causes editor width to expand beyond the viewport, causing the table of contents rail to overflow and pushing header tool buttons off-screen. Root cause: flexbox child missing `minWidth: 0` constraints, allowing wide child elements (unbroken code, tables, images, long text) in the preview/editor to blow out container width, combined with missing flex shrink constraints on columns and missing `.markdown-rendered-view` width/word-break styles.
2. Vitest failure 1 (`tests/ai/aiTools.test.ts`): Tool count assertion expected 43, but `generate_file` was recently added bringing count to 44.
3. Vitest failure 2 (`tests/components/notes/DocFolderTree.test.tsx`): Test looked for `.anticon-folder` on all buttons to find create-folder button (now `<FolderAddOutlined />` with class `.anticon-folder-add`), mistakenly matching folder row and failing to find modal title `Tạo thư mục mới` and submit button `Tạo thư mục`.

## Proposed Changes
1. **`src/components/notes/DocEditorPane.tsx`**:
   - Add `minWidth: 0, width: '100%', maxWidth: '100%', overflow: 'hidden'` to container.
   - Add `minWidth: 0` to main content area, editor area, and preview area.
   - Prevent header tool buttons from wrapping or hiding with `flexShrink: 0` on actions `<Space>`.
   - Ensure ToC rail has `flexShrink: 0, overflowX: 'hidden'`.
   - Set `.markdown-rendered-view` to `width: '100%', maxWidth: '100%', wordBreak: 'break-word', overflowWrap: 'break-word'`.

2. **`src/styles/markdown.css`**:
   - Scope and include `.markdown-rendered-view` alongside `.chat-markdown-body` for code blocks, tables, images, pre tags, and general markdown formatting so they conform to `max-width: 100%` and `overflow-x: auto`.

3. **`src/views/NotesView.tsx` & layout components**:
   - Ensure `DocFolderTree` and `DocListPane` have `flexShrink: 0` in `docs-3column-layout`.

4. **`tests/ai/aiTools.test.ts`**:
   - Update expected tool count from 43 to 44 and verify `generate_file` is among declared tools.

5. **`tests/components/notes/DocFolderTree.test.tsx`**:
   - Fix folder create button query to target `FolderAddOutlined` (`.anticon-folder-add` or tooltip/aria-label) and match `Tạo thư mục` submit button.

## Verification
- Run `npx vitest run tests/components/notes/DocFolderTree.test.tsx tests/ai/aiTools.test.ts`.
- Run full test suite or relevant doc tests to ensure zero regressions.
