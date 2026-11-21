---
id: 261121-foz
phase: quick
plan: 261121-foz
subsystem: ui
tags: [workbench, utility-tools, react, zustand, antd, folding, blob-download]
requires:
  - plan: 261121-eck
    provides: Markdown Viewer và 4 utility editor trong Tool Explorer
  - plan: 261121-ev5
    provides: AI assistant inline cho 4 utility editor
provides:
  - Shared LineNumberedPane với gutter số dòng nguồn và nút gập, computeFoldRanges pure cho JSON/XML
  - FoldingCodeView thay output JSON/XML, cột số cho mọi pane và diff row
  - Session-only content store giữ nội dung editor khi unmount/remount tab
  - Save as modal: Blob download + lưu document qua createNote repository
affects: [Tool Explorer utility editors, EditorArea tab switching, Docs repository usage]
tech-stack:
  added: []
  patterns:
    - "Reusable gutter wrapper: gutter mirrors scrollRef.scrollTop, caller owns child ref"
    - "Fold ranges keyed by source openLine, visibleLines filter hides folded body and closing line"
    - "Session-only zustand store keyed by toolId, no localStorage/db persistence"
    - "Browser Blob + object URL download; Docs save via existing createNote repository"
key-files:
  created:
    - src/workbench/toolwindows/LineNumberedPane.tsx
    - src/workbench/toolwindows/utilityToolContentStore.ts
  modified:
    - src/workbench/toolwindows/UtilityToolPanel.tsx
    - src/workbench/__tests__/UtilityToolPanel.test.tsx
key-decisions:
  - "Line numbers come from visibleLines.map(i => i+1) — source line numbers, never visible-array positions"
  - "Newline appended only when i < original lines.length - 1 so pre.textContent equals source exactly before folding"
  - "Fold control is a button inside the 20px gutter row: number stays visible, Enter/Space work natively"
  - "Diff result uses its own 28px sequence column, not LineNumberedPane, to stay grid-aligned"
  - "Content persisted in memory-only zustand store keyed by toolId; Clear resets that tool's state"
  - "Docs save reuses createNote(type: 'document', tags: ['utility-tool']); no new storage mechanism"
  - "Save as prefers formatted output over input for JSON/XML; Text Compare uses pane B, Markdown uses source"
patterns-established:
  - "Pure computeFoldRanges module independently unit-tested from UI"
  - "Module-local store hook useUtilityContent(key) returns [value, patch, clear]"
  - "SaveAsModal receives tools as { extension, content } format descriptors"
requirements-completed: []
duration: 11min
completed: 2026-11-21
---

# Quick 261121-foz: Line number và collapse/expand cho utility editor Summary

**Shared source-line gutter with JSON/XML folding, session-only editor persistence, and Save as (Blob download + Docs) across all four Tool Explorer utility editors**

## Performance

- **Duration:** 11 min
- **Started:** 2026-11-21T04:26:02Z
- **Completed:** 2026-11-21T04:37:28Z
- **Tasks:** 4 (2 original + 2 added mid-flight by coordinator/user)
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments

- `LineNumberedPane` + `computeFoldRanges` shared module; gutter scroll sync via native listener; fold buttons with Vietnamese aria-labels and no `role="separator"`
- 8 panes wired: JSON input/output, XML input/output, Text A/B, Markdown editor/preview; diff result gets its own 28px sequence column; all 5 textareas use `wrap="off"`
- JSON/XML output folding: clickable gutter buttons, `…` on the opening row, hidden body/closing lines removed from both content and gutter, highlight preserved, state reset on text change, error path renders single-line legacy message
- Editor content (JSON/XML input+output+error+formatted+indent, Text Compare a/b/mode/ignoreCase/ignoreSpace, Markdown source) survives unmount/remount; Clear resets persisted state
- Save as modal on all four editors: browser Blob download and Docs save through existing `createNote` repository; default extensions `.json/.xml/.txt/.md`
- 17 original tests untouched semantically; scoped suite now 37/37 green; `npx tsc --noEmit` clean; no dependency added; `UtilityToolAIAssistant.tsx` untouched

## Task Commits

1. **Task 1 — Module dùng chung: LineNumberedPane + computeFoldRanges + unit test** — `442a51a0` (feat)
2. **Task 2 — Wire 4 editor + folding integration** — `31a833ac` (feat)
3. **Task 3 — Persist editor content across tab switches** — `b85e21f4` (feat)
4. **Task 4 — Save as download và Docs** — `66c69839` (feat)

No separate metadata commit: quick task docs are handled by the orchestrator per task constraints.

## Files Created/Modified

