---
phase: quick
plan: 261031-diagnostics-typescript-fix
type: execute
wave: 1
depends_on: []
files_modified:
  - src/services/ai/aiDebugService.ts
  - src/components/ai/AIDebugModal.tsx
  - tests/ai/aiDebugService.test.ts
  - src/components/ai/wizard/NoteSourcePickerModal.tsx
  - src/components/ai/wizard/__tests__/noteSourcePickerModal.test.tsx
autonomous: true
user_setup: []
must_haves:
  truths:
    - "AI diagnostics compile against sanitized CR-08 contracts and expose only bounded metadata."
    - "Serialized diagnostics contain no raw prompt, systemPrompt, messages, tool args/results, response text, or error text."
    - "NoteSourcePicker rows maintain focus state and support arrow navigation, Enter preview, and Space selection without changing source data."
    - "TypeScript, backup coverage, and full Phase 25.1 targeted regression pass without dependency, backend, or PWA changes."
  artifacts:
    - path: "src/services/ai/aiDebugService.ts"
      provides: "Sanitized AI turn, tool, event, and error-code contracts"
    - path: "src/components/ai/AIDebugModal.tsx"
      provides: "Metadata-only debug viewer aligned with sanitized contracts"
    - path: "src/components/ai/wizard/NoteSourcePickerModal.tsx"
      provides: "Focusable, keyboard-operable source picker rows"
    - path: "tests/ai/aiDebugService.test.ts"
      provides: "CR-08 no-leak and lifecycle regression tests"
    - path: "src/components/ai/wizard/__tests__/noteSourcePickerModal.test.tsx"
      provides: "WR-03 focus and keyboard behavior tests"
  key_links:
    - from: "src/components/ai/AIDebugModal.tsx"
      to: "src/services/ai/aiDebugService.ts"
      via: "renders only sanitized length/count/status metadata"
    - from: "src/components/ai/wizard/NoteSourcePickerModal.tsx"
      to: "src/components/ai/wizard/__tests__/noteSourcePickerModal.test.tsx"
      via: "focused row state and keyboard interaction contract"
---

<objective>
Fix TypeScript errors introduced by CR-08 sanitized AI diagnostics and WR-03 NoteSourcePicker keyboard changes.

Purpose: Restore compile/test correctness while preserving content-free diagnostics and accessible local Note selection.
Output: Sanitized service/modal/tests, keyboard-safe NoteSourcePicker state/tests, and verified Phase 25.1 regression.

No new dependencies, backend work, PWA work, or AI-core routing changes.
</objective>

<execution_context>
@C:/Users/quantd/.claude/gsd-core/workflows/execute-plan.md
</execution_context>

