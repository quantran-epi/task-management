# Phase 20 Plan 03 Summary: Semantic Rebuild Equivalence, Offline Isolation Taxonomy, and Credential Redaction

## Delivered Scope

1. **Semantic Graph Rebuild Equivalence (`knowledge-server/tests/graphRebuildEquivalence.test.ts`)**
   - Implemented rebuild equivalence test suite comparing graph projections across independent rebuild cycles.
   - Proved that while runtime ephemeral properties (snapshot IDs, activation timestamps) differ, semantic properties remain 100% equivalent:
     - `normalizedProjectionHash` matches byte-for-byte (64-char SHA256).
     - Node counts, relation counts, fact counts, conflict counts, and quarantine counts match identically.
     - Sorted sets of `factKey`s and relation tuples (`subjectUrn`, `relation`, `objectUrn`, `effectiveClassification`) match identically.
     - Preserves offline/local authority invariant: Neo4j is never treated as canonical store.

2. **5-State Offline Transport Error Taxonomy (`tests/knowledge/offlineIsolation.test.ts`)**
   - Mode A (`SERVER_DISABLED`): Triggers local BM25 fallback with 0 network calls.
   - Mode B (`NETWORK_ERROR`): Triggers local BM25 fallback with 0 subsequent network egress.
   - Mode C (`TIMEOUT`): Triggers local BM25 fallback with 0 subsequent network egress.
   - Mode D (`ERROR_AUTH`): Surfaces visible auth error and strictly inhibits local fallback.
   - Mode E (`ERROR_INVALID_RESPONSE`): Surfaces visible schema error and strictly inhibits local fallback.
   - Verified that all 8 test cases pass without any production code changes.

3. **Protocol Credential Isolation (`tests/security/credentialIsolation.test.ts`)**
   - Verified that benchmark report JSON and Markdown never contain configured canary secret tokens or raw Bearer credentials.
   - Verified regex absence of Bearer credentials across generated `.benchmark-reports/`.
   - Verified error envelope token redaction.
