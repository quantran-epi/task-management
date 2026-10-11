---
phase: 19-grounded-assistant-provenance-citations-offline-fallback
plan: 12
subsystem: ui-grounded-cards
tags: [grounded-cards, graph-path, sources-panel, diagnostics, candidate-chips, scope-chips, evidence-only]
dependency_graph:
  requires: [19-02, 19-10, 19-11]
  provides: [19-14]
  affects: [AIChatDrawer, GroundedAnswerCard]
tech_stack:
  added: []
  patterns: [snapshot-grouped-paths, neutral-variation-vs-conflict-containers, range-deduped-sources, content-free-diagnostics]
key_files:
  created:
    - src/components/ai/grounded/GraphPathCard.tsx
    - src/components/ai/grounded/SourcesPanel.tsx
    - src/components/ai/grounded/CandidateChipList.tsx
    - src/components/ai/grounded/IntentRoutingPrompt.tsx
    - src/components/ai/grounded/DiagnosticsPanel.tsx
    - src/components/ai/grounded/EvidenceOnlyCard.tsx
    - src/components/ai/grounded/ScopeChipsBar.tsx
    - tests/ai/GraphPathCard.test.tsx
    - tests/ai/SourcesPanel.test.tsx
    - tests/ai/CandidateChipList.test.tsx
  modified:
    - tests/ai/GroundedAnswerCard.test.tsx
decisions:
  - "GraphPathCard groups by snapshotId with zero cross-snapshot hop concatenation (D-14)."
  - "GraphPathCard partitions paths into neutral variation container for EXTENDS/SUPPLEMENTS (D-25/D-27) vs destructive alert container for unproven conflicts (D-29)."
  - "DiagnosticsPanel strictly enforces content-free invariant (AI-SPEC §7) exposing only enums, timings, and counts without user query or raw excerpt leakage."
metrics:
  duration: 6m
  completed_date: "2026-10-11"
---

# Phase 19 Plan 12: Grounded Slot Components Family Summary

Completed full slot components family for GroundedAnswerCard: snapshot-scoped graph paths with scope-variation vs conflict grouping mirror, range-deduplicated sources table, content-free diagnostics, candidate and refinement chips, intent routing prompt, evidence-only state card, and editable scope chips bar.

## What Was Built

1. **GraphPathCard (`src/components/ai/grounded/GraphPathCard.tsx`)**:
   - One Card per snapshot (D-14; hops never concatenate across snapshot boundaries).
   - Backing conflict group resolution and tri-partition into Variation, Conflict, and Normal buckets.
   - Neutral variation container (`data-testid="graph-path-variation-container"`) for `EXTENDS`/`SUPPLEMENTS` siblings labeled by proven dimension (D-25, D-27).
   - Destructive alert container (`data-testid="graph-path-conflict-container"`, `role="alert"`) for unproven conflicts with Verify affordances and no primary (D-13, D-29).
   - Normal bucket shortest-hop primary selection and collapsed alternative view.
   - Hop rows with `OBSERVED`, `INFERRED`, and `BUSINESS_APPROVED` classification tags and inline hop citations.

2. **SourcesPanel (`src/components/ai/grounded/SourcesPanel.tsx`)**:
   - Compact table deduplicated by `(documentId, lineStart, lineEnd, publishedContentHash ?? 'local')`.
   - Columns: index (`#`), document title, section anchor, line range (`L{start}-{end}`), classification badge, snapshot hash (truncated with Tooltip) or `Local` tag.
   - Click and keyboard Enter activation calling `onOpenCitation`.

3. **DiagnosticsPanel (`src/components/ai/grounded/DiagnosticsPanel.tsx`)**:
   - Content-free (AI-SPEC §7) retrieval diagnostics inside Ant Collapse.
   - Modality statuses (`fulltext`, `vector`, `graph`) with latencies and item counts.
   - Scope resolution source, fallback reason code, prompt/schema versions, and repair counter.

4. **CandidateChipList (`src/components/ai/grounded/CandidateChipList.tsx`)**:
   - Candidate variant (`NEEDS_CLARIFICATION`, D-04): name + kind tag, full URN in tooltip and aria-label.
   - Refinement variant (`NO_EVIDENCE` / `UNSUPPORTED`, D-07): text label chips.
   - Max 3 chips rendered with Enter/Space keyboard activation.

5. **IntentRoutingPrompt (`src/components/ai/grounded/IntentRoutingPrompt.tsx`)**:
   - Vietnamese route-selection tags: `Tra cứu tài liệu` (knowledge) and `Thao tác PlannerMate` (operational) (D-09).

6. **EvidenceOnlyCard (`src/components/ai/grounded/EvidenceOnlyCard.tsx`)**:
   - Model-unavailable state card rendering ranked paths and sources with `Tạo câu trả lời từ bằng chứng` trigger button (D-43, D-44).

7. **ScopeChipsBar (`src/components/ai/grounded/ScopeChipsBar.tsx`)**:
   - Post-routing editable scope chips (`Đang tra cứu: domain, env, ver, (so sánh môi trường)`), invoking `onEditScope` without blocking pre-ask interactions (D-15).

## Verification Results

- `tests/ai/GraphPathCard.test.tsx`: 10 test cases covering multi-snapshot isolation, EXTENDS/SUPPLEMENTS variation grouping, null/Unknown conflict routing, mixed buckets, hop activation, and aria-labels.
- `tests/ai/SourcesPanel.test.tsx`: 4 test cases covering range dedup, click, keyboard Enter, and Local tags.
- `tests/ai/CandidateChipList.test.tsx`: 5 test cases covering candidate vs refinement variants, 3-chip cap, keyboard activation, and aria-labels.
- `tests/ai/GroundedAnswerCard.test.tsx`: 27 test cases including extended slots (IntentRoutingPrompt, ScopeChipsBar, EvidenceOnlyCard, DiagnosticsPanel, and content-free verification).
- Total: 46 passing tests.

## Deviations from Plan

None - plan executed exactly as written.

## Threat Surface Scan

| Flag | File | Description |
|------|------|-------------|
| None | src/components/ai/grounded/* | Pure presentational slot components; verified content-free diagnostics; validated Zod inputs upstream |

## Self-Check: PASSED

- All 7 new components exist under `src/components/ai/grounded/`.
- All 3 new test specs exist and pass cleanly.
- Atomic git commits recorded:
  - `e74df7e`: feat(19-12): implement GraphPathCard, SourcesPanel, and DiagnosticsPanel
  - `927a533`: feat(19-12): implement CandidateChipList, IntentRoutingPrompt, EvidenceOnlyCard, and ScopeChipsBar
