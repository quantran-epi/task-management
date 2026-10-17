---
id: 261017-owv
slug: fix-vector-fulltext-citations-no-graph
title: Fix grounded citation rendering and synthesis prompt for vector and fulltext when graph has no paths
status: complete
date: 2026-10-17
---

# Quick Task Summary: Fix Grounded Citation Rendering & Synthesis Prompt

## Completed Work
1. **`src/services/ai/evidencePack.ts`**:
   - Added score-descending sorting for general `bucketD` candidate chunks before applying the 20-chunk prompt budget cap.
   - Prevents relevance starvation where higher-scoring chunks from other document sets (e.g. `Credit payment allocation` score 0.0325) were dropped at index 21+ (`BUDGET_EVIDENCE`).
2. **`src/services/ai/groundedSynthesis.ts`**:
   - Updated `buildSystemPrompt`: Mandated inline citations in `conclusion` prompt and few-shot example.
   - Updated `normalizeRawGroundedOutput`:
     - Added inline text marker extraction `[S1]`, `[L1]` from `claim.text` if `citationIds` was empty or omitted by the LLM.
     - Added support for comma-separated citation strings like `"S1, S2"`.
     - Added identifier-based attribution fallback: when LLM returns an empty `claims` array and text in `conclusion`, matches technical tokens against `promptEvidence` chunks to synthesize valid `DIRECT` claims and add `[S1]` tags deterministically.
3. **`src/components/ai/ChatMessageBubble.tsx`**:
   - Appended citation tags `[1]`, `[L1]` to rendered claims.
   - Rendered inline citation chips as interactive styled badges `<span class="grounded-inline-chip">` with click handlers that open the document preview drawer.
4. **`src/components/ai/grounded/GroundedAnswerCard.tsx`**:
   - Added `renderProseWithCitations`: Parses inline `[S1]`, `[L1]` references inside `conclusion` into interactive clickable `CitationGroup` tags.
   - When `claims.length === 0` but `grounding.citations.length > 0`, renders an inline `Nguồn trích dẫn:` section with `CitationGroup` directly below the conclusion.
   - Restored `renderSecondaryCta` to display the "Tra cứu lại" button with `ReloadOutlined` icon when `onFreshLookup` is provided.
   - Enhanced `degradedList`: Explicitly annotates `Đồ thị (0 kết quả)` when `outcome === 'DEGRADED'` and graph returned 0 items despite `status: "ok"`.
5. **Tests**:
   - Added test in `tests/ai/evidencePack.test.ts` for score-based budget packing precedence.
   - Added test in `tests/ai/groundedSynthesis.test.ts` for identifier-based claim attribution fallback.
   - Added tests in `tests/ai/ChatMessageBubble.test.tsx` for inline chip click activation.
   - Added tests in `tests/ai/GroundedAnswerCard.test.tsx` for inline conclusion citation parsing and degraded graph 0-item annotation.
   - All 34 AI test suites (491 tests) pass.

## Verification
- `npx vitest run tests/ai/evidencePack.test.ts tests/ai/groundedSynthesis.test.ts tests/ai/ChatMessageBubble.test.tsx tests/ai/GroundedAnswerCard.test.tsx` (all passed)
- `npx vitest run tests/ai/` (491/491 passed)
