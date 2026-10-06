---
phase: quick
plan: 261006-czh
type: execute
wave: 1
depends_on: []
files_modified:
  - src/views/NotesView.tsx
  - src/components/notes/DocFolderTree.tsx
  - src/components/notes/DocListPane.tsx
  - src/components/notes/DocEditorPane.tsx
  - src/components/notes/NormalizeDocModal.tsx
  - tests/views/NotesView.test.tsx
  - tests/components/notes/DocEditorPane.test.tsx
  - tests/components/notes/NormalizeDocModal.test.tsx
autonomous: true
requirements:
  - NOTES-QUICK-NOTE-TYPE-FIX
  - NOTES-DOC-RECOMMENDED-TEMPLATE-AUTOFILL
  - NOTES-DOC-AI-NORMALIZE-ACTION
  - NOTES-DOC-NORMALIZE-REVIEW-MODAL

must_haves:
  truths:
    - "Creating a note from the quick_notes view sets type to 'quick_note' instead of 'document', keeping it visible in the quick notes list"
    - "Creating a new document (type 'document') autofills the body with the recommended structure template from AI_KNOWLEDGE_DOC_PROMPT instead of the generic placeholder"
    - "DocEditorPane features an 'AI Chuẩn hóa' (AI Normalize) action button in the toolbar"
    - "Clicking 'AI Chuẩn hóa' opens a review modal that streams or proposes normalized markdown according to AI_KNOWLEDGE_DOC_PROMPT guidelines"
    - "User can inspect the proposed normalized content and either Accept ('Chấp nhận' - updates body and triggers auto-save) or Cancel ('Hủy' - discards without mutating document)"
  artifacts:
    - path: "src/views/NotesView.tsx"
      provides: "RECOMMENDED_DOC_TEMPLATE constant and fixed handleCreateDocument setting type 'quick_note' when in quick_notes view"
      exports: ["RECOMMENDED_DOC_TEMPLATE", "AI_KNOWLEDGE_DOC_PROMPT"]
    - path: "src/components/notes/NormalizeDocModal.tsx"
      provides: "AI normalization review modal with comparison/preview, streaming completion, and Accept/Cancel actions"
      exports: ["NormalizeDocModal"]
    - path: "src/components/notes/DocEditorPane.tsx"
      provides: "Integration of 'AI Chuẩn hóa' button triggering NormalizeDocModal and updating document body"
  key_links:
    - from: "src/components/notes/DocEditorPane.tsx"
      to: "src/components/notes/NormalizeDocModal.tsx"
      via: "NormalizeDocModal render and onApply handler"
      pattern: "<NormalizeDocModal"
    - from: "src/components/notes/NormalizeDocModal.tsx"
      to: "src/services/ai/nineRouterClient.ts"
      via: "streamChatCompletion call with AI_KNOWLEDGE_DOC_PROMPT system prompt"
      pattern: "streamChatCompletion"
---

<objective>
Fix the note creation type bug in quick_notes view, autofill newly created documents with the recommended AI knowledge document structure template, and introduce an "AI Chuẩn hóa" (AI Normalize) action in DocEditorPane with a comparison/review modal to convert arbitrary document notes into the standardized structure.

Purpose:
Ensure quick notes created in the quick notes view persist as quick notes, give users a structured starting template immediately upon document creation, and enable one-click AI normalization of existing unstructured notes into clean, BM25-optimized knowledge docs.

