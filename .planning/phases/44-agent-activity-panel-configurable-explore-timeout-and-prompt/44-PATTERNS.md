# Phase 44: Agent Activity Panel, Configurable Explore Timeout and Prompt Log - Pattern Map

**Mapped:** 2026-11-17
**Files analyzed:** 12 (6 source modified, 1 new source, 4 tests extended, 2 new tests — one new test is optional-or-extend)
**Analogs found:** 12 / 12
**Tracked-source gate:** every analog path below was verified with `git ls-files --error-unmatch <path>` (all TRACKED). No `.gsd/capabilities/**` mirror paths are emitted. The approved design reference `.planning/agent-activity-panel-draft.html` is an upstream planning artifact, not a code analog, and is referenced as design contract only.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/services/remoteExploreService.ts` | service | request-response (stream/watchdog) | self (`:19-22,55-60,210-308`) — add `timeoutMs` seam beside `clampExploreMaxTurns` | exact (source of truth) |
| `src/services/ai/office/teamTools.ts` | service (tool surface) | request-response | self (`:381-408,1492-1499`) — property + handler clamp | exact (source of truth) |
| `src/services/ai/office/teamRunCoordinator.ts` | service (event consumer) | event-driven | self (`:870-903,1458-1465`) + `src/components/ai/AiChatWidget.tsx:149-156` (id upsert) | exact |
| `src/types/aiOffice.ts` | model (types) | transform (additive shape) | self (`:265-281`) | exact (source of truth) |
| `src/components/ai/office/TeamWorkspace.tsx` | component (container/shell) | event-driven | self (`:794-830,889-918,1111-1175`) + `src/views/AgentControlView.tsx:148-239` (3-pane Splitter) | exact |
| `src/components/ai/office/AgentActivityPanel.tsx` (NEW) | component (presentational) | event-driven (snapshot → UI) | `src/components/ai/AiChatWidget.tsx:149-234` (`mergeToolEvents`/`ToolEventBadge`) + `src/components/ai/office/TeamActivityIndicator.tsx:44-88` (`StepRow`) + debug modal markup `TeamWorkspace.tsx:1111-1175` | role-match (composite) |
| `tests/services/remoteExploreService.test.ts` | test | request-response | self (`:188-265` fake-timer watchdog seam) | exact |
| `tests/services/ai/office/teamTools.test.ts` | test | request-response | self (`:81-82` tool-count/definition test) | exact |
| `tests/services/ai/office/teamToolsGitRead.test.ts` | test | request-response | self (`:1073-1188` Block E explore_repo) | exact |
| `tests/services/ai/office/teamRunCoordinator.test.ts` | test | event-driven | self (`:381+` describe blocks) | exact |
| `tests/components/ai/office/AgentActivityPanel.test.tsx` (NEW) | test (component) | event-driven | `tests/components/ai/office/AgentAttributionRow.test.tsx` + `tests/ai/AiChatWidget.test.tsx` | role-match |
| `tests/components/ai/office/TeamWorkspaceDebugMenu.test.tsx` (NEW, or extend `TeamWorkspaceSteer.test.tsx`) | test (component, shell) | event-driven | `tests/components/ai/office/TeamWorkspaceSteer.test.tsx:1-120` (coordinator stub + fake-indexeddb mount) | role-match |

---

## Pattern Assignments

### `src/services/remoteExploreService.ts` (service, request-response)

**Analog:** self — this is the file being modified; copy its own clamp + watchdog patterns.

**Exported constants pattern** (lines 19-25) — add min/max seconds beside the existing constants; keep `EXPLORE_DEFAULT_TIMEOUT_MS = 300_000` unchanged as the default contract (D-01):
```ts
export const EXPLORE_REPORT_MAX_CHARS = 12_000;
export const EXPLORE_DEFAULT_TIMEOUT_MS = 300_000;
export const EXPLORE_DEFAULT_MAX_TURNS = 20;
export const EXPLORE_MAX_TURNS_CAP = 40;
```

**Clamp-helper pattern to mirror** (lines 55-60) — add `clampExploreTimeoutSeconds(value: unknown): number` as a sibling that floors, rejects non-finite → default (300), clamps to `[60, 900]`:
```ts
export function clampExploreMaxTurns(value: unknown): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return EXPLORE_DEFAULT_MAX_TURNS;
  return Math.min(Math.max(1, n), EXPLORE_MAX_TURNS_CAP);
}
```

**Deps seam to extend** (lines 210-217) — add `timeoutMs?: number` here (NOT to `ExploreRequest` at `:27-32`; D-02):
```ts
export interface RunRemoteExploreDeps {
  stream?: typeof execRemoteCommandStream;
  signal?: AbortSignal | undefined;
}
```

**Single timer line to change** (lines 294-308) — change ONLY the duration source to the derived `timeoutMs` (default `EXPLORE_DEFAULT_TIMEOUT_MS`). Leave the callback body, `cancelOnArrival`, `finish`, abort listener, 4× buffer and `capReport` byte-for-byte:
```ts
timer = setTimeout(() => {
  cancelOnArrival = true;
  void cancel?.().catch(() => undefined);
  finish(capReport({ report: stdout.trim(), truncated: false, outcome: 'error', detail: 'timeout' }));
}, EXPLORE_DEFAULT_TIMEOUT_MS);   // → }, timeoutMs);
```

---

### `src/services/ai/office/teamTools.ts` (service / tool surface, request-response)

**Analog:** self.

**Tool definition property pattern** (lines 381-407) — add a `timeoutSeconds` number property beside `maxTurns`; append range + default to the description (D-01/D-03):
```ts
function: {
  name: 'explore_repo',
  description: '... Dùng khi muốn hiểu cả một vùng code ...', // append "timeoutSeconds 60..900, mặc định 300"
  parameters: {
    type: 'object',
    properties: {
      question: { type: 'string', description: 'Câu hỏi cần trả lời, ví dụ ...' },
      systemId: { type: 'string', description: '...' },
      model: { type: 'string', description: 'Model chạy trên remote, mặc định haiku.' },
      maxTurns: { type: 'number', description: 'Số lượt tối đa ..., mặc định 20, tối đa 40.' },
      // ADD timeoutSeconds here — it is a parameter property, NOT a new tool (count stays 12).
    },
    required: ['question'],
  },
},
```

**Handler clamp + conditional signal spread** (lines 1492-1499) — compute `timeoutMs = clampExploreTimeoutSeconds(args.timeoutSeconds) * 1000` and pass as a required deps field while keeping the conditional signal spread (avoids `exactOptionalPropertyTypes` failure — Pitfall 5):
```ts
const maxTurns = clampExploreMaxTurns(args.maxTurns);

