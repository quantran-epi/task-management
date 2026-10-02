---
phase: quick
plan: 261002-vqg
type: execute
wave: 1
depends_on: []
files_modified:
  - src-tauri/src/lib.rs
  - src-tauri/src/jira_proxy.rs
  - src/utils/documentLinks.ts
  - src/components/tasks/TaskDrawer.tsx
  - src/components/projects/ProjectModal.tsx
  - src/components/tasks/TaskTable.tsx
  - src/components/projects/ProjectTable.tsx
  - tests/utils/documentLinks.test.ts
  - tests/components/TaskTable.test.tsx
  - tests/components/ProjectMilestoneModalAndTable.test.tsx
autonomous: true
requirements:
  - VQG-LOCAL-OPEN-01
  - VQG-LOCAL-BROWSE-02
  - VQG-ITEM-VIEWS-03
  - VQG-TARGETED-TESTS-04
user_setup: []
must_haves:
  truths:
    - "When clicking a document link attached to an item, local folder or file links try to open the system file explorer (Finder/Explorer) at that path in Tauri desktop, or copy path with user feedback in browser."
    - "When clicking an external HTTP/HTTPS link attached to an item, it opens in the default web browser or new tab."
    - "In TaskDrawer and ProjectModal document link form fields, users can browse local folders/files via native file dialog in addition to pasting link text."
    - "In TaskTable and ProjectTable popovers, local folder links are visually distinguished with folder icons and descriptive tooltips."
    - "Only targeted tests and cargo check run during verification, keeping unrelated suites untouched."
  artifacts:
    - path: "src-tauri/src/jira_proxy.rs"
      provides: "Native Tauri commands to open local path in file explorer and browse local folder/file dialogs"
      exports: ["open_local_path", "select_local_folder", "select_local_file"]
    - path: "src/utils/documentLinks.ts"
      provides: "Unified helper module to detect local paths, open document links, and browse local machine"
      exports: ["isLocalPath", "normalizeLocalPath", "openDocumentLink", "browseLocalFolder", "browseLocalFile"]
    - path: "src/components/tasks/TaskDrawer.tsx"
      provides: "Task document links form with browse local machine buttons and direct open test trigger"
    - path: "src/components/projects/ProjectModal.tsx"
      provides: "Project document links form with browse local machine buttons and direct open test trigger"
    - path: "src/components/tasks/TaskTable.tsx"
      provides: "Task document links popover with openDocumentLink click handler and folder/web icons"
    - path: "src/components/projects/ProjectTable.tsx"
      provides: "Project document links popover with openDocumentLink click handler and folder/web icons"
    - path: "tests/utils/documentLinks.test.ts"
      provides: "Targeted unit tests for document link detection, path normalization, and opening dispatch"
  key_links:
    - from: "src/components/tasks/TaskTable.tsx"
      to: "src/utils/documentLinks.ts"
      via: "openDocumentLink and isLocalPath in popover link render"
      pattern: "openDocumentLink"
    - from: "src/components/projects/ProjectTable.tsx"
      to: "src/utils/documentLinks.ts"
      via: "openDocumentLink and isLocalPath in popover link render"
      pattern: "openDocumentLink"
    - from: "src/components/tasks/TaskDrawer.tsx"
      to: "src/utils/documentLinks.ts"
      via: "browseLocalFolder and openDocumentLink in Form.List"
      pattern: "browseLocalFolder"
    - from: "src/components/projects/ProjectModal.tsx"
      to: "src/utils/documentLinks.ts"
      via: "browseLocalFolder and openDocumentLink in Form.List"
      pattern: "browseLocalFolder"
    - from: "src/utils/documentLinks.ts"
      to: "src-tauri/src/jira_proxy.rs"
      via: "tauriInvoke calls to open_local_path, select_local_folder, select_local_file"
      pattern: "open_local_path|select_local_folder"
---

<objective>
Enable opening local folder links in system file explorer when clicked from item views, and add local machine browsing capability to document link form fields across tasks and projects.

