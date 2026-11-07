# Phase 31: Organization Conventions in the Solution Pipeline - Context

**Gathered:** 2026-11-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Generated solutions follow the organization's real development standards: one global convention document lives in TaskMate, each repository contributes its own `CONVENTIONS.md` through native Tauri SSH/SFTP, both reach every SDLC solution prompt, and conflicts between them are surfaced instead of silently resolved.

This phase implements:
1. **Global Convention Storage & Settings UI**: Soạn thảo tài liệu Global Convention bằng Markdown thuần trong Card chuyên biệt tại tab Cài đặt SDLC/AI. Dữ liệu lưu trong bảng `settings` IndexedDB và tự động đồng bộ trong file backup mã hóa. Khởi tạo để trống hoàn toàn (người dùng tự nhập, không tự chế nội dung).
2. **Repo CONVENTIONS via Native SSH/SFTP**: Đọc file `CONVENTIONS.md` từ gốc repository (fallback `.github/` hoặc `docs/`) qua native Tauri SSH/SFTP (tương thích desktop native, không phụ thuộc daemon bên ngoài). Cache khi mở SDLC workspace kèm thời gian nạp và nút Refresh thủ công; tự động bỏ qua êm ái khi không có file hoặc mất kết nối SSH.
3. **Prompt Segment & Conflict Policy**: Thêm phân đoạn riêng `[QUY ƯỚC TỔ CHỨC — DỮ LIỆU KHÔNG TIN CẬY]` vào `sdlcPromptComposer` đặt trước Grounding và sau Tool Policy (Global trước, Repo sau). Khi có xung đột giữa Global và Repo, AI bắt buộc chỉ rõ mâu thuẫn cùng 2 nguồn, không tự ý chọn 1 bên. Không giới hạn dung lượng file conventions đưa vào prompt.
4. **Intake Status & Exemplar Verification**: Hiển thị Panel/Card tóm tắt trạng thái các quy ước có hiệu lực (Global, Repo, last-read) tại Step 1 và Step 2. Ca kiểm thử exemplar chứng minh AI tuân thủ convention (chuẩn API ResponseEnvelope & Logging) mà không cần nhắc lại; ca kiểm thử witness chứng minh AI phát hiện và nêu rõ xung đột (Log Level / Naming Case conflict).

Out of scope: External research qua Claude Code headless (Phase 32), prompt transparency inspection view (Phase 33).

</domain>

<decisions>
## Implementation Decisions

