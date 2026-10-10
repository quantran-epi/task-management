# Phase 17: Pilot Ontology, Deterministic Extraction & Neo4j Knowledge Graph - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-10
**Phase:** 17-Pilot Ontology, Deterministic Extraction & Neo4j Knowledge Graph
**Areas discussed:** Ontology vocabulary, Identity rules, Extraction conflicts, Evidence lifecycle

---

## Ontology Vocabulary

### Ontology specialization

| Option | Description | Selected |
|--------|-------------|----------|
| Typed core + controlled `kind` | Stable core types; technical subtypes remain controlled metadata | ✓ |
| Deep domain model | Promote Java/PLSQL/Oracle/business subtypes into dedicated labels immediately | |
| Hybrid promoted types | Promote selected traversal types and retain remaining detail in `kind` | |
| Planner discretion | Choose smallest model satisfying later traversal requirements | |

**User's choice:** Typed core + controlled `kind`.
**Notes:** Deep-domain modeling was considered but rejected for now because one pilot corpus does not justify locking a broad technology-specific taxonomy. Important technical specificity must remain preserved in controlled metadata.

### Relation vocabulary

| Option | Description | Selected |
|--------|-------------|----------|
| Controlled core | Stable traversal relations; domain verb preserved in `operation` | ✓ |
| Domain verbs | Dedicated relations such as `DRAINS_EVENT` and `REPLANTS_COUNTER` | |
| Single `RELATED_TO` | One generic edge with role properties | |
| Planner discretion | Select smallest relation set meeting Phase 18 needs | |

**User's choice:** Controlled core.
**Notes:** Relations must remain queryable for flow, dependency, and impact without proliferating pilot-specific verbs.

### Runtime instance modeling

| Option | Description | Selected |
|--------|-------------|----------|
| Evidence only | Keep session/invoice/operation examples on evidence records | ✓ |
| Selected nodes | Promote only selected runtime trace anchors | |
| All instances | Create nodes for every mentioned runtime row | |
| Planner discretion | Decide from benchmark needs | |

**User's choice:** Evidence only.
**Notes:** Active graph represents stable topology; runtime examples remain exact provenance.

### Multiple-source provenance

| Option | Description | Selected |
|--------|-------------|----------|
| Direct edge + evidence records | Keep traversable edge and separate exact source occurrences via `factKey` | ✓ |
| Reified Fact nodes | Represent every semantic relation as a fact node | |
| Duplicate sourced edges | Create one domain edge per source occurrence | |
| Edge property arrays | Put all source occurrences directly on one edge | |

**User's choice:** Direct edge + evidence records.
**Notes:** Supports simple traversal and multiple exact sources without parallel-edge duplication.

---

## Identity Rules

### Composite URN namespace

| Option | Description | Selected |
|--------|-------------|----------|
| System + source type | Logical identity uses system, source-native type, and key | ✓ |
| Include environment | Make SIT/UAT/PROD separate identities | |
| Ontology type only | Use core type and key without source namespace | |
| Planner discretion | Select after benchmark review | |

**User's choice:** Logical object identity; `MAIN1` is used only as schema qualifier for database/PLSQL objects, while environment stays on evidence.
**Notes:** User clarified that `MAIN1` is the same schema in every environment, not an environment identifier.

### `ProcessStep` identity

| Option | Description | Selected |
|--------|-------------|----------|
| `PRC_CONTAINER.ID` | Use source-native bind-row key | ✓ |
| Parent + bind ID | Include parent context in identity | |
| Parent + `exec_order` | Use execution position in identity | |
| Planner discretion | Verify source semantics first | |

**User's choice:** `PRC_CONTAINER.ID`.
**Notes:** URN was explained as a stable, namespaced identifier. Parent, order, and parameters must not become identity components.

### Technical identifier normalization

| Option | Description | Selected |
|--------|-------------|----------|
| Strict canonical | Uppercase Oracle identifiers, preserve qualification, add schema only with explicit context | ✓ |
| Default `MAIN1` always | Add `MAIN1` to all unqualified names | |
| Raw exact spelling | Treat each source spelling independently | |
| Planner discretion | Choose after collision tests | |

**User's choice:** Strict canonical.
**Notes:** Unqualified identifiers without unique context remain unresolved instead of being guessed.

### Alias, rename, and source-ID changes

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit aliases only | Preserve source identity; add aliases only from explicit equivalence evidence | ✓ |
| Auto alias by similarity | Merge near-matching names automatically | |
| No aliases | Keep only current canonical name | |
| Planner discretion | Select minimum needed for exact search | |

**User's choice:** Explicit aliases only.
**Notes:** `source-native key`, `canonicalName`, and alias were explained. If SmartVista changes a process ID, the new ID creates a new source identity. Continuity requires explicit evidence and `BUSINESS_APPROVED`; name similarity never rewrites identity.

