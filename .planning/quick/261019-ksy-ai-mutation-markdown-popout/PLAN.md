---
id: 261019-ksy
slug: ai-mutation-markdown-popout
description: Render markdown and add popout view for AI chat mutation confirmation
status: in_progress
created: 2026-10-19
---

# Quick Plan: Render Markdown & Popout for AI Mutation Confirmation

## Problem
Currently, in `ChatMessageList.tsx`, `pendingConfirmation.summary` is rendered as raw text in a `<div>`:
```tsx
<div style={{ fontSize: 13, ... }}>{pendingConfirmation.summary}</div>
```
When an AI mutation confirmation prompt contains Markdown formatting (lists, bold, code snippets, etc.), it displays raw text. Additionally, long confirmation summaries are hard to read inside the narrow chat drawer without an expanded popout/modal view.

## Goal
1. Render `pendingConfirmation.summary` with formatted safe Markdown using `renderSafeMarkdown`.
2. Add a popout/expand button on the confirmation card that opens a full modal/dialog with formatted Markdown and Yes/No action buttons.
3. Add/update tests covering the rendered markdown and popout interaction.

## Proposed Changes
1. `src/components/ai/ChatMessageList.tsx`:
   - Import `renderSafeMarkdown` from `../../utils/markdown`.
   - Import `Modal`, `Tooltip`, and expand/popout icon (e.g. `FullscreenOutlined` or `ExpandAltOutlined`) from antd / icons.
   - Add local state `isModalOpen` for the popout modal.
   - Render markdown cleanly inside the inline card using `dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(pendingConfirmation.summary) }}` with suitable container styling.
   - Add Popout button to open `Modal` displaying the rendered markdown content with full height/scrolling and confirmation buttons (Có / Không).
2. Tests:
   - Add test cases in `src/components/ai/__tests__/ChatMessageList.test.tsx` (or new test file) verifying markdown rendering and popout modal opening/confirming.
