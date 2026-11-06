# Phase 30: Automatic Change Pack Packaging & Drift Reconciliation - Context

**Gathered:** 2026-11-06
**Status:** Ready for planning

<domain>
## Phase Boundary

In SDLC Step 4, TaskMate automatically connects via SSH to collect git diff and required files (`sql/*`, `new-files/*`) based on the approved `BranchSnapshot` from Step 3, constructs an in-memory change pack zip conforming to `ChangePackManifestSchema`, runs `validateHubChangePack`, and triggers drift reconciliation against the approved SOLUTION with no manual zip handling.

This phase implements:
1. **SSH File Collector & In-Memory Packager**: Stream/collect `diff.patch`, `meta.json`, and required target files (`sql/*`, `new-files/*`) over SSH using git diff + tar pipeline, packaging with JSZip into a valid Change Pack adhering to `entryPolicy`.
2. **Safety & Size Guard Scaling**: Nâng trần mặc định của Change Pack lên mức an toàn cho môi trường Desktop native (ví dụ: 25MB zip nén, 100MB giải nén, 10MB/file, 1000 files) kết hợp cấu hình tuỳ chỉnh nếu cần, tránh nghẽn dung lượng cho repo ngân hàng thực tế.
3. **Step 4 Auto-Packaging Trigger & MultiPack Flow**: Hiển thị thẻ tóm tắt Branch Snapshot với nút hành động chủ động 'Đóng gói & Đối chiếu từ Snapshot' (kèm Stepper progress chi tiết). Kết quả tự động ghi nhận vào lịch sử MultiPack dưới dạng active pack và cập nhật Drift Matrix.
4. **Remote Drift & Dirty Status Handling**: Nhận diện HEAD remote bị trôi dạt (drift) hoặc working tree dirty, hiển thị cảnh báo rõ ràng và trao quyền cho người dùng tiếp tục đóng gói theo commit Snapshot đã duyệt hoặc quay lại Step 3.
5. **Fallback Layout & Error Handling**: Bố cục chính-phụ dạng Accordion gập mở cho 'Nạp Change Pack thủ công (.zip)'. Khi SSH lỗi kết nối hoặc chưa có Snapshot, giao diện tự động cảnh báo, cung cấp CTA quay về Step 3 và mở sẵn Dropzone để không làm nghẽn tiến trình làm việc.

Out of scope: Organization conventions injection (Phase 31), external research via Claude Code headless (Phase 32).

</domain>

<decisions>
## Implementation Decisions

### Auto-pack Trigger & Step 4 Flow
- **D-01:** Khởi động chủ động: Khi vào Bước 4 với Branch Snapshot đã duyệt từ Bước 3, hiển thị thẻ thông tin Snapshot (Base, Head, Branch, số files) kèm nút chính "Đóng gói & Đối chiếu từ Snapshot" thay vì chạy tự động ngầm. Người dùng luôn chủ động xem lại và kiểm soát thời điểm kích hoạt. — **Reversibility:** reversible.
- **D-02:** MultiPack integration: Khi bấm đóng gói (hoặc đóng gói lại), hệ thống luôn tạo mới một bản ghi pack trong lịch sử MultiPack của CR, tự động đặt làm `activePackHash` và cập nhật lại Drift Matrix (giữ nguyên các pack trước đó để người dùng có thể so sánh/xem lại lịch sử). — **Reversibility:** reversible.
- **D-03:** Thiếu Snapshot: Trường hợp người dùng vào thẳng Bước 4 mà chưa có Branch Snapshot được duyệt (hoặc snapshot bị xoá), giao diện hiển thị banner cảnh báo kèm nút CTA "Quay lại Bước 3: Duyệt nhánh" và tự động mở sẵn vùng nạp thủ công (Dropzone). — **Reversibility:** reversible.
- **D-04:** Tiến trình đóng gói trực quan: Trong quá trình SSH kết nối, thu thập file và đối soát (có thể mất vài giây), hiển thị Step-by-step progress (Đang tạo diff.patch... -> Đang thu thập file mới/SQL... -> Đang nén JSZip -> Đang đối soát drift...). — **Reversibility:** reversible.

