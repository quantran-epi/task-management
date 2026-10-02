---
phase: quick
plan: 261002-cie
type: execute
wave: 1
depends_on: []
files_modified:
  - src/services/jira/statusMapping.ts
  - src/components/tasks/TaskJiraSection.tsx
  - src/components/settings/JiraConfigCard.tsx
  - src/components/notes/NoteDetailModal.tsx
  - src/components/notes/NoteAttachmentsPanel.tsx
  - src/components/notes/QuickNoteEntry.tsx
  - src/utils/screenshotCapture.ts
  - src/views/NotesView.tsx
  - src/views/NotesPopoutView.tsx
  - src/components/notes/EntityNotesSection.tsx
  - tests/services/jira/statusMapping.test.ts
  - tests/components/tasks/TaskJiraSection.test.tsx
  - tests/components/settings/JiraConfigCard.test.tsx
  - tests/components/notes/NoteDetailModal.test.tsx
  - tests/components/notes/QuickNoteEntry.test.tsx
  - tests/utils/screenshotCapture.test.ts
autonomous: true
requirements:
  - CIE-JIRA-01
  - CIE-JIRA-02
  - CIE-NOTES-01
  - CIE-NOTES-02
  - CIE-NOTES-03
  - CIE-NOTES-04
user_setup: []
must_haves:
  truths:
    - "User can edit local TaskStatus to Jira status mappings from Jira settings."
    - "Changing local task status never calls Jira transition API or opens Jira sync confirmation."
    - "User can still update Jira status only by pressing explicit Jira workflow transition button."
    - "Clicking a note list item opens a detail modal instead of requiring edit mode."
    - "Image attachments in note detail/editor open Ant Design image preview."
    - "User can capture one browser-approved window/screen frame from note UI and attach it as an image."
    - "User can type a quick note, optionally attach a screenshot, press Enter, and edit full details afterward."
  artifacts:
    - path: "src/services/jira/statusMapping.ts"
      provides: "Shared Jira status mapping defaults, normalizer, and mapping helpers"
      exports: ["DEFAULT_JIRA_STATUS_MAPPINGS", "LOCAL_TASK_STATUSES", "normalizeJiraStatusMappings", "findReachableTransitions", "resolveLocalStatusFromMapping", "isStatusMismatch", "mapJiraStatusToLocalTaskStatus"]
    - path: "src/components/settings/JiraConfigCard.tsx"
      provides: "Settings UI for local status to Jira status ID mapping persisted in db.settings:jira_status_mappings"
    - path: "src/components/tasks/TaskJiraSection.tsx"
      provides: "Jira link/transition UI where local status edits stay local and only explicit workflow transition updates Jira"
    - path: "src/components/notes/NoteDetailModal.tsx"
      provides: "Read-only note detail modal with safe markdown and read-only attachment preview"
    - path: "src/utils/screenshotCapture.ts"
      provides: "Native getDisplayMedia one-frame PNG capture helper that stops tracks immediately"
      exports: ["captureFocusedWindowScreenshot"]
    - path: "src/components/notes/QuickNoteEntry.tsx"
      provides: "Textbox plus screenshot control for quick note creation"
  key_links:
    - from: "src/components/settings/JiraConfigCard.tsx"
      to: "src/components/tasks/TaskJiraSection.tsx"
      via: "db.settings key jira_status_mappings"
      pattern: "jira_status_mappings"
    - from: "src/components/tasks/TaskJiraSection.tsx"
      to: "src/services/jira/jiraApi.ts"
      via: "executeJiraTransition only from explicit button handler"
      pattern: "handleExecuteTransition"
    - from: "src/views/NotesView.tsx"
      to: "src/components/notes/NoteDetailModal.tsx"
      via: "selected note state opened by card/list item click"
      pattern: "NoteDetailModal"
    - from: "src/components/notes/NoteDetailModal.tsx"
      to: "src/components/notes/NoteAttachmentsPanel.tsx"
      via: "readOnly attachment panel with Ant Design Image preview"
      pattern: "readOnly"
    - from: "src/components/notes/NoteAttachmentsPanel.tsx"
      to: "src/utils/screenshotCapture.ts"
      via: "capture button creates File then existing attachment path persists/stages it"
      pattern: "captureFocusedWindowScreenshot"
    - from: "src/components/notes/QuickNoteEntry.tsx"
      to: "src/db/repositories/noteRepo.ts"
      via: "createNote then addNoteAttachment for staged screenshot"
      pattern: "createNote"
