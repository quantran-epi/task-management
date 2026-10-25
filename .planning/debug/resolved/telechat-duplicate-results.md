---
status: resolved
trigger: "telechat có vẻ đang hiển thị lặp kết quả trong câu trả lời. @docs/tauri.localhost_tele_duplicate.har"
created: 2026-10-24
updated: 2026-10-24
---

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

hypothesis: CONFIRMED - `formatGroundedAnswerForTelegram` emits conclusion AND claim bullets, while main UI (`GroundedAnswerCard`) renders claims only when claims exist. Structural mismatch causes duplication.
test: Replay exact HAR entry 15 payload through formatter; assert conclusion prose absent and each fact once.
expecting: Before fix conclusion + 2 bullets; after fix bullets only.
next_action: Done. Session resolved and verified; ready for commit.
reasoning_checkpoint:
  hypothesis: "Formatter duplication is structural: it prints conclusion then claims, unlike GroundedAnswerCard which prints claims INSTEAD of conclusion."
  confirming_evidence:
    - "HAR entry 17 reply: conclusion paragraph followed by two bullets restating same ISS_DATE/REISSUE_DATE facts."
    - "GroundedAnswerCard.tsx lines 452-463: claims.length > 0 ? render ClaimBlocks : render conclusion prose."
    - "Formatter emitted both unconditionally; prior dedup was a fuzzy heuristic patch on that structural bug."
  falsification_test: "If formatter already chose claims XOR conclusion, HAR payload would produce single copy."
  fix_rationale: "Match main UI structure: claims replace conclusion when claims exist; delete dedup heuristic entirely."
  blind_spots: "Answers with claims become bullet-only, losing narrative conclusion prose. Accepted: identical to in-app UI behavior."
tdd_checkpoint:

## Symptoms

- expected: Each Telechat message displays one copy of each result in the answer.
- actual: Telechat appears to display repeated results in every answer.
- errors: No visible errors.
- timeline: Always duplicated; no known working version.
- reproduction: Send any Telechat message. Use `docs/tauri.localhost_tele_duplicate.har` as network evidence.

## Evidence
<!-- APPEND only - facts discovered -->

- timestamp: 2026-10-24
  checked: HAR entry list
  found: 19 entries; exactly one `send_telegram_reply` (entry 17) and one grounded synthesis call — no duplicate sends, no duplicated server payload.
  implication: Duplication originates in client answer formatting, not transport/retry.

- timestamp: 2026-10-24
  checked: HAR entry 17 reply text
  found: conclusion sentence, then two bullet claims restating the same ISS_DATE/REISSUE_DATE facts, then MCP source line.
  implication: `formatGroundedAnswerForTelegram` emits both conclusion and redundant claim bullets.

- timestamp: 2026-10-24
  checked: HAR entry 15 grounded answer
  found: conclusion is a paraphrase; normalized claims C1/C2 are NOT substrings of normalized conclusion (token coverage 0.72 and 0.67).
  implication: strict `normConclusion.includes(normClaim)` dedup cannot match paraphrases.

- timestamp: 2026-10-24
  checked: `formatGroundedAnswerForTelegram` in src/services/telegram/telegramHeadlessWorker.ts
  found: redundancy filter only performs substring check gated by `normClaim.length > 15`.
  implication: paraphrase-safe overlap check is missing.

- timestamp: 2026-10-24
  checked: `GroundedAnswerCard.tsx` READY branch (lines 452-495)
  found: main UI renders `claims.map(ClaimBlock)` when claims exist, else conclusion prose. Never both.
  implication: formatter divergence is the real root cause; dedup heuristic was a patch over it.

- timestamp: 2026-10-24
  checked: `docs/tauri.localhost_tele_duplicate.har` entry 15 request + response
  found: synthesis returned conclusion + 2 claims (C1 ISS_DATE, C2 REISSUE_DATE); entry 17 reply contains conclusion paragraph then same facts as bullets.
  implication: exact regression fixture available; conclusion-or-claims rule alone removes duplication.

## Eliminated
<!-- APPEND only - prevents re-investigating -->

- hypothesis: Duplicate Telegram sends / retry duplication.
  evidence: HAR has exactly one send_telegram_reply invocation and one grounded answer; no repeated requests.
  timestamp: 2026-10-24

- hypothesis: Server returned duplicated claims/evidence.
  evidence: HAR grounded answer contains 2 distinct claims, each appearing once; duplication appears only in the formatted reply.
  timestamp: 2026-10-24

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause: "Structural divergence from main UI. `formatGroundedAnswerForTelegram` always emitted conclusion AND claims; `GroundedAnswerCard` emits claims INSTEAD of conclusion when claims exist. Synthesis paraphrases conclusion into claims, so every fact appeared twice."
fix: "Replaced fuzzy dedup with structural rule matching GroundedAnswerCard: if claims non-empty, render claim bullets only; else render conclusion. Removed substring/Dice heuristic entirely."
verification: "Red confirmed against exact HAR entry-15 payload (conclusion + 2 bullets before fix). Green: 3/3 telegramFormat, 31/31 telegramHeadlessWorker+telegramFormat, 63/63 tests/telegram + src/services/telegram, 30/30 src/services/ai, tsc --noEmit exit 0. HAR fixture now renders each fact exactly once."
files_changed: [src/services/telegram/telegramHeadlessWorker.ts, src/services/telegram/__tests__/telegramFormat.test.ts, tests/telegram/telegramHeadlessWorker.test.ts]
