---
phase: quick
plan: 261006-ktc
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/notes/NormalizeDocModal.tsx
  - tests/components/notes/NormalizeDocModal.test.tsx
  - src/services/ai/aiTools.ts
  - tests/ai/aiTools.test.ts
  - src/components/ai/AIChatDrawer.tsx
  - src/components/notes/DocEditorPane.tsx
  - tests/components/notes/DocEditorPane.test.tsx
  - tests/ai/AIChatDrawer.test.tsx
autonomous: true
requirements:
  - AI-NORMALIZE-THINKING-STRIP
  - AI-MUTATION-ENRICHED-CONTEXT
  - AI-DOC-CONTEXT-GROUNDING
  - DOC-PANE-CLEANUP-TOC

must_haves:
  truths:
    - "NormalizeDocModal strips reasoning processes, thinking blocks (<think>...</think>), and unclosed thinking tags from incoming stream chunks before setting proposedContent"
    - "Normalization prompts explicitly forbid the model from returning thought processes, thinking tags, or conversational introductions"
    - "AI mutation confirmation describes affected entity names (task name, project name, milestone name, note title) and formats changed attributes with new values instead of raw IDs and keys"
    - "AIChatDrawer grounds document scope context via serializeDocumentContext when effectiveScope is of type document with a valid ID"
    - "Clicking 'Hỏi AI' in DocEditorPane provides an expanded initial prompt with document title, word count, tags, and actionable analysis intent"
    - "DocEditorPane contains only one Table of Contents toggle button (the labeled 'Mục lục' button) without the redundant icon-only button"
  artifacts:
    - path: "src/components/notes/NormalizeDocModal.tsx"
      provides: "stripThinkingText utility and sanitized streaming normalization"
    - path: "src/services/ai/aiTools.ts"
      provides: "describeToolMutationWithContext async helper and formatFieldChanges utility"
      exports: ["describeToolMutationWithContext", "describeToolMutation"]
    - path: "src/components/ai/AIChatDrawer.tsx"
      provides: "Enriched mutation confirmation summary and document-scoped system instruction grounding"
    - path: "src/components/notes/DocEditorPane.tsx"
      provides: "Expanded Ask AI prompt and single Table of Contents button"
    - path: "tests/components/notes/NormalizeDocModal.test.tsx"
      provides: "Unit tests verifying thinking tag removal during streaming"
    - path: "tests/ai/aiTools.test.ts"
      provides: "Unit tests verifying entity name resolution and field value formatting in mutation descriptions"
  key_links:
    - from: "src/components/ai/AIChatDrawer.tsx"
      to: "src/services/ai/aiTools.ts"
      via: "describeToolMutationWithContext"
      pattern: "describeToolMutationWithContext(tc.function.name, args, db)"
    - from: "src/components/ai/AIChatDrawer.tsx"
      to: "src/services/ai/contextGrounding.ts"
      via: "serializeDocumentContext"
      pattern: "serializeDocumentContext(note)"
---

<objective>
Enhance the AI user experience across documentation and chat workflows by:
1. Stripping reasoning process and `<think>...</think>` tags from streaming chunks in NormalizeDocModal while refining the prompt.
2. Enriching AI mutation confirmations in `aiTools.ts` and `AIChatDrawer.tsx` to display human-readable entity names and formatted field changes instead of raw IDs and keys.
3. Grounding document context (`serializeDocumentContext`) in `AIChatDrawer.tsx` when scoped to a note, and expanding the "Hỏi AI" prompt in `DocEditorPane.tsx` with document metadata and analysis intent.
4. Removing the redundant icon-only Table of Contents button in `DocEditorPane.tsx`.

Purpose:
Prevent raw reasoning artifacts from polluting normalized markdown, provide users with clear and understandable confirmation dialogs detailing what data will change, ensure AI chat has complete document grounding when discussing notes, and eliminate UI clutter in the document editor.

