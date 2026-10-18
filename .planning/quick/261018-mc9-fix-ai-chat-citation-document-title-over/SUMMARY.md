---
status: complete
date: 2026-10-18
quick_id: 261018-mc9
---

# Quick Task Summary: Fix AI Chat Citation Document Title Overflow

## Problem
In AI chat responses, when document titles were long, citation chips and source tags overflowed their container bounds or deformed table rows:
1. `ChatMessageBubble.tsx`: Tags in the "Nguồn tài liệu" block stretched beyond bubble bounds due to missing text truncation and max-width.
2. `SourcesPanel.tsx`: Table's `documentTitle` column custom renderer bypassed Ant Design's `ellipsis: true`, causing wide table horizontal blowout.
3. `CitationChip.tsx`: Legacy citation tag lacked `maxWidth` and text truncation. Tooltip popups lacked `wordBreak: break-word` for unbroken strings.

## Solution
1. `ChatMessageBubble.tsx`:
   - Added `maxWidth: 220`, `overflow: 'hidden'`, `textOverflow: 'ellipsis'`, `whiteSpace: 'nowrap'`, `display: 'inline-block'`, `verticalAlign: 'middle'` to citation `<Tag>`.
   - Added `wordBreak: 'break-word'` to the `<Tooltip>` preview container so unbroken long titles wrap properly.
2. `SourcesPanel.tsx`:
   - Updated table column render with `display: 'flex'`, `minWidth: 0`, inner text `overflow: 'hidden'`, `textOverflow: 'ellipsis'`, `whiteSpace: 'nowrap'`, and `flexShrink: 0` for the Local tag.
3. `CitationChip.tsx`:
   - Wrapped display label in a truncated `<span>` with `maxWidth: 200` on `<Tag>`.
   - Added `wordBreak: 'break-word'` to tooltip.

## Verification
- TypeScript check (`npx tsc --noEmit`): PASSED (no errors).
