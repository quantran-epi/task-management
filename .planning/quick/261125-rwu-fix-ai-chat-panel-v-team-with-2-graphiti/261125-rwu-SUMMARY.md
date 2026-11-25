---
phase: quick
plan: 261125-rwu
subsystem: ai
tags: [mcp, graphiti, svng-source, tool-allowlist, prompt, tauri]
requires:
  - phase: 261125-hn9
    provides: dedicated Graphiti/SQL settings card, SHA-256 verified rule segments, shared panel/team wiring
provides:
  - "Panel và team dùng chung segment nhắc đúng 5 source tool, phân biệt svng-source là server id"
  - "normalizeToolName repair tên model garbled về đúng source tool, không tạo tool mới"
  - "5 source tool discovery dù thiếu description, vượt read-only gate JS, resolve sang svng-source, đi qua Rust proxy"
  - "Discovery failure có tín hiệu rõ trên panel và team, không im lặng rụt tool"
affects: [AI Chat panel, AI Chat team, MCP client, Rust AI proxy]
tech-stack:
  added: []
  patterns: ["SOURCE_TOOL_NAMES định nghĩa một lần tại mcpClient, re-export qua graphitiRules để tránh import cycle"]
key-files:
  created: []
  modified:
    - src/services/ai/mcpClient.ts
    - src/services/ai/graphitiRules.ts
    - src/services/ai/aiTools.ts
    - src/components/ai/AIChatDrawer.tsx
    - src/services/ai/office/teamRunCoordinator.ts
    - src-tauri/src/ai_proxy.rs
    - src/services/ai/__tests__/graphitiRules.test.ts
    - src/services/ai/__tests__/mcpClient.test.ts
    - tests/ai/mcpClientTransport.test.ts
    - tests/ai/AIChatDrawerConventions.test.tsx
    - tests/services/ai/office/teamPrompts.test.ts
key-decisions:
  - "SOURCE_TOOL_NAMES đặt ở mcpClient (owner của allowlist), graphitiRules chỉ re-export: tránh cycle aiTools -> graphitiRules -> mcpClient"
  - "Fallback resolve svng-source áp dụng khi row tồn tại, vẫn đi qua các cổng enabled/desktopOnly/readOnly/schema hiện hữu"
  - "Discovery failure ghi console.error kèm server id/name; panel thêm appMessage.warning khi source enabled nhưng không có source tool"
patterns-established:
  - "Repair tên tool chỉ map prefix svng source về 5 tên có sẵn (ponytail: mở rộng khi server id khác gây nhiễu)"
requirements-completed:
  - GRAPHITI-SOURCE-TOOLS-01
duration: ~25min
completed: 2026-11-25
---

# Quick 261125-rwu: Source tools cho AI Chat panel và team Summary

Sửa đứt gãy hai MCP server trong AI Chat: model giờ thấy đúng 5 source tool, repair được tên garbled, và tool đi qua cả hai lớp gate JS/Rust mà không nới quyền ghi.

## Performance

- **Duration:** ~25 min
- **Tasks:** 3/3
- **Files modified:** 11 (6 production, 5 test)

## Accomplishments

- `buildGraphitiSkillSegment` khẳng định `svng-source` là TÊN SERVER, liệt kê 5 tool và cấm gọi tool tên `svng source`/`svng-source`; panel và team cùng nhận segment này.
- `normalizeToolName` sửa `svng source search_source`, `svng-source source_callers`, `svng_source read_source` về đúng tên; không sửa tên không phải source tool.
- Discovery giữ tool thiếu `description`, log lỗi kèm server id, allowlist JS và Rust cho phép đúng 5 tool đọc.
- `executeDynamicMcpTool` fallback về `svng-source` khi chưa có map; vẫn fail-closed cho mutation, server disabled, desktopOnly và schema.
- Panel cảnh báo khi bật source nhưng discovery không trả source tool; team log rõ khi discovery timeout mà vẫn giữ cache.

## Task Commits

1. **Task 1: Sửa prompt và repair tên tool `svng-source` thành 5 source tool thật** - `7a6447f2` (fix)
2. **Task 2: Cho phép 5 source tool đi qua discovery, read-only gate và Tauri proxy** - `cfdb5038` (feat)
3. **Task 3: Nối wiring panel/team và review diff + verify scoped** - `da6bdb63`, `106d6fea` (feat)

**Plan metadata:** orchestrator commit (không commit ở executor).

## Files Created/Modified

- `src/services/ai/mcpClient.ts` - `SOURCE_TOOL_NAMES`, allowlist mở rộng đúng 5 tool, discovery giữ tool thiếu description, log lỗi, fallback resolve server.
- `src/services/ai/graphitiRules.ts` - segment phân biệt server/tool và liệt kê 5 tool; re-export tên dùng chung.
- `src/services/ai/aiTools.ts` - repair prefix `svng source` trong `normalizeToolName`.
- `src-tauri/src/ai_proxy.rs` - allowlist Rust 9 tool đọc; mutation và URL policy giữ nguyên.
- `src/components/ai/AIChatDrawer.tsx` - warning khi discovery source trống/lỗi.
- `src/services/ai/office/teamRunCoordinator.ts` - log discovery failure, vẫn giữ cached tools và bound 5s.
- Test files - phủ segment, normalize, discovery/execute, panel warning, lead/employee prompt.

