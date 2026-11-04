# Research Skill — Round-trip Design (Discussion Record)

**Status:** Design discussion only. No code written.
**Date:** 2026-10-30
**Prerequisite:** Phase 25.1 must complete first.
**Supersedes:** nothing. Extends Phase 25.1's SDLC artifact model.

---

## 1. Problem statement

Two hard constraints on TaskMate:

1. **TaskMate has no research tools.** No WebSearch, no WebFetch, no agentic loop. It talks to an LLM through `/v1/chat/completions` (OpenAI-compatible via `nineRouterClient.ts`), so Anthropic server-side `web_search` tool is unavailable.
2. **TaskMate has no filesystem read permission** — organizational policy. It cannot read a code project on the same machine to research it.

Therefore TaskMate cannot research. It must **author a research brief** and **consume the result**.

**User's intent (verbatim understanding):** when performing analysis — either a small standalone question or inside the SDLC flow — TaskMate emits a well-formed prompt that the user pastes into Claude Code. Claude Code researches (optionally using GSD agents), writes a file. The user feeds that file back into TaskMate once. TaskMate synthesizes total analysis from probe + research. Mirrors how GSD researches once before planning a phase.

---

## 2. Decision: three-phase sequential flow (NOT parallel)

```
Pha 1  PROBE      PL01 + PL02 + knowledge server + prior artifacts (revision cycle)
                  → Coverage / Gaps / Contradictions / Sufficiency
                  → persist, show user

Gate              sufficient            → skip straight to Pha 3 (no research)
                  partial / insufficient → show gaps + generated research prompt
                  user may: run research | skip | edit PL01/PL02

Pha 2  (outside TaskMate)  user runs prompt in Claude Code → file

Pha 3  SYNTH      Pha1 report + research artifact (+ PL01/PL02)
                  → Solution + Residual Gaps + Assumptions + Confidence
```

**Why sequential, not parallel:**

| | Parallel | Sequential |
|---|---|---|
| Research prompt source | the original question — broad, vague | the actual gap — narrow, precise |
| Duplication | re-searches what knowledge server already has | none |
| Noise | external evidence competes with internal conclusions | external evidence fills exact holes |

**Why not "full analysis first, then research":**
1. **Anchoring** — if AI writes conclusions first, research degenerates into confirmation. GSD's `research-philosophy.md` explicitly warns: "Research is Investigation, Not Confirmation."
2. **Token** — full synthesis = one large call. Pha 1 only needs retrieval + one small call (~200 output tokens).

Round-trip research is manual and not real-time, so sequential latency costs nothing.

---

## 3. Five rules that make this different from "research then ask AI again"

1. **Pha 1 may say no research is needed.** `sufficiency: sufficient` → no prompt generated. Research must be a refusable decision, not a default step. Otherwise research runs every time and you can never measure whether it helps.
2. **Contradictions are separated from Gaps.** Internal doc conflicts cannot be solved by web research. They are internal blockers — user must pick a side or edit PL01/PL02. If merged into gaps, AI researches the wrong place.
3. **Every gap carries a `decision_if_unresolved`.** So skipping research still produces a solution, just labelled with assumptions.
4. **Pha 3 must run when research is missing / absent / unparseable.** Never block the user; never pretend research exists.
5. **Research artifact becomes a node in the staleness DAG.** Reuses `stalenessDetector.ts` mechanism — research goes stale automatically when PL01/PL02/knowledge snapshot changes, enforcing "used exactly once".

**GapReport schema:**
```
{
  internal_coverage:  [topics with evidence + citations]
  gaps:               [{ topic, research_target, decision_if_unresolved }]
  contradictions:     [internal-only conflicts; research cannot fix these]
  sufficiency:        sufficient | partial | insufficient
  research_needed:    bool
}
```

**Gap quality rule:**
- ✗ "Cần biết thêm về ràng buộc hiệu năng"
- ✓ gap: "Chưa có ngưỡng latency chấp nhận được cho luồng tra cứu"
  research_target: "industry benchmark cho internal lookup API"
  decision_if_unresolved: "dùng p95 < 500ms theo mặc định team, đánh dấu [ASSUMED]"

