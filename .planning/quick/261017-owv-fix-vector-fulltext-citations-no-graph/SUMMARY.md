---
id: 261017-owv
slug: fix-vector-fulltext-citations-no-graph
title: Fix grounded citation rendering and synthesis prompt for vector and fulltext when graph has no paths
status: complete
date: 2026-10-17
---

# Quick Task Summary: Fix Grounded Citation Rendering & Synthesis Prompt

## Completed Work
1. **`src/services/ai/groundedSynthesis.ts`**:
   - Updated `buildSystemPrompt`: Added explicit mandatory instruction that when EVIDENCE citations are available (even if `allowedPathIds` is empty or graph paths are absent), model must extract atomic claims with `classification: "DIRECT"` and valid `citationIds`. Mandated referencing citation tags `[S1]`, `[S2]` in `conclusion`.
   - Updated `normalizeRawGroundedOutput`:
     - Added inline text marker extraction `[S1]`, `[L1]` from `claim.text` if `citationIds` was empty or omitted by the LLM.
     - Added support for comma-separated citation strings like `"S1, S2"`.
2. **`src/components/ai/grounded/GroundedAnswerCard.tsx`**:
   - Added `renderProseWithCitations`: Parses inline `[S1]`, `[L1]` references inside `conclusion` into interactive clickable `CitationGroup` tags.
   - When `claims.length === 0` but `grounding.citations.length > 0`, renders an inline `Nguồn trích dẫn:` section with `CitationGroup` directly below the conclusion.
   - Restored `renderSecondaryCta` to display the "Tra cứu lại" button with `ReloadOutlined` icon when `onFreshLookup` is provided.
   - Enhanced `degradedList`: Explicitly annotates `Đồ thị (0 kết quả)` when `outcome === 'DEGRADED'` and graph returned 0 items despite `status: "ok"`.
3. **Tests**:
   - Added tests in `tests/ai/groundedSynthesis.test.ts` for inline `[S1]` extraction and comma-separated citation expansion.
   - Added tests in `tests/ai/GroundedAnswerCard.test.tsx` for inline conclusion citation parsing, inline source group display when claims is empty, and degraded modality annotation for 0-result graphs.
   - All 34 AI test suites (488 tests) pass.

## Verification
- `npx vitest run tests/ai/GroundedAnswerCard.test.tsx tests/ai/groundedSynthesis.test.ts` (64/64 passed)
- `npx vitest run tests/ai/` (488/488 passed)
