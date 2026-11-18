---
status: complete
quick_id: 261115-u1e
phase: quick-261115-u1e
plan: '01'
type: execute
wave: 1
requirements: [AIO-READ-06]
files_modified:
  - src/services/ai/office/teamPrompts.ts
  - src/services/ai/aiTools.ts
  - src/services/ai/office/teamRunCoordinator.ts
  - tests/services/ai/office/teamPrompts.test.ts
  - tests/ai/chatTurnTools.test.ts
  - tests/services/ai/office/teamRunCoordinator.test.ts
  - .planning/ROADMAP.md
  - .planning/REQUIREMENTS.md
  - .planning/phases/42-read-only-git-inspection-for-the-reviewer-agent/42-CONTEXT.md
metrics:
  tasks: 3
  completed: 2026-11-15
---

# Quick 261115-u1e: Shared anti-fabrication block + read-only Oracle tools for team agents

One exported Vietnamese anti-fabrication rule block now reaches both team prompts, and the read-only Oracle pair is advertised to lead and employee only while the Oracle AI Tool is enabled.

## Task 1 — One anti-fabrication block, both team builders

Commit `8e780ecb`.

- `src/services/ai/office/teamPrompts.ts`: new exported `ANTI_FABRICATION_BLOCK` (`[QUY TẮC CHỐNG BỊA DỮ LIỆU]`, five numbered rules). Rule 3 requires naming the source actually read (itemId / turnId / document id / tool). Rule 4 is the controlled carve-out: proposals, hypotheses and forecasts only when the user asks, each prefixed `[ĐỀ XUẤT]` or `[DỰ ĐOÁN]` and never mixed into a factual claim. Rule 5 forbids claiming a tool ran without its result.
- Wired as its own `parts` entry in both builders: employee right after `[CHÍNH SÁCH CHỈ ĐỌC]`, lead right after `[QUY TẮC ĐIỀU HÀNH NHÓM]`. One constant, two references — no restated rules.
- `tests/services/ai/office/teamPrompts.test.ts`: two new cases assert verbatim presence in both prompts, the `[ĐỀ XUẤT]`/`[DỰ ĐOÁN]`/`itemId` markers, and that the AI Chat panel's absolute `NEVER GUESS` wording is deliberately not reused.

## Task 2 — Read-only Oracle tools, gated on the config

Commit `26f0eeed`.

- `src/services/ai/aiTools.ts`: exported `ORACLE_READ_TOOLS`, filtered from `AI_DATABASE_TOOLS` on `oracle_query`/`oracle_describe` — definitions not duplicated, neither added to `MUTATION_TOOLS`.
- `src/services/ai/office/teamRunCoordinator.ts`: new `oracleReadTools()` returns `ORACLE_READ_TOOLS` only when `(await getOracleToolConfig(db)).enabled === true`, else `[]`. `leadTools()` and `employeeTools()` became async and spread it last; the two call sites became `await`. Read per payload, not cached, so a mid-session toggle reaches the next turn. `refreshMcpTools()` untouched.
- Tests: `chatTurnTools.test.ts` asserts the pair is exactly `oracle_describe`/`oracle_query` and neither is a mutation; `teamRunCoordinator.test.ts` captures both payloads, asserts neither name appears by default, then writes `saveOracleToolConfig({ ...DEFAULT_ORACLE_CONFIG, enabled: true }, db)` and asserts both payloads carry both names.

## Task 3 — Phase 42 documentation

Commit `85b2b03c`.

- `.planning/ROADMAP.md` §Phase 42: goal now covers Oracle read; `**Requirements**` gains `AIO-READ-06`; success criterion 3 added (read-only `oracle_query`/`oracle_describe`, advertised only while enabled, nothing when disabled); scope note records the 2026-11-15 addition under the same read-only boundary.
- `.planning/REQUIREMENTS.md`: `AIO-READ-06` added under `### Read-Only Git Inspection (AIO-READ) — Phase 42`.
- `42-CONTEXT.md`: `### Oracle read` subsection with decision `D-13` (code gate, not prompt wording, identical boundary to git read), scope list gains the Oracle tool gate, "không gồm" gains no-Oracle-write and no-SQLcl-UI-change. Canonical reference line updated to 3 success criteria.

## Test results

```
npx vitest run tests/services/ai/office/teamPrompts.test.ts \
                tests/ai/chatTurnTools.test.ts \
                tests/services/ai/office/teamRunCoordinator.test.ts
Test Files  3 passed (3)
     Tests  223 passed (223)
  Duration  54.37s
```

```
npx tsc --noEmit
(no output — clean)
```

Scoped runs only; the full suite was never invoked.

## Deviations from Plan

None. No AI Chat panel code touched, no dependency added, no Dexie table added, no new source file created.

## Known Stubs

None.

## Threat Flags

None. `oracle_query`/`oracle_describe` already enforce read-only (`SET TRANSACTION READ ONLY`) and return a structured error when disabled; this change only widens payload advertisement behind a config gate.
