---
phase: quick
plan: 261027-0kl
subsystem: knowledge
tags: [docs, normalization, llm, zip-import, bm25, knowledge-graph, c06]
requires: []
provides:
  - "dist/c06-normalized.zip: 18 Markdown docs normalized to AI_KNOWLEDGE_DOC_PROMPT contract"
  - "Objective validator for one-H1 / hashtag-line / source-footer / size / fence rules"
affects:
  - .planning/quick/261027-0kl-chu-n-h-a-b-t-i-li-u-docs-c06-zip-theo-c/
tech-stack:
  added: []
  patterns:
    - "LLM-authored normalization; scripts limited to byte extraction, structural audit, ZIP packaging"
    - "Split at existing headings into --part-NN; every part self-sufficient (H1 + hashtags + footer)"
key-files:
  created:
    - dist/c06-normalized.zip
  modified: []
decisions:
  - "Normalization content produced only by LLM reviewers; Python used only for byte-exact extraction, structural checks and ZIP writing"
  - "Large sources split at existing H2/H3 boundaries; no table, code block or Mermaid split"
  - "Hashtag lines on continuation parts authored from source vocabulary present in that part"
metrics:
  duration: ~3h
  completed: 2026-10-27
  commit: be35ade
---

# Quick 261027-0kl: Chuẩn hóa `docs/c06.zip` cho TaskMate Summary

Normalized all 8 entries of `docs/c06.zip` into 18 Markdown documents following the
`AI_KNOWLEDGE_DOC_PROMPT` contract (`src/views/NotesView.tsx:63-159`) and packaged them
into `dist/c06-normalized.zip`. No import, no publish, no graph build by this task —
the user performs those manually.

## What Was Done

- Extracted all 8 ZIP entries byte-for-byte to `dist/c06-normalized-source/` (script
  performed only entry-name safety checks and raw byte writes).
- Produced `dist/c06-normalized/` (18 files) with LLM authors, then ran eight
  independent fidelity reviewers (one per source entry) that compared output against
  source and repaired drift.
- Applied a final structural repair pass so every file satisfies the TaskMate contract:
  exactly one H1 on line 1, a hashtag-only line as the second non-blank line, and a
  terminal `## Nguồn` + `- Đường dẫn nguồn: \`<entry>.md\`` footer.
- Packaged `dist/c06-normalized.zip` (18 entries at archive root, no directories).

## Split Map

| Source entry | Chars | Parts |
|---|---|---|
| `C06-01-TONG-QUAN-VA-NGHIEP-VU.md` | 23,513 | 1 |
| `C06-02-LUONG-KY-THUAT-JAVA.md` | 23,428 / 25,950 | 2 |
| `C06-03-STH-THE-CA-NHAN.md` | 16,617 / 18,761 / 11,535 / 8,141 / 10,237 | 5 |
| `C06-04-STH-THE-DOANH-NGHIEP.md` | 16,164 / 18,785 / 21,360 | 3 |
| `C06-05-DU-LIEU-GIAO-DICH-VA-VAN-HANH.md` | 16,270 / 14,510 / 11,502 / 9,435 | 4 |
| `C06-06-CHUNG-CU-CAU-HOI-VA-DIEM-BAT-THUONG.md` | 40,767 | 1 |
| `C06-SERVICE-JAVA-FLOW-D3AC56B.md` | 30,544 | 1 |
| `README.md` | 12,536 | 1 |

## Verification

`validate.py` (structural, objective) — all green:

- 8/8 source stems covered; ZIP entries match the validated file set byte-for-byte.
- One H1 first line, ≤120 chars, in every file.
- Hashtag-only second non-blank line matching the `smartIngestion` tag grammar.
- Terminal `## Nguồn` + exact `- Đường dẫn nguồn:` footer naming the source entry.
- Every file, table and fenced block < 50,000 chars; all fences balanced.
- No YAML frontmatter, no secrets, no tag > 50 chars.
- `docs/c06.zip` untouched (SHA-256 `1deff0a6…5713`).

Fidelity reviewers (independent, per source entry) reported 0 unsupported claims and 0
content omissions; invented hashtags and reworded prose introduced during authoring were
reverted to source wording.

## Deviations

- Continuation parts (`--part-02`+) initially lacked H1/hashtag lines and several files
  carried non-contract footers; both were repaired in a final pass. Repairs used only
  source vocabulary — no new facts, identifiers, relationships or dates.
- `C06-SERVICE-JAVA-FLOW-D3AC56B.md` had a stray provider-trace bullet in `## Nguồn`;
  removed so the footer is exactly the contract's two lines.
