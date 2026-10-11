# Phase 19: Grounded Assistant, Provenance Citations & Offline Fallback - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-11
**Phase:** 19-Grounded Assistant, Provenance Citations & Offline Fallback
**Areas discussed:** Answer contract, Citations and paths, Conflicts and inference, Offline fallback

---

## Answer Contract

### Citation granularity

| Option | Description | Selected |
|--------|-------------|----------|
| Per claim | Every material claim has an immediate citation; sources may be grouped | ✓ |
| Per paragraph | One citation group supports a paragraph | |
| End of answer | Sources appear only after the answer | |
| Claude decides | Planner selects the minimum rule | |

**User's choice:** Per claim.
**Notes:** Required for exact claim-to-source traceability.

### Derived claims

| Option | Description | Selected |
|--------|-------------|----------|
| Graph path only | Derivation requires a valid graph path, `INFERRED`, and citations per hop | ✓ |
| Graph and text | Combine graph paths and multiple text chunks | |
| Direct claims only | Forbid all derived claims | |
| Claude decides | Planner sets inference boundary | |

**User's choice:** Graph path only.
**Notes:** No free synthesis of new facts across unrelated chunks.

### Partial evidence

| Option | Description | Selected |
|--------|-------------|----------|
| Partial answer | Answer supported portions and list unsupported portions | ✓ |
| Abstain entirely | Refuse the complete answer if any part lacks evidence | |
| Clarify first | Ask the user to narrow every partially supported question | |
| Claude decides | Planner chooses by coverage | |

**User's choice:** Partial answer.
**Notes:** Missing evidence remains explicit.

### Clarification candidates

| Option | Description | Selected |
|--------|-------------|----------|
| Candidate chips | Show safe resolved name/kind chips; hide URN in details | ✓ |
| Text list | Show numbered text choices with URNs | |
| Auto-select top | Choose the highest-ranked candidate | |
| Claude decides | Planner chooses UI | |

**User's choice:** Candidate chips.
**Notes:** Selecting a chip retries with resolved URN; assistant does not answer before selection.

### Default structure

| Option | Description | Selected |
|--------|-------------|----------|
| Answer-first, expandable | Concise cited answer before expandable paths and evidence | ✓ |
| Evidence-first | Evidence and paths before conclusion | |
| Single Markdown flow | Mix all content into one Markdown stream | |
| Claude decides | Planner chooses responsive structure | |

**User's choice:** Answer-first, expandable.
**Notes:** Optimized for current 320–650 px drawer.

### Language and quotes

| Option | Description | Selected |
|--------|-------------|----------|
| Query language | Respond in query language; preserve identifiers and source quotes | ✓ |
| Always Vietnamese | Always explain in Vietnamese | |
| Source language | Follow language of strongest evidence | |
| Claude decides | Planner chooses | |

**User's choice:** Query language.
**Notes:** Original source quotes must remain unchanged.

### Missing or unsupported evidence

| Option | Description | Selected |
|--------|-------------|----------|
| Explain and suggest | Explain outcome and show one to three safe refinement chips | ✓ |
| Status only | Show no next-step suggestions | |
| General chat fallback | Let model answer from general knowledge | |
| Claude decides | Planner chooses | |

**User's choice:** Explain and suggest.
**Notes:** General model knowledge cannot replace missing corpus evidence.

### Pipeline activation

| Option | Description | Selected |
|--------|-------------|----------|
| Automatic intent routing | Route knowledge and operational intents to their respective pipelines | ✓ |
| Manual mode | Require explicit Knowledge mode | |
| Every question | Always invoke retrieval | |
| Claude decides | Planner chooses | |

**User's choice:** Automatic intent routing.
**Notes:** Mixed requests may use both pipelines while knowledge claims remain grounded.

### Low-confidence routing

| Option | Description | Selected |
|--------|-------------|----------|
| Ask clarification | Offer knowledge-search versus PlannerMate-operation chips | ✓ |
| Prefer knowledge | Run read-only retrieval first | |
| Prefer current chat | Let existing model/tool harness decide | |
| Claude decides | Planner chooses fail-safe | |

**User's choice:** Ask clarification.
**Notes:** No unintended retrieval or mutation before selection.

---

## Citations and Paths

### Citation click behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Exact range preview | Open QuickPreviewDrawer at section/range with highlight and snapshot warning | ✓ |
| Open full document | Open document without range navigation | |
| Excerpt popover first | Show excerpt before optional full preview | |
| Claude decides | Planner chooses reuse approach | |

**User's choice:** Exact range preview.
**Notes:** Current local content differing from cited snapshot must be explicit.

### Inline citation label

| Option | Description | Selected |
|--------|-------------|----------|
| Short number plus details | Inline `[1]`; metadata in tooltip/focus and Sources | ✓ |
| Source name plus lines | Show document and line range inline | |
| Section name | Show section inline | |
| Claude decides | Planner chooses responsive label | |

**User's choice:** Short number plus details.
**Notes:** Citation registry deduplicates repeated references per answer.