Output:
- `src/components/notes/NormalizeDocModal.tsx` + `tests/components/notes/NormalizeDocModal.test.tsx`
- `src/services/ai/aiTools.ts` + `tests/ai/aiTools.test.ts`
- `src/components/ai/AIChatDrawer.tsx` + `tests/ai/AIChatDrawer.test.tsx`
- `src/components/notes/DocEditorPane.tsx` + `tests/components/notes/DocEditorPane.test.tsx`
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@src/components/notes/NormalizeDocModal.tsx
@src/services/ai/aiTools.ts
@src/components/ai/AIChatDrawer.tsx
@src/components/notes/DocEditorPane.tsx
@src/services/ai/contextGrounding.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Strip thinking text in NormalizeDocModal and clarify prompt</name>
  <files>src/components/notes/NormalizeDocModal.tsx, tests/components/notes/NormalizeDocModal.test.tsx</files>
  <behavior>
    - Streaming chunks with closed `<think>...</think>` blocks have the entire thinking block removed from proposedContent.
    - Streaming chunks with unclosed `<think>...` blocks have the in-progress thinking block removed during streaming.
    - Markdown content outside `<think>` tags is preserved cleanly without extra leading or trailing whitespace artifacts.
    - The normalization user prompt explicitly instructs the model to return only markdown and omit thinking tags or commentary.
  </behavior>
  <action>
    1. In `src/components/notes/NormalizeDocModal.tsx`:
       - Define and export `stripThinkingText(text: string): string`:
         * Strip completed thinking blocks matching `/<think>[\s\S]*?<\/think>/gi`.
         * Strip unclosed thinking blocks during streaming matching `/<think>[\s\S]*$/i`.
         * Strip alternative reasoning tags if present, e.g. `/<thought>[\s\S]*?<\/thought>/gi` and `/<thought>[\s\S]*$/i`.
         * Return cleaned text with trimmed leading whitespace if a thinking block preceded the content.
       - In `startNormalization`:
         * Update `userPrompt` to explicitly forbid thinking outputs: append `Tuyệt đối không xuất thẻ <think> hoặc quá trình suy nghĩ, chỉ trả về nội dung Markdown kết quả.`
         * In the streaming loop `for await (const chunk of stream)`, accumulate raw text and call `setProposedContent(stripThinkingText(accumulated))`.
    2. In `tests/components/notes/NormalizeDocModal.test.tsx`:
       - Add a unit test where `mockStream` yields `<think>Đang suy nghĩ cấu trúc...</think># Tiêu đề chuẩn hóa\n\nNội dung`.
       - Verify that `proposedContent` receives `# Tiêu đề chuẩn hóa\n\nNội dung` and does not display the thinking text.
       - Add a test verifying mid-stream unclosed `<think>` suppression.
  </action>
  <verify>
    <automated>npm test tests/components/notes/NormalizeDocModal.test.tsx</automated>
  </verify>
  <done>
    Thinking blocks and `<think>` tags are stripped during normalization streaming, prompts forbid thoughts, and test suite passes.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Enrich AI tool mutation descriptions with entity context and formatted field changes</name>
  <files>src/services/ai/aiTools.ts, tests/ai/aiTools.test.ts</files>
  <behavior>
    - `describeToolMutationWithContext` resolves task names for `update_task`, `delete_task`, `reparent_task`, and `update_task_checklist`.
    - `describeToolMutationWithContext` resolves project names for `update_project` and `delete_project`.
    - `describeToolMutationWithContext` resolves milestone names for `update_milestone` and `delete_milestone`.
    - `describeToolMutationWithContext` resolves note titles for `update_note` and `delete_note`.
    - `describeToolMutationWithContext` resolves task names for allocations, work sessions, and timer tools.
    - Changed attributes format field names in Vietnamese with their updated values (e.g., `Trạng thái: "done"`, `Ưu tiên: "high"`) instead of bare keys.
    - Falls back cleanly to `describeToolMutation` if `db` is omitted or entity lookup returns undefined.
  </behavior>
  <action>
    1. In `src/services/ai/aiTools.ts`:
       - Implement `formatFieldChanges(args: Record<string, any>, ignoredKeys?: string[]): string` that formats changed fields into human-readable labels and values (e.g., name -> Tên, status -> Trạng thái, priority -> Ưu tiên, deadline -> Hạn chót, estimateMinutes -> Ước tính, body -> Nội dung, etc.).
       - Update existing `describeToolMutation(toolName: string, args: Record<string, any>): string` to utilize `formatFieldChanges` for mutation summaries instead of bare `Object.keys(args).join(', ')`.
       - Implement and export `async function describeToolMutationWithContext(toolName: string, args: Record<string, any>, db?: TaskPlannerDatabase): Promise<string>`:
         * Normalize tool name.
         * If `db` is available, look up entity records:
           - For tasks (`update_task`, `delete_task`, `reparent_task`, `update_task_checklist`): query `await db.tasks.get(args.id || args.taskId)`. Include `"${task.name}"`. For `reparent_task`, resolve destination project/milestone names.
           - For projects (`update_project`, `delete_project`): query `await db.projects.get(args.id)`. Include `"${project.name}"`.
           - For milestones (`update_milestone`, `delete_milestone`): query `await db.milestones.get(args.id)`. Include `"${milestone.name}"`.
           - For notes (`update_note`, `delete_note`): query `await db.notes.get(args.id)`. Include `"${note.title}"`.
           - For allocations and work sessions (`plan_allocation`, `delete_allocation`, `log_work_session`, `start_timer`, etc.): query `await db.tasks.get(args.taskId)`. Include `cho tác vụ "${task.name}"`.
           - For document links (`link_document`, `unlink_document`): query document note title and entity name.
           - For reminders (`manage_reminders`): resolve entity name if possible.
         * Format field changes using `formatFieldChanges(args)`.
         * If `db` is undefined or entity not found, fall back to `describeToolMutation(toolName, args)`.
    2. In `tests/ai/aiTools.test.ts`:
       - Add test suite for `describeToolMutationWithContext` testing:
         * `update_task` with resolved task name and formatted fields (`Trạng thái: "done"`, `Ưu tiên: "High"`).
         * `delete_task` with resolved task name.
         * `update_project` with resolved project name.
         * `update_note` and `delete_note` with resolved note title.
         * `plan_allocation` with resolved task name.
         * Fallback behavior when entity does not exist in DB.
  </action>
  <verify>
    <automated>npm test tests/ai/aiTools.test.ts</automated>
  </verify>
  <done>
    `describeToolMutationWithContext` and `formatFieldChanges` correctly resolve entity names and format changed values, verified by passing unit tests.
  </done>
