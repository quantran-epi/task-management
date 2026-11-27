---
phase: quick
plan: 261127-nai
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/ai/StandaloneSshFileBrowser.tsx
  - tests/phase51/standaloneAttachmentPersistence.test.tsx
autonomous: true
requirements:
  - SSH-PICKER-SINGLE-PANEL
user_setup: []
estimate:
  tokens: 24000
  raw_tokens: 15000
  tasks: 2
  confidence: med
must_haves:
  truths:
    - "Modal 'Duyệt tệp SSH' chỉ có một panel: breadcrumb + Up + search + danh sách tệp/thư mục; không còn cây explorer bên trái"
    - "Folder row trong panel phải vẫn click để navigate; breadcrumb và nút Up vẫn chặn vượt quá basePath"
    - "Checkbox chỉ trên file row; search find -iname giữ cap 201 và cancel bằng callId; onAttach(paths) gọi một lần và không đọc nội dung tệp"
    - "State lỗi / rỗng / đang search có CTA và giữ nguyên selection đã chọn"
    - "Không còn import Tree, state folderChildren hay hostLabel; không dependency/CSS/service mới"
    - "UI không hiển thị host, username, token hay bất kỳ secret nào"
  artifacts:
    - path: src/components/ai/StandaloneSshFileBrowser.tsx
      provides: "Single-panel SSH picker — bỏ cột tree, giữ navigation/search/selection nguyên vẹn"
      contains: "StandaloneSshFileBrowser"
    - path: tests/phase51/standaloneAttachmentPersistence.test.tsx
      provides: "Regression assertions: không render tree, navigation vẫn ở panel phải"
      contains: "không render cây explorer"
  key_links:
    - from: src/components/ai/ChatInputBar.tsx#StandaloneSshFileBrowser
      to: src/components/ai/StandaloneSshFileBrowser.tsx#onAttach
      via: "props open/onClose/onAttach/db giữ nguyên; chỉ đổi presentation"
      pattern: "onAttach\\(paths\\)"
    - from: src/components/ai/StandaloneSshFileBrowser.tsx#loadDir
      to: src/components/ai/StandaloneSshFileBrowser.tsx#currentPath
      via: "Folder row / breadcrumb / Up trong panel phải đều gọi navigate→loadDir; basePath vẫn là giới hạn"
      pattern: "listRemoteDir"
---

<objective>
Bỏ cột explorer cây bên trái của `StandaloneSshFileBrowser`, giữ lại đúng panel duyệt thư mục bên phải (breadcrumb, Up, search, danh sách tệp/thư mục, footer chip). Modal chọn tệp SSH trong standalone chat vì thế có một cột duy nhất, navigation vẫn đầy đủ qua folder row và breadcrumb.

Purpose: Cây trái chỉ là bản đồ folder trùng với điều panel phải đã làm (click folder row, breadcrumb, Up). Bỏ nó giảm giao diện và state thừa mà không mất khả năng navigate — đúng hướng picker flat của skill `sketch-findings-task-management`. Chỉ đổi presentation; mọi hợp đồng `onAttach(paths)`, search `find -iname` có huỷ, và cam kết không đọc nội dung tệp giữ nguyên.

Output: Component single-panel, test regression cập nhật, không dependency/style/service mới.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/STATE.md
@.planning/quick/261127-jvm-implement-sketch-015-winner-a-v-o-standa/261127-jvm-SUMMARY.md

