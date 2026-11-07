---
phase: 31-organization-conventions-in-the-solution-pipeline
verified: 2026-11-07T09:48:00Z
status: human_needed
score: 6/6 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 5/6
  gaps_closed:
    - "Application build (tsc && vite build) succeeds cleanly with strict typechecking under exactOptionalPropertyTypes"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Mở Settings > Trợ lý AI & Ghost Dev > Quy ước tổ chức"
    expected: "Hiển thị card Quy ước tổ chức với textarea monospace, bộ đếm ký tự/dòng, nút xem trước Markdown và nút lưu hoạt động trơn tru"
    why_human: "Kiểm tra hiển thị giao diện Ant Design và trải nghiệm người dùng thực tế"
  - test: "Vào SDLC Hub > Chọn CR bất kỳ > Bước 1 Intake và Bước 2 Solution"
    expected: "Đầu trang hiển thị ConventionsSummaryCard với các tag Global và Repository, nút 'Xem chi tiết quy ước' mở modal 2 tab"
    why_human: "Kiểm tra render modal an toàn và layout trực quan trong SDLC Hub"
---

# Phase 31: Organization Conventions in the Solution Pipeline Verification Report

**Phase Goal:** Generated solutions follow the organization's real development standards: one global convention document lives in TaskMate, each repository contributes its own `CONVENTIONS.md` through fs-gw, both reach every SDLC solution prompt, and conflicts between them are surfaced instead of silently resolved.
**Verified:** 2026-11-07T09:48:00Z
**Status:** human_needed
**Re-verification:** Yes — after gap closure (TypeScript exactOptionalPropertyTypes resolution)

## Goal Achievement

### Observable Truths