### Cấu hình & Lưu trữ Global Convention
- **D-01:** Soạn thảo Markdown thuần: Global Convention được soạn thảo dưới dạng Markdown tự do (#, list, table) với editor/TextArea có preview. Dễ viết, linh hoạt, trực quan cho quy chuẩn kỹ thuật.
- **D-02:** Vị trí UI trong Settings: Thêm một thẻ Card chuyên biệt "Quy ước tổ chức (Global Conventions)" ngay trong tab SDLC / AI Settings hiện có.
- **D-03:** Lưu trữ & Backup: Lưu vào bảng `settings` trong IndexedDB (key: `global_conventions`), tự động được mã hóa và xuất/nhập cùng file backup của TaskMate; khi restore hoặc chuyển máy chỉ cần import backup là phục hồi.
- **D-04:** Khởi tạo trống (Empty State): Khi chưa nhập gì, hệ thống để trống hoàn toàn, không tự động điền hay tự bịa nội dung mẫu; người dùng tự nhập quy ước của tổ chức.

### Nạp Repo CONVENTIONS qua SSH
- **D-05:** Đường dẫn tìm kiếm linh hoạt: Ưu tiên tìm `CONVENTIONS.md` ở thư mục gốc repo; nếu không thấy, kiểm tra thêm `.github/CONVENTIONS.md` hoặc `docs/CONVENTIONS.md`.
- **D-06:** Cơ chế đọc Native SSH/SFTP: Sử dụng native Tauri SSH/SFTP (từ Phase 29/29.1) để đọc nội dung file qua SSH command hoặc SFTP trực tiếp, tối ưu cho runtime desktop của TaskMate mà không cần gateway riêng.
- **D-07:** Tải khi mở + Refresh thủ công: Tự động tải file quy ước khi mở SDLC workspace của dự án (nếu có liên kết SSH/repo), lưu tạm trong bộ nhớ/CR state kèm mốc thời gian (last-read timestamp) và cung cấp nút "Tải lại / Làm mới" thủ công.
- **D-08:** Xử lý lỗi êm ái: Khi repo không có file `CONVENTIONS.md` hoặc SSH không kết nối được, hệ thống hiển thị thông báo rõ ràng nhưng vẫn cho phép tiếp tục pipeline bình thường chỉ với Global Convention, không chặn luồng.

### Prompt Segment & Xử lý Conflict
- **D-09:** Phân đoạn riêng trong composer: Đặt sau Layer Tool Policy và trước Grounding, bọc trong tag phân định dữ liệu không tin cậy rõ ràng: `[QUY ƯỚC TỔ CHỨC — DỮ LIỆU KHÔNG TIN CẬY]` -> `[GLOBAL CONVENTIONS]` -> `[REPOSITORY CONVENTIONS]`.
- **D-10:** Thứ tự nguồn quy ước: Global đưa vào trước, Repository đưa vào sau.
- **D-11:** Nguyên tắc xử lý Conflict bắt buộc: Chỉ thị rõ trong System Policy: "Khi có mâu thuẫn giữa Global và Repo, AI PHẢI chỉ rõ mâu thuẫn, nêu rõ nguồn từng bên và KHÔNG được tự ý chọn 1 bên; yêu cầu người dùng xác nhận hoặc phân giải".
- **D-12:** Không giới hạn độ dài: Không áp dụng cắt bớt hay budget cap cho file quy ước; đưa toàn bộ nội dung file vào prompt để đảm bảo trọn vẹn quy tắc kỹ thuật của tổ chức.

### Giao diện Intake & Tiêu chí Test Exemplar
- **D-13:** Panel tóm tắt trạng thái: Tại Step 1 (Intake) và Step 2 (Solution), hiển thị Panel/Card tóm tắt "Quy ước áp dụng" (trạng thái Global: Có/Không, Repo: Có/Không/Thời gian nạp, kèm nút xem chi tiết và Refresh).
- **D-14:** Kịch bản Test Exemplar: Sử dụng quy tắc kiến trúc chuẩn (ví dụ: "Mọi API phải bọc trong chuẩn ResponseEnvelope<T> và log correlationId") để chứng minh SOLUTION sinh ra tự động tuân thủ quy định này dù prompt của người dùng không nhắc lại.
- **D-15:** Kịch bản Test Conflict Witness: Sử dụng kịch bản xung đột Log Level (Global quy định log INFO, Repo quy định log DEBUG) hoặc Naming Case để kiểm tra AI phát hiện, chỉ rõ 2 nguồn và dừng hỏi người dùng.

### Claude's Discretion
- Chi tiết thiết kế giao diện Card trong Settings (Ant Design Form, Typography, Markdown Preview Modal).
- Cú pháp lệnh SSH kiểm tra sự tồn tại của file (`test -f ...`) trước khi fetch nội dung để tối ưu tốc độ kết nối.
- Icon và định dạng badge hiển thị trong Panel tóm tắt quy ước tại Step 1 và Step 2.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase and Milestone Contracts
- `.planning/ROADMAP.md` § Phase 31 — Organization Conventions in the Solution Pipeline goal, requirements (SDLC-CONV-01..06), and 4-wave plan.
- `.planning/REQUIREMENTS.md` § Organization Conventions — SDLC-CONV-01 through SDLC-CONV-06.
- `.planning/PROJECT.md` § Constraints & Key Decisions — Desktop Tauri runtime primary, native keyring, IndexedDB persistence, local-first architecture.
- `.planning/phases/26-sdlc-prompt-grounding-tool-use-policy/26-CONTEXT.md` — Layered prompt composer architecture, policy-first order, untrusted data delimiters.
- `.planning/phases/29-ssh-remote-repository-branch-diff-review/29-CONTEXT.md` — Per-project SSH profile and repository path binding contracts.

### Prompt Composer & AI Orchestrator
- `src/services/ai/sdlcPromptComposer.ts` — `SHARED_EVIDENCE_POLICY`, `composeSdlcTurn`, layered prompt segments, grounding formatting.
- `src/services/ai/aiOrchestratorLoop.ts` — Multi-round tool loop and streaming runtime.
- `src/components/sdlc/chat/StepChatPanel.tsx` — SDLC chat panel composing turns with grounding and settings.

### SSH & Remote Repository Services
- `src/services/gitRemoteService.ts` — `runGitCommand`, `escapeShellArg`, remote repo interaction.
- `src/services/sshService.ts` — `execRemoteCommand`, native Tauri SSH backend invocation.
- `src/types/gitRemote.ts` — `ProjectRepoSshBinding`.

### SDLC Workspace & Settings UI
- `src/views/ProjectSdlcView.tsx` — SDLC workspace coordinator and step state management.
- `src/components/sdlc/steps/Step1IntakeView.tsx` — Step 1 Intake view component.
- `src/components/sdlc/steps/Step2SolutionView.tsx` — Step 2 Solution view component.
- `src/components/settings/` — Settings cards and persistence mechanisms.
- `src/db/index.ts` — Dexie database schema and `settings` table.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `sdlcPromptComposer.ts`: Layered architecture (`SHARED_EVIDENCE_POLICY`, `buildToolPolicy`, `buildGrounding`) đã có sẵn; dễ dàng chèn thêm Layer Convention Segment ngay trước Grounding.
- `sshService.ts` & `gitRemoteService.ts`: Đã có sẵn hàm thực thi lệnh qua SSH (`execRemoteCommand`, `runGitCommand`) với keyring secret resolution; có thể đọc file qua `cat` hoặc SFTP.
- `ProjectRepoSshBinding`: Đã lưu liên kết SSH config và đường dẫn remote repo cho từng project.
- `db.settings`: Bảng key-value của Dexie, đã hỗ trợ lưu trữ các config như Jira, NineRouter, GitHub PAT, tự động được mã hóa khi xuất backup.

### Established Patterns
- Ant Design 6 Card & Typography matching IntelliJ ExpUI dark/light theme.
- Data-not-instructions delimiter pattern: Bọc mọi dữ liệu ngoài trong các thẻ `[... - DỮ LIỆU KHÔNG TIN CẬY]` để đảm bảo an toàn prompt injection.
- Reversible settings storage: Lưu các cấu hình per-project hoặc global trong IndexedDB bảng `settings`.

### Integration Points
- `src/services/conventionService.ts` (mới): Service quản lý đọc/lưu Global Convention từ `db.settings` và fetch Repo `CONVENTIONS.md` qua `sshService`.
- `src/components/settings/GlobalConventionsCard.tsx` (mới): Card soạn thảo Global Convention trong trang Settings.
- `src/services/ai/sdlcPromptComposer.ts`: Thêm trường `conventions?: { global?: string; repo?: string }` vào `ComposeSdlcTurnInput` và sinh segment quy ước.
- `src/views/ProjectSdlcView.tsx`: Quản lý state conventions nạp cho CR hiện tại và truyền vào `StepChatPanel` cũng như các view con.
- `src/components/sdlc/steps/Step1IntakeView.tsx` & `Step2SolutionView.tsx`: Thêm Panel tóm tắt trạng thái quy ước áp dụng.

</code_context>

<specifics>
## Specific Ideas
- Người dùng nhấn mạnh: Không tự chế nội dung mẫu cho Global Convention. Chưa có thì để trống hoàn toàn (Empty state).
- Nạp file qua Native SSH/SFTP (không qua fs-gw daemon) để khớp hoàn toàn với kiến trúc desktop hiện tại của TaskMate.
- Thứ tự phân đoạn trong prompt: Global trước, Repo sau. Khi có mâu thuẫn, AI bắt buộc chỉ rõ mâu thuẫn và 2 nguồn, không tự ý chọn.
- Không giới hạn độ dài của file conventions trong prompt.
- Exemplar test kiểm tra rule API ResponseEnvelope & Logging xuất hiện trong SOLUTION tự động.

</specifics>

<deferred>
## Deferred Ideas

None — discussion remained strictly focused on Phase 31 scope. External research via Claude Code headless is scoped for Phase 32; prompt transparency view is scoped for Phase 33.

</deferred>

---

*Phase: 31-Organization Conventions in the Solution Pipeline*
*Context gathered: 2026-11-07*