Purpose: Allow personal workflow users to attach local project/task folder paths directly from native file dialogs and launch Finder/File Explorer in one click from tables and drawers.
Output: Rust commands for path opening and directory picking, frontend `documentLinks` service, form browsing enhancements in TaskDrawer and ProjectModal, popover integration in TaskTable and ProjectTable, and targeted test coverage.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/STATE.md
@src-tauri/src/lib.rs
@src-tauri/src/jira_proxy.rs
@src/components/tasks/TaskDrawer.tsx
@src/components/projects/ProjectModal.tsx
@src/components/tasks/TaskTable.tsx
@src/components/projects/ProjectTable.tsx
@src/validation/schemas.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Implement native Tauri local explorer commands and frontend documentLinks utility</name>
  <files>src-tauri/src/jira_proxy.rs, src-tauri/src/lib.rs, src/utils/documentLinks.ts, tests/utils/documentLinks.test.ts</files>
  <behavior>
    - isLocalPath returns true for file:// URLs, Unix absolute paths (/...), Windows drive paths (C:\... or C:/...), and UNC paths (\\...)
    - isLocalPath returns false for http://, https://, or non-path strings
    - normalizeLocalPath strips file:// prefix and normalizes leading slashes for Windows drive letters
    - openDocumentLink dispatches to open_local_path via Tauri invoke when isLocalPath is true in Tauri environment
    - openDocumentLink dispatches to open_external_url or window.open when HTTP/HTTPS URL
    - openDocumentLink in non-Tauri browser copies local path to clipboard and displays user notification
    - browseLocalFolder invokes select_local_folder in Tauri to return picked folder path
    - browseLocalFile invokes select_local_file in Tauri to return picked file path
  </behavior>
  <action>
    1. In `src-tauri/src/jira_proxy.rs`:
       - Add `#[tauri::command] pub fn open_local_path(path: String) -> Result<(), String>`:
         Clean leading `file://` if present. Verify path exists or non-empty. Use `open::that(&clean_path)` to launch system file manager at that directory or file. On macOS/Windows, handle directory launching so Finder/Explorer displays the target.
       - Add `#[tauri::command] pub fn select_local_folder() -> Result<Option<String>, String>`:
         Use `rfd::FileDialog::new().set_title("Chọn thư mục liên kết").pick_folder()` returning the string path.
       - Add `#[tauri::command] pub fn select_local_file() -> Result<Option<String>, String>`:
         Use `rfd::FileDialog::new().set_title("Chọn tập tin liên kết").pick_file()` returning the string path.
    2. In `src-tauri/src/lib.rs`:
       - Register `open_local_path`, `select_local_folder`, `select_local_file` in `invoke_handler`.
    3. In `src/utils/documentLinks.ts`:
       - Export `isLocalPath(urlOrPath: string): boolean`.
       - Export `normalizeLocalPath(urlOrPath: string): string`.
       - Export `openDocumentLink(urlOrPath: string): Promise<void>`:
         Check `isLocalPath`. If true and `isTauriApp()`, invoke `open_local_path`. If true and in browser, copy to clipboard using `navigator.clipboard.writeText` and show Ant Design `message.info`.
         If web URL, use `open_external_url` in Tauri or `window.open` in browser.
       - Export `browseLocalFolder(): Promise<string | null>` and `browseLocalFile(): Promise<string | null>`.
    4. In `tests/utils/documentLinks.test.ts`:
       - Write unit tests verifying path detection, normalization, and invocation mocks.
  </action>
  <verify>
    <automated>npm test -- tests/utils/documentLinks.test.ts && cargo check --manifest-path src-tauri/Cargo.toml</automated>
  </verify>
  <done>Native commands compile cleanly and documentLinks helper functions correctly detect, normalize, and dispatch local vs web links with unit test passing.</done>
</task>

