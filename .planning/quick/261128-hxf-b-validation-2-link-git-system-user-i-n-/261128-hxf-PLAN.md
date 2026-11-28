---
phase: 261128-hxf
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/validation/schemas.ts
  - src/validation/backupSchemas.ts
  - src/utils/gitLink.ts
  - tests/validation/systemGitUrls.test.ts
  - tests/services/backup/validateBackup.test.ts
  - src/components/systems/SystemModal.tsx
  - src/components/systems/SystemModal.test.tsx
  - src/components/systems/SystemTable.tsx
  - src/components/systems/SystemTable.test.tsx
  - src/views/SystemDetailView.tsx
autonomous: true
requirements: []
user_setup: []
must_haves:
  truths:
    - "User điền gì vào gitSourceUrl/gitOpsUrl thì lưu nguyên chuỗi đó — kể cả khoảng trắng, javascript:, data:, file://, đường dẫn local, chuỗi >500 ký tự"
    - "Không còn validator/Zod refine/AntD rule nào chặn 2 field; ô rỗng '' vẫn clear field"
    - "Backup chấp nhận mọi string ở 2 field; payload cũ thiếu field vẫn restore được"
    - "Chỉ render <a> khi href an toàn (http/https/ssh/git hoặc SCP); mọi chuỗi khác render text thường, React escape, không dangerouslySetInnerHTML"
    - "System detail và table vẫn phân biệt nhãn Source/GitOps; link an toàn vẫn có target=_blank rel=noopener noreferrer"
    - "Zero thay đổi ngoài phạm vi GNA và artifact 261128-hxf; không dependency mới, không bump schema/version, không đụng STATE.md"
  artifacts:
    - path: src/validation/schemas.ts
      provides: "gitSourceUrl/gitOpsUrl là z.string().optional() — không trim, không refine; bỏ GIT_REPO_URL_MESSAGE/isGitRepoUrl/isValidGitRepoUrl/gitRepoUrlSchema"
    - path: src/validation/backupSchemas.ts
      provides: "BackupSystemRecordSchema chấp nhận mọi string ở 2 field, giữ schemaVersion 15"
    - path: src/utils/gitLink.ts
      provides: "shouldRenderGitLink(url) — predicate QUYẾT ĐỊNH HIỂN THỊ (không phải validator input); gitHref, gitLinkLabel giữ nguyên"
    - path: src/components/systems/SystemModal.tsx
      provides: "2 FormItem không còn rules; payload gửi nguyên value, '' → undefined để clear"
    - path: src/components/systems/SystemTable.tsx
      provides: "Cột Link Git: href an toàn → Link, ngược lại → Text thường"
    - path: src/views/SystemDetailView.tsx
      provides: "2 dòng Descriptions cùng nguyên tắc render an toàn"
    - path: tests/validation/systemGitUrls.test.ts
      provides: "Test lưu nguyên chuỗi lạ, schema chấp nhận mọi string, predicate render đúng allowlist"
    - path: tests/services/backup/validateBackup.test.ts
      provides: "Test backup chấp nhận mọi string, vẫn chấp nhận payload cũ"
  key_links:
    - from: "src/components/systems/SystemTable.tsx, src/views/SystemDetailView.tsx"
      to: "src/utils/gitLink.ts#shouldRenderGitLink"
      via: "import predicate, quyết định Link hay Text trước khi đặt href"
      pattern: "shouldRenderGitLink"
    - from: "src/validation/backupSchemas.ts"
      to: "src/validation/schemas.ts#gitLinkStringSchema"
      via: "field schema z.string() thay cho gitRepoUrlSchema cũ"
      pattern: "gitLinkStringSchema"
---

<objective>
Bỏ hoàn toàn validation trên 2 link git của System (`gitSourceUrl`, `gitOpsUrl`): user điền gì lưu đúng đó. Giữ an toàn ở khâu HIỂN THỊ — chỉ dựng href clickable cho chuỗi có dạng link an toàn; chuỗi khác hiện dạng text thường do React escape.

