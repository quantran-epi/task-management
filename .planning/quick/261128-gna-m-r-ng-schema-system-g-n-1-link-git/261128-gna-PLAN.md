---
phase: 261128-gna
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/types/models.ts
  - src/validation/schemas.ts
  - src/validation/backupSchemas.ts
  - src/db/repositories/systemRepo.ts
  - src/components/systems/SystemModal.tsx
  - src/components/systems/SystemModal.test.tsx
  - src/components/systems/SystemTable.tsx
  - src/views/SystemDetailView.tsx
  - tests/validation/systemGitUrls.test.ts
  - tests/services/backup/validateBackup.test.ts
autonomous: true
requirements: []
user_setup: []
must_haves:
  truths:
    - "Mỗi System (kể cả LOGICAL_GROUP) lưu được 2 link git độc lập: source code và gitops; cả hai optional, không đụng remoteRepoPath"
    - "Link git bị từ chối ở mọi trust boundary nếu là javascript:/data:/file:// hoặc đường dẫn filesystem; chấp nhận https://, http://, ssh://, git://, git@host:owner/repo.git"
    - "Form tạo/sửa System có 2 ô riêng, hiện link đã lưu khi sửa, có thể xoá link bằng cách làm rỗng ô"
    - "System detail và System catalog table hiển thị cả 2 link dưới dạng clickable, phân biệt nhãn Source/GitOps"
    - "Backup cũ không có field vẫn restore được; backup có link hợp lệ restore được; backup có link độc hại bị reject trước khi ghi"
    - "Không file nào của session khác bị đụng hoặc commit: src/views/TasksView.tsx, src/components/tasks/**, src/components/tasks/tasklist-workspace.css, src/workbench/**, src/styles/workbench-tokens.css, .planning/STATE.md, artifact 261128-fqs và 261128-fvp"
  artifacts:
    - path: src/types/models.ts
      provides: "System.gitSourceUrl? và System.gitOpsUrl? — metadata link, tách khỏi remoteRepoPath (SSH filesystem path)"
    - path: src/validation/schemas.ts
      provides: "isGitRepoUrl / isValidGitRepoUrl / gitRepoUrlSchema — một rule dùng chung cho form và backup"
    - path: src/validation/backupSchemas.ts
      provides: "BackupSystemRecordSchema chấp nhận 2 link optional,Validate cùng rule"
    - path: src/db/repositories/systemRepo.ts
      provides: "createSystem/updateSystem lưu và xoá 2 field; không đưa vào cấm LOGICAL_GROUP"
    - path: src/components/systems/SystemModal.tsx
      provides: "2 FormItem riêng, validator AntD, seed khi sửa, payload gửi cả 2"
    - path: src/components/systems/SystemTable.tsx
      provides: "Cột Link Git với 2 link có nhãn"
    - path: src/views/SystemDetailView.tsx
      provides: "2 dòng Descriptions link clickable trong tab Tổng quan"
    - path: tests/validation/systemGitUrls.test.ts
      provides: "Unit guard cho rule URL, Zod schemas, backup schema và validateBackupPayload"
  key_links:
    - from: "src/components/systems/SystemModal.tsx"
      to: "src/validation/schemas.ts"
      via: "import isValidGitRepoUrl cho rules của 2 FormItem"
      pattern: "isValidGitRepoUrl"
    - from: "src/validation/backupSchemas.ts"
      to: "src/validation/schemas.ts"
      via: "import gitRepoUrlSchema làm field schema cho BackupSystemRecordSchema"
      pattern: "gitRepoUrlSchema"
    - from: "src/db/repositories/systemRepo.ts"
      to: "src/validation/schemas.ts"
      via: "SystemInputSchema/SystemUpdateSchema đã parse cả 2 field trước khi ghi Dexie"
      pattern: "gitSourceUrl|gitOpsUrl"
---

<objective>
Mở rộng entity System với 2 link git riêng biệt: link source code (`gitSourceUrl`) và link gitops (`gitOpsUrl`). Cả hai optional, validate ở trust boundary, lưu trong cùng row Dexie `systems`, hiển thị trên form/detail/table theo chuẩn Ant Design TaskMate.

Purpose: Sếp cần truy ngay từ một System tới repo source và repo cấu hình mà không nhầm với `remoteRepoPath` (đường dẫn filesystem trên máy SSH dùng cho git command). Hai giá trị là metadata, không phải repo binding — nên dùng được cho cả parent lẫn subsystem.

