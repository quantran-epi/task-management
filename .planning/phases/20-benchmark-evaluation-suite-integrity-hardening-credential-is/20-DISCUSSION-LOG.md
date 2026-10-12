# Phase 20: Benchmark Evaluation Suite, Integrity Hardening & Credential Isolation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-12
**Phase:** 20-Benchmark Evaluation Suite, Integrity Hardening & Credential Isolation
**Areas discussed:** Scoring and release gate, Benchmark case mix, Harness and reports, Integrity boundaries

---

## Scoring and release gate

### Pass/fail model

| Option | Description | Selected |
|--------|-------------|----------|
| Hybrid gates | Aggregate threshold, per-category gates, and zero-tolerance hard invariants | ✓ |
| Per-category gates | Each category controls pass/fail without an aggregate gate | |
| Aggregate threshold | One overall pass rate | |
| All cases pass | Require 100% of cases | |

**User's choice:** Hybrid gates.
**Notes:** Prevent easy exact-lookup cases from masking severe path, claim, or isolation failures.

### Release thresholds

| Option | Description | Selected |
|--------|-------------|----------|
| 90% + paths 100% | Overall ≥90%, each category ≥80%, three-hop answers ≥90%, path fidelity 100% | ✓ |
| 95% strict | Overall ≥95%, categories ≥90%, three-hop and path fidelity 100% | |
| 90% balanced | Overall ≥90%, categories ≥80%, three-hop and path fidelity ≥90% | |
| 100% all | Require every case to pass | |

**User's choice:** 90% + paths 100%.
**Notes:** Deterministic path fidelity is stricter than semantic answer success.

### Zero-tolerance invariants

| Option | Description | Selected |
|--------|-------------|----------|
| All trust invariants | Claims, paths, conflicts, credential boundary, DLP boundary, and offline egress | ✓ |
| Answer integrity only | Claims, paths, and conflicts only | |
| Security isolation only | Credentials, DLP, and offline egress only | |
| Critical claims only | Fabricated material claim and credential leak only | |

**User's choice:** All trust invariants.
**Notes:** Any violation fails release regardless of aggregate score.

### Failure handling

| Option | Description | Selected |
|--------|-------------|----------|
| Collect all, no masking | Run all cases; retry diagnoses instability but cannot replace failure | ✓ |
| Fail fast on invariant | Stop on hard invariant only | |
| Fail fast always | Stop on first failure | |
| Retry then decide | Retry result replaces first result | |

**User's choice:** Collect all, no masking.
**Notes:** Nondeterministic pass-after-retry remains a failure.

---

## Benchmark case mix

### Suite size

| Option | Description | Selected |
|--------|-------------|----------|
| 40 risk-weighted | Preserve 20 cases and add 20 high-risk cases | ✓ |
| 50 comprehensive | Add 30 cases | |
| 30 minimum | Add only 10 cases | |
| 40 balanced | Divide cases evenly by category | |

**User's choice:** 40 risk-weighted.

### New-case allocation

| Option | Description | Selected |
|--------|-------------|----------|
| Risk-heavy proposal | 6 path, 4 semantic/scope, 3 conflict/abstention, 4 security/integrity, 3 rebuild/offline | ✓ |
| More three-hop | Allocate 10 cases to path coverage | |
| More security | Allocate 8 cases to security/isolation | |
| Even distribution | Divide new cases evenly | |

**User's choice:** Risk-heavy proposal.

### Fixture source

| Option | Description | Selected |
|--------|-------------|----------|
| Mixed fixtures | Pilot corpus for representative flows; synthetic fixtures for controlled rare failures | ✓ |
| Pilot corpus only | Use process `60000006` for every case | |
| Synthetic only | Use small generated fixtures only | |
| Separate suites | Keep security/recovery outside 40 benchmark cases | |

**User's choice:** Mixed fixtures.

### Expected contract

| Option | Description | Selected |
|--------|-------------|----------|
| Semantic contract | Validate outcome, facts, paths, sources, forbidden claims, and invariants | ✓ |
| Exact answer snapshot | Compare full generated prose | |
| Facts and paths only | Ignore sources and behavioral invariants | |
| Rubric judge | Use an LLM judge | |