| #   | Truth   | Status     | Evidence       |
| --- | ------- | ---------- | -------------- |
| 1   | User can create and edit one global convention document in Settings; it persists with canonical app data and survives reload and backup (SDLC-CONV-01) | ✓ VERIFIED | `conventionService.ts` (`GLOBAL_CONVENTIONS_SETTING_KEY`, `getGlobalConventions`, `saveGlobalConventions`), `GlobalConventionsCard.tsx` nhúng tại `SettingsView.tsx` tab AI; whitelist backup `isSafeBackupSetting` đã pass test. |
| 2   | A project bound to a repository reads that repository's `CONVENTIONS.md` through fs-gw/SSH; project without repository or without file still works with global document alone (SDLC-CONV-02) | ✓ VERIFIED | `loadRepoConventions` probe `CONVENTIONS.md`, `.github/CONVENTIONS.md`, `docs/CONVENTIONS.md`; trả về `null` an toàn khi không có file, không có binding hoặc lỗi SSH mà không throw lỗi. |
| 3   | Every SDLC solution/artifact turn carries both convention sources in composed prompt — global first, repository last — inside delimited untrusted data segment (SDLC-CONV-03) | ✓ VERIFIED | `buildConventionsSegment` bọc trong `[QUY ƯỚC TỔ CHỨC — DỮ LIỆU KHÔNG TIN CẬY]`, đặt sau `toolPolicy` và trước `fewShot`/`grounding`; global xếp trước repository; không bị cắt xén dung lượng. |
| 4   | When a global rule and repository rule conflict, AI names both sources and does not silently pick one; prompt states rule explicitly with witness test (SDLC-CONV-04) | ✓ VERIFIED | `CONVENTIONS_CONFLICT_POLICY` bắt buộc AI nêu rõ mâu thuẫn, trích dẫn cả 2 nguồn và dừng lại chờ người dùng; witness test trong `sdlcConventionsExemplar.test.ts` pass. |
| 5   | Intake step and Solution step show which conventions are in effect (global present/absent, repo present/absent, last-read time) before solution is generated (SDLC-CONV-05) | ✓ VERIFIED | `ConventionsSummaryCard.tsx` hiển thị trạng thái Global, Repo, path, timestamp nạp, nút refresh và nút xem chi tiết modal; nhúng tại đỉnh `Step1IntakeView.tsx` và `Step2SolutionView.tsx`. |
| 6   | Generated solution follows in-effect conventions observably — proven by exemplar test asserting mandated rules (ResponseEnvelope<T>, correlationId) appear in output (SDLC-CONV-06) | ✓ VERIFIED | `npm run build` (`tsc && vite build`) hoàn tất sạch sẽ 0 lỗi; 59 scoped vitest tests bao gồm exemplar test `ResponseEnvelope<T>` và witness test đều pass 100%. |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/services/conventionService.ts` | Global CRUD, candidate probe, SSH loader | ✓ VERIFIED | Đầy đủ exports: `GLOBAL_CONVENTIONS_SETTING_KEY`, `CONVENTION_CANDIDATE_PATHS`, `getGlobalConventions`, `saveGlobalConventions`, `loadRepoConventions`. |
| `src/components/settings/GlobalConventionsCard.tsx` | Settings Markdown editor card & preview | ✓ VERIFIED | 202 dòng. Monospace editor, char/line counter, Ctrl+S, preview modal, popconfirm clear. |
| `src/components/sdlc/common/ConventionsSummaryCard.tsx` | Status banner with tags, refresh & modal | ✓ VERIFIED | 159 dòng. Đã align type `| undefined` cho `exactOptionalPropertyTypes`. |
| `src/components/sdlc/common/ConventionsDetailModal.tsx` | Two-tab conventions viewer modal | ✓ VERIFIED | 122 dòng. Tab Global và Tab Repo với `renderSafeMarkdown` và Empty state. |
| `src/services/ai/sdlcPromptComposer.ts` | Layered prompt segment & conflict policy | ✓ VERIFIED | Đã align type `| undefined` cho `ComposeSdlcTurnInput.conventions`. |
| `tests/ai/sdlcConventionsExemplar.test.ts` | Exemplar and conflict witness test suite | ✓ VERIFIED | 179 dòng. Tất cả assertion đều pass và compile sạch sẽ. |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `GlobalConventionsCard.tsx` | `conventionService.ts` | `getGlobalConventions` / `saveGlobalConventions` | ✓ WIRED | Gọi trực tiếp khi nạp và lưu. |
| `SettingsView.tsx` | `GlobalConventionsCard.tsx` | `<GlobalConventionsCard db={db} />` | ✓ WIRED | Nhúng tại đầu tab `'ai'`. |
| `conventionService.ts` | `sshService.ts` | `execRemoteCommand` / `readRemoteFile` | ✓ WIRED | Probe shell script và nạp file từ host từ xa. |
| `ProjectSdlcView.tsx` | `conventionService.ts` | `getGlobalConventions` / `loadRepoConventions` | ✓ WIRED | State nạp và refresh trong view. |
| `ProjectSdlcView.tsx` | `SdlcWorkspace.tsx` | props `conventions` | ✓ WIRED | Truyền object conventions xuống workspace. |
| `SdlcWorkspace.tsx` | `StepChatPanel.tsx` | props `conventions` | ✓ WIRED | Truyền xuống panel chat. |
| `StepChatPanel.tsx` | `sdlcPromptComposer.ts` | `composeSdlcTurn({ ... conventions })` | ✓ WIRED | Mọi AI turn đều chứa conventions segment. |
| `Step1IntakeView.tsx` | `ConventionsSummaryCard.tsx` | `<ConventionsSummaryCard ... />` | ✓ WIRED | Đỉnh form Intake. |
| `Step2SolutionView.tsx` | `ConventionsSummaryCard.tsx` | `<ConventionsSummaryCard ... />` | ✓ WIRED | Đỉnh form Solution. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `GlobalConventionsCard` | `content` | Dexie `db.settings.get('global_conventions')` | Có dữ liệu người dùng lưu trong IndexedDB | ✓ FLOWING |
| `ConventionsSummaryCard` | `globalText`, `repoText` | `getGlobalConventions` + `loadRepoConventions` | Đọc thực tế từ IndexedDB và remote host qua SSH | ✓ FLOWING |
| `StepChatPanel` | `conventions` | State từ `ProjectSdlcView` | Đưa nội dung conventions thật vào AI system prompt | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| TypeScript Compiler Check | `npx tsc --noEmit` | Exit code 0, không có lỗi type | ✓ PASS |
| Full Production Build | `npm run build` (`tsc && vite build`) | Built dist hoàn tất thành công (109 precache entries) | ✓ PASS |
| Scoped Unit Tests | `npx vitest run tests/services/conventionService.test.ts tests/components/settings/GlobalConventionsCard.test.tsx tests/ai/sdlcPromptComposer.test.ts tests/ai/sdlcConventionsExemplar.test.ts tests/services/backup/exportBackup.test.ts` | 5 test files, 59 tests passed | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| SDLC-CONV-01 | 31-01 | Global convention in TaskMate Settings, local persistence, backup inclusion | ✓ SATISFIED | `conventionService.ts`, `GlobalConventionsCard.tsx`, backup whitelist test pass |
| SDLC-CONV-02 | 31-02 | Repository CONVENTIONS.md via SSH, graceful absence degradation | ✓ SATISFIED | `loadRepoConventions`, fallback candidates, unit test pass |
| SDLC-CONV-03 | 31-03 | Layered prompt segment (global first, repo last) in untrusted delimiters | ✓ SATISFIED | `buildConventionsSegment`, placement between tool policy and few-shot |
| SDLC-CONV-04 | 31-03 | Conflict policy surfaces both sources without silent choice | ✓ SATISFIED | `CONVENTIONS_CONFLICT_POLICY` and witness test pass |
| SDLC-CONV-05 | 31-03 | Intake and Solution status visibility (global/repo status, loadedAt, refresh) | ✓ SATISFIED | `ConventionsSummaryCard.tsx` in Step 1 and Step 2 views |
| SDLC-CONV-06 | 31-04 | Generated solutions follow conventions observably; exemplar test | ✓ SATISFIED | Build pass sạch, 59 scoped tests pass bao gồm exemplar `ResponseEnvelope<T>` |

### Anti-Patterns Found

None. Không có debt markers (`TBD`, `FIXME`, `XXX`), không có code placeholder stub.

### Human Verification Required

### 1. Trải nghiệm cấu hình Global Conventions
**Test:** Mở Settings > Tab Trợ lý AI & Ghost Dev > Thẻ Quy ước tổ chức. Thử nhập nội dung Markdown, nhấn "Xem trước Markdown", nhấn "Lưu quy ước tổ chức" hoặc bấm tổ hợp phím `Ctrl+S` / `Cmd+S`.
**Expected:** Dữ liệu lưu thành công, tag chuyển sang "Đã cấu hình", modal xem trước render Markdown chuẩn, reload trang dữ liệu vẫn còn nguyên.
**Why human:** Thao tác bàn phím, tương tác popconfirm và visual rendering của Ant Design cần người dùng kiểm tra.

### 2. Trực quan hóa Conventions trong SDLC Hub
**Test:** Mở một dự án trong SDLC Hub, chuyển qua Bước 1 Intake và Bước 2 Solution. Bấm "Xem chi tiết quy ước" và "Tải lại".
**Expected:** Banner `ConventionsSummaryCard` hiển thị rõ trạng thái Global và Repo. Bấm "Xem chi tiết quy ước" mở modal 2 tab hiển thị nội dung an toàn.
**Why human:** Đánh giá độ hài hòa giao diện và trải nghiệm chuyển bước.

### Gaps Summary

Tất cả gaps trước đây về kiểu dữ liệu (`exactOptionalPropertyTypes: true`) đã được khắc phục hoàn toàn trong commit `3c1bf2e3`:
- `ComposeSdlcTurnInput.conventions` và `ConventionsSummaryProps` đã bổ sung union `| undefined`.
- `npx tsc --noEmit` hoàn thành sạch sẽ 0 lỗi.
- `npm run build` (`tsc && vite build`) tạo bundle thành công.
- 59 scoped tests pass 100%.
- Toàn bộ 6/6 requirements SDLC-CONV-01..06 đều được thỏa mãn.

---

_Verified: 2026-11-07T09:48:00Z_
_Verifier: Claude (gsd-verifier)_
