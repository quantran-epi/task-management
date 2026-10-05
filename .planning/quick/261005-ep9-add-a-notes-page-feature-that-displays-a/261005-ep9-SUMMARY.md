# Quick Task 261005-ep9 Summary

**Description:** Add a Notes-page feature that displays a reusable AI instruction prompt users can copy into external AI agents to generate Markdown optimized for PlannerMate knowledge retrieval.
**Date:** 2026-10-05
**Status:** complete

## Key Changes
1. Added reusable external AI prompt constant `AI_KNOWLEDGE_DOC_PROMPT` in `src/views/NotesView.tsx`.
   - Enforces first H1 title, inline hashtags, 1 topic per document, meaningful H2/H3 sections, self-contained blocks (~1500 chars), explicit search keywords, absolute dates, Sources section, no YAML frontmatter dependency, and no secrets.
2. Added visible header action button "Prompt AI cho tài liệu" (`RobotOutlined`) on NotesView header.
3. Added Ant Design Modal with monospace read-only text area and accessible one-click copy button (`CopyOutlined`) with Ant Design `message.success`/`message.error` feedback.
4. Added targeted test coverage in `tests/views/NotesView.test.tsx` verifying visible button, modal open, required retrieval rules in prompt, clipboard write, and copy feedback.

## Verification
- Targeted test run: `npx vitest run tests/views/NotesView.test.tsx` -> 5 passed.
