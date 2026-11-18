# Phase 30: Automatic Change Pack Packaging & Drift Reconciliation - Research

**Researched:** 2026-11-06  
**Domain:** SSH Git Automation, In-Memory Zip Packaging (JSZip), Change Pack Validation, Drift Matrix Reconciliation  
**Confidence:** HIGH  

## Executive Summary

Trong quy trình SDLC 6 bước của TaskMate, Bước 4 trước đây yêu cầu người dùng kéo thả thủ công tệp `.zip` (Change Pack) được đóng gói từ bên ngoài. Pha 30 hoàn thiện cầu nối tự động hóa trực tiếp từ Bước 3 (Branch Review & Snapshot) sang Bước 4 (Change Pack & Drift Reconciliation):
1. **Thu thập tệp & Đóng gói In-Memory qua SSH**: Dựa trên `BranchSnapshot` đã được phê duyệt ở Bước 3, hệ thống tự động sinh `diff.patch` từ `git diff base..head`, thu thập danh sách commit log, cấu trúc `meta.json` hợp lệ, và kéo nội dung các tệp thuộc diện đóng gói (`sql/*` gồm `.sql`, `.plb`, `.pck`, `.pkb` và `new-files/*`) qua SSH. Toàn bộ được nén thành zip `Blob` bằng `JSZip` ngay trong bộ nhớ client, không ghi tệp rác lên disk remote hay local.
2. **Nâng trần an toàn Desktop (Desktop-scaled Limits)**: Trần dung lượng hiện tại trong `changePack.ts` (5MB compressed, 26MB expanded, 2MB/entry, 256 entries) được thiết kế cho web PWA hẹp. Đối với ứng dụng Tauri desktop xử lý repository ngân hàng thực tế, trần mặc định được nâng lên: 25MB compressed, 100MB expanded, 10MB/entry, 1.000 entries (kết hợp hỗ trợ cấu hình tùy chỉnh qua `TaskPlannerDatabase.settings`), ngăn chặn tình trạng từ chối nhầm pack hợp lệ.
3. **Luồng thao tác chủ động & Trực quan hóa tiến trình**: Bước 4 hiển thị thẻ tóm tắt Branch Snapshot với nút hành động "Đóng gói & Đối chiếu từ Snapshot". Khi kích hoạt, hiển thị Stepper 4 bước rõ ràng: (1) Kiểm tra remote & tạo diff.patch -> (2) Thu thập tệp mới & SQL -> (3) Nén JSZip in-memory -> (4) Đối soát Drift Matrix.
4. **Phát hiện Remote Drift & Cảnh báo Dirty**: Tự động phát hiện nếu HEAD remote đã trôi (khác `headSha` đã duyệt) hoặc working tree dirty, cung cấp cảnh báo với 2 hướng xử lý: quay lại Bước 3 duyệt lại, hoặc tiếp tục đóng gói chính xác theo commit SHA của Snapshot.
5. **Khả năng dự phòng (Fallback Resilience)**: Vùng nạp zip thủ công (`ChangePackDropzone`) được chuyển vào một Accordion phụ bên dưới. Khi SSH lỗi kết nối hoặc chưa có Snapshot, giao diện tự động cảnh báo, hiển thị CTA quay lại Bước 3 và tự động bung mở Accordion thủ công để không bao giờ làm nghẽn công việc.

