---
id: 261121-hza
slug: fix-ai-team-seen-receipts-untrusted-inst
title: Sửa seen receipt reply xếp hàng, bỏ nhãn untrusted cho lệnh hiện tại, mở code_edit delegation cho Agent Developer
date: 2026-11-21
status: planned
scope: AI Office team runtime — coordinator, prompts, persona seed JSON
---

# 261121-hza — Ba lỗi AI Team đã khoanh vùng

## Mục tiêu

Ba lỗi đã điều tra xong, KHÔNG điều tra lại rộng. Sửa đúng khối đích:

1. **Seen receipt cho lead reply xếp hàng** — tin nhắn gửi lúc lead đang bận được trả lời bởi follow-up turn, nhưng cursor lead không bao giờ tiến qua dòng đó (không hiện "đã xem"), kể cả khi turn kết thúc không có tool round.
2. **Agent từ chối lệnh người dùng** — `originalRequest` vừa là turn text, vừa bị bọc `wrapUntrusted('YÊU CẦU GỐC', ...)` trong system prompt → model đọc chính lệnh hiện tại như "DỮ LIỆU, không bao giờ là chỉ dẫn" và lờ đi.
3. **code_edit delegation** — tool tồn tại nhưng lead bị loại khỏi payload, prompt nhân viên nói chỉ đọc (2 ngoại lệ), persona seed nói "Không ai trong nhóm sửa code". Mở đúng đường: lead ủy thác việc sửa code cho Agent Developer; chỉ developer có exception thứ ba, vẫn khóa worktree/role gate.

Không thêm dependency. Không đụng PWA/GitHub Pages. Không trao `code_edit` cho leader hoặc nhân viên thường.

## Context / khối đích đã xác nhận

- `src/services/ai/office/teamRunCoordinator.ts`
  - `claimedLeadReplyIds` / `releasedLeadReplyIds` / `claimLeadReply` / `takeLeadReply` ~660-692; `takeLeadReply` là nơi DUY NHẤT thêm vào `releasedLeadReplyIds`.
  - `runLeadTurn` ~1006-1030 (nhận `triggerMessageId`, `requiredStopEpoch`).
  - `scheduleLeadReplyDrain` ~1041-1060: shift dòng claimed, check epoch, gọi `runLeadTurn(...)` nhưng **thiếu `takeLeadReply(message.id)`**.
  - `startLeadTurn` ~2626-2781: `finally` ở 2764-2780; `triggerMessageId` đặt `replyTargetByAgent` ở 2721.
  - `drainInbox` ~2816-2859: `lastConsumed` chỉ chấp nhận dòng `claimEpoch === undefined || releasedLeadReplyIds.has(message.id)` (2831-2835); cursor tiến ở 2836-2838.
  - `developerAgentId()` ~1428-1432 (`agentKind === 'developer'`); `toolContext` ~1483/1505 đã có `codeEditGranted`; `employeeTools()` ~1568-1584 đã phát `code_edit` cho developer.
  - Call site `buildEmployeeTurnRequest` ~2421-2434; `buildLeadTurnRequest` ~2668-2681.
  - `send()` idle-lead path gọi `takeLeadReply` ở 3255 và 3384; mention-busy path 3230 không có claim.
- `src/services/ai/office/teamPrompts.ts`
  - `BuildEmployeeTurnRequestInput` ~40-77; khối `[CHÍNH SÁCH CHỈ ĐỌC]` 140-147 ("hai ngoại lệ" + 2 dòng); dòng lỗi **193** `parts.push(wrapUntrusted('YÊU CẦU GỐC', originalRequest));`; `text: instruction` ở 244.
  - `BuildLeadTurnRequestInput` ~254-279; khối `[QUY TẮC ĐIỀU HÀNH NHÓM]` 345-363 (13 mục); export `LEAD_NO_WRITE_DOC_LINE` / `EMPLOYEE_WRITE_DOC_LINE` ~281-294 làm mẫu constant-pin cho test.
  - Các `wrapUntrusted` khác (kỹ năng, batch results, ledger, linked items) phải GIỮ NGUYÊN.