**Pha 3 behavior by research state:**

| Research | Pha 3 |
|---|---|
| valid file | full synthesis with external citations |
| absent | synthesis from Pha 1 only; residual gaps surfaced; lower confidence |
| corrupt / `context_hash` mismatch | reject attach, warn, fall back to "absent" path |

**Pha 3 must re-synthesize, not append.** Not "old answer + research addendum" — that produces two voices and two confidence levels.

---

## 4. Separation of roles: knowledge server vs research

- **Knowledge server** = *your own* data (docs, graph, decisions). Already in the AI core via `runGroundedTurn`. Do not duplicate.
- **Research skill** = *external* knowledge: web, official docs, best practices, approach comparisons. Core does not have it.

Research scope is explicitly **web + official docs + best practices**, explicitly **excluding internal knowledge**. Keep one connection point: research output is citable and can later be ingested as a document into the knowledge server — manually, never automatically.

---

## 5. Claude Code web search mechanics (research on how the harness works)

**WebSearch** — a declared tool in the request; Anthropic runs it **server-side**:
- `tools: [{ type: "web_search_20250305", name: "web_search" }]`
- Returns `web_search_tool_result` (title, url, page_age, short snippet) + citations with `cited_text` ≤150 chars
- Pricing: **$10 per 1,000 searches** + token costs
- **US-only**; the underlying engine is Anthropic's own infrastructure, not exposed
- Params: `max_uses`, `allowed_domains`/`blocked_domains`, `user_location`
- Does NOT return full page content — snippets only

**WebFetch** — fetch URL → convert HTML to Markdown → **small model runs the prompt** over it:
- Returns a synthesized answer, not raw HTML
- Cache 15 minutes per URL
- Cannot access authenticated/private URLs; cannot reach localhost (hostname needs a dot)
- Does not auto-follow cross-host redirects (returns the redirect URL for a re-call)
- `offset` param for long pages
- Prompt must be specific — a narrow prompt loses detail

**Implication for TaskMate:** neither is reusable as an API. `ai_proxy_request` (`src-tauri/src/ai_proxy.rs:41`) only allows path `/v1/*`, so it would work for direct Anthropic Messages API (`api.anthropic.com/v1/messages` + `tools:[web_search]`) but that requires leaving 9router and locking to Anthropic models.

---

## 6. Tauri websearch options evaluated

Repo already routes all outbound HTTP through Rust commands with allowlists (`src-tauri/src/lib.rs:27-29`):
- `ai_proxy::ai_proxy_request` — path `/v1/*` only; https any host, http loopback only
- `jira_proxy::jira_proxy_request` — its own host allowlist
- `ai_proxy::graphiti_mcp_request` — MCP

Frontend calls via `tauriInvoke(...)` with `fetch` fallback in web dev (`src/services/ai/nineRouterClient.ts:19`).

| Option | Pros | Cons |
|---|---|---|
| **A. New Rust command `web_search_request`** (mirror `jira_proxy`) | no CORS, key in keyring, explicit provider-host allowlist, correct repo pattern, works with knowledge-server off | ~80 lines Rust + handler registration + tests |
| **B. New route on knowledge-server** | no Rust changes, reuse Node | violates constraint: knowledge daemon is optional → research dies when daemon is down |
| **C. fetch directly from webview** | zero infra | key exposed in webview, CORS unreliable, violates "Tauri is primary runtime" |

Recommendation was A, if in-app research is ever built.

**Provider comparison:**

| Provider | Endpoint | Returns | Notes |
|---|---|---|---|
| Tavily | `POST https://api.tavily.com/search` | `results[]` with title, url, `content` (extracted), score | Built for LLMs; returns clean content, no separate fetch/parse step. ~1000 free credits/month |
| Brave Search API | `GET https://api.search.brave.com/res/v1/web/search?q=` | `web.results[]` title, url, description, `extra_snippets`, header `X-Subscription-Token` | Own index; links + short snippets only → still needs fetch. ~2000 free queries/month |
| Exa | `POST https://api.exa.ai/search` | title, url, `text`/`highlights`, score | Neural/semantic — good for concept research, weak for fact lookup. Paid |

