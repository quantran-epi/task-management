# Phase 24: Graph Retrieval Optimization - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-24
**Phase:** 24-graph-retrieval-optimization
**Areas discussed:** Seed-only evidence, Traversal breadth, Validation policy, Fusion diagnostics

---

## Seed-only evidence

### Response when seed has no relation or path

| Option | Description | Selected |
|--------|-------------|----------|
| Show entity with limited answer | Confirm entity exists, state relationship evidence is absent, never infer | ✓ |
| Treat as no evidence | Hide entity from main result and return no evidence | |
| Answer normally | Let entity alone support a complete answer | |
| Claude decides | Delegate behavior | |

**User's choice:** Agreed after concrete `MAIN1.EVT_EVENT` example.
**Notes:** Entity count remains one while edge/path counts remain zero.

### Presentation

| Option | Description | Selected |
|--------|-------------|----------|
| Answer plus card | Limited answer plus separate entity card | ✓ |
| Answer only | Text only | |
| Sources panel only | Entity visible only in expanded sources/diagnostics | |
| Claude decides | Delegate presentation | |

**User's choice:** Answer plus card.

### Retrieval outcome

| Option | Description | Selected |
|--------|-------------|----------|
| `SEED_ONLY` | Distinct outcome for found entity without relationship evidence | ✓ |
| `NO_EVIDENCE` | Treat unanswered relationship question as no evidence | |
| `READY` | Treat found entity as complete answer | |
| Claude decides | Delegate protocol choice | |

**User's choice:** `SEED_ONLY` after explanation of current outcomes.

### Entity-card action

| Option | Description | Selected |
|--------|-------------|----------|
| View only | Display entity metadata only | |
| View plus broader search | Start a new explicit broader related query | ✓ |
| Automatically broaden | Expand original query silently | |
| Claude decides | Delegate action | |

**User's choice:** View plus broader search.

---

## Traversal breadth

### Broad-query relation coverage

| Option | Description | Selected |
|--------|-------------|----------|
| All valid relations | Search every ontology-valid relation for each seed within bounds | ✓ |
| Keyword-selected relation only | Select relation using query words | |
| One default relation | Fixed relation per node kind | |
| Claude decides | Delegate coverage | |

**User's choice:** All valid relations.

### Relation-intent selection

| Option | Description | Selected |
|--------|-------------|----------|
| AI selects, server validates | AI interprets meaning within closed ontology; server validates; broad fallback on uncertainty | ✓ |
| Always search all | Ignore specific relation intent | |
| AI selects one with no fallback | Reject if model selection is wrong | |
| Claude decides | Delegate mechanism | |

**User's choice:** AI selects, server validates.
**Notes:** User rejected brittle regex/keyword routing. Examples covered “ghi”, “insert”, “update”, “populate”, and indirect language.

### Mixed seed kinds

| Option | Description | Selected |
|--------|-------------|----------|
| Plan per seed | Build ontology-valid plan separately for each seed kind, then merge | ✓ |
| Use first seed kind | Apply first seed's relation policy to all | |
| Keep one seed | Discard other candidates | |
| Always ask user | Require clarification whenever kinds differ | |

**User's choice:** Plan per seed.

### Traversal depth

| Option | Description | Selected |
|--------|-------------|----------|
| AI proposes, server limits | AI classifies intent/depth; server validates and caps at three; safe one-hop fallback | ✓ |
| Always one hop | Disable multi-hop | |
| Always three hops | Run broad traversal for every query | |
| Ask user every time | Require manual depth choice | |

**User's choice:** AI proposes, server limits.
**Notes:** Explained `LOOKUP`, `FLOW_TRAVERSAL`, and `IMPACT_ANALYSIS` with concrete questions.

---

## Validation policy

### Invalid planner output

| Option | Description | Selected |
|--------|-------------|----------|
| Repair once then fallback | Strict prompt, server validation, one AI repair, then safe one-hop fallback | ✓ |
| Keep valid portions immediately | Drop invalid portions and run remaining plan | |
| Reject all | Return no graph results | |
| Fallback immediately | Skip repair and run broad one-hop plan | |

**User's choice:** Repair once then fallback.
**Notes:** User first asked why strict prompting was insufficient. Discussion established prompt plus server validation as separate required layers.

### Mixed valid and unresolved seeds

| Option | Description | Selected |
|--------|-------------|----------|
| Return valid part and report missing part | Preserve good seed evidence and identify failed seed | ✓ |
| Stop all | Block all results until every seed succeeds | |
| Drop invalid silently | Hide partial failure | |
| Broaden all | Replace all plans with broad fallback | |

**User's choice:** Return valid part and report missing part.

### Reason-code detail

| Option | Description | Selected |
|--------|-------------|----------|
| Specific code plus plain explanation | Stable technical code and user-readable wording | ✓ |
| Generic code only | Use `INVALID_PLAN`/`NO_RESULT` only | |
| Explanation only | No stable code | |
| Debug only | Keep code outside normal UI | |

**User's choice:** Specific code plus plain explanation.

### Excess hop depth

| Option | Description | Selected |
|--------|-------------|----------|
| Repair once | Return `HOP_LIMIT_EXCEEDED`, then safe fallback if unrepaired | ✓ |
| Clamp to three | Change plan silently and run | |
| Reject all | Stop graph retrieval | |
| Allow five | Ignore safety bound | |

**User's choice:** Repair once.

---

## Fusion diagnostics

### Graph evidence under global result limit

| Option | Description | Selected |
|--------|-------------|----------|
| Keep complete graph package | Preserve entity, edge/path, and required citation chunks together | ✓ |
| Normal competition | Let all modalities compete with no graph closure protection | |
| Graph always first | Unconditionally prioritize every graph item | |
| Separate graph list | Render graph outside shared result limit | |

**User's choice:** Keep complete graph package after detailed 20-item fusion example.

### Multiple valid paths

| Option | Description | Selected |
|--------|-------------|----------|
| Stable ranking, keep best paths | Rank by intent, answer value, evidence, path length, stable ID | ✓ |
| Shortest only | Always prefer fewer hops | |
| Most citations | Prefer paths with most supporting chunks | |
| Neo4j first result | Trust database return order | |

**User's choice:** Stable ranking, keep best paths.

### Diagnostics presentation

| Option | Description | Selected |
|--------|-------------|----------|
| Summary plus expandable detail | Plain status/counts by default; safe per-stage metadata on demand | ✓ |
| Summary only | No stage-level detail | |
| Always detailed | Show all safe metadata inline | |
| Internal logs only | No diagnostics UI | |

**User's choice:** Summary plus expandable detail after stage-by-stage example.

### Evaluation order

| Option | Description | Selected |
|--------|-------------|----------|
| Correctness first, speed second | Baseline zero-result/recall/precision/latency, then `EXPLAIN`/`PROFILE` | ✓ |
| Do both simultaneously | Mix correctness and query tuning | |
| `EVT_EVENT` only | Test only current regression | |
| Latency only | Optimize speed without quality gates | |

**User's choice:** Correctness first, speed second after reference-query examples.

---

## Claude's Discretion

- Exact protocol field placement and safe UI wording.
- Exact graph package quota and deterministic scoring weights, subject to CONTEXT.md invariants.

## Deferred Ideas

None.
