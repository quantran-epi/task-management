---
status: awaiting_human_verify
trigger: "câu trả lời hiển thị trên telegram format markdown chưa tốt lắm, vbsi dụ thông tin trong dấu ``, hiển thì mã nguồn và đối tượng không rõ và focus, kiểm tra xem tại sao"
created: 2026-10-24
updated: 2026-10-24
---

# Debug: Telegram Markdown formatting

## Symptoms

- Expected: Inline code enclosed by backticks has clear background/type styling; code blocks remain readable; object names receive visible emphasis.
- Actual: Backtick content loses formatting or appears as ordinary text; code and object names are difficult to distinguish.
- Errors: No observed Telegram bot, knowledge daemon, or browser-console error. Messages send successfully.
- Timeline: Always reproducible; no known formerly working state.
- Reproduction: Send any answer containing inline backtick content or source code through Telegram.

## Current Focus

- hypothesis: CONFIRMED (round 2). Baseline formatter/splitter gaps fixed earlier; specialist review found four residual gaps: (1) `applyEmphasis` emitted generated `<blockquote>`/header `<b>`/`<a>` tags across open emphasis, producing cross-nested HTML; (2) `safeSplitPosition` could cut `&amp;` mid-entity or between a UTF-16 surrogate pair; (3) link URLs went into `href` unescaped, so a `"` broke the attribute; (4) Rust `strip_html_tags` had no unit coverage.
- test: All four fixed in `D:\personal\task-management`; exact reported cases added as tests.
- expecting: 51 telegram tests pass, tsc clean; Rust tests authored but not compiled (cargo absent).
- next_action: await user confirmation in real Telegram chat (live rendering and Rust compile path unverified here).
- reasoning_checkpoint:
  - hypothesis: "`applyEmphasis` treated generated structural tags as opaque text, so emphasis spans opened before a `<blockquote>`/`<b>`/`<a>` stayed open across that tag, yielding cross-nested invalid HTML; the splitter only guarded tag interiors, not character references or surrogate pairs; the link URL was interpolated into `href` without escaping `\"`."
  - confirming_evidence:
    - "`> *quote\\noutside*` -> `<blockquote><i>quote</blockquote>\\noutside</i>` before round-2 fix (invalid nesting)."
    - "`# *a\\nb*` -> `<b><i>a</b>\\nb</i>` before round-2 fix."
    - "`[a*b](https://e.com) c*` -> `<a href=\"https://e.com\">a<i>b</a> c</i>` before round-2 fix."
    - "`[x](https://a/\"b)` -> `<a href=\"https://a/\"b\">x</a>` before round-2 fix: malformed/injectable attribute."
    - "`safeSplitPosition` returned the raw split index for positions inside `&amp;` and between surrogate halves."
  - falsification_test: "If any of the three reported renderings came out balanced after the barrier change, or any split chunk still ended in a partial entity / lone surrogate, the hypothesis would be wrong. Tests now assert the exact expected strings and full-chunk integrity; all pass."
  - fix_rationale: "Treating generated tags as stack barriers guarantees every chunk is well-nested regardless of where Markdown emphasis starts, which is what prevents Telegram's 400 and the plain-text fallback. Entity/surrogate guards keep each chunk independently sendable over JSON IPC. Escaping `\"` in href removes the malformed-attribute path."
  - blind_spots: "Rust unit tests authored but never compiled or executed — `cargo` is not on PATH in this environment. Live Bot API rendering still unverified."

## Eliminated

- hypothesis: Telegram bot disables HTML parse_mode or sends Markdown parse_mode.
  evidence: `send_telegram_reply` sends `parse_mode: "HTML"`; browser path does the same; replies reach chat without API errors.
  timestamp: 2026-10-24

- hypothesis: Answer text is post-processed and backticks stripped before formatting.
  evidence: `cleanCitationTags` removes only `[S1]`/`[M1]` style tags; formatter receives raw answer including backticks.
  timestamp: 2026-10-24

## Evidence

- timestamp: 2026-10-24
  checked: `src/services/telegram/telegramHtml.ts` formatter pipeline and `splitTelegramMessage` in `telegramHeadlessWorker.ts`
  found: Emphasis regexes used `[^*\n]`, so multi-line bold never converted; nesting untracked, so `**a *b* c**` left literal `**`; tables untouched; splitter not HTML-aware.
  implication: LLM answers using multi-line bold, nested emphasis, or tables show raw Markdown on Telegram.

- timestamp: 2026-10-24
  checked: Formatter output for 18 realistic Vietnamese DB-answer samples via tsx probe.
  found: `**Tổng quan\nChi tiết**`, `**Đây là *quan trọng* cần nhớ**`, `**Các cột chính:\n- A\n- B**`, and pipe tables remained literal Markdown; blockquotes became `&gt;`.
  implication: Formatting gap is in conversion, not generation.