Purpose: Sau 261128-gna, rule allowlist chặn cả nội dung user muốn ghi (whitespace, scheme lạ, đường dẫn nội bộ). Sếp muốn 2 field này là dữ liệu tự do; rủi ro thực sự nằm ở `href`, không phải ở giá trị lưu. Tách riêng hai trách nhiệm: storage chấp nhận mọi string, render tự quyết định.

Output: Schema/form/backup không còn chặn; helper `shouldRenderGitLink` ở `src/utils/gitLink.ts`; table/detail render text cho href không an toàn; test cập nhật theo hành vi mới.

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@/Users/tranducquan/Working/Personal/task-management/CLAUDE.md
@/Users/tranducquan/Working/Personal/task-management/.planning/STATE.md
@/Users/tranducquan/Working/Personal/task-management/.planning/quick/261128-gna-m-r-ng-schema-system-g-n-1-link-git/261128-gna-SUMMARY.md
@src/validation/schemas.ts
@src/validation/backupSchemas.ts
@src/utils/gitLink.ts
@src/components/systems/SystemModal.tsx
@src/components/systems/SystemTable.tsx
@src/views/SystemDetailView.tsx
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Schema lưu nguyên chuỗi + predicate quyết định render</name>
  <files>src/validation/schemas.ts, src/validation/backupSchemas.ts, src/utils/gitLink.ts, tests/validation/systemGitUrls.test.ts, tests/services/backup/validateBackup.test.ts</files>
  <behavior>
    - gitLinkStringSchema.safeParse(anyString).success === true cho: 'javascript:alert(1)', 'data:text/html,<script>', 'file:///srv/repo', '/srv/repo', 'C:\\srv\\repo', 'https://user:pass@host/x', 'https://evil.com\\@github.com/x', 'a'.repeat(501), '   ', '\t\n', ''
    - SystemInputSchema/SystemUpdateSchema giữ nguyên whitespace: parse({gitSourceUrl:'  abc  '}).gitSourceUrl === '  abc  '
    - BackupSystemRecordSchema chấp nhận mọi string ở 2 field; payload cũ thiếu field vẫn valid; validateBackupPayload không reject vì nội dung link
    - createSystem/updateSystem lưu nguyên '  weird value  ' và '' (rỗng → clear field), đổi từ Test 1 của GNA sang kỳ vọng mới
    - shouldRenderGitLink('https://github.com/a/b.git'), http/ssh/git, 'git@host:owner/repo.git' → true
    - shouldRenderGitLink('javascript:...'), 'data:...', 'file:///...', '/srv/repo', 'C:\\...', chuỗi có khoảng trắng, userinfo/backslash, '' → false
  </behavior>
  <action>
    Trong `src/validation/schemas.ts`: XOÁ `GIT_REPO_URL_MESSAGE`, `isGitRepoUrl`, `isValidGitRepoUrl`, `gitRepoUrlSchema` (và comment đi kèm). Thay bằng `export const gitLinkStringSchema = z.string();` — KHÔNG trim, KHÔNG refine, KHÔNG max length. Đổi field `gitSourceUrl`/`gitOpsUrl` trong `SystemInputSchema`, `SystemUpdateSchema` và kiểu tham số của `refineSystemShape` sang `gitLinkStringSchema.optional()` / `string | undefined`. Giữ nguyên type của `refineSystemShape` ở dạng `string | undefined` (vẫn KHÔNG đưa 2 field vào điều kiện cấm LOGICAL_GROUP). Giữ mọi schema khác nguyên vẹn, đặc biệt `linkSchema` (dùng cho quick link CR/task) và `remoteRepoPathSchema`.

    Trong `src/validation/backupSchemas.ts`: đổi import `gitRepoUrlSchema` → `gitLinkStringSchema`; đổi 2 field trong `BackupSystemRecordSchema` sang `gitLinkStringSchema.optional()`. Giữ `BACKUP_SCHEMA_VERSION` nguyên 15 — không normalize, không sửa `validateBackup.ts`.

    Trong `src/utils/gitLink.ts`: giữ nguyên `gitLinkLabel` và `gitHref`; thêm `export function shouldRenderGitLink(url: string): boolean`. Đây là PREDICATE HIỂN THỊ, không phải validator input: trim biến locally rồi từ chối rỗng/khoảng trắng bên trong/backslash; chấp nhận SCP `^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+:[A-Za-z0-9._~/-]+$`; hoặc `new URL(value)` với protocol nằm trong `http:`/`https:`/`ssh:`/`git:`, hostname không rỗng, không username/password. Mọi scheme khác tự động false — không cần blacklist. Không giới hạn độ dài (chuỗi dài thì hiện text, không gây lỗi). Comment ngắn ở hàm: "render safety only — input storage accepts any string". Không import zod vào file này.

    Trong `tests/validation/systemGitUrls.test.ts`: thay toàn bộ describe cũ bằng 3 describe mới — (a) `gitLinkStringSchema` + System schemas chấp nhận mọi string kể trên và giữ nguyên khoảng trắng; (b) `shouldRenderGitLink` đúng allowlist ở `<behavior>`; (c) persistence qua `createSystem`/`updateSystem` lưu nguyên chuỗi lạ và xoá bằng `''`. Giữ `fake-indexeddb` setup/teardown nguyên vẹn. Giữ test LOGICAL_GROUP nhận link nhưng vẫn chặn `remoteRepoPath`. Không đổi tên file.

    Trong `tests/services/backup/validateBackup.test.ts`: trong block 'System git links — trust boundary backup', đổi case 'rejects a dangerous git link' thành 'accepts any string on a system row' — dùng `it.each` với `javascript:alert(1)`, `data:text/html,<script>`, `file:///srv/repo`, `'   '`, `'a'.repeat(501)`; assert `result.valid === true` và giá trị đọc lại từ `result.envelope.tables.systems[0]` đúng bằng input. Giữ 2 case cũ (link hợp lệ, payload legacy thiếu field).

    KHÔNG sửa `src/db/repositories/systemRepo.ts`: logic `!== undefined` lúc create và `if (validated.x) ... else delete` lúc update đã lưu nguyên chuỗi lạ và xoá được bằng `''`.
  </action>
  <verify>
    <automated>npx vitest run tests/validation/systemGitUrls.test.ts tests/services/backup/validateBackup.test.ts --bail=1</automated>
  </verify>
  <done>Mọi case trong `<behavior>` pass. `grep -rn 'isGitRepoUrl\|isValidGitRepoUrl\|gitRepoUrlSchema\|GIT_REPO_URL_MESSAGE' src tests` trả về 0 kết quả (không import sót). Không đụng `src/db/schema.ts`, `src/db/index.ts`, `validateBackup.ts`, `BACKUP_SCHEMA_VERSION`.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Form không validate + render an toàn trên detail/table</name>
  <files>src/components/systems/SystemModal.tsx, src/components/systems/SystemModal.test.tsx, src/components/systems/SystemTable.tsx, src/components/systems/SystemTable.test.tsx, src/views/SystemDetailView.tsx</files>
  <behavior>
    - SystemModal: nhập 'javascript:alert(1)', '  weird  ', '   ', 'a'.repeat(501) rồi Lưu → onSave nhận đúng chuỗi đó; không có text lỗi inline; LOGICAL_GROUP vẫn thấy 2 ô
    - Xoá sạch ô → payload gửi `gitSourceUrl: undefined` / `gitOpsUrl: undefined` để repo clear field
    - SystemTable: URL an toàn vẫn là link có href đúng (SCP → HTTPS), target/rel an toàn; `javascript:` / `data:` / `file://` / path local / chuỗi có khoảng trắng hiện dạng text thường, `queryByRole('link')` cho giá trị đó trả về null
    - SystemDetailView: cùng nguyên tắc — an toàn → Typography.Link, không an toàn → Text, vẫn có nhãn 'Link Git Source' / 'Link Git GitOps'
  </behavior>
  <action>
    Trong `src/components/systems/SystemModal.tsx`: bỏ import `GIT_REPO_URL_MESSAGE, isValidGitRepoUrl` (xóa hẳn dòng import đó). Giữ nguyên block 'Link Git', 2 `FormItem` tên `gitSourceUrl`/`gitOpsUrl`, nhãn và placeholder cũ; XOÁ hoàn toàn mảng `rules={[...]}` của cả 2 ô. Trong `handleSubmit`, đổi `gitSourceUrl: values.gitSourceUrl?.trim() || undefined` → `gitSourceUrl: values.gitSourceUrl || undefined` và tương tự cho `gitOpsUrl` — lưu nguyên, chỉ `''` thành undefined. Giữ `useEffect` seed `system.gitSourceUrl || undefined` nguyên vẹn. Không đụng block SSH/Repo, `invariantFieldFor`, type option logic.

    Trong `src/components/systems/SystemModal.test.tsx`: thay test reject cũ (`it.each([...badUrls])`) bằng test xác nhận mỗi bad URL ĐƯỢC lưu nguyên — assert `onSave` gọi với đúng giá trị và `queryByText(/Link git phải là/) === null`. Đổi test 'seeds both git links ... saves trimmed values' thành 'saves values verbatim': nhập `'  https://github.com/acme/web.git  '` và `'  git@github.com:acme/web-gitops.git  '` rồi assert payload giữ nguyên khoảng trắng. Giữ test clear → undefined và test LOGICAL_GROUP (chỉ đổi kỳ vọng nếu cần). Giữ 2 test cũ đầu file nguyên vẹn.

    Trong `src/components/systems/SystemTable.tsx`: import thêm `shouldRenderGitLink` từ `../../utils/gitLink`. Với mỗi field, thay nhánh `<Link href={gitHref(...)}>` bằng điều kiện: `shouldRenderGitLink(value)` ? `<Link href={gitHref(value)} target="_blank" rel="noopener noreferrer" ellipsis>...` : `<Text type="secondary" ...>{value}</Text>`. Giữ nhãn `Source:` / `GitOps:`, giữ "—" khi cả 2 field rỗng, giữ cột Remote Repository Path nguyên vẹn. TUYỆT ĐỐI không dùng `dangerouslySetInnerHTML`.

    Trong `src/views/SystemDetailView.tsx`: import `shouldRenderGitLink`; áp đúng cùng điều kiện cho 2 item `gitSourceUrl`/`gitOpsUrl` trong `overviewItems`. Nhánh an toàn giữ `Typography.Link` + target/rel + `gitLinkLabel`; nhánh không an toàn render `<Text>{value}</Text>` (text thường, React tự escape). Giữ label, giữ logic `gitTarget`/tab Git & Branches, không đụng `remoteRepoPath`.

    Trong `src/components/systems/SystemTable.test.tsx`: giữ test cũ nguyên vẹn; thêm `it.each` với `javascript:alert(1)`, `data:text/html,<script>`, `file:///srv/repo`, `/srv/repo`, `'two words'`, `'  spaced  '` — render bảng với record có `gitSourceUrl` = giá trị đó, assert `screen.queryByRole('link')` là null và `screen.getByText(value)` hiện text. Dùng helper render có tham số record mới (không sửa fixture dùng chung theo cách làm hỏng test cũ).
  </action>
  <verify>
    <automated>npx vitest run src/components/systems/SystemModal.test.tsx src/components/systems/SystemTable.test.tsx --bail=1</automated>
  </verify>
  <done>Tất cả test mới pass, test cũ pass. Không còn rule validator nào trên 2 ô. Không có `<a>`/Typography.Link nào nhận href từ chuỗi không an toàn. eslint scoped sạch.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| UI form → System payload | User nhập tự do; chuỗi đi thẳng vào Dexie, không bị chặn |
