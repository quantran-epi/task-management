---
phase: quick
plan: 261127-jvm
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/ai/StandaloneSshFileBrowser.tsx
  - tests/phase51/standaloneAttachmentPersistence.test.tsx
  - e2e/aiChatSettings.spec.ts
  - .planning/STATE.md
autonomous: true
requirements:
  - SSH-PICKER-TWO-COLUMN
user_setup: []
estimate:
  tokens: 36000
  raw_tokens: 22000
  tasks: 3
  confidence: medium
must_haves:
  truths:
    - "Modal picker là hai cột: explorer trái (host + folder, click navigate) và vùng phải (breadcrumb + Up + search + danh sách tệp có size/mtime)"
    - "Chọn nhiều tệp bằng checkbox trên mỗi file row; folder row không có checkbox, click để navigate"
    - "Footer gom chip các tệp đã chọn kèm số lượng và nút 'Đính kèm (N)'"
    - "Breadcrumb/Up dẫn path; search find -iname giữ nguyên cap 201 và huỷ bằng callId"
    - "onAttach vẫn nhận một lần mảng path đã normalize; picker không đọc nội dung tệp"
    - "State lỗi / chưa cấu hình / search / rỗng có CTA rõ, giữ nguyên selection đã chọn"
    - "Không dependency mới; Ant Design wrapper có sẵn; props và hành vi gọi từ ChatInputBar giữ nguyên"
  artifacts:
    - path: src/components/ai/StandaloneSshFileBrowser.tsx
      provides: "Two-column SSH picker with explorer tree, breadcrumb+Up, file rows, selection chips"
      contains: "StandaloneSshFileBrowser"
    - path: tests/phase51/standaloneAttachmentPersistence.test.tsx
      provides: "Regression assertions cho multi-select, normalized paths, no content read, folder row"
      contains: "browser multi-select"
    - path: e2e/aiChatSettings.spec.ts
      provides: "RFX flow dùng file row checkbox thay tree checkbox"
      contains: "RFX standalone"
  key_links:
    - from: src/components/ai/ChatInputBar.tsx#StandaloneSshFileBrowser
      to: src/components/ai/StandaloneSshFileBrowser.tsx#onAttach
      via: "props open/onClose/onAttach/db giữ nguyên; chỉ đổi presentation"
      pattern: "onAttach\\(paths\\)"
    - from: src/components/ai/StandaloneSshFileBrowser.tsx#loadDir
      to: src/components/ai/StandaloneSshFileBrowser.tsx#entriesToShow
      via: "RemoteFileInfo.size/modified đi vào file row; searchPaths vẫn normalizePath"
      pattern: "listRemoteDir"
    - from: src/components/ai/StandaloneSshFileBrowser.tsx#runSearch
      to: src/components/ai/StandaloneSshFileBrowser.tsx#callIdRef
      via: "find -iname ... | head -n 201 có cancelRemoteCall theo callId"
      pattern: "head -n 201"
---

<objective>
Implement winner A của sketch 015 vào `StandaloneSshFileBrowser.tsx`: chuẩn hoá modal chọn tệp SSH theo folder-picker của VS Code Remote Explorer — explorer cây host/thư mục bên trái, breadcrumb + Up + search + danh sách tệp có size/mtime bên phải, checkbox multi-select, footer gom chip đã chọn. Giữ nguyên hợp đồng props/hành vi `onAttach(paths)`, search `find -iname` có huỷ, và cam kết không đọc nội dung tệp lúc attach.

Purpose: consistency với Remote Explorer quan trọng hơn preview hay filter (quyết định sketch 015). Chỉ đổi presentation/navigation; mọi logic config bootstrap, path normalize, cancel search, validate ở `sshFsToolService` giữ nguyên.

Output: component hai cột, test unit/e2e cập nhật selector, STATE.md ghi nhận quick task. Không thêm dependency, không đụng service khác.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/STATE.md
@.planning/sketches/015-ssh-file-picker/README.md
@.planning/sketches/015-ssh-file-picker/index.html (tham chiếu trực quan — winner A)

