---
phase: 47-ssh-remote-explorer-ai-code-understanding
plan: 04
subsystem: ai-remote-inline-and-citations
tags: [remote-selection, inline-toolbar, structured-anchor, path-line-citation, openTab, initialLine, registerActiveItem, antd, vitest]

# Dependency graph
requires:
  - phase: 47-ssh-remote-explorer-ai-code-understanding
    provides: "47-01 remote:<uuid> scope + RemoteSelectionAnchor; 47-02 one-shot initialLine tab params; 47-03 explicit remote target + registerActiveItem activation"
  - phase: 29.1-remote-ssh-git-explorer
    provides: "RemoteFileViewer readonly numbered-line DOM and layoutStore.openTab remote_file tab contract"
provides:
  - "Per-line data-ai-context remote attributes and target metadata on RemoteFileViewer plus auto remote-scope activation without overriding manual scope"
  - "Remote-aware InlineAISelectionBar with Explain/Ask/Open in Chat, structured path:line mention to the remote composer, and target-bound read-only inline tools"
  - "Render-only RemoteCitationChips that parse repo-relative path:line refs and open the readonly remote tab at that line using the active target"
  - "AIChatDrawer remote-citation activation via layoutStore.openTab with one-shot initialLine; document citations unchanged; strict PersistedCitation schema untouched"
affects:
  - "Phase 47 plan 05 (final verification/walkthrough) — reuses the inline anchor and citation-navigation contracts"
  - "AIChatDrawer citation handling, InlineAISelectionBar activation, RemoteFileViewer DOM attributes"

# Actuals (#2632) — same estimateTokens scale (chars/4 over the realized diff).
actuals:
  tokens: 6532
  tasks: 2
  commits: 2

# Measured commit range (#3968)
commits: 2
plan_head_before: b2286cbaf5889a0b7cb8ed1e8edb2c896eda05e8
plan_head_after: 347fb3a696c8e8533169abed82aa59cb18cc7cac

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Remote selection is a structured anchor resolved from its own DOM metadata (target/path/startLine/endLine/text), never a fabricated doc entity"
    - "Auto scope activation uses AIChatContext.registerActiveItem so customScope wins; no setCustomScope call in the viewer"
    - "Remote path:line citations are render-only chips; the click handler sources SSH target from live layout state, never from model text"
    - "Remote citation reuses the one-shot initialLine tab param so stale highlights never leak on plain reopen"

key-files:
  created:
    - src/components/ai/RemoteCitationChips.tsx
  modified:
    - src/workbench/editor/RemoteFileViewer.tsx
    - src/components/ai/InlineAISelectionBar.tsx
    - src/components/ai/AIChatDrawer.tsx
    - tests/ai/AIChatDrawerToolbox.test.tsx

key-decisions:
  - "D-08: opening a remote file registers its target as an active item so the remote scope auto-activates while a manual customScope still wins (Pitfall 5)."
  - "D-09/D-10/D-11: the inline bar branches on a remote anchor for an Explain/Ask/Open in Chat toolbar; Open in Chat emits the D-11 structured path:line mention to the remote composer with no fake doc resolution (Pitfalls 4/5)."
  - "Inline Explain/Ask reuse READ_ONLY_AI_TOOLS and MAX_LOOPS=3; on a remote selection the tool options carry the anchor's own target so a model cannot redirect the read to another host (D-14, T-47-09/T-47-11)."
  - "D-12: remote path:line citations are render-only chips (target + relative path + line parsed from answer text); the chip never carries a host and the click resolves config/repo/branch from the active layout target (T-47-10, Pitfall 7)."
  - "The strict PersistedCitation schema and the document-citation setActivePreviewCitation path are byte-unchanged; remote and document citation paths coexist."
  - "D-01 isolation honored: no edit to shared .planning/ROADMAP.md or .planning/STATE.md."

patterns-established:
  - "Remote citations are a separate render-only contract from persisted document grounding — extending the strict schema is not required for navigation."
  - "Navigation chips confine their own input (no absolute path, no .. segment) and still rely on the viewer's confineRepoPath at read time."

requirements-completed: [D-08, D-09, D-10, D-11, D-12]