Not free scrapers (DuckDuckGo HTML, Google SERP) — fragile, anti-bot, not recommended. SearXNG = self-host, no key, lower quality.

**Tavily is the starting choice** if in-app research is built, because it returns content ready for synthesis. Architecture should be a `WebSearchProvider` interface (`search(query) → results[]`) so Brave/Exa/SearXNG can be added without changing call sites.

---

## 7. Round-trip design (the chosen approach)

### 7.1 Prompt Builder

Critical: the prompt must be **self-contained**. Claude Code runs in a different session and cannot see the TaskMate chat.

```
<research_id>   uuid — file naming, dedupe
<target>        repo/path to read (when researching code) — user confirms this slot
<mode>          sdlc-step | analysis
<question>      one question, unambiguous
<context>       TaskMate state summary: PL01/PL02/solution hash, chat thread
<locked>        already-decided items — research MUST NOT propose the opposite
<unknowns>      3–5 specific things to learn
<must_answer>   acceptance criteria for the research
<rules>         provenance tags, anti-hallucination, ≥2 sources for critical claims
<output>        hard schema + file path
```

`<locked>` is essential — this is how GSD uses CONTEXT.md to stop research from revisiting settled decisions. Without it, research re-proposes what was already chosen.

### 7.2 Output Contract

```md
---
research_id: <uuid>
mode: sdlc-step
question: ...
generated: 2026-10-30
context_hash: <sha256 TaskMate snapshot>
confidence: HIGH|MEDIUM|LOW
---

## Answer
<3–5 lines answering directly>

## Findings
- [VERIFIED: docs.x/y] claim...
- [CITED: url] claim...
- [ASSUMED] claim...

## Evidence for code
| file:line | what it shows |

## Assumptions
| # | claim | risk if wrong |

## Open Questions
1. what we know / what's unclear / recommendation

## Sources
### HIGH / ### MEDIUM / ### LOW
```

Mandatory `research_id` + `context_hash` → TaskMate knows which session the file belongs to and blocks wrong attaches.

### 7.3 Import Gate — three layers

1. **Zod schema** — missing frontmatter/sections → reject.
2. **Hash check** — `context_hash` differs from current snapshot → warn "this research was made from an older state" (reuses `stalenessDetector.ts` pattern).
3. **Trust tag** — entire content is `external/untrusted`. Does not enter facts, does not enter instructions. Enters only the evidence pool with its own label; goes through `groundedTurn` with a different citation schema from `internal`.

**Exactly once:** after attach, store `research_id` on the thread. Reuse → warn, no silent reuse. Re-research → new prompt, new id.

### 7.4 File transfer — three levels, pick the laziest

| Method | When | Code |
|---|---|---|
| Claude Code prints markdown in chat → user copies → paste into TaskMate | Best. **No FS access, no Claude Code file write.** Sidesteps the FS policy entirely. | textarea + parse |
| Claude Code writes file → user drags into webview | Long files (>1000 lines) | drag-drop handler |
| Claude Code writes file → user picks via dialog | `save_file_dialog`/`read_local_file_slice` exist but conflict with policy | skip |

**Paste is the primary path**; drag-drop is the fallback. Paste solves the policy problem outright.

### 7.5 Forcing good research in Claude Code

Offer two branches in the prompt:
- **A. GSD available** → `Spawn subagent gsd-phase-researcher with the brief below; or if no phase exists, run research to GSD standard and write RESEARCH.md`
- **B. No GSD** → `(1) identify what must be learned (2) read code with Read/Grep (3) WebSearch official docs (4) cross-check ≥2 sources (5) emit per schema`

Both use the same output contract so TaskMate does not need to know which path ran.

### 7.6 Reuse of existing code (no new engine)

`runGroundedTurn` (`src/services/ai/groundedTurn.ts:255`) already separates `retrieveFederated` → `packEvidence` → `synthesizeGroundedAnswer` (see `GroundedTurnDeps` at line 102).