const result = await runRemoteExplore(config, secret, {
  repoPath, question, model, maxTurns,
}, ctx.signal ? { signal: ctx.signal } : {});
// → { timeoutMs, ...(ctx.signal ? { signal: ctx.signal } : {}) }
```

**Import pattern** (line 40) — add the new clamp import beside `clampExploreMaxTurns`:
```ts
import { ..., clampExploreMaxTurns, runRemoteExplore, ... } from '../../remoteExploreService';
```

---

### `src/services/ai/office/teamRunCoordinator.ts` (service, event-driven)

**Analog:** self for state writes + `src/components/ai/AiChatWidget.tsx:149-156` for id-based merge (canonical precedent).

**Ceiling + id source** (lines 374-381) — reuse `stepSeq` and `MAX_LIVE_STEPS = 200`; do not add a second ceiling:
```ts
let stepSeq = 0;
const MAX_LIVE_STEPS = 200;
```

**State-write helper to reuse** (lines 870-878) — `updateAgent` is the single writer; the upsert must go through it:
```ts
function updateAgent(agentId: string, patch: Partial<AgentRunState>): void {
  const existing: AgentRunState = agents.get(agentId) ?? { agentId, status: 'queued', streamingText: '' };
  agents.set(agentId, { ...existing, ...patch });
  notify();
}
```

**pushStep to replace for tool events** (lines 887-903) — keep this function for `onStatus` status steps; note the `...(detail !== undefined ? { detail } : {})` conditional-spread convention and `.slice(-MAX_LIVE_STEPS)`:
```ts
function pushStep(agentId: string, label: string, detail?: string): void {
  const state = agents.get(agentId);
  if (!state) return;
  const steps = state.steps ?? [];
  if (steps[steps.length - 1]?.label === label) return;
  stepSeq += 1;
  const next = [...steps, {
    id: 'step-' + stepSeq,
    label,
    at: new Date().toISOString(),
    ...(detail !== undefined ? { detail } : {}),
  }];
  updateAgent(agentId, { steps: next.slice(-MAX_LIVE_STEPS) });
}
```

**Id-merge precedent to follow** — `src/components/ai/AiChatWidget.tsx:149-156`:
```ts
function mergeToolEvents(events: ChatTurnToolEvent[]): ChatTurnToolEvent[] {
  const byId = new Map<string, ChatTurnToolEvent>();
  for (const event of events) {
    const previous = byId.get(event.id);
    byId.set(event.id, { ...previous, ...event });
  }
  return [...byId.values()];
}
```

**onToolEvent currently discards results** (lines 1458-1465) — this is the exact block D-05 replaces. Preserve the `label` string (`'đang gọi tool ' + event.name` / `'đã đọc skill'`) and `detail = event.args` so the compact popover keeps working (Pitfall 3):
```ts
onToolEvent: (event) => {
  if (event.phase !== 'call') return;              // REMOVE — consume both phases
  pushStep(agentId,
    event.name === 'read_skill' ? 'đã đọc skill' : 'đang gọi tool ' + event.name,
    event.args);
},
```

**Status derivation source shapes** — tool result is a JSON **string** (`teamTools.ts:1501-1512`, `:1558`), refusal shape `teamTools.ts:120-128`, timeout outcome `remoteExploreService.ts:300-307` (`outcome: 'error', detail: 'timeout'`). Parse with `JSON.parse` in try/catch: `refused === true || error || outcome === 'error'` → `'error'`; unparseable → `'done'` (Pitfall 1 / A2).

---

### `src/types/aiOffice.ts` (model, additive transform)

**Analog:** self.

**Exact interface to extend additively** (lines 265-281) — keep `id`/`label`/`at`/`detail` intact; all new fields optional with explicit `| undefined` (project pattern under `exactOptionalPropertyTypes`):
```ts
export interface AgentLiveStep {
  id: string;
  label: string;
  at: string;
  detail?: string | undefined;
}
export interface AgentRunState {
  agentId: string;
  status: AgentRunStatus;
  streamingText: string;
  startedAt?: string | undefined;
  incomplete?: boolean | undefined;
  steps?: AgentLiveStep[] | undefined;
}
```
Add (D-04): `toolName?`, `phase?: 'call' | 'result'`, `startedAt?`, `endedAt?`, `durationMs?`, `status?: 'running' | 'done' | 'error'`, `resultPreview?`. Note `AgentRunState` already has a `startedAt?` — the new `startedAt?` belongs on `AgentLiveStep`, not the run state.

---

### `src/components/ai/office/TeamWorkspace.tsx` (component / container, event-driven)

**Analog:** self for Splitter/menu/modal; `src/views/AgentControlView.tsx:148-239` for the 3-pane precedent.

**Imports to prune** (lines 1-3) — remove `Modal` and `BugOutlined` when the debug modal/menu go (D-15, Pitfall 6):
```tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Avatar, Button, Dropdown, Modal, Splitter, Tag, Typography, theme } from 'antd';
import { BugOutlined, SettingOutlined } from '@ant-design/icons';
```

**State to remove / keep** (lines 166-167) — remove `debugModalOpen`; KEEP `debugLogs`/`setDebugLogs` and `TeamDebugLog` (`:120-129`, captured at `:353-365`):
```tsx
const [debugLogs, setDebugLogs] = useState<TeamDebugLog[]>([]);
const [debugModalOpen, setDebugModalOpen] = useState<boolean>(false);  // REMOVE
```

**Debug-capture block to preserve unchanged** (lines 353-365) — the `runLoop` override that fills `debugLogs` is untouched (D-14):
```tsx
setDebugLogs((prev) => [...prev, {
  timestamp: new Date().toLocaleTimeString(),
  agentId, agentName, agentKind, model: opts.model,
  text, systemMessages, toolNames,
}]);
```

**2-pane Splitter to extend to 3** (lines 794-830) — add a third `Splitter.Panel` to the right of the transcript panel; the current panels are:
```tsx
<Splitter style={{ height: '100%', borderRadius: 8, overflow: 'hidden', background: token.colorBgContainer }}>
  <Splitter.Panel defaultSize={300} min={260} max={380}><TeamSidebar ... /></Splitter.Panel>
  <Splitter.Panel>
    {/* header :832-919 + transcript :921-1047 */}
  </Splitter.Panel>
  {/* ADD third Panel here for <AgentActivityPanel ... /> */}