## Decisions Made

- Đặt hằng số ở `mcpClient` thay vì `graphitiRules` vì `aiTools` import `mcpClient` type-only nhưng import value từ `graphitiRules` tạo vòng lặp import lúc chạy (RED: `SOURCE_TOOL_NAMES is not iterable`).
- Dùng `console.error` prefix `[mcpClient]`/`[teamRunCoordinator]` thay vì đưa URL đầy đủ vào log hay prompt.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Import cycle khi Task 2 mở rộng allowlist**
- **Found during:** Task 2
- **Issue:** `mcpClient` import `SOURCE_TOOL_NAMES` từ `graphitiRules`, trong khi `graphitiRules` import `mcpClient` và `aiTools` import `graphitiRules`; Vitest ném `TypeError: SOURCE_TOOL_NAMES is not iterable` lúc module init.
- **Fix:** Chuyển định nghĩa hằng số sang `mcpClient`; `graphitiRules` re-export cho prompt/panel; `aiTools` import trực tiếp từ `mcpClient`.
- **Files modified:** `src/services/ai/mcpClient.ts`, `src/services/ai/graphitiRules.ts`, `src/services/ai/aiTools.ts`
- **Verification:** 28 scoped tests pass, `tsc --noEmit` clean.
- **Committed in:** `cfdb5038`

**2. [Rule 1 - Baseline drift] `tests/ai/aiTools.test.ts` failed before any change**
- **Found during:** Task 1 verification
- **Issue:** Assertion `expect(AI_DATABASE_TOOLS.length).toBe(78)` nhưng runtime trả 80 (`ssh_read_document` và tool khác đã thêm từ commit trước). Không liên quan đến plan.
- **Fix:** Không sửa; đưa assertions `normalizeToolName` vào `src/services/ai/__tests__/mcpClient.test.ts` theo cho phép của lệnh giao việc, giữ diff tối thiểu.
- **Files modified:** `src/services/ai/__tests__/mcpClient.test.ts`
- **Verification:** 2 file test chính xác của Task 1 pass 20/20.
- **Committed in:** `7a6447f2`

**3. [Rule 1 - Baseline drift] 2 Rust URL tests fail on unmodified HEAD**
- **Found during:** Task 2 verification
- **Issue:** `graphiti_allows_https_and_private_http_targets` và `allows_loopback_and_private_ipv4_http_v1_targets` fail ở `http://[::1]` — `is_allowed_http_host` chưa xử lý IPv6. Reconfirmed bằng worktree sạch tại HEAD (`7a6447f2^`): cùng 2 failures.
- **Fix:** Không đụng URL policy (bị khóa bởi plan/threat model); chỉ thêm assert allowlist source tool và mutation mới.
- **Files modified:** `src-tauri/src/ai_proxy.rs` (chỉ phần test allowlist)
- **Verification:** `graphiti_allows_only_read_tools` và `graphiti_rejects_mutations_and_unknown_tools` pass; 7/9 `ai_proxy` tests pass, 2 baseline failures unchanged.
- **Committed in:** `cfdb5038`

**Total deviations:** 3 auto-fixed/recorded. **Impact:** Không ảnh hưởng tính năng; baseline drift được ghi rõ, không sửa ngoài scope.

## Verification Results

- `npx vitest run tests/ai/AIChatDrawerConventions.test.tsx tests/services/ai/office/teamPrompts.test.ts src/services/ai/__tests__/graphitiRules.test.ts src/services/ai/__tests__/mcpClient.test.ts tests/ai/mcpClientTransport.test.ts --bail=1` — **PASS** 5 files / 99 tests.
- `npx tsc --noEmit` — **PASS**.
- `cargo test --manifest-path src-tauri/Cargo.toml ai_proxy` — **PARTIAL**: 7 pass, 2 baseline IPv6 failures (đã chứng minh trên HEAD sạch); 2 test allowlist/mutation liên quan plan đều pass.
- `shasum -a 256 -c SHA256SUMS` trong `public/ai-rules/` — **PASS** cả 2 file; `git diff public/ai-rules` rỗng.
- Diff review: không mutation tool nào vào allowlist TS/Rust; URL policy, session validation và read-only gate không bị nới.
- UAT tay trên Tauri dev (Settings bật 2 server, hỏi source evidence ở panel và team, thử `add_memory`) — **chưa chạy**, cần live endpoint `svng-source` do người dùng cấu hình.

## Issues Encountered

- 2 Rust URL tests fail từ baseline do IPv6 `::1`; không thuộc scope và không được sửa vì URL policy bị khóa.
- `tests/ai/aiTools.test.ts` count assertion lỗi từ baseline (78 vs 80); không thuộc scope.

## Next Phase Readiness

Sẵn sàng cho orchestrator cập nhật STATE/ROADMAP. Live UAT vẫn là checkpoint của người dùng.
