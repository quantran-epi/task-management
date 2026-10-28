---
phase: 25-interactive-sdlc-document-wizards
plan: 02
subsystem: testing
tags: [docx, ooxml, jszip, fixtures, pl07, pl02, pl03b]

# Dependency graph
requires:
  - phase: 25-interactive-sdlc-document-wizards
    provides: "Hash-pinned source DOCX templates and phase template authority from Plan 25-01"
provides:
  - "Deterministic OOXML extractor for three approved bank DOCX templates"
  - "SHA-256 manifest and semantic PL02/PL03B/PL07 structure fixtures"
  - "Verbatim PL07 I-V baseline fixture with II.5 a/b/c/d"
  - "Targeted fixture integrity tests for downstream DOCX builders"
affects: [25-08, 25-09, 25-10, wizard-docx-builders]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Node stdlib crypto plus existing JSZip for internal OOXML parts only"
    - "Hash-pinned deterministic JSON fixtures with explicit extraction version"
    - "Source-derived PL07 I-V baseline excludes generated section VI"

key-files:
  created:
    - "scripts/extract-pl-template-fixtures.mjs"
    - "tests/fixtures/ai/pl-template-manifest.json"
    - "tests/fixtures/ai/pl07-baseline.json"
    - "tests/fixtures/docx/pl02-structure.json"
    - "tests/fixtures/docx/pl03b-structure.json"
    - "tests/fixtures/docx/pl07-structure.json"
    - "tests/export/wizardDocx.test.ts"
  modified: []

key-decisions:
  - "PL02 source has no revision table before TOC; fixture records absence rather than adding a generic table."
  - "PL03B source has a six-column revision table, no signature block, and numbered flow-hop paragraphs rather than a matrix."
  - "PL07 sections I-V are immutable baseline; section VI is excluded from baseline because it is generated per patch."
  - "Human fidelity verdict approved by reviewer Claude Code using Node.js v20.19.5, JSZip 3.10.2, and extractor ooXML-1.0.0."

patterns-established:
  - "Every fixture carries sourcePath, sourceSha256, extractionVersion, and observed structure metadata."
  - "Extractor rejects silent source replacement unless --regenerate is explicitly supplied."

requirements-completed: [WIZ-DOCX-01]

# Metrics
duration: 12min
completed: 2026-10-28
---

# Phase 25 Plan 02 Summary

**Hash-pinned OOXML fixtures preserve PL07 I-V verbatim and lock observed PL02/PL03B/PL07 layout decisions for DOCX builders.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-10-28T14:34:00Z
- **Completed:** 2026-10-28T14:46:35Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Added `scripts/extract-pl-template-fixtures.mjs` using Node `crypto` and existing JSZip 3.10.2.
- Pinned exact source hashes and byte sizes for all three DOCX templates.
- Extracted PL07 sections I-V with 27 ordered items and exact II.5 a/b/c/d text; excluded section VI.
- Captured semantic structure, tables, merge spans, numbering, margins, headers, footers, TOC, revision, and signature observations.
- Added targeted Vitest contract with three passing tests and three explicit future builder TODOs.
- Completed independent source-hash and exact OOXML comparison review.

## Fidelity Review

Reviewer: `Claude Code`

Tool/version: `Node.js v20.19.5 + JSZip 3.10.2 + ooXML-1.0.0`

Verdict: `approved`

Source hashes reviewed:

- PL02: `913b36aac459b7a8483fd61d0f39f40f6ae1ad58b588790170bf9fd34034b488`
- PL03B: `b93f67f9cecbd550f7b7c2ab7da6d5824b7ffd5d7e36cd8a4118d7668990bbf6`
- PL07: `9ccbc967884ccf8b1e1010566a37f9f554227fbdb208761728e8f3ad320f0b94`

Independent checks passed:

- Manifest hash and size match source bytes for all three DOCX files.
- Extractor rerun is deterministic; generated fixtures show no diff.
- PL07 exact text/order scan passed for all fixture section titles, items, and sub-items.
- PL07 baseline contains sections `I`, `II`, `III`, `IV`, `V`, exactly 27 items, and `II.5` sub-items `a`, `b`, `c`, `d`.
- PL07 baseline contains no section `VI`.
- PL02 page margins, header, footer, and no-revision-table finding match OOXML.
- PL03B page margins, header, footer, revision table, no-signature finding, and numbered-hop finding match OOXML.
- PL07 page margins, header, footer, merged `Đáp ứng` header, and signature table finding match OOXML.

No Microsoft Word or LibreOffice review is claimed. Review used source hashes and direct OOXML extraction only.

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Add failing wizard fixture contract** - `5e95d05` (`test`)
2. **Task 1 GREEN: Extract authoritative DOCX fixtures** - `fd3fdf9` (`feat`)
3. **Task 2: Independent source fidelity review** - approved by coordinator; no source changes required

**Plan metadata:** pending orchestrator metadata commit. This worktree does not modify `STATE.md` or `ROADMAP.md`.

## Files Created/Modified

- `scripts/extract-pl-template-fixtures.mjs` - reads named internal OOXML parts, pins hashes, writes deterministic fixtures, rejects silent source drift.
- `tests/fixtures/ai/pl-template-manifest.json` - three source paths, SHA-256 hashes, byte sizes, extraction version.
- `tests/fixtures/ai/pl07-baseline.json` - exact PL07 I-V baseline and II.5 sub-items.
- `tests/fixtures/docx/pl02-structure.json` - observed PL02 structure and no-revision-table finding.
- `tests/fixtures/docx/pl03b-structure.json` - observed PL03B revision table, flow hops, and no-signature finding.
- `tests/fixtures/docx/pl07-structure.json` - observed PL07 checklist merge and signature structure.
- `tests/export/wizardDocx.test.ts` - manifest, baseline, structure, and downstream builder TODO contract.

## Decisions Made

- Source OOXML is authority for layout and ambiguity resolution; planning prose does not override observed source.
- PL07 baseline extraction concatenates `w:t` runs in document order, decodes XML entities, and preserves Unicode, punctuation, item order, and explicit sub-item prefixes.
- Future builders must consume fixtures rather than reopening source templates during every test.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Initial independent checker used an incorrect attribute regex that did not accept numeric-only `w:top` values; corrected checker passed without changing implementation or fixtures.
- Direct package metadata lookup via `require('./node_modules/jszip/package.json')` was unavailable because dependencies are not installed at repository root; package-lock confirms JSZip 3.10.2 and module import works through Vitest/tooling. No package installation performed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plans 25-08, 25-09, and 25-10 can consume immutable source fixtures for dedicated builders.
- Human fidelity gate approved from direct OOXML evidence.
- No STATE.md or ROADMAP.md changes made in this worktree.

## Self-Check: PASSED

- Fixture extractor exists and reruns deterministically.
- Targeted test file exists and passes.
- Manifest, baseline, and all three structure fixtures exist.
- Task commits `5e95d05` and `fd3fdf9` exist in git history.
- No STATE.md or ROADMAP.md modifications present.

---
*Phase: 25-interactive-sdlc-document-wizards*
*Plan: 02*
*Completed: 2026-10-28*
