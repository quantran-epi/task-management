# Phase 19: Grounded Assistant, Provenance Citations & Offline Fallback - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves alternatives considered.

**Date:** 2026-10-11
**Phase:** 19-grounded-assistant-provenance-citations-offline-fallback
**Areas discussed:** Answer contract, Citations and paths, Conflicts and inference, Offline fallback, Federated retrieval scope and routing, Document order and provenance, Model-degraded behavior, Scope variation versus conflict, Scoped local fallback, Document-set metadata, Historical citations

---

## Answer Contract

### Citation granularity

| Option | Description | Selected |
|--------|-------------|----------|
| Per claim | Every material claim has an immediate citation; sources may be grouped | ✓ |
| Per paragraph | One citation group supports a paragraph | |
| End of answer | Sources appear only after the answer | |

**User's choice:** Per claim. Exact claim-to-source traceability.

### Derived claims

| Option | Description | Selected |
|--------|-------------|----------|
| Graph path only | Derivation requires a valid graph path, `INFERRED`, and citations per hop | ✓ |
| Graph and text | Combine graph paths and multiple text chunks | |
| Direct claims only | Forbid all derived claims | |

**User's choice:** Graph path only.

### Partial evidence

| Option | Description | Selected |
|--------|-------------|----------|
| Partial answer | Answer supported portions and list unsupported portions | ✓ |
| Abstain entirely | Refuse any question with partial evidence | |
| Clarify first | Narrow every partial question | |

**User's choice:** Partial answer with explicit unsupported portions.

### Clarification candidates

| Option | Description | Selected |
|--------|-------------|----------|
| Candidate chips | Safe resolved name/kind chips; hide URN in details | ✓ |
| Text list with URNs | Numbered text choices | |
| Auto-select top | Pick highest-ranked candidate | |

**User's choice:** Candidate chips. Selecting retries with resolved URN; no synthesis before selection.

### Default structure

| Option | Description | Selected |
|--------|-------------|----------|
| Answer-first, expandable | Concise cited answer before paths/evidence | ✓ |
| Evidence-first | Evidence/paths before conclusion | |
| Single Markdown stream | Mix all content | |

**User's choice:** Answer-first, expandable. Fits 320–650 px drawer.

### Language and quotes

| Option | Description | Selected |
|--------|-------------|----------|
| Query language | Respond in query language; preserve identifiers/quotes | ✓ |
| Always Vietnamese | Always explain in Vietnamese | |
| Source language | Follow strongest-evidence language | |

**User's choice:** Query language. Source quotes unchanged.

### Missing or unsupported evidence

| Option | Description | Selected |
|--------|-------------|----------|
| Explain and suggest | Explain outcome; 1–3 safe refinement chips | ✓ |
| Status only | No next-step suggestions | |
| General chat fallback | Model answers from general knowledge | |

**User's choice:** Explain and suggest. General model knowledge cannot replace corpus evidence.

### Pipeline activation

| Option | Description | Selected |
|--------|-------------|----------|
| Automatic intent routing | Knowledge and operational intents route independently | ✓ |
| Manual mode | Require explicit Knowledge mode | |
| Every question | Always invoke retrieval | |

**User's choice:** Automatic routing. Mixed requests may use both while knowledge claims remain grounded.

### Low-confidence routing

| Option | Description | Selected |
|--------|-------------|----------|
| Ask clarification | Knowledge-search vs PlannerMate-operation chips | ✓ |
| Prefer knowledge | Run retrieval first | |
| Prefer current chat | Current tool harness decides | |

**User's choice:** Ask clarification. No unintended retrieval or mutation.

---

## Citations and Paths

### Citation click behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Exact range preview | QuickPreviewDrawer at section/range with highlight and snapshot warning | ✓ |
| Open full document | No range navigation | |
| Excerpt popover first | Excerpt before full preview | |

**User's choice:** Exact range preview with line-numbered raw excerpt. Snapshot mismatch stays explicit.

### Inline citation label

| Option | Description | Selected |
|--------|-------------|----------|
| Short number plus details | Inline `[1]`; metadata in tooltip/focus and Sources | ✓ |
| Source name plus lines | Document and line range inline | |
| Section name | Section inline | |

**User's choice:** Short number plus details. Dedupe repeated references per answer.

### Graph path layout

