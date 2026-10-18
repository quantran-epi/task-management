---
status: investigating
trigger: "AI trả lời không tìm thấy bằng chứng (confidence=unknown, claims=[]) nhưng vẫn bị gán citation"
created: 2026-10-18T10:00:00Z
updated: 2026-10-18T10:00:00Z
---

---
status: verifying
trigger: "AI trả lời không tìm thấy bằng chứng (confidence=unknown, claims=[]) nhưng vẫn bị gán citation"
created: 2026-10-18T10:00:00Z
updated: 2026-10-18T10:15:00Z
---

## Current Focus

hypothesis: Fallback attribution logic in normalizeRawGroundedOutput (groundedSynthesis.ts) and ChatMessageBubble.tsx blindly attached top citation S1 whenever claims were empty and lines didn't match promptEvidence tokens, even when confidence was 'unknown' or conclusion was an explicit no-evidence abstention.
test: Added test 35 in groundedSynthesis.test.ts and dedicated test in ChatMessageBubble.test.tsx.
expecting: All 34 test files in tests/ai/ pass; 0 citations attached/rendered on unknown/abstention responses.
next_action: Run tests and summarize root cause + fix.

## Symptoms

expected: Khi AI trả về confidence unknown, claims rỗng, hoặc không có bằng chứng, citations phải rỗng (không gán citation).
actual: UI hiển thị 1 citation dù conclusion nói không tìm thấy bằng chứng, claims=[].
errors: none
reproduction: Hỏi câu hỏi không có dữ liệu, LLM trả về confidence unknown, claims=[].
started: Sau commit ba0f060 / c076a1c / d74ef8a

## Eliminated

## Evidence

- timestamp: 2026-10-18T10:05:00Z
  checked: "groundedSynthesis.ts normalizeRawGroundedOutput lines 488-499"
  found: "When normalizedClaims is empty and lines don't match promptEvidence, else if branch forcibly appends [allowedCitationIds[0]] to obj.conclusion and generates a claim C1 with citationIds: [defaultCitationId], even when obj.confidence === 'unknown' or conclusion states no evidence."
  implication: "LLM response stating no evidence found is corrupted into asserting citation S1 supports the abstention statement."

- timestamp: 2026-10-18T10:08:00Z
  checked: "ChatMessageBubble.tsx lines 379, 421, 278"
  found: "When citedCitations is empty, activeCitations falls back to all g.citations. Then attributeLinesWithCitations falls back to appending [topCitation.citationId] to the last substantive line of conclusion, rendering [1] chip and Nguồn tài liệu section."
  implication: "Even if normalizer is fixed, UI bubble still injects spurious citation on any un-cited text."

## Resolution

root_cause: 1. In groundedSynthesis.ts normalizeRawGroundedOutput: fallback attribution branch blindly appended [allowedCitationIds[0]] and synthesized a claim C1 whenever claims was empty and conclusion lines produced no token matches against promptEvidence, regardless of whether confidence was 'unknown' or conclusion stated no evidence. 2. In ChatMessageBubble.tsx: when citedCitations was empty, activeCitations fell back to all retrieved g.citations, and attributeLinesWithCitations blindly appended [topCitation.citationId] to the last line of conclusion, rendering an inline [1] chip and 'Nguồn tài liệu' section.
fix: 1. In groundedSynthesis.ts: added isAbstentionAnswer detection (confidence === 'unknown' or conclusion matches no-evidence patterns). When true, clear claims, strip stray brackets from conclusion, delete citationReasons, and bypass step 8 attribution entirely. 2. In ChatMessageBubble.tsx: when isAbstention is true, set activeCitations to empty [], strip brackets, bypass attributeLinesWithCitations, and prevent rendering 'Nguồn tài liệu'. In attributeLinesWithCitations, early-return unchanged text when text matches no-evidence patterns.
verification: Verified via vitest in tests/ai/groundedSynthesis.test.ts (36/36 passed), tests/ai/ChatMessageBubble.test.tsx (19/19 passed), and all 34 test files in tests/ai/ (503 passed, 1 skipped).
files_changed:
  - "/Users/tranducquan/Working/Personal/task-management/src/services/ai/groundedSynthesis.ts"
  - "/Users/tranducquan/Working/Personal/task-management/src/components/ai/ChatMessageBubble.tsx"
  - "/Users/tranducquan/Working/Personal/task-management/tests/ai/groundedSynthesis.test.ts"
  - "/Users/tranducquan/Working/Personal/task-management/tests/ai/ChatMessageBubble.test.tsx"