Hiện trạng `src/components/ai/StandaloneSshFileBrowser.tsx` (đọc một lần, không re-read):
- Props: `open`, `onClose`, `onAttach(paths: string[])`, `db?`; `BrowseEntry` chỉ có `{path, name, isDir}`.
- Config bootstrap `:83-112`: `getSshFsToolConfig` → `getSshConfigById` → `resolveRemoteToolPath(".", cfg.defaultBasePath, ...)`; `sshConfigIdRef` khai báo ở `:114`.
- `loadDir` `:116-151`: `listRemoteDir` trả `RemoteFileInfo[]`; map sang `BrowseEntry`, bỏ entry `.` ở gốc.
- `runSearch` `:153-195`: `find ${shellQuote(basePath)} -type f -iname ${shellQuote(needle)} | head -n 201`, huỷ bằng `callIdRef`/`cancelRemoteCall`, filter `finishReason`/`exitStatus`, normalize từng dòng.
- UI `:210-320`: `Modal width=640`, error `Alert`, search `Input` + 2 `Button`, path text, `Tree checkable selectable={false}`.

Dữ liệu có sẵn: `RemoteFileInfo {name, path, isDir, isSymlink, size, modified, permissions}` (`src/types/ssh.ts`), `listRemoteDir` (`src/services/sshService.ts`). Uuid/path/validation ở `sshFsToolService.ts` không đụng.

UI barrel `src/components/ui/index.ts` đã export `Breadcrumb`, `Checkbox`, `List`, `Tag`, `Empty`, `Button`, `Input`, `Modal`, `Tree`, `useAntdToken`. Dùng wrapper này, import trực tiếp từ `antd` bị cấm theo pattern project.

Skill `sketch-findings-task-management` (đã đọc SKILL.md + `references/states-pickers.md`): state matrix inline progress/error/empty có CTA; picker flat searchable thay `Tree defaultExpandAll` cho danh sách lớn. Ở đây winner A giữ `Tree` cho explorer trái (chỉ host/folder, không expand-all), còn danh sách tệp bên phải là flat row — không cherry-pick filter chips hay preview tray của variant B/C.