<context>
@CLAUDE.md
@.planning/STATE.md
@.planning/phases/25.1-sdlc-flow-hardening-multi-tab-ai-chat-isolation/25.1-CONTEXT.md
@.planning/phases/25.1-sdlc-flow-hardening-multi-tab-ai-chat-isolation/25.1-04-PLAN.md
@.planning/phases/25.1-sdlc-flow-hardening-multi-tab-ai-chat-isolation/25.1-09-PLAN.md
@src/services/ai/aiDebugService.ts
@src/components/ai/AIDebugModal.tsx
@src/components/ai/wizard/NoteSourcePickerModal.tsx
@tests/ai/aiDebugService.test.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Align AI debug UI and tests with CR-08 sanitized contracts</name>
  <files>src/services/ai/aiDebugService.ts, src/components/ai/AIDebugModal.tsx, tests/ai/aiDebugService.test.ts</files>
  <behavior>
    - Start, stream, tool, finish, abort, error, ring-buffer, and subscriber tests pass using sanitized fields.
    - A turn stores only system prompt length, message count/character count, tool count, response/final-response lengths, tool name/argument count/result length/duration, and stable error codes.
    - Event payloads contain only the explicit bounded metadata allowlist; raw prompt/systemPrompt/messages/tool args/results/errors/responses never appear in any turn or modal copy output.
  </behavior>
  <action>Update `aiDebugService.ts` types and implementation to remove raw content fields and arbitrary payloads. Keep input parameters sufficient for callers, but derive bounded counts/lengths only; replace raw errors with stable sanitized error codes and remove `args` from tool event payloads. Align `AIDebugModal.tsx` with the new fields: remove raw payload/prompt/tool/result/response rendering, show metadata and safe event timeline, and copy only sanitized JSON. Update `tests/ai/aiDebugService.test.ts` with canary values and assertions that returned objects and serialized modal data contain none of the forbidden raw fields or canary content. Preserve in-memory ring buffer behavior and existing lifecycle API names.
  </action>
  <verify>
    <automated>npx vitest run tests/ai/aiDebugService.test.ts && npx tsc --noEmit</automated>
  </verify>
  <done>AI debug service, modal, and tests compile together; diagnostics remain useful through bounded metadata while raw prompts, messages, tool data, responses, and errors cannot be retained or displayed.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Complete WR-03 NoteSourcePicker focus behavior and run Phase 25.1 regression</name>
  <files>src/components/ai/wizard/NoteSourcePickerModal.tsx, src/components/ai/wizard/__tests__/noteSourcePickerModal.test.tsx</files>
  <behavior>
    - Picker keeps a `focusedNoteId` synchronized with visible rows and focuses the first/selected valid row when opening or filtering.
    - ArrowUp/ArrowDown moves focus within filtered rows with wrap-safe bounds; Enter previews the focused Note; Space toggles selection without scrolling or submitting.
    - Rows expose `role="option"`, truthful `aria-selected`, roving `tabIndex`, and preserve selected IDs when search/scope changes.
  </behavior>
  <action>Finish `NoteSourcePickerModal.tsx` keyboard state rather than only referencing an undefined setter. Add focused-row state and row refs, initialize/reset it on open and filtered-list changes, use roving tab stops, and implement ArrowUp/ArrowDown, Enter, and Space handlers while preserving click/checkbox behavior and immutable Note sources. Add focused component tests with mocked local Notes for open, filtering, focus movement, preview, selection, ARIA state, and no write calls. Then run TypeScript, backup tests, and the complete Phase 25.1 targeted regression from Plan 25.1-09. Treat failures as blocking; do not weaken assertions, skip tests, install dependencies, change backend/PWA behavior, or alter AI core routing.
  </action>
  <verify>
    <automated>npx tsc --noEmit && npx vitest run src/components/ai/wizard/__tests__/noteSourcePickerModal.test.tsx tests/services/backup/exportBackup.test.ts tests/services/backup/validateBackup.test.ts tests/services/backup/restoreBackup.test.ts tests/backup/wizardBackup.test.ts tests/backup/tabCheckpointBackup.test.ts && npx vitest run src/db/repositories/__tests__/chatTabRepo.test.ts tests/ai/AIChatDrawerTabs.test.tsx tests/ai/AIChatDrawerAbortCommit.test.tsx tests/ai/AIChatDrawerRetry.test.tsx tests/ai/AIChatDrawerCheckpoint.test.tsx tests/ai/sdlcPromptIsolation.test.ts src/components/ai/__tests__/ChatTabBar.test.tsx src/components/ai/wizard/__tests__/sdlcWorkflowHub.test.tsx src/components/ai/wizard/stepInputDocsModal.test.tsx src/services/wizard/__tests__/workflowCoordinator.test.ts src/services/wizard/__tests__/stalenessDetector.test.ts tests/ai/wizardService.test.ts tests/backup/wizardBackup.test.ts tests/backup/tabCheckpointBackup.test.ts tests/services/backup/exportBackup.test.ts tests/services/backup/validateBackup.test.ts tests/services/backup/restoreBackup.test.ts tests/services/localSqlitePersistence.test.ts tests/phase25_1SafetyGates.test.ts</automated>
  </verify>
  <done>NoteSourcePicker focus and keyboard tests pass; TypeScript, backup tests, and full Phase 25.1 targeted regression pass with no dependency/backend/PWA changes.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|---|---|
| AI/provider inputs -> in-memory diagnostics | Provider payloads, prompts, tool data, responses, and errors may contain secrets or user content. |
| Local Note records -> picker preview | Note Markdown is untrusted display data and must remain read-only. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|---|---|---|---|---|
| T-QUICK-CR08-01 | Information Disclosure | `aiDebugService.ts`, `AIDebugModal.tsx` | mitigate | Store/render only bounded counts, lengths, names, durations, statuses, and stable error codes; assert forbidden canaries and keys in tests. |
| T-QUICK-CR08-02 | Information Disclosure | debug copy/export handlers | mitigate | Serialize only sanitized turn objects; never copy raw prompt, message, tool, result, response, or error content. |
| T-QUICK-WR03-01 | Tampering | `NoteSourcePickerModal.tsx` | mitigate | Keyboard handlers alter only local selection/preview state; source Notes remain read-only and tests assert no repository writes. |
| T-QUICK-SC | Tampering | npm/pip/cargo installs | mitigate | Install nothing; use existing TypeScript, Vitest, Ant Design, Dexie, and native APIs only. |
</threat_model>

<verification>
Run `npx tsc --noEmit`, focused AI debug and NoteSourcePicker tests, all backup tests listed in Task 2, then the complete Phase 25.1 targeted regression command. Run `git diff --check`. Confirm changed files contain no new raw diagnostic fields and no dependency, backend, or PWA changes.
</verification>

<success_criteria>
- CR-08 sanitized contracts compile through service, modal, and tests.
- Diagnostics retain bounded operational metadata only; forbidden raw content never reaches in-memory records or clipboard JSON.
- WR-03 picker rows have deterministic focus state, roving tab stops, arrow navigation, Enter preview, Space selection, and accessible state.
- TypeScript, backup tests, and full Phase 25.1 targeted regression pass.
- No dependencies, backend, PWA, or AI-core routing changes.
</success_criteria>

<output>
Plan only. Do not create SUMMARY.md or modify production files during planning.
</output>
