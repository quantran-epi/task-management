# Quick 261128-hxf Summary: Bỏ validation 2 link git System

## One-liner

`gitSourceUrl`/`gitOpsUrl` giờ là string tự do ở form, schema và backup; an toàn được quyết định duy nhất lúc render qua `shouldRenderGitLink`, unsafe value hiện dạng text do React escape.

## Tasks

| Task | Name | Commit | Status |
|------|------|--------|--------|
| 1 | Schema lưu nguyên chuỗi + predicate quyết định render | `0acb75c8` | complete |
| 2 | Form không validate + render an toàn trên detail/table | `d46c5bdd` | complete |
| 3 | Review fixes: label spoof, trim href/label, SSH git user | `af1c18c5` | complete |

## Files modified

- `src/validation/schemas.ts` — xóa `GIT_REPO_URL_MESSAGE`/`isGitRepoUrl`/`isValidGitRepoUrl`/`gitRepoUrlSchema`; thêm `gitLinkStringSchema = z.string()`; dùng cho 2 field trong `SystemInputSchema`/`SystemUpdateSchema`. `linkSchema`, `remoteRepoPathSchema`, LOGICAL_GROUP refine giữ nguyên.
- `src/validation/backupSchemas.ts` — `BackupSystemRecordSchema` dùng `gitLinkStringSchema.optional()`; `BACKUP_SCHEMA_VERSION` vẫn 15.
- `src/utils/gitLink.ts` — thêm `shouldRenderGitLink(url)` — predicate render, trim locally, allowlist `http:`/`https:`/`ssh:`/`git:` (hostname, không userinfo/backslash/fragment-spoof; riêng `ssh://git@host` được phép) hoặc SCP; `gitHref`/`gitLinkLabel` cũng trim locally để href/label không hỏng khi giá trị lưu có whitespace.
- `src/components/systems/SystemModal.tsx` — bỏ import validator + 2 mảng `rules`; payload gửi nguyên giá trị, `''` → `undefined`.
- `src/components/systems/SystemTable.tsx` — cột Link Git quyết định Link hay Text qua predicate; giữ nhãn Source/GitOps, target/rel, cột Remote Repository Path.
- `src/views/SystemDetailView.tsx` — 2 dòng Descriptions cùng nguyên tắc; giữ nhãn `Link Git Source`/`Link Git GitOps`, `gitTarget` và tab Git & Branches.
- `tests/validation/systemGitUrls.test.ts` — 3 describe mới: schema chấp nhận mọi string, predicate allowlist, persistence lưu nguyên/xóa bằng `''`.
- `tests/services/backup/validateBackup.test.ts` — case backup đổi từ reject sang accepts any string; giữ case link hợp lệ và payload legacy.
- `src/components/systems/SystemModal.test.tsx` — test lưu nguyên chuỗi lạ, đổi kỳ vọng trim → verbatim, giữ test clear → undefined và LOGICAL_GROUP.
- `src/components/systems/SystemTable.test.tsx` — helper render có tham số record; thêm `it.each` 6 giá trị unsafe → text, không có link.

## Verification

- `npx vitest run tests/validation/systemGitUrls.test.ts tests/services/backup/validateBackup.test.ts src/components/systems/SystemModal.test.tsx src/components/systems/SystemTable.test.tsx --bail=1` — **4 files, 102 tests passed** sau review fix `af1c18c5` (95 trước fix).
- RED gate Task 1: test fail vì `gitLinkStringSchema` chưa tồn tại; RED gate Task 2: test fail vì rule validator chặn save. GREEN sau implementation đều pass.
- `npx tsc --noEmit` — exit 0, không lỗi.
- `npx eslint` scoped 8 file — exit 0, zero errors/warnings. (Kể cả 2 file test; khi chạy thêm 2 file test ngoài config thì ESLint chỉ báo "File ignored" — không phải lỗi do diff.)
- `grep -rn 'isGitRepoUrl\|isValidGitRepoUrl\|gitRepoUrlSchema\|GIT_REPO_URL_MESSAGE' src tests` — zero kết quả.
- Chrome thật (non-headless, Vite dev `127.0.0.1:5183`, light + dark):
  - Nhập `javascript:alert(1)` vào Source và `'  abc  '` vào GitOps, Lưu, reload: ô edit giữ nguyên chuỗi (`javascript:alert(1)`, `  abc  `); không alert/dialog nào bắn ra.
  - Catalog table light/dark: `td` chứa `Source: javascript:alert(1)GitOps:   abc  ` dạng text; `queryByRole('link')` tương đương — chỉ 2 link an toàn của parent có href đúng, `target="_blank"`, `rel="noopener noreferrer"`.
  - Detail light/dark: `Link Git Source  javascript:alert(1)`, `Link Git GitOps  abc` — text thường, zero `<a>` cho giá trị unsafe; parent vẫn có 2 link clickable.
  - Không chạy full vitest suite (quy tắc dự án: >1 tiếng).