Ràng buộc test: `tests/phase51/standaloneAttachmentPersistence.test.tsx` hiện dùng `.ant-tree-checkbox` và `folder/`; `e2e/aiChatSettings.spec.ts` RFX flow (dòng ~435-443) dùng `.ant-tree-treenode` + `.ant-tree-checkbox`. Memory project: KHÔNG chạy `npm test` full suite (>1 giờ); chỉ chạy file scoped. Mọi thảo luận bằng tiếng Việt.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Đổi StandaloneSshFileBrowser sang layout hai cột winner A</name>
  <files>src/components/ai/StandaloneSshFileBrowser.tsx</files>
  <action>
    Chỉ sửa file này. Giữ nguyên props/public contract, `normalizePath`, config bootstrap, `sshConfigIdRef`, `loadDir`, `runSearch`, `entriesToShow`, cancel-on-close, `onAttach(paths)` + `onClose()` trong `onOk`, `destroyOnClose`. Không đụng service hay type ngoài.

    1. Mở rộng `BrowseEntry` thành `{path, name, isDir, size?: string, modified?: string, hitDir?: string}`; `loadDir` copy `size`/`modified` từ `RemoteFileInfo` (formatter gọn: byte → KB/MB, `modified` giữ nguyên chuỗi nếu có, thiếu thì "—"). Với search path, `entriesToShow` vẫn tạo entry `isDir:false` từ path normalize; không gán size/modified giả (dùng "—"), có thể gắn `hitDir` = thư mục chứa path để rows không bị vô nghĩa khi search toàn cây. Không tự bịa field không có trong `RemoteFileInfo`.

    2. Thêm state UI cục bộ:
       - `explorerTree`: mảng node `{key: path, title: name, children?}` xây từ `entries` (chỉ folder) dưới một node host duy nhất lấy từ `sshConfigIdRef` + config name (`getSshConfigById` đã có trong bootstrap; lưu `hostLabel` state), root key = `basePath`. Không fetch thêm SSH, không expand-all: `defaultExpandKeys={[basePath]}` (hoặc `expandedKeys` do state kiểm soát) và `Tree` chỉ để navigate, `checkable={false}`.
       - `selectedPaths: string[]` thay thế `Set` ở level render nhưng vẫn dùng `Set<string>` làm nguồn sự thật (`paths = [...selected]` như hiện tại). Click checkbox/file row → toggle path vào Set; click folder row/tree node → `loadDir(path)`, xoá `query`/`searchPaths` như `treeClick` trong sketch. Chips footer remove → xoá path khỏi Set.

    3. Layout `Modal width="min(1080px, calc(100vw - 48px))"` (AntD `width` nhận string; nếu wrapper không nhận, dùng số 1080 kèm `style={{maxWidth:'calc(100vw - 48px)'}}`). Bên trong: flex column, `body` grid `gridTemplateColumns: '228px minmax(0,1fr)'`, chiều cao vùng danh sách cố định ~360px overflow auto. Dùng style inline với token `token.colorBorderSecondary`, `token.colorBgLayout`, `token.colorPrimary` — không CSS file mới, không màu mới. Game title giữ "Duyệt tệp SSH" (test/e2e tìm tên này).

    4. Cột trái: label "Explorer · SSH", `Tree` với node host + folder, `onSelect`/click title gọi `loadDir(node.key)`, highlight node đang là `currentPath`. Không checkbox trên tree. Khi `configError`/chưa config, cây rỗng nhưng footer/chips vẫn render.

    5. Cột phải toolbar:
       - `Breadcrumb` từ `basePath` (host label) + các segment của `currentPath`; mỗi item clickable → `loadDir(prefix)`; kèm `Button` icon `ArrowUpOutlined` (`aria-label="Thư mục cha"`, disabled khi `currentPath === '/'`) → `loadDir` path bỏ segment cuối. Search đang chạy thì breadcrumb vẫn hiện `currentPath` gốc, không bị searchPaths ghi đè.
       - `Input aria-label="Tìm tên tệp SSH"` giữ nguyên placeholder/role; `Button "Tìm"` giữ nguyên name; search vẫn chạy bằng Enter hoặc click; thêm `Button` huỷ (`aria-label="Hủy tìm kiếm"`) hiện khi `callIdRef.current`/loading search — gọi `cancelRemoteCall` + reset `searchPaths`/`query` + set loading false. Không đổi lệnh `find ... | head -n 201`.
       - Meta text: `searchPaths !== null ? `${n} kết quả (tối đa 200)` : currentPath`.

    6. Danh sách tệp: file row dạng grid `checkbox 22px | tên (minmax 0, 1fr) | size 76px | modified 96px`. Dùng `Checkbox` wrapper với `checked` lấy từ `selected`, `onChange` toggle; click row (ngoài checkbox) cũng toggle file. Folder row: không checkbox, icon folder, click navigate. Dùng `aria-label` tiếng Việt cho checkbox (`Chọn ${name}`) và `data-file-path={entry.path}` để e2e/test chọn row ổn định. Dùng `List` hoặc `<div>` plain có class `.ant-list-*`? Chọn `<div>` + role none nếu `List` wrapper gây layout cứng; ưu tiên `List` wrapper nếu không cần custom grid. Không render nội dung tệp, không preview.

    7. State panel thay cho danh sách khi cần (theo sketch + skill):
       - `configError` (gồm lỗi list/search): `Alert type="error" showIcon` + nút "Thử lại" (`loadDir(basePath)` hoặc config bootstrap lại) và "Sửa connection SSH" (CTA mở lại settings; nếu không có prop callback từ `ChatInputBar`, dùng `Button` links tới hash `#/settings` trong Tauri window — KHÔNG đổi props). Selection/chips ở footer vẫn giữ.
       - search đang chạy: `Spin` + dòng `find ${basePath} -iname ...` + nút "Hủy"; danh sách tạm thay bằng panel này, chọn tệp đã check vẫn giữ.
       - folder rỗng / search zero hit: `Empty` + CTA "Về thư mục gốc" (`loadDir(basePath)`).
       Chỉ đổi presentation của các state; không đổi error message gốc do service trả.

    8. Footer: `Space` chứa Text "N tệp đã chọn" / "Chưa chọn tệp nào", các `Tag closable` (name, `onClose` remove path), và actions "Đóng" / `okText="Đính kèm (N)"` như hiện tại. `okButtonProps.disabled` khi `paths.length === 0`. Giữ thứ tự path trong `paths` theo insertion order của Set để test `["/repo/a.pdf","/repo/b.pdf"]` vẫn đúng.

    Ranh giới: không thêm `react-router`, không thêm dependency, không đổi `ChatInputBar.tsx`, không đổi services/types, không đụng file untracked khác trong git status.
  </action>
  <verify>
    <automated>npx vitest run tests/phase51/standaloneAttachmentPersistence.test.tsx --bail=1</automated>
  </verify>
  <done>Modal có explorer trái + breadcrumb/Up/search + file row checkbox/size/mtime + footer chip; folder row không checkbox; multi-select path normalize; search cap/cancel giữ nguyên; state error/empty/search có CTA và không xoá selection; không đọc nội dung tệp; test scoped xanh.</done>