**Primary recommendation:** Xây dựng `src/services/changePackPackager.ts` chuyên trách đóng gói in-memory từ `BranchSnapshot` + SSH; nâng trần `ChangePackLimits` mặc định và bổ sung helper `getEffectiveChangePackLimits()`; nâng cấp `Step4ChangePackView.tsx` nhận `branchSnapshot` từ `workflowState` với giao diện Accordion fallback và Progress Stepper.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01: Khởi động chủ động**: Khi vào Bước 4 với Branch Snapshot đã duyệt từ Bước 3, hiển thị thẻ thông tin Snapshot (Base, Head, Branch, số files) kèm nút chính "Đóng gói & Đối chiếu từ Snapshot" thay vì chạy tự động ngầm. Người dùng luôn chủ động xem lại và kiểm soát thời điểm kích hoạt.
- **D-02: MultiPack integration**: Khi bấm đóng gói (hoặc đóng gói lại), hệ thống luôn tạo mới một bản ghi pack trong lịch sử MultiPack của CR, tự động đặt làm `activePackHash` và cập nhật lại Drift Matrix (giữ nguyên các pack trước đó để người dùng có thể so sánh/xem lại lịch sử).
- **D-03: Thiếu Snapshot**: Trường hợp người dùng vào thẳng Bước 4 mà chưa có Branch Snapshot được duyệt (hoặc snapshot bị xoá), giao diện hiển thị banner cảnh báo kèm nút CTA "Quay lại Bước 3: Duyệt nhánh" và tự động mở sẵn vùng nạp thủ công (Dropzone).
- **D-04: Tiến trình đóng gói trực quan**: Trong quá trình SSH kết nối, thu thập file và đối soát, hiển thị Step-by-step progress (Đang tạo diff.patch... -> Đang thu thập file mới/SQL... -> Đang nén JSZip -> Đang đối soát drift...).
- **D-05: Kỹ thuật thu thập file qua SSH**: Kết hợp `git diff base..head` để lấy `diff.patch` và pipeline tar/base64 qua SSH (`execRemoteCommand`) để kéo các file `sql/*` và `new-files/*` về bộ nhớ client, sau đó đóng gói hoàn chỉnh bằng `JSZip` ngay trong app memory mà không ghi file rác lên remote disk.
- **D-06: Giới hạn dung lượng Change Pack (Desktop-scaled Limits)**: Nâng trần mặc định của `ChangePackLimits` lên mức rộng rãi phù hợp với ứng dụng Desktop native (25MB compressed, 100MB expanded, 10MB per entry, 1000 entries) và hỗ trợ mở rộng qua Settings nếu dự án yêu cầu, ngăn chặn tình trạng mất pack hoặc từ chối oan các repo nghiệp vụ lớn.
- **D-07: Tuân thủ entryPolicy**: Bộ thu thập SSH chỉ lọc và đóng gói đúng các entry chuẩn theo quy định: `diff.patch`, `meta.json`, `sql/*` (*.sql, *.plb, *.pkb), và `new-files/*`. Tự động loại trừ các thư mục rác (node_modules, package-lock, binary không hỗ trợ).
- **D-08: Phát hiện Remote Drift**: Trước khi đóng gói, kiểm tra nhanh HEAD của remote branch. Nếu remote HEAD đã khác với `headSha` trong Snapshot Bước 3 (do lập trình viên push thêm commit), hiển thị cảnh báo rõ ràng và cho phép 2 hướng giải quyết: 1) Quay lại Bước 3 duyệt lại, hoặc 2) Vẫn tiếp tục đóng gói chính xác theo commit SHA đã duyệt trong Snapshot.
- **D-09: Dirty Working Tree**: Nếu remote repo có uncommitted files (`git status --porcelain` dirty), hiển thị warning banner thông báo, nhưng vẫn cho phép tiếp tục đóng gói bình thường vì Change Pack được tạo dựa trên git commit range ($BASE..$HEAD) đã duyệt.
- **D-10: Bố cục Chính - Phụ (Accordion)**: Khu vực đóng gói tự động từ SSH là khối giao diện chính ở trên cùng. Phía dưới là Accordion / Collapse mang nhãn "Nạp Change Pack thủ công (.zip)" dành cho kịch bản offline, không có SSH hoặc người dùng tự build zip bên ngoài.
- **D-11: Tự động bung Fallback khi lỗi SSH**: Nếu SSH timeout, mất kết nối mạng hoặc lỗi chứng thực, giao diện hiển thị banner lỗi kèm nút "Thử lại kết nối", đồng thời tự động bung mở Accordion Manual Dropzone để người dùng có thể nạp zip ngay mà không bị gián đoạn công việc.

### Claude's Discretion
- Chi tiết thông điệp và icon hiển thị của các bước trong Progress Stepper (Ant Design Steps/Timeline).
- Cấu trúc lệnh shell tar trên Linux/WSL đảm bảo an toàn escaping và hỗ trợ tên file có khoảng trắng hoặc ký tự đặc biệt.
- Vị trí cấu hình tùy chỉnh kích thước Change Pack trong TaskMate Settings nếu người dùng cần nới thêm.