- **Pha 1:** call `runGroundedTurn` with `mode: 'gap-probe'` → only swap the `synthesizeGroundedAnswer` prompt to return `GapReport` instead of `GroundedAnswer`. One flag, one prompt. Retrieval untouched.
- **Pha 2:** pure template. Input = `GapReport` + `<locked>` + context hash.
- **Pha 3:** normal `runGroundedTurn`; `packEvidence` accepts `externalResearch?: ResearchArtifact` as a source alongside `server`/`local`/`mcpRecords`.

`EvidencePack` already has 3 sources → add a 4th, `authority: 'external-research'`, own citation schema and trust tag. Matches Phase 25.1 D-32: "refactor only separates runtime outside the core".

**Open question:** Pha 1 uses the same model as Pha 3, or a smaller one? Same model → more accurate gaps but more tokens. Smaller → cheap but shallow gaps, and shallow gaps make the research prompt useless. **Leaning toward same model** — gap probe matters more than cost.

---

## 8. What GSD research actually does (and what is copyable)

### 8.1 Four layers

1. **Agent definition** — `~/.claude/agents/gsd-phase-researcher.md` (867 lines): frontmatter `tools:` + `effort: high`; XML sections `<role>`, `<philosophy>`, `<output_format>`, `<execution_flow>`.
2. **Code seam** — the agent does **not** choose providers or compute cache keys:
   ```
   agent → build research-plan JSON (questions + kind: docs|web|scrape)
         → `gsd-tools query research-plan --input ...`
   tool  → { items: [{question, key: sha256, cache: {hit, stale}, fetch: {provider, query}}] }
   agent → fetch per indicated provider
         → `gsd-tools query research-store put <key> --content <digest> --provider ... --confidence ...`
   ```
   Provider waterfall fixed in `~/.claude/gsd-core/bin/lib/research-provider.cjs`:
   ```
   docs:   context7 → ref → jina → websearch
   web:    exa → tavily → perplexity → brave → websearch
   scrape: firecrawl → jina
   ```
3. **Confidence computed in code**, not by feel (`classifyConfidence`):
   ```
   groundTruth (legitimacy=OK) + authority ≠ none  → HIGH
   authority official|scrape                       → MEDIUM
   authority web + verifiedAgainstOfficial         → MEDIUM
   otherwise                                       → LOW
   SLOP verdict                                    → LOW (always)
   ```
4. **Output contract** — hard RESEARCH.md schema. This repo's own CLAUDE.md "Technology Stack" section (Core/Supporting/Alternatives tables + HIGH confidence + Sources) is copied from that template.

### 8.2 Prompt-only, copyable today

| Mechanism | Applies as |
|---|---|
| Provenance tags `[VERIFIED: source]` / `[CITED: url]` / `[ASSUMED]` | forces AI to separate knows vs guesses |
| Package name rule — names found via WebSearch must be `[ASSUMED]` even if `npm view` succeeds | anti-slopsquat / anti-hallucination |
| Negative claims need evidence — never say "X is not supported" without checking official docs | most common research error |
| Multiple sources for critical claims | |
| Assumptions Log table — every `[ASSUMED]` in one place with "Risk if Wrong" | turns weakness into a reviewable list |
| Open Questions — "what we know / what's unclear / recommendation" | |
| Honest reporting — "couldn't find X" is a valuable result | anti-padding |
| Training = hypothesis — never assert library capabilities without checking docs | |
| Sources split into three tiers by authority | |
| Deliberate query pattern — 2–3 targeted searches (domain-researcher) | |
| Do not inject the year into queries — biases toward stale dated content | |

### 8.3 Not copyable (needs infrastructure)

- `research-plan` / `research-store` / `classify-confidence` — CLI + cache. Round-trip has no equivalent.
- Legitimacy gate (`npm view`, `gsd-tools package-legitimacy check`) — but round-trip **can ask Claude Code to run those Bash commands itself**. That is why round-trip is stronger than Tavily.

### 8.4 What to take for TaskMate