---

<objective>
Add Jira status mapping UI, keep local status changes local, add note detail viewing, image preview access, screenshot capture attachment, and quick-note entry.

Purpose: Make Jira linkage safer and note capture faster while preserving offline-first local data and explicit user control over Jira writes.
Output: One focused quick implementation plan covering Jira settings/task Jira behavior, note detail/preview, native browser screenshot capture, and quick-note creation.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@package.json
@src/services/jira/statusMapping.ts
@src/components/tasks/TaskJiraSection.tsx
@src/components/settings/JiraConfigCard.tsx
@src/services/jira/jiraApi.ts
@src/components/notes/NoteAttachmentsPanel.tsx
@src/components/notes/NoteEditor.tsx
@src/views/NotesView.tsx
@src/views/NotesPopoutView.tsx
@src/components/notes/EntityNotesSection.tsx
@src/db/repositories/noteRepo.ts
@src/types/models.ts
@src/validation/schemas.ts
@tests/components/tasks/TaskJiraSection.test.tsx
@tests/components/settings/JiraConfigCard.test.tsx
@tests/services/jira/statusMapping.test.ts
</context>

<source_audit>
| SOURCE | ID | Feature/Requirement | Plan | Status | Notes |
|---|---|---|---|---|---|
| GOAL | quick-description | Add UI mapping from local statuses to Jira statuses | 261002-cie Task 1 | COVERED | JiraConfigCard edits `jira_status_mappings` consumed by TaskJiraSection |
| GOAL | quick-description | Ensure local status changes do not update Jira | 261002-cie Task 1 | COVERED | Remove local-status-change transition prompt/API path; explicit Jira transition button remains |
| GOAL | quick-description | Make note list items open detail modal | 261002-cie Task 2 | COVERED | NotesView, NotesPopoutView, EntityNotesSection open NoteDetailModal on item click |
| GOAL | quick-description | Make image attachments open image preview | 261002-cie Task 2 | COVERED | NoteDetailModal uses NoteAttachmentsPanel readOnly with Ant Design Image preview |
| GOAL | quick-description | Add focused-window screenshot capture from note UI and attach capture | 261002-cie Task 3 | COVERED | Native getDisplayMedia helper and capture buttons attach PNG files |
| GOAL | quick-description | Add quick-note entry with only textbox plus screenshot control; Enter creates note; full details editable afterward | 261002-cie Task 3 | COVERED | QuickNoteEntry mounts in notes UIs and created note opens through detail/edit flow |
| REQ | CIE-JIRA-01 | Local TaskStatus to Jira status mapping persisted locally | 261002-cie Task 1 | COVERED | `db.settings:jira_status_mappings`, no network write |
| REQ | CIE-JIRA-02 | Local status changes remain local; Jira update requires explicit action | 261002-cie Task 1 | COVERED | Only explicit workflow transition handler calls `executeJiraTransition` |
| REQ | CIE-NOTES-01 | Note item detail modal | 261002-cie Task 2 | COVERED | Read-only modal with edit action |
| REQ | CIE-NOTES-02 | Attachment image preview | 261002-cie Task 2 | COVERED | Existing Ant Design Image preview exposed from detail/editor |
| REQ | CIE-NOTES-03 | Browser-approved screenshot capture attachment | 261002-cie Task 3 | COVERED | `navigator.mediaDevices.getDisplayMedia`, one frame, stop tracks, no dependency |
| REQ | CIE-NOTES-04 | Quick note textbox plus screenshot control; Enter creates note | 261002-cie Task 3 | COVERED | No title/status/entity controls in quick entry; full editor remains reachable |
| CONTEXT | user-constraint-01 | Existing working tree has unrelated user changes; do not overwrite/revert them | 261002-cie all tasks | COVERED | Actions limit edits to listed files and preserve unrelated diffs |
| CONTEXT | user-constraint-02 | Browser security prevents silent arbitrary OS-window capture | 261002-cie Task 3 | COVERED | Native user picker only, no silent capture |
| CONTEXT | user-constraint-03 | No dependency for screenshot capture | 261002-cie Task 3 | COVERED | Uses browser APIs only |
| CONTEXT | user-constraint-04 | Prefer existing Ant Design patterns and existing repositories/models | 261002-cie all tasks | COVERED | Uses Ant Design Modal/Image/Select/Input and noteRepo/Dexie settings |
| RESEARCH | none | No research artifact for quick task | 261002-cie | N/A | No new package or external integration choice |
</source_audit>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add Jira status mapping settings and keep local status edits local</name>
  <files>src/services/jira/statusMapping.ts, src/components/tasks/TaskJiraSection.tsx, src/components/settings/JiraConfigCard.tsx, tests/services/jira/statusMapping.test.ts, tests/components/tasks/TaskJiraSection.test.tsx, tests/components/settings/JiraConfigCard.test.tsx</files>
  <behavior>
    - Test 1: JiraConfigCard renders editable mapping controls for Open, In Progress, In Review, Resolved, Done, and Cancelled.
    - Test 2: saving JiraConfigCard writes `jira_status_mappings` to `db.settings` as `Record<TaskStatus, string[]>` with trimmed non-empty status IDs/tokens.
    - Test 3: invalid or missing `jira_status_mappings` normalizes to `DEFAULT_JIRA_STATUS_MAPPINGS` without crashing TaskJiraSection.
    - Test 4: rerendering linked TaskJiraSection with changed `task.status` does not call `executeJiraTransition` and does not render `Xác nhận đồng bộ trạng thái sang Jira`.
    - Test 5: pressing `Thực hiện chuyển trạng thái` still calls `executeJiraTransition` exactly from explicit user action.
  </behavior>
  <action>First inspect current diff for these files and preserve unrelated user edits. Move private `DEFAULT_STATUS_MAPPINGS` from `TaskJiraSection.tsx` into `statusMapping.ts` as exported `DEFAULT_JIRA_STATUS_MAPPINGS`, add exported ordered `LOCAL_TASK_STATUSES`, and add `normalizeJiraStatusMappings(value)` that returns only known `TaskStatus` keys with arrays of trimmed non-empty strings, falling back to defaults when stored data is malformed. Update existing status-mapping tests for defaults and normalization.

