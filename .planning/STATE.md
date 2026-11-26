---
gsd_state_version: "1.0"
milestone: v1.5
milestone_name: Design System & UI Consistency
current_phase: 51
current_phase_name: taskmate-chat-standalone
status: complete
stopped_at: Phase 51 complete
last_updated: "2026-11-26T09:04:48.382Z"
last_activity: 2026-11-26
last_activity_desc: "Completed quick task 261126-cff: add Windows-only workflow for both NSIS installers"
state_head: 31928a99569833fd4b01516623a9c7d777518df2
progress:
  total_phases: 2
  completed_phases: 2
  total_plans: 18
  completed_plans: 18
  percent: 100
---

# Project State: TaskMate — Milestone v1.5

See: .planning/PROJECT.md (updated 2026-11-21)

**Core value:** Một bộ design system TaskMate duy nhất, IntelliJ-only, light+dark, mọi control AntD đều wrap và có thể thay đổi tại một điểm.
**Current focus:** Phase 51 — TaskMate Chat standalone

## Current Position

Phase: 51 (TaskMate Chat standalone) — COMPLETE
Plan: 4 of 4
Status: Phase 51 complete — goal đạt được sau quick fix `261126-1kz`, `261126-1od`, `261126-1q1`; final gate xanh (64 tests, tsc, Tauri build + hdiutil VALID). T16 human UAT cài 2 app cùng tồn tại là checkpoint thủ công; artifact sẵn sàng.
Last activity: 2026-11-26 - Completed quick task 261126-diw: Full-width AI settings Modal, remove self-approve and analysis toggle, always-analysis chat.

## Session Continuity: Phase 28 replan (isolated worktree, 2026-11-17)

- Phase 28 re-scoped from 4 to 5 plans in this isolated worktree (`gsd/phase-28-isolated`) after plan-checker findings and the user's supreme goal: zero-local-docs query-only `retrieve_knowledge` must work end to end on the live AI surfaces (AI Chat and Telegram), not be reduced to server-only work.
- Replan removed all deleted Phase 35-06 SDLC/wizard file references, wired the all-unknown explicit-`setIds` DEGRADED outcome (C2), fixed 28-04 wave/dependency (W1), reduced 28-02 to 10 files (W2), completed `28-VALIDATION.md` sign-off (W3), and added absolute non-regression for `groundedTurn` / `knowledgeRetrievalTool` / `aiOrchestratorLoop` / Telegram with focused regression tests.
- SDLC-RET-01..05 remain historical tooling IDs (REQUIREMENTS.md no longer lists them) mapped to live query-only retrieval outcomes; no SDLC code is resurrected.
- Work here is isolated; phase 44 planning advances independently on `feature/intellij-workbench` and is not touched by this replan.
- Phase 28 execution completed 2026-11-17 on `gsd/phase-28-isolated`: 5/5 plans, verifier passed 6/6 must-haves with zero gaps, security SECURED 21/21, code review clean after WR-01/02/03 fixes. Live Docker/Neo4j walkthrough was not run; user accepted mock-based automated contract evidence as recorded in `28-VALIDATION.md`.

## Phase 42 Review Outcome

All findings from rounds 1–3 and the continuation re-check are fixed and independently
re-verified against real git behaviour:

- CR-01 parent/leaf symlink escape — `realpath -e` on both repo root and target with a
  literal directory-boundary check before `cat`.

- WR-01 missing literal glob returned empty success — `git cat-file -p --end-of-options`.
- WR-02 probe conflated infrastructure failure with "untracked" — only exit 1 falls back.
- CR-04 repository `core.fsmonitor` hook ran on read commands — disabled explicitly.
- WR-03 handler trimmed legitimate filename whitespace — `filePath` kept verbatim.
- WR-04 `diff_file` expanded a filename as a pathspec glob — `--literal-pathspecs`.

Verification: 392 focused tests pass (9 files), `tsc --noEmit` clean. Full suite not run
(project rule: over an hour). Phase verification has not been run yet.

## Session Continuity

Last session: 2026-11-25T15:47:32.730Z
Stopped at: Phase 51 context gathered
Resume file: .planning/phases/51-taskmate-chat-standalone-b-n-c-i-tauri-ri-ng-m-th-ng-ai-chat/51-CONTEXT.md

Progress: [██████████] 100%

## Preserved Context — feature/intellij-workbench (phase 45 line)

- Last session on `feature/intellij-workbench`: 2026-11-19T04:54:50.290Z; stopped at Phase 45 UI-SPEC approved; resume file `.planning/phases/45-knowledge-sets-docs-workspace-oracle-connections-team-pinned/45-UI-SPEC.md`.
- Phase 45 (Knowledge Sets, Docs Workspace, Oracle Connections & Team Pinned Context) was READY TO EXECUTE with 4 plans on that line; all Oracle multi-connection profile work (T-45-03/T-45-06) is present in this tree after merge.
- Phase 44 quick tasks and 261117-ss8 instrumentation remain in the quick-tasks table below.

## Milestone v1.4 Map

- [x] Phase 35: Shared-primitive extraction + SDLC behavior removal
- [x] Phase 36: Data model, multi-chat identity, backup/migration
- [ ] Phase 37: Runtime reliability + concurrency
- [ ] Phase 37.1: Live steering — leader amends assignments, steers running agents (INSERTED)
- [x] Phase 38: Hard token budget + accurate measurement
- [x] Phase 39: Skill versioning + enrichment approval
- [ ] Phase 40: Explorer UX, CRUD correctness, observed walkthrough
- [ ] Phase 41: AI Office team docs zones — per-team folder tree, agent-scoped doc write (INSERTED)
- [ ] Phase 42: Read-only git inspection for the reviewer agent (INSERTED)
- [x] Phase 43: Repo reading that scales — grep, paged read, remote headless exploration (INSERTED)

## Quick Tasks Completed