### Deferred Ideas (OUT OF SCOPE)
- None — discussion remained strictly focused on Phase 30 scope. Organization conventions are scoped for Phase 31.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **SDLC-REPO-04** | Package and export repository changes as an auditable change pack conforming to `ChangePackManifestSchema` | Nghiên cứu cấu trúc `ChangePackManifestSchema`, `entryPolicy` và cơ chế nén bằng `JSZip` in-memory kết hợp tar/base64 stream qua SSH mà không ghi tệp tạm lên disk. |
| **SDLC-REPO-05** | Validate change pack integrity, entry safety, size limits, and CR identity matching before downstream acceptance | Nâng trần `ChangePackLimits` cho desktop native (25MB zip, 100MB giải nén, 10MB/file, 1000 files) kết hợp hàm `validateHubChangePack` và dynamic setting. |
| **SDLC-REPO-07** | Reconcile solution design against implementation diff and surface drift with categorization (outside_solution, missing, different) | Tự động kích hoạt `buildHubReconciliation` sau khi đóng gói, cập nhật MultiPack history và hiển thị kết quả trên `DriftMatrixView`. |
</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| **SSH Command Execution & Git Diff** | Tauri Native (Rust `ssh2`) | Desktop Service (`sshService.ts`) | Gọi lệnh `git diff`, `git archive` hoặc `tar` trực tiếp trên remote server qua SSH subsystem. |
| **In-Memory Zip Creation** | Client Engine (`changePackPackager.ts`) | JSZip Browser Runtime | Tạo tệp zip `Blob` hoàn chỉnh trong RAM client từ `diff.patch`, `meta.json` và tệp tải về; không ghi ổ đĩa. |
| **Change Pack Validation** | Domain Logic (`changePack.ts`) | Security Filter (`entryPolicy`) | Kiểm tra tính hợp lệ của zip, chống path traversal, kiểm tra hash SHA-256, và xác minh CR identity. |
| **Drift Reconciliation** | Domain Engine (`reconciliation.ts`) | Workflow State (`workflowCoordinator.ts`) | So sánh `ChangePackManifest` với SOLUTION Note đã duyệt, phân loại drift và cập nhật state SDLC. |
| **UI State & Progress Orchestration** | React Component (`Step4ChangePackView.tsx`) | Ant Design 6 Steps & Collapse | Điều phối tương tác người dùng, hiển thị stepper tiến trình đóng gói, cảnh báo drift và fallback dropzone. |

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `jszip` | 3.10.2 [VERIFIED: package.json:39] | Nén và giải nén tệp zip trong bộ nhớ | Thư viện chuẩn được dự án sử dụng cho Change Pack, hỗ trợ async generate Blob/Uint8Array. |
| `zod` | 4.6.5 [VERIFIED: package.json:49] | Runtime schema validation | Kiểm tra toàn vẹn `ChangePackManifestSchema`, `BranchSnapshotSchema`, `ReconciliationResultSchema`. |
| `antd` | 6.6.5 [VERIFIED: package.json:33] | Giao diện người dùng | Cung cấp `Card`, `Steps`, `Alert`, `Collapse`, `Button`, `Tag`, `Typography` đồng bộ chuẩn IntelliJ theme. |
| `@ant-design/icons` | 6.3.4 [VERIFIED: package.json:25] | Bộ icon Ant Design | Cung cấp icon trạng thái trực quan: `CheckCircleOutlined`, `LoadingOutlined`, `CloudUploadOutlined`, `WarningOutlined`, etc. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `gitRemoteService` | in-repo | Lệnh git qua SSH | Gọi `runGitCommand`, `checkHeadDrift`, `checkDirtyStatus`, `escapeShellArg`. |
| `hubChangePack` | in-repo | Xác thực & Đối chiếu CR | Gọi `validateHubChangePack` và `buildHubReconciliation`. |
| `sdlcCrManager` | in-repo | Quản lý lịch sử MultiPack | Gọi `getMultiPackState`, `saveMultiPackState`. |

---

## Package Legitimacy Audit