### SSH File Collector & Size Limits
- **D-05:** Kỹ thuật thu thập file qua SSH: Kết hợp `git diff base..head` để lấy `diff.patch` và pipeline tar/base64 qua SSH (`execRemoteCommand`) để kéo các file `sql/*` và `new-files/*` về bộ nhớ client, sau đó đóng gói hoàn chỉnh bằng `JSZip` ngay trong app memory mà không ghi file rác lên remote disk. — **Reversibility:** reversible.
- **D-06:** Giới hạn dung lượng Change Pack (Desktop-scaled Limits): Nâng trần mặc định của `ChangePackLimits` lên mức rộng rãi phù hợp với ứng dụng Desktop native (25MB compressed, 100MB expanded, 10MB per entry, 1000 entries) và hỗ trợ mở rộng qua Settings nếu dự án yêu cầu, ngăn chặn tình trạng mất pack hoặc từ chối oan các repo nghiệp vụ lớn. — **Reversibility:** costly — ảnh hưởng tới Zod schema và validation logic tại `changePack.ts`.
- **D-07:** Tuân thủ entryPolicy: Bộ thu thập SSH chỉ lọc và đóng gói đúng các entry chuẩn theo quy định: `diff.patch`, `meta.json`, `sql/*` (*.sql, *.plb, *.pkb), và `new-files/*`. Tự động loại trừ các thư mục rác (node_modules, package-lock, binary không hỗ trợ). — **Reversibility:** reversible.

### Snapshot Drift & Remote Repository Status
- **D-08:** Phát hiện Remote Drift: Trước khi đóng gói, kiểm tra nhanh HEAD của remote branch. Nếu remote HEAD đã khác với `headSha` trong Snapshot Bước 3 (do lập trình viên push thêm commit), hiển thị cảnh báo rõ ràng và cho phép 2 hướng giải quyết: 1) Quay lại Bước 3 duyệt lại, hoặc 2) Vẫn tiếp tục đóng gói chính xác theo commit SHA đã duyệt trong Snapshot. — **Reversibility:** reversible.
- **D-09:** Dirty Working Tree: Nếu remote repo có uncommitted files (`git status --porcelain` dirty), hiển thị warning banner thông báo, nhưng vẫn cho phép tiếp tục đóng gói bình thường vì Change Pack được tạo dựa trên git commit range ($BASE..$HEAD) đã duyệt. — **Reversibility:** reversible.

### Fallback Layout & Error Resilience
- **D-10:** Bố cục Chính - Phụ (Accordion): Khu vực đóng gói tự động từ SSH là khối giao diện chính ở trên cùng. Phía dưới là Accordion / Collapse mang nhãn "Nạp Change Pack thủ công (.zip)" dành cho kịch bản offline, không có SSH hoặc người dùng tự build zip bên ngoài. — **Reversibility:** reversible.
- **D-11:** Tự động bung Fallback khi lỗi SSH: Nếu SSH timeout, mất kết nối mạng hoặc lỗi chứng thực, giao diện hiển thị banner lỗi kèm nút "Thử lại kết nối", đồng thời tự động bung mở Accordion Manual Dropzone để người dùng có thể nạp zip ngay mà không bị gián đoạn công việc. — **Reversibility:** reversible.

### Claude's Discretion
- Chi tiết thông điệp và icon hiển thị của các bước trong Progress Stepper (Ant Design Steps/Timeline).
- Cấu trúc lệnh shell tar trên Linux/WSL đảm bảo an toàn escaping và hỗ trợ tên file có khoảng trắng hoặc ký tự đặc biệt.
- Vị trí cấu hình tuỳ chỉnh kích thước Change Pack trong TaskMate Settings nếu người dùng cần nới thêm.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase and Milestone Contracts
- `.planning/ROADMAP.md` § Phase 30 — Automatic Change Pack Packaging & Drift Reconciliation goal, requirements (SDLC-REPO-04, SDLC-REPO-05, SDLC-REPO-07), and 3-wave plan.
- `.planning/REQUIREMENTS.md` § Repository Autonomy via Native SSH — SDLC-REPO-04, SDLC-REPO-05, SDLC-REPO-07.
- `.planning/phases/29-ssh-remote-repository-branch-diff-review/29-CONTEXT.md` — Contract for `BranchSnapshot` persistence and approval handoff from Step 3.

