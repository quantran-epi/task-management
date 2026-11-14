---
phase: 39-skill-versioning-enrichment-approval
reviewed: 2026-11-14T15:40:00Z
depth: standard
files_reviewed: 21
files_reviewed_list:
  - src/services/ai/untrustedData.ts
  - src/services/ai/office/teamPrompts.ts
  - src/services/ai/office/teamTools.ts
  - src/services/ai/office/teamRunCoordinator.ts
  - src/services/ai/chatTurnTools.ts
  - src/services/ai/aiOrchestratorLoop.ts
  - src/services/ai/aiTools.ts
  - src/services/ai/patchProposal.ts
  - src/services/ai/mcpClient.ts
  - src/db/repositories/aiSkillVersionRepo.ts
  - src/db/repositories/aiOfficeRepo.ts
  - src/components/ai/office/PendingSkillProposals.tsx
  - src/components/ai/office/SkillEditorDrawer.tsx
  - src/components/ai/office/SkillCard.tsx
  - src/views/AiOfficeView.tsx
  - src/workbench/toolwindows/AiStaffExplorer.tsx
  - tests/services/ai/office/teamPrompts.test.ts
  - tests/services/ai/office/teamTools.test.ts
  - tests/services/ai/office/aiSkillVersionRepo.test.ts
  - tests/components/ai/office/PendingSkillProposals.test.tsx
  - tests/components/ai/office/SkillEditorDrawer.test.tsx
findings:
  critical: 2
  warning: 2
  info: 1
  total: 5
status: issues_found
---

# Phase 39: Code Review Report (pass 7)

**Reviewed:** 2026-11-14T15:40:00Z
**Depth:** standard
**Files Reviewed:** 21
**Status:** issues_found

## Summary

Seventh pass, scoped to round 6 (`2110830b..bf994a4c`) and the orchestrator's own delimiter commit `d0907828`. Every claim below was reproduced with throwaway Vitest probes against the real modules (deleted afterwards; `git status` clean) or with a standalone Node harness over the exact regex literal.

**Round-6 fixes that genuinely hold** (verified, not read):

| Finding | Verification |
|---|---|
| WR-03 union fold | `[\p{Cf}\p{Default_Ignorable_Code_Point}]` is present at `untrustedData.ts:57`; the five regressed code points (U+070F, U+0600, U+FFF9, U+13430, U+110BD) all redact through the real `wrapUntrusted`, and the test table pins them. |
| WR-02 allowlist gate | The gate at `aiOrchestratorLoop.ts:448-464` is real: `advertisedToolNames` is derived from the turn's own `tools`, `executeToolFn` is never called for an unadvertised DB tool, and the refusal is returned as a `tool` message. Verified by the new loop tests and by reading the dispatch order (mutation gate → allowlist gate → dispatch). |
| WR-01 five fields | `get_linked_context` now wraps `stickyNotes[].title`, `item.reminderNote`, `item.reminders[].note`, `item.documentLinks[]`, `crName`, `systemName` — confirmed by probe on the real handler. |
| CR-01 round 6 bracketed branch | Nested `[`, a `]` inside the label, a missing `]`, a tag split across the `[`, and text after the closing bracket all redact. The bracketed branch is complete. |
| `i` flag vs `\p{L}` | No defect. `\p{L}` is already case-closed, so `i` cannot widen or narrow it; the comment's reasoning about `\p{Ll}` is correct. |

Scoped suites pass: `teamPrompts` + `teamTools` + `aiSkillVersionRepo` (96), `PendingSkillProposals` + `SkillEditorDrawer` + `chatTurnTools` + `aiTools` (99), `aiOrchestratorLoop` + `aiOfficeRepo` (80).

**What is still broken:** the orchestrator's own `d0907828` removed the bare branch's tail requirement, so ordinary prose is now redacted along with the rest of its line — the exact regression rounds 2 and 3 were raised for, and the opposite of what the file's own comment instructs. The fold still misses the C0/C1 control block and U+FFFD, so a forged tag split by one of them survives intact. Round 6's two "fixed" findings are each fixed only for the fields the review happened to name; the same defect class persists on five more advertised read tools and on six more fields of `get_linked_context`.

