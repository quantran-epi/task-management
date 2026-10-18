# Quick Task: Fix AI Chat Citation Document Title Overflow

**Task ID:** `261018-mc9`
**Description:** Fix document title overflow in AI chat citations and source references.

## Root Cause
1. `src/components/ai/ChatMessageBubble.tsx`:
   - "Nguồn tài liệu" block renders `<Tag>` directly with `${label} ${c.documentTitle}` without `maxWidth`, `overflow: hidden`, `textOverflow: ellipsis`. Long titles cause Tag to stretch or break bubble layout.
2. `src/components/ai/grounded/SourcesPanel.tsx`:
   - `documentTitle` column sets `ellipsis: true`, but custom render wrapper (`<div><span>...</span></div>`) lacks flex/block truncation styling, breaking Ant Design Table ellipsis and causing horizontal table bloat.
3. `src/components/ai/CitationChip.tsx`:
   - Legacy display label `<Tag>` lacks `maxWidth`, `overflow: hidden`, and `textOverflow: ellipsis`. Tooltips lack `overflowWrap: break-word`.

## Implementation Plan
- **Task 1**: Update `ChatMessageBubble.tsx` to truncate document title inside `<Tag>` (maxWidth: 220px, textOverflow: ellipsis, overflow: hidden, whiteSpace: nowrap) while maintaining full title and relevance reason inside `<Tooltip>`. Add `wordBreak: break-word` in tooltip container.
- **Task 2**: Update `SourcesPanel.tsx` to handle title truncation properly in the table cell with flex layout, `minWidth: 0`, and `textOverflow: ellipsis`.
- **Task 3**: Update `CitationChip.tsx` to add `maxWidth: 200px` and ellipsis for legacy tag, and ensure tooltip content handles long unwrapped strings safely.
- **Task 4**: Verify with tests and build.