### Change Pack & Reconciliation Engine
- `src/services/wizard/changePack.ts` — `ChangePackLimits`, `ChangePackManifestSchema`, `entryPolicy`, and `validateChangePack`.
- `src/services/wizard/hubChangePack.ts` — `validateHubChangePack`, `confirmHubChangePack`, `buildHubReconciliation`.
- `src/services/wizard/reconciliation.ts` — `reconcileSolutionWithPack`, `ReconciliationResultSchema`, drift categories (`outside_solution`, `missing`, `different`).
- `src/services/wizard/sdlcCrManager.ts` — `getMultiPackState`, `saveMultiPackState`, `MultiPackState`.

### SSH & Remote Git Services
- `src/types/gitRemote.ts` — `BranchSnapshot`, `RemoteGitStatus`, `RemoteFileStat`, `ProjectRepoSshBinding`.
- `src/services/gitRemoteService.ts` — `runGitCommand`, `getDiffSummary`, `checkDirtyStatus`, `escapeShellArg`.
- `src/services/sshService.ts` — `execRemoteCommand`, Tauri SSH backend invocation.

### SDLC Views & Workflow Coordination
- `src/components/sdlc/steps/Step4ChangePackView.tsx` — Step 4 view component to be enhanced with auto-pack panel and fallback accordion.
- `src/views/ProjectSdlcView.tsx` — Host view managing SDLC workflow state and navigation.
- `src/services/wizard/workflowCoordinator.ts` — `commitChangePackAndDrift` and SDLC workflow transitions.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `validateHubChangePack` & `buildHubReconciliation` (`hubChangePack.ts`): Đã hoàn chỉnh logic kiểm tra CR identity và đối chiếu drift với SOLUTION Note. Chỉ cần truyền file `Blob` (hoặc `File`) được tạo từ JSZip in-memory.
- `MultiPackTable` (`MultiPackTable.tsx`): Bảng quản lý nhiều pack, hỗ trợ switch active pack và xoá pack đã có sẵn trong Step 4.
- `DriftMatrixView` (`DriftMatrixView.tsx`): Hiển thị ma trận drift giữa SOLUTION và Change Pack.
- `execRemoteCommand` & `runGitCommand` (`gitRemoteService.ts`): Có thể dùng để gọi các lệnh git diff, git archive hoặc tar qua SSH.

### Established Patterns
- Ant Design 6 card & alert components matching IntelliJ dark/light theme.
- In-memory processing: Không tạo file tạm trên ổ đĩa remote hay local; sử dụng `JSZip.generateAsync({ type: 'blob' })` để tạo Blob nạp thẳng vào `validateHubChangePack`.
- Keyring credential resolution tích hợp sẵn trong `execRemoteCommand`.

### Integration Points
- `src/services/changePackPackager.ts` (mới): Service đóng gói Change Pack qua SSH từ `BranchSnapshot` -> sinh `Blob` zip hợp lệ.
- `src/components/sdlc/steps/Step4ChangePackView.tsx`: Thêm panel Auto-pack (Snapshot card, Progress indicator, Re-pack CTA) và chuyển `ChangePackDropzone` vào Accordion fallback.
- `src/services/wizard/changePack.ts`: Nâng trần `ChangePackLimits` mặc định và bổ sung cấu hình dynamic/desktop nếu cần.

</code_context>

<specifics>
## Specific Ideas
- Người dùng nhấn mạnh: Trần zip trong `changePack.ts` là do app đặt ra; không được để trần dung lượng làm mất pack của người dùng. Cần nâng trần rộng rãi (desktop scale) và có khả năng tuỳ biến thay vì reject cứng nhắc.
- Luồng ở Bước 4 phải là hành động chủ động (có nút bấm và tóm tắt snapshot), kèm tiến trình Step-by-step để người dùng biết hệ thống đang làm gì qua SSH.
- Cảnh báo rõ khi remote có commit mới (drift) hoặc có file uncommitted, nhưng không chặn cứng nếu người dùng vẫn muốn đóng gói theo commit Snapshot đã duyệt.

</specifics>

<deferred>
## Deferred Ideas

None — discussion remained strictly focused on Phase 30 scope. Organization conventions are scoped for Phase 31.

</deferred>

---

*Phase: 30-Automatic Change Pack Packaging & Drift Reconciliation*
*Context gathered: 2026-11-06*
