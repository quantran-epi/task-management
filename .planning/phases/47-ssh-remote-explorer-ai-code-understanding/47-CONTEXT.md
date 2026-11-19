# Phase 47: SSH Remote Explorer Search & AI Code Understanding - Context

**Gathered:** 2026-11-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Một phase UI+AI dành riêng cho SSH Remote Explorer đang có. Người dùng có thể tìm file/folder theo tên và tìm nội dung kiểu ripgrep trong đúng SSH config + repoPath + branch đang mở. Khi mở file remote dưới dạng readonly tab, người dùng bôi đen đoạn text bất kỳ đểExplain/Ask inline trong popover cạnh đoạn chọn, hoặc mở tiếp trong AI ChatDrawer.

AI ChatDrawer được mở rộng bằng một **remote context type** mới theo target đang active, không tạo chat panel mới và không khóa context vào từng file. Remote context đại diện cho SSH config/repo/branch/folder hiện tại, có thể chứa nhiều file mention/selection, để người dùng hỏi về logic và luồng code liên file. Chat có thể dùng lại các tool read-only hiện có (`git_read`, SSH FS tools) với explicit remote target và path confinement.

Out of scope: sửa file remote, chạy lệnh ghi, search toàn remote path làm mặc định, headless `explore_repo`, thay thế AI ChatDrawer bằng panel mới, đụng phase 45/46 đang chạy song song.

</domain>

<decisions>
## Implementation Decisions

### Phase isolation
- **D-01:** Đánh số work này là Phase 47 và tạo artifact riêng trong worktree này. Không sửa `ROADMAP.md` hoặc `STATE.md` chung trong lượt này vì hai session khác đang chạy phase 45 và 46. — **Reversibility:** reversible — chỉ là tách artifact planning, không có migration hay contract nào phụ thuộc.

### Explorer search
- **D-02:** Search mặc định chạy trong target đang mở: SSH config + `repoPath` + branch đang chọn. — **Reversibility:** reversible — scope selector có thể thêm sau.
- **D-03:** Search gồm hai chế độ: tên file/folder và nội dung kiểu ripgrep. Cả hai phải trả kết quả có đường dẫn tương đối và click để mở đúng remote file tab hiện tại. — **Reversibility:** costly — thêm chế độ thứ ba hoặc đổi contract kết quả sẽ chạm UI và service.
- **D-04:** Kết quả search content phải hiển thị `path:line:text`, có bound về số hit và hỗ trợ mở file tại dòng đó. — **Reversibility:** costly — viewer cần nhận initial line/highlight contract.

### AI chat context
- **D-05:** Không tạo remote AI side panel mới. Dùng lại `AIChatDrawer`, hệ thống context switch, chat tabs/threads và composer hiện có. — **Reversibility:** costly — thay thế bằng panel mới sẽ nhân bản tab/thread/tool-event plumbing.
- **D-06:** Thêm một `ChatScopeType` mới cho remote target. Scope key là target-based, không phải file-based: một entry đại diện cho SSH config/repo/branch/folder hiện tại. — **Reversibility:** costly — chạm type unions, Dexie/BDexie schema/backup validation và mọi nơi whitelist scope.
- **D-07:** Remote context là folder/repo-scoped và có thể chứa nhiều file mention/selection. Câu hỏi không bị giới hạn vào file đang mở; AI có thể trace luồng code qua nhiều file trong target. — **Reversibility:** costly — nếu thu hẹp về per-file sau này sẽ mất khả năng hỏi liên file.
- **D-08:** Khi mở file remote hoặc bôi text trong file, remote context của target đó tự động trở thành active scope trong AI ChatDrawer. User vẫn có thể switch sang context khác bằng scope picker. — **Reversibility:** reversible — policy tự động chọn scope có thể đổi mà không đổi schema.