| # | Description | Date | Commit | Status | Directory |
|--------|-------------|------|--------|--------|-----------|
| 261111-c35 | Fix WR-05 + WR-10 data-safety warnings from phase 36 review | 2026-11-11 | 505e780d |  | [261111-c35-fix-wr-05-wr-10-data-safety-warnings-fro](./quick/261111-c35-fix-wr-05-wr-10-data-safety-warnings-fro/) |
| 261111-d2p | Close remaining phase-36 review findings: WR-07/08/09/11/12 and IN-01..IN-04/06/07/08, record WR-13 in ROADMAP phase 38 | 2026-11-11 | 89186433 |  | [261111-d2p-close-phase-36-review-findings-part-two](./quick/261111-d2p-close-phase-36-review-findings-part-two/) |
| 261113-ita | Fix team notification focus, unread viewport and missing-leader warning | 2026-11-13 | e8ce7e4f |  | [261113-ita-fix-confirmed-team-chat-focus-unread-and](./quick/261113-ita-fix-confirmed-team-chat-focus-unread-and/) |
| 261113-ko9 | Restore last-read chat position, viewport read receipts, collapse plans and expose leader budget wait | 2026-11-13 | fa96058b |  | [261113-ko9-open-team-chat-at-latest-messages-and-co](./quick/261113-ko9-open-team-chat-at-latest-messages-and-co/) |
| 261114-pxi | Add knowledge research tools (retrieve_knowledge, get_document_details) to the AI Office allowlist | 2026-11-14 | ced06e08 |  | [261114-pxi-add-retrieve-knowledge-and-get-document-](./quick/261114-pxi-add-retrieve-knowledge-and-get-document-/) |
| 261114-qjh | Redesign the team chat transcript: hover actions, one meta row, user-only receipts, day dividers, grouped messages, compact sidebar | 2026-11-14 | d7b5c68c |  | [261114-qjh-redesign-team-chat-transcript-ui](./quick/261114-qjh-redesign-team-chat-transcript-ui/) |
| 261114-r2m | Fix team-chat bubble borders (all four sides, border-box, inset lead accent) and grouped-row alignment | 2026-11-14 | 80c961dc |  | — |
| 261114-r2n | Space team-chat rows by author (4px same block, 20px across authors) and label plan/synthesis rows | 2026-11-14 | eb788b72 |  | — |
| 261115-q4n | Fix 3 UAT-41 defects: lead prompt write_doc fact, send() ordering + MCP timeout, ensureDocsReady error visibility | 2026-11-15 | e8557959 |  | [261115-q4n-fix-3-uat-41-defects-lead-prompt-write-d](./quick/261115-q4n-fix-3-uat-41-defects-lead-prompt-write-d/) |
| 261116-e62 | AI mutation tools for Systems: create_system, update_system, delete_system | 2026-11-16 | 469deb2b |  | .planning/quick/261116-e62-ai-mutation-tools-for-systems-add-create-system-update-syste |
| 261116-e63 | AI tools for Mermaid diagrams: query_diagrams, create_diagram, update_diagram | 2026-11-16 | 4fff0a59 |  | .planning/quick/261116-e63-ai-tools-for-mermaid-diagrams-add-query-diagrams-read-create |
| 261116-e64 | Configurable system type list backed by settings | 2026-11-16 | bfad78fb |  | .planning/quick/261116-e64-configurable-system-type-list-systemtype-is-a-hardcoded-unio |
| 261116-fyi | Restore Docs parity in IntelliJ workbench: document sets drawer (publish + graph build), ZIP import, folder ZIP export | 2026-11-16 | c0858407 |  | [261116-fyi-bring-docs-explorer-features-missing-fro](./quick/261116-fyi-bring-docs-explorer-features-missing-fro/) |
| 261117-ss8 | Thêm instrumentation/báo cáo lỗi đầy đủ cho mọi run agent/leader: mỗi tool call (explore_repo, write_doc, v.v.) phải ghi log có timestamp, source abort (user stop / batch deadline / dispose / turn end), tool name, duration, error code/detail, outcome; áp dụng cho mọi thể loại run agent/leader. Ghi nhận UAT abort 31fc8015. | 2026-11-17 | 76d5b87d |  | [261117-ss8-th-m-instrumentation-b-o-c-o-l-i-y-cho-m](./quick/261117-ss8-th-m-instrumentation-b-o-c-o-l-i-y-cho-m/) |
| 261117-tpk | Tổ chức lại màn hình Settings TaskMate thành các nhóm chức năng rõ ràng (UI arrangement only, zero config/behavior change) | 2026-11-17 | 3378d2f6 |  | [261117-tpk-t-ch-c-l-i-m-n-h-nh-settings-taskmate-th](./quick/261117-tpk-t-ch-c-l-i-m-n-h-nh-settings-taskmate-th/) |
| 261118-c0y | Settings > AI card liệt kê mọi AI tool kèm description, definition JSON schema và nơi dùng (built-in, team, MCP, Graphiti) | 2026-11-18 | 755f6b9f |  | [261118-c0y-add-a-settings-ai-card-that-lists-all-av](./quick/261118-c0y-add-a-settings-ai-card-that-lists-all-av/) |
| 261118-cz2 | Bỏ local filesystem read khỏi AI flow; rename SSH tools; enable SSH/Oracle tool per team chat; gate payload theo enablement | 2026-11-18 | 742f3981 |  | [261118-cz2-remove-local-filesystem-reads-from-ai-to](./quick/261118-cz2-remove-local-filesystem-reads-from-ai-to/) |
| 261118-epj | Fix macOS Tauri build: borrow NotificationResponse in notify-rust wait_for_response click handler | 2026-11-18 | b65dd32d |  | [261118-epj-fix-macos-tauri-build-failure-notify-rus](./quick/261118-epj-fix-macos-tauri-build-failure-notify-rus/) |
| 261119-s1j | Chuyển toàn bộ tính năng của DocumentSetDrawer sang tab bộ tài liệu và xóa drawer | 2026-11-19 | fa9d58af |  | [261119-s1j-chuy-n-to-n-b-t-nh-n-ng-c-a-documentsetd](./quick/261119-s1j-chuy-n-to-n-b-t-nh-n-ng-c-a-documentsetd/) |
| 261119-tai | Rút gọn Profile Setting: bỏ ô secret read-only, sửa field JSON `[object Object]`, gom nhóm Collapse | 2026-11-19 | 552d174d |  | [261119-tai-r-t-g-n-profile-setting-ch-gi-field-setu](./quick/261119-tai-r-t-g-n-profile-setting-ch-gi-field-setu/) |
| 261119-u7u | Đưa quản lý bộ tài liệu vào tab chuyên dụng, bỏ khối Không gian Docs trong Docs Explorer | 2026-11-19 | 77eb077c |  | [261119-u7u-rework-docs-explorer-remove-compact-kh-n](./quick/261119-u7u-rework-docs-explorer-remove-compact-kh-n/) |
| 261120-f8v | Cập nhật CLAUDE.md: project này discuss bằng tiếng Việt. Bổ sung tính năng: khi mở tab file view, cho phép show file tương ứng trên Explorer SSH remote. | 2026-11-20 | be19854a |  | [261120-f8v-c-p-nh-t-claude-md-project-n-y-discuss-b](./quick/261120-f8v-c-p-nh-t-claude-md-project-n-y-discuss-b/) |
| 261120-vcb | Fix 46.1 Find dialog and Remote Git Explorer: tree target reset + chain walk, drop global Ctrl+Shift+F with in-panel button, seed label, Vietnamese scope tabs, single-pane preview scroll, syntax colors | 2026-11-20 | 7940b164 |  | [261120-vcb-fix-46-1-find-dialog-and-remote-explorer](./quick/261120-vcb-fix-46-1-find-dialog-and-remote-explorer/) |
| 261120-x4x | Icon hệ thống theo type trong SystemsExplorer qua nguồn chung (đã bỏ phần compact tree AgentDiffReviewer vì ghost dev retired) | 2026-11-21 | 86bffc8a |  | [261120-x4x-compact-tree-styling-for-agentdiffreview](./quick/261120-x4x-compact-tree-styling-for-agentdiffreview/) |
| 261120-gdq | Fix all 8 code-review findings from quick 261120-f8v: cross-branch reveal no-op, folder search result reveal hidden by results panel, Tauri draft handoff uses global emit instead of emitTo ai-popout, duplicate remote tree fetches during reveal, result cap consumed by ancestor folders, over-permissive looksLikeCodeLine causing prose misrender, browser popout handle recovery, global search full tree fetch every keystroke. | 2026-11-20 | 09277995 |  | [261120-gdq-fix-all-8-code-review-findings-from-quic](./quick/261120-gdq-fix-all-8-code-review-findings-from-quic/) |
| 261120-ha7 | Tăng timeout mặc định settlePollDeadlineMs trong teamRunCoordinator.ts từ 120s lên 30 phút để explore_repo 20-40 turn không bị ép dừng nhầm; giữ cơ chế chống kẹt | 2026-11-20 | 2082d27c |  | [261120-ha7-t-ng-timeout-m-c-nh-settlepolldeadlinems](./quick/261120-ha7-t-ng-timeout-m-c-nh-settlepolldeadlinems/) |
| 261121-0ix | Tạo bản draft HTML tương tác cho Agent Developer workbench: tree SSH worktree, multi-tab file viewer, diff approve/reject, popout sync team chat | 2026-11-21 | 2b7b4319 |  | [261121-0ix-t-o-b-n-draft-html-t-ng-t-c-cho-agent-de](./quick/261121-0ix-t-o-b-n-draft-html-t-ng-t-c-cho-agent-de/) |
| 261121-eck | Markdown Viewer trong Tool Explorer + fix search overflow + icon polish | 2026-11-21 | 635cba8e |  | [261121-eck-trong-tool-explorer-th-m-markdown-viewer](./quick/261121-eck-trong-tool-explorer-th-m-markdown-viewer/) |
| 261121-ev5 | AI assistant inline cho 4 utility editor (JSON, XML, Text Compare, Markdown) với 2 chế độ sửa/hỏi và model riêng từng tool | 2026-11-21 | a268db51 |  | [261121-ev5-ai-assistant-cho-utility-tool-editors](./quick/261121-ev5-ai-assistant-cho-utility-tool-editors/) |
| 261121-foz | Line number mọi pane + fold JSON/XML + giữ nội dung khi đổi tab + Save as (download/Docs) cho utility editor | 2026-11-21 | 66c69839 |  | [261121-foz-line-number-v-collapse-expand-cho-utilit](./quick/261121-foz-line-number-v-collapse-expand-cho-utilit/) |
| 261121-hza | Sửa seen receipt cho lead reply xếp hàng, bỏ nhãn untrusted cho lệnh hiện tại, prompt ủy thác code_edit cho Agent Developer | 2026-11-21 | e1b0c0ba |  | [261121-hza-fix-ai-team-seen-receipts-untrusted-inst](./quick/261121-hza-fix-ai-team-seen-receipts-untrusted-inst/) |
| 261121-qpp | Resolve Agent Developer worktree repo từ system link trực tiếp hoặc CR targets; nhiều ứng viên thì lead hỏi tên hệ thống | 2026-11-21 | f5efc9be |  | [261121-qpp-resolve-agent-developer-worktree-repo-fr](./quick/261121-qpp-resolve-agent-developer-worktree-repo-fr/) |
| 261121-r78 | Hiện lỗi local (worktree/config/SSH) thật trong bubble agent; lỗi provider vẫn sanitized | 2026-11-21 | 1d7bd676 |  | [261121-r78-show-truthful-local-errors-instead-of-ge](./quick/261121-r78-show-truthful-local-errors-instead-of-ge/) |
| 261122-ut7 | Verify and fix 4 code-review findings in TS team/AI workspace | 2026-11-22 | 40e04955, d3aeef22 |  | [261122-ut7-verify-and-fix-4-code-review-findings-in](./quick/261122-ut7-verify-and-fix-4-code-review-findings-in/) |
| 261122-ut4 | Verify three Rust tool-cancellation review findings | 2026-11-22 | b8def166, ab0f0882, 79fe6f95 |  | [261122-ut4-verify-three-rust-tool-cancellation-revi](./quick/261122-ut4-verify-three-rust-tool-cancellation-revi/) |
| 261122-w9j | Mở rộng Tool Explorer với 8 tool dev (encoder, regex, timestamp, date, text, cron, hash/UUID, JWT), AI context-aware, fix review findings | 2026-11-22 | 7234ce4b, 89b072f9, 9b216486, 1fbed59e |  | [261122-w9j-developer-utility-tools-expansion](./quick/261122-w9j-developer-utility-tools-expansion/) |
| 261123-et1 | Draft team chat theo conversation, pin/global convention thành trusted instruction, fixes diagnostics/SQLcl | 2026-11-23 | cf04a416, 4d4be556, 85020d1f, 81378439, 7ddb93e7 |  | [261123-et1-s-a-ai-chat-team-l-u-draft-tin-nh-n-theo](./quick/261123-et1-s-a-ai-chat-team-l-u-draft-tin-nh-n-theo/) |
| 261124-r35 | Sửa 6 lỗi UI: doc editor 2 panel full height, select multiple overflow, dashboard forecast cards, tab Profile taskbar, primary button color, icon Tool Explorer | 2026-11-24 | 5eb2811c, 91298caa, 414d86b7, f1f443d8, 89de9eae |  | [261124-r35-s-a-3-l-i-ui-doc-editor-2-panel-editable](./quick/261124-r35-s-a-3-l-i-ui-doc-editor-2-panel-editable/) |
| 261124-sav | Refactor màn hình bộ tài liệu theo 3 sketch winner: rail+inspector, virtual scroll+filter dính, inline progress+flat picker; tách hash khỏi full note scan | 2026-11-24 | 57c58272 | Needs Review | [261124-sav-refactor-m-n-h-nh-b-t-i-li-u-theo-3-sket](./quick/261124-sav-refactor-m-n-h-nh-b-t-i-li-u-theo-3-sket/) |
| 261124-u84 | Strip dòng TASKMATE_PGID khỏi stdout trong exec_remote, fix lỗi "Không xác thực được worktree remote" | 2026-11-24 | pending | Verified | [261124-u84-fix-rust-ssh-worktree-provision-strip-d-](./quick/261124-u84-fix-rust-ssh-worktree-provision-strip-d-/) |
| 261124-udx | Sửa layout doc-set bị vỡ khi center workbench hẹp: rail co 248→160px, ResizeObserver đăng ký lại khi set có sẵn, inspector ẩn khi hẹp | 2026-11-24 | a6ae8ca5, d3401afd | Verified | [261124-udx-s-a-layout-doc-set-b-v-khi-center-workbe](./quick/261124-udx-s-a-layout-doc-set-b-v-khi-center-workbe/) |
| 261124-uuo | Picker chọn hệ thống worktree trong Coding Zone khi có nhiều ứng viên; override runtime-only, giữ chat fallback | 2026-11-24 | pending | Verified | [261124-uuo-add-worktree-system-picker-chip-in-codin](./quick/261124-uuo-add-worktree-system-picker-chip-in-codin/) |
| 261124-vps | Rà/sửa dark theme toàn app: giữ palette 49-UI-SPEC, token hoá control hardcode, thêm biến diff, audit Chrome từng màn hình | 2026-11-24 | pending | Verified | [261124-vps-r-so-t-dark-theme-gi-palette-49-ui-spec-](./quick/261124-vps-r-so-t-dark-theme-gi-palette-49-ui-spec-/) |
| 261125-dax | Hide Database Explorer feature from UI (keep code and data intact) | 2026-11-25 | 7aa15859 | Verified | [261125-dax-hide-database-explorer-feature-from-ui-k](./quick/261125-dax-hide-database-explorer-feature-from-ui-k/) |
| 261125-dqj | Bỏ tool code_edit của Agent Developer trong AI chat team; developer chỉ sinh code + tính năng gen file cho user download. | 2026-11-25 | 831cbc5c | — | [261125-dqj-b-tool-code-edit-c-a-agent-developer-tro](./quick/261125-dqj-b-tool-code-edit-c-a-agent-developer-tro/) |
| 261125-ffm | Fix CR detail screen task table: system dropdown options currently show only system code; show readable system name alongside code. | 2026-11-25 | bd3a1a60 | complete | [261125-ffm-fix-cr-detail-screen-task-table-system-d](./quick/261125-ffm-fix-cr-detail-screen-task-table-system-d/) |
| 261125-g51 | Tool Explorer utility tools only: allow multiple independent tabs per tool and rename those tabs | 2026-11-25 | fa4ef59c | — | [261125-g51-tool-explorer-utility-tools-only-allow-m](./quick/261125-g51-tool-explorer-utility-tools-only-allow-m/) |
| 261125-k8o | Fix màn hình Bộ tài liệu: đưa danh sách doc lên đầu, bỏ nested scroll, dùng full-height virtual list + inspector 260px, giữ testid/hành vi cũ; test Chrome thật | 2026-11-25 | 39221b84, f3c31fd5 | Verified | [261125-k8o-fix-m-n-h-nh-b-t-i-li-u](./quick/261125-k8o-fix-m-n-h-nh-b-t-i-li-u/) |
| 261125-qdr | Refactor màn hình "Cấu hình cho người khác" theo sketch 005C + 006B: rail nhiều profile, editor 4 tab, panel rà soát/preview export | 2026-11-25 | 6ddc55ab, 921bdc3a | Verified | [261125-qdr-refactor-configprofilesview-theo-sketch-](./quick/261125-qdr-refactor-configprofilesview-theo-sketch-/) |
| 261125-r95 | Thêm block/tab "Ghi chú" vào màn hình chi tiết CR dùng EntityNotesSection entityType="cr" entityId={cr.id} | 2026-11-25 | 1102c665, 295d467e, 8984ac34 | — | [261125-r95-th-m-block-tab-ghi-ch-v-o-m-n-h-nh-chi-t](./quick/261125-r95-th-m-block-tab-ghi-ch-v-o-m-n-h-nh-chi-t/) |
| 261125-s92 | Thêm tính năng ghi chú nhanh qua stripe phải, panel tạo note và search entity để gắn note | 2026-11-25 | 6117c556, 86cabf1c, d01d180e, 7ca26e15 | — | [261125-s92-th-m-t-nh-n-ng-ghi-ch-nhanh-trigger-b-ng](./quick/261125-s92-th-m-t-nh-n-ng-ghi-ch-nhanh-trigger-b-ng/) |
| 261125-rwu | Fix AI chat panel và team dùng trọn 2 MCP Graphiti/SQL: sửa tên tool source, allowlist JS/Rust, prompt và discovery | 2026-11-25 | 7a6447f2, cfdb5038, da6bdb63, 106d6fea | Needs UAT | [261125-rwu-fix-ai-chat-panel-v-team-with-2-graphiti](./quick/261125-rwu-fix-ai-chat-panel-v-team-with-2-graphiti/) |
| 261125-t5q | Chỉnh giao diện ghi chú nhanh: list dưới chỉ quick note, hiện entity đang linked + tiêu đề + 2 dòng nội dung mờ, bỏ box scroll, thêm filter theo entity đã link | 2026-11-25 | 893bf414 | — | [261125-t5q-ch-nh-giao-di-n-ghi-ch-nhanh-strip-b-n-p](./quick/261125-t5q-ch-nh-giao-di-n-ghi-ch-nhanh-strip-b-n-p/) |
| 261125-svm | Dynamic MCP tool list cho mọi AI surface: advertise mọi tool server, auto reload theo turn, 2 server ngầm luôn bật, mutation vẫn chặn | 2026-11-25 | d0943604, d1a49648, a096fb87 | Needs UAT | [261125-svm-dynamic-mcp-tool-list-cho-m-i-ai-surface](./quick/261125-svm-dynamic-mcp-tool-list-cho-m-i-ai-surface/) |
| 261125-tp9 | Select thực thể trong panel ghi chú nhanh chỉ hiện option đúng loại Segmented, clear entity khi đổi loại | 2026-11-25 | b391bd11, 25f3c54f | — | [261125-tp9-khi-switch-segmented-ch-n-lo-i-th-c-th-g](./quick/261125-tp9-khi-switch-segmented-ch-n-lo-i-th-c-th-g/) |
| 261125-ulp | Ẩn toàn bộ trigger và cấu hình Ghost Dev khỏi UI (TaskDrawer, TaskTable, Settings, Config Profiles), giữ code/data/runtime | 2026-11-25 | d71cd62a | — | [261125-ulp-n-ho-n-to-n-m-i-c-u-h-nh-v-trigger-li-n-](./quick/261125-ulp-n-ho-n-to-n-m-i-c-u-h-nh-v-trigger-li-n-/) |
| 261125-u4w | Fix pin context team đọc fresh từ roster mỗi turn và global conventions trên grounded turn của AI Chat panel | 2026-11-25 | f8caef68, 0058409f, 2f431183, 180c3f21 | Needs UAT | [261125-u4w-fix-stale-pin-context-and-grounded-globa](./quick/261125-u4w-fix-stale-pin-context-and-grounded-globa/) |
| 261126-cff | Add a GitHub Actions workflow that builds both TaskMate and TaskMate Chat Windows NSIS installers; skip macOS/iOS builds. | 2026-11-26 | 7b757828 | — | [261126-cff-add-a-github-actions-workflow-that-build](./quick/261126-cff-add-a-github-actions-workflow-that-build/) |
| 59 | Add ui-task-insight-toolbar and pre-v1.6-baseline to Windows installer workflow push triggers. | 2026-11-26 | ae3cfd3c | — | — |
| 261126-cid | Refactor CR detail + task list theo sketch A; fix mọi critical/warning | 2026-11-26 | 5b21c2e8 | Verified | [261126-cid-refactor-changerequestdetailview-theo-sk](./quick/261126-cid-refactor-changerequestdetailview-theo-sk/) |
| 261126-diw | Fix AI chat window: convert settings drawer to full-width modal, remove auto-approve button (chat is Q&A only, no TaskMate data mutation) | 2026-11-26 | 5bd75c29 | — | [261126-diw-fix-ai-chat-window-convert-settings-draw](./quick/261126-diw-fix-ai-chat-window-convert-settings-draw/) |
| 261126-m1v | CR detail page: move right-side sections below table so table is full width; add task filtering in CR detail page. | 2026-11-26 | 31928a99 | — | [261126-m1v-cr-detail-page-move-right-side-sections-](./quick/261126-m1v-cr-detail-page-move-right-side-sections-/) |

