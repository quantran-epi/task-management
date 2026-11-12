---
status: diagnosed
trigger: "uat-37.1-deliver-steer-unavailable: Sending a steer to a running agent makes the leader reply that steering a running agent is unavailable. The leader conflates cancel (queued-only) with steer (running)."
created: 2026-11-12T00:00:00Z
updated: 2026-11-12T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED — `deliver_steer` only delivers a steer row that carries `targetAgentId`; that field is written only when the user picks an agent from the structured @-mention dropdown. A plain-text steer that names an agent (the UAT's own reproduction text) is permanently undeliverable, and no other leader tool can reach a running assignment.
test: trace steer() -> row -> prompt -> deliverSteer() -> tool result for a plain-text steer
expecting: refusal at the targetAgentId guard in deliverSteer, with no alternate tool path
next_action: report diagnosis (goal: find_root_cause_only)

## Symptoms

expected: A steer addressed to a running agent is delivered via `deliver_steer` and drained by the agent at its next tool round (SC3).
actual: "Việc của Eva đang chạy, không thể hủy ngang qua lệnh hủy hàng đợi (chỉ áp dụng cho trạng thái queued). Chỉ đạo dừng việc gửi tới Eva không khả dụng qua hệ thống lúc này. Đề xuất: Chờ Eva trả kết quả rồi hủy/bỏ qua nội dung báo cáo, hoặc chờ toàn bộ lô hoàn tất để tạo lô mới. Xác nhận phương án tiếp theo."
errors: None reported in console.
reproduction: Test 5 in .planning/phases/37.1-live-steering-leader-amends-assignments-and-steers-running-a/37.1-UAT.md — run a long agent task, send a steer aimed at that agent, observe the leader's refusal.
started: Discovered during UAT of phase 37.1.

## Eliminated

- hypothesis: `deliver_steer` refuses a `running` assignment in code.
  evidence: `teamRunCoordinator.ts:1760-1770` and the in-transaction re-check at `:1785-1791` both accept `runStatus === 'queued' || 'running'`. Running is explicitly allowed; D-28 requires writing the marker for both states.
  timestamp: 2026-11-12T00:00:00Z

- hypothesis: The steer turn's prompt omits the `deliver_steer` tool.
  evidence: `leadSteerTools()` (`teamRunCoordinator.ts:1579-1586`) filters `TEAM_TOOL_DEFINITIONS` for `deliver_steer` + `amend_assignments`; the steer turn is built with it at `:1653`.
  timestamp: 2026-11-12T00:00:00Z

- hypothesis: The pending-steer block is missing from the steer turn prompt.
  evidence: `steer()` adds the row id to `pendingSteerMessageIds` before `runLeadSteerTurn` (`:1479-1483`), and `runLeadSteerTurn` loads it via `loadPendingSteers()` (`:1622-1626`, `:1642`); `buildLeadTurnRequest` renders `[CHỈ ĐẠO CHỜ XỬ LÝ]` (`teamPrompts.ts:223-234`).
  timestamp: 2026-11-12T00:00:00Z

## Evidence

- timestamp: 2026-11-12T00:00:00Z
  checked: UAT test 5 reproduction text
  found: `.planning/phases/37.1-.../37.1-UAT.md:65` — the steer is typed as plain text: `gửi Eva: đổi sang định dạng bảng` (no `@` picker, no structured mention).
  implication: `parseMentionTarget` cannot match it, so the persisted steer row has no `targetAgentId`.

- timestamp: 2026-11-12T00:00:00Z
  checked: `teamRunCoordinator.ts:1441-1451` (`parseMentionTarget`) and `:1461-1474` (`steer`)
  found: target comes only from `AGENT_MENTION = /@\[([^\]]+)\]\(agent:([a-zA-Z0-9-]+)\)/` (`:253`); the row writes `targetAgentId` only when that regex matches (`:1472`).
  implication: plain-language naming ("gửi Eva: ...", "@Eva" typed by hand) yields a steer row with `targetAgentId === undefined`.

- timestamp: 2026-11-12T00:00:00Z
  checked: `teamRunCoordinator.ts:1739-1757` (`deliverSteer` entry guards)
  found: `if (message.messageKind !== 'steer' || message.targetAgentId === undefined)` returns `refused: true, code: 'INVALID_ARGUMENT', message: 'Không tìm thấy chỉ đạo hợp lệ để giao.'` (`:1751-1757`).
  implication: an untargeted steer can never be delivered, even when its text plainly names the agent. The leader sees this refusal as a tool result and reports the steer as unavailable.

- timestamp: 2026-11-12T00:00:00Z
  checked: `teamPrompts.ts:222-234` (`[CHỈ ĐẠO CHỜ XỬ LÝ]`) and `:185-197` (conduct rules)
  found: the block renders `gửi tới: ${steer.targetAgentName ?? 'cả nhóm'}` (`:229`) — an untargeted steer is labelled "cả nhóm" (whole group). Rule 10 (`:195`) scopes `deliver_steer` to "mọi chỉ đạo @nhân viên". The ledger block (`:207-220`) says `running` rows "chỉ có thể gửi chỉ đạo" but never says how to target one.
  implication: the prompt reinforces that an untargeted steer is not an agent steer, so the leader has neither an id-to-agent mapping nor an instruction to resolve one.

- timestamp: 2026-11-12T00:00:00Z
  checked: alternate leader paths for a running assignment
  found: `amend_assignments` refuses any non-`queued` row with `NOT_QUEUED` (`teamRunCoordinator.ts:1872-1878`, re-checked at `:1925-1933`); `delegate_batch` refuses while a batch is open (`:2252`); `TEAM_TOOL_DEFINITIONS` (`teamTools.ts:51-201`) has no stop tool — `stopAgent` exists only on the coordinator interface (`teamRunCoordinator.ts:212`), not as a leader tool.
  implication: the leader's "steering a running agent is unavailable through the system" reply is a truthful description of the dead end, not a hallucination.

- timestamp: 2026-11-12T00:00:00Z
  checked: `teamRunCoordinator.ts:1559-1572` (`drainLeaderSteerQueue`)
  found: the round-boundary drain deletes ids from `pendingSteerMessageIds` and injects only `STEER_PREFIX + message.content` — no steer id. The `[CHỈ ĐẠO CHỜ XỬ LÝ]` block (the only place an id reaches the leader) exists only in a NEW steer turn's prompt.
  implication: secondary defect with the same symptom — if `runLeadSteerTurn` cannot start because the lead runtime is live (`TURN_IN_PROGRESS`, swallowed at `:1702-1703`), the leader reads the steer mid-turn but has no id to pass to `deliver_steer`.

- timestamp: 2026-11-12T00:00:00Z
  checked: tests covering delivery
  found: `tests/services/ai/office/teamRunCoordinator.test.ts:3913` sends the steer as a structured mention `@[${target.name}](agent:${target.id}) đổi hướng`; every `deliver_steer` test uses a targeted row. No test covers a plain-text steer.
  implication: the untargeted path is untested, which is why the gap shipped.

- timestamp: 2026-11-12T00:00:00Z
  checked: how a mention is produced in the composer
  found: `ChatInputBar.tsx:488` inserts `@[${agent.name}](agent:${agent.id})` only when the user selects an option from the mentions dropdown; `TeamWorkspace.tsx:829` placeholder says "Nhắn cho lead hoặc @ một nhân viên...".
  implication: the structured form is an implicit requirement that the UAT step does not follow.

## Resolution

root_cause: "deliver_steer is keyed on the steer row's targetAgentId, which is written only when the user selects an agent from the structured @-mention dropdown (`teamRunCoordinator.ts:1472`, regex at `:253`). A steer typed as plain text that names an agent — exactly the UAT test 5 reproduction `gửi Eva: đổi sang định dạng bảng` — persists with targetAgentId undefined, so deliverSteer refuses it with INVALID_ARGUMENT (`:1751-1757`). No other leader tool can reach a running assignment: amend_assignments refuses non-queued rows (`:1872-1878`), delegate_batch refuses while a batch is open (`:2252`), and there is no stop tool. The leader's reply is an honest report of that dead end. Secondary: drainLeaderSteerQueue (`:1559-1572`) injects steer content without its id, so a steer read at a round boundary can never be delivered either."
fix: ""
verification: ""
files_changed: []