</task>

<task type="auto">
  <name>Task 2: Cập nhật selector test cho file row thay tree checkbox</name>
  <files>tests/phase51/standaloneAttachmentPersistence.test.tsx,e2e/aiChatSettings.spec.ts</files>
  <action>
    Chỉ đổi assertion/selector, không đổi mock hay contract được test.

    Trong `tests/phase51/standaloneAttachmentPersistence.test.tsx`:
    - Test "browser multi-select trả path chuẩn hoá một lần; attach không đọc nội dung": thay `document.body.querySelectorAll('.ant-tree-checkbox')` bằng `screen.getAllByRole('checkbox')` (hoặc `getAllByLabelText(/^Chọn /)`) trong dialog; giữ nguyên expectations `onAttach` một lần với `["/repo/a.pdf", "/repo/b.pdf"]` và `readRemoteFileBytes`/`readRemoteFileSlice` không được gọi. Cập nhật comment "tree checkboxes" thành "file row checkboxes".
    - Test "browser không cho Check thư mục": thay `screen.getByText('folder/')` bằng row folder mới (`screen.getByText('folder')` trong vùng danh sách hoặc `[data-file-path="/repo/folder"]`), khẳng định row đó không có `input[type=checkbox]` / `.ant-checkbox-wrapper`, và click row folder gọi `listRemoteDir` với path mới (nếu tiện) thay vì assert `.ant-tree-treenode`. Không đổi các test khác trong file.

    Trong `e2e/aiChatSettings.spec.ts` (RFX standalone, ~dòng 435-443): thay `browser.locator('.ant-tree-treenode').filter({hasText:'plan.docx'})` + `.ant-tree-checkbox` bằng `browser.locator('[data-file-path="/srv/taskmate-fixture/reports/plan.docx"]')` rồi click checkbox trong row (`getByRole('checkbox')` hoặc `.ant-checkbox-input`). Giữ nguyên `getByRole('button', {name:/Đính kèm \(1\)/})` và các assertion tool family sau đó. Không sửa phần cấu hình SSH/model/theme hay RFX dock/team trong file này.
  </action>
  <verify>
    <automated>npx vitest run tests/phase51/standaloneAttachmentPersistence.test.tsx --bail=1 && npx tsc --noEmit --pretty false</automated>
  </verify>
  <done>Unit test xanh với selector mới; e2e RFX dùng file row checkbox nhưng vẫnverify multi-attach + info/search/read + reload chip; `tsc --noEmit` sạch; không mock nào bị nới lỏng.</done>
</task>