## Decisions

- Storage và render tách trách nhiệm: schema/form/backup chấp nhận mọi string; `shouldRenderGitLink` là predicate render duy nhất.
- Predicate trim biến locally nên `'  https://host/x  '` vẫn được phép click; khoảng trắng BÊN TRONG value (`'two words'`) → text. Đây là hành vi theo đúng mô tả plan.
- Không đưa userinfo/backslash vào href; SCP `git@host:owner/repo.git` vẫn được rewrite sang HTTPS bởi `gitHref`.
- Không đổi `BACKUP_SCHEMA_VERSION`, không migration, không dependency mới.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test] Predicate trim + kỳ vọng test**
- **Found during:** Task 1
- **Issue:** Test ban đầu kỳ vọng `'  https://github.com/a/b.git  '` → `false`, nhưng plan quy định predicate trim locally rồi quyết định, nên giá trị này đúng phải `true`.
- **Fix:** Bỏ case đó khỏi danh sách unsafe; giữ `'two words'` làm case khoảng trắng bên trong.
- **Files modified:** `tests/validation/systemGitUrls.test.ts`
- **Commit:** `0acb75c8`

**2. [Rule 1 - Test] Testing Library normalize whitespace**
- **Found during:** Task 2
- **Issue:** `getByText('  spaced  ')` normalize khoảng trắng nên không khớp; matcher tùy biến lại khớp cả wrapper element.
- **Fix:** Assert trực tiếp `textContent` của ô `Link Git` trong hàng tương ứng — giữ nguyên khoảng trắng thô và vẫn assert `queryByRole('link') === null`.
- **Files modified:** `src/components/systems/SystemTable.test.tsx`
- **Commit:** `d46c5bdd`

**3. [Review fix] Label spoof / trim / SSH git user**
- **Found during:** independent code review after Task 2
- **Issue:** `https://evil.com#@github.com/x` lọt predicate nhưng label hiện `github.com/x`; SCP có whitespace cho href relative; `ssh://git@host` bị chặn regression.
- **Fix:** reject `@` trong query/fragment, trim trong `gitHref`/`gitLinkLabel`, cho phép riêng user `git` trên `ssh://`; thêm test href host khớp label.
- **Commit:** `af1c18c5`

Không có thay đổi kiến trúc, không auth gate.

## Stub tracking

None.

## Threat flags

None — T-hxf-01/02/03/SC đã implement đúng threat register; không bề mặt bảo mật mới ngoài plan.

## Constraint compliance

- Cùng working tree `pre-v1.6-baseline`, không branch/worktree/fetch/push mới.
- Chỉ đụng đúng 10 file trong `files_modified` + artifact `261128-hxf`; không đụng STATE.md, fqs/fvp/gna, splash/sketch, tasklist/workbench artifacts. Các file dirty khác của session song song được giữ nguyên, không stage.
- `git add` từng file; `git diff --cached --name-only` kiểm tra trước mỗi commit — không có file ngoài phạm vi.
- Commit message kết thúc bằng `Co-Authored-By: Claude Code <noreply@anthropic.com>`.
- SUMMARY/PLAN/STATE artifacts không commit.

## Duration

~13 phút (2026-11-28 05:58Z → 06:11Z).
