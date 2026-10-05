---
phase: quick
plan: 261005-jfa
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/ai/ChatInputBar.tsx
  - tests/ai/ChatInputBar.test.tsx
  - src/services/ai/__tests__/fileReference.test.ts
autonomous: true
requirements:
  - QUICK-REMOVE-FILE-AUTOCOMPLETE

estimate:
  tokens: 25000
  raw_tokens: 15000
  tasks: 1
  confidence: high

must_haves:
  truths:
    - "Chat input bar does not trigger @file or file path autocomplete popup when typing @ or @file"
    - "Typing @ shows only tasks, documents (@doc:), and does not show file hint option"
    - "Attach file button (paperclip) remains fully functional for attaching local files"
    - "Command /file triggers file picker directly without triggering file path autocomplete"
  artifacts:
    - src/components/ai/ChatInputBar.tsx
  key_links:
    - "ChatInputBar.handlePickFile still wired to paperclip button and /file command"
    - "extractMentionedEntityIds and read_file AI tool remain intact for file attachments and grounding"
---

<objective>
Remove `@file` autocomplete and path completion in ChatInputBar while preserving the attach file button and file reference handling.

Purpose: The user wants to remove the local file autocomplete dropdown in the chat input bar, while keeping the paperclip attach file button intact for picking and referencing files.
Output: Cleaned `ChatInputBar.tsx` without `@file` autocomplete, with updated tests.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@src/components/ai/ChatInputBar.tsx
@tests/ai/ChatInputBar.test.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove @file autocomplete and path completion from ChatInputBar</name>
  <files>src/components/ai/ChatInputBar.tsx, tests/ai/ChatInputBar.test.tsx, src/services/ai/__tests__/fileReference.test.ts</files>
  <action>
    1. In `src/components/ai/ChatInputBar.tsx`:
       - Remove `fileSuggestions` state and the `useEffect` that calls `complete_local_path` on Tauri.
       - Remove `isFileMode` branch in `options` calculation (`@file`, `~/`, `/`, etc.) and `fileHintOption` (`Tham chiếu tập tin máy tính... (@file)`).
       - Remove `handleSelect` logic for `option.isDir` and `option.key === 'mention-file-entry'`.
       - Update `/file` command in `AI_COMMANDS`: change title/description to trigger file picker (e.g. `Đính kèm tập tin từ máy tính`), without referencing `@file` autocomplete.
       - Update default placeholder in `ChatInputBar`: change from `'Hỏi AI... (@, @file, #, /)'` to `'Hỏi AI... (@, #, /)'` or `'Hỏi AI... (@, @doc:, #, /)'`.
       - Keep `handlePickFile` intact and keep paperclip button intact in the toolbar (`<Button icon={<PaperClipOutlined />} onClick={handlePickFile} />`).
       - If `parseFileInputPath` is only used for path autocomplete in `ChatInputBar`, check if it can be kept or simplified; keep exported if tests in `fileReference.test.ts` reference it, or update both cleanly.
    2. In `tests/ai/ChatInputBar.test.tsx`:
       - Add a test verifying that typing `@` does not render file autocomplete hints or trigger file path completions.
       - Verify `@` still autocompletes tasks and `@doc:` still autocompletes documents.
       - Verify clicking the paperclip button calls `select_local_file` / opens file picker.
    3. Run vitest on affected test suites.
  </action>
  <verify>
    <automated>npm test -- tests/ai/ChatInputBar.test.tsx src/services/ai/__tests__/fileReference.test.ts</automated>
  </verify>
  <done>
    `ChatInputBar` no longer shows `@file` autocomplete or local file path completion when typing `@` or `/file`, while the attach file button (paperclip) continues to work smoothly. All tests pass.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| User input -> Tauri API | Removing autocomplete removes invoke('complete_local_path') from input keystrokes, reducing IPC surface |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-quick-01 | Information Disclosure | ChatInputBar autocomplete | low | mitigate | Remove real-time filesystem directory listing via autocomplete while retaining explicit user file selection via OS picker |
| T-quick-SC | Tampering | npm/pip/cargo installs | high | mitigate | package-legitimacy gate + blocking human checkpoint for [ASSUMED]/[SUS] |
</threat_model>

<verification>
Run `npm test -- tests/ai/ChatInputBar.test.tsx src/services/ai/__tests__/fileReference.test.ts`
</verification>

<success_criteria>
Chat input bar has @file autocomplete removed, paperclip attach file button preserved, and test suite passes.
</success_criteria>

<output>
Create `.planning/quick/261005-jfa-remove-file-autocomplete-in-chat-input-b/261005-jfa-SUMMARY.md` when done
</output>