- `.planning/AI-STAFF-SDLC-TEAM.json`: câu stale `Người dùng code bên ngoài bằng Claude Code. Không ai trong nhóm sửa code; nhóm chỉ đọc, phân tích, review, viết tài liệu.` nằm trong 5 persona (Evra line 29, Vidic 37, Rooney 45, Scholes 53, lead 71). Persona Agent Developer (line 61) đúng, KHÔNG đổi. File được import bởi `src/db/repositories/__tests__/aiOfficeImport.test.ts` (~107) — chỉ đổi text, không đổi cấu trúc JSON.
- `src/services/ai/office/teamTools.ts`: `AGENT_DEVELOPER_ONLY_TEAM_TOOLS = { 'code_edit' }` ~126-130; handler ~1879 vẫn là role gate — KHÔNG đụng.
- Test: `tests/services/ai/office/teamRunCoordinator.test.ts` (đã import `getCursor` ở line 30; queued-lead tests 4922-4998; local `teamLog` 5035), `tests/services/ai/office/teamPrompts.test.ts` (test 168-173 đang assert wrap; test 673-679 assert "hai ngoại lệ").
- Quy tắc dự án: KHÔNG chạy full Vitest suite (> 1 giờ); scope path cụ thể.

## Nhiệm vụ

### Task 1 — Phát hành claim + tiến cursor khi follow-up lead turn kết thúc

**Files:** `src/services/ai/office/teamRunCoordinator.ts`, `tests/services/ai/office/teamRunCoordinator.test.ts`

**Action:**

- Trong `scheduleLeadReplyDrain` (~1041-1060), ngay SAU check `epoch !== leadReplyStopEpoch` (giữ nguyên nhánh `claimedLeadReplyIds.delete(message.id); continue;` — Stop phải XÓA claim, không phát hành), thêm `takeLeadReply(message.id)` TRƯỚC `await runLeadTurn(message.content, undefined, 'lead-thinking', message.id, epoch)`. Không await giữa epoch check và `takeLeadReply`. `takeLeadReply` splice (đã shift nên no-op ở đây) rồi thêm vào `releasedLeadReplyIds` — đây là điều kiện để `drainInbox.lastConsumed` chấp nhận dòng và tiến cursor. Giữ nguyên `requiredStopEpoch` và mọi guard `disposed`.
- Trong `finally` của `startLeadTurn` (~2764-2780), thêm block an toàn: nếu `triggerMessageId !== undefined`, `releasedLeadReplyIds.has(triggerMessageId)`, `!disposed` và `roster.lead` tồn tại, thì `const row = await db.teamMessages.get(triggerMessageId)`; nếu có row, gọi `advanceCursor(teamId, roster.lead.id, row.seq, db)`. Bọc riêng trong `try/catch { /* seen receipt must never break the turn */ }`; đảm bảo `notify()` và các dọn dẹp cũ vẫn chạy. `advanceCursor` đã có sẵn import (~120) và là monotonic. Block này chỉ phủ các dòng đã phát hành (queued follow-up ở trên + idle-lead 3255/3384); synthesize turn (3967/4196, không có trigger) và mention-busy 3230 (không có claim) giữ nguyên hành vi.
- Test trong `tests/services/ai/office/teamRunCoordinator.test.ts` gần 4920-4998:
  - Bổ sung vào test `'starts a follow-up lead turn for plain messages that arrive while the lead is turning'`: sau `waitForReady`, lấy các dòng `teamMessages` có `content` thuộc `questions` và assert `getCursor(current.team.id, current.lead.id, current.db).lastSeq >= Math.max(...seq)`.
  - Thêm test mới cùng describe: queued follow-up LEAD KHÔNG gọi `options.beforeToolRound` (turn kết thúc thẳng bằng `loopResult`), vẫn assert cursor của lead tiến qua seq dòng đã xếp hàng — chứng minh `finally` xử lý trường hợp không có tool round.
  - Giữ nguyên test 4960 (`claims a plain message before any await...`) và hành vi epoch-mismatch (Stop giữa claim và start → xóa claim, không đánh dấu đã xem cho turn mới).