## Accumulated Context

### Roadmap Evolution

- Phase 37.1 inserted after Phase 37 (URGENT): Live steering — leader amends assignments and steers running agents mid-run. Scope deferred from 37-CONTEXT.md D-19: outbox+inbox agent, drain at `beforeToolRound`, `amend_assignments` tool, leader re-plan mid-batch, steer UI.
- Phase 41 added (2026-11-15): AI Office team docs zones — per-team docs folder tree, agent-scoped document write. Owner decision: every member writes docs; visible immediately; leader writes the approved final at team root.
- Phase 42 added (2026-11-15): Read-only git inspection for the reviewer agent. Owner decision: reviewer reads git read-only over SSH. Scope narrowed 2026-11-15 — the recursive linked-item read half was cut (sticky notes already arrive full-body via `get_item_details`; `read_file` already covers linked files; note attachments are image-only so the text branch was dead code). See `42-CONTEXT.md` §Deferred Ideas.
- Phase 44 added (2026-11-17): Agent Activity Panel, Configurable Explore Timeout and Prompt Log. Owner decision: all three pieces ship in one phase, reviewed to zero critical/warning; push once to `feature/intellij-workbench` after verification. UI reference: `.planning/agent-activity-panel-draft.html`.
- Phase 45 added (2026-11-19): Knowledge Sets, Docs Workspace, Oracle Connections & Team Pinned Context. Owner decisions: one UI+infra phase; server set management in Settings > Knowledge Daemon; dedicated Docs page with app tabs; Oracle named multi-connection by environment with active default; team pinned context injected every turn with badge + tooltip. Debug root cause for orphan sets recorded in `.planning/debug/knowledge-server-orphan-sets.md`.
- Phase 46 added (2026-11-19): Configuration Profiles. Owner decisions: named profiles authored independently of the current app settings; all setting types covered; export one profile to JSON; normal Settings screen imports that profile; secrets are blank in export with post-import re-entry prompts; machine-specific paths/hosts are preserved but flagged for review; clean AI-team defaults template carries no ids/members/usage/folders. Work isolated in a dedicated worktree/branch so Phase 45 is unaffected.

