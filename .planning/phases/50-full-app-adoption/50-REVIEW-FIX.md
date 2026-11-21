---
phase: 50-full-app-adoption
fixed_at: 2026-11-21T15:48:57Z
review_path: .planning/phases/50-full-app-adoption/50-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 50: Code Review Fix Report

**Fixed at:** 2026-11-21T15:48:57Z
**Source review:** .planning/phases/50-full-app-adoption/50-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 6 (fix_scope: all — gồm 4 Warning + 2 Info)
- Fixed: 6
- Skipped: 0

## Fixed Issues

### WR-01: Wrapper `Form` ghi đè `layout` của caller — form GitHub Sync chuyển từ inline sang vertical

**Files modified:** `src/components/ui/form.tsx`, `src/components/ui/__tests__/controls.test.tsx`
**Commit:** `b010b733`
**Status:** fixed
**Applied fix:** Giữ `labelPolicy` làm nguồn layout mặc định nhưng để `rest.layout` từ caller thắng (`layout={rest.layout ?? policyLayout}`), tôn trọng `labelPolicy` hiện có. Thêm regression test cho cả policy default lẫn caller override; probe xác nhận 6/6 case (gồm `<Form layout="inline">` của GitHubSyncCard) đúng.

### WR-02: `useGlobalKeymap` bắt closure `notify` trong effect có deps rỗng

**Files modified:** `src/workbench/hooks/useGlobalKeymap.ts`, `src/workbench/__tests__/useGlobalKeymap.test.tsx`
**Commit:** `89bf0e9c`
**Status:** fixed
**Applied fix:** Dùng `notifyRef` (useRef) cập nhật mỗi render; listener gọi `notifyRef.current` thay vì closure cũ. Thêm test stale-closure với `useMessage` bị mock trả instance mới sau re-render — test FAIL trên hook cũ, PASS trên hook mới. Sửa assertion `search.everywhere` để khớp chữ ký 2 đối số và làm rõ intent.

### WR-03: Codemod bỏ sót static `Modal` — có thể sinh mã crash khi chạy lại

**Files modified:** `scripts/adoption-codemod.mjs`, `tests/scripts/adoption-codemod.test.mjs`
**Commit:** `0074645a`
**Status:** fixed
**Applied fix:** Thêm `'Modal'` vào `STATIC_APIS`. Probe codemod với input `import { Modal, message } from 'antd'` + `Modal.confirm()` giờ cảnh báo `static API Modal, message needs manual hook conversion` và giữ import trên `'antd'` (không rewrite sang barrel). Thêm regression test — FAIL trên codemod cũ, PASS trên codemod mới.

### WR-04: Guard `inlineStyleSweep` dùng regex sai — không chặn được literal `gap` số

**Files modified:** `src/components/ui/__tests__/inlineStyleSweep.test.ts`, `src/styles/tokens.ts`, + 149 file wave (`tests/fixtures/adoption/wave-*.txt`) chứa literal `gap`
**Commit:** `97eecb57` (dọn file scratch rác: `c06465bd`)
**Status:** fixed
**Applied fix:** Thay `/\bgap:\s*[diagram]\b/i` bằng `/\bgap:\s*\d+\b/`. Probe xác nhận `gap: 8` → true, `gap: d` → false, `gap: var(...)` → false. Regex đúng phơi bày 594 literal `gap: N` trong 149 file (guard cũ vành vì pattern sai); chuyển từng cái sang CSS var `--gap-N` định nghĩat trong `src/styles/tokens.ts` với **giá trị chính xác 1:1** (1/2/3/4/5/6/7/8/10/12/14/16/24px) — không đổi spacing, tránh regression thị giác. Thêm regression test locking hành vi regex. `git checkout --` đã dùng để rollback an toàn 2 lần chuyển đổi thử nghiệm (normalize sai) trước khi chọn ánh xạ exact-value.

### IN-01: Directive `eslint-disable react-hooks/exhaustive-deps` dư sau migration

**Files modified:** `src/components/changeRequests/ChangeRequestModal.tsx`, `src/components/notes/NormalizeDocModal.tsx`, `src/workbench/toolwindows/RemoteGitExplorer.tsx`, `src/workbench/search/find/FindInRemoteFiles.tsx`, `src/services/ai/browserFileReader.ts`, `src/services/diagramSaveBridge.ts`
**Commit:** `309bda5f`
**Status:** fixed
**Applied fix:** Xóa 4 directive `exhaustive-deps` dư theo Finding, plus 2 directive `no-control-regex` dư — cả 6 là đúng nhóm "6 warning Unused eslint-disable directive" mà Issue của IN-01 nêu. `npm run lint` giờ sạch 0 warning (trước: 6).

### IN-02: Helper trong `documentLinks` có noop default — mất feedback/confirm im lặng nếu caller quên truyền

**Files modified:** `src/utils/documentLinks.tsx`, `tests/utils/documentLinks.test.ts`
**Commit:** `0def5e17`
**Status:** fixed
**Applied fix:** Bỏ `noopNotify`/`noopConfirm`, bắt buộc `notify`/`confirm` ở type level cho `openLocalPathInExplorer`, `launchClaudeAtLocalPath`, `promptLocalPathAction`, `openDocumentLink`, `browseLocalFolder`, `browseLocalFile` — lộ ra lúc compile thay vì treo/dialog vô hình lúc runtime. Cập nhật mọi caller test truyền callback explicit; đổi test "prompts modal confirm" sang assert inject `confirm`. Mọi caller source đã truyền đủ callback sẵn (không cần đổi).

---

## Verification

Chạy lại đầy đủ theo yêu cầu sếp — tất cả PASS:

| Check | Kết quả |
|-------|---------|
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | exit 0 — 0 warning (trước 6) |
| `npm run test:foundation` | 14 files / 86 tests passed |
| `npm run build` | ✓ built in 1.62s |
| `npx vitest run src/components/ui/__tests__/inlineStyleSweep.test.ts staticApiGuard.test.ts` | 2 files / 5 tests passed |

Probe bổ sung:
- WR-04: `gap: 8` → match, `gap: d` → không match (pattern cũ đã bị thay).
- WR-03: `import { Modal, message } from 'antd'` + `Modal.confirm()` → warning cho cả `Modal` lẫn `message`.

Regression test mới (WR-01, WR-02, WR-03, WR-04) đều được kiểm chứng FAIL trên code cũ / PASS trên code mới.

---

_Fixed: 2026-11-21T15:48:57Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