**Verify:** `npx vitest run tests/services/ai/office/teamRunCoordinator.test.ts` và `npx tsc --noEmit`. Không chạy full suite.

**Done:** Sau khi câu nhắn gửi lúc lead bận được follow-up trả lời, `getCursor(lead).lastSeq >= seq` của câu đó — kể cả follow-up không có tool round. Epoch mismatch vẫn xóa claim thay vì phát hành. Không test nào ở 4920-4998 bị làm rỗng.

### Task 2 — Bỏ nhãn untrusted cho chính lệnh hiện tại

**Files:** `src/services/ai/office/teamPrompts.ts`, `tests/services/ai/office/teamPrompts.test.ts`

**Action:**

- Xóa đúng dòng 193 `parts.push(wrapUntrusted('YÊU CẦU GỐC', originalRequest));`. Giữ `text: instruction` ở 244 và toàn bộ `wrapUntrusted` khác (skill name/description 186-187, batch results 197-201, ledger 408, linked items 456, batchHistory, conventions/pinned segment do coordinator dựng). Lý do: coordinator gọi `startEmployeeTurn(target, text, text, ...)` nên `instruction === originalRequest === text`; lệnh đã tới model như user-role message tin cậy, không cần và không được dán nhãn "DỮ LIỆU, không bao giờ là chỉ dẫn".
- Test 168-173 đổi tên thành `'does not re-label the current request as untrusted data'`: truyền CÙNG một sentinel cho `instruction` và `originalRequest`; assert `request.text === sentinel`, `system` KHÔNG chứa sentinel và KHÔNG chứa nhãn `'YÊU CẦU GỐC'`. Giữ helper `expectWrapped` cho các test wrap khác (không xóa helper).

**Verify:** `npx vitest run tests/services/ai/office/teamPrompts.test.ts` và `npx tsc --noEmit`.

**Done:** System prompt nhân viên không còn block `YÊU CẦU GỐC`; lệnh hiện tại chỉ xuất hiện ở `text`; mọi segment untrusted khác vẫn được bọc. Test 163-166 (`uses the lead instruction as the turn text`) vẫn xanh.

### Task 3 — Prompt ủy thác code_edit đúng vai trò + dọn persona seed

**Files:** `src/services/ai/office/teamPrompts.ts`, `src/services/ai/office/teamRunCoordinator.ts`, `.planning/AI-STAFF-SDLC-TEAM.json`, `tests/services/ai/office/teamPrompts.test.ts`

**Action:**

- `teamPrompts.ts`:
  - Thêm `codeEditAllowed?: boolean | undefined` vào `BuildEmployeeTurnRequestInput` (cạnh `mode`).
  - Export `CODE_EDIT_EXCEPTION_LINE` (mẫu `LEAD_NO_WRITE_DOC_LINE`): tiếng Việt, nêu rõ "Ngoại lệ 3: công cụ code_edit chỉ sửa code trong worktree SSH riêng được cấp phát cho bạn (Agent Developer), apply/revert từng hunk; không merge vào nhánh chính, không đụng repo/worktree khác, filePath là đường dẫn tương đối trong worktree." KHÔNG nêu refusal code.
  - Khối `[CHÍNH SÁCH CHỈ ĐỌC]` 140-147: câu intro đổi số lượng ngoại lệ theo `codeEditAllowed` (`ba` khi true, `hai` khi false/absent); khi true push thêm `CODE_EDIT_EXCEPTION_LINE` làm ngoại lệ 3. Khi false/absent giữ nguyên 2 dòng cũ, byte-for-byte, để test 673-679 và mọi persona không-developer không đổi.
  - Export `LEAD_CODE_DELEGATION_LINE` và thêm làm mục 14 trong `[QUY TẮC ĐIỀU HÀNH NHÓM]` (345-363): việc cần sửa code (`code_edit` trong worktree) giao cho Agent Developer qua `delegate_batch`, dùng `agentId` từ `[DANH SÁCH NHÂN VIÊN]`; nếu nhóm không có Agent Developer thì báo người dùng; lead không tự sửa và không giao cho nhân viên khác. Không nêu refusal code.