Output: 2 field mới trên model/schema/backup/form/detail/table + unit test và UI test. Không thêm dependency, không thêm store/index Dexie, không bump version, không đụng file của session song song.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@/Users/tranducquan/Working/Personal/task-management/CLAUDE.md
@/Users/tranducquan/Working/Personal/task-management/.planning/STATE.md
@src/types/models.ts
@src/validation/schemas.ts
@src/validation/backupSchemas.ts
@src/db/repositories/systemRepo.ts
@src/components/systems/SystemModal.tsx
@src/components/systems/SystemTable.tsx
@src/views/SystemDetailView.tsx
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Data contract, validation và persistence cho 2 link git</name>
  <files>src/types/models.ts, src/validation/schemas.ts, src/validation/backupSchemas.ts, src/db/repositories/systemRepo.ts, tests/validation/systemGitUrls.test.ts, tests/services/backup/validateBackup.test.ts</files>
  <behavior>
    - isGitRepoUrl('https://github.com/acme/svc.git') === true; 'http://...' === true; 'ssh://git@host/acme/svc.git' === true; 'git://host/acme/svc.git' === true; 'git@github.com:acme/svc.git' === true
    - isGitRepoUrl('javascript:alert(1)') === false; 'data:text/html,...' === false; 'file:///srv/repo' === false; '/srv/repo' === false; chuỗi có khoảng trắng bên trong === false; chuỗi > 500 ký tự === false
    - SystemInputSchema / SystemUpdateSchema / BackupSystemRecordSchema chấp nhận gitSourceUrl + gitOpsUrl optional và reject URL độc hại
    - createSystem lưu cả 2; updateSystem đổi được từng field và xoá được bằng undefined/key present; row cũ không có field vẫn đọc được
    - LOGICAL_GROUP vẫn lưu được 2 link (metadata), nhưng vẫn bị chặn sshConfigId/remoteRepoPath/defaultBaseBranch như cũ
    - validateBackupPayload chấp nhận payload có 2 link, reject payload có javascript: ở systems, và vẫn chấp nhận payload systems cũ không có field
  </behavior>
  <action>
    Trong `src/types/models.ts`: thêm `gitSourceUrl?: string;` và `gitOpsUrl?: string;` vào `interface System`, ngay dưới `remoteRepoPath`, kèm comment ngắn: đây là URL để người dùng mở repo, KHÔNG phải `remoteRepoPath` (đường dẫn tuyệt đối trên SSH dùng bởi `runGitCommand`). Không đổi bất kỳ field cũ nào.

    Trong `src/validation/schemas.ts`: định nghĩa một rule duy nhất `isGitRepoUrl(value: unknown): boolean` (export alias `isValidGitRepoUrl`) với allowlist: trim rồi refuse rỗng, dài > 500, có whitespace bên trong; chấp nhận `^(https?|ssh|git):\/\/` rồi `new URL()` và yêu cầu `hostname` không rỗng; hoặc SCP syntax `^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+:[A-Za-z0-9._~/-]+$` cho `git@host:owner/repo.git`. Không dùng `linkSchema` cũ vì nó cho phép path/UUID. Mọi scheme khác (đặc biệt `javascript:`, `data:`, `file://`) tự động bị reject vì không nằm trong allowlist — không cần danh sách đen. Export `gitRepoUrlSchema = z.string().trim().refine(isGitRepoUrl, ...)`. Thêm `gitSourceUrl`/`gitOpsUrl` dạng `.optional()` vào cả `SystemInputSchema` và `SystemUpdateSchema`, và mở rộng đối tượng type của `refineSystemShape` để nhận 2 field; KHÔNG thêm chúng vào điều kiện cấm của LOGICAL_GROUP (link là metadata, khác SSH/repo binding).

    Trong `src/validation/backupSchemas.ts`: import `gitRepoUrlSchema` từ `./schemas` (file đã import module này sẵn), thêm 2 field optional vào `BackupSystemRecordSchema`. Không bump `BACKUP_SCHEMA_VERSION` (hiện 15): field optional, không đổi nghĩa dữ liệu cũ, đúng ghi chú ngay trên hằng số. Không thêm normalize trong `validateBackup.ts`.

    Trong `src/db/repositories/systemRepo.ts`: thêm 2 field vào `SystemShape`; copy chúng trong `createSystem` khi `validated.* !== undefined`; trong `updateSystem` xử lý theo đúng pattern hiện tại của `sshConfigId` (key có trong patch → set nếu truthy, else `delete`), áp dụng riêng cho từng link. Giữ nguyên `assertParentHasNoRepoFields` và danh sách `delete` lúc promote subsystem → LOGICAL_GROUP: không xoá 2 link mới.

    Test: tạo `tests/validation/systemGitUrls.test.ts` theo pattern `tests/validation/domainSchemas.test.ts` (Vitest thuần, không cần DB) covering mọi case trong `<behavior>`. Bổ sung tối thiểu vào `tests/services/backup/validateBackup.test.ts`: dùng `validPayload` có sẵn, thêm case systems row có 2 link hợp lệ → valid, case row có `javascript:` → invalid và error field nhắc `systems`, case row cũ không có field → vẫn valid. Không sửa fixture dùng chung theo cách làm hỏng test khác.

    Không tạo Dexie version mới: 2 field là row payload unindexed, Dexie lưu nguyên object nên DB V31 vẫn đọc/ghi được; giữ `LATEST_SCHEMA_VERSION = 31` và không đụng `src/db/schema.ts` / `src/db/index.ts` (tránh kéo theo các test pin version của session khác).
  </action>
  <verify>
    <automated>npx vitest run tests/validation/systemGitUrls.test.ts tests/services/backup/validateBackup.test.ts --bail=1</automated>
  </verify>
  <done>Tất cả case trong `<behavior>` pass; `npx tsc --noEmit` sạch cho các file đã đổi; backup v15 cũ vẫn validate; không file DB schema/index nào bị đổi.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: UI form, detail và table cho 2 link git</name>
  <files>src/components/systems/SystemModal.tsx, src/components/systems/SystemModal.test.tsx, src/components/systems/SystemTable.tsx, src/views/SystemDetailView.tsx</files>
  <behavior>
    - SystemModal sửa System đã có link thì ô Source hiển thị gitSourceUrl, ô GitOps hiển thị gitOpsUrl
    - Nhập javascript:/data:/đường dẫn local rồi bấm Lưu → không gọi onSave, hiện lỗi ngay tại ô đó
    - Bấm Lưu với 2 link hợp lệ → onSave nhận đúng 2 field đã trim; xoá sạch ô → payload gửi key với undefined để repo xoá field
    - LOGICAL_GROUP vẫn thấy và lưu được 2 ô link
    - Detail và table hiển thị Source/GitOps dạng link clickable (target="_blank" rel="noopener noreferrer"); khi trống hiện "—"
  </behavior>
  <action>
    Trong `src/components/systems/SystemModal.tsx`: thêm block "Link Git" riêng, render cho mọi type (không nằm trong `!isLogicalGroup`), đặt sau `description` và trước block SSH/Repository; dùng wrapper có sẵn `FormItem`, `Input` từ `../ui` và icon `LinkOutlined`/`GithubOutlined` từ `../ui/icon`, token CSS var như block hiện tại. Hai `FormItem` tên `gitSourceUrl` (label "Link Git Source Code") và `gitOpsUrl` (label "Link Git GitOps"), placeholder gợi ý `https://github.com/owner/repo.git` và `git@github.com:owner/repo.git`, rule `validator` gọi `isValidGitRepoUrl` từ `../../validation/schemas.ts`. Giữ nguyên group SSH/Repo và nhãn "Đường dẫn Repository trên máy chủ (Absolute path)" để không nhầm với 2 link mới. Trong `useEffect` seed cả 2 field từ `system`; trong `handleSubmit` đưa `gitSourceUrl: values.gitSourceUrl?.trim() || undefined` và tương tự cho gitOpsUrl vào `payload` ở mọi nhánh type (ngoài block `if (normalizedType !== LOGICAL_GROUP_TYPE)`). Không import dependency mới, không đổi `invariantFieldFor`.

    Trong `src/views/SystemDetailView.tsx`: thêm 2 item vào `overviewItems` (ngoài `...(isSubsystem(system) ? ... : [])` vì link có trên mọi System), label "Link Git Source" / "Link Git GitOps", render `Typography.Link` với `href`, `target="_blank"`, `rel="noopener noreferrer"` và text rút gọn (host + path hoặc URL đầy đủ); trống thì `<Text type="secondary">—</Text>`. Không đụng logic `gitTarget`, `gitTargetKey`, tab Git & Branches — chúng vẫn dùng `remoteRepoPath`.

    Trong `src/components/systems/SystemTable.tsx`: thêm 1 cột "Link Git" sau cột Remote Repository Path, render 2 link có nhãn "Source"/"GitOps" bằng `Typography.Link`, "—" khi cả hai trống. Giữ cột Remote Repository Path nguyên vẹn để phân biệt filesystem path.

    Trong `src/components/systems/SystemModal.test.tsx`: giữ 2 test cũ nguyên vẹn; thêm test seed+save 2 link (dùng placeholder mới để truy ô), test reject URL độc hại (assert `onSave` không được gọi và có text lỗi), test xoá link gửi undefined, và test LOGICAL_GROUP vẫn thấy 2 ô. Dùng pattern `fireEvent`/`waitFor` đã có trong file; không mock thêm module ngoài 2 mock hiện tại.
  </action>
  <verify>
    <automated>npx vitest run src/components/systems/SystemModal.test.tsx --bail=1</automated>
  </verify>
  <done>4 test mới pass, 2 test cũ pass; form hiển thị đúng nhãn Source/GitOps tách biệt khỏi SSH path; detail/table render link có target/rel an toàn.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| UI form → SystemModal payload | Người dùng nhập URL, sau đó đi vào Zod và DB |