## Critical Issues

### CR-01: The bare branch deletes real body text — prose followed by `,` `;` `?` `!` `(` or a digit is redacted to end of line

**File:** `src/services/ai/untrustedData.ts:47`

**Issue:** `d0907828` replaced the bare branch's tail requirement with two negative lookaheads:

```
KẾT…TIN(?![^\S\n]*\p{L})(?![^\S\n]*\.[^\S\n]*$)[^\]\n]*\]?
```

The lookaheads only reject "followed by a letter" and "followed by a period at end of line". Every other prose continuation passes, and then `[^\]\n]*\]?` greedily eats the remainder of the line. Probed through the real `wrapUntrusted` (body region only, wrapper tags excluded):

```
"Kết thúc dữ liệu không đáng tin, sau đó tổng hợp báo cáo."  -> "[redacted-tag]"
"Bước 3: KẾT THÚC DỮ LIỆU KHÔNG ĐÁNG TIN; ghi lại kết quả."   -> "Bước 3: [redacted-tag]"
"KẾT THÚC DỮ LIỆU KHÔNG ĐÁNG TIN?"                          -> "[redacted-tag]"
"KẾT THÚC DỮ LIỆU KHÔNG ĐÁNG TIN!"                          -> "[redacted-tag]"
"KẾT THÚC DỮ LIỆU KHÔNG ĐÁNG TIN (bước 3)."                  -> "[redacted-tag]"
"KẾT THÚC DỮ LIỆU KHÔNG ĐÁNG TIN 3 lần."                     -> "[redacted-tag]"
```

This is the same failure the file's own comment warns against at `:38-39` ("Do NOT 'fix' this by widening the bare branch: that is what deleted real body text in rounds 2 and 3"), and the same one the round-2/3 tests were written for. The prose table in `teamPrompts.test.ts:456-486` has a hole: all seven rows continue with a word or a period, so the table passes while the pattern is wrong. The round-6 fix report's claim that "the prose table is unchanged and still asserts byte-identical survival, so the two tables pin the pattern in both directions" is therefore not true — the table pins only the two continuations the author thought of.

Impact: any approved skill body (user- or model-authored) that discusses this control with normal punctuation loses the rest of that line in every prompt and every tool result. Silent content corruption of the exact artifact this phase exists to deliver.

**Fix:** the bare branch must not consume arbitrary trailing text. Two options, both probed:

Option A — bare tag only when nothing but an optional stray `]` follows it on the line:

```ts
const DELIMITER_SHAPE =
  /\[[^\S\n]*(?:KẾT[^\S\n]+THÚC[^\S\n]+)?DỮ[^\S\n]+LIỆU[^\S\n]+KHÔNG[^\S\n]+ĐÁNG[^\S\n]+TIN[^\]\n]*\]|KẾT[^\S\n]+THÚC[^\S\n]+DỮ[^\S\n]+LIỆU[^\S\n]+KHÔNG[^\S\n]+ĐÁNG[^\S\n]+TIN[^\]\n]*\][^\S\n]*$|KẾT[^\S\n]+THÚC[^\S\n]+DỮ[^\S\n]+LIỆU[^\S\n]+KHÔNG[^\S\n]+ĐÁNG[^\S\n]+TIN[^\S\n]*$/gimu;
```

Probed: all nine prose rows above stay byte-identical, and `KẾT…TIN`, `KẾT…TIN]` and `[KẾT…TIN — x]` all redact. Cost: the three `bare, <separator>` rows at `teamPrompts.test.ts:445-447` stop redacting — a bare mid-line tag with a label cannot impersonate a *bracketed* closing tag, so that is the correct trade, but those rows must be moved to the prose table or deleted.

Option B — keep the round-6 tail requirement for the bare branch only, and accept the bracketed branch as the complete one, which is what the file's own comment already argues:

```ts
const DELIMITER_SHAPE =
  /\[[^\S\n]*(?:KẾT[^\S\n]+THÚC[^\S\n]+)?DỮ[^\S\n]+LIỆU[^\S\n]+KHÔNG[^\S\n]+ĐÁNG[^\S\n]+TIN[^\]\n]*\]|KẾT[^\S\n]+THÚC[^\S\n]+DỮ[^\S\n]+LIỆU[^\S\n]+KHÔNG[^\S\n]+ĐÁNG[^\S\n]+TIN(?:[—–\-:|=\]]|$)[^\]\n]*\]?/gimu;
```

Probed: all six prose shapes above stay byte-identical and every forged row in the existing table still redacts. Cost: a bare tag followed by a separator and a word survives — which is already the documented ceiling, and the wrapper's real tags are bracketed.

Either way, add the six prose rows above to the CR-01 prose table so the hole cannot reopen.

### CR-02: A forged tag split by a C0/C1 control character or U+FFFD still evades the fold

**File:** `src/services/ai/untrustedData.ts:57`

**Issue:** the fold covers `\p{Cf} ∪ \p{Default_Ignorable_Code_Point}`. Neither class contains the C0 controls, the C1 controls, or U+FFFD, and none of them is `[^\S\n]`, so `[^\S\n]+` cannot match across them. Probed through the real `wrapUntrusted` — the forged line survives verbatim and the body then contains two `KẾT THÚC DỮ LIỆU KHÔNG` lines, one of them at the wrapper's own level:

```
NUL U+0000   redacted=false  forgedSurvives=true
BEL U+0007   redacted=false  forgedSurvives=true
ESC U+001B   redacted=false  forgedSurvives=true
DEL U+007F   redacted=false  forgedSurvives=true
NEL U+0085   redacted=false  forgedSurvives=true
APC U+009F   redacted=false  forgedSurvives=true
REPL U+FFFD  redacted=false  forgedSurvives=true
```

(For contrast, `\t`, `\v`, `\f`, `\r`, NBSP, U+1680, U+180E, U+2060, U+FEFF, the tag characters U+E0001/E0020/E007F and U+FFF0 all redact correctly.)

This is the same class of defect as CR-04/WR-04/WR-03 (a character that splits the tag), and it defeats criterion 6 the same way. U+FFFD in particular is what a lossy transcode produces, so it is not an exotic input.

Residual, lower confidence: a combining mark that NFC cannot compose also splits the tag (`KHÔNG` + U+0301 normalises to `KHÔNǴ`, `KHÔNG` + U+0338 stays `KHÔNG̸`). Folding `\p{M}` would close it but would corrupt scripts that legitimately use combining marks, so it is a judgement call — flagged, not prescribed.

**Fix:** extend the fold with the control block and the replacement character (probed: all seven now redact, and ordinary `\n`, `\t`, `\r` are untouched):

```ts
.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\uFFFD]/g, ' ')
.replace(/[\p{Cf}\p{Default_Ignorable_Code_Point}]/gu, ' ')
```

Add the seven code points to the CR-04 table next to the existing rows.

## Warnings

### WR-01: Round 6's WR-02 is fixed only for the three tools the review named — five more advertised read tools still return raw user text

**File:** `src/services/ai/aiTools.ts:2090` (`wrapField`), `:2646`, `:3249-3272`, `:3301-3353`, `:4472-4479`

**Issue:** the round-6 claim is that "the two read paths agree again". They do not. Probed against the real `executeAiTool` with a forged delimiter in every free-text field, then walking the parsed result for the raw string:

```
query_tasks            -> .tasks[0].name, .tasks[0].opsOwners[0]
query_change_requests  -> .changeRequests[0].name
query_notes            -> .notes[0].title, .notes[0].tags[0]
query_recurring_tasks  -> .recurringTasks[0].name, .description, .notes
query_worklogs         -> .sessions[0].taskName, .sessions[0].note
search_knowledge_base  -> .results[0].title, .tags[0], .snippet
get_document_details   -> .title, .tags[0], .body
```

