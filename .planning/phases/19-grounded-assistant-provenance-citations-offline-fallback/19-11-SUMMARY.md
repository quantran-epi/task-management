# Phase 19 Plan 11: Core Grounded-Answer Card Family Summary

**Grounded card component family implemented with answer-first layout, inline citations, D-26 override safe render guard, and neutral scope-variation routing.**

## Execution Details

- **Phase:** 19-grounded-assistant-provenance-citations-offline-fallback
- **Plan:** 11
- **Subsystem:** ai-grounded-components
- **Status:** Complete
- **Completed Date:** 2026-10-11

## Key Artifacts Produced

1. **`src/components/ai/CitationChip.tsx`**
   - Extended with `index`, `source` (`'server' | 'local'`), `evidenceClass`, `range`, `snapshotId`, `publishedContentHash`.
   - Server renders compact `[N]` with primary theme color; local renders `[LN]` with visible `Local` tag (D-21/D-42).
   - Tooltips show truncated 7-char snapshot ID or local unpublished warning.
   - Retains keyboard navigation (Enter/Space) and accessible labels.

2. **`src/components/ai/grounded/CitationGroup.tsx`**
   - Renders deduplicated inline citation chips ordered by citation index and authority with 4px gap.

3. **`src/components/ai/grounded/GroundedBanner.tsx`**
   - Single component mapping all outcome variants (`local`, `degraded`, `conflict`, `snapshot-mismatch`, `auth-error`, `invalid-response`, `config-error`, `model-unavailable`, `invalid-grounded-output`) to Ant Design `Alert`.
   - Uses `role="alert"` for conflict and snapshot-mismatch.
   - Renders optional repair CTAs with semantic theme tokens.

4. **`src/components/ai/grounded/ClaimBlock.tsx`**
   - Implements D-26 invalid-state gate: claims asserting override/supersede language without backing `SUPERSEDES` conflict proof or allowed evidence kinds render safe synthesis error alert (`claim-block--invalid`) and suppress claim prose.
   - Renders inline prose followed immediately by `CitationGroup`.
   - Renders `INFERRED` dashed badge with `Suy luận:` prefix for inferred claims.
   - Computes weakest classification badge with tooltip for direct claims.

5. **`src/components/ai/grounded/ScopeVariationCard.tsx`**
   - Renders neutral non-destructive card for proven scope variation (`EXTENDS` or `SUPPLEMENTS` with known dimension) per D-25/D-27.
   - Never uses `role="alert"`; labeled "Khác biệt theo môi trường/phiên bản/hành vi".

6. **`src/components/ai/grounded/GroundedAnswerCard.tsx`**
   - Top-level container branching on 12 `ChatMessageGrounding.outcome` values.
   - Implements progressive disclosure via `Collapse` panels for paths, sources, and diagnostics.
   - Renders secondary action "Tra cứu lại" (`onFreshLookup`).

7. **Test Suites**
   - `tests/ai/CitationChipAndQuickPreview.test.tsx`: 11 unit tests for legacy mode, local/server chips, tooltip truncation, and keyboard activation.
   - `tests/ai/GroundedAnswerCard.test.tsx`: 22 test scenarios covering all 12 outcome states, D-26 invalid guard, D-25/D-27 scope variation card, and accessibility.

## Verification

- Automated test run: `npm test -- tests/ai/GroundedAnswerCard.test.tsx tests/ai/CitationChipAndQuickPreview.test.tsx` (33/33 tests passing).
- Production build: `npm run build` completed successfully without type errors.

## Commits

- `a99880d`: feat(19-11): extend CitationChip and create CitationGroup and GroundedBanner
- `f71dfb7`: feat(19-11): implement ClaimBlock, ScopeVariationCard, and GroundedAnswerCard

## Self-Check: PASSED
- `src/components/ai/CitationChip.tsx`: FOUND
- `src/components/ai/grounded/CitationGroup.tsx`: FOUND
- `src/components/ai/grounded/GroundedBanner.tsx`: FOUND
- `src/components/ai/grounded/ClaimBlock.tsx`: FOUND
- `src/components/ai/grounded/ScopeVariationCard.tsx`: FOUND
- `src/components/ai/grounded/GroundedAnswerCard.tsx`: FOUND
- `tests/ai/GroundedAnswerCard.test.tsx`: FOUND
- `tests/ai/CitationChipAndQuickPreview.test.tsx`: FOUND