| Option | Description | Selected |
|--------|-------------|----------|
| Vertical step card | Responsive node/relation/node steps with classification and citations | ✓ |
| Horizontal chain | Scrollable row | |
| Hop table | From/Relation/To/Evidence columns | |

**User's choice:** Vertical step card. No color-only cues.

### Multiple paths

| Option | Description | Selected |
|--------|-------------|----------|
| Primary plus alternatives | Open primary; collapse alternatives; no primary during conflict | ✓ |
| Show all | Expand all paths | |
| Best path only | Hide alternatives | |

**User's choice:** Primary plus alternatives within one snapshot. Cross-snapshot paths never concatenate.

---

## Conflicts and Inference

### Conflict conclusion policy

| Option | Description | Selected |
|--------|-------------|----------|
| Do not pick a side | All branches, citations, scope; verify requested | ✓ |
| Prefer classification | BUSINESS_APPROVED > OBSERVED > INFERRED wins | |
| Prefer newest | Newest source wins | |

**User's choice:** Do not pick a side.

### Conflict dimension

| Option | Description | Selected |
|--------|-------------|----------|
| Classify with evidence | Version/Environment/Behavior/Unknown only when proven | ✓ |
| Single Conflict label | No distinction | |
| Model classifies | LLM infers conflict type | |

**User's choice:** Classify with structured evidence only.

### Classification visibility

| Option | Description | Selected |
|--------|-------------|----------|
| Claim plus each hop | INFERRED badge on derived claim; classification on every hop | ✓ |
| Citation detail only | Hide in source details | |
| Badge every claim | Classification badge on all claims | |

**User's choice:** Claim plus each hop. Mixed claim uses weakest classification.

### Degraded retrieval

| Option | Description | Selected |
|--------|-------------|----------|
| Compact banner plus details | Answer from remaining evidence with coverage explanation | ✓ |
| Block answer | Refuse if any modality fails | |
| Status icon only | No default explanation | |

**User's choice:** Compact banner plus expandable diagnostics.

---

## Offline Fallback

### Fallback activation

| Option | Description | Selected |
|--------|-------------|----------|
| Automatic with banner | Local BM25 runs automatically; capability loss disclosed | ✓ |
| Ask first | Require confirmation | |
| Retry only | No fallback | |

**User's choice:** Automatic with persistent banner.

### Local synthesis

| Option | Description | Selected |
|--------|-------------|----------|
| Bounded | Synthesize only from selected snippets with local citations | ✓ |
| Search results only | Never synthesize prose | |
| Whole documents to model | Send all matched documents | |

**User's choice:** Bounded synthesis. Weak evidence returns ranked results only.

### Failover matrix

| Option | Description | Selected |
|--------|-------------|----------|
| Unavailable/transport only | Disabled/absent/network/timeout | ✓ |
| All errors and NO_EVIDENCE | Any failure or empty server result | |
| OS offline only | Browser offline flag | |

**User's choice:** Unavailable/transport only. Auth/config/invalid-response remain visible.

### Local citation identity

| Option | Description | Selected |
|--------|-------------|----------|
| L-prefix plus Local badge | `[L1]` with Local and changed/unpublished status | ✓ |
| Same numbering | Normal `[1]` with tooltip | |
| No citations | Link results without citations | |

**User's choice:** L-prefix plus Local badge. Opens current local range; no immutable snapshot claim.

---

## Federated retrieval scope and routing

### Natural-language questions vs set selection

| Option | Description | Selected |
|--------|-------------|----------|
| Mandatory dropdown | User chooses one set before asking | |
| Remember last set | Reuse one prior set | |
| Automatic federated retrieval | User asks normally; system resolves and searches independently pinned sets | ✓ |

**User's choice:** No mandatory dropdown. Internal `setId` stays internal.

### Scope model

| Option | Description | Selected |
|--------|-------------|----------|
| Hard-coded BASE + SIT/UAT/PROD | Environment-only model | |
| Facets only | Flexible metadata without set relations | |
| Facets plus relations | Domain/module/environment/version/tags + EXTENDS/SUPPLEMENTS/SUPERSEDES | ✓ |
| Parent-child hierarchy | One inheritance tree | |

**User's choice:** Flexible facets plus relations. Normal UI uses friendly presets.

### Natural-language scope interpretation