---

## Extraction Conflicts

### Structured evidence versus prose

| Option | Description | Selected |
|--------|-------------|----------|
| Keep both + flag | Retain assertions and explicit conflict state | ✓ |
| Structured always wins | Discard contradictory prose candidate | |
| Newest source wins | Replace older assertion by timestamp/version | |
| Planner discretion | Define authority handling later | |

**User's choice:** Keep both + flag.
**Notes:** Structured `OBSERVED` evidence is not silently overwritten; contradictory prose remains inspectable.

### LLM fallback authority

| Option | Description | Selected |
|--------|-------------|----------|
| Bounded candidates | Closed vocabulary, resolved endpoints, exact provenance, always `INFERRED` | ✓ |
| Create observed facts | Permit confidence-based `OBSERVED` relations | |
| Suggestion only | Require manual approval before graph insertion | |
| No LLM in Phase 17 | Deterministic extraction only | |

**User's choice:** Bounded candidates.
**Notes:** LLM handles only prose relationships not already extracted deterministically and cannot merge identities or promote itself to `OBSERVED`.

### Repeated-statement deduplication

| Option | Description | Selected |
|--------|-------------|----------|
| Semantic `factKey` | Deduplicate subject, relation, object, and semantic qualifiers | ✓ |
| Triple only | Ignore qualifiers during deduplication | |
| One edge per source | Preserve parallel domain edges | |
| Planner discretion | Define relation-specific logic later | |

**User's choice:** Semantic `factKey`.
**Notes:** Every source occurrence remains separate evidence. Classification and extraction method do not alter semantic fact identity.

### Unresolved identifiers

| Option | Description | Selected |
|--------|-------------|----------|
| Quarantine candidate | Preserve provenance but exclude from active graph until uniquely resolved | ✓ |
| Placeholder nodes | Insert `UNRESOLVED` nodes into graph paths | |
| Best-match resolve | Automatically select highest-scoring endpoint | |
| Drop unresolved | Discard unresolved extraction | |

**User's choice:** Quarantine candidate.
**Notes:** Rebuild retries resolution when new deterministic context appears.

---

## Evidence Lifecycle

### Classification storage and aggregation

| Option | Description | Selected |
|--------|-------------|----------|
| Per evidence + effective | Preserve each assertion class and calculate edge-level effective class | ✓ |
| One class per fact | Mutate a single fact classification | |
| Highest class only | Retain only strongest classification | |
| Planner discretion | Choose representation later | |

**User's choice:** Per evidence + effective.
**Notes:** Effective precedence is `BUSINESS_APPROVED > OBSERVED > INFERRED`, but evidence breakdown and conflicts remain visible.

### Approval carry-forward

| Option | Description | Selected |
|--------|-------------|----------|
| Exact `factKey` carry-forward | Preserve approval only for unchanged semantic fact | ✓ |
| Require reapproval | Reapprove every rebuild | |
| Carry by entity | Apply approval broadly to an object/relation family | |
| Planner discretion | Select lifecycle later | |

**User's choice:** Exact `factKey` carry-forward.
**Notes:** Missing source sets `sourceMissing=true`; semantic change requires new approval.

### Source removal and retraction

| Option | Description | Selected |
|--------|-------------|----------|
| Remove active + tombstone | Remove unsupported fact and retain content-free removal audit | ✓ |
| Soft-delete in graph | Keep inactive edges requiring query filters | |
| Keep historical active | Never remove old facts | |
| Planner discretion | Select rebuild policy later | |

**User's choice:** Remove active + tombstone.
**Notes:** Exact approved facts may remain active with `sourceMissing=true`; Neo4j must not become canonical history storage.

### Traversal inclusion

| Option | Description | Selected |
|--------|-------------|----------|
| Evidence-gated traversal | Default approved/clean observed; warn on observed conflicts; inferred requires opt-in | ✓ |
| Include all labeled | Traverse every edge and rely on consumer labels | |
| Approved/observed only | Exclude all inferred relations | |
| Planner discretion | Define in Phase 18 | |

**User's choice:** Evidence-gated traversal.
**Notes:** Conflicted or unresolved inferred candidates never enter default traversal.

---

## Claude's Discretion

- Exact URN grammar and escaping.
- Final minimal controlled node/relation enumerations.
- Relation-specific semantic qualifier allow-lists.
- Neo4j storage shape for evidence, conflicts, approvals, and tombstones.
- Fact-domain authority matrix, provided conflicts remain visible.

## Deferred Ideas

- Interactive graph canvas/manual graph editor.
- Full card-system corpus beyond process `60000006`.
- Hybrid retrieval and rank fusion (Phase 18).
- Assistant citation/conflict/path UI (Phase 19).
- Full benchmark and hardening (Phase 20).