Giai đoạn này tái sử dụng 100% các thư viện đã được cài đặt trong `package.json` (`jszip`, `zod`, `antd`, `@ant-design/icons`), không bổ sung bất kỳ package npm mới nào.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `jszip` | npm | 10+ yrs | ~12M/wk | github.com/Stuk/jszip | [OK] | Đã cài đặt |
| `zod` | npm | 4+ yrs | ~35M/wk | github.com/colinhacks/zod | [OK] | Đã cài đặt |

---

## Architecture Patterns

### System Architecture Diagram

```
[ Step 3: Approved BranchSnapshot ]
               │
               ▼
┌─────────────────────────────────────────────────────────────┐
│ Step 4: Step4ChangePackView (Thẻ tóm tắt Snapshot)          │
│ [Button: "Đóng gói & Đối chiếu từ Snapshot"]                │
└──────────────────────────────┬──────────────────────────────┘
                               │ User click
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ changePackPackager.packageFromSnapshot(snapshot, config)    │
│                                                             │
│ 1. Remote Check (checkHeadDrift & checkDirtyStatus)         │
│    ├── Remote HEAD != Snapshot headSha ──> Warning Prompt   │
│    └── Dirty working tree ───────────────> Warning Info     │
│                                                             │
│ 2. Generate diff.patch:                                     │
│    `git diff base..head` over SSH                           │
│                                                             │
│ 3. Collect SQL & New Files:                                 │
│    Filter fileStats matching entryPolicy:                   │
│    - sql/** (*.sql, *.plb, *.pck, *.pkb)                    │
│    - new-files/** (files with status === 'added')           │
│    Download via `git archive` / `tar` / `readRemoteFile`    │
│                                                             │
│ 4. Construct meta.json:                                     │
│    Conforming to ChangePackMetaSchema                       │
│                                                             │
│ 5. JSZip In-Memory Compression:                             │
│    zip.file('diff.patch', ...)                              │
│    zip.file('meta.json', ...)                               │
│    zip.file('sql/...', ...)                                 │
│    zip.file('new-files/...', ...)                           │
│    ──> return Blob                                          │
└──────────────────────────────┬──────────────────────────────┘
                               │ Output: Blob
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ Validation & Reconciliation Pipeline:                       │
│ 1. validateHubChangePack(blob, crCode, limits)              │
│    ──> ChangePackManifest                                   │
│ 2. buildHubReconciliation({ manifest, solutionNoteId, ... })│
│    ──> ReconciliationResult (Drift Matrix)                  │
│ 3. saveMultiPackState (Thêm vào lịch sử, active = packHash) │
│ 4. onCommitChangePackAndDrift(...)                          │
└─────────────────────────────────────────────────────────────┘
```

### Pattern 1: In-Memory Packaging Pipeline qua SSH
**Mục tiêu:** Thu thập toàn bộ artifact cần thiết từ remote server và đóng gói thành zip hợp lệ mà không lưu file tạm trên server hay client.

1. **`diff.patch`**:
   Chạy lệnh: `git -C <repo> diff <baseCommit>..<headCommit>` qua `runGitCommand`. Lệnh này độc lập với working tree hiện tại, đảm bảo lấy đúng diff giữa 2 commit đã duyệt.
2. **`meta.json`**:
   Tạo JSON object tuân thủ `ChangePackMetaSchema` [VERIFIED: src/services/wizard/changePack.ts:20-29]:
   ```typescript
   {
     cr: crCode,
     base: snapshot.baseCommit || snapshot.baseBranch,
     head: snapshot.headSha || snapshot.headCommit,
     branch: snapshot.targetBranch || snapshot.branch,
     author: snapshot.author || 'TaskMate User',
     generatedAt: new Date().toISOString(),
     commits: commits.map(c => ({ sha: c.sha, subject: c.message })),
     files: fileStats.map(f => ({ path: f.path, status: f.status }))
   }
   ```
