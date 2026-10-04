---
status: testing
phase: 14-knowledge-base-integration-docs-linking-ai-retrieval
source: [14-VERIFICATION.md]
started: 2026-10-04T16:28:00Z
updated: 2026-10-04T16:28:00Z
---

## Current Test

number: 1
name: Open Notes & Docs view and test 3-column workspace layout
expected: |
  View displays 3 responsive columns: Folder Tree (~220px), Document List (~300px), and Split Markdown Editor/Preview. Switching to Grid mode via Segmented control toggles back to classic sticky notes card grid.
awaiting: user response

## Tests

### 1. Open Notes & Docs view and test 3-column workspace layout
expected: View displays 3 responsive columns: Folder Tree (~220px), Document List (~300px), and Split Markdown Editor/Preview. Switching to Grid mode via Segmented control toggles back to classic sticky notes card grid.
result: [pending]

### 2. Paste markdown with Jira keys and test Smart Ingestion flow
expected: DocEditorPane displays '💡 Gợi ý liên kết liên quan' banner with detected Jira keys/tasks; clicking 'Áp dụng tất cả' inserts bidirectional wiki-links and updates backlinks.
result: [pending]

### 3. Open TaskDrawer on a task with linked docs and launch QuickPreviewDrawer
expected: TaskDrawer renders 'Tài liệu & Tri thức liên kết' section with doc pills; clicking a doc pill opens 480px QuickPreviewDrawer on right side without closing TaskDrawer.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
