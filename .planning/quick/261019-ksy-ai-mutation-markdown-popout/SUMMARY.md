---
id: 261019-ksy
slug: ai-mutation-markdown-popout
status: complete
completed: 2026-10-19
---

# Quick Task Summary: Render Markdown & Popout for AI Mutation Confirmation

## Completed Work
1. **Render Safe Markdown in Confirmation Card**:
   - Updated `ChatMessageList.tsx` to process `pendingConfirmation.summary` through `renderSafeMarkdown`.
   - Used `.chat-markdown-body` class for styled headings, lists, bold text, and code spans instead of raw unparsed strings.
2. **Popout Detail Modal**:
   - Added `ExpandAltOutlined` icon button on confirmation card header with tooltip "Mở rộng xem chi tiết".
   - Integrated full-featured Ant Design `Modal` (`isPopoutOpen`) to display large Markdown change plans with scrolling.
   - Provided "Có (Yes)" and "Không (No)" action buttons inside the modal footer to allow direct confirmation/rejection from modal view.
3. **Automated Verification**:
   - Added unit tests in `src/components/ai/__tests__/ChatMessageList.test.tsx` verifying HTML rendering of markdown elements (`<strong>`, `<code>`) and modal popout confirm/reject triggers.
   - All tests passing.
