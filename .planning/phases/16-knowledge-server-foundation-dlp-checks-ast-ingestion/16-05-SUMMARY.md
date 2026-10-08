# Phase 16 Plan 05: Lossless Isomorphic Section Chunker & Hash Policy Summary

**One-liner:** Delivered pure isomorphic MDAST section chunker, CRLF/LF hash policy, and 50k atomic block validator passing full pilot corpus lossless reconstruction.

## Frontmatter

- **Phase:** 16-knowledge-server-foundation-dlp-checks-ast-ingestion
- **Plan:** "05"
- **Subsystem:** Ingestion Parser & Chunk Policy
- **Tags:** `ast`, `chunking`, `mdast`, `hash-policy`, `atomic-blocks`, `isomorphic`
- **Dependency graph:**
  - **Requires:** `16-04` (daemon package and shared protocol contracts)
  - **Provides:** `chunkMarkdownSnapshot`, `normalizeNewlines`, `buildChunkHashInput`, `OversizedAtomicBlockError`, `validateAtomicBlockNode`
  - **Affects:** `16-06` (client-side change preview), `16-07` (incremental projector & snapshot store)
- **Tech stack added:** none (pure TypeScript over unified, remark-parse, remark-gfm, mdast-util-to-string)
- **Key files created:**
  - `knowledge-server/src/indexing/chunkHashPolicy.ts`
  - `knowledge-server/src/parser/markdownAst.ts`
  - `knowledge-server/src/parser/atomicBlockValidator.ts`
  - `knowledge-server/src/parser/sectionChunker.ts`
  - `knowledge-server/tests/sectionChunker.test.ts`
  - `knowledge-server/tests/atomicBlock.test.ts`
- **Decisions:**
  - D-20: Headings H1 map to preamble; H2/H3 open semantic sections; H4-H6 track heading path without splitting top-level sections.
  - D-21: Heading-less documents use synthetic section with lossless raw slice.
  - D-22: `normalizeNewlines` canonicalizes CRLF/CR to LF for content hash only.
  - D-23: Exact UTF-16 slices and start/end offsets preserved against original raw source text.
  - D-24: `occurrenceId` (UUID v4) and reusable `contentHash` remain distinct.
  - D-25: 6,000 character target size and 50,000 hard limit enforced; over-limit atomic blocks reject without truncation.
- **Metrics:**
  - **Duration:** 18m
  - **Completed:** 2026-10-08

## Overview

Plan 16-05 created the shared isomorphic Markdown AST chunker and hash policy powering both browser client change preview (D-04) and knowledge server projection (D-26) with zero policy drift.

### Core Capabilities

1. **Lossless MDAST Section Chunker (`sectionChunker.ts`):**
   - Parses Markdown with `unified` + `remarkParse` + `remarkGfm`.
   - Groups content into preamble (including H1), H2, and H3 sections.
   - Preserves exact source partition without losing inter-block newlines: `source.slice(startOffset, endOffset) === rawContent`.
   - Splits oversized sections (>6,000 characters) strictly between top-level AST node boundaries, never splitting inside code fences, tables, or quotes.

2. **Atomic Block Limit & Safe Error (`atomicBlockValidator.ts`):**
   - Detects atomic blocks (`table`, `code`, `blockquote`) exceeding 50,000 characters.
   - Throws `OversizedAtomicBlockError` with document ID, block type, line, column, length, and limit.
   - Never exposes raw Markdown content or sensitive text in error messages (T-16-18).

3. **Runtime-Neutral Hash Policy (`chunkHashPolicy.ts`):**
   - Exports `normalizeNewlines` converting `\r\n` and `\r` to `\n` while preserving all other whitespace and syntax.
   - Exports `buildChunkHashInput` and pure in-memory `sha256Hex` for deterministic hashing across Node and browser without side effects.
   - Verified zero side-effect imports (no `node:`, `fastify`, `react`, `dexie`, `window`, `document`, or DOM APIs).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Hydrated knowledge-server dependencies for local test runner**
- **Found during:** Initial test run
- **Issue:** `knowledge-server/node_modules` was missing installed packages after worktree spawn.
- **Fix:** Ran `npm --prefix knowledge-server i --legacy-peer-deps` to populate local node_modules matching committed `package-lock.json`.
- **Files modified:** none (reverted any package.json edits, kept lockfile identical).

**2. [Rule 1 - Bug] TypeScript strict compilation on exactOptionalPropertyTypes**
- **Found during:** `npm run knowledge:build`
- **Issue:** `node.position` type in MDAST can have optional properties where `exactOptionalPropertyTypes: true` requires explicit `| undefined`.
- **Fix:** Defined `AstNodeLike` with explicit optional property types in `atomicBlockValidator.ts`.
- **Files modified:** `knowledge-server/src/parser/atomicBlockValidator.ts`
- **Commit:** `dd4e241`

## Verification

- `npm run test:knowledge -- sectionChunker.test.ts atomicBlock.test.ts`: 16/16 tests passed.
- `npm run test:knowledge`: 24/24 tests passed across all suites.
- `npm run knowledge:build`: compiled cleanly with `tsc`.
- `npm run build`: PlannerMate root PWA build succeeded with 0 errors.
- `npm test -- tests/knowledge`: root knowledge test suite (29 tests) passed.

## Self-Check: PASSED

- FOUND: knowledge-server/src/indexing/chunkHashPolicy.ts
- FOUND: knowledge-server/src/parser/markdownAst.ts
- FOUND: knowledge-server/src/parser/atomicBlockValidator.ts
- FOUND: knowledge-server/src/parser/sectionChunker.ts
- FOUND: knowledge-server/tests/sectionChunker.test.ts
- FOUND: knowledge-server/tests/atomicBlock.test.ts
- FOUND: commit dd4e241