**User's choice:** Semantic contract.
**Notes:** Wording may vary; evidence and path obligations may not.

---

## Harness and reports

### Maintainer entry point

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated npm command | `npm run benchmark` drives existing deterministic evaluator | ✓ |
| Vitest file only | Maintainer invokes test file directly | |
| Standalone CLI only | Replace Vitest with custom runner | |
| Both equal paths | Maintain two independent runners | |

**User's choice:** Dedicated npm command.

### Live provider evaluation

| Option | Description | Selected |
|--------|-------------|----------|
| Optional live smoke | Explicit opt-in, sanitized fixtures, separate advisory report | ✓ |
| No live mode | Deterministic replay only | |
| Live advisory in CI | Non-blocking provider CI job | |
| Live release gate | Provider output controls release | |

**User's choice:** Follow recommendation: optional live smoke.
**Notes:** Deterministic replay remains authoritative release gate.

### Report formats

| Option | Description | Selected |
|--------|-------------|----------|
| JSON + Markdown | Canonical schema-versioned JSON plus generated human report | ✓ |
| JSON + console | No saved Markdown report | |
| Markdown only | No machine-readable artifact | |
| Console only | No persisted report | |

**User's choice:** JSON + Markdown.

### Report retention

| Option | Description | Selected |
|--------|-------------|----------|
| CI artifacts, local ignored | Upload pass/fail reports; do not commit generated runs | ✓ |
| Commit latest report | Track only newest output | |
| Commit all reports | Track complete run history in Git | |
| No saved reports | Use stdout only | |

**User's choice:** CI artifacts, local ignored.

---

## Integrity boundaries

### Rebuild proof

| Option | Description | Selected |
|--------|-------------|----------|
| Semantic equivalence | Compare stable identities, facts, paths, provenance, conflicts, and gold results | ✓ |
| Exact storage snapshot | Require storage-level identity | |
| Query results only | Ignore underlying integrity | |
| Build success only | Check command completion only | |

**User's choice:** Semantic equivalence.

### DLP scope

**User's choice:** Keep this simple. Preserve Phase 16 publish scan and fresh-confirmation behavior; do not expand DLP to all chat/query traffic.
**Notes:** Optional live smoke uses sanitized fixtures. Remote providers stay off by default.

### Daemon secret storage

| Option | Description | Selected |
|--------|-------------|----------|
| Environment only | Provider and Neo4j secrets remain daemon environment variables | ✓ |
| OS keyring | Add platform credential manager | |
| Encrypted config file | Add local encrypted secret lifecycle | |
| Client supplies keys | Browser sends provider keys per request | |

**User's choice:** Environment only.

### Offline proof

| Option | Description | Selected |
|--------|-------------|----------|
| Full failure matrix | Disabled, refused, timeout, 401, invalid response, and zero-egress assertions | ✓ |
| Disabled + timeout | Cover two transport states | |
| Daemon absent only | Cover one state | |
| Manual verification | No automated proof | |

**User's choice:** Full failure matrix.

### Credential-isolation depth

**User's choice:** Simplify and focus on main usage flow.
**Notes:** No general sentinel scanning framework. Keep environment-only isolation and one small boundary regression check that representative API output and reports omit configured secret.

### Phase 19.1 and real Neo4j artifact

| Option | Description | Selected |
|--------|-------------|----------|
| Layered gate | Deterministic 40-case gate plus focused real-Neo4j integration subset | ✓ |
| All 40 on Neo4j | Run full suite against artifact | |
| Artifact smoke only | Readiness plus one query | |
| Defer decision | Choose after Phase 19.1 | |

**User's choice:** Layered gate.
**Notes:** User is building Phase 19.1 on another branch to integrate and deploy the real Neo4j artifact. Phase 20 starts afterward and consumes Phase 19.1's final runtime contract rather than guessing it.

---

## Claude's Discretion

- Exact case/report schema field names.
- Exact case selection within the agreed category allocation.
- Exact size of the real-Neo4j integration subset.
- Exact local report directory, CI artifact name, and optional live-smoke command name.

## Deferred Ideas

- DLP scanning for every AI chat/query request.
- OS keyring or encrypted config for daemon credentials.
- Live-provider evaluation as a release gate.
- Corpus expansion beyond process `60000006`.