### Inline AI on file viewer
- **D-09:** File remote vẫn readonly. Selection trong code viewer bật toolbar tại chỗ với ít nhất `Explain`, `Ask`, `Open in Chat`. — **Reversibility:** reversible — label/button set có thể chỉnh mà không đổi mô hình dữ liệu.
- **D-10:** `Explain`/`Ask` trả lời ngắn trong popover cạnh đoạn chọn. `Open in Chat` đưa selection mention vào composer của remote context. — **Reversibility:** reversible — thay đổi hiển thị answer không ảnh hưởng lưu trữ.
- **D-11:** Selection mention là context anchor có cấu trúc: target identity, relative file path, start/end line, selected text. Không gửi đoạn text rời không có path/line. — **Reversibility:** costly — nhiều prompt/tool/citation path sẽ phụ thuộc shape này.
- **D-12:** Câu trả lời có thể trích dẫn `path:line`; click citation mở file remote và highlight/scroll tới dòng tương ứng. — **Reversibility:** costly — cần contract giữa chat render và remote file tab.

### Read-only remote tools
- **D-13:** AI dùng lại `git_read` và SSH FS tools hiện có, mở rộng để nhận explicit remote target từ chat context thay vì chỉ dùng config toàn cục. — **Reversibility:** costly — đổi tool schema là đổi contract với model.
- **D-14:** Mọi tool call vẫn read-only, có path confinement trong target/repo, escape argument đúng chuẩn hiện có, và trả kết quả bounded. Không thêm shell write, redirect, patch hoặc arbitrary command. — **Reversibility:** one-way — nếu nới tool thành write sẽ thay đổi mô hình an toàn và không thể thu hồi trust boundary dễ dàng.
- **D-15:** `headless explore_repo` không nằm trong phase này. Ghi nhận là deferred idea. — **Reversibility:** reversible — thêm tool mới sau này không phá contract hiện tại.

### Claude's Discretion
- Implementation details for exact scope type string, scope key encoding, tool argument names, search debounce/regex semantics, result caps, popover sizing, prompt wording, and whether the inline popover itself performs a single read-only tool call are planner/researcher discretion, provided the locked decisions above are preserved.
- Exact Ant Design layout, keyboard shortcuts, and whether search has one input with modes or two tabs are discretionary.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap and prior phase decisions
- `.planning/ROADMAP.md` — Phase 29.1, 42, 43 and current active phases; do not edit shared roadmap in this session.
- `.planning/phases/29.1-remote-ssh-git-explorer/29.1-RESEARCH.md` — original remote explorer architecture and read-only constraints.
- `.planning/phases/29.1-remote-ssh-git-explorer/29.1-VERIFICATION.md` — existing remote explorer verification baseline.
- `.planning/phases/42-read-only-git-inspection-for-the-reviewer-agent/42-CONTEXT.md` — locked read-only git tool decisions, repo resolution and command escape invariants.
- `.planning/phases/43-repo-reading-that-scales-grep-paged-read-and-remote-headless/43-CONTEXT.md` — grep, paged read and remote-reading scale decisions.

### Remote explorer / viewer
- `src/workbench/toolwindows/RemoteGitExplorer.tsx` — current SSH target state, branch/tree loading, directory lazy load and click-to-open tab.
- `src/workbench/editor/RemoteFileViewer.tsx` — current readonly code viewer, 2MB guard and Mermaid extraction.
- `src/workbench/EditorArea.tsx` — editor tab registry and `remote_file` rendering seam.
- `src/workbench/store/layoutStore.ts` — active remote target/branch and tab state; citation-to-tab navigation likely integrates here.
- `src/services/gitRemoteTreeService.ts` — remote tree, uncommitted merge and remote file content.
- `src/services/gitRemoteService.ts` — remote branch/status commands and SSH execution helpers.
- `src/services/sshService.ts` — SSH config/secret access and cancellation.
- `src/types/ssh.ts`, `src/types/gitRemote.ts` — target and tree types.

### AI chat / context switch
- `src/components/ai/AIChatDrawer.tsx` — durable chat tabs, active scope, per-tab runtime/tool events, composer and send path.
- `src/components/ai/ScopePickerModal.tsx` — current scope switch UI; remote target entry must be added here or through the same abstraction.
- `src/context/AIChatContext.tsx` — `ActiveScope`, buildScopeKey, registered/custom scope behavior.
- `src/types/models.ts` — `ChatScopeType`, `ChatThread`, `ChatTab` model/types.
- `src/db/repositories/chatTabRepo.ts` — scope whitelist and thread fallback behavior.
- `src/db/schema.ts` — Dexie indexes and schema versions for chat tabs/threads.
- `src/validation/backupSchemas.ts`, `src/services/backup/validateBackup.ts` — backup validation for chat scope values.
- `src/services/ai/contextGrounding.ts` — serialized context assembly and mention handling.
- `src/components/ai/InlineAISelectionBar.tsx` — existing inline selection popover; reuse or adapt for remote selection anchors.
- `src/utils/selectionContext.ts` — DOM context extraction via `data-ai-context-*`; remote viewer must expose equivalent target metadata.