- timestamp: 2026-10-24
  checked: Fuzzed 4000 combinations of markdown atoms for tag balance.
  found: 220 invalid outputs from crossing markers such as `**...** ~~**x**~~`; Telegram rejects unbalanced HTML with 400.
  implication: Rejection triggers plain-text fallback and loses all styling.

- timestamp: 2026-10-24
  checked: `splitTelegramMessage` on long single elements.
  found: Inline code 5000 chars -> chunk 1 unclosed `<code>`, chunk 2 stray `</code>`; bold and fences behave the same.
  implication: One long element breaks two Telegram sends.

- timestamp: 2026-10-24
  checked: `src-tauri/src/telegram_gateway.rs` fallback path.
  found: Fallback stripped only exact `<b>`, `<i>`, `<code>`, `<pre>`, `<s>`; `<code class="language-sql">`, `<a href=...>`, `<blockquote>` survived into plain text.
  implication: Users saw source markup, matching "hiển thị mã nguồn".

- timestamp: 2026-10-24
  checked: Existing tests `tests/telegram/telegramHtml.test.ts` (8 tests).
  found: All passed; covered only single-line, non-nested emphasis.
  implication: Test gap allowed the regression; added multiline/nested/table/blockquote/split-balance tests.

- timestamp: 2026-10-24
  checked: Fix verification: `npx vitest run tests/telegram src/services/telegram` and `npx tsc --noEmit -p tsconfig.json`.
  found: 7 files / 72 tests pass; tsc clean. End-to-end probe: realistic answer converts with zero literal `**`/`~~`, table as aligned `<pre>`, blockquote tag, 4 balanced chunks at max 3989 chars.
  implication: Root cause addressed at formatter, splitter, and fallback.

- timestamp: 2026-10-24
  checked: Specialist review probes against the round-1 fix.
  found: `> *quote\noutside*`, `# *a\nb*`, and `[a*b](https://e.com) c*` all produced cross-nested invalid HTML because generated structural tags passed through `applyEmphasis` while emphasis stayed open; `[x](https://a/"b)` produced a broken/injectable `href`; `safeSplitPosition` could truncate `&amp;`/`&lt;` and split surrogate pairs.
  implication: Even with nesting-aware emphasis, structural tags acted as invisible boundaries; invalid HTML still triggered Telegram 400 and the plain-text fallback.

- timestamp: 2026-10-24
  checked: Round-2 fix verification in `D:\personal\task-management`.
  found: `npx vitest run tests/telegram/telegramHtml.test.ts tests/telegram/telegramHeadlessWorker.test.ts` -> 2 files, 51 tests pass (was 45; 6 added). `npx tsc --noEmit -p tsconfig.json` -> exit 0. Rust `#[cfg(test)]` module added for `strip_html_tags`, not compiled (`cargo` not found on PATH).
  implication: All four reported gaps covered by tests; Rust coverage is authored but unexecuted.

## Resolution

- root_cause: `markdownToTelegramHtml` used single-pass regexes that excluded newlines, could not nest emphasis, and ignored pipe tables/blockquotes, producing literal Markdown and cross-nested invalid HTML; `applyEmphasis` then let generated `<blockquote>`/header `<b>`/`<a>` tags pass through open emphasis spans, so structural tags cross-nested too; link URLs were interpolated into `href` unescaped; `splitTelegramMessage` cut HTML at arbitrary indexes, leaving unbalanced tags, truncated character references, or lone surrogates in a chunk; Telegram then rejected the chunk with 400 and the Rust fallback resent it as plain text, where its narrow tag strip left `<code class=...>` and `<a href=...>` visible. Inline-code styling and object-name emphasis were lost, and source markup leaked into chat.
- fix: Nesting-aware, multi-line emphasis tokenizer; generated tags now act as stack barriers (close open emphasis, emit tag, reopen emphasis); `"` escaped as `&quot;` in link URLs; pipe tables rendered as aligned `<pre>` and `>` blockquotes supported; `splitTelegramMessage` is tag-aware and additionally backs a split out of a truncated character reference (to the `&`) and off a high/low surrogate boundary, closing/reopening open tags per chunk; Rust fallback uses a generic tag stripper with attributes and entity unescape; Rust unit tests added for attribute stripping, entity decoding, and `&amp;lt;` single-decode order.
- verification: `npx vitest run tests/telegram/telegramHtml.test.ts tests/telegram/telegramHeadlessWorker.test.ts` -> 2 files, 51 tests pass (adds exact cases `> *quote\noutside*`, `# *a\nb*`, `[a*b](https://e.com) c*`, `[x](https://a/"b)`, entity split, surrogate split). `npx tsc --noEmit -p tsconfig.json` -> clean. Rust tests authored but NOT compiled or run: `cargo` is not on PATH in this environment. Live Telegram rendering not exercised here.
- files_changed: [src/services/telegram/telegramHtml.ts, src/services/telegram/telegramHeadlessWorker.ts, src-tauri/src/telegram_gateway.rs, tests/telegram/telegramHtml.test.ts, tests/telegram/telegramHeadlessWorker.test.ts]
