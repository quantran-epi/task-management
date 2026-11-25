# 261125-svm — Dynamic MCP tool list cho mọi AI surface

## Commits

| Task | Commit | Nội dung |
|------|--------|----------|
| 1 | `d0943604` | Discovery theo TTL 15s + invalidation, xoá fallback resolve theo `SOURCE_TOOL_NAMES`, swap metadata tool atomic; test refresh/xoá tool/mutation fail-closed. |
| 2 | `d1a49648` | Bỏ `GRAPHITI_ALLOWED_TOOLS` trong Rust proxy, giữ method/session/size/URL policy; 2 server ngầm (`graphiti-banking`, `svng-source`) luôn bật, card Settings chỉ còn sửa URL. |
| 3 | `a096fb87` | Refresh discovery mỗi turn cho team, Telegram, tool catalog; bỏ hard-name gate trong legacy Graphiti client, dùng tên từ `tools/list`. |

## Quyết định bổ sung từ sếp (đã áp dụng)

- `graphiti-banking` / `graphiti-memory` và `svng-source` là server ngầm, luôn bật; chỉ cho đổi URL trong card riêng `Graphiti/SQL`. Card `Cấu hình Máy chủ MCP (Model Context Protocol)`, AI chat panel và AI team đã filter 2 ID này từ trước — giữ nguyên; không có toggle mới cho 2 server này.
- `getGraphitiSqlServers` và `saveGraphitiSqlServers` force `enabled: true` cho cả 2 server; xoá switch khỏi `GraphitiSqlConfigCard`, cập nhật copy "luôn bật, chỉ đổi URL" và test URL-only. Rule prompt vẫn tuỳ URL/rules bundle, không cho phép user tắt.
- Chỉ custom MCP server mới chịu toggle per-tab/per-team; dynamic list + reload theo turn áp dụng cho tất cả server, kể cả 2 server ngầm.

## Kết quả verify

- `npx vitest run` 11 scoped files, 346 tests — pass (gồm plan path + MCP client, Graphiti, Graphiti rules/settings, chat turn tools).
- `npx tsc --noEmit` — pass.
- `cargo test --manifest-path src-tauri/Cargo.toml ai_proxy` — 7 pass, 2 fail đúng baseline IPv6 (`http://[::1]:...`) trong `is_allowed_graphiti_target` / `is_allowed_ai_target`. Không sửa URL policy theo constraint.
- `cd public/ai-rules && shasum -a 256 -c SHA256SUMS` — cả 2 file OK.
- Review `git diff` 3 commit SVM: chỉ chạm file MCP/AI/settings được phép; không đụng `AIChatDrawer.tsx`, `AIChatContext.tsx`, `ActiveAiTurnIndicator.tsx`, footer tests, notes s92/t5q. Commit t5q của workstream khác xen kẽ trên cùng branch nhưng nằm ngoài 3 commit SVM.
- Mutation gate vẫn fail-closed ở `executeDynamicMcpTool` (`readOnlyHint` từ advertise hoặc fallback read-only name; không có `allowMutation` thì chặn trước `tools/call`); native forward mọi tool name nhưng vẫn validate JSON-RPC, method, session ID, kích thước, URL/host policy.

## Findings / blockers

- Không có blocker cho scoped work. UAT tay với server advertise tool mới/xoá tool chưa chạy (cần endpoint MCP thật); bằng chứng tự động nằm ở test refresh TTL + invalidation cho cả 2 MCP client.
- Baseline 2 Rust IPv6 test failures được giữ nguyên, không thuộc scope và không được sửa vì URL policy là immutable.
- Rule hash nguyên vẹn; docs artifacts (PLAN/CONTEXT/SUMMARY/STATE) không nằm trong commit code.