Hiện trạng `src/components/ai/StandaloneSshFileBrowser.tsx` (đã đọc một lần lúc lập plan; executor đọc lại một lần rồi sửa ngay):
- `Modal width=1080`; body là grid `228px minmax(0, 1fr)`: cột trái label "Explorer · SSH" + `Tree` (`explorerTree` xây từ `folderChildren` + `hostLabel`), cột phải breadcrumb/Up/search/alert/list + footer chip.
- `hostLabel` state chỉ dùng làm title node gốc của `explorerTree`; `folderChildren` state chỉ dùng để xây `explorerTree` (set trong `loadDir`). Cả hai thành state thừa khi bỏ cây.
- Panel phải đã tự đủ navigation: folder row `data-file-path` click → `loadDir(entry.path)`; Breadcrumb item click → `navigate(prefix)`; Button `aria-label="Thư mục cha"` disable tại `basePath`/`/`. Search `runSearch` dùng `find ${shellQuote(basePath)} -type f -iname ${shellQuote(needle)} | head -n 201` + `callIdRef`/`cancelRemoteCall`.
- `tests/phase51/standaloneAttachmentPersistence.test.tsx` có 7 test, selectors dùng `getByText("folder/")`, `[data-file-path="/repo/folder"]`, `getAllByRole("checkbox")`, `getByLabelText("Thư mục cha")` — KHÔNG có selector `.ant-tree`. `e2e/aiChatSettings.spec.ts` flow RFX đã dùng file row từ quick 261127-jvm, không cần đổi.
- UI wrapper của dự án là `src/components/ui` (`../ui` từ component này); import trực tiếp từ `antd` bị cấm. Token lấy từ `useAntdToken()`.
- Memory project: KHÔNG chạy `npm test` full (>1 giờ); chỉ chạy file Vitest scoped. Mọi trao đổi tiếng Việt.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Bỏ cột tree, chuyển picker thành single-panel</name>
  <files>src/components/ai/StandaloneSshFileBrowser.tsx</files>
  <action>
    Chỉ sửa file này. Không đổi props, service, type hay file khác; không thêm màu, file CSS hay dependency.

    1. Xóa `Tree` khỏi danh sách import từ `../ui`. Giữ mọi import/còn lại (đặc biệt `Breadcrumb`, `Checkbox`, `Empty`, `Input`, `Spin`, `Tag`, icons).
    2. Xóa state `hostLabel` và lời gọi `setHostLabel(...)` trong bootstrap effect. Vẫn giữ `const sshConfig = await getSshConfigById(cfg.sshConfigId, db)` cùng kiểm tra `if (!sshConfig) throw new Error(...)` để validate cấu hình — đừng xóa bước validate.
    3. Xóa state `folderChildren` và toàn bộ khối `setFolderChildren((previous) => ...)` trong `loadDir`. Không còn cây để lưu ancestor; `entries` vẫn set như cũ.
    4. Xóa hoàn toàn `explorerTree` useMemo (khối định nghĩa `FolderNode`/`buildNode` và `return [buildNode(basePath, hostLabel, ...)]`).
    5. Xóa div cột trái (label "Explorer · SSH" + `<Tree ... />`) và wrapper grid `gridTemplateColumns: '228px minmax(0, 1fr)'`. Render trực tiếp nội dung cột phải hiện tại thành một panel đơn full-width trong flex column của Modal. Giữ nguyên mọi thành phần của cột phải: Breadcrumb, Button `aria-label="Thư mục cha"` (disabled tại basePath/root), Input `aria-label="Tìm tên tệp SSH"`, Button "Tìm"/"Hủy", meta text `n kết quả (tối đa 201)`, Alert lỗi với CTA "Thử lại"/"Sửa connection SSH", vùng listheight 360 với folder row (click navigate, không checkbox) và file row (checkbox + `data-file-path`), Empty "Về thư mục gốc", Spin khi search/load, và Space footer chip.
    6. Giữ nguyên contract: `onAttach(paths)` + `onClose()` trong `onOk` một lần; `paths = [...selected]` từ `Set<string>`; `normalizePath`; seq guard `loadSeqRef` trong `loadDir`; `cancelRemoteCall` theo `callIdRef` khi search/navigate/close; `destroyOnClose`. Không đụng `head -n 201`, không đọc nội dung tệp.
  </action>
  <verify>
    <automated>npx vitest run tests/phase51/standaloneAttachmentPersistence.test.tsx --bail=1</automated>
  </verify>
  <done>Modal còn đúng một panel; không còn `Tree`, `folderChildren`, `hostLabel` hay grid hai cột; folder row/breadcrumb/Up vẫn navigate giới hạn bởi basePath; search, selection chips và onAttach không đổi.</done>
</task>

