---
phase: 18-multi-modal-hybrid-retrieval-engine
plan: 02
subsystem: knowledge-retrieval
tags: [embeddings, onnx, openai, security, dlp]
requires: [18-01]
provides: [18-03, 18-04, 18-05]
affects: [knowledge-server]
tech-stack:
  added: ["@xenova/transformers@2.17.2"]
  patterns: [
    "Injectable pipeline loader for local ONNX feature extraction",
    "Native fetch adapter with strict Zod validation for remote OpenAI embeddings",
    "Fail-closed remote egress configuration with explicit HTTPS host allowlists",
    "Zero-secret / zero-content logging and error propagation"
  ]
key-files:
  created:
    - knowledge-server/src/embedding/embeddingProviders.ts
    - knowledge-server/scripts/spike-local-embedding.mjs
    - knowledge-server/tests/embeddingProvider.test.ts
  modified:
    - knowledge-server/package.json
    - knowledge-server/package-lock.json
    - knowledge-server/src/main.ts
    - knowledge-server/tests/main.test.ts
decisions:
  - "Installed exact @xenova/transformers@2.17.2 with --ignore-scripts per human approval checkpoint."
  - "LocalOnnxEmbeddingProvider lazy-loads pipeline and maps model load failures to stable PROVIDER_ERROR for degraded fusion."
  - "RemoteOpenAiEmbeddingProvider requires HTTPS, exact host allowlist, positive dimensions, and never leaks canary tokens or queries."
  - "Target spike on Windows host (Node v20.19.5) cleanly probes runtime and captures sharp native binary unavailability due to --ignore-scripts."
metrics:
  duration: 18m
  completed_date: "2026-10-10"
---

# Phase 18 Plan 02: Embedding Adapters and Runtime Spike Summary

Exact local ONNX and remote OpenAI-compatible embedding adapters implemented behind a single provider-neutral contract with fail-closed security and isolated test doubles.

## Key Changes

1. **Dependency Installation**:
   - Installed `@xenova/transformers@2.17.2` exact with `--ignore-scripts` in `knowledge-server`.

2. **Embedding Providers (`knowledge-server/src/embedding/embeddingProviders.ts`)**:
   - `LocalOnnxEmbeddingProvider`: Pinned to `Xenova/multilingual-e5-small` revision `761b726dd34fb83930e26aab4e9ac3899aa1fa78`, 384 dimensions, mean pooling, L2 normalization, `query: ` and `passage: ` prefixes. Supports injectable `pipelineLoader`.
   - `RemoteOpenAiEmbeddingProvider`: Native `fetch` with AbortSignal, HTTPS-only validation, exact host allowlisting, strictly parsed and sorted indexed embeddings. Content-free stable error codes (`TIMEOUT`, `PROVIDER_ERROR`, `MODEL_INDEX_MISMATCH`, `UNCONFIGURED`).
   - `createEmbeddingProvider`: Config-driven factory prioritizing safe local default and requiring explicit opt-in for remote egress.

3. **Runtime Configuration & Banner (`knowledge-server/src/main.ts`)**:
   - Added validation for `EMBEDDING_REMOTE_ENABLED`, `EMBEDDING_REMOTE_ENDPOINT`, `EMBEDDING_REMOTE_ALLOWED_HOSTS`, `EMBEDDING_REMOTE_API_KEY`, `EMBEDDING_REMOTE_MODEL`, and `EMBEDDING_REMOTE_DIMENSIONS`.
   - Added `PLANNER_REMOTE_ENABLED` and `PLANNER_REMOTE_ALLOWED_HOSTS` parsing.
   - Content-free startup banners identifying local or remote configuration without credentials.

4. **Target Host Spike (`knowledge-server/scripts/spike-local-embedding.mjs`)**:
   - Repeatable probe for Node >= 20.19 runtime.
   - Cleanly captured failure report on host environment:
     ```json
     {
       "success": false,
       "errorName": "Error",
       "failureType": "SHARP_NATIVE_BINARY_UNAVAILABLE",
       "nodeVersion": "v20.19.5",
       "platform": "win32",
       "arch": "x64",
       "model": "Xenova/multilingual-e5-small",
       "revision": "761b726dd34fb83930e26aab4e9ac3899aa1fa78"
     }
     ```
   - Confirms local provider safely maps missing native binaries to `PROVIDER_ERROR` without halting daemon or leaking secrets.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Critical Functionality] Adapted spike script Node version check for Node v20.19.5**
- **Found during:** Task 2 (18-W0-EMBED)
- **Issue:** Host machine runs Node v20.19.5; plan note explicitly allowed adapting the check to accept Node >= 20.19 and recording host details.
- **Fix:** Set minimum Node check in `spike-local-embedding.mjs` to `>= 20.19` and captured host metadata.
- **Files modified:** `knowledge-server/scripts/spike-local-embedding.mjs`

## Threat Surface Scan

| Flag | File | Description |
|------|------|-------------|
| threat_flag: remote-egress | knowledge-server/src/embedding/embeddingProviders.ts | Remote OpenAI embedding adapter contacts external HTTPS endpoint. Mitigated by exact host allowlist, Bearer auth only, zero-leak error messages, and disabled-by-default flag. |

## Self-Check: PASSED
- `knowledge-server/src/embedding/embeddingProviders.ts`: FOUND
- `knowledge-server/scripts/spike-local-embedding.mjs`: FOUND
- `knowledge-server/tests/embeddingProvider.test.ts`: FOUND