Take **discipline**, drop **sections**. GSD's research schema targets coding phases (stack, pitfalls, package audit); TaskMate research is domain/analysis and does not need `Standard Stack`.

Prompt skeleton:
```md
<role>Bạn là research agent...</role>
<scope>CHỈ web + official docs + best practices. KHÔNG dùng kiến thức nội bộ.</scope>
<provenance>mỗi claim tag [VERIFIED:|CITED:|ASSUMED]</provenance>
<rules>
- Negative claim phải có official docs, nếu không → "chưa xác minh"
- Claim critical cần ≥2 nguồn
- Không inject năm vào query
- Không tìm thấy > bịa
</rules>
<output>
frontmatter: research_id, question, generated, context_hash, confidence
## Findings  (mỗi claim 1 dòng + tag + source)
## Assumptions   (table: claim | risk if wrong)
## Open Questions
## Sources   (HIGH / MEDIUM / LOW)
</output>
```

This is exactly the format needed for parse-back at import, and it matches the output contract in §7.2.

**Key structural insight:** GSD separates "the agent decides what to research" from "the system decides where to fetch + how to cache". Round-trip has no seam — replace it with **validation at import**: parse `[ASSUMED]` + Assumptions table, count sources, reject files missing frontmatter. Fail validation → do not attach.

---

## 9. Comparison: round-trip vs in-app

| | Prompt round-trip | Tavily in-app |
|---|---|---|
| Code | prompt template + parser + attach (~small) | Rust command + client + settings + prompt |
| Quality | high (agentic, multi-step, can read code) | medium (one search) |
| Real-time | no | yes |
| Cost | 0 | $/search |
| Key risk | 0 | must manage keyring |
| FS read for code research | yes (Claude Code runs in the repo) | no — impossible under policy |

**Round-trip wins on 5 of 7 rows and is the only option that satisfies the FS constraint.** Do round-trip first. In-app search can come later as a fallback when no Claude Code session is available; it is also the only way to validate whether research actually improves output before investing further.

---

## 10. Assessment of the SDLC approach (asked during this session)

**Verdict: good technically, questionable in purpose.**

**What is right (do not change):**
1. D-31/D-32 — do not write a new AI engine. Best decision in the whole document. Reuse `runGroundedTurn` + `runAiOrchestratorLoop`, only separate runtime.
2. D-24/D-25 — immutable versions + active pointer, stale read-only. Without this, revision loops overwrite history and audit becomes impossible.
3. Staleness via DAG hash (`stalenessDetector.ts:19`) — **the real value**. "I changed PL02, what is now stale?" is a genuine question even for one user, and most document tools cannot answer it.
4. D-21 — preview diff before commit. Correct, no auto-overwrite.

**Warnings:**
1. **Churn signal.** Phase 25 just shipped; 25.1 is "hardening" with 35 decisions across 9 plans. Shipping then hardening 35 points immediately means the original spec was incomplete, not that the code was buggy. Scope is self-expanding.
2. **Two state machines coexisting** — `wizardCoordinator.ts` (762 lines) and `workflowCoordinator.ts` (307 lines). Plus the drawer itself merging state. See §11.
3. **Who reads these documents?** PL01/PL02/SOLUTION/PL03B/PL07/CAB exist to **communicate between roles**. You are one person. If nobody receives the documents, the value is not the artifact — it is the **discipline of analysis**. If the wizard is mainly "generate 7 documents", it is ritual. If it is "I keep changing my mind — tell me what breaks", it is real. The current spec leans toward the former.
4. **AI rewrites sources into documents.** D-19 (citations + conflict warnings) is a good mitigation, but the document is still an **interpretation**, not the source of truth. You must review every line to use it — and reviewing 7 documents costs more than writing by hand. Only worth it if documents are reused many times.
5. **Complexity budget.** 108,558 lines of src, 394 files, 527 test files, 24 phases — for "one personal user" (CLAUDE.md constraint). Adding research round-trip on top. There is no stopping point; each new feature makes the rest harder to change.

