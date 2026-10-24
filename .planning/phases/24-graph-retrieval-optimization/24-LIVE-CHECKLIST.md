---
phase: 24-graph-retrieval-optimization
plan: 08
slug: live-verification-checklist
status: pending-live-run
created: 2026-10-24
---

# Phase 24 — Live Verification Checklist (SC-8)

> Human checkpoint. Records **PASS / FAIL / BLOCKED** with metadata only:
> stage, outcome, counts, codes, latencies, exit codes.
> Never record tokens, query text, document content, endpoint URLs, stack traces, or Cypher.

## Recording rules

- **PASS** — observed live outcome matches the expected outcome and the command exits 0.
- **FAIL** — live stack responded but behavior/assertion was wrong. Record the failing code.
- **BLOCKED** — infrastructure or credentials unavailable. Record the exact content-free
  blocked message. **BLOCKED is a resumable incomplete state.** It does not satisfy Task 3,
  the plan, SC-8, or phase completion. Preserve evidence gathered so far and resume later.
- The offline self-check is a **preflight only**. It proves assertion logic; it can never
  substitute for live PASS.

## 1. Offline preflight (no Docker required)

```bash
node scripts/test-knowledge-live.mjs --self-check
```

- Expect exit **0** and `network_calls=0`.
- Expect injected invalid fixtures to be rejected (`missing_count`, `unknown_fallback`,
  `unknown_outcome`, `items_not_array`, `paths_not_array`, `degraded_not_boolean`,
  `unexpected_outcome`).
- Record: `exit=0`, fixture counts. **Not** live proof.

## 2. Environment (names only — never paste values)

Export in the shell, not in a file, chat, or commit:

| Variable | Purpose |
| --- | --- |
| `KNOWLEDGE_SERVER_URL` | Base URL of the local knowledge server |
| `KNOWLEDGE_SERVER_TOKEN` | Bearer token (required; there is no embedded default) |
| `KNOWLEDGE_ALLOWED_ORIGIN` | Origin allowed by the server CORS/authorization hook |

Optional: `LIVE_KNOWLEDGE=1` enables the Vitest live suite.

Record: `env=set` per variable. Never the values.

## 3. Start stack and confirm readiness

```bash
docker compose up -d
```

Wait for `taskmate-knowledge-server` health, then confirm the readiness endpoint reports
`neo4j`, `model`, and `vectorIndex` all true. Record only `readiness=ready`.

Missing Docker or an unreachable server is **BLOCKED** — stop here, do not continue.

## 4. Publish / rebuild / activate fixture-equivalent corpus

Run the live script; it publishes a two-document corpus, triggers rebuild, polls to READY,
and activates if needed:

```bash
npm run test:knowledge:live
```

Record: `publish=accepted rebuild=accepted build=ready activate=active`.

## 5. Live graph query families

The same run issues five families. Expect each family's outcome inside its allowed set:

| Family | Allowed outcome | Also check |
| --- | --- | --- |
| `direct_lookup` | `READY`, `SEED_ONLY` | `items > 0` |
| `writes_to` (`MAIN1.EVT_EVENT`) | `READY`, `DEGRADED`, `SEED_ONLY` | WRITES_TO fact present in preflight |
| `reads_from` (`MAIN1.FCL_CYCLE_COUNTER`) | `READY`, `DEGRADED`, `SEED_ONLY` | READS_FROM fact present in preflight |
| `seed_only_or_missing` | `SEED_ONLY`, `NO_EVIDENCE`, `NEEDS_CLARIFICATION` | no invented relation |
| `bounded_multi_hop` | `READY`, `DEGRADED`, `SEED_ONLY`, `NO_EVIDENCE` | path hops `1..3` |

Exit **0** = PASS. Exit **2** = BLOCKED (record message). Exit **1** = FAIL (record code).

Absent `MAIN1.EVT_EVENT` takes the bounded missing branch and skips the family — that is
not a failure, but record `family=writes_to skipped reason=CORPUS_ABSENT`.

## 6. AI Chat: writer evidence

In the app, ask about `MAIN1.EVT_EVENT`. Confirm the answer cites the writer package path
and WRITES_TO evidence, with citation chips resolving to published ranges.

Record: `ui=writer-evidence citations=N`.

## 7. AI Chat: seed-only rendering

Ask about an entity with no relations. Confirm:

- `Đã tìm thấy thực thể` title and limited-answer copy.
- `Thực thể: N · Cạnh: N · Đường dẫn: N` counts line.
- One `SeedEntityCard` per resolved seed, kind tag, URN code chip.
- No inferred relation, no "no evidence" copy, no degraded banner.
- `PartialSeedNotice` only when seeds were dropped.

Record: `ui=seed-only entities=N edges=0 paths=0`.

## 8. AI Chat: explicit find-related turn

Click `Tìm liên quan`. Confirm:

- Exactly **one** new user turn is appended with the fixed broader query.
- The original message and its grounding are byte-for-byte unchanged.
- A second click while pending sends no second request.

Record: `ui=find-related newTurns=1 originalUnchanged=true requests=1`.

## 9. Diagnostics disclosure

Expand the diagnostics panel and a stage row. Confirm only enums, timings, counts,
booleans, reason codes, and truncation/fallback flags appear — no query text, excerpts,
URLs, tokens, stack traces, or Cypher.

Record: `ui=diagnostics stages=N codes=N contentFree=true`.

## 10. Offline-first fallback

Disable the knowledge server (stop the container or turn off the setting), then query again
in AI Chat. Confirm local BM25 results still render, with `fallbackReason` set and no data
loss (existing notes/messages intact).

Record: `ui=offline-fallback localResults=N dataLoss=false`.

## 11. BLOCKED reporting

If steps 3–10 cannot be completed, record:

```text
SC-8: BLOCKED
- blocker: <env missing | stack unreachable | stack not ready | auth rejected | <other content-free reason>>
- evidence gathered: <steps completed with above metadata>
- not satisfied: Task 3, plan 24-08, SC-8, phase 24
```

Rules:

- Do **not** mark Task 3 done, do **not** claim SC-8, do **not** complete the phase.
- Preserve the offline self-check evidence gathered in step 1.
- Resume from step 3 once infrastructure is available; re-run steps 1–2 as preflight.

## Sign-off

| Step | Result | Evidence (metadata only) |
| --- | --- | --- |
| 1 Offline preflight | ⬜ | |
| 2 Environment | ⬜ | |
| 3 Readiness | ⬜ | |
| 4 Publish/build/activate | ⬜ | |
| 5 Query families | ⬜ | |
| 6 Writer evidence | ⬜ | |
| 7 Seed-only rendering | ⬜ | |
| 8 Find-related turn | ⬜ | |
| 9 Diagnostics disclosure | ⬜ | |
| 10 Offline fallback | ⬜ | |

**Result:** ⬜ PASS / ⬜ FAIL / ⬜ BLOCKED — only explicit live PASS satisfies SC-8.