Update `TaskJiraSection.tsx` to import shared defaults/normalizer and read `jira_status_mappings` through the normalizer. Remove local-status-change side effect that fetches transitions, computes reachable transitions, opens `Xác nhận đồng bộ trạng thái sang Jira`, or calls `executeTransitionId` because local status changes must stay local. Remove related state and modal. Keep existing explicit workflow transition select/button, mismatch alert, refresh buttons, link/unlink, and explicit transition behavior. Do not call Jira API from any `useEffect` keyed only to local `task.status` changes.

Update `JiraConfigCard.tsx` to load/save `jira_status_mappings` alongside existing non-secret Jira settings. Add an Ant Design settings section labeled `Ánh xạ trạng thái cục bộ sang Jira` with one `Select mode="tags"` or compact tag-input control per local status. Copy must tell user to enter Jira status IDs from workflow/status config, with names/tokens allowed only if already used by existing mapping helpers. Save mapping in the same transaction as other Jira settings. Do not store Jira token in mapping state. Do not add packages.</action>
  <verify>
    <automated>npm test -- tests/services/jira/statusMapping.test.ts tests/components/tasks/TaskJiraSection.test.tsx tests/components/settings/JiraConfigCard.test.tsx</automated>
  </verify>
  <done>Jira settings can edit status mappings, TaskJiraSection consumes them, local task status edits never trigger Jira transition API or sync modal, and explicit Jira transition button still works.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Add note detail modal and open attachment image preview from note lists</name>
  <files>src/components/notes/NoteDetailModal.tsx, src/views/NotesView.tsx, src/views/NotesPopoutView.tsx, src/components/notes/EntityNotesSection.tsx, tests/components/notes/NoteDetailModal.test.tsx</files>
  <behavior>
    - Test 1: NoteDetailModal renders selected note title/body using existing safe markdown renderer.
    - Test 2: NoteDetailModal loads note attachments by `noteId` and passes them to NoteAttachmentsPanel with `readOnly=true`.
    - Test 3: clicking `Chỉnh sửa đầy đủ` from NoteDetailModal calls edit callback for the same note.
    - Test 4: note item/card click in NotesView, NotesPopoutView, and EntityNotesSection opens detail modal; edit/delete/pin buttons stop propagation.
    - Test 5: rendered attachment thumbnails use Ant Design Image preview behavior through NoteAttachmentsPanel.
  </behavior>
  <action>Create `NoteDetailModal.tsx` with props `open`, `note`, `onClose`, `onEdit`, and optional `db`. When open and note exists, load attachments from `db.noteAttachments.where('noteId').equals(note.id).toArray()`. Render read-only note metadata, safe markdown via existing `renderSafeMarkdown`, update timestamp, entity tag when present, and `NoteAttachmentsPanel` with `noteId`, loaded `attachments`, `readOnly`, and `db`. Footer actions: `Đóng` and `Chỉnh sửa đầy đủ`; edit closes detail through parent state and opens existing NoteEditor for same note.