| Backup import → validateBackupPayload | File ngoài app chứa string bất kỳ ở 2 field |
| Stored string → DOM (table/detail) | Nơi duy nhất cần guard: quyết định có tạo `href` hay không |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-hxf-01 | Injection (XSS via href) | `src/utils/gitLink.ts#shouldRenderGitLink` + `SystemTable`, `SystemDetailView` | mitigate | Chỉ tạo `<a>` cho `http:`/`https:`/`ssh:`/`git:` có hostname và không userinfo/backslash, hoặc SCP `git@host:owner/repo.git`; mọi chuỗi khác render `<Text>` do React escape; không `dangerouslySetInnerHTML`. |
| T-hxf-02 | Tampering | `gitLinkStringSchema` trong `SystemInputSchema`/`SystemUpdateSchema`/`BackupSystemRecordSchema` | accept | Chấp nhận mọi string là ý định sếp; chuỗi là dữ liệu inert, không thực thi ở storage. Rủi ro chuyển sang T-hxf-01 và được chặn tại render. |
| T-hxf-03 | Information disclosure | href `target="_blank"` | mitigate | Giữ `rel="noopener noreferrer"` trên mọi link an toàn. |
| T-hxf-SC | Tampering | package installs | accept | Không cài package nào; không có artifact `[ASSUMED]`/`[SUS]`/`[SLOP]` cần checkpoint. |
</threat_model>