- Phase 34 marked complete with zero tests covering the AI Office runtime and five live defects (hung batch run, unguarded double-submit, phantom active turn, `targetAgentId` stripped on restore, bare deletes breaking export). "Phase 34 complete" is not evidence of quality.
- Research verdict: keep and harden the existing coordinator/budget gate; zero new npm dependencies.
- Phase 35 completed under fresh-data-only scope: SDLC schema modules removed, no legacy compatibility requirement. Targeted tests/typecheck/build passed; exact copy, legacy-layout walkthrough, and existing unrelated selector test recorded as non-blocking debt.
- Seven surviving modules import SDLC code on the hot path — extraction must precede deletion.
- Phase 46.1 inserted after Phase 46: Unified remote file search, compact remote tree, and shared workbench visual tokens from the approved draft (URGENT)
- Phase 46.1 edited: edited title, goal, requirements, success criteria
- Phase 48 added (2026-11-21): Agent Developer Workbench — SSH worktree coding zone, popout, hunk review. UI source of truth: `.planning/quick/261121-0ix-t-o-b-n-draft-html-t-ng-t-c-cho-agent-de/agent-developer-workbench-draft.html`. agent developer edits only inside its allocated SSH remote worktree; user reviews/merges outside.
- Phase 51 added (2026-11-25): TaskMate Chat standalone — bản cài Tauri riêng, mở thẳng AI chat full-window, không task UI/context. Full AI settings trong drawer side-nav 7 nhóm; giữ knowledge server/MCP/Graphiti/Oracle/SSH. UI decisions: sketch 007 winner A (chat full-bleed + gear) + 008 winner C (side nav + accordion).