Update `NotesView.tsx`, `NotesPopoutView.tsx`, and `EntityNotesSection.tsx` so each note card/list item is keyboard-accessible (`role="button"`, `tabIndex=0`, Enter/Space opens detail) and pointer click opens NoteDetailModal. For action buttons inside cards (pin, edit, delete, Jira/entity links if any), call `event.stopPropagation()` before current handlers so list click does not also open detail. Preserve current sorting, filters, tags, popout behavior, and NoteEditor behavior. Do not change note schema or attachment storage.</action>
  <verify>
    <automated>npm test -- tests/components/notes/NoteDetailModal.test.tsx && npm run build</automated>
  </verify>
  <done>Clicking any note list item opens a read-only detail modal, images shown there open Ant Design preview, and full edit remains available without accidental action-button propagation.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Add browser screenshot capture and quick-note entry</name>
  <files>src/utils/screenshotCapture.ts, src/components/notes/NoteAttachmentsPanel.tsx, src/components/notes/QuickNoteEntry.tsx, src/views/NotesView.tsx, src/views/NotesPopoutView.tsx, src/components/notes/EntityNotesSection.tsx, tests/utils/screenshotCapture.test.ts, tests/components/notes/QuickNoteEntry.test.tsx</files>
  <behavior>
    - Test 1: `captureFocusedWindowScreenshot()` calls `navigator.mediaDevices.getDisplayMedia`, captures one PNG File from a video frame, and stops every media track in `finally`.
    - Test 2: when Screen Capture API is unavailable or user cancels picker, note UI shows an error and does not create an attachment.
    - Test 3: NoteAttachmentsPanel shows `Chụp cửa sổ` next to existing image upload, and captured PNG follows existing attachment limits/type/size handling for saved and unsaved notes.
    - Test 4: QuickNoteEntry has only textbox plus screenshot control; Enter creates note, Shift+Enter inserts newline, empty text does not create note.
    - Test 5: QuickNoteEntry creates linked notes when default entity props are supplied and attaches staged screenshot via `addNoteAttachment` after `createNote` succeeds.
  </behavior>
  <action>Create `src/utils/screenshotCapture.ts` exporting `captureFocusedWindowScreenshot()`. Use native `navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })` so browser shows its required picker and user can choose the focused window/screen. Create a muted video element, wait until metadata is available, draw exactly one frame to a canvas, convert to PNG Blob/File named `screenshot-YYYYMMDD-HHmmss.png`, and stop all media tracks in a `finally` block immediately after capture or error. Throw user-readable errors for unsupported API, cancelled picker, zero-sized frame, or canvas failure. Do not add dependencies and do not attempt silent OS-window capture.

Update `NoteAttachmentsPanel.tsx` to add a `Chụp cửa sổ` button beside existing `Thêm ảnh` upload when not read-only and attachment count is below `MAX_ATTACHMENTS`. Captured file must pass the same allowed MIME/size/count path as uploaded files, then either call `addNoteAttachment` for saved notes or append to `stagedFiles` for unsaved notes. Reuse existing message success/error patterns and Image preview thumbnails. Do not bypass the existing five-image/5MB validation.