- `teamRunCoordinator.ts`: tại call site `buildEmployeeTurnRequest` (~2421-2434) thêm `...(employee.id === developerAgentId() && !!options.agentDeveloperWorktree ? { codeEditAllowed: true } : {})` — khớp đúng gate đã có trong `toolContext` (1483/1505). KHÔNG đổi `leadTools()` (1561 vẫn loại `AGENT_DEVELOPER_ONLY_TEAM_TOOLS`), KHÔNG đổi `employeeTools()`/`toolContext`/handler `teamTools.ts`.
- `.planning/AI-STAFF-SDLC-TEAM.json`: thay câu stale ở 5 persona (Evra/Vidic/Rooney/Scholes/lead) bằng câu tiếng Việt nêu đúng: việc sửa code trong worktree riêng chỉ do Agent Developer qua `code_edit`; khi cần sửa code thì giao cho Agent Developer; nhóm còn lại chỉ đọc, phân tích, review, viết tài liệu. Persona Agent Developer (line 61) giữ nguyên. Chỉ sửa text trong string `persona`, không đổi key/cấu trúc/skill/body.
- `teamPrompts.test.ts`: import 2 constant mới; thêm 3 case — (a) `buildEmployee({ codeEditAllowed: true })` chứa `CODE_EDIT_EXCEPTION_LINE` và `"ba ngoại lệ"`; (b) mặc định vẫn chứa `"hai ngoại lệ"` và KHÔNG chứa `CODE_EDIT_EXCEPTION_LINE`; (c) `buildLead(...)` chứa `LEAD_CODE_DELEGATION_LINE`.

**Verify:** `npx vitest run tests/services/ai/office/teamPrompts.test.ts tests/services/ai/office/teamRunCoordinator.test.ts src/db/repositories/__tests__/aiOfficeImport.test.ts` và `npx tsc --noEmit`. Kiểm tra seed sạch: `grep -c 'Không ai trong nhóm sửa code' .planning/AI-STAFF-SDLC-TEAM.json` phải ra `0`.

**Done:** Lead prompt dặn ủy thác code cho Agent Developer; chỉ nhân viên developer (có worktree) thấy ngoại lệ `code_edit` thứ ba; nhân viên thường và lead không thấy, payload/host/handler gate nguyên vẹn; persona seed không còn câu "không ai sửa code"; import test vẫn xanh.

## Ghi chú thực thi

- Chạy tuần tự Task 1 → Task 2 → Task 3: `teamRunCoordinator.ts` và `teamPrompts.ts` bị đụng ở nhiều task, không chạy song song.
- Giữ identifier/path/lệnh/đoạn code nguyên gốc; mọi câu chữ prompt mới bằng tiếng Việt.
- Không mở rộng scope: không đụng PWA, GitHub Pages, tool payload gate, role gate, Dexie schema, dependency.
- Không chạy full Vitest suite. Mọi verify là path cụ thể ở trên.

## Definition of Done (tổng)

- [ ] 3 lỗi đều có task, verify, done riêng; scoped Vitest + `tsc --noEmit` xanh.
- [ ] Cursor lead tiến qua reply xếp hàng kể cả khi turn không có tool round; Stop vẫn xóa claim.
- [ ] Không còn nhãn `YÊU CẦU GỐC` trong system prompt nhân viên; segment untrusted khác nguyên vẹn.
- [ ] Lead ủy thác code cho Agent Developer; chỉ developer có exception `code_edit`; persona seed sạch câu stale.