## Decisions

- [Phase 37.1]: D-24: `delegate_batch` returns an ack `{dispatched,batchId,status,agents[]}`; settled results reach the lead only through the synthesis turn opened by `onBatchSettled`
- [Phase 37.1]: Agent cancellation is owned by a per-batch `AbortController`; the leader tool-call signal is never wired to an agent
- [Phase 37.1]: The `kind:'unfinished'` tail travels in the synthesis prompt (`KẾT QUẢ CỦA LÔ`), not in the tool result
- [Phase 37.1]: `usageTotals` is keyed per TURN (`usageBaselineKey`), so the dispatch turn's tokens survive the synthesis turn
- [Phase ?]: D-01: Global conventions stored in Dexie settings under global_conventions key
- [Phase ?]: D-02: GlobalConventionsCard embedded inside SDLC / AI tab of SettingsView
- [Phase ?]: D-03: Setting key complies with isSafeBackupSetting whitelist, included in encrypted backups
- [Phase ?]: D-04: Empty state returns empty string without generating default/fabricated text
- [Phase 31]: D-09: Conventions segment placed between toolPolicy and fewShot layers inside untrusted delimiters
- [Phase 31]: D-10: Global conventions precede repository conventions in prompt segment
- [Phase 31]: D-11: Mandatory CONVENTIONS_CONFLICT_POLICY requires AI to cite both sources and stop for user resolution
- [Phase 31]: D-12: Entire convention document retained without character caps or truncation
- [Phase 31]: D-13: ConventionsSummaryCard renders on Step 1 and Step 2 with manual refresh and detail modal
- [Phase 31]: D-14: ResponseEnvelope<T> and correlationId mandate verified in SOLUTION prompt without user prompt mention
- [Phase 31]: D-15: Conflict witness test confirms both sources and CONVENTIONS_CONFLICT_POLICY are surfaced cleanly
- [Phase 31.1]: D-16: systems table added in Dexie SCHEMA_V15; projects table migrated to changeRequests with backward-compatibility for tasks
- [Phase 31.1]: D-17: 3 explicit CR types with designated colors: New Feature (#1677ff), Enhancement (#52c41a), Bugfix (#faad14)
- [Phase 31.1]: D-18: Subsystems own SSH profiles and repository paths; CRs multi-target subsystems
- [Phase 31.1]: D-19: Systems Explorer accessed via Left Stripe (Alt+6) and Search Everywhere; TitleBar kept uncluttered
- [Phase 31.1]: D-20: ChangeRequestTable exhibits 3 CR type badges (#1677ff, #52c41a, #faad14) and cyan subsystem chips
- [Phase 31.1]: D-21: ProjectExplorer displays CR nodes with type icons and target system pills, preserving task/milestone tree
- [Phase 31.1]: D-22: loadMultiRepoConventions aggregates CONVENTIONS.md across all target subsystems of CR, layered with system code headers
- [Phase 31.1]: D-23: SDLC Studio Step 3 dynamically provides Subsystem Switcher to inspect diffs and branches across multi-system CRs
- [Phase 31.2]: D-24: systems table holds both LOGICAL_GROUP and deployable types; parent has no ssh/repo/branch, subsystem binds exactly one remote repo
- [Phase 31.2]: D-25: changeRequests stores targets: CrTarget[] ({ systemId, featureBranch? }) instead of targetSystemIds; only deployable subsystems allowed; featureBranch defaults to feature/{cr.code} and is stored explicitly, baseBranch stays on the subsystem
- [Phase 31.2]: D-26: Task.crId required, Task.systemId optional and must belong to cr.targets
- [Phase 31.2]: D-27: projects and milestones tables removed from Dexie; test data reset allowed, no shadow aliases
- [Phase 31.2]: D-28: SDLC workflow state keyed by crId; per-subsystem content lives inside steps, not as separate workflows
- [Phase 31.2]: D-29: CR Explorer is default left tool window (Alt+1), tree CR -> Subsystem -> Task, no Milestone tier
- [Phase 31.2]: D-30: Systems Explorer parent nodes have no create-CR action; subsystem nodes do, pre-selecting themselves
- [Phase 31.2]: D-31: Clicking a CR opens a ChangeRequestDetailView tab, never a popup or inline swap
- [Phase 31.2]: D-32: CR Detail is a single screen: header, 6-step progress strip, flat task table with Subsystem column, collapsed Jira/docs block
- [Phase 31.2]: D-33: SystemDetailView has 4 tabs; Git & Branches tab exists only for subsystems
- [Phase 31.2]: D-35: 1-click Git sets activeRemoteTarget and opens the LEFT `remote_explorer` tool window (amended — no bottom Remote Git panel exists); 1-click Terminal opens the bottom Terminal; both disabled with Catalog link when unconfigured
- [Phase 31.2]: D-36: SDLC Studio is 3 zones (sidebar with CR picker + steps + Subsystems & Repos, workspace with context bar, step chat)
- [Phase 31.2]: D-37: Subsystems & Repos is read-only observation; editing stays in System Catalog
- [Phase 31.2]: D-38: selectedSystemId lives at SDLC view level and drives both Step 3 and Step 4; bar hidden for single-subsystem CRs
- [Phase 31.2]: D-39: Step 2 solution is split into one section per subsystem with repo-scoped conventions
- [Phase 31.2]: D-40: Step 4 packs per subsystem card plus Pack All with per-subsystem failure reporting; drift matrix is one table with a Subsystem column
- [Phase 31.2]: D-41: AI subsystem proposals are structured artifacts constrained to existing Catalog ids
- [Phase 31.2]: D-42: Proposals never auto-attach; user ticks and confirms before cr.targets changes
- [Phase 31.2]: D-43: Proposals can supplement an already-populated CR, listing only the missing subsystems
- [Phase 31.2]: D-44: Delete components/projects, ProjectsView, ProjectExplorer, RepoConfigView; rename ProjectSdlcView; rewrite CRExplorer; add CR Detail, SubsystemsReposPanel, SubsystemContextBar, SubsystemProposalCard
- [Phase 31.2]: D-45: All project/milestone tests removed or rewritten; new invariant and proposal-gate tests added
- [Phase 31.2]: D-46: Global Tasks tab stays; axes become CR + Subsystem (filter, table columns, TaskDrawer form, QuickAddBar)
- [Phase 31.2]: D-47: ItemInsightView itemType drops project/milestone, adds cr/system
- [Phase 31.2]: D-48: ChatScopeType drops project/milestone, adds cr/system; old project/milestone threads deleted on upgrade (test data, acceptable loss)
- [Phase 31.2]: D-49: Backup schema version bumped; legacy backups containing projects/milestones rejected with explicit message, never auto-mapped
- [Phase 31.2]: D-50: Every label surface (notifications, standup, dayInsight, weekly planner, dashboard, timer, feasibility, palette, selectionContext, filter, recurrence, docx export) resolves names from CR/Subsystem instead of Project
- [Phase 31.2]: D-51: Left stripe id renamed projects -> cr_explorer with layout persist key bump
- [Phase 31.2]: D-52: Mandatory execution order — schema/types/Zod/repo first, then legacy deletion, then daily surfaces, then CR/System views, then SDLC, then AI proposal, then tests
- [Phase 31.2]: D-53: Step 3 reads featureBranch from cr.targets and baseBranch from system; no branch-name guessing from crCode
- [Phase 42]: D-08 injection proof compares the WHOLE command string with `toBe`, never a containment check — `escapeShellArg` preserves the payload text inside the quotes, so `not.toContain(EVIL)` is vacuous by construction
- [Phase 42]: `clearAllMocks` in `beforeEach` is what makes `mock.calls.at(-1)` case-scoped; it clears call history but NOT the `mockResolvedValueOnce` queue, so each case queues exactly the responses it consumes
- [Phase 42]: AIO-READ-06 stays verify-only per D-13 — the gate at `teamRunCoordinator.ts:1174-1179` was already correct, so no code was written; coverage is advertisement-level only, execution enforcement lives in `oracleSqlclService.test.ts`
- [Quick 261109-eme]: Refactor AI Office & Staff to Left Stripe tool windows (ai_office on top, ai_staff above remote_explorer); open dedicated staff_detail and team_workspace editor tabs; hide Ghost Dev entry points
- [Phase 38]: D-23 parity is membership per table per list, never length equality — at HEAD the lists differ (35 Dexie / 27 TS+local / 27 Rust) for reasons outside phase 38, so a length gate would be false and un-greenable
- [Phase 38]: No Rust or SQLite structural change for the new columns — they ride inside opaque `payload_json` rows; `aiTeams`/`aiTeamMembers` were already in `ALLOWED_TABLES`
- [Phase 37-runtime-reliability-concurrency]: Ledger lands at Dexie V22 (V20/V21 taken by post-36 repairs); transitionAssignment is the only runStatus writer and returns null on a lost race; attemptNo allocated inside the insert transaction so retries append 2,3 never 2,2; concurrencyLimit default 3, range 1-12, clamped at the trust boundary.
- [Phase 37]: Scheduler acquire(signal) requires the signal; cancel(handle) is release-equivalent only — a queued assignment is cancelled by aborting its own AbortController (no handle exists before admission)
- [Phase 37]: Coordinator phase writes all route through setPhase(), which drops the write and its notify() once disposed, so runBatch/topUp tails cannot resurrect a dead run
- [Phase 37]: teamRunManager deletes the map entry before awaiting a stale dispose, so a concurrent get during the dispose window constructs fresh rather than observing a half-torn-down coordinator
- [Phase 37]: diagnosticDetail stripped by row projection (projectSafeAssignment) in export AND captureSnapshot, not at envelope level
- [Phase 37]: assignment backup record omits diagnosticDetail entirely so a hand-crafted payload carrying it is rejected by strictObject
- [Phase 37]: parity test pins LATEST_SCHEMA_VERSION = 22 so a future schema bump cannot silently desync its store source
- [Phase 37]: finalizeAttempt is exported on the coordinator interface so 37-04 and the concurrency test share one terminal writer
- [Phase 37]: a userStopped marker is required: settleAgent state cannot prove who ended the turn, and without it the ledger recorded done for a stopped attempt
- [Phase 37]: 37-04: dispatchAssignment owns the whole acquire->start->settle->release span; release happens only in its finally
- [Phase 37]: 37-04: userStopped is a Map<agentId, stopReason> so the stop path and the settle path record the same reason
- [Phase 37]: 37-04: the report-link stamp and finalizeAttempt share one rw transaction, so a settled attempt can never own two bubbles
- [Phase 37]: 37-06: a throw inside sendTurn is a fourth blocked cause (TURN_FAILED) — draft restored, text never dropped
- [Phase 37]: 37-06: the API-error-card retry shares the composer's BUSY_PHASES entry rule, so one decision governs every dispatch path
- [Phase 37]: retryAssignment claims the assignment id before any await and checks it before the busy-phase guard, so a double click is ignored rather than refused as a busy team
- [Phase 37]: the delegate_batch result keeps its array shape and gains a final kind:'unfinished' entry, because a wrapper object would break every caller and the tool contract
- [Phase 37]: persisted message.runStatus beats the live agentStatus: terminal agents are filtered out of snapshot.agents, so a stopped attempt has no live status and a remount has none at all
- [Phase ?]: beforeToolRound returns messages instead of being fire-and-forget; the loop appends them verbatim
- [Phase ?]: The round-boundary hook runs after in-loop compaction and fires on round 1 too
- [Phase 37.1]: 'steer' is widened in all six messageKind declarations at once — a partial widen either fails tsc or silently strips the row on restore
- [Phase 37.1]: steerMessageIds is declared on the strictObject assignment backup schema (an undeclared key fails loudly) and is safe against the forbidden-key gate
- [Phase 37.1]: the steer contract adds no table, no Dexie version and no BACKUP_SCHEMA_VERSION bump — every addition is optional
- [Phase ?]: The amend validator owns argument shape only; ledger membership stays in the coordinator, the only holder of openBatchId
- [Phase ?]: A non-queued row refuses the whole amend list, so the leader's report always matches the ledger
- [Phase ?]: Amend-cancel sets userStopped before aborting so leader-amend wins the from:queued guard; a rewrite appends an attempt and re-dispatches it
- [Phase 37.1]: Team chat UI: a queued-only pending set still renders the indicator trigger so Stop stays reachable
- [Phase 37.1]: AgentLiveStep is runtime-only; the delivered-steer set is derived from a batchId-scoped read because steerMessageIds is unindexed
- [Phase 38]: Migration tests assert against LATEST_SCHEMA_VERSION instead of a literal so a schema bump cannot re-break them
- [Phase 38]: V25 is purely additive with no .upgrade() hook; split usage columns are optional on the type and seeded 0 on every write path
- [Phase ?]: AIO-BUDGET-01/09 keep their unchecked box; the override note records the decision and the checkmark lands when the implementation plans close
- [Phase ?]: ROADMAP.md criteria 1 and 6 were already warning-only at HEAD, so plan 38-02 was a verify-and-noop for that file
- [Phase 38]: incrementMemberUsage is the atomic delta sink; usedTokens stays the legacy scalar until plan 09
- [Phase 38]: splitEvenly in budgetSplit.ts is the single home of the even-split rule; evenSplitRows is a thin adapter
- [Phase 38]: backup envelope v14 and the nine-file fixture sweep ship in one changeset; validateBackup.ts stays unchanged because the record schemas already own the numeric guards
- [Phase 38]: Out-of-band threshold reads fall back to 80 rather than clamping: a corrupt row is treated as unset, not silently rewritten to a boundary the user never chose
- [Phase 38]: ai_budget_warn_threshold_pct passes isSafeBackupSetting by construction; a test pins it so a future suffix rule cannot silently drop it
- [Phase 38]: The legacy BudgetGate stays byte-identical until plan 08; budgetGate.ts's docstring states this tree is not gate-free yet
- [Phase 38]: Override and effective threshold are two snapshot fields; the override key is omitted when inheriting (exactOptionalPropertyTypes), never set to undefined
- [Phase 38]: nextThresholdOverride(undefined) is the only clear mechanism — no separate clear method exists
- [Phase 38]: tests/helpers/teamRunSnapshot.ts owns the snapshot stub; five drifted literals collapsed into it
- [Phase 38]: applyTopUp (additive) and applyTeamBudgetSettings (absolute) are separate repo verbs, each one rw transaction over [aiTeams, aiTeamMembers]; mixing them is the double-increment bug
- [Phase 38]: The roster is read inside the top-up transaction, never from the coordinator cache — WR-13's membersLoaded early return is off the path
- [Phase 38]: The coordinator mirrors a persisted budget result (applyBudgetSettings) and never re-derives a delta; null and undefined both mean inherit at that boundary
- [Phase 38]: applyTeamBudgetSettings clamps rather than zod-validates the threshold on purpose: zod refuses 0 at the trust boundary, the settings path clamps 0 to 1 as a runtime belt
- [Phase 38]: The pre-call token estimate lives on the accounting record only, never in the live charge maps, so a guess cannot park a turn the reported number would not have parked
- [Phase 38]: An estimated charge updates live counters but skips gate evaluation — D-07 says an estimate is never a decision, and plan 08 deletes the gate
- [Phase 38]: flushAccounting marks the key flushed BEFORE awaiting the increment; that guard, not a zeroed record, is the duplicate-charge defence
- [Phase 38]: The employee turn's finally flushes and reconciles too, covering mention-started turns that own no attempt row
- [Phase 38]: tokenEstimate loads js-tiktoken through widened string specifiers with @vite-ignore so an absent package reaches the runtime catch; plan 10 switches them to literal lazy subpaths
- [Phase 38]: js-tiktoken is pinned at exactly 1.0.21 and imported only through the lite + ranks/o200k_base subpaths (never the 5 MB root), so the tokenizer lands in its own lazy chunk
- [Phase 38]: The Vietnamese token-count test asserts a positive integer, stability and inequality with chars÷4 — never a direction, because o200k_base can land either side of the heuristic
- [Phase 38]: Two failure seams, not one: a rejecting loader proves the absent-package path, a throwing encode proves the present-but-failing path; both degrade to chars÷4
- [Phase ?]: Budget warning identity is (teamId, level): the member level dispatches once per team, never once per teammate
- [Phase ?]: budgetWarnings.member is the aggregate flag; the per-member badge stays plan 09's surface
- [Phase ?]: pausedAgentId/pausedAgentName stay on the snapshot as always-null legacy fields because the parked phase value is still legal in old backups
- [Phase ?]: Split budget rendering sums every member row so the header agrees with the ledger the coordinator reconciles against
- [Phase ?]: A provisional pre-call measurement renders with the ~ estimate marker because it is not a provider number
- [Phase ?]: AgentPausedBanner deleted: awaiting-budget has no producer and its copy claimed a parked turn plus a literal 80%
- [Phase 41]: D-13/D-15: docsFolderId is unindexed row payload; V27 spreads SCHEMA_V26 byte-identically and needs no upgrade hook
- [Phase 41]: D-14: docsFolderId is uuidSchema.optional() in both AI team backup strictObjects; not added to FORBIDDEN_BACKUP_KEYS
- [Phase 41]: 41-02: teamDocsRepo owns the AI Teams root, per-team tree, member folders, hard tree delete and the idempotent backfill; the liveness guard runs inside the rw transaction over aiTeams/aiTeamMembers/aiEmployees/notes/settings
- [Phase 41]: 41-03: write_doc is a team tool (never in MUTATION_TOOLS), so the employee read-only gate cannot block it; parentId comes from ctx.folderId only, type is the literal 'document', and a lead-role call refuses LEAD_USES_DB_TOOLS before action is read
- [Phase 41]: 41-03: EMPLOYEE_ONLY_TEAM_TOOLS is the lead-payload subtraction set (wired in 41-06); it is not symmetric with LEAD_ONLY_TEAM_TOOLS — a tool in both would be offered to nobody
- [Phase ?]: 41-04: five team lifecycle writes own the docs tree in their existing transactions; removeTeamMember keeps the folder and its documents (D-11); writeLeadRow resolves the team folder itself and re-reads the row before put so a nested backfill is never erased
- [Phase 41]: 41-05: folder ids enter both prompts bare (UUIDs from the coordinator context) while member names pass through wrapField('TÊN NHÂN VIÊN') — T-41-21
- [Phase 41]: 41-05: the employee policy states two exceptions (propose_skill_version, write_doc) and no refusal code appears in either prompt — the handler stays the guard (D-04)
- [Phase 41]: 41-05: LEAD_NO_WRITE_DOC_LINE is exported so the test pins the exact sentence; the lead prompt names write_doc once, inside that negation, with no positive instruction (T-41-35)
- [Phase 41]: D-05: docs tree ensured at turn start in the coordinator, never lazily inside write_doc
- [Phase 41]: T-41-26: the leader gets no folderId even though its member row owns a live folder
- [Phase 42]: D-06/D-09: `git_read` is one team tool with a fixed seven-value action enum (branches|status|log|diff_summary|diff_file|read_file|tree); absent from MUTATION_TOOLS and both role sets, so no approval card and no coordinator edit
- [Phase 42]: D-07: the repo comes from the team's linked systems; `systemId` is only an index into that set — unlinked -> SYSTEM_NOT_LINKED, repo-less or empty -> NO_LINKED_REPO, ambiguous -> INVALID_ARGUMENT listing candidates
- [Phase 42]: D-08: the handler never builds a command string; every value reaches a gitRemoteService/gitRemoteTreeService function that escapes per argument
- [Phase 42]: D-11: every git_read wrap label is `GIT <action> <repoPath> — <field>`; a git or SSH throw becomes an INVALID_ARGUMENT refusal
- [Phase 42]: `getRecentCommits` added because `getCommitLog` builds a base..target range and cannot express last-N of one branch; both share one `parseCommitLog`
- [Phase 42]: D-12: reviewer detected by employee.role or skill.description containing 'review' (case-insensitive); no new AiEmployee field; the line names the tool and read order only, never a refusal code or repo path
- [Phase ?]: grep record parse: split stdout on newline first, then NUL per record — -z separates fields, newline ends the record
- [Phase ?]: readRemoteFilePage reuses confineRepoPath/isNotInRef and realpath containment; getRemoteFileContent stays whole-file for the editor
- [Phase ?]: git_read grep reuses the log branch-resolution shape: only an absent/empty branch falls back to the system default; a supplied-but-rejected one refuses
- [Phase ?]: git_read read_file pages via readRemoteFilePage and returns nextOffset only when hasMore; zero grep hits is a successful empty result, never a refusal
- [Phase 43]: Team turns read the context window once at coordinator construction from getNineRouterConfig — no new state, prop, or settings row
- [Phase 43]: explore_repo runs Claude Code headless on the remote: the preflight (command -v claude) is cached per SSH profile and refuses REMOTE_CLAUDE_UNAVAILABLE before any stream opens; the wall clock is enforced on the JS side because timeout(1) is absent on stock macOS
- [Phase 43]: parseExploreResult tries the whole stdout payload before the last line — the CLI may pretty-print the JSON object, and a last-line-only parse would turn a good run into unparseable-output
- [Phase 43]: explore_repo runs `claude -p --restricted` — verified against the real CLI that `--allowedTools` alone let a repo `.claude/settings.json` grant Bash, let `Read /etc/passwd` succeed, and let a repo `.mcp.json` execute a shell server on connect; `--restricted` closes all three and Read/Grep/Glob still work
- [Phase 43]: the explore prompt goes after `--` and the model id refuses a leading `-` — `escapeShellArg` protects the shell, not the CLI's argv parser
- [Phase 43]: explore_repo takes the turn's abort signal (through TeamToolContext) so a cancelled turn kills the remote process instead of leaving it reading for the 5-minute wall clock
- [Phase 46]: Profile envelope uses strictObject and explicit blank-secret literals; backup forbidden-key regex is deliberately not reused
- [Phase 46]: Telegram excluded from profiles (owner-machine-only): no schema section, no import read/write; strictObject rejects telegramSettings
- [Phase 46]: Import merges settings key-by-key in one rw transaction with a snapshot; blank secrets never overwrite recipient values; capacity rows upsert by natural key with fresh ids
- [Phase 46]: [Phase 46]: Authoring screen is seeded only from buildDefaultProfileConfig; the single db.settings.get in the view reads the profile list key, never the author's config — D-01 proof: no current-settings read may enter the portable profile
- [Phase 46]: Profile import flags the full catalog of secrets and machine-specific fields, never filters to fields present in a file
- [Phase 46]: SettingsView test uses one uniquely named Dexie instance per file (beforeAll/afterAll, cleared per test) to eliminate late useLiveQuery DatabaseClosedError
- [Phase 46]: Import card defers all db use to preview/apply so rendering the Settings data tab cannot interfere with GitHub sync live queries
- [Phase ?]: Draft blue #2f62d8 canonical; Fontsource default per-weight CSS bundles Vietnamese offline; workbench-tokens.css single source
- [Phase 46.1]: Combined gate uses --bail=1 not -x: Vitest 5.0.2 rejects -x; fail-fast preserved, 12 files/126 tests green, no full suite.
- [Phase 48]: Agent Developer worktree provisioning owns real remoteWorktreePath at session start; no repoPath fallback — Prevents main-checkout writes (D-08/D-09)
- [Phase 48]: code_edit role-gated to Agent Developer with request-bound descriptor; model paths never select worktree — ASVS privilege/tampering mitigation (D-07/D-10)
- [Phase ?]: Coding Zone perspectives swap layout only and share one modal state object
- [Phase ?]: Hunk decision key combines filePath, header, body hash and diff revision; failures never clear decisions
- [Phase ?]: Bulk accept disabled without pending hunks; bulk revert disabled without accepted hunks
- [Phase 48]: Coding Zone popout is a dedicated Tauri WebviewWindow; state handoff travels by emitTo/postMessage, never in hash
- [Phase 48]: Cross-window events carry originWindowId + monotonic revision; self/stale/malformed ignored at receipt
- [Phase 48]: "Đồng bộ" chip requires live session + SSH probe + valid worktree + popout presence; exact Vietnamese failure copy is pinned by tests
- [Phase 48]: Phase 48 D-21 UAT drives real Coding Zone components in system Chrome through a non-production Vite harness with confined synthetic Tauri IPC; no live SSH credentials or new packages.
- [Phase 48]: 48-VALIDATION.md signed off for D-19/D-20/D-21 only; D-22 delivery merge/push remains a blocking user checkpoint and Phase 48 is not marked complete.

## Performance Metrics

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 37-runtime-reliability-concurrency P01 | 6 min | 3 tasks | 10 files |
| Phase 37 P02 | 15 min | 3 tasks | 6 files |
| Phase 37 P05 | 10 min | 3 tasks | 18 files |
| Phase 37 P03 | 68 min | 3 tasks | 5 files |
| Phase 37 P04 | 48 min | 3 tasks | 10 files |
| Phase 37 P06 | 32 min | 3 tasks | 6 files |
| Phase 37 P07 | 42 min | 2 tasks | 5 files |
| Phase 37 P08 | 22 min | 2 tasks | 8 files |
| Phase 37.1 P01 | 55 min | 3 tasks | 2 files |
| Phase 37.1 P02 | ~12m | 3 tasks | 4 files |
| Phase 37.1 P03 | ~6m | 3 tasks | 7 files |
| Phase 37.1 P05 | 12 | 2 tasks | 4 files |
| Phase 37.1 P06 | 35m | 3 tasks | 12 files |
| Phase 38 P01 | 4min | 3 tasks | 9 files |
| Phase 38 P02 | 2min | 2 tasks | 1 files |
| Phase 38 P03 | 3min | 3 tasks | 4 files |
| Phase 38 P10 | 5min | 2 tasks | 4 files |
| Phase 38 P06 | 4min | 3 tasks | 10 files |
| Phase 38 P11 | 2min | 2 tasks | 4 files |
| Phase 38 P05 | 12min | 3 tasks | 10 files |
| Phase 38 P12 | 4min | 2 tasks | 3 files |
| Phase 38 P04 | 7min | 3 tasks | 7 files |
| Phase 38 P07 | 22min | 3 tasks | 9 files |
| Phase 38 P08 | 14min | 3 tasks | 8 files |
| Phase 38 P09 | 26min | 3 tasks | 12 files |
| Phase 41 P01 | 5m | 3 tasks | 9 files |
| Phase 41 P02 | 20 min | 3 tasks | 2 files |
| Phase 41 P03 | 10 min | 2 tasks | 2 files |
| Phase 41 P04 | 12 | 4 tasks | 2 files |
| Phase 41 P05 | 8 min | 3 tasks | 2 files |
| Phase 41 P06 | ~20 min | 3 tasks | 2 files |
| Phase 42 P01 | 4 min | 3 tasks | 3 files |
| Phase 42 P02 | 5m | 2 tasks | 2 files |
| Phase 42 P03 | 3 min | 3 tasks | 1 files |
| Phase 43 P01 | 25m | 3 tasks | 4 files |
| Phase 43 P02 | 35 min | 3 tasks | 4 files |
| Phase 43 P03 | ~15 min | 2 tasks | 3 files |
| Phase 43 P04 | 25 min | 3 tasks | 7 files |
| Phase 46 P01 | 6min | 3 tasks | 11 files |
| Phase 46 P02 | 11min | 2 tasks | 10 files |
| Phase 46 P03 | 53min | 2 tasks | 8 files |
| Phase 46.1 P04 | 15min | 3 tasks | 11 files |
| Phase 46.1 P05 | 3min | 2 tasks | 1 files |
| Phase 48 P01 | 21min | 3 tasks | 12 files |
| Phase 48 P02 | 14min | 2 tasks | 10 files |
| Phase 48 P03 | 29min | 2 tasks | 13 files |
| Phase 48 P04 | 20min | 2 tasks | 7 files |