Create `QuickNoteEntry.tsx` with props `defaultEntityType`, `defaultEntityId`, optional `placeholder`, optional `db`, and optional `onCreated`. UI must be only one Ant Design textarea plus screenshot control/status; no title, pin, entity selector, caption editor, or full form. Enter without Shift trims body and creates a note through `createNote`; Shift+Enter keeps newline. If a screenshot is staged, attach it after note creation with `addNoteAttachment` using PNG metadata. Mount QuickNoteEntry above the note list in `NotesView.tsx`, inside `EntityNotesSection.tsx` with current entity props, and in `NotesPopoutView.tsx` using active filter entity when present. Created notes remain editable through Task 2 detail modal and existing NoteEditor.</action>
  <verify>
    <automated>npm test -- tests/utils/screenshotCapture.test.ts tests/components/notes/QuickNoteEntry.test.tsx && npm run build</automated>
  </verify>
  <done>Note UI can capture a user-selected window/screen frame and attach it as PNG, QuickNoteEntry creates notes on Enter with optional screenshot, linked context is preserved, and media tracks stop immediately after capture.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|---|---|
| Settings UI -> IndexedDB settings | User-entered Jira status mapping tokens become local configuration consumed by Jira task UI |
| Local task status UI -> Jira REST API | A local status edit must not cross into network mutation; only explicit transition button may call Jira |
| Browser Screen Capture picker -> IndexedDB attachment blob | User-approved captured pixels become local note attachment data |
| Markdown note body -> DOM | Stored note markdown renders as HTML in detail modal/list preview |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|---|---|---|---|---|
| T-CIE-01 | Tampering | jira_status_mappings | mitigate | Normalize settings to known TaskStatus keys and arrays of trimmed non-empty strings; fallback to defaults on malformed data |
| T-CIE-02 | Information Disclosure | screenshot capture | mitigate | Use browser `getDisplayMedia` picker only, capture one frame, stop all tracks immediately, and store only user-approved PNG attachment locally |
| T-CIE-03 | Elevation of Privilege | TaskJiraSection local status change | mitigate | Remove local-status-change Jira transition side effect; leave Jira mutation behind explicit transition button only |
| T-CIE-04 | Denial of Service | note attachments | mitigate | Reuse existing max 5 attachments, allowed image MIME types, and 5MB size cap for uploads and screenshots |
| T-CIE-05 | Information Disclosure | note detail rendering | mitigate | Reuse existing `renderSafeMarkdown` sanitizer and do not render raw user markdown without sanitization |
| T-CIE-SC | Tampering | package supply chain | accept | No package install; native browser/Ant Design/existing repo code only |
</threat_model>

<verification>
Automated verification commands:
- `npm test -- tests/services/jira/statusMapping.test.ts tests/components/tasks/TaskJiraSection.test.tsx tests/components/settings/JiraConfigCard.test.tsx`
- `npm test -- tests/components/notes/NoteDetailModal.test.tsx`
- `npm test -- tests/utils/screenshotCapture.test.ts tests/components/notes/QuickNoteEntry.test.tsx`
- `npm run build`

Manual verification after implementation:
1. Open Settings -> Jira integration, edit mappings for each local status, save, reload, and confirm values persist.
2. Open a linked task, change local status in task drawer, and confirm no Jira sync modal appears and no Jira transition request occurs.
3. Use explicit Jira workflow transition button and confirm Jira transition request still occurs.
4. Open Notes, entity notes, and notes popout; click a note item and confirm detail modal opens.
5. Click image attachment in detail/editor and confirm image preview opens.
6. Click `Chụp cửa sổ`, choose a window/screen in browser picker, confirm one screenshot attaches, and no capture indicator remains active after attachment.
7. Type quick note text, press Enter, and confirm note appears; Shift+Enter creates newline instead of saving.
</verification>

<success_criteria>
- Jira mappings are editable in Settings and persisted as local IndexedDB settings.
- Local task status changes do not mutate Jira or ask to sync Jira.
- Jira status mutation remains available only through explicit workflow transition action.
- Note list items open detail modal with safe body rendering and attachment previews.
- Screenshot capture uses native browser picker, creates PNG attachment, stops tracks immediately, and adds no dependency.
- QuickNoteEntry creates notes with Enter, supports optional screenshot, preserves linked entity context, and leaves full editing available through existing editor.
- Targeted tests and build pass.
</success_criteria>

<output>
Create `.planning/quick/261002-cie-need-ui-for-local-status-to-jira-status-/261002-cie-SUMMARY.md` when done.
</output>