<task type="auto">
  <name>Task 3: Ghi nhận quick task và đóng planning artifacts</name>
  <files>.planning/STATE.md</files>
  <action>
    Thêm một dòng `261127-jvm` vào bảng "Quick Tasks Completed" trong `.planning/STATE.md` với description ngắn gọn việc implement winner A, ngày 2026-11-27, commit để trống/pending theo convention của bảng. Thêm một decision line ngắn: explorer trái + file list phải + footer chip là chuẩn picker, giữ `onAttach(paths)`/search cancellable/không đọc nội dung. Ghi SUMMARY.md mới trong thư mục quick task này theo template GSD nếu workflow yêu cầu. Không đụng phần còn lại của STATE.md, không đụng `.gsd/dispatch-isolation-sentinel.json` hay các file untracked đã có.
  </action>
  <verify>
    <automated>git diff --check && git status --short</automated>
  </verify>
  <done>Diff chỉ gồm 4 file đã khai báo + SUMMARY.md mới; STATE.md có dòng quick task decision; `git diff --check` sạch.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| SSH config (Dexie) → picker bootstrap | Config lỗi/thiếu phải dừng có CTA, không gọi SSH với config lạ |
| Remote directory listing → `BrowseEntry` | `name/path/size/modified` từ remote là untrusted text; React escape mặc định, `aria-label` không inject, không dùng `dangerouslySetInnerHTML` |
| Search input → `find -iname` | `needle` vẫn qua `shellQuote`; cap 201 + callId cancel giữ nguyên để không mở rộng bề mặt command injection hay DoS |
| Attachment → `onAttach(paths)` | Picker trả identity path; validation nằm ở `sshFsToolService`, không đọc nội dung ở đây |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-JVM-01 | Injection | `runSearch` command | high | mitigate | Giữ nguyên `shellQuote(basePath)`/`shellQuote(needle)` và `head -n 201`; input user không nối trực tiếp vào shell |
| T-JVM-02 | Tampering | `selected` Set / chip remove | medium | mitigate | Mọi toggle/remove đi qua một Set duy nhất, path normalize trước khi vào Set; footer render từ Set đó |
| T-JVM-03 | Information disclosure | file row metadata | medium | mitigate | Chỉ hiển thị size/modified có trong `RemoteFileInfo`; không đọc file, không preview, không gửi nội dung ra ngoài |
| T-JVM-04 | Denial of service | Remote tree/search | medium | mitigate | `find` cap 201 + cancelRemoteCall; explorer chỉ chứa folder trong currentPath, không fetch recursive |
| T-JVM-05 | Spoofing | tree path from remote | low | mitigate | `normalizePath` giữ nguyên; click folder luôn đi `loadDir` (re-validate qua config), không tin path lạ từ row |

</threat_model>

<verification>
Chạy đúng các lệnh scoped sau (KHÔNG chạy `npm test` full suite):

1. `npx vitest run tests/phase51/standaloneAttachmentPersistence.test.tsx --bail=1`
2. `npx tsc --noEmit --pretty false`
3. `git diff --check`

E2E `npx playwright test e2e/aiChatSettings.spec.ts -g "RFX standalone"` chỉ chạy khi có fixture Tauri/SSH sẵn; nếu môi trường không có, ghi rõ là UAT thủ công/checkpoint thay vì giả vờ xanh. Không chạy build/PWA/GitHub Pages (theo CLAUDE.md: out of scope).
</verification>

<success_criteria>
- Winner A render đúng hai cột: explorer host/folder trái, breadcrumb + Up + search + file row (checkbox + name + size + modified) phải, footer chips + "Đính kèm (N)".
- Folder row không có checkbox; click folder/tree navigate; breadcrumb/Up navigate; selection tồn tại qua navigate/search/error/empty.
- `find -iname ... | head -n 201`, `callId` cancel, normalizePath, error message, `onAttach(paths)` và không đọc nội dung giữ nguyên — chứng minh bằng unit test scoped.
- Không dependency mới, không CSS file mới, không sửa services/type/ChatInputBar; tsc + git diff --check sạch.
- E2E RFX selector mới hoặc UAT thủ công được ghi nhận rõ; STATE.md + SUMMARY.md cập nhật.
</success_criteria>

<output>
Khi xong ghi `.planning/quick/261127-jvm-implement-sketch-015-winner-a-v-o-standa/261127-jvm-SUMMARY.md` theo template GSD, cập nhật `.planning/STATE.md` (dòng quick task + decision line). Không tạo file docs khác ngoài SUMMARY.md. Không commit nếu sếp chưa yêu cầu.
</output>