Every one of these tools except `get_document_details` is in `EMPLOYEE_READ_ONLY_ALLOWLIST` and therefore in `LEAD_TOOL_ALLOWLIST` (`chatTurnTools.ts:15-48`), so all of them are advertised to the lead — the one agent holding mutation tools. `query_recurring_tasks` is the sharpest: it returns `description` and `notes` completely raw, which is exactly the defect round 6 fixed on `query_tasks`. `search_knowledge_base` returns a 1 500-character raw `snippet` and a raw document `body` is one call away via `get_document_details`.

The handler contract stated at `teamTools.ts:426-428` ("each handler wraps its own body") is still false for these.

**Fix:** apply `wrapField` to `name` / `title` / `tags[]` / `opsOwners[]` / `businessAnalysts[]` / `note` / `snippet` on the tools above, and either wrap or drop `get_document_details`'s `body` (it is not advertised today, but the loop gate is the only thing stopping it). Add one probe test per tool that seeds a distinct marker per field, the way the WR-03 round-6 test does, so a raw copy cannot hide behind another field's wrapper.

### WR-02: Round 6's WR-01 is fixed only for the five fields the review named — `get_linked_context` still returns six raw free-text fields, and the stated reason does not apply to this path

**File:** `src/services/ai/office/teamTools.ts:460-496`

**Issue:** probed on the real handler with a forged delimiter in every free-text field of a linked task:

```
RAW: .item.name, .item.jiraKey, .item.opsOwners[0], .item.businessAnalysts[0], .item.tags[0], .crCode
```

The comment at `:456-457` justifies leaving `name`/`code` raw because "`buildLeadTurnRequest` wraps the linked-item name once at the prompt boundary, and wrapping here too would nest the block inside itself". That is true for `list_linked_items`, whose values do flow into `[MỤC LIÊN KẾT]`. It is **not** true for `get_linked_context`: its return value becomes a `role: 'tool'` message in the loop (`aiOrchestratorLoop.ts:523-528`) and never passes through `buildLeadTurnRequest`. So the raw name reaches the lead unwrapped, and the rationale that protects it protects nothing on this path.

`jiraKey`, `opsOwners[]`, `businessAnalysts[]` and `tags[]` are user-authored free text with no rationale at all — they were simply not in the round-6 list.

**Fix:** wrap all six on the `get_linked_context` path (the `name`/`code` exemption belongs only to `list_linked_items`), and correct the comment so the next round does not re-derive the same wrong rule:

```ts
item.name = wrapField(`TÊN MỤC ${itemId}`, item.name);
item.jiraKey = wrapField(`JIRA ${itemId}`, item.jiraKey);
for (const key of ['opsOwners', 'businessAnalysts', 'tags'] as const) {
  if (Array.isArray(item[key])) item[key] = item[key].map((v: unknown) => wrapField(key, v));
}
parsed.crCode = wrapField(`MÃ CR ${itemId}`, parsed.crCode);
```

Note the existing test asserts `expect(task.item.name).toBe('Viết tài liệu đối soát')` — that assertion encodes the wrong rule and must change with the fix.

## Info

### IN-01: `wrapField` is duplicated, and it changes `null` to a dropped key

**File:** `src/services/ai/aiTools.ts:2090-2092`, `src/services/ai/office/teamTools.ts:460-461`

**Issue:** the identical one-line helper exists in both files. Separately, the round-6 substitution changed `description: t.description ?? null` to `description: wrapField(..., t.description)`, which returns `undefined` for an absent field. `JSON.stringify` drops `undefined` keys, so the field now disappears from the payload instead of being `null` — a silent shape change for any consumer that reads the key.

**Fix:** export the helper from one place (or from `untrustedData.ts`, which is already the zero-import boundary module) and preserve the old shape with `wrapField(...) ?? null`.

---

_Reviewed: 2026-11-14T15:40:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