| Backup import → validateBackupPayload | File backup ngoài app có thể chứa URL độc hại |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-gna-01 | Tampering / Injection | `isGitRepoUrl`, `gitRepoUrlSchema`, `isValidGitRepoUrl` | mitigate | Allowlist scheme https/http/ssh/git hoặc SCP `git@host:owner/repo.git`; reject `javascript:`, `data:`, `file://`, path tuyệt đối, whitespace, >500 ký tự. Dùng chung cho form và backup. |
| T-gna-02 | Information disclosure | `SystemTable`, `SystemDetailView` | mitigate | `target="_blank"` kèm `rel="noopener noreferrer"`; không render HTML từ URL, chỉ text. |
| T-gna-03 | Tampering | `validateBackupPayload` systems table | mitigate | `BackupSystemRecordSchema` dùng `gitRepoUrlSchema`; URL xấu làm validation fail trước khi restore ghi vào Dexie. |
| T-gna-04 | Denial of service | URL length | mitigate | Giới hạn 500 ký tự ở rule chung. |
| T-gna-SC | Tampering | package installs | accept | Không cài package nào; không có artifact `[ASSUMED]`/`[SUS]`/`[SLOP]` cần checkpoint. |
</threat_model>

<verification>
Chạy theo thứ tự, scoped — TUYỆT ĐỐI không chạy full vitest suite (>1 tiếng):