3. **Phân loại tệp cần thu thập theo `entryPolicy`** [VERIFIED: src/services/wizard/changePack.ts:98-107]:
   - Tệp SQL: đường dẫn khớp `/^sql\/.+\.(?:sql|plb|pck|pkb)$/i`. Lấy nội dung tại commit `headSha` bằng lệnh `git -C <repo> show <headSha>:<filePath>`.
   - Tệp mới (`new-files/*`): Các tệp có `status === 'added'` (ngoại trừ các tệp bị cấm như `node_modules`, `package-lock.json`, v.v.). Đặt vào thư mục `new-files/<filePath>` trong zip. Lấy nội dung bằng `git -C <repo> show <headSha>:<filePath>`.
   - Đối với các repository có nhiều file mới, có thể gom nhóm bằng lệnh `tar -czf - -C <repoPath> <files...>` qua SSH rồi giải nén trên client, hoặc lấy từng file bằng `git show` nếu số lượng file vừa phải (< 50 files).

### Pattern 2: Desktop-scaled Limits & Configurable Ceiling
**Mục tiêu:** Ngăn chặn việc từ chối nhầm các change pack lớn trong môi trường Desktop, đồng thời cho phép người dùng tùy chỉnh nếu gặp repo đặc thù.

```typescript
// Trong src/services/wizard/changePack.ts
export const DesktopChangePackLimits: Readonly<ChangePackLimits> = Object.freeze({
  maxCompressedBytes: 26_214_400, // 25 MB
  maxExpandedBytes: 104_857_600,  // 100 MB
  maxEntryBytes: 10_485_760,      // 10 MB
  maxEntries: 1000,
});
```
Thêm helper `getEffectiveChangePackLimits(customLimits?: Partial<ChangePackLimits>): ChangePackLimits` và cập nhật `ChangePackManifestSchema` để không hard-code `.max(ChangePackLimits.maxEntries)` mà dùng trần rộng rãi hoặc schema mở rộng.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Nén tệp zip | Tự viết encoder zip nhị phân | `JSZip` | JSZip xử lý CRC32, chuẩn hóa timestamp, thư mục con và UTF-8 file names an toàn. |
| SSH Execution & Streaming | Tự dựng socket TCP raw qua WebSockets | `execRemoteCommand` (Tauri `ssh2` backend) | Đã có sẵn kênh SSH an toàn, xử lý xác thực mật khẩu/khóa/keyring của hệ điều hành. |
| So khớp drift và tính toán chênh lệch | Tự so sánh diff strings | `reconcileSolutionWithPack` & `buildHubReconciliation` | Đã kiểm thử nghiêm ngặt, phân loại chính xác `outside_solution`, `missing`, `different`. |
| Hiển thị tiến trình nhiều bước | Tự code timeline HTML/CSS | Ant Design `<Steps>` hoặc `<Timeline>` | Tích hợp sẵn theme Ant Design, trạng thái `process`, `finish`, `wait`, `error`. |

---

## Common Pitfalls

### Pitfall 1: Trôi dạt Remote HEAD (Remote Drift) giữa Bước 3 và Bước 4
**Hiện tượng:** Lập trình viên push thêm commit mới lên branch remote sau khi đã bấm Duyệt Snapshot ở Bước 3. Nếu Bước 4 tự động lấy `HEAD` của branch thay vì commit SHA trong Snapshot, Change Pack sẽ chứa các thay đổi chưa được review.  
**Giải pháp:**  
- Khi gọi `git diff`, luôn dùng commit SHA cụ thể: `git diff <baseCommit>..<headSha>` chứ không dùng tên branch `targetBranch`.
- Trước khi đóng gói, chạy `checkHeadDrift(config, repoPath, targetBranch, headSha)`: nếu `currentHeadSha !== headSha`, hiển thị Warning Alert rõ ràng với 2 nút: (1) "Quay lại Bước 3 để duyệt commit mới", (2) "Tiếp tục đóng gói theo Snapshot đã duyệt (commit <headSha>)".

### Pitfall 2: Working Tree bị bẩn (Dirty Working Tree)
**Hiện tượng:** Remote repo đang có tệp chưa commit hoặc file tạm. Nếu dùng `git status` không sạch sẽ gây hiểu nhầm rằng change pack bị sai.  
**Giải pháp:**  
Thay vì chặn đứng tiến trình, hiển thị cảnh báo thông tin: "Repository remote đang có tệp chưa commit. Tuy nhiên, Change Pack được tạo dựa trên lịch sử commit đã duyệt giữa Base và Head, do đó không bị ảnh hưởng bởi working tree." Cho phép tiếp tục đóng gói bình thường (D-09).

