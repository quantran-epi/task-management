# Quick Task 261114-qjh: Redesign team chat transcript UI

**Approved design:** `docs/design/team-chat-redesign.html` (user-reviewed draft)

## Goal

Make the AI Office team chat transcript scannable: one meta line per message, actions on
hover only, receipts only where they carry information, grouped consecutive messages,
narrower bubbles with role encoded in color, a one-line workspace header, and a compact
sidebar. No schema, coordinator, event-log or cursor changes.

## Locked decisions (from user)

- Dark mode out of scope — the user does not use it. Still use antd `token.*` so the
  surface follows `darkAlgorithm` if it is ever enabled; do not add a `data-theme` block.
- `Debug Prompt` button stays (moved into the header `⋯` menu).
- Both `Xuất đoạn chat` / `Lưu đoạn chat...` stay, inside a per-message `⋯` menu.
- Receipts: render only on user-authored messages. The 3 `TeamWorkspaceReceipts`
  assertions that expect `✓✓` on agent messages are updated to the new contract.

## Tasks

### Task 1 — `src/styles/team-chat.css` + import

New stylesheet holding only what inline style cannot express: `:hover`/`:focus-within`
reveal, transitions, and `prefers-reduced-motion`. Import beside `markdown.css` in
`src/main.tsx`.

Classes:
- `.tc-message` / `.tc-message:hover` / `.tc-message:focus-within` → `.tc-actions`
- `.tc-meter > i` → width + background transition
- `.tc-enter` → one-shot fade/translate for the streaming bubble
- reduced-motion block disabling all three

Verify: `npm run build` type-checks; no `transition: all`.

### Task 2 — `ChatMessageBubble.tsx`

- Time: `dayjs(msg.createdAt).format('HH:mm')` (24h).
- Receipt: render only when `isUser`. Remove the always-on row.
- Meta: one flex row — time · duration · tokens · receipt · actions.
- Actions: `Copy` icon always visible (cheap, useful); `⋯` dropdown holding
  `Xuất đoạn chat` (direct download menu) and `Lưu đoạn chat...` (save-as menu).
  Wrapped in `.tc-actions` so it fades in on hover/focus, but stays keyboard reachable
  (`tabIndex` unchanged, opacity only).
- Bubble width: user `72%`, assistant `82%`.
- Assistant bubble: `token.colorBgContainer` + `colorBorderSecondary`; lead/synthesis
  (`agent?.isLead` or `messageKind === 'synthesis'`) gets `colorPrimaryBg` background and
  a 3px `colorPrimary` left border.
- Keep `data-testid="seen-${id}"` on user rows only.

Verify: `vitest run tests/ai/ChatMessageBubble.test.tsx tests/ai/ChatMessageListAttribution.test.tsx`

### Task 3 — `ChatMessageList.tsx`

- Day divider: before a message whose `createdAt` day differs from the previous rendered
  message; label `Hôm nay` for today, else `DD/MM/YYYY`.
- Grouping: pass `grouped` to the bubble when the previous rendered message has the same
  `agentId` (and both are assistant). Grouped rows drop the attribution header and use a
  tighter bottom margin.

Verify: `vitest run tests/ai/ChatMessageListAttribution.test.tsx tests/components/ai/office/TeamWorkspaceReceipts.test.tsx`

### Task 4 — `TeamWorkspace.tsx` header + alerts

- Header: team name + `›` + lead name + status chip (`Đang chạy` when
  `snapshot.phase` is busy, else `Rảnh`). `Debug Prompt` and `Cài đặt nhóm` move into a
  `⋯` dropdown on the right.
- Alerts: notification-permission and interrupted-turn alerts become single-line strips
  (no `description`), keeping their action buttons.

Verify: `vitest run tests/components/ai/office/TeamWorkspaceReceipts.test.tsx tests/components/ai/office/TeamWorkspaceTypingCost.test.tsx`

### Task 5 — `TeamSidebar.tsx`

- Member row: name + role on line 1, `used/budget` on line 2, 3px meter.
- Meter color by true percentage: `<70` primary, `70–99` warning, `>=100` error.
  Label shows the true percentage (`117%`), the bar clamps at 100.
- Compact figures (`41k / 100k`); the in/out split stays in the `title` tooltip.
- Collapse `Liên kết` / `Chế độ` / `Cài đặt nhóm` into one block with row layout.

Verify: `npm run build`

### Task 6 — Fix 3 receipt assertions

`tests/components/ai/office/TeamWorkspaceReceipts.test.tsx` lines ~233, ~359, ~415:
assert the cursor advanced (data contract unchanged) and that an agent-authored message
renders **no** `seen-` element, while a user-authored one does.

Verify: `vitest run tests/components/ai/office/TeamWorkspaceReceipts.test.tsx`

## Out of scope

Schema, `teamEventLog`, `teamRunCoordinator`, `ChatInputBar`, composer hints, dark theme.