</Splitter>
```
3-pane precedent — `src/views/AgentControlView.tsx:158,173,214`: `<Splitter.Panel defaultSize="22%" min="220px">`, `"45%"/"400px"`, `"33%"/"320px"`.

**Dropdown item to remove** (lines 894-899) — the `debug` menu item; keep the `settings` item:
```tsx
{ key: 'debug', icon: <BugOutlined />, label: `Debug Prompt (${debugLogs.length})`, onClick: () => setDebugModalOpen(true) },  // REMOVE
```
Add the "Activity" affordance Button here in the header (near status chip `:865-888` / Dropdown `:889-918`), per D-10.

**Modal block to remove in full** (lines 1111-1175) — the whole `<Modal title="Debug: Lịch sử Prompt gửi tới AI trong nhóm">…</Modal>` including footer clear/close buttons and the `.map` render. Its markup shape (`Tag agentKind`, `timestamp`, `Model/Tools` line, `<pre whiteSpace:'pre-wrap'>` for `text` and `systemMessages`) is the source to port into the Prompt-log tab.

**Injection point for the compact indicator** (lines 755-763) — `transcriptExtensions` hosts `<TeamActivityIndicator>`; leave unchanged if the upsert preserves `label`/`at`/`detail` (Pitfall 3 / Open Question 2).

---

### `src/components/ai/office/AgentActivityPanel.tsx` (NEW — component, presentational)

**Primary analog:** `src/components/ai/AiChatWidget.tsx:145-234` (`mergeToolEvents` + `ToolEventBadge`). Secondary: `src/components/ai/office/TeamActivityIndicator.tsx:44-88` (`StepRow`), debug-modal markup `TeamWorkspace.tsx:1125-1174`. Design reference (not production code): `.planning/agent-activity-panel-draft.html`.

**Imports pattern** (AiChatWidget `:1-8`, TeamActivityIndicator `:1-8`) — individual icons, `theme.useToken()`, dayjs, in-repo types + safe renderer:
```tsx
import React, { useState } from 'react';
import { Button, Tabs, Tag, Empty, Tooltip, Progress, Popconfirm, Typography, theme } from 'antd';
import { CheckCircleOutlined, SyncOutlined, CloseCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { AgentLiveStep, AgentRunState } from '../../../types/aiOffice';
import { renderSafeMarkdown } from '../../../utils/markdown'; // optional; plain <pre> preferred
```
(Define/import the `TeamDebugLog` shape for the Prompt-log tab — today it is local to `TeamWorkspace.tsx:120-129`; keep the shape identical, D-14.)

**Collapsed, capped, accessible row pattern** (AiChatWidget `:161-234`) — copy this structure for event rows; collapsed by default, capped preview, `aria-expanded`/`aria-controls`, own `maxHeight`/`overflowY`, plain-text `<pre>` (no `dangerouslySetInnerHTML` on raw tool text):
```tsx
const [expanded, setExpanded] = useState(false);
const detailsId = `tool-event-${event.id.replace(/[^A-Za-z0-9_-]/g, '-')}`;
<button type="button" aria-expanded={expanded} aria-controls={detailsId}
        onClick={() => setExpanded((prev) => !prev)}>…</button>
{expanded && <div id={detailsId} style={{ maxHeight: 240, overflowY: 'auto', wordBreak: 'break-word' }}>
  <Typography.Text type="secondary">Tham số</Typography.Text>
  <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{cappedPreview}</pre>
</div>}
```

**Capping + truncated marker** (AiChatWidget `:158`, `:224-226`) — mirror `ARTIFACT_DETAIL_CAP` constant style; use `8_000` for args/result previews and append `… (đã rút gọn)`:
```tsx
const PREVIEW_CAP = 8_000;
```

**Timestamp/duration format** (TeamActivityIndicator `:70-76`) — dayjs `HH:mm:ss` for timestamps; duration formats `312ms` / `1m23s` per UI-SPEC.

**Expandable clock+label row with keyboard parity** (TeamActivityIndicator `:44-88`) — `role="button"`, `tabIndex=0`, `onKeyDown` handling `Enter`/`' '` with `preventDefault()`.

**Status icons** (AiChatWidget `:187-191`) — `CheckCircleOutlined` (done), `SyncOutlined spin` (running); add a danger `CloseCircleOutlined` for error per UI-SPEC. Always pair icon with text label ("xong"/"đang chạy"/"lỗi").

**Empty state** (TeamWorkspace `:1125-1126`, TeamActivityIndicator `:175-177`) — `Typography.Text type="secondary"` copy from UI-SPEC Copywriting Contract ("Chưa có tool call nào", "Chưa có lượt gửi AI nào trong phiên này.").

**Filter pills + tab semantics (from draft HTML)** — `role="group" aria-label="Lọc theo agent"` for pills; `role="tablist"/"tab"/"tabpanel"` with `aria-selected`/`aria-controls` for Timeline|Prompt log (AntD `Tabs` acceptable per D-11 discretion). Every flex child `minWidth: 0`; previews wrap in own `overflow:auto` container (Pitfall 7).

**No Analog note:** there is no pre-existing dedicated activity-rail component; this is the first. UI structure comes from the approved draft + UI-SPEC, low-level patterns come from the analogs above.

---

### Tests

#### `tests/services/remoteExploreService.test.ts` (extend)
**Analog:** self `:188-265` — fake-timer watchdog seam. `request()` builder at `:27-33`; `afterEach(() => vi.useRealTimers())` at `:38-40`. Add clamp boundary cases (60/900/default 300, non-integer/out-of-range) and a case advancing a custom derived `timeoutMs` (e.g. `vi.advanceTimersByTimeAsync(60_000)`) that still cancels + reports `detail: 'timeout'`. Keep the 300_000-based cases as regression coverage.

#### `tests/services/ai/office/teamTools.test.ts` (extend)
**Analog:** self `:81-82` pins `expect(names).toHaveLength(12)` — **do not bump to 13** (Pitfall 8). Add a schema-property assertion that `explore_repo`'s `parameters.properties.timeoutSeconds` exists and the description mentions range/default (D-03a).

#### `tests/services/ai/office/teamToolsGitRead.test.ts` (extend, Block E)
**Analog:** self `:1073-1188` — `vi.mock('../../../../src/services/sshService')` at `:22`; `execRemoteCommandStream` mocked to observe the stream (`:1096`). Add a case asserting the mocked `runRemoteExplore` receives derived `timeoutMs` (D-03b/c wiring) — stub at the seam used by Block E.

#### `tests/services/ai/office/teamRunCoordinator.test.ts` (extend)
**Analog:** self — `// @vitest-environment node`, fake-indexeddb `new TaskPlannerDatabase(...)`, `createTeamRunCoordinator`, `makeTeamRunSnapshot` helper (imports `:1-60`). Add a `describe('tool event upsert')` block: call+result pair into one row keyed by id; result no longer discarded; status from payload (refused/error/thrown → error, success → done, call-only → running); args/result capped at 8 000; timeline capped at 200. Observe via the coordinator's snapshot `agents[].steps`.

#### `tests/components/ai/office/AgentActivityPanel.test.tsx` (NEW)
**Analog:** `tests/components/ai/office/AgentAttributionRow.test.tsx` (RTL `render`/`screen`/`fireEvent`, `toBeInTheDocument`, testid queries) + `tests/ai/AiChatWidget.test.tsx`. Use fixture `AgentRunState[]`/`TeamDebugLog[]` props; assert tabs, filter, progress card, collapsed-by-default expansion (`aria-expanded`/`aria-controls`), 8 000-char preview cap with no horizontal overflow, and empty states. `user-event` is NOT installed — use `fireEvent`.

#### `tests/components/ai/office/TeamWorkspaceDebugMenu.test.tsx` (NEW, or extend `TeamWorkspaceSteer.test.tsx`)
**Analog:** `tests/components/ai/office/TeamWorkspaceSteer.test.tsx:1-120` — coordinator stub (`createStub`), `vi.mock('.../teamRunCoordinator')` overriding `createTeamRunCoordinator` to return `currentStub` (`:80-87`), fake-indexeddb `TaskPlannerDatabase` with settings seeded (`:109-118`). Assert the `Debug Prompt (…)` dropdown item and the `<Modal title="Debug: …">` are gone, and the Activity affordance opens the rail with the Prompt-log tab preserving log content (D-15/D-16).

---

## Shared Patterns

### Untrusted tool-output containment
**Sources:** `src/utils/markdown.ts:7-14` (`escapeHtml`), `src/components/ai/AiChatWidget.tsx:211-229` (capped, escaped preview), `src/services/ai/office/teamTools.ts:1508-1511` (`wrapUntrusted`).
**Apply to:** all panel previews (args, result, question snippet, prompt-log text). Cap at 8 000 chars at write time (coordinator) AND render as plain-text `<pre>` / `renderSafeMarkdown`; never `dangerouslySetInnerHTML` on raw tool output; never auto-expand; add `… (đã rút gọn)` marker.
```ts
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
```

### `exactOptionalPropertyTypes` conditional spread
**Sources:** `src/services/ai/office/teamRunCoordinator.ts:899` (`...(detail !== undefined ? { detail } : {})`), `src/services/ai/office/teamTools.ts:1499` (`ctx.signal ? { signal: ctx.signal } : {}`), `src/components/ai/office/TeamWorkspace.tsx:574,578-592`.
**Apply to:** every new optional field on `AgentLiveStep` and every `RunRemoteExploreDeps` call. Never set an optional field to `undefined` explicitly.

### AntD theme tokens
**Source:** `src/components/ai/office/TeamWorkspace.tsx:140` (`const { token } = theme.useToken()`); tokens used at `:799,839,884,1134-1160`. Theme adapter `src/workbench/AntdThemeAdapter.tsx`; CSS tokens `src/styles/workbench-tokens.css`.
**Apply to:** all panel colors/spacing; use `token.colorPrimary`, `colorSuccess`, `colorError`/danger, `colorBorderSecondary`, `colorBgContainer`, `colorFillAlter`. No hard-coded light-only hex; status = icon + text, never color alone.

### dayjs time formatting
**Source:** `src/components/ai/office/TeamActivityIndicator.tsx:3,70-72` (`dayjs(step.at).format('HH:mm:ss')`).
**Apply to:** event timestamps and progress-card elapsed/deadline (`HH:MM / MM:SS`), duration labels.

### Status/refusal payload shapes (payload-derived status, D-08)
**Sources:** `src/services/ai/office/teamTools.ts:120-128` (`refuse` → `{ refused: true, code, message }`), `:1501-1512` (result JSON has `outcome`, `detail: 'timeout'`), `src/services/remoteExploreService.ts:300-307`. Tool result is a JSON **string** — always `JSON.parse` in try/catch before inspecting fields.

### Test infrastructure
**Source:** `vite.config.ts:65-80` (Vitest 5.0.2, jsdom, globals, `tests/setup.ts`), `tests/services/remoteExploreService.test.ts:1-40`, `tests/components/ai/office/TeamWorkspaceSteer.test.tsx:1-120`. Run focused files only (`npx vitest run <file>`); never the full suite. `@testing-library/user-event` absent → `fireEvent`.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/components/ai/office/AgentActivityPanel.tsx` | component | event-driven | No dedicated activity rail exists today; the compact `TeamActivityIndicator` popover is the nearest reader of `AgentRunState.steps`, and its expandable-row/capping patterns are reusable. UI structure itself comes from the approved `44-UI-SPEC.md` + `.planning/agent-activity-panel-draft.html` (design reference), not from production code. |

(All other files either have same-file patterns to extend or a direct component/service analog, as shown in the classification table.)

## Metadata

**Analog search scope:** `src/services/`, `src/services/ai/office/`, `src/types/`, `src/components/ai/`, `src/components/ai/office/`, `src/components/ai/runtime/`, `src/views/`, `src/utils/`, `src/workbench/`, `src/styles/`, `tests/services/`, `tests/services/ai/office/`, `tests/components/ai/office/`, `tests/ai/`, `tests/agents/`, `.planning/phases/44-*/`.
**Files scanned:** ~20 candidate files; 3–5 strong analogs selected per slice.
**Analog read policy:** each file/range read once (wide range for files ≤ 2000 lines; targeted non-overlapping ranges for the 4014-line `teamRunCoordinator.ts` and the 567-line `AiChatWidget.tsx`).
**Pattern extraction date:** 2026-11-17