<verification>
Chạy scoped, TUYỆT ĐỐI không chạy full vitest suite (>1 tiếng):

1. `npx vitest run tests/validation/systemGitUrls.test.ts tests/services/backup/validateBackup.test.ts src/components/systems/SystemModal.test.tsx src/components/systems/SystemTable.test.tsx --bail=1`
2. `npx tsc --noEmit` — chỉ xử lý lỗi do diff này sinh ra (lỗi `PlusOutlined` trong `TasksView.tsx` là của session song song, không đụng).
3. `npx eslint src/validation/schemas.ts src/validation/backupSchemas.ts src/utils/gitLink.ts src/components/systems/SystemModal.tsx src/components/systems/SystemTable.tsx src/views/SystemDetailView.tsx tests/validation/systemGitUrls.test.ts tests/services/backup/validateBackup.test.ts`
4. `grep -rn 'isValidGitRepoUrl\|gitRepoUrlSchema\|GIT_REPO_URL_MESSAGE' src tests` — phải trả về 0 import sót.
5. `git diff -- <10 file trong files_modified>` — review từng hunk: không đụng tasklist/workbench/splash, STATE.md, artifact 261128-fqs/fvp; không dependency/schema bump.
6. Nếu executor làm UI: `npm run dev`, mở Systems tab + 1 subsystem, verify Chrome light/dark — điền `javascript:alert(1)` và `'  abc  '` vào 2 ô, Lưu, reload: giá trị hiện nguyên trong ô; detail/table hiện text thường cho giá trị độc hại, link an toàn vẫn click được.
7. Commit chỉ file trong `files_modified` + artifact 261128-hxf; kiểm tra `git status` trước khi add. Không fetch/push, không branch/worktree mới.
</verification>

<success_criteria>
- 2 field là string tự do ở mọi trust boundary; zero validator/refine/rule còn sót.
- `shouldRenderGitLink` là predicate render duy nhất; unsafe value không bao giờ thành href.
- Scoped tests xanh, tsc/eslint sạch, Chrome light/dark xác nhận nếu có đổi UI.
- Zero file ngoài phạm vi, zero dependency, zero schema version bump.
</success_criteria>

<output>
Tạo `.planning/quick/261128-hxf-b-validation-2-link-git-system-user-i-n-/261128-hxf-SUMMARY.md` khi thực hiện xong.
</output>
