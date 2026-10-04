# Quick Task 261004-fdc: Fix Docs Entity Detection, Title Auto-detection, Markdown Viewer Syntax, and Folder Creation Summary

Fixed 4 issues across document management and AI chat markdown rendering.

## Key Changes

1. **Entity Detection Word Boundaries (`smartIngestion.ts`)**:
   - Replaced raw substring `.includes()` with `matchesWholePhrase` using Unicode word lookaround `(?<![\p{L}\p{N}_])phrase(?![[\p{L}\p{N}_])` with case insensitivity.
   - Eliminated false matches for short project/task/milestone acronyms (e.g. "MPA" matching inside "company", "campaign", "impact").

2. **Auto-detect Document Title (`smartIngestion.ts`, `DocEditorPane.tsx`)**:
   - Added `isPlaceholderTitle` helper recognizing default doc titles ("Tài liệu mới", "Untitled", "New Document", etc.).
   - Improved H1 extraction regex in `extractMarkdownMetadata` to support formatting (`# **Title**`), trailing hashes (`# Title #`), and unspaced `#Title`.
   - Wired auto-detection into both `handlePaste` and `handleBodyChange` so typing or pasting `# Heading` fills the document title when title is empty or placeholder, while preserving manually edited custom titles via `isTitleManuallyEditedRef`.

3. **Markdown Viewer Extensions (`markdown.ts`, `markdown.css`, `ChatMessageBubble.tsx`)**:
   - Added full GFM table parsing with column alignment (`:---`, `:---:`, `---:`) and responsive scrollable container `.markdown-table-wrapper`.
   - Added nested list support with indentation tracking across levels.
   - Added standard web image support `![alt](url)` with dangerous protocol blocking alongside attachment images.
   - Added autolinks (`<https://...>` and bare URLs) with protection against double-linking inside HTML tags.
   - Wrapped fenced code blocks in `.code-block-wrapper` with language header tag and 1-click clipboard copy button.
   - Handled paragraph soft breaks with `<br />` instead of breaking into multiple `<p>` tags.

4. **Folder Creation Fix (`schemas.ts`, `schemaV9.test.ts`)**:
   - Changed `body` validation in `NoteInputSchema` and `NoteUpdateSchema` from `min(1)` to `max(50000).default('')` so folders created with `body: ''` pass validation cleanly without errors.

## Verification

- `npx tsc --noEmit`: 0 errors.
- `npx vitest run tests/utils/smartIngestion.test.ts tests/ai/markdown.test.ts tests/db/schemaV9.test.ts`: 34/34 passed (3 test files).