# Coverage metadata (#1602) — one entry per shipped deliverable.
coverage:
  - id: D1
    description: "Selecting remote code shows an inline toolbar with Explain, Ask and Open in Chat; remote scope auto-activates without overriding manual scope"
    requirement: D-09
    verification:
      - kind: unit
        ref: "tests/ai/AIChatDrawerToolbox.test.tsx#shows Explain, Ask and Open in Chat for a remote selection"
        status: pass
      - kind: other
        ref: "grep -c data-ai-context-type src/workbench/editor/RemoteFileViewer.tsx = 1; grep -c registerActiveItem = 4"
        status: pass
    human_judgment: false
  - id: D2
    description: "Open in Chat puts the D-11 structured anchor (path:line) in the remote composer with no fake doc resolution; Explain/Ask keep a bounded read-only loop"
    requirement: D-11
    verification:
      - kind: unit
        ref: "tests/ai/AIChatDrawerToolbox.test.tsx#Open in Chat calls openChatWithDraft with remote scope and a path:line mention, no fake doc resolution"
        status: pass
      - kind: other
        ref: "grep -c \"type: 'remote'\" src/components/ai/InlineAISelectionBar.tsx = 1; READ_ONLY_AI_TOOLS and MAX_LOOPS=3 unchanged"
        status: pass
    human_judgment: false
  - id: D3
    description: "A remote path:line citation chip opens the readonly remote file tab with the active target and one-shot initialLine"
    requirement: D-12
    verification:
      - kind: unit
        ref: "tests/ai/AIChatDrawerToolbox.test.tsx#clicking a remote citation chip opens the remote file tab with the active target and initialLine"
        status: pass
      - kind: unit
        ref: "tests/ai/AIChatDrawerToolbox.test.tsx#parseRemoteCitationRefs extracts repo-relative path:line refs and rejects traversal/absolute paths"
        status: pass
      - kind: other
        ref: "grep -c initialLine: src/components/ai/AIChatDrawer.tsx = 1; openTab call present; PersistedCitation schema diff = 0 lines"
        status: pass
    human_judgment: false
  - id: D4
    description: "Document citations still open their QuickPreview and the strict persisted citation schema is unchanged"
    requirement: D-12
    verification:
      - kind: other
        ref: "grep 'onCitationActivate: (c) => setActivePreviewCitation(c)' present at AIChatDrawer.tsx:2203; git diff HEAD -- groundedAnswerSchemas.ts = 0"
        status: pass
    human_judgment: false
  - id: D5
    description: "Live Tauri remote walkthrough: select code in a remote file, get an inline answer, and click a path:line citation to land on that line"
    requirement: D-10
    verification: []
    human_judgment: true
    rationale: "No configured SSH remote host in this environment; mocked contract tests prove wiring, not live host behavior. Live read-only walkthrough is a manual UAT item (47-VALIDATION.md)."

# Metrics
duration: 26min
completed: 2026-11-19
status: complete
---

# Phase 47 Plan 04: Remote Inline AI & Citation Navigation Summary

**Remote text selection drives an Explain/Ask/Open-in-Chat inline toolbar with a structured path:line anchor, and clickable path:line citations reopen the readonly remote file at that line via the active target**

## Performance

- **Duration:** 26 min
- **Started:** 2026-11-19T11:05:23Z
- **Completed:** 2026-11-19T11:32:12Z
- **Tasks:** 2 (1 tracer + 1 auto)
- **Files modified:** 5 (4 code, 1 test; 1 code file created)

## Accomplishments

- `RemoteFileViewer` now exposes `data-ai-context-type="remote"` plus target metadata (`data-remote-target-uuid`, config, repo path, branch, per-line `data-remote-line`/`data-remote-path`) and auto-registers the target as an active item so the remote scope activates without overriding a manual scope choice.
- `InlineAISelectionBar` handles remote anchors through `extractRemoteSelectionAnchor` + `remoteAnchorToPayload`: a dedicated toolbar with Explain / Ask / Open in Chat, a structured `path:line` mention into the remote composer, and read-only inline tools bound to the anchor's own target.
- `RemoteCitationChips` (new) parses bounded, repo-relative `path:line` refs from assistant text; absolute and `..` paths are rejected. Chips are render-only and never fabricate a persisted document citation.
- `AIChatDrawer` activates a remote chip by opening a `remote:<path>` `remote_file` tab with the active config/repo/branch and a one-shot `initialLine`; document citations keep `setActivePreviewCitation` and the strict `PersistedCitation` schema is untouched.
- All changes are isolated to Phase 47 artifacts — shared `ROADMAP.md`/`STATE.md` untouched (D-01).

## Task Commits

Each task was committed atomically:

1. **Task 1 (tracer): remote selection inline toolbar + structured chat anchor** — `93107704` (feat)
2. **Task 2: remote path:line citation navigation** — `347fb3a6` (feat, amended once to fix a test-only typecheck error)

**Plan metadata:** pending (orchestrator-owned docs commit)

_Note: Task 1 was a tracer. Its automated-only `<verify>` (tsc + focused toolbox test) was re-run end-to-end after commit per the tracer feedback gate (interactive, `end-of-phase` mode) — it passed, then expansion to Task 2 proceeded._

## Files Created/Modified

- `src/workbench/editor/RemoteFileViewer.tsx` — remote context attributes, per-line metadata, `registerActiveItem` auto-activation
- `src/components/ai/InlineAISelectionBar.tsx` — remote anchor branch, Explain/Ask/Open in Chat toolbar, remote composer mention, target-bound tool options
- `src/components/ai/RemoteCitationChips.tsx` (new) — path:line parser + render-only chip component
- `src/components/ai/AIChatDrawer.tsx` — remote citation activation via `openTab`, chip rendering for the active remote scope
- `tests/ai/AIChatDrawerToolbox.test.tsx` — remote toolbar, Open in Chat, citation parser/chip activation, and remote tab-open tests

## Decisions Made

- Auto scope activation uses the registered-item stack (`customScope ?? registeredTop ?? global`) rather than `setCustomScope`, preserving the user's manual scope choice (D-08, Pitfall 5).
- The remote selection never fabricates a `doc` entity; it resolves entirely from the structured anchor payload (D-11, Pitfall 4).
- Remote citations are a distinct render-only shape: the chip carries no host, and config/repo/branch come from live layout state at click time so model text cannot redirect navigation (T-47-10).
- The strict `PersistedCitation` document schema was not widened; document and remote citation paths coexist without touching persisted grounding.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test-only typecheck error on optional `opened.params`**
- **Found during:** final plan verification (after Task 2 commit)
- **Issue:** The new tab-open assertion accessed `opened.params.filePath` directly, but `EditorTab.params` is optional; `tsc --noEmit` reported TS18048 on five lines. Focused Vitest passed because the runtime value existed.
- **Fix:** Read `const openedParams = opened.params ?? {}` before asserting fields.
- **Files modified:** `tests/ai/AIChatDrawerToolbox.test.tsx`
- **Verification:** `tsc --noEmit -p tsconfig.json` clean; union tests 11/11 pass.
- **Committed in:** `347fb3a6` (Task 2 commit amended; no separate commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 test/typecheck fix). **Impact:** no scope creep and no contract change; the fix only satisfies strict TypeScript on the new test.

## Issues Encountered

- None blocking. No authentication gates. No package installs (zero dependencies added).
- The pre-existing `AIChatDrawerIsolation.test.tsx` failures documented in 47-03 remain out of scope and were not re-run here.

## User Setup Required

None — no external service configuration for the automated contract tests. A live SSH host is needed only for the manual UAT walkthrough (no configured remote here).

## Next Phase Readiness

- The inline structured-anchor path and remote citation navigation are ready for plan 05's final verification; both reuse the one-shot `initialLine` tab-param contract and the shared `RemoteToolTarget`/remote scope identity.
- Live SSH/Tauri walkthrough remains a manual UAT item (47-VALIDATION.md); automated mocked coverage records the contract.
- D-01 isolation honored: no edit to shared `ROADMAP.md` or `STATE.md`; orchestrator owns any tracking update.

## Self-Check: PASSED

- Created file exists: `src/components/ai/RemoteCitationChips.tsx`; this SUMMARY exists.
- Both task commits verified as ancestors of HEAD: `93107704`, `347fb3a6`.
- Acceptance greps: `data-ai-context-type` in viewer = 1; `registerActiveItem` = 4; remote toolbar testids = 4; `type: 'remote'` in inline bar = 1; `initialLine:` in drawer = 1; `openTab` in drawer = 1; document-citation preview path present; `groundedAnswerSchemas.ts` diff = 0 lines.
- Overall verification: `npx tsc --noEmit -p tsconfig.json` clean; `npx vitest run tests/ai/AIChatDrawerToolbox.test.tsx src/workbench/__tests__/RemoteFileViewer.test.tsx` = 11/11 pass.
- D-01 isolation: no plan commit touched `.planning/ROADMAP.md` or `.planning/STATE.md`; no file deletions in either task commit.

---
*Phase: 47-ssh-remote-explorer-ai-code-understanding*
*Completed: 2026-11-19*
