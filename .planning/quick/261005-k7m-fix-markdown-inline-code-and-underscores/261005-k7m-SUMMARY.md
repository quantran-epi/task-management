---
phase: quick
plan: 261005-k7m
status: complete
date: 2026-10-05
files_modified:
  - src/utils/markdown.ts
  - tests/utils/markdown.test.ts
---

# Quick Task Summary: Fix Markdown Inline Code & Underscore Italic Corruption

## Outcome
Fixed inline code tokenization and intra-word underscore boundary checks in `renderSafeMarkdown`.

## What Changed
1. `src/utils/markdown.ts`:
   - Tokenized and protected inline code spans (including multi-backtick spans `` `code` `` and `` ``code`` ``) before any other inline formatting rules run.
   - Replaced inline code with sentinel tokens (`\x00INLINE_CODE_${idx}\x00`) so that bold, italic, strikethrough, links, wiki-links, and autolinking do not touch code content.
   - Added CommonMark word-boundary lookarounds for `_` italic and `__` bold (`(?<=^|[^\w])` and `(?=[^\w]|$)`) so intra-word identifiers (e.g., `T_TRANS_TYPE`, `SVFE_SHB`, `user_id`) remain intact and never trigger italics or lose underscores.
   - Added non-whitespace boundary checks for `*` italic (`/\*(?!\s)([^\n*]+?)(?<!\s)\*/g`) and `**` bold to prevent math multiplication (e.g. `2 * 3 * 4`) from triggering italics.
   - Restored inline code tokens at the end of inline formatting.
2. `tests/utils/markdown.test.ts`:
   - Added 17 unit tests verifying inline code protection, intra-word underscores, dunder methods, math asterisks, fenced code blocks, and table cells.

## Verification
- `npx vitest run tests/utils/markdown.test.ts`: 17 passed.
- `npx vitest run tests/ai/AIChatDrawer.test.tsx`: 20 passed.
- `npx tsc --noEmit`: 0 errors.