</task>

<task type="auto">
  <name>Task 3: Ground document context in AIChatDrawer, enrich Ask AI prompt, and remove redundant ToC button</name>
  <files>src/components/ai/AIChatDrawer.tsx, src/components/notes/DocEditorPane.tsx, tests/components/notes/DocEditorPane.test.tsx, tests/ai/AIChatDrawer.test.tsx</files>
  <action>
    1. In `src/components/ai/AIChatDrawer.tsx`:
       - Import `describeToolMutationWithContext` from `../../services/ai/aiTools`.
       - Import `serializeDocumentContext` from `../../services/ai/contextGrounding`.
       - In `sendMessage` where `isMutationTool(tc.function.name, args)` triggers user confirmation:
         * Replace sync call with `const summary = await describeToolMutationWithContext(tc.function.name, args, db);`.
       - In `sendMessage` system instruction assembly where `effectiveScope` is checked (around line 469):
         * Add branch for `effectiveScope.type === 'document' && effectiveScope.id`:
           `const note = await db.notes.get(effectiveScope.id); if (note) { systemInstruction = serializeDocumentContext(note); }`
    2. In `src/components/notes/DocEditorPane.tsx`:
       - Remove redundant icon-only Table of Contents button at lines 640-648 (`<Tooltip title={showToC ? 'Ẩn mục lục' : 'Hiện mục lục'}><Button ... icon={<OrderedListOutlined />} onClick={toggleToC} /></Tooltip>`), retaining only the labeled "Mục lục" button at lines 535-545.
       - In `handleAskAI`:
         * Expand prompt with document metadata and actionable request:
           Calculate word count: `const wordCount = doc.body ? doc.body.trim().split(/\s+/).filter(Boolean).length : 0;`
           Collect tags: `const tagInfo = doc.tags && doc.tags.length > 0 ? ` [Tags: ${doc.tags.join(', ')}]` : '';`
           Set expanded prompt: `Tôi đang xem xét tài liệu "${doc.title || 'Chưa đặt tên'}" (${wordCount} từ${tagInfo}). Hãy phân tích nội dung, tóm tắt các điểm then chốt và gợi ý các hành động tiếp theo hoặc liên kết với các tác vụ/dự án phù hợp.`
           Call `aiChat.openChat({ type: 'document', id: doc.id, title: doc.title || 'Tài liệu' }, expandedPrompt)`.
    3. In `tests/components/notes/DocEditorPane.test.tsx`:
       - Add test verifying that only one "Mục lục" button is rendered.
       - Add test verifying `handleAskAI` opens AI chat with enriched prompt containing doc title, word count, and analysis intent.
    4. In `tests/ai/AIChatDrawer.test.tsx`:
       - Add test verifying document grounding when `effectiveScope` is `{ type: 'document', id: 'note-1' }`.
       - Add test verifying enriched summary is displayed in confirmation modal when executing a mutation.
  </action>
  <verify>
    <automated>npm test tests/components/notes/DocEditorPane.test.tsx tests/ai/AIChatDrawer.test.tsx</automated>
  </verify>
  <done>
    `AIChatDrawer` grounds document scope, `DocEditorPane` has a single ToC button and rich Ask AI prompt, and all component tests pass.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| LLM Stream -> UI Markdown Preview | Unfiltered streaming chunks from external model could contain reasoning tokens or malformed markdown |
