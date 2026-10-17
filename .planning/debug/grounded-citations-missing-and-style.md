---
status: resolved
trigger: "Investigate and fix two issues in TaskMate AI Chat: 1. When a question has no graph paths (only vector/fulltext retrieval), citations still do not appear in the assistant answer. 2. When a question has graph data, citations have inconsistent styling (some have dark blue borders, some are gray)."
created: 2026-10-17T12:00:00Z
updated: 2026-10-17T13:00:00Z
---

## Current Focus

hypothesis: "1. Missing citations in vector/fulltext answers occur because token extraction in attributeLinesWithCitations and findBestMatchingCitation uses ASCII-only [A-Za-z0-9_#$]{4,} requiring score >= 2, which drops Vietnamese characters and fails general words, leaving answers with 0 citation markers; furthermore there is no guaranteed fallback when line scoring produces 0 matches. 2. Inconsistent citation tag borders occur because ChatMessageBubble uses conditional border styling: isCited ? (isLocal ? token.colorBorder : '#1677ff') : token.colorBorderSecondary, causing uncited or local citations to be gray and remote cited citations to be dark blue."
test: "Refactor attributeLinesWithCitations and findBestMatchingCitation with unicode token matching and robust fallback attribution. Unify Tag border styling to theme primary tokens."
expecting: "Inline chips always appear in answer body even for pure vector/fulltext retrieval; all citation tags have consistent primary border and background."
next_action: "All 34 test files in tests/ai/ pass (494 passed). Present diagnosis and verification."

reasoning_checkpoint:
  hypothesis: "1. Missing citations in vector/fulltext answers occur because token extraction in attributeLinesWithCitations and findBestMatchingCitation uses ASCII-only [A-Za-z0-9_#$]{4,} requiring score >= 2, which drops Vietnamese characters and fails general words, leaving answers with 0 citation markers; furthermore there is no guaranteed fallback when line scoring produces 0 matches. 2. Inconsistent citation tag borders occur because ChatMessageBubble uses conditional border styling: isCited ? (isLocal ? token.colorBorder : '#1677ff') : token.colorBorderSecondary, causing uncited or local citations to be gray and remote cited citations to be dark blue."
  confirming_evidence:
    - "ChatMessageBubble.tsx line 457 explicitly sets '#1677ff' vs token.colorBorder vs token.colorBorderSecondary"
    - "attributeLinesWithCitations line 220 matches [A-Za-z0-9_#$]{4,}, which drops Vietnamese diacritics and returns 0 tokens for standard sentences"
    - "ChatMessageBubble lines 347-366 does not render any .grounded-inline-chip if attributeLinesWithCitations fails"
  falsification_test: "Run tests with Vietnamese text and vector citations: without fix, 0 chips appear; with fix, chips [1], [2] appear and all tags have identical primary border."
  fix_rationale: "Replacing ASCII regex with Unicode property escapes [\\p{L}\\p{N}_#$-]{2,}u, lowering match threshold to score >= 1, adding a fallback to attribute the primary citation if no lines matched, and unifying all citation Tag borders to token.colorPrimaryBorder / token.colorPrimary solves both issues at their source."
  blind_spots: "Ensure existing test cases (SQL packages 60000004, etc.) continue to pass, ensure multi-citation mapping (S1->[1], L1->[L1]) remains intact."

## Symptoms

expected: "Citations appear in assistant answer body even when 0 graph paths exist (vector/fulltext only). All citation tags have consistent visual styling."
actual: "No citations appear in answer body for pure vector/fulltext questions. In graph questions, some citation tags have dark blue borders, while others have gray borders."
errors: "None - silent UX degradation and inconsistent tag styling."
reproduction: "Ask question matching only vector/fulltext chunks without SQL package names; observe answer body lacks [1] chips. Ask graph question; observe Nguồn tài liệu has mixed blue and gray borders."
started: "Phase 19-20 grounded chat wiring."

## Eliminated

