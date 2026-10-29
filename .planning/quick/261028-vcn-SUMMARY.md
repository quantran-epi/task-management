---
phase: quick
plan: 261028-vcn
subsystem: knowledge-publishing
tags: [fastify, markdown, ast, preview, kubernetes]
dependency-graph:
  requires: [knowledge-server, document-change-preview]
  provides: [10-mib-upload-limit, canonical-cross-runtime-chunking]
  affects: [docs-publish, knowledge-snapshots, deployment-config]
tech-stack:
  added: [unified, remark-parse, remark-gfm, mdast-util-to-string]
  patterns: [strict-env-boundary-validation, canonical-isomorphic-chunker]
key-files:
  created: []
  modified:
    - knowledge-server/src/main.ts
    - knowledge-server/src/server.ts
    - knowledge-server/src/types/protocol.ts
    - src/services/knowledge/sectionChunker.ts
    - tests/knowledge/changePreview.test.ts
    - docker-compose.yml
    - k8s/knowledge-server.yaml
key-decisions:
  - "Use one 10,485,760-byte constant for runtime and embedded-server defaults."
  - "Reuse knowledge-server AST chunker directly in browser preview rather than maintaining parallel regex logic."
  - "Keep changePreview four-way classification unchanged; correct its chunk input instead."
metrics:
  tasks: 3
  files: 14
  completed: 2026-10-29
---

# Quick 261028-vcn: Knowledge Upload Limit and Chunk Preview Parity Summary

Knowledge publishing now accepts bodies up to 10 MiB by default and browser previews use the same AST section chunking policy as server snapshots, preventing unchanged large documents from repeatedly appearing changed or removed.

## Accomplishments

- Added strict positive-integer parsing for `KNOWLEDGE_SERVER_BODY_LIMIT_BYTES`, defaulting to `10_485_760`, and passed it into Fastify startup.
- Applied matching Docker Compose and Kubernetes configuration.
- Replaced frontend regex chunking with a thin canonical AST chunker re-export.
- Removed obsolete Vitest alias and `tests/mocks/sectionChunker.ts`.
- Added upload-limit, manifest, and large-section preview idempotency regression tests.
- Added root runtime dependencies required by browser-side canonical AST chunking.

## Verification

- `npm test -- tests/knowledge/changePreview.test.ts` — PASS: 1 file, 7 tests.
- `npm --prefix knowledge-server test -- tests/main.test.ts tests/server.test.ts tests/k8sManifests.test.ts` — PARTIAL: 34 passed, 2 pre-existing failures in `knowledge-server/tests/main.test.ts`:
  - timeout expectation remains `500/1500/2000`, runtime defaults are `2000/5000/10000`;
  - non-loopback prose extraction HTTP rejection test expects validation absent from current runtime.
- `npm run build` — PASS. Existing browser externalization, chunk-size, and ineffective dynamic-import warnings remain.
- `npm run knowledge:build` — PASS.
- `git diff --check` — PASS.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Restored package resolution inside isolated worktree**
- **Found during:** Verification
- **Issue:** Worktree lacked installed Markdown AST modules and knowledge-server dependencies, causing module-resolution errors.
- **Fix:** Used existing main-checkout dependency installation for local verification and normalized root lockfile with `npm install --package-lock-only --ignore-scripts`.
- **Files modified:** `package-lock.json`
- **Commit:** `7e96389`

## Deferred Issues

- Two unrelated assertions in `knowledge-server/tests/main.test.ts` fail against pre-existing runtime behavior. No task source changes caused either mismatch.
- Local shell runs Node `20.19.5`; project recommends Node 24. Package-lock-only normalization emitted engine warnings plus existing audit findings without changing dependencies beyond requested Markdown packages.

## Known Stubs

None.

## Commits

- `7e96389` — `fix(quick-261028-vcn): raise knowledge upload limit and unify chunking`

## Self-Check: PASSED

- Source commit exists.
- All listed modified source and test files exist; planned mock deletion is present in commit.
- Targeted preview tests and both builds pass.
- Knowledge targeted suite result recorded faithfully with exact unrelated failures.