### Pitfall 3: Cấu trúc đường dẫn trong Zip vi phạm `entryPolicy`
**Hiện tượng:** `validateChangePack` ném lỗi `PACK_ENTRY_UNSUPPORTED` nếu có tệp nằm ngoài quy ước (`diff.patch`, `meta.json`, `sql/*`, `new-files/*`).  
**Giải pháp:**  
Hàm thu thập tệp phải đặt tiền tố chuẩn xác:
- Tệp SQL giữ nguyên hoặc đưa vào `sql/<tên-file>` nếu ở repo gốc nằm trong thư mục SQL. Nếu repo có file SQL ở đường dẫn khác, cần map về `sql/<path>`.
- Tệp mới được thêm (`status === 'added'`) phải luôn có tiền tố `new-files/<relativePath>`.
- Không đưa các file `modified` vào zip trừ khi là file SQL hoặc diff hunk nằm trong `diff.patch`.

### Pitfall 4: Lỗi Out-Of-Memory khi tải tệp binary lớn qua SSH
**Hiện tượng:** Nếu tệp thêm mới là binary lớn (ví dụ video, zip, binary lib) mà lệnh `git show` kéo toàn bộ string utf-8 có thể gây treo kênh SSH.  
**Giải pháp:**  
- Tuân thủ `isProbablyBinaryPath` và kiểm tra kích thước qua `git cat-file -s <sha>:<path>` hoặc giới hạn kích thước từng tệp (`maxEntryBytes`).
- Bỏ qua các tệp binary lớn hơn `maxEntryBytes` hoặc đánh dấu status là `binary` trong `meta.json`.

---

## Code Examples

### 1. In-Memory Packaging Service (`src/services/changePackPackager.ts`)

```typescript
import JSZip from 'jszip';
import type { SshConfig } from '../types/ssh';
import type { BranchSnapshot, RemoteFileStat } from '../types/gitRemote';
import { runGitCommand, escapeShellArg, checkHeadDrift, checkDirtyStatus } from './gitRemoteService';
import { getSshSecret } from './sshService';
import { ChangePackMetaSchema, type ChangePackMeta } from './wizard/changePack';

export interface PackageProgressCallback {
  (step: 'checking' | 'diff' | 'files' | 'compressing' | 'validating', message: string): void;
}

export async function createChangePackFromSnapshot(
  config: SshConfig,
  repoPath: string,
  snapshot: BranchSnapshot,
  crCode: string,
  onProgress?: PackageProgressCallback,
): Promise<{ blob: Blob; meta: ChangePackMeta; warnings: string[] }> {
  const secret = (await getSshSecret(config.id)) ?? undefined;
  const warnings: string[] = [];

  // Step 1: Check remote drift & dirty status
  onProgress?.('checking', 'Kiểm tra trạng thái remote repository...');
  const baseCommit = snapshot.baseCommit || snapshot.baseBranch || 'origin/main';
  const targetCommit = snapshot.headSha || snapshot.headCommit;
  if (!targetCommit) throw new Error('Snapshot không có head SHA hợp lệ');

  if (snapshot.targetBranch) {
    const drift = await checkHeadDrift(config, repoPath, snapshot.targetBranch, targetCommit, secret);
    if (drift.drifted) {
      warnings.push(`Remote HEAD đã thay đổi (${targetCommit.slice(0, 8)} → ${drift.currentHeadSha.slice(0, 8)})`);
    }
  }

  const dirty = await checkDirtyStatus(config, repoPath, secret);
  if (!dirty.isClean) {
    warnings.push(`Thư mục làm việc remote có ${dirty.uncommittedFiles.length} tệp chưa commit`);
  }

  // Step 2: Generate diff.patch
  onProgress?.('diff', 'Đang tạo diff.patch từ git commit range...');
  const rangeArg = `"${escapeShellArg(baseCommit)}..${escapeShellArg(targetCommit)}"`;
  const diffPatch = await runGitCommand(
    config,
    repoPath,
    ['diff', '--binary', rangeArg],
    secret
  );

  // Step 3: Identify & Collect files (sql/* and new-files/*)
  onProgress?.('files', 'Đang thu thập các tệp SQL và tệp mới thêm...');
  const fileStats: RemoteFileStat[] = snapshot.fileStats ?? [];
  const zip = new JSZip();

  // Add diff.patch
  zip.file('diff.patch', diffPatch);

  // Process files
  for (const file of fileStats) {
    const path = file.path;
    const isSql = /^sql\/.+\.(?:sql|plb|pck|pkb)$/i.test(path);
    const isAdded = file.status === 'added';

    if (isSql) {
      const content = await runGitCommand(
        config,
        repoPath,
        ['show', `${escapeShellArg(targetCommit)}:${escapeShellArg(path)}`],
        secret
      );
      zip.file(path, content);
    } else if (isAdded) {
      // Exclude prohibited entries
      const lower = path.toLowerCase();
      if (lower.split('/').includes('node_modules') || lower.endsWith('package-lock.json')) {
        continue;
      }
      const zipPath = `new-files/${path.replace(/^\/+/, '')}`;
      const content = await runGitCommand(
        config,
        repoPath,
        ['show', `${escapeShellArg(targetCommit)}:${escapeShellArg(path)}`],
        secret
      );
      zip.file(zipPath, content);
    }
  }

  // Step 4: Construct meta.json
  const meta: ChangePackMeta = {
    cr: crCode,
    base: baseCommit,
    head: targetCommit,
    branch: snapshot.targetBranch || snapshot.branch || 'unknown',
    author: 'TaskMate SSH Packager',
    generatedAt: new Date().toISOString(),
    commits: (snapshot.commitShas ?? [targetCommit]).map((sha) => ({
      sha,
      subject: `Commit ${sha.slice(0, 8)}`,
    })),
    files: fileStats.map((f) => ({
      path: f.path,
      status: f.status,
    })),
  };

  const parsedMeta = ChangePackMetaSchema.parse(meta);
  zip.file('meta.json', JSON.stringify(parsedMeta, null, 2));

  // Step 5: Compress into Blob
  onProgress?.('compressing', 'Đang nén dữ liệu Change Pack (.zip)...');
  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  return { blob, meta: parsedMeta, warnings };
}
```