Output:
- `src/views/NotesView.tsx` with `RECOMMENDED_DOC_TEMPLATE` export and type-aware note creation.
- `src/components/notes/DocFolderTree.tsx` & `src/components/notes/DocListPane.tsx` with dynamic quick note create button labels.
- `src/components/notes/NormalizeDocModal.tsx` review modal with side-by-side or preview comparison, streaming AI completion, and Accept/Cancel flows.
- `src/components/notes/DocEditorPane.tsx` updated with the "AI Chuẩn hóa" button and modal integration.
- Unit tests in `tests/views/NotesView.test.tsx`, `tests/components/notes/DocEditorPane.test.tsx`, and `tests/components/notes/NormalizeDocModal.test.tsx`.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@src/views/NotesView.tsx
@src/components/notes/DocEditorPane.tsx
@src/components/notes/DocFolderTree.tsx
@src/components/notes/DocListPane.tsx
@src/services/ai/nineRouterClient.ts
@src/services/ai/nineRouterTokenService.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Fix quick_note creation type and autofill new documents with RECOMMENDED_DOC_TEMPLATE</name>
  <files>src/views/NotesView.tsx, src/components/notes/DocFolderTree.tsx, src/components/notes/DocListPane.tsx, tests/views/NotesView.test.tsx</files>
  <behavior>
    - When activeFilter is 'quick_notes', calling handleCreateDocument creates a note with type 'quick_note' and empty/quick note body, not 'document'.
    - When activeFilter is not 'quick_notes' (e.g. 'inbox', 'all', or a folder), calling handleCreateDocument creates a note with type 'document' and autofills body with RECOMMENDED_DOC_TEMPLATE.
    - DocFolderTree and DocListPane show contextual labels ('Tạo ghi chú nhanh' / 'Tạo ghi chú nhanh mới') when in quick_notes view.
  </behavior>
  <action>
    1. In `src/views/NotesView.tsx`:
       - Extract and export `RECOMMENDED_DOC_TEMPLATE` based on the template section of `AI_KNOWLEDGE_DOC_PROMPT`:
         ```markdown
         # Tiêu đề nghiệp vụ hoặc thành phần

         #domain-tag #system-tag

         ## Tóm tắt
         Mô tả ngắn gọn mục đích và câu hỏi nghiệp vụ mà tài liệu này giải quyết.

         ## Phạm vi
         Phạm vi áp dụng của quy tắc hoặc thành phần này.

         ## Thuật ngữ
         - **Thuật ngữ A**: Định nghĩa ngắn gọn, chính xác.
         - **Thuật ngữ B**: Định nghĩa ngắn gọn, chính xác.

         ## Quy tắc
         1. Quy tắc thứ nhất (ghi rõ điều kiện và kết quả).
         2. Quy tắc thứ hai.

         ## Luồng xử lý
         1. Bước 1: Hành động cụ thể.
         2. Bước 2: Hành động tiếp theo.

         ## Trạng thái và mã lỗi
         | Mã | Ý nghĩa | Hành động xử lý |
         |---|---|---|
         | 00 | Thành công | Tiếp tục quy trình |
         | 05 | Từ chối | Kiểm tra điều kiện |

         ## Ví dụ
         Mô tả ví dụ đầu vào cụ thể và kết quả mong đợi.

         ## Ngoại lệ
         Các trường hợp đặc biệt không áp dụng luồng tiêu chuẩn.

         ## Nguồn
         - Tài liệu/Ticket tham chiếu: SD-XXXXX / PROC_NAME
         - Ngày xác minh: YYYY-MM-DD
         ```
       - In `handleCreateDocument`:
         Check if `activeFilter === 'quick_notes'` and `!targetFolderId`.
         If so:
           Create note with `type: 'quick_note'`, `title: 'Ghi chú nhanh mới'`, `body: ''`.
           Ensure success message states `Đã tạo ghi chú nhanh mới`.
         If creating a document (`type: 'document'`):
           Create note with `type: 'document'`, `title: 'Tài liệu mới'`, and `body: RECOMMENDED_DOC_TEMPLATE`.
       - Pass `activeFilter` into `DocListPane` (or an `emptyActionLabel` / `createButtonLabel` prop).
    2. In `src/components/notes/DocFolderTree.tsx`:
       - Update the primary create button label: when `activeFilter === 'quick_notes'`, display `Tạo ghi chú nhanh` instead of `Tạo tài liệu`.
    3. In `src/components/notes/DocListPane.tsx`:
       - When `activeFilter === 'quick_notes'` and list is empty, display empty description `Chưa có ghi chú nhanh nào` and button label `Tạo ghi chú nhanh mới`.
    4. In `tests/views/NotesView.test.tsx`:
       - Add test cases verifying:
         - Creating a note while viewing `quick_notes` filter creates a note with `type: 'quick_note'`.
         - Creating a note while viewing documents creates a note with `type: 'document'` and body containing the sections of `RECOMMENDED_DOC_TEMPLATE`.
  </action>
  <verify>
    <automated>npm test -- tests/views/NotesView.test.tsx</automated>
  </verify>
  <done>
    - Creating a note in quick_notes view sets type to 'quick_note' and renders in the quick notes list.
    - Creating a document sets type to 'document' with RECOMMENDED_DOC_TEMPLATE in body.
    - Tests in tests/views/NotesView.test.tsx pass.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Implement NormalizeDocModal and add 'AI Chuẩn hóa' action to DocEditorPane</name>
  <files>src/components/notes/NormalizeDocModal.tsx, src/components/notes/DocEditorPane.tsx, tests/components/notes/NormalizeDocModal.test.tsx, tests/components/notes/DocEditorPane.test.tsx</files>
  <behavior>
    - DocEditorPane toolbar displays an 'AI Chuẩn hóa' button.
    - Clicking 'AI Chuẩn hóa' opens NormalizeDocModal with the current document body.
    - NormalizeDocModal queries NineRouter config and API key via getNineRouterConfig and getNineRouterApiKey.
    - If API key is missing, shows an informative warning/alert to configure API key.
    - NormalizeDocModal calls streamChatCompletion using AI_KNOWLEDGE_DOC_PROMPT instructions and streams the normalized markdown proposal into the view.
    - User can inspect original content vs proposed normalized content (side-by-side or preview tabs).
    - User can click 'Chấp nhận' (Accept) to apply the normalized content: calls onApply callback, updates DocEditorPane body, triggers auto-save, and closes modal.
    - User can click 'Hủy' (Cancel): aborts any active streaming request and closes modal without modifying the document.
  </behavior>
  <action>
    1. Create `src/components/notes/NormalizeDocModal.tsx`:
       - Props:
         ```ts
         export interface NormalizeDocModalProps {
           open: boolean;
           originalContent: string;
           docTitle?: string;
           onClose: () => void;
           onApply: (normalizedMarkdown: string) => void;
           db?: TaskPlannerDatabase;
         }
         ```
       - State:
         `proposedContent`, `isStreaming`, `error`, `activeViewMode` ('split' | 'preview' | 'diff').
         `abortControllerRef` to cancel in-flight stream on modal close or user cancel.
       - Logic:
         On modal open, fetch `getNineRouterConfig(db)` and `getNineRouterApiKey(db)`.
         If API key is missing, set friendly error: `Chưa cấu hình API Key. Vui lòng mở Cài đặt AI để thiết lập API Key.`
         If API key is present, invoke `streamChatCompletion`:
           System prompt: `AI_KNOWLEDGE_DOC_PROMPT`.
           User message prompt:
           `Hãy chuẩn hóa nội dung ghi chú/tài liệu sau đây vào đúng cấu trúc khung chuẩn Markdown đã hướng dẫn. Giữ lại toàn bộ thông tin quan trọng, từ khóa và dữ liệu thực tế, bổ sung các mục còn thiếu (hoặc để placeholder hợp lý) theo đúng định dạng. Chỉ trả về nội dung Markdown kết quả, không viết thêm lời dẫn chào hay giải thích ngoài lề.\n\nNội dung hiện tại:\n"""\n${originalContent}\n"""`
           Stream deltas into `proposedContent`.
       - Render:
         Modal with width 960px (responsive), title "AI Chuẩn hóa tài liệu".
         Toolbar with Segmented toggle: "So sánh 2 cột" (Original vs Proposed) and "Xem trước kết quả" (Rendered Markdown preview via renderSafeMarkdown).
         Proposed content editor/preview (allows user to tweak the proposed text directly if desired).
         Footer with:
           - "Hủy" button (calls abort, resets state, calls `onClose`).
           - "Tạo lại" button (allows re-running the normalization prompt).
           - "Chấp nhận" button (disabled while streaming or if proposedContent is empty; calls `onApply(proposedContent)`, shows message, calls `onClose`).
    2. In `src/components/notes/DocEditorPane.tsx`:
       - Add state `isNormalizeModalOpen`.
       - Add toolbar button:
         ```tsx
         <Tooltip title="Chuẩn hóa nội dung tài liệu theo cấu trúc chuẩn AI Knowledge Document">
           <Button
             size="small"
             icon={<RobotOutlined style={{ color: '#0284c7' }} />}
             onClick={() => setIsNormalizeModalOpen(true)}
           >
             AI Chuẩn hóa
           </Button>
         </Tooltip>
         ```
       - Render `<NormalizeDocModal>` when `isNormalizeModalOpen` is true:
         `onApply={(normalizedMarkdown) => { setBody(normalizedMarkdown); triggerAutoSave(title, normalizedMarkdown, tags); message.success('Đã chuẩn hóa tài liệu thành công'); }}`
    3. Create unit tests in `tests/components/notes/NormalizeDocModal.test.tsx`:
       - Test modal renders original content.
       - Test missing API key displays warning banner.
       - Test streaming completion updates proposed content and clicking Accept triggers `onApply`.
       - Test clicking Cancel closes modal without applying.
    4. Update `tests/components/notes/DocEditorPane.test.tsx`:
       - Verify 'AI Chuẩn hóa' button is rendered in the toolbar.
       - Verify clicking 'AI Chuẩn hóa' opens the normalization modal.
  </action>
  <verify>
    <automated>npm test -- tests/components/notes/DocEditorPane.test.tsx tests/components/notes/NormalizeDocModal.test.tsx</automated>
  </verify>
  <done>
    - 'AI Chuẩn hóa' button is visible in DocEditorPane toolbar.
    - NormalizeDocModal properly streams/displays AI normalization proposal with side-by-side comparison and rendered markdown.
    - Accepting updates document body and saves changes; cancelling discards safely.
    - All tests in tests/components/notes/DocEditorPane.test.tsx and tests/components/notes/NormalizeDocModal.test.tsx pass.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Client -> AI Router Endpoint | Local or remote NineRouter endpoint receives note markdown text and API key |