**What should change:** stop asking "does the wizard have enough steps"; ask **"which steps do I actually reuse?"** If only 2 of 6 steps have value, cut 4. PL01/PL02 intake + staleness/impact have value. CAB (change advisory board) for one person is pure ritual — there is no board. PL07 is an operations document — who operates? 25.1 has 9 plans to **add** behaviour; there should be 1 plan to **delete** unused steps.

**Relationship to research:** two different problems, do not merge them.
- **SDLC** = consistency of **internal** state over time.
- **Research** = **external** knowledge not present on the machine.

Research round-trip **does not fix** SDLC's biggest weakness (artifacts nobody reads, multi-layer state machines). It only adds one more evidence source. Do not use it to avoid the question "what is this document for?".

**Recommended order:**
1. Finish 25.1.
2. Inspect state authority — how many places hold workflow state? If >1, merge. Research attached to dispersed state multiplies errors.
3. Count which SDLC steps were actually used over 2 weeks. Cut the rest.
4. Start research only **after** one real analysis has run through `groundedTurn` without research — otherwise there is no baseline to measure improvement against.

---

## 11. State authority — checked, findings

### 11.1 Not two coordinators, two different axes

| | `wizardCoordinator.ts` (762) | `workflowCoordinator.ts` (307) |
|---|---|---|
| State | `WizardRuntimeState` — **one wizard stage runtime** | `SdlcWorkflowState` — **whole-SDLC state machine** |
| Holds | snapshot, draftRevision, AbortController, generation, approval, export blob | `currentStep`, `artifacts{}`, `staleSteps[]` |
| Role | run one wizard stage (PL02/PL03B/PL07), edit, export docx | step transitions, artifact hashing, staleness |
| Lifetime | `dispose()` on skill/project change — **ephemeral** | `saveState`/`loadState` — **persistent** |

`SdlcWorkflowState` is the large map; `WizardRuntimeState` is a cursor inside one cell of that map. Not duplicated responsibility — but there **were** two state sources, plus the drawer.

### 11.2 State sources before 25.1 (three, becoming four)

```
SdlcWorkflowState    ← workflowCoordinator holds in memory + save/load
                     ← SdlcWorkflowHub receives via `state?` prop
                     ← AIChatDrawer holds its own?
WizardRuntimeState   ← wizardCoordinatorRef in AIChatDrawer
                     ← wizardSnapshot state in AIChatDrawer
refreshed state      ← drawer merges itself (AIChatDrawer.tsx:933 `if (isNewer) setWizardSnapshot(refreshed)`)
```

25.1 adds per-tab runtime (D-05, D-32) → fourth layer if the merge is not removed.

### 11.3 25.1 does address it — in plan 03

| Plan | Work | Req |
|---|---|---|
| 01 | ChatTab model + SCHEMA_V14 + repo + SQLite parity. Durable tab identity/active pointer | D-01–04, D-07, D-28 |
| 02 | Replace shared drawer execution state with **per-tab runtime/request ownership**; atomic commit boundary | D-05–D-15, D-32 |
| 03 | **Durable `SdlcWorkflowState`**: checkpoint, immutable versions, cycles, active baseline, exact stale propagation; wrapper D-34 owns step/cycle/checkpoint | D-09, D-20–27, D-34 |
| 04 | Hub UI: vertical timeline, selected/current split, multi-Note PL01/PL02 picker, revision preview/impact modal | D-16–21, D-25–27 |
| 05 | Tab bar + drawer wiring: durable tabs, concurrent runs, per-tab badges, InterruptedBanner, no prompt leak across tabs | D-01–17, D-31, D-33, D-35 |
| 06–07 | Backup/restore: tabs, checkpoints, cycles, revision pointers; validate before write; backfill legacy backups | D-28–30 |
| 08–09 | Real E2E + static safety gates (no canonical localStorage, no secrets, no partial commit) | all 35 |

`25.1-03` key_links:
```
AIChatDrawer ↔ workflowCoordinator  via saveState/loadState   (per SDLC tab/thread)
workflowCoordinator → stalenessDetector  (validated emit recomputes stale steps)
artifactRepo → workflowCoordinator  (active pointer selects baseline; old Notes stay readable)
```