| Option | Description | Selected |
|--------|-------------|----------|
| Deterministic aliases only | Phrase catalog maps language to canonical scope | |
| LLM semantic router | Small structured call interprets intent/scope/comparison; app resolves sets | ✓ |

**User's choice:** LLM router primary; aliases degraded fallback. Router returns canonical values only; never invents `setId`.

### General vs environment-specific questions

| Option | Description | Selected |
|--------|-------------|----------|
| BASE first | Add scoped sets only when question asks or expansion needed | ✓ |
| BASE plus all environments | Maximum coverage, high noise | |
| Single closest set | Flexible but unpredictable | |

**User's choice:** BASE first; add scoped sets when named. Environment comparisons stay as parallel snapshot paths.

### Partial federated failure

| Option | Description | Selected |
|--------|-------------|----------|
| Return supported evidence | Preserve successful scopes, abstain on failed | ✓ |
| Local fallback for failed scope only | Mix published and local | |
| Block whole answer | Require all scopes success | |

**User's choice:** Return supported portions.

### Fan-out limit

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed Top 3 | Search exactly three sets | |
| Search all sets | Maximum recall, unbounded | |
| Progressive tiers | REQUIRED → LIKELY → OPTIONAL under budgets | ✓ |

**User's choice:** Progressive expansion. Exact caps are implementation discretion; Phase 20 calibrates.

---

## Document order and provenance

### Meaning of document order

| Option | Description | Selected |
|--------|-------------|----------|
| Presentation only | UI/preview order only | ✓ |
| Authority priority | Earlier wins | |
| Processing order | Reorder affects first-seen provenance | |

**User's choice:** Presentation only.

### Reorder publication

| Option | Description | Selected |
|--------|-------------|----------|
| Separate presentation revision | Keep graph/content snapshot; record metadata revision | ✓ |
| New graph snapshot | Rebuild on reorder | |
| Local-only order | Daemon never sees order | |

**User's choice:** Separate presentation revision; no graph rebuild.

### Repeated entity sources

| Option | Description | Selected |
|--------|-------------|----------|
| All supporting source occurrences | Representative chosen by evidence quality | ✓ |
| One user-designated canonical | Manual authority | |
| Stable first source | Deterministic but weak | |

**User's choice:** All supporting sources. `firstSeenInDoc` is not authority or citation.

---

## Model-degraded behavior

### Valid evidence but model unavailable

| Option | Description | Selected |
|--------|-------------|----------|
| Show ranked evidence | Preserve evidence and citations without prose | ✓ |
| Show error only | Hide evidence | |

**User's choice:** Show ranked evidence.

### Recovery after model returns

| Option | Description | Selected |
|--------|-------------|----------|
| User-triggered synthesis from stored evidence | Explicit action; stable history | ✓ |
| Auto synthesis | Content appears unexpectedly | |
| Require question resend | Discard scope/evidence | |

**User's choice:** "Tạo câu trả lời từ bằng chứng" uses exact stored evidence. "Tra cứu lại" retrieves current snapshots.

### Invalid structured answer

| Option | Description | Selected |
|--------|-------------|----------|
| Evidence plus safe synthesis error | Never render invalid prose | ✓ |
| Raw model text | Bypass grounding | |
| Generic error | Hide valid evidence | |

**User's choice:** Evidence plus safe error and retry.

### Semantic router offline, scope ambiguous

| Option | Description | Selected |
|--------|-------------|----------|
| Search related BASE | Deterministic alias fallback; ask when multiple domains plausible | ✓ |
| Search every set | High noise, high latency | |
| Block retrieval | Make model a hard dependency | |

**User's choice:** Search related BASE under alias fallback; ask when ambiguous.

---

## Scope variation and conflicts

### Variation classification

| Option | Description | Selected |
|--------|-------------|----------|
| Require structured scope evidence | Environment variation only when metadata/evidence proves scope | ✓ |
| Set name is enough | Any PROD-set difference counts as scoped | |
| Every difference is conflict | No intentional variation state | |

**User's choice:** Require structured scope evidence.

### Override semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Require explicit override proof | SUPERSEDES/override relation or cited evidence required | ✓ |
| Environment automatically wins | PROD always overrides BASE | |
| Never say override | Always parallel | |

**User's choice:** Require explicit proof.

