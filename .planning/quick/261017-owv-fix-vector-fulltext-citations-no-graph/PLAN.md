---
id: 261017-owv
slug: fix-vector-fulltext-citations-no-graph
title: Fix grounded citation rendering and synthesis prompt for vector and fulltext when graph has no paths
status: in-progress
created_at: 2026-10-17T11:00:00.000Z
---

# Quick Plan: Fix grounded citation rendering and synthesis prompt for vector and fulltext when graph has no paths

## Goal
Ensure vector and fulltext search results reliably produce inline citations and visible evidence source chips even when graph returns 0 paths or no seed entities, and fix broken "Tra cứu lại" secondary action button on GroundedAnswerCard.

## Root Causes
1. `buildSystemPrompt` in `groundedSynthesis.ts`: Instructs the model to write executive summary into `conclusion`, but only strongly enforces `claims` when `pathId` (graph path) is present. When no graph paths exist (`allowedPathIds.length === 0`), model frequently writes everything in `conclusion` and leaves `claims: []` or forgets citation IDs.
2. `normalizeRawGroundedOutput`: If `claims` is empty or all claims had invalid citation IDs, it leaves `claims: []`.
3. `GroundedAnswerCard.tsx`: When `claims.length === 0`, it renders `<p>{displayAnswer.conclusion}</p>` without parsing inline `[S1]`, `[S2]` citation references into clickable `CitationChip` components, nor does it display an inline source citation group when claims are empty.
4. `GroundedAnswerCard.tsx`: `renderSecondaryCta` was set to `() => null`, breaking the "Tra cứu lại" (`onFreshLookup`) button on READY and DEGRADED states.
5. `GroundedBanner.tsx` / `GroundedAnswerCard.tsx`: When `outcome === 'DEGRADED'` but all modalities reported `status: 'ok'` (with graph having 0 items), `degradedList` was empty, causing degraded banner to show generic fallback message instead of clarifying that graph returned no paths.

## Proposed Changes
1. **`src/services/ai/groundedSynthesis.ts`**:
   - Update `buildSystemPrompt`: When `allowedPathIds` is empty or no graph paths exist, explicitly mandate generating atomic `claims` with `classification: "DIRECT"` and valid `citationIds`. Cấm trả về `claims: []` khi có tài liệu trích xuất.
   - Update `normalizeRawGroundedOutput`: When `claims` is empty but `allowedCitationIds` has items and `conclusion` has text:
     - Scan `conclusion` for citation markers `[S1]`, `[L1]` or sentence-level segments to form fallback `claims` referencing the cited/top sources.
2. **`src/components/ai/grounded/GroundedAnswerCard.tsx`**:
   - Render `conclusion` with inline parsed `CitationChip` for any `[S\d+]` or `[L\d+]` markers so users can click them directly.
   - If `claims.length === 0` but `grounding.citations.length > 0`, render an inline `CitationGroup` below `conclusion` so sources are immediately visible and interactive.
   - Restore `renderSecondaryCta` with "Tra cứu lại" button when `onFreshLookup` is provided.
   - Format `degradedList` to note "Đồ thị (0 kết quả)" when graph is OK but has 0 items and outcome is DEGRADED.
3. **Tests**:
   - Verify `tests/ai/groundedSynthesis.test.ts` and `tests/ai/GroundedAnswerCard.test.tsx` pass 100%.
   - Add test case verifying synthesis without graph paths generates direct claims with citations, and GroundedAnswerCard renders citations properly.
