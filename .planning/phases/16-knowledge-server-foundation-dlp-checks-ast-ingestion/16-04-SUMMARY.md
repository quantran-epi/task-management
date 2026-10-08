# Phase 16 Plan 04: Independent Daemon Package & Shared Ingestion Protocol Summary

**One-liner:** Bootstrapped independent `knowledge-server` Node 24 ESM package with Fastify/unified stack and strict isomorphic D-22 to D-26 protocol contracts without coupling PlannerMate browser build.

## Frontmatter

- **Phase:** 16-knowledge-server-foundation-dlp-checks-ast-ingestion
- **Plan:** 04
- **Subsystem:** Ingestion Server & Shared Protocol
- **Tags:** `fastify`, `daemon`, `protocol`, `zod`, `ast-chunks`, `isomorphic`
- **Dependency graph:**
  - **Requires:** `16-01` (client contracts/schema), `16-03` (client DLP scanner)
  - **Provides:** independent daemon runtime, `knowledge-server/src/types/protocol.ts`, build/test harness for `16-05` and `16-07`
  - **Affects:** root scripts (`package.json`), daemon package (`knowledge-server/`)
- **Tech stack added:**
  - `fastify@5.12.5`, `@fastify/cors@11.3.0`, `dotenv@18.0.6`
  - `unified@11.0.5`, `remark-parse@11.0.0`, `remark-gfm@4.0.1`, `mdast-util-to-string@4.0.0`
  - `zod@4.6.5`, `typescript@7.0.2`, `vitest@5.0.3`, `tsx@4.23.15`
- **Key files created:**
  - `knowledge-server/package.json`
  - `knowledge-server/package-lock.json`
  - `knowledge-server/tsconfig.json`
  - `knowledge-server/vitest.config.ts`
  - `knowledge-server/src/types/protocol.ts`
  - `knowledge-server/tests/protocol.test.ts`
- **Decisions:**
  - D-25/D-26: `CHUNKING_POLICY_VERSION = '2026.10.1'`, `TARGET_CHUNK_SIZE = 6000`, `HARD_ATOMIC_BLOCK_LIMIT = 50000` defined in shared protocol.
  - D-27: Primary status enum strictly matches six primary states (`Never published`, `In sync`, `Local changes`, `Publishing`, `Warning`, `Failed`).
  - Runtime isolation: `knowledge-server` lives in dedicated package directory; root `vite.config.ts` excludes `knowledge-server/**` from root test/bundling paths.

## Execution Details

### Task 1: Bootstrap independent daemon package and Phase 16 protocol

- Created independent ESM package in `knowledge-server/` with Node 24 engine target.
- Installed audited packages (`fastify`, `@fastify/cors`, `unified`, `remark-parse`, `remark-gfm`, `mdast-util-to-string`, `dotenv`, `zod`, `typescript`, `tsx`, `vitest`).
- Defined protocol contracts in `knowledge-server/src/types/protocol.ts`:
  - `PublishedDocumentInputSchema` & `PublishAttemptRequestSchema` (frozen snapshot inputs)
  - `EvidenceChunkSchema` (D-20 through D-24: raw content slice, heading path, line numbers, raw source offsets, normalized content hash, chunk key)
  - `OversizedAtomicBlockErrorSchema` (D-25: exact block type, line, column, length, limit, message)
  - `PublishAttemptResponseSchema` (content-free status and metrics)
  - `ActiveSnapshotManifestSchema` (content-free manifest for client zero-fetch diffing)
  - `ChangePreviewResultSchema` (four-way added/changed/removed/unchanged document and chunk delta)
- Added root convenience scripts: `knowledge:dev`, `knowledge:build`, `test:knowledge`.
- Excluded `knowledge-server/**` from root `vite.config.ts` test search to keep root Vitest focused on browser/client suites.
- Commit: `54ebfbc`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking Issue] npm install peer dependency resolution on Node 20 tooling**
- **Found during:** Task 1 dependency installation
- **Issue:** `npm install` encountered `Cannot read properties of null (reading 'edgesOut')` due to peer dependency resolver tree in local npm 10.8.2.
- **Fix:** Ran `npm i --legacy-peer-deps` inside `knowledge-server/`, generating clean and reproducible `package-lock.json` with all audited packages.
- **Files modified:** `knowledge-server/package-lock.json`
- **Commit:** `54ebfbc`

## Verification

- `npm run knowledge:build`: compiled cleanly with `tsc`.
- `npm run test:knowledge`: 8 protocol assertions passed via Vitest.
- `npm run build`: PlannerMate root PWA build succeeded with zero dependency coupling to `knowledge-server`.
- `npm test -- tests/knowledge`: root knowledge test suite (29 tests) passed.
- No client imports of Fastify or server routes from `src/`.

## Self-Check: PASSED