### Same-scope contradiction

| Option | Description | Selected |
|--------|-------------|----------|
| Conflict with no winner | Show every branch and require verification | ✓ |
| Stronger evidence class wins | Classification picks winner | |
| Newest source wins | Timestamp picks winner | |

**User's choice:** Conflict with no winner.

### Non-contradictory scoped difference

| Option | Description | Selected |
|--------|-------------|----------|
| Environment variation label | Neutral label when metadata proves scope | ✓ |
| Conflict: Environment | Always treat as conflict dimension | |
| No label | Hide inside differences only | |

**User's choice:** Neutral "Khác biệt theo môi trường" label.

---

## Scoped local fallback

### Local search scope

| Option | Description | Selected |
|--------|-------------|----------|
| Local members of resolved sets | Search BASE + selected environment members only | ✓ |
| All local documents | Maximum recall, cross-scope contamination | |
| Disable scoped fallback | No offline answer for environment questions | |

**User's choice:** Local members of resolved sets.

### Duplicate local membership

| Option | Description | Selected |
|--------|-------------|----------|
| One evidence, multiple scopes | Dedupe UUID + range; metadata lists memberships | ✓ |
| Duplicate per set | Repeat same source | |
| Assign one set | Hide other memberships | |

**User's choice:** One evidence record with all memberships.

### Partial local evidence

| Option | Description | Selected |
|--------|-------------|----------|
| Supported BASE, abstain PROD | Never infer PROD equals BASE | ✓ |
| Assume PROD equals BASE | Fill missing scope with baseline | |
| Only ranked results | No synthesis unless every scope has evidence | |

**User's choice:** Supported BASE answered, missing PROD abstained.

---

## Document-set metadata

### Existing test sets

| Option | Description | Selected |
|--------|-------------|----------|
| Build compatibility migration | Preserve unclassified legacy sets | |
| Delete and rebuild | No real data; delete sets, rebuild from canonical documents | ✓ |

**User's choice:** No migration. Test sets will be rebuilt.

### New sets

| Option | Description | Selected |
|--------|-------------|----------|
| Require basic scope | Domain + friendly purpose preset | ✓ |
| Allow unclassified | Classify later | |

**User's choice:** Require basic scope for every new set.

---

## Historical citations

### Republished snapshots

| Option | Description | Selected |
|--------|-------------|----------|
| Keep original snapshot citation | Historical answer stays auditable | ✓ |
| Retarget to newest snapshot | Current content replaces old evidence | |
| Hide old answer | Remove access after republish | |

**User's choice:** Keep original snapshot IDs and metadata.

### Citation preview

| Option | Description | Selected |
|--------|-------------|----------|
| Snapshot excerpt first | Original evidence first; local current content with warning | ✓ |
| Current local first | Latest content first | |
| Snapshot only | No current local context | |

**User's choice:** Snapshot excerpt first.

### Snapshot retention cleanup

| Option | Description | Selected |
|--------|-------------|----------|
| Persist bounded cited excerpt | Old evidence inspectable after cleanup | ✓ |
| Citation unavailable | Store IDs only | |
| Retain every snapshot forever | Unbounded daemon retention | |

**User's choice:** Persist bounded excerpt and show "snapshot no longer available" when daemon has cleaned up.

### Refreshing an answer

| Option | Description | Selected |
|--------|-------------|----------|
| New "Tra cứu lại" answer | Preserve old answer for comparison | ✓ |
| Replace old answer | Lose history | |
| Auto-refresh history | Background mutation | |

**User's choice:** New turn; keep old unchanged.

---

## Claude's Discretion

- Exact accessible styling, spacing, icons, animation.
- Exact semantic-router prompt and confidence thresholds.
- Initial progressive-retrieval concurrency, timeout, set-count, item-count, evidence-size budgets.
- Exact primary-path ordering within one snapshot and alternative limits.
- Weak-local-evidence threshold and snippet budget.
- Refinement-chip wording/ordering, capped at three.

## Deferred Ideas

- Phase 20 benchmark, claim/path verification, index rebuild checks, credential-isolation hardening, federated-routing calibration.
- Automatic alias learning without explicit confirmation.
- Interactive graph canvas and manual graph editing.
- Full card-system corpus beyond process `60000006`.
- General model-knowledge fallback when corpus evidence is absent.