| AI Tool Mutation Confirmation -> Execution | Confirmation prompt presented to user before executing state-changing operations |
| Note Content -> System Instruction Prompt | Note body injected into system context for AI document chat |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-quick-01 | Tampering | `NormalizeDocModal.tsx` | low | mitigate | Sanitize streaming chunks with `stripThinkingText` to prevent reasoning blocks or leaked prompt instructions from contaminating document content |
| T-quick-02 | Information Disclosure | `AIChatDrawer.tsx` | medium | mitigate | Ground document context using `serializeDocumentContext` with character limits to prevent prompt token bloat while ensuring accurate item grounding |
| T-quick-03 | Elevation of Privilege | `aiTools.ts` / `AIChatDrawer.tsx` | high | mitigate | Provide human-readable entity names and exact field value changes in confirmation modal so users do not accidentally approve destructive or unwanted mutations |
| T-quick-SC | Tampering | npm/pip/cargo installs | high | mitigate | package-legitimacy gate + blocking human checkpoint for [ASSUMED]/[SUS] |
</threat_model>

<verification>
Automated verification commands:
```bash
npm test tests/components/notes/NormalizeDocModal.test.tsx tests/ai/aiTools.test.ts tests/components/notes/DocEditorPane.test.tsx tests/ai/AIChatDrawer.test.tsx
```
Verify build and lint:
```bash
npm run build
```
</verification>

<success_criteria>
1. `NormalizeDocModal` removes all `<think>` tags and reasoning text during streaming and final apply.
2. `describeToolMutationWithContext` resolves names for tasks, projects, milestones, notes, and formats field diffs.
3. `AIChatDrawer` grounds document scope when talking about notes.
4. `DocEditorPane` provides rich context on "Hỏi AI" and eliminates the duplicate ToC icon button.
5. All test suites pass without regression.
</success_criteria>

<output>
Create `.planning/quick/261006-ktc-fix-ai-normalize-thinking-text-enrich-ai/261006-ktc-SUMMARY.md` when done
</output>