### AI tools
- `src/services/ai/aiTools.ts` — tool definitions and dispatch table including `ssh_list_dir`, `ssh_read_file_page`, `ssh_grep_files` and `git_read`.
- `src/services/ai/sshFsToolService.ts` — SSH FS execution, path resolution, binary refusal and bounds.
- `src/services/ai/office/teamTools.ts` — team tool context and `git_read` integration patterns.
- `src/types/sshFsTool.ts` — SSH FS tool config/result types.
- `src/services/ai/chatTurnTools.ts` — chat tool allowlist/enablement and dispatch seam.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `RemoteGitExplorer` already holds the active SSH config, repo path and branch in local state synced with `layoutStore`; search should reuse this source of truth instead of inventing another target picker.
- `RemoteFileViewer` already renders numbered readonly code lines and has a stable `data-testid="code-container"`; selection extraction and line mapping can be layered onto this DOM.
- `AIChatDrawer` already has durable per-scope tabs/threads, per-tab runtime status, tool events, abort handling and composer draft carry; remote context should be another scope, not a separate chat engine.
- `InlineAISelectionBar` already implements global selection detection, popup positioning, inline ask and `openChatWithDraft`; adapt it to accept remote anchors.
- `git_read`, `ssh_list_dir`, `ssh_read_file_page`, `ssh_grep_files` already exist with read-only/bounded behavior; extend their target resolution rather than adding a parallel filesystem layer.
- `layoutStore.openTab` already opens remote file tabs with params; search result/citation click can reuse `remote:${path}` tab ids consistently.

### Established Patterns
- Remote explorer is strictly read-only against git branch state; uncommitted files are merged only for display.
- SSH tools use explicit config IDs and path confinement; do not fall back to a different host or local filesystem.
- Chat scope is whitelisted from Dexie type through backup validation; adding a scope type requires updating every whitelist.
- Tool calls are rendered as per-tab tool events with bounded previews and cancellation; keep that channel for remote tools.
- Focused regression tests are required; do not run the full Vitest suite.

### Integration Points
- Search UI → `RemoteGitExplorer` controls and tree replacement/overlay → result click → `openTab` with initial line/highlight params.
- Remote viewer selection → structured anchor → scope activation → `AIChatDrawer` composer/mention and inline popover.
- Remote scope metadata → `contextGrounding` prompt segment → tool target → `git_read`/SSH FS dispatch.
- Tool results with `path:line` citations → chat renderer → viewer tab navigation/highlight.
- Scope type change → `types/models.ts`, `AIChatContext`, `ScopePickerModal`, `chatTabRepo`, Dexie schema/backup validation and focused regression tests.

</code_context>

<specifics>
## Specific Ideas

- User muốn “search file and folder ở explorer” và search nội dung kiểu ripgrep.
- User muốn khi click file, vẫn giữ tab readonly nhưng bôi đen đoạn text bất kỳ thì dùng AI inline như document viewer.
- User muốn “AI chat panel có context là folder, repo remote đó”, mention đoạn text hoặc hỏi inline nhưng chat vẫn nắm context, và AI có thể chạy tool git read/ssh file trên toàn bộ folder.
- Mục đích: “hỏi bất cứ cái gì trực quan về logic code, về luồng code”.
- User clarified: “AI chat drawer đã có sẵn context switch, nên thêm 1 loại context mới cho remote file ssh này… có tính liên kết giữa các file chứ ko chỉ hỏi 1 file, docs inline AI cũng nên vậy.”

</specifics>

<deferred>
## Deferred Ideas

- Headless `explore_repo` as an optional remote AI tool for broad architecture questions — future phase.
- Persistent remote AI workspace context that survives switching away from the active explorer target — future phase.
- Full remote-path search outside the current repo/branch as an explicit scope option — future phase.

</deferred>

---

*Phase: 47-SSH Remote Explorer Search & AI Code Understanding*
*Context gathered: 2026-11-19*