### Graph path layout

| Option | Description | Selected |
|--------|-------------|----------|
| Vertical step card | Responsive node/relation/node steps with classification and citations | ✓ |
| Horizontal chain | Scrollable graph-like row | |
| Hop table | From/Relation/To/Evidence columns | |
| Claude decides | Planner chooses component | |

**User's choice:** Vertical step card.
**Notes:** Do not rely on color alone.

### Multiple paths

| Option | Description | Selected |
|--------|-------------|----------|
| Primary plus alternatives | Open primary path; collapse alternatives; no primary during conflict | ✓ |
| Show all | Expand all paths | |
| Best path only | Hide alternatives | |
| Claude decides | Planner chooses ordering | |

**User's choice:** Primary plus alternatives.
**Notes:** Conflicted paths follow neutral conflict policy.

---

## Conflicts and Inference

### Conflict conclusion policy

| Option | Description | Selected |
|--------|-------------|----------|
| Do not pick a side | Present all branches, citations, scope, and request verification | ✓ |
| Prefer classification | Choose BUSINESS_APPROVED, then OBSERVED, then INFERRED | |
| Prefer newest | Choose newest source | |
| Claude decides | Planner selects policy | |

**User's choice:** Do not pick a side.
**Notes:** No primary conclusion from conflicted evidence.

### Conflict dimension

| Option | Description | Selected |
|--------|-------------|----------|
| Classify with evidence | Use Version, Environment, Behavior, or Unknown only when proven | ✓ |
| Single Conflict label | Do not distinguish dimensions | |
| Model classifies | Let LLM infer conflict type | |
| Claude decides | Planner chooses taxonomy | |

**User's choice:** Classify with evidence.
**Notes:** Model must not invent metadata.

### Classification visibility

| Option | Description | Selected |
|--------|-------------|----------|
| Claim plus each hop | Derived claim shows INFERRED; every path hop shows classification | ✓ |
| Citation detail only | Hide classification in source details | |
| Badge every claim | Show a badge beside all claims | |
| Claude decides | Planner balances readability | |

**User's choice:** Claim plus each hop.
**Notes:** Mixed claim uses weakest supporting classification.

### Degraded retrieval

| Option | Description | Selected |
|--------|-------------|----------|
| Compact banner plus details | Answer from remaining evidence; explain missing modalities and coverage | ✓ |
| Block answer | Refuse if any modality fails | |
| Status icon only | Show no default explanation | |
| Claude decides | Planner chooses warning | |

**User's choice:** Compact banner plus details.
**Notes:** Degraded coverage does not invalidate returned evidence.

---

## Offline Fallback

### Fallback activation

| Option | Description | Selected |
|--------|-------------|----------|
| Automatic with banner | Run local BM25 automatically and disclose lost graph/vector capability | ✓ |
| Ask first | Require confirmation before local search | |
| Retry only | Do not fallback | |
| Claude decides | Planner chooses local-first behavior | |

**User's choice:** Automatic with banner.
**Notes:** User need not resend the query.

### Local synthesis

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, bounded | Synthesize only from selected snippets with local claim citations | ✓ |
| Search results only | Never synthesize prose | |
| Whole documents to AI | Send all matched documents | |
| Claude decides | Planner sets provenance ceiling | |

**User's choice:** Yes, bounded.
**Notes:** No graph/path claims, conflict resolution, or claims outside snippets. Weak evidence returns search results only.

### Failover matrix

| Option | Description | Selected |
|--------|-------------|----------|
| Unavailable/transport only | Fallback for disabled, absent, network, or timeout states | ✓ |
| All errors and NO_EVIDENCE | Fallback for every failure and empty server result | |
| OS offline only | Fallback only when browser reports offline | |
| Claude decides | Planner chooses | |

**User's choice:** Unavailable/transport only.
**Notes:** Auth/config/invalid response stays visible; valid server outcomes remain authoritative.

### Local citation identity

| Option | Description | Selected |
|--------|-------------|----------|
| L-prefix plus Local badge | Use `[L1]`; show Local and changed/unpublished status | ✓ |
| Same numbering | Use normal `[1]` with tooltip distinction | |
| No citations | Link results without claim citations | |
| Claude decides | Planner chooses distinction | |

**User's choice:** L-prefix plus Local badge.
**Notes:** Local citation opens current local range and never claims immutable snapshot provenance.

---

## Claude's Discretion

- Exact accessible styling, spacing, icons, and animation.
- Exact intent-classifier rules and confidence threshold, subject to clarification fail-safe.
- Exact primary-path ranking and alternative limits.
- Exact weak-local-evidence threshold and snippet budget.
- Exact refinement-chip copy and ordering, capped at three.

## Deferred Ideas

- Phase 20 benchmark, path/claim verification, index rebuild checks, and credential-isolation hardening.
- Interactive graph canvas and manual graph editing.
- Full card-system corpus beyond process `60000006`.
- General model-knowledge fallback when evidence is absent.