<task type="auto">
  <name>Task 2: Add local machine browse capability to TaskDrawer and ProjectModal link forms</name>
  <files>src/components/tasks/TaskDrawer.tsx, src/components/projects/ProjectModal.tsx</files>
  <action>
    1. In `src/components/tasks/TaskDrawer.tsx`:
       - In `renderSection('Tài liệu & ghi chú', ...)` under `Form.List name="documentLinks"`:
       - For each existing field item, add action buttons:
         - A "Duyệt..." folder button (`FolderOpenOutlined`) that calls `browseLocalFolder()` (or dropdown with folder/file options) and updates the form value at that index with `form.setFieldValue(['documentLinks', field.name], chosenPath)`.
         - An "Open" launch button (`ExportOutlined` / `FolderViewOutlined`) allowing the user to test-open the entered path/URL right from the drawer.
       - Next to the "Thêm liên kết" button, add a "Chọn thư mục từ máy" button (`FolderOpenOutlined`) that directly invokes `browseLocalFolder()`; if user selects a folder, it automatically appends it to the links array (`add(path)`).
       - Maintain text input capability so users can still manually paste any web URL or custom path.
    2. In `src/components/projects/ProjectModal.tsx`:
       - Apply the identical enhancements to `Form.List name="documentLinks"`: row-level browse button, test-open button, and "Chọn thư mục từ máy" button next to "Thêm liên kết".
  </action>
  <verify>
    <automated>npm test -- tests/components/ProjectMilestoneModalAndTable.test.tsx</automated>
  </verify>
  <done>TaskDrawer and ProjectModal allow browsing local filesystem for folders/files, auto-fill full path into form, and support testing link opening directly in edit forms.</done>
</task>

<task type="auto">
  <name>Task 3: Connect openDocumentLink in TaskTable and ProjectTable popovers and verify with targeted tests</name>
  <files>src/components/tasks/TaskTable.tsx, src/components/projects/ProjectTable.tsx, tests/components/TaskTable.test.tsx, tests/components/ProjectMilestoneModalAndTable.test.tsx</files>
  <action>
    1. In `src/components/tasks/TaskTable.tsx`:
       - Replace the direct `<a href={link} target="_blank">` inside the document links `Popover` content:
       - Attach `onClick={(e) => { e.preventDefault(); e.stopPropagation(); void openDocumentLink(link); }}`.
       - Use `isLocalPath(link)` to conditionally render `FolderOpenOutlined` icon and title "Mở trong File Explorer" for local folder/file paths, and `LinkOutlined` with "Mở liên kết web" for HTTP/HTTPS URLs.
    2. In `src/components/projects/ProjectTable.tsx`:
       - Update the document links `Popover` content with identical click handling and visual cues.
    3. Update/extend tests in `tests/components/TaskTable.test.tsx` and `tests/components/ProjectMilestoneModalAndTable.test.tsx` to assert that clicking a local folder link invokes `openDocumentLink` without navigating away.
  </action>
  <verify>
    <automated>npm test -- tests/utils/documentLinks.test.ts tests/components/TaskTable.test.tsx tests/components/ProjectMilestoneModalAndTable.test.tsx && cargo check --manifest-path src-tauri/Cargo.toml</automated>
  </verify>
  <done>Clicking document links in task and project tables dispatches to openDocumentLink, local folder links are distinguished with folder icons, and targeted tests pass with zero unrelated tests run.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| User input -> OS process execution | User provides local file/folder path or URL to open in external application |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-VQG-01 | Elevation of Privilege | src-tauri open_local_path | mitigate | Ensure open_local_path only passes the sanitized path to system file opener (`open::that`), without invoking shell interpreters (`sh -c` or `cmd /c`). Prevent arbitrary shell command injection. |
| T-VQG-02 | Tampering | documentLinks input validation | mitigate | Validate links against existing Zod linkSchema and regex patterns (http/https, file://, Windows C:\, Unix /). |
| T-VQG-03 | Information Disclosure | Local file browsing | mitigate | Use native OS file dialog (`rfd::FileDialog`) ensuring user explicitly selects directories/files via OS UI. |
</threat_model>

<verification>
Run targeted test commands:
```bash
npm test -- tests/utils/documentLinks.test.ts tests/components/TaskTable.test.tsx tests/components/ProjectMilestoneModalAndTable.test.tsx
cargo check --manifest-path src-tauri/Cargo.toml
```
Ensure no unrelated test suites are executed.
</verification>

<success_criteria>
- Local folder links attached to tasks and projects trigger opening in system file explorer when clicked in desktop app, and copy path with notification in browser.
- Users can browse local machine for folders/files directly from TaskDrawer and ProjectModal link forms.
- Manual link pasting remains fully supported and validated.
- All targeted tests pass.
</success_criteria>

<output>
Create `.planning/quick/261002-vqg-open-local-folder-link-in-file-explorer-/261002-vqg-SUMMARY.md` when execution completes.
</output>