- `src/workbench/toolwindows/LineNumberedPane.tsx` — shared gutter, fold controls, `computeFoldRanges` for JSON/XML
- `src/workbench/toolwindows/utilityToolContentStore.ts` — session-only zustand store keyed by tool id
- `src/workbench/toolwindows/UtilityToolPanel.tsx` — `FoldingCodeView`, `SaveAsModal`, 8 pane wrappers, persisted editor state, Save as buttons
- `src/workbench/__tests__/UtilityToolPanel.test.tsx` — 17 existing tests + fold-range, gutter, folding, persistence and Save as tests

## Decisions Made

- Kept source line numbers through folded views by passing source indices in `visibleLines`; the 17-test XML minify exact-`textContent` assertion still passes.
- Chose module-local zustand store over extending `layoutStore` — no type changes, no localStorage, no DB, least code.
- Docs save uses `createNote` from `noteRepo.ts` directly (no folder picker); documents land at Docs root with `utility-tool` tag.
- Chrome UAT performed by orchestrator on 2026-11-21: line numbers render on JSON/XML input+output (1–15, 1–8), fold toggles hide body and ellipsis stays on opening row, editor content survives tab switch, Save as modal downloads via Blob with correct default name/extension; console had only pre-existing antd deprecation/panel-resize warnings. Docs-save path covered by scoped test only (not clicked in browser).

## Deviations from Plan

### Added work (coordinator/user instruction during execution)

**1. Task 3 — editor content persistence**
- **Found during:** after Task 2 commit
- **Issue:** switching tabs unmounted editors and reset local `useState`
- **Fix:** session-only zustand store keyed by tool id, Clear resets persisted state
- **Committed in:** `b85e21f4`

**2. Task 4 — Save as**
- **Found during:** after Task 3 commit
- **Issue:** user requested browser download + Docs save for all four editors
- **Fix:** shared `SaveAsModal`, Blob object URL download, Docs save through `createNote`
- **Committed in:** `66c69839`

### Auto-fixed Issues

None. Test expectation and mock-typing failures were resolved inside their owning tasks before commit, without changing product behavior.

**Total deviations:** 2 added tasks (user-directed), 0 auto-fixes
**Impact on plan:** Original Tasks 1–2 executed exactly as written; added work is isolated to the same three code files plus one new store module.

## Issues Encountered

- Initial fold-range test expected wrong closing-line numbers (0-based off-by-one); corrected expectations, logic already correct.
- Ant Design Select does not expose a DOM `value` attribute; removed that assertion and verified extension through saved content instead.

## Verification

- `npx vitest run src/workbench/__tests__/UtilityToolPanel.test.tsx` — 37/37 pass (17 original + 20 new)
- `npx tsc --noEmit` — clean
- Full Vitest suite intentionally not run (project rule: >1h)

## User Setup Required

None — no dependency, env var, or external service configuration.

## Next Phase Readiness / UAT for Orchestrator

Chrome UAT completed by orchestrator (2026-11-21). Original steps, in Vietnamese:
1. Mở app Tauri dev → Tool Explorer, thử từng tool JSON/XML/Text Compare/Markdown.
2. Dán nội dung nhiều dòng → bấm Format → kiểm tra số dòng ở cả 2 pane; cuộn để số đi theo nội dung.
3. JSON/XML: bấm `▾` ở dòng mở → thân biến mất, `…` nằm cùng row dòng mở; bấm `▸` → hồi phục; Tab tới nút rồi Enter/Space vẫn toggle; đổi input rồi Format lại → mở hết.
4. Text Compare: cột số đầu bảng kết quả và cột `an`/`bn` cũ vẫn hiển thị.
5. Markdown: pane SOẠN có số; pane XEM TRƯỚC có thước số nguồn cuộn cùng nội dung (không căn theo block render).
6. Chuyển sang tab khác rồi quay lại từng tool → nội dung, indent, mode/checkbox vẫn giữ; bấm Clear → rỗng sau khi quay lại.
7. Save as: mỗi tool mở modal, nhấn "Tải về máy" → file tải xuống đúng nội dung (output đã format nếu có) với extension `.json/.xml/.txt/.md`; chọn "Lưu vào Docs" → doc xuất hiện trong Docs với tên đã nhập.
8. Nút AI vẫn stream và đóng lại không đổi nội dung; Console không có error/warning mới.

---
*Phase: quick/261121-foz*
*Completed: 2026-11-21*

## Self-Check: PASSED

All 4 commits (`442a51a0`, `31a833ac`, `b85e21f4`, `66c69839`) and all created/modified files verified present on disk. Untracked path is the quick-task artifacts directory only, left for orchestrator.