---

## State of the Art

| Old Approach (Pre-Phase 30) | Current Approach (Phase 30) | When Changed | Impact |
|------------------------------|-----------------------------|--------------|--------|
| Người dùng tự tạo tệp `.zip` ngoài máy local/remote rồi kéo thả vào Bước 4 | 1-click đóng gói tự động qua SSH trực tiếp từ `BranchSnapshot` đã duyệt | Phase 30 | Loại bỏ hoàn toàn thao tác nén zip thủ công, giảm sai sót nhầm commit hoặc thiếu file. |
| Giới hạn zip web 5MB / 26MB | Nâng trần Desktop 25MB compressed / 100MB expanded / 1.000 files | Phase 30 | Tương thích repository ngân hàng lớn mà không gây lỗi `PACK_COMPRESSED_TOO_LARGE`. |
| Chỉ có Dropzone nạp tệp đơn lẻ | Giao diện Chính - Phụ (Auto-pack card + Accordion Manual Dropzone) | Phase 30 | Trải nghiệm trực quan, có stepper tiến trình, đồng thời vẫn bảo đảm tính dự phòng offline. |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | SSH session Tauri cho phép truyền tải payload tệp text/diff hàng chục MB qua `ssh_exec_command` mà không tràn buffer kênh stdout | Architecture Patterns | Nếu diff quá lớn (> 30MB), `ssh_exec_command` có thể tốn nhiều RAM. Giới hạn trần 25MB giúp đảm bảo an toàn. |

---

## Open Questions

1. **Trường hợp remote repository không có branch remote mà chỉ có local branch:**
   - *Đã rõ:* `BranchSnapshot` ở Bước 3 đã duyệt commit range cụ thể (`baseCommit..headSha`). Lệnh `git diff` và `git show` hoạt động dựa trên SHA nên không phụ thuộc vào việc branch đã được push lên remote origin hay chưa.