- hypothesis: "GroundedAnswerCard is the component rendering the assistant response in AIChatDrawer."
  evidence: "AIChatDrawer renders ChatMessageList which renders ChatMessageBubble. ChatMessageBubble lines 310-539 intercepts all assistant messages with msg.grounding.answer and renders an inline bubble, never reaching GroundedAnswerCard."
  timestamp: 2026-10-17T12:20:00Z

## Evidence

- timestamp: 2026-10-17T12:22:00Z
  checked: "ChatMessageBubble.tsx lines 457-463"
  found: "Tag border is dynamically set to '#1677ff' (dark blue) when isCited && !isLocal, but token.colorBorder (gray) when isLocal, and token.colorBorderSecondary (gray) when !isCited."
  implication: "When graph paths retrieve multiple citations but only a subset are explicitly cited in claims, uncited citations get gray borders while cited ones get dark blue. Also local citations get gray borders. This directly causes the 'cái thì viền xanh đậm, cái thì màu xám' symptom."

- timestamp: 2026-10-17T12:25:00Z
  checked: "ChatMessageBubble.tsx lines 204-245 attributeLinesWithCitations"
  found: "Token extraction uses regex /[A-Za-z0-9_#$]{4,}/g which completely drops all Vietnamese characters with diacritics (à, á, ẻ, ã, ạ, etc.) resulting in 0 tokens for Vietnamese sentences. Also text-level early return if /\[(S|L)?\d+\]/i matches anywhere in text, including numbers like [2024]."
  implication: "For Vietnamese queries or general summaries without SQL package names, attributeLinesWithCitations scores 0 and attaches zero citations. If the LLM omitted [S1], the conclusion remains un-attributed and 0 citation chips render."

- timestamp: 2026-10-17T12:28:00Z
  checked: "groundedSynthesis.ts lines 156-186 findBestMatchingCitation and lines 425-469 normalizeRawGroundedOutput"
  found: "Same regex /[A-Za-z0-9_#$]{4,}/g and score >= 2 requirement exists in synthesis normalization fallback. If the model returns no claims and no brackets in conclusion, fallback fails on Vietnamese/plain text."
  implication: "Synthesis normalizer also fails to attribute plain text / Vietnamese answers, leaving conclusion without [S1] and claims empty."

## Resolution

root_cause: "1. Token matching regex in attributeLinesWithCitations (ChatMessageBubble.tsx) and findBestMatchingCitation (groundedSynthesis.ts) used ASCII-only [A-Za-z0-9_#$]{4,} requiring score >= 2, which dropped Vietnamese accented letters and failed general terms, leaving vector/fulltext answers without inline citation markers, with no fallback. 2. ChatMessageBubble lines 457-463 used conditional border styling: isCited ? (isLocal ? token.colorBorder : '#1677ff') : token.colorBorderSecondary, causing uncited or local citations to have gray borders while cited server citations had dark blue borders in Nguồn tài liệu."
fix: "1. Updated token extraction to Unicode word patterns [\\p{L}\\p{N}_#$-]{2,}u in ChatMessageBubble.tsx and groundedSynthesis.ts with stop word filtering and score >= 1. Added guaranteed attribution fallback in both normalizer and ChatMessageBubble so whenever citations exist in the pack, answer body is guaranteed to display inline citation chips. 2. Unified citation tag styling in ChatMessageBubble.tsx to Ant Design theme tokens (token.colorPrimaryBorder, token.colorPrimaryBg, token.colorPrimary), making all tags consistent."
verification: "34 test suites in tests/ai/ passed (494 tests passing, 0 failures), including dedicated tests for Vietnamese vector-only citations, number preservation ([2024]), and 100% unified tag border and background styling."
files_changed:
  - "/Users/tranducquan/Working/Personal/task-management/src/components/ai/ChatMessageBubble.tsx"
  - "/Users/tranducquan/Working/Personal/task-management/src/services/ai/groundedSynthesis.ts"
  - "/Users/tranducquan/Working/Personal/task-management/tests/ai/ChatMessageBubble.test.tsx"