After 25.1: `workflowCoordinator` is the **source of truth**, persisted in Dexie, drawer holds a read copy. `wizardCoordinator` remains the **stage executor** — plan 03 says explicitly "calls existing `runWizardStage`", no new engine. The two coordinators stop overlapping. `SdlcWorkflowHub` already takes `state?` via prop — correct one-way direction.

### 11.4 Three residual risks

**RESOLVED 2026-10-31 — Phase 25.1 merged to master (`01b2b81`).** Verification after merge:

1. **~~Drawer still merges.~~ Resolved — false alarm.** `AIChatDrawer.tsx:1039` still has `isNewer → setWizardSnapshot(refreshed)`, but that refreshes `wizardSnapshot`, which is a **read-model** derived from messages via `deriveActiveWizard(messages, ...)`, not a competing authority. `SdlcWorkflowState` has exactly one writer: `createSdlcWorkflowCoordinator({ saveState, loadState, onStateChange })` at `AIChatDrawer.tsx:~898-920`, writing to `db.settings` under `sdlc_workflow:{projectId}:{threadId}` and calling `setSdlcWorkflowState`. Single writer confirmed.
2. **`probe`/`research` attach point — confirmed.** `SdlcWorkflowState.artifacts{}` + `stalenessDetector` chain. The design in this document already matches; no change needed.
3. **No plan deletes anything.** All 9 plans add. The question "does anyone use CAB" remains open.

**New finding — the actual PROBE insertion point.** `handleStartSdlcWorkflow` (`AIChatDrawer.tsx:~923-940`) currently sends **a hardcoded analysis prompt straight to the AI immediately after intake**, with no gap probe and no user decision:

```ts
const prompt = `[Quy trình SDLC - Khởi tạo SOLUTION cho CR: ${metadata.cr}] ...`;
void handleSendMessageRef.current(prompt);
```

This direct auto-send is exactly what Pha 1 (PROBE) should replace: intake → probe → gate → (optional research) → synth. It is the single highest-leverage edit in the whole research design, and it is one function.


---

## 12. Concrete integration plan (deferred)

**Correction to initial assessment:** initially I said 25.1's state handling was unverified. It is now verified (see §11.3). `workflowCoordinator` will be the single writer after 25.1, provided risk 1 in §11.4 is addressed.

**Add to `SdlcWorkflowState`:**
```ts
artifacts: {
  pl01, pl02,
  probe?: ProbeReportRef,          // new
  research?: ResearchArtifactRef,  // new
  solution, ...
}
```

**Add to `stalenessDetector.ts` DAG:**
```
PL01, PL02 → PROBE
PROBE + RESEARCH → SOLUTION
RESEARCH stale when context_hash(PL01, PL02, knowledge snapshot) changes
```

This enforces "used exactly once" automatically — an old research file cannot be reused for a new context, and the system knows it.

**Why round-trip matches the existing architecture:** research becomes an **artifact with a version like every other artifact**, not a loose file.

**Pha 1 must also include the prior solution artifact** when in a revision cycle (D-26). Otherwise the revision loses why the previous round chose what it chose and re-proposes from scratch. Pha 1 must answer "what did the previous round decide, and is it still correct".

---

## 13. Open questions (unresolved)

1. Prompt generated 100% by TaskMate, or interactive (ask "what needs research" first)?
2. `<target>` repo path — typed each time, or saved as default per project?
3. Imports per analysis — one file, or multiple (e.g. two different research topics)?
4. Prompt branch A — is GSD installed in the user's Claude Code, or always fall back to branch B?
5. Pha 1 model — same as Pha 3, or smaller? (leaning: same)
6. Does any external authority read the SDLC documents (PL07, CAB), or is the wizard discipline only? (determines whether to delete steps)

---

## 14. Constraints honoured

- TaskMate stays 100% local; no new server required.
- Tauri is the primary runtime; PWA behaviour not touched.
- No secrets in frontend; no new API key for round-trip (zero keys).
- Research file is untrusted external data — never promoted to facts or instructions.
- Claude Code is the research executor, so code-project research works even though TaskMate cannot read the filesystem.