<task type="auto">
  <name>Task 2: Regression test — không render tree, navigation vẫn ở panel phải</name>
  <files>tests/phase51/standaloneAttachmentPersistence.test.tsx</files>
  <action>
    Chỉ sửa file test này, không đụng mock hay service.

    1. Đổi tên test "explorer giữ thư mục cha và không cho Up vượt quá basePath" thành tên phản ánh navigation trong panel phải (ví dụ "panel giữ thư mục cha và không cho Up vượt quá basePath") và bỏ comment "vẫn là node trong explorer" ở assertion `getByText("folder/")` — assertion vẫn giữ nguyên, vì folder row trong list render `${entry.name}/`.
    2. Thêm một test regression: render `<StandaloneSshFileBrowser open onClose={vi.fn()} onAttach={vi.fn()} />`, đợi modal "Duyệt tệp SSH" hiện; assert `document.querySelector(".ant-tree")` là null, `screen.queryByText("Explorer · SSH")` không có trong document, và `[data-file-path="/repo/folder"]` vẫn tồn tại. Click folder row đó và assert `ssh.listRemoteDir` được gọi với `"/repo/folder"` — chứng minh navigation chuyển hẳn sang panel phải, không mất khả năng duyệt.
    3. Giữ nguyên 6 test còn lại, đặc biệt test multi-select (2 checkbox) và test bỏ qua response `listRemoteDir` cũ — không nới lỏng assertion nào.
  </action>
  <verify>
    <automated>npx vitest run tests/phase51/standaloneAttachmentPersistence.test.tsx --bail=1 && npx tsc --noEmit --pretty false && git diff --check</automated>
  </verify>
  <done>8/8 test scoped pass; test mới chứng minh không còn `.ant-tree`/nhãn explorer nhưng folder row vẫn navigate; tsc và git diff --check sạch.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| UI → sshService | Tên tệp/thư mục và chuỗi lỗi từ SSH remote được render trong panel đơn |
| Dexie settings → UI | `sshConfigId`/`defaultBasePath` đọc từ chat-window DB, chỉ dùng để tạo đường dẫn duyệt |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-NAI-01 | Information disclosure | StandaloneSshFileBrowser | low | mitigate | Việc bỏ cột tree cũng bỏ luôn hiển thị host label; không thêm host, username hay token vào panel đơn. |
| T-NAI-02 | Tampering | StandaloneSshFileBrowser#entriesToShow | low | mitigate | Tên tệp từ remote vẫn là React text child sau `normalizePath`; không thêm `dangerouslySetInnerHTML` hay nội suy shell mới. |
| T-NAI-03 | Information disclosure | StandaloneSshFileBrowser#configError | medium | accept | Đường hiển thị lỗi giữ nguyên 100%; scope này không đụng service hay sanitize, không tạo bề mặt secret mới. |
| T-NAI-SC | Tampering | package installs | low | accept | Plan không cài package nào, không cần legitimacy gate. |

</threat_model>

<verification>
- `npx vitest run tests/phase51/standaloneAttachmentPersistence.test.tsx --bail=1` — file scoped, 8/8 pass. KHÔNG chạy `npm test` full (quy tắc dự án).
- `npx tsc --noEmit --pretty false` — clean.
- `git diff --check` — clean.
- Kiểm tra tay (không chặn): mở standalone chat → "Duyệt tệp SSH từ xa" → modal chỉ có một cột; click folder row → vào thư mục; breadcrumb/Up quay lại; search và đính kèm vẫn dùng được.
</verification>

<success_criteria>
- Modal picker có đúng một panel; `Tree`, `folderChildren`, `hostLabel`, `.ant-tree` và nhãn "Explorer · SSH" không còn trong component lẫn DOM.
- Navigation bằng folder row, breadcrumb và Up vẫn hoạt động và vẫn bị chặn vượt quá `basePath`.
- Checkbox chỉ trên file row; chip footer, `onAttach(paths)` một lần, search cap 201/cancel, seq guard và cam kết không đọc nội dung tệp đều giữ nguyên, có test scoped bảo vệ.
- `npx vitest run tests/phase51/standaloneAttachmentPersistence.test.tsx --bail=1`, `npx tsc --noEmit --pretty false`, `git diff --check` đều sạch.
- Không secret/credential nào hiển thị qua UI; không dependency hay file style mới.
</success_criteria>

<output>
Create `.planning/quick/261127-nai-standalone-ai-chat-remove-left-panel-tre/261127-nai-SUMMARY.md` when done.
</output>
