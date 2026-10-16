# Quick Task: Setup Local Knowledge Server and Neo4j via Docker Compose

**Directory:** `.planning/quick/261016-dck-setup-local-knowledge-server-neo4j-docker`
**Date:** 2026-10-16

## Objective

1. Fix TypeScript compilation errors in `knowledge-server` (`neo4jRepository.ts` and `attemptService.ts`) so production build succeeds.
2. Update `knowledge-server/Dockerfile` from `node:24-alpine` to `node:24-slim` to support native glibc dependencies (`onnxruntime-node` for `@xenova/transformers` embedding) and configure proper non-root `/var/lib/knowledge-server` storage permissions.
3. Create `docker-compose.yml` and `.env.docker` with:
   - `neo4j` container (`neo4j:5.26-community`, APOC enabled, healthcheck, persistent volume).
   - `knowledge-server` container (local build, connected to neo4j, ONNX multilingual-e5-small embedding, healthcheck, persistent volume).
4. Verify end-to-end:
   - Docker containers build and report healthy.
   - `/api/v1/health` and `/api/v1/health/readiness` return `neo4j: true`, `vectorIndex: true`, `model: true`.
   - Automated tests run and pass against both mock and live endpoints.
   - Document real-world integration steps for TaskMate app (Settings -> Knowledge Server).