| AI Output -> Client Markdown Renderer | AI-generated markdown is parsed and rendered in UI and saved to local IndexedDB |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-quick-01 | Information Disclosure | `NormalizeDocModal.tsx` | medium | mitigate | API key is fetched locally from keyring/settings and passed via Authorization header; never logged or saved into note bodies |
| T-quick-02 | Tampering / Code Injection | `NormalizeDocModal.tsx` | medium | mitigate | Proposed markdown preview is sanitized via `renderSafeMarkdown` (DOMPurify) before rendering HTML in preview tab |
| T-quick-03 | Denial of Service / Hanging Stream | `NormalizeDocModal.tsx` | low | mitigate | Use AbortController on modal close or cancel to cleanly terminate pending streaming HTTP requests |
| T-quick-SC | Tampering | npm dependencies | high | mitigate | No new npm packages added; uses existing native streamChatCompletion and Ant Design components |
</threat_model>

<verification>
Run strictly focused unit tests for modified components:
```bash
npm test -- tests/views/NotesView.test.tsx tests/components/notes/DocEditorPane.test.tsx tests/components/notes/NormalizeDocModal.test.tsx
```
Verify no unrelated tests are executed.
</verification>

<success_criteria>
1. Creating notes while in quick_notes view sets type to 'quick_note' and shows them in the quick notes list.
2. Creating documents sets type to 'document' and populates the body with RECOMMENDED_DOC_TEMPLATE.
3. 'AI Chuẩn hóa' button exists in DocEditorPane and opens NormalizeDocModal.
4. NormalizeDocModal displays original content alongside AI-proposed normalized markdown with Accept/Cancel actions.
5. All target tests pass without running unrelated tests.
</success_criteria>

<output>
Create `.planning/quick/261006-czh-autofill-doc-template-on-create-and-ai-n/261006-czh-SUMMARY.md` when execution completes.
</output>