2. **Kích thước file SQL hoặc file new-files quá lớn:**
   - *Đã rõ:* Đã có trần `maxEntryBytes: 10MB` và `DesktopChangePackLimits` ngăn chặn crash bộ nhớ.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Tauri Desktop Runtime | SSH native commands | ✓ | Tauri 2.2.0 | Hiển thị cảnh báo và chuyển sang chế độ nạp zip thủ công qua Dropzone |
| Git CLI trên Remote Host | `git diff`, `git show` | ✓ | Standard Git | Báo lỗi SSH command và mở Accordion nạp thủ công |

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.2 [VERIFIED: package.json:9] |
| Config file | `vite.config.ts` |
| Quick run command | `npx vitest run src/services/wizard/__tests__/changePackPackager.test.ts` |
| Full suite command | (Tránh chạy full suite theo memory rule; chỉ chạy focused tests) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SDLC-REPO-04 | Đóng gói in-memory từ Snapshot qua mock SSH sinh zip hợp lệ chứa `diff.patch`, `meta.json` | Unit | `npx vitest run src/services/__tests__/changePackPackager.test.ts` | ❌ Wave 0 |
| SDLC-REPO-05 | Kiểm tra `DesktopChangePackLimits` nâng trần cho phép pack 20MB và từ chối pack vi phạm | Unit | `npx vitest run src/services/wizard/__tests__/changePackLimits.test.ts` | ❌ Wave 0 |
| SDLC-REPO-07 | Tự động kích hoạt đối chiếu drift sau đóng gói, lưu MultiPack và hiển thị Stepper | Integration | `npx vitest run src/components/sdlc/steps/__tests__/Step4ChangePackView.test.tsx` | ❌ Wave 0 |

### Wave 0 Gaps
- [ ] `src/services/__tests__/changePackPackager.test.ts` — Kiểm thử logic sinh zip, filter file, xử lý drift cảnh báo.
- [ ] `src/components/sdlc/steps/__tests__/Step4ChangePackView.test.tsx` — Kiểm thử render Snapshot card, click nút auto-pack, hiển thị Stepper và Accordion fallback.

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | yes | `canonicalizePackPath` chống path traversal, Zod validation cho `meta.json` và manifest. |
| V6 Cryptography | yes | Tính toán `sha256Hex` cho từng pack và hash commit để đảm bảo tính toàn vẹn evidence. |
| V14 Configuration | yes | Thông tin SSH secret (passphrase/password) được lấy an toàn từ OS Keyring qua `getSshSecret`, không log ra console. |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Shell Command Injection | Tampering | Sử dụng `escapeShellArg` cho mọi tham số truyền vào lệnh git qua SSH. |
| Path Traversal via Pack Entries | Tampering / Information Disclosure | Hàm `canonicalizePackPath` loại trừ `..`, `\0`, đường dẫn tuyệt đối hoặc ký tự điều khiển. |
| Zip Slip / Zip Bomb | Denial of Service | Giới hạn `maxCompressedBytes`, `maxExpandedBytes`, `maxEntries` trong `ChangePackLimits`. |

---

## Sources

### Primary (HIGH confidence)
- `src/services/wizard/changePack.ts` — `ChangePackLimits`, `ChangePackManifestSchema`, `entryPolicy`, `validateChangePack`.
- `src/services/wizard/hubChangePack.ts` — `validateHubChangePack`, `buildHubReconciliation`.
- `src/types/gitRemote.ts` — `BranchSnapshot`, `RemoteGitStatus`, `RemoteFileStat`.
- `src/services/gitRemoteService.ts` — `runGitCommand`, `checkHeadDrift`, `checkDirtyStatus`, `escapeShellArg`.
- `src/components/sdlc/steps/Step4ChangePackView.tsx` — Hiện trạng Bước 4 và tích hợp MultiPack.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — 100% thư viện hiện có trong dự án (`jszip`, `zod`, `antd`).
- Architecture: HIGH — Tích hợp trực tiếp từ `BranchSnapshot` đã hoàn thành ở Pha 29.
- Pitfalls: HIGH — Các kịch bản drift, dirty tree và entryPolicy đã được định vị và có giải pháp rõ ràng.

**Research date:** 2026-11-06  
**Valid until:** 2026-12-06