1. `npx vitest run tests/validation/systemGitUrls.test.ts tests/services/backup/validateBackup.test.ts src/components/systems/SystemModal.test.tsx --bail=1`
2. `npx tsc --noEmit`
3. `npx eslint src/types/models.ts src/validation/schemas.ts src/validation/backupSchemas.ts src/db/repositories/systemRepo.ts src/components/systems src/views/SystemDetailView.tsx` — fix mọi critical/warning do diff này sinh ra; không dùng rule mới để sửa code cũ ngoài phạm vi.
4. `git diff -- <10 file trong files_modified>` — review từng hunk: không đổi `remoteRepoPath`, không bump version, không đụng file bị cấm.
5. `npm run dev`, mở Systems tab và 1 subsystem, kiểm tra Chrome ở light + dark: 2 ô trong modal sửa có giá trị cũ, link click được trong detail/table, xoá link rồi Lưu → link biến mất sau reload. Đây là bước human-verify cuối trước khi báo hoàn tất.
6. Commit chỉ 10 file trong `files_modified`, kèm artifacts quick task này. Không fetch/push, không worktree/branch mới, không commit file của session khác (kiểm tra bằng `git status` trước khi add).
</verification>

<success_criteria>
- 2 field `gitSourceUrl`/`gitOpsUrl` optional có trên `System`, form, detail, table, backup schema và repo CRUD.
- Rule URL duy nhất, chặn scheme nguy hiểm, hỗ trợ HTTPS/SSH/git/SCP.
- Test scoped xanh, tsc và eslint scoped sạch, Chrome light/dark xác nhận.
- Zero thay đổi ở phạm vi bị cấm; zero dependency mới; zero schema version bump.
</success_criteria>

<output>
Tạo `.planning/quick/261128-gna-m-r-ng-schema-system-g-n-1-link-git/261128-gna-SUMMARY.md` khi thực hiện xong.
</output>
