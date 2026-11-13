# Phase 38: Hard token budget + accurate measurement — Research

**Researched:** 2026-11-13
**Domain:** Dexie 4 atomic accounting, budget ledger schema/backup parity, provider usage plumbing, local tokenizer estimation, two-level threshold warnings
**Confidence:** HIGH on current-code facts (every claim below read this session); MEDIUM on js-tiktoken integration shape; LOW on cache-token field names from 9router (provider-dependent)

## Summary

The budget system already exists but is wrong in three independent ways. (1) `budgetGate.ts:78-96` measures only a single total and its gate **parks turns** — which D-01/D-02 explicitly abolish. (2) `aiTeamRepo.addUsedTokens` (`:497-508`) does a get-then-`update` outside any transaction; I reproduced the lost-update with the project's real Dexie 4.4.6 + fake-indexeddb 6.2.5: **20 concurrent increments land as 1**. (3) `handleUsage` (`teamRunCoordinator.ts:1242-1285`) throws away the input/output split and only ever writes a single `usedTokens` scalar, so the display can never separate input from output. `topUp` for a team increases only `AiTeams.budgetTokens` and never touches member rows (`:3198-3211`), which is the bug D-16 names.

The phase therefore is mostly **ledger surgery**, not UI work: new persisted columns (`inputTokens`/`outputTokens`/estimate flag on member rows and attempt rows), a real atomic increment, one shared even-split function, a genuinely two-table top-up transaction, a configurable threshold replacing the hard-coded 0.8, and warning-only behaviour replacing both gates. Because the schema changes, all five coordinated lists must move in one changeset (Dexie V25, backup envelope 13→14, validate, export, restore, SQLite TS + Rust).

One trap discovered: **two migration tests are already red on this branch** because LATEST_SCHEMA_VERSION moved to 24 without their literal assertions being updated (`tests/db/tableListParity.test.ts:101` expects 23; `tests/db/schemaV22Migration.test.ts:70` expects 23). Verified by running both. Phase 38 must repair them or the phase gate cannot be green.

**Primary recommendation:** Add `inputTokens`/`outputTokens`/`usageEstimated` columns, make `addUsedTokens` a real `db.transaction('rw', …)` read-modify-write (verified correct under 20-way concurrency), delete the gate wait from `beforeToolRoundFor` and replace the gate crossing with a two-level warning, and put the threshold in `AiTeam.budgetWarnThresholdPct` with a global `settings` fallback.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** **Budget chỉ cảnh báo, không bao giờ chặn.** Không có pre-call refusal, không có pause-gate. Lượt vượt ngân sách vẫn được gửi tới model. Lý do (user): *"chỉ có ngưỡng cảnh báo, không được chặn, phải ưu tiên hoàn thành công việc chứ không phải đứt giữa chừng"*. — **Reversibility:** costly.
- **D-02:** Chạm/vượt 100% của member hoặc tổng nhóm → **cảnh báo trong app + OS notification**; user **tự bấm Stop** nếu muốn dừng. Không tự abort, không hỏi xác nhận trên chat, không nút "tiếp tục".
- **D-03:** Cảnh báo hai mức, **hai badge riêng**: Member (vượt phần được cấp → cảnh báo nhẹ, gợi ý top-up); Nhóm (tổng vượt tổng cấp → cảnh báo mạnh). Hai mức độc lập.
- **D-04:** Ngưỡng cấu hình: **global default trong Settings** + **override trên từng `AiTeam`**. Field override trên `AiTeam` phải đi đủ 5 danh sách (Dexie schema, export, restore, validate, SQLite TS + Rust); giá trị global nằm ở `settings` table và phải qua `isSafeBackupSetting` whitelist (theo Phase 31 D-03).
- **D-05:** Ngưỡng là **một con số % duy nhất** áp cho cả hai mốc. Không có nhiều nấc. Nhóm dùng cùng giá trị trừ khi `AiTeam` override.
- **D-06:** Chống spam notification: mỗi (nhóm, mức cảnh báo) chỉ gửi **một** OS notification cho tới khi được reset bởi top-up hoặc lượt mới.
- **D-07:** Đo prompt trước khi gọi bằng **tokenizer cục bộ** (`js-tiktoken`) — dependency mới được user chấp nhận tường minh. Chỉ dùng để **ước lượng và cảnh báo**, không dùng để chặn.
- **D-08:** Khi provider trả `usage`, dùng số đó; `js-tiktoken` chỉ là fallback. Không trộn hai nguồn trong cùng một lượt nếu đã có số thật.
- **D-09:** Charge **cả input lẫn output** trên mọi request. `normalizeUsageTotal` phải giữ lại cả hai. `cache_read` và `cache_creation` **được tính vào budget** như token thường. Budget là thước đo token luỹ kế theo provider, không phải chi phí quy đổi.
- **D-10:** Response **không có `usage`** → **ước lượng bằng tokenizer** trên prompt đã gửi + văn bản đã nhận, ghi rõ là ước lượng. UI đánh dấu ước lượng (tiền tố `~` + tooltip). **Không bao giờ free**, không bao giờ im lặng ghi 0.
- **D-11:** Retry và lần fail đều tính tiền; usage ghi trên **attempt row tương ứng**. Attempt = row mới đã là quyết định Phase 37 D-23; phase này chỉ thêm field usage lên row đó.
- **D-12:** Stream bị abort giữa đường: dùng `usage` do provider trả nếu có; thiếu thì ước lượng phần đã nhận bằng tokenizer và đánh dấu ước lượng. Không bỏ qua lượt abort.
- **D-13:** `addUsedTokens` phải là **increment nguyên tử thật**. Phải nằm trong `db.transaction('rw', …)` với read-modify-write bên trong, hoặc dùng `table.where(...).modify(...)`. Tiêu chí: 20 increment đồng thời cộng đúng.
- **D-14:** Chia đều không hết → **phần dư dồn về leader** (giữ nguyên `writeEvenSplit` `aiTeamRepo.ts:86`). Quy tắc hiện bị **copy hai nơi** — gom về một hàm dùng chung.
- **D-15:** Thêm agent sau khi đã cấp budget: **không chia lại**. Agent mới nhận `budgetTokens = 0` cho tới khi được top-up.
- **D-16:** **Top-up nhóm** → chia đều phần tăng cho mọi member hiện tại, trong **một** transaction, cùng hàm chia đều với D-14.
- **D-17:** **Top-up từng agent** → tăng phần của agent đó **và tăng tổng nhóm** trong cùng một transaction.
- **D-18:** **WR-13**: top-up phải **đọc roster tươi từ Dexie** thay vì dùng `ensureMembers` cache. Agent thêm giữa chừng top-up được ngay.
- **D-19:** Mọi thay đổi budget nhiều bảng (member + team) là **một transaction**.
- **D-20:** Vị trí hiển thị: **header nhóm** (đã cấp / đã dùng / còn lại) + **sidebar member**. **Không** hiện số trên từng bubble.
- **D-21:** Đơn vị: **token thô có phân cách hàng nghìn + % phụ**. Không hiện tiền ước tính.
- **D-22:** Số cập nhật **live trong lượt** từ coordinator live state, nhưng ledger chỉ ghi DB khi lượt/attempt kết thúc. UI và DB có thể lệch trong lúc chạy và phải thu về đúng khi xong.
- **D-23:** **Input và output lưu tách hai cột** trên member và attempt row; UI hiện tách. Cần đổi backup schema + SQLite TS + Rust trong cùng changeset.
- **D-24:** Hiển thị trạng thái ước lượng: giá trị ước lượng có tiền tố `~` và tooltip "ước lượng".
- **D-25:** Ghi override D-01/D-02 vào `REQUIREMENTS.md` (AIO-BUDGET-01, AIO-BUDGET-09) và `ROADMAP.md` §Phase 38 success criteria 1 & 6.

### Claude's Discretion
- Tên field ledger cho input/output (phải qua `FORBIDDEN_BACKUP_KEYS`; tránh `error`, `runtime`, `prompt`, `stack`, `diagnostic`).
- Vị trí chính xác của badge trong header nhóm và sidebar.
- Cách hiển thị badge khi cả hai mức cùng vượt.
- Cache tokenizer instance giữa các lượt hay khởi tạo theo model.
- Số Dexie version kế tiếp và tên field override trên `AiTeam`.

### Deferred Ideas (OUT OF SCOPE)
- Skill versioning/enrichment → Phase 39.
- Explorer 2 tầng, CRUD correctness, walkthrough tổng → Phase 40.
- Bảng giá model / quy đổi token sang tiền — không có trong phase này.
- Cảnh báo budget trên kênh khác ngoài OS notification (email, webhook).
- Migration bảo toàn dữ liệu budget cũ — C-16 loại bỏ.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AIO-BUDGET-01 | ~~Refuse a turn whose prompt exceeds remaining budget~~ → **OVERRIDDEN by D-01**: never refuses; turn always runs | Gate wait removed from `beforeToolRoundFor` (`teamRunCoordinator.ts:1339-1344`); `derivePhase`'s `awaiting-budget` branch (`:597-600`) replaced by warning state |
| AIO-BUDGET-02 | Input and output both charged on every request; no-usage response still increments | Split accounting in `handleUsage` (`:1242-1285`); estimation fallback (D-10) via js-tiktoken; policy documented in §Usage policy |
| AIO-BUDGET-03 | Retries charged per attempt | Attempt rows already append-only (Phase 37 D-23); add `inputTokens`/`outputTokens` to `AiTeamAssignment` and write them in `finalizeAttempt` |
| AIO-BUDGET-04 | 20 concurrent increments sum correctly | Verified fix pattern experimentally (§Atomic increment); `tests/services/ai/office/aiTeamRepo.test.ts` is the home |
| AIO-BUDGET-05 | Even split with deterministic remainder | `splitBudget` (`aiTeamRepo.ts:69-71`) + remainder-on-lead (`:84-89`); hoist to one shared pure function |
| AIO-BUDGET-06 | Configurable threshold warning | `shouldNotifyPause`'s hard-coded `>= 8` (`budgetGate.ts:89-91`) becomes a percent parameter; `AiTeam.budgetWarnThresholdPct` + `settings` fallback |
| AIO-BUDGET-07 | Per-agent top-up raises member share AND group total in one transaction | Rewrite `topUp` agent branch (`:3181-3197`) + `topUpMemberBudget` (`aiTeamRepo.ts:467-480`) into one `rw` over both tables |
| AIO-BUDGET-08 | Display granted/used/remaining per group and per member, input+output separate | `TeamSidebar.tsx:140-154` (group) and `:115-121` (member); `AiTeamMember` gains split columns |
| AIO-BUDGET-09 | ~~Pause between tool rounds and resume on top-up~~ → **OVERRIDDEN by D-01/D-02**: warn only, user presses Stop | Same as AIO-BUDGET-01; `AgentPausedBanner` becomes a budget-warning banner |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

Actionable directives extracted from `./CLAUDE.md`, to be verified by the planner:

- **Tauri is the only supported runtime for this work.** Do not research, add, debug or validate PWA / GitHub Pages behaviour. (Notably: `vite-plugin-pwa` and `navigateFallback` in `vite.config.ts` are pre-existing and out of scope — do not "fix" them here.)
- **No new dependencies without explicit user approval.** `js-tiktoken` is approved (D-07); anything else (e.g. `gpt-tokenizer`, a date/format helper beyond `dayjs`) must be raised as an open question first.
- **IndexedDB is the working data store** and domain state belongs in Dexie, not Zustand. Live runtime state (usage counters, warning markers) is module-level service state — matching the existing `listeners` exception.
- **Data safety:** backup import must validate format and must not replace good local data without confirmation. New backup schema fields therefore need validation **and** round-trip coverage, not just an export change.
- **Stable client-generated UUIDs** — `crypto.randomUUID()` via `generateId()` (`src/utils/uuid.ts`); never add a `uuid` package.
- **UI is Ant Design.** Interactions must stay simple, fast, responsive, accessible — a11y attributes on the new badges (`role="status"`, `aria-label`) follow the existing `AgentPausedBanner` precedent.
- **Dates:** persist calendar days as `YYYY-MM-DD`; timestamps stay ISO strings (`new Date().toISOString()`), matching every existing ledger write.
- **No full Vitest suite** — focused files only (also a user memory rule).
- **GSD workflow enforcement:** file changes go through a GSD command; research writes only this document.


| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Usage measurement (input/output split) | AI runtime / service (`chatTurnRuntime` → coordinator) | Provider client (`nineRouterClient`) | The runtime is the only funnel (`onUsage`), the coordinator is the only budget owner |
| Token estimation when usage absent | AI service (coordinator settle path) | Tokenizer module (`js-tiktoken` lite) | Estimation needs both the sent prompt and the received text, which only the coordinator holds |
| Atomic ledger increment | DB / repository (`aiTeamRepo`) | — | Dexie transaction is the only place atomicity is expressible |
| Even split / top-up / remainder | DB / repository (`aiTeamRepo`) | UI (settings drawer preview only) | One shared function; UI must not re-implement the rule |
| Threshold evaluation + warning dedupe | AI service (coordinator live state) | UI (badges, banner) + OS notification util | Only the coordinator sees live usage between DB writes (D-22) |
| Threshold config (global + per-team) | DB (`settings`, `aiTeams`) | UI (Settings card, team drawer) | Persisted configuration |
| Display granted/used/remaining | UI (`TeamSidebar`, header) | Coordinator snapshot for the live portion | Live numbers are memory state; authoritative numbers are Dexie |
| Backup/restore/SQLite parity | Service (`backup/*`, `localSqlitePersistence`) + Rust | — | Five coordinated lists; a miss breaks the app's own next restore |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| dexie | 4.4.6 (already installed) | Atomic increments + multi-table `rw` transactions | The only way to express "20 concurrent increments sum correctly" over IndexedDB |
| dexie-react-hooks | 4.4.0 (already installed) | Live member/team rows in the sidebar | Already the pattern (`TeamWorkspace.tsx:193`) |
| js-tiktoken | **1.0.21** | Local prompt/response token estimation (D-07) | Pure-JS BPE port; ships per-encoding rank files so only `o200k_base` need be loaded |
| zod | 4.6.5 (already installed) | Boundary validation for the new columns | Existing convention (`aiOfficeSchemas.ts`, `backupSchemas.ts`) |
| @tauri-apps/plugin-notification | already installed | OS notification for threshold warnings | Reused via `src/utils/desktopNotification.ts:89` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| antd `Alert` | 6.6.5 | In-app warning banner + member/team badges | Workspace-scoped warning surface (replaces `AgentPausedBanner` copy) |
| base64-js | 1.5.1 (transitive, present in `package-lock.json:5994`) | js-tiktoken's only dependency | Nothing to do |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| js-tiktoken | `gpt-tokenizer`, `@dqbd/tiktoken` (WASM) | `@dqbd/tiktoken` is WASM: extra binary to ship in Tauri, async init. `gpt-tokenizer` is smaller but a second unknown dep. **D-07 already named js-tiktoken** — do not re-litigate. |
| js-tiktoken | chars ÷ 4 heuristic | Already used at `aiOrchestratorLoop.ts:217` for tool overhead. Fine for window compaction, but D-07 explicitly requires a real tokenizer for the ledger. |
| `where().modify()` | `db.transaction('rw', …)` + get/update | Both are atomic (verified). Transaction wins here because the caller needs the resulting row and the team aggregate; `modify` returns only a count. |

**Installation:**
```bash
npm install js-tiktoken@1.0.21
```

**Version verification:** `npm view js-tiktoken version` → `1.0.21`; `time.modified` → `2025-08-09T01:00:31.537Z`; `time.created` → `2023-05-13`; license MIT; repository `github.com/dqbd/tiktoken`; dependency `base64-js@^1.5.1` (already in the lockfile). Tarball contents inspected: `dist/index.js` 5.4 MB (all encodings — do NOT import), `dist/lite.js` 4 KB, `dist/ranks/o200k_base.js` 2.3 MB raw / **1.14 MB gzip**, `dist/ranks/cl100k_base.js` 1.1 MB raw / 505 KB gzip.

## Package Legitimacy Audit

> Phase installs exactly one external package.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| js-tiktoken | npm | published 2023-05-13 (3.5 yrs) | not returned by the check seam (signals `null`) | `github.com/dqbd/tiktoken` (declared in registry metadata) | **SUS** by the seam (reasons: `unknown-age`, `unknown-downloads`, `no-repository` — the seam's registry probe returned null for all three, while `npm view` does return age and repo) | **Approved by user decision D-07**, but planner MUST add a `checkpoint:human-verify` task before `npm install` because the automated verdict is not OK |

Notes actually verified this session (not from the seam): MIT licence, single maintainer `davidduong`, one runtime dependency, no `postinstall` script reported by `npm view js-tiktoken scripts.postinstall` (empty output).

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** `js-tiktoken` — keep, but gate the install behind a human checkpoint; the user has already approved this specific package in D-07, so the checkpoint is a formality confirming the version pin (`1.0.21`) rather than a re-decision.

## Architecture Patterns

### System Architecture Diagram

```
                        ┌──────────────────────────────────────────────┐
                        │  Provider (9router, OpenAI-compatible)        │
                        └───────────────┬──────────────────────────────┘
              stream chunks (usage)     │            no usage chunk
                        ┌───────────────▼──────────────┐
                        │ aiOrchestratorLoop           │
                        │  accumulates prompt/completion│
                        └───────────────┬──────────────┘
                                        │ onUsage(cumulative)
                        ┌───────────────▼──────────────┐
                        │ ChatTurnRuntime              │
                        │  tokenUsage += chunk         │
                        │  deps.onUsage(tokenUsage)    │
                        └───────────────┬──────────────┘
                                        │
                        ┌───────────────▼───────────────────────────────┐
                        │ teamRunCoordinator.handleUsage(agent, usage)  │
                        │  split → {input, output, estimated}           │
                        │  live: memberUsedInput/Output, teamUsed       │
                        │  threshold check (member level, team level)   │
                        │      └─ warn: in-app badge + OS notification  │
                        │         (dedupe per team+level until reset)   │
                        │  queue atomic DB write: addUsedTokens(...)    │
                        └───────────────┬───────────────────────────────┘
                                        │  (fire-and-forget, chained)
                        ┌───────────────▼───────────────────────────────┐
                        │ aiTeamRepo.addUsedTokens (Dexie rw txn)       │
                        │  read row → += input/output → put              │
                        └───────────────┬───────────────────────────────┘
                                        │  when turn/attempt settles
                        ┌───────────────▼───────────────────────────────┐
                        │ finalizeAttempt                               │
                        │  attempt row gets inputTokens/outputTokens     │
                        │  + usageEstimated                             │
                        └───────────────┬───────────────────────────────┘
                                        │
        ┌───────────────────────────────▼───────────────────────────────┐
        │ UI: useLiveQuery(listTeamMembers) + coordinator.subscribe()   │
        │  header: granted / used(in,out) / remaining (+ live override) │
        │  sidebar per member: same, `~` when estimated                  │
        └───────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure (touched files only)

```
src/
├── db/
│   ├── schema.ts                       # SCHEMA_V25 + LATEST_SCHEMA_VERSION = 25
│   └── repositories/aiTeamRepo.ts      # splitBudget (shared), atomic addUsedTokens, txn topUp
├── services/
│   ├── ai/office/
│   │   ├── budgetGate.ts               # pure threshold math (warning-only)
│   │   ├── budgetWarning.ts (new)      # dedupe + notification dispatch (if kept separate)
│   │   ├── tokenEstimate.ts (new)      # lazy js-tiktoken wrapper
│   │   └── teamRunCoordinator.ts       # split usage, warnings, topUp, reconcile
│   ├── backup/{export,restore,validate}Backup.ts
│   └── localSqlitePersistence.ts
├── validation/{aiOfficeSchemas,backupSchemas}.ts
├── types/aiOffice.ts
└── components/ai/office/{TeamSidebar,TeamWorkspace,TeamSettingsDrawer,BudgetTopUpModal}.tsx
src-tauri/src/sqlite_persistence.rs      # ALLOWED_TABLES (no change needed if no new table)
```

### Pattern 1: Real atomic increment (verified)

**What:** read-modify-write inside one `rw` transaction over the single table.
**When to use:** every usage increment.
**Evidence:** run this session against the project's own `dexie@4.4.6` + `fake-indexeddb@6.2.5`:

```
buggy get-then-update total = 1 (expected 20)
txn get-then-update total = 20 (expected 20)
where().modify total = 20 (expected 20)
update(callback) 20x = 20
two-table 20 concurrent +1: member 25, team 125   (started at 5/105)
two-table rollback: unchanged (5/105) after a throw mid-transaction
```

```typescript
// Shape recommended for aiTeamRepo.addUsedTokens
export async function addUsedTokens(
  memberId: string,
  delta: { inputTokens: number; outputTokens: number; estimated: boolean },
  db: TaskPlannerDatabase = defaultDb
): Promise<AiTeamMember> {
  return db.transaction('rw', db.aiTeamMembers, async () => {
    const row = await db.aiTeamMembers.get(memberId);
    if (!row) throw new Error(`Không tìm thấy thành viên: ${memberId}`);
    const updated: AiTeamMember = {
      ...row,
      inputTokens: row.inputTokens + delta.inputTokens,
      outputTokens: row.outputTokens + delta.outputTokens,
      usageEstimated: row.usageEstimated === true || delta.estimated,
    };
    await db.aiTeamMembers.put(updated);
    return updated;
  });
}
```

### Pattern 2: Two-table top-up in one transaction

**What:** member row + team row written inside a single `rw` scope, fresh roster read inside it (WR-13 / D-18).
**When to use:** every `topUp` call, both scopes.

```typescript
// Repository level — the ONLY place the split rule lives (D-14)
export async function applyTopUp(
  teamId: string,
  scope: { kind: 'agent'; agentId: string } | { kind: 'team' },
  amount: number,
  db: TaskPlannerDatabase = defaultDb
): Promise<{ team: AiTeam; members: AiTeamMember[] }> {
  return db.transaction('rw', [db.aiTeams, db.aiTeamMembers], async () => {
    const team = await db.aiTeams.get(teamId);
    if (!team) throw new Error(`Không tìm thấy nhóm: ${teamId}`);
    // D-18/WR-13: fresh read INSIDE the transaction — never a construction-time cache.
    const members = await db.aiTeamMembers.where('teamId').equals(teamId).toArray();

    const shares =
      scope.kind === 'agent'
        ? distribute(amount, members, scope.agentId)   // D-17: all of it to that agent
        : splitEvenly(amount, members);                 // D-16: same function as create
    for (const [memberId, share] of shares) {
      const row = members.find((m) => m.id === memberId)!;
      await db.aiTeamMembers.put({ ...row, budgetTokens: row.budgetTokens + share });
    }
    const updatedTeam: AiTeam = { ...team, budgetTokens: team.budgetTokens + amount };
    await db.aiTeams.put(updatedTeam);
    return { team: updatedTeam, members };
  });
}
```

### Pattern 3: One shared split rule

`splitBudget` (`aiTeamRepo.ts:69-71`) and `evenSplitRows` (`TeamSettingsDrawer.tsx:48-59`) are the same arithmetic written twice:

```
aiTeamRepo.ts:69-71        function splitBudget(total, memberCount) { return memberCount > 0 ? Math.floor(total / memberCount) : 0; }
aiTeamRepo.ts:84-89        const perRow = splitBudget(totalTokens, members.length);
                           const remainder = totalTokens - perRow * members.length;
                           ... budgetTokens = member.role === 'lead' ? perRow + remainder : perRow
TeamSettingsDrawer.tsx:52-58  const perRow = count > 0 ? Math.floor(total / count) : 0;
                              const remainder = total - perRow * count;
                              ... budgetTokens: row.role === 'lead' ? perRow + remainder : perRow
```

**Recommendation:** put one pure function in a shared module (e.g. `src/services/ai/office/budgetSplit.ts`, or export from `budgetGate.ts` to keep the file list stable) and have BOTH the repo and the drawer import it. Keep `evenSplitRows` as a thin wrapper so `tests/views/TeamsView.test.tsx:362-366` keeps compiling.

### Pattern 4: Warning-only threshold (replaces the gate)

```
percentage = clamp(team.budgetWarnThresholdPct ?? settings.aiBudgetWarnThresholdPct ?? 80, 1, 100)
memberAtLevel = usedInput+usedOutput >= budget * pct/100
teamAtLevel   = teamUsed            >= teamBudget * pct/100
crossed = atLevel && !wasAtLevel             // crossing, not "is over"
```
Fire at most one OS notification per `(teamId, level)` until `topUp` or a new turn clears the marker (D-06). In-app surface is the persistent banner/badge, so it needs no dedupe.

### Anti-Patterns to Avoid
- **Keeping the gate "for safety"**: D-01 forbids parking. Leaving `gate.wait()` in `beforeToolRoundFor` silently contradicts the locked decision.
- **Two split implementations**: the drawer preview and the repo write must come from one function or they drift (already drifted once).
- **`ensureMembers()` in `topUp`**: `ensureMembers` early-returns once `membersLoaded` is true (`:1212-1217`), so a member added mid-turn never appears — WR-13.
- **Writing usage from `handleUsage` as a bare `await`**: it is called from a synchronous `onUsage` callback; blocking there would stall the stream. Keep it fire-and-forget but **chain the promises** so reconcile can await them.
- **Bumping `BACKUP_SCHEMA_VERSION` without bumping the envelope literal**: `BackupEnvelopeSchema.schemaVersion` is `z.literal(BACKUP_SCHEMA_VERSION)` (`backupSchemas.ts:817`), so both move together and **older backups are rejected by design** (D-49; acceptable under C-16).
- **Naming a new field `promptTokens`/`estimatedPrompt`**: `findForbiddenBackupKey` rejects any key matching `/(^|_)(...|prompt|...)(_|$)/i` (`backupSchemas.ts:214-216`). Verified safe names: `inputTokens`, `outputTokens`, `usageEstimated`, `budgetWarnThresholdPct`, `cacheReadTokens`, `cacheCreationTokens`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic counters over IndexedDB | Custom mutex/queue around reads and writes | Dexie `db.transaction('rw', …)` read-modify-write | Verified: the mutex-free get-then-update loses 19 of 20 increments |
| Multi-table consistency | Compensating writes / rollback code | One `rw` transaction over both tables | Verified rollback leaves both rows untouched |
| Even split with remainder | Another local `Math.floor` | The single shared `splitEvenly` | Two copies already exist and disagree in placement |
| BPE tokenization | Character heuristics for the ledger | `js-tiktoken/lite` + `o200k_base` rank file | D-07; chars÷4 misprices CJK/Vietnamese heavily (this app's prompts are Vietnamese) |
| OS notifications | New notification plumbing | `sendDesktopNotification` (`utils/desktopNotification.ts:89`) | Already Tauri-aware, permission-aware, with a browser fallback |
| Backup field enumeration | Ad-hoc JSON pass-through | The five declared lists | An undeclared key on a `strictObject` is **rejected**, not stripped |

## Runtime State Inventory

> This phase mutates persisted schema. There is no rename, but there **is** state that must move.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `aiTeamMembers.usedTokens` (single scalar) on every existing row; `AiTeam.budgetTokens`; `aiTeamAssignments.tokenUsage` (optional object, currently never written — grep for `tokenUsage` in `teamRunCoordinator.ts` returns **zero** hits) | New columns default 0 on read; C-16 says no preserving migration, but Dexie will serve `undefined` for old rows — every reader must coalesce (`row.inputTokens ?? 0`). Add a V25 `.upgrade()` only if you want to backfill from `usedTokens`; a pure additive store spec needs none |
| Live service config | None — no external service stores budget state | None |
| OS-registered state | None. OS notifications are fire-and-forget; no scheduled tasks, no pm2, no launchd entries | None |
| Secrets/env vars | No new secrets. The global threshold lives in the `settings` table and is **exported** (`isSafeBackupSetting` returns true for a non-secret key) | None |
| Build artifacts | `node_modules` gains `js-tiktoken`; the Vite/Tauri bundle gains a lazily split ~1.14 MB gzip chunk; `src-tauri/target` unaffected | `npm ci` after adding to `package.json`; verify the chunk is NOT in the initial bundle |
| Dexie version | `LATEST_SCHEMA_VERSION = 24` (`schema.ts:177`), last store spec `this.version(24).stores(SCHEMA_V24)` (`db/index.ts:644`) | Add `SCHEMA_V25` + `this.version(25)`; bump the literal |
| Backup envelope | `BACKUP_SCHEMA_VERSION = 13` (`backupSchemas.ts:813`) | Bump to 14 in the same changeset |
| Stale test literals | `tests/db/tableListParity.test.ts:101` expects 23; `tests/db/schemaV22Migration.test.ts:70` expects 23 — **both currently FAIL** (verified: `expected 24 to be 23`) | Fix both as Wave 0 work; otherwise the phase gate is red before any code lands |

## The five coordinated lists — exact touchpoints

Adding `AiTeam.budgetWarnThresholdPct` and member/attempt usage columns:

| # | List | File:line (verified this session) | What to add |
|---|------|-----------------------------------|-------------|
| 1 | Dexie schema | `src/db/schema.ts:171-173` (`SCHEMA_V24`), `:177` (`LATEST_SCHEMA_VERSION = 24`); `src/db/index.ts:643-644` (`version(23)`, `version(24)`) | `SCHEMA_V25 = { ...SCHEMA_V24 }` (purely additive, no index change → no `.upgrade()`), `this.version(25).stores(SCHEMA_V25)`, literal → 25 |
| 2 | Export | `src/services/backup/exportBackup.ts:205-206` (table key list), `:238-239` (`toArray()` pair), `:298-299` (tables object), `:333` (counts); projection helper `:165-168` | Nothing structural — `aiTeams`/`aiTeamMembers` rows flow through whole. Only inspect that the projection still strips only `diagnosticDetail` |
| 3 | Restore | `src/services/backup/restoreBackup.ts:50-51` (txn table list), `:67-68` (`AI_OFFICE_TABLE_KEYS`), `:191-192` (`Promise.all` reads), `:210` (tables object), `:300-301` (`add(aiTeams)` / `add(aiTeamMembers)`), `:314` (settings whitelist) | Nothing structural; new columns ride along. Confirm `add()` is `bulkAdd` with `strictObject`-validated rows |
| 4 | Validate | `src/validation/backupSchemas.ts:642-657` (`BackupAiTeamRecordSchema`), `:658-665` (`BackupAiTeamMemberRecordSchema`), `:732-780` (`BackupAiTeamAssignmentRecordSchema`, `tokenUsage` at `:773-780`), `:813` (version), `:194-199` (forbidden keys); `src/services/backup/validateBackup.ts:252-268`, `:505-560` (team/member cross-invariants) | Add `budgetWarnThresholdPct: z.number().int().min(1).max(100).optional()`, `inputTokens: aiTokensSchema`, `outputTokens: aiTokensSchema`, `usageEstimated: z.boolean().optional()` on member; same three on assignment. Bump `BACKUP_SCHEMA_VERSION` to 14 |
| 5 | SQLite TS + Rust | `src/services/localSqlitePersistence.ts:16-40` (`SQLITE_DOMAIN_TABLES`; `aiTeams` `:30`, `aiTeamMembers` `:31`), serialization `:106-112`; `src-tauri/src/sqlite_persistence.rs:6-34` (`ALLOWED_TABLES`; `aiTeams` `:22`, `aiTeamMembers` `:23`) | No new table → **no Rust change required**. Rows are stored as opaque `payload_json`, so new columns need no Rust edit. Verify with `tests/db/tableListParity.test.ts` |
| + | Types | `src/types/aiOffice.ts:78-95` (`AiTeam`), `:98-105` (`AiTeamMember`), `:199-231` (`AiTeamAssignment`, `tokenUsage` `:222`) | `budgetWarnThresholdPct?: number`; `inputTokens: number; outputTokens: number; usageEstimated?: boolean` |
| + | Zod write boundary | `src/validation/aiOfficeSchemas.ts:92-114` (`AiTeamInput/UpdateSchema`), `:116-122` (`AiTeamMemberInputSchema`), `:34` (`budgetSchema`) | Add the threshold with the same 1–100 int rule (clamp at runtime too) |
| + | Repo create/update | `src/db/repositories/aiTeamRepo.ts` — `createTeam` `:104-160` (member seed `:133-155`), `updateTeam` `:176-228` (`:190-218` patch assembly), `addTeamMember` `:431-438`, `writeEvenSplit` `:84-89`, `writeLeadRow` `:242-252` | Initialize the new columns to 0; carry them in `writeLeadRow`'s `carried` (currently only `budgetTokens`/`usedTokens`, `:243-245`) |

## Common Pitfalls

### Pitfall 1: The lost update is invisible in unit tests that await sequentially
**What goes wrong:** `addUsedTokens` passes every existing test because tests await one call at a time. The comment at `aiTeamRepo.ts:496` claims "three concurrent completions cannot lose usage" — it is false.
**Why it happens:** Dexie's `get` then `update` are two separate transactions; concurrent callers all read the same value.
**How to avoid:** one `rw` transaction (verified). Write the test with `await Promise.all([...20])`, asserting the exact sum.
**Warning signs:** a test that asserts `>= 1` or uses `sleep` between calls.

### Pitfall 2: Fire-and-forget writes race the reconcile
**What goes wrong:** D-22 says live numbers converge to DB when the turn ends. If `handleUsage` queues `void addUsedTokens(...)` and the settle path immediately re-reads Dexie, the read can win — `teamUsed` drops, or the `~` marker flips.
**Why it happens:** `handleUsage` (`:1281-1284`) intentionally swallows the promise.
**How to avoid:** keep a module-level `usageWriteChain: Promise<void>` that each write appends to (`usageWriteChain = usageWriteChain.then(() => addUsedTokens(...)).catch(() => {})`), and have reconcile `await usageWriteChain` first.
**Warning signs:** UI counters bouncing backwards at turn end.

### Pitfall 3: Treating "no usage" as zero
**What goes wrong:** a provider that streams no `usage` chunk leaves `tokenUsage = {}`, `normalizeUsageTotal` returns 0, and `handleUsage` early-returns on `delta <= 0` (`:1246`) — the turn is free and the budget silently never moves.
**Why it happens:** `delta <= 0` is the right guard for repeated cumulative reports, but it also swallows the "nothing reported" case.
**How to avoid:** at turn settle, if no usage was ever reported for that accounting key, compute an estimate and write it with `usageEstimated: true`. Use the recorded prompt (`currentRequests`, `:543`) and the received text (`agents.get(agentId).streamingText`, updated in `onDelta` `:1141-1145`).
**Warning signs:** an agent runs for minutes and its `usedTokens` stays at 0.

### Pitfall 4: Estimating a prompt from the wrong text
**What goes wrong:** measuring only `request.text` underestimates badly — the real prompt is `systemMessages + history + text + tool schemas`.
**Why it happens:** the loop assembles the payload (`aiOrchestratorLoop.ts:266-280`).
**How to avoid:** estimate `[...systemMessages, ...history, {role:'user', content:text}]` plus `JSON.stringify(tools)` (the loop already does the tools part at `:217`); remember past rounds' tool results are appended too, so prefer "estimate at first round" and mark it as an estimate.
**Warning signs:** estimates far below the provider's own numbers once usage starts arriving.

### Pitfall 5: Bumping the schema version and forgetting the test literals
**What goes wrong:** two tests already assert `23` (`tableListParity.test.ts:101`, `schemaV22Migration.test.ts:70`) and are red **right now** at 24.
**How to avoid:** replace both literals with `LATEST_SCHEMA_VERSION` and, where the test is genuinely about a past version, assert `>= that version`.
**Warning signs:** phase gate shows failures unrelated to the phase's own change.

### Pitfall 6: Per-team top-up leaves member gates closed
**What goes wrong:** today `topUp({kind:'team'})` writes `AiTeams.budgetTokens` only (`:3198-3211`); member rows keep their old shares, so member-level thresholds keep firing and (under the old design) member gates stayed shut.
**How to avoid:** the two-table transaction in Pattern 2; and after it, recompute `memberBudgets` from the returned rows rather than patching one entry.

### Pitfall 7: Duplicated warning on every tool round
**What goes wrong:** `handleUsage` fires per streamed round; a naive "is over threshold → notify" sends N notifications per turn.
**Why it happens:** usage arrives incrementally; the crossing condition must be edge-triggered.
**How to avoid:** the existing `lastBuckets`/`lastTeamBucket` edge pattern (`:1252-1277`) is the right shape — port it with the configurable percentage, and add the D-06 marker so a re-crossing inside one turn does not re-notify.

### Pitfall 8: Arabic/Vietnamese text and tokenizer choice
**What goes wrong:** `cl100k_base` undercounts non-Latin text differently than `o200k_base`; the app's prompts are Vietnamese.
**Why it happens:** different merge tables.
**How to avoid:** default model is `gpt-4o` (`nineRouterTokenService.ts:13`), so use `o200k_base`. Keep the encoding name in one constant so switching is one line.

## Code Examples

### Splitting a provider usage object (replaces `normalizeUsageTotal`)
`normalizeUsageTotal` today (`budgetGate.ts:93-96`):
```typescript
/** Some providers omit `total_tokens`; sum the parts when it is absent. */
export function normalizeUsageTotal(usage: ChatTokenUsage): number {
  return usage.totalTokens ?? (usage.promptTokens ?? 0) + (usage.completionTokens ?? 0);
}
```
Replacement shape (D-09/D-23 — the split is retained, never collapsed):
```typescript
export interface UsageSplit {
  inputTokens: number;
  outputTokens: number;
  /** True when any component was inferred rather than reported. */
  estimated: boolean;
  /** True when the provider reported a total but no per-side split. */
  splitInferred: boolean;
}

/** D-09: cache tokens are charged as normal tokens (provider-reported when present). */
export function splitUsage(usage: ChatTokenUsage): UsageSplit {
  const input = (usage.promptTokens ?? 0) + (usage.cacheReadTokens ?? 0) + (usage.cacheCreationTokens ?? 0);
  const output = usage.completionTokens ?? 0;
  const total = usage.totalTokens;
  if (input + output > 0) return { inputTokens: input, outputTokens: output, estimated: false, splitInferred: false };
  if (typeof total === 'number' && total > 0) {
    // Policy (D-09 fallback): the whole unknown split is charged to input, and flagged.
    return { inputTokens: total, outputTokens: 0, estimated: false, splitInferred: true };
  }
  return { inputTokens: 0, outputTokens: 0, estimated: false, splitInferred: false };
}
```

### Lazy tokenizer (D-07), no startup cost
```typescript
// src/services/ai/office/tokenEstimate.ts
let encoderPromise: Promise<{ encode: (text: string) => number[] }> | null = null;

/** Loaded on first estimate only; Vite emits a separate chunk for each dynamic import. */
async function getEncoder() {
  encoderPromise ??= (async () => {
    const [{ Tiktoken }, ranks] = await Promise.all([
      import('js-tiktoken/lite'),
      import('js-tiktoken/ranks/o200k_base'),
    ]);
    return new Tiktoken(ranks.default);   // constructor is synchronous; no WASM, no init handshake
  })();
  return encoderPromise;
}

export async function estimateTokens(text: string): Promise<number> {
  if (!text) return 0;
  const enc = await getEncoder();
  return enc.encode(text).length;
}
```
Source: `npm view js-tiktoken readme` (lite usage + per-rank import), tarball `dist/lite.d.ts` (`export { a as Tiktoken, ... }`), `package.json` `exports` map (`./lite`, `./ranks/o200k_base`). Bundle math: do **not** import `js-tiktoken` root (5.4 MB); `lite` + one rank = ~1.15 MB gzip, on disk in the Tauri bundle but off the startup path. `[CITED: npmjs.com/package/js-tiktoken readme]`

### Warning dispatch — reuse, do not build
```typescript
// Coordinator is a plain service (no React), so it can call the util directly.
import { sendDesktopNotification } from '../../../utils/desktopNotification';

if (crossedMember && !team.warnedMember) {
  team.warnedMember = true;                       // D-06 marker, cleared by topUp / new turn
  void sendDesktopNotification({
    title: `${agentName} · ${liveTeam.name}`,
    body: `Đã dùng ${pct}% ngân sách được cấp. Cấp thêm token nếu cần.`,
    tag: `budget:${teamId}:member:${agentId}`,
  });
}
```
`sendDesktopNotification` (`utils/desktopNotification.ts:89-193`) already: checks Tauri first, falls back to service worker then `window.Notification`, and returns `false` on denial. Permission gating: `isNotificationPermissionGranted()` (`:33`). In-app surface: the existing `Alert` pattern in `AgentPausedBanner.tsx:27-43` — reuse the component, change the copy and drop the "Tạm dừng" wording.

## Usage policy (the "stated policy" success criterion 2 requires)

The policy must be written down where the code lives, not only in a doc. Recommended text for the module docstring in `budgetGate.ts` (or the new `usageAccounting.ts`):

1. **Reported usage wins.** If the provider reported any `usage` for a round, that number is authoritative for that round; estimates are never mixed in (D-08).
2. **Input and output are both charged, always, for every request** — including every tool round inside one turn (the loop reports cumulative usage per round, `aiOrchestratorLoop.ts:303-315`).
3. **Cache tokens count as normal tokens** (D-09): `inputTokens = promptTokens + cacheReadTokens + cacheCreationTokens`.
4. **No usage → estimate, always, never zero** (D-10): estimate `inputTokens` from the exact prompt sent and `outputTokens` from the text received, record `usageEstimated: true`, and surface it with a `~` prefix.
5. **Total-without-split → charge to input** and record `splitInferred: true`: a provider that returns only `total_tokens` cannot be split honestly, and under-charging output is the worse error for a "hard budget".
6. **Aborted streams are charged** (D-12): reported usage if present, else estimate of `streamingText`.
7. **Retries and failures are charged per attempt** (D-11): each attempt row carries its own usage; a failed attempt is not free.
8. **Deltas, not totals, reach the ledger.** The runtime reports a *cumulative* per-turn total (`chatTurnRuntime.ts:351-358`), the coordinator converts it to a delta against a per-turn baseline key (`teamRunCoordinator.ts:480, 1244-1247`), and only the delta is added to member and team counters.

## Live-vs-DB divergence (D-22) and where reconcile belongs

- `subscribe(listener: () => void): () => void` is the whole live-state API (`teamRunCoordinator.ts:3223-3228`, returned at `:3268`); `listeners` is a module-level `Set` declared at `:516`, fanned out by `notify()` at `:572-580`. Retained deliberately per `.planning/ARCHITECTURE-TEAM-CHAT.md` §5 exception table (`liveQuery` cannot see memory state).
- The UI consumes **both**: Dexie via `useLiveQuery(() => listTeamMembers(team.id, db), …)` (`TeamWorkspace.tsx:193`) and the snapshot via `coordinator.subscribe(() => setSnapshot(coordinator.getState()))` (`:381-382`).
- **Reconcile belongs at the attempt/turn terminal seam, not in the UI.** Two candidate hooks, both already single-writer:
  1. `settleAgent` (`:729-759`) — the in-memory terminal write, called from every outcome path, and it already calls `notify()`. It has no `await`, so it cannot flush the write chain itself.
  2. `finalizeAttempt` (`:787-881`) — the ledger terminal writer, already an `async` `rw` transaction over `chatMessages` + `aiTeamAssignments`. **This is the right place**: append the attempt's accumulated `inputTokens`/`outputTokens` to the transition patch (`:865-877`), then (after the transaction commits) `await usageWriteChain` and re-hydrate member counters from Dexie before `notify()`.
- `getState()` (`:3230-3251`) currently exposes only phase/agents/plan/approval; it must additionally expose the live per-member input/output/estimated totals and the resolved threshold so the header can render live numbers without a DB round-trip.

## Answers to the open questions (coverage check)

| # | Question | Answer | Where |
|---|----------|--------|-------|
| 1 | What is discarded by `normalizeUsageTotal`? | The split. It returns one number; `promptTokens`/`completionTokens` are summed and dropped, and no estimate flag exists. Retained shape must be `{inputTokens, outputTokens, estimated, splitInferred}` | §Usage policy, §Code Examples |
| 2 | Do CONTEXT line refs still match? | Yes for all coordinator/repo lines cited. **Stale:** the ROADMAP WR-13 note's `:993-997`/`:488-493` — the real call is `topUp`→`ensureMembers` at `teamRunCoordinator.ts:3180` and the early return is at `:1213` (`if (membersLoaded) return;`) | Above |
| 3 | Correct Dexie 4 pattern for atomic increment / two-table txn | `db.transaction('rw', table, …)` with read-modify-write inside; `where().equals().modify()` also works but returns only a count | §Pattern 1, §Pattern 2 (experimentally verified) |
| 4 | Exact set of places the new fields touch | Six lists + types + zod + repo init; **no Rust change** because rows are opaque JSON | §The five coordinated lists |
| 5 | js-tiktoken package, encoding, bundle, async init | `js-tiktoken@1.0.21`; `o200k_base` (default model is `gpt-4o`); root import is 5.4 MB — import `js-tiktoken/lite` + the `ranks/o200k_base` subpath dynamically (~1.14 MB gzip, separate chunk); constructor is sync, no WASM, but the dynamic `import()` makes the loader async | §Code Examples |
| 6 | Notification path to reuse | `sendDesktopNotification` + `isNotificationPermissionGranted` in `src/utils/desktopNotification.ts`; OS path proven in `useTeamChatNotifications.ts`; in-app surface is `Alert` per `AgentPausedBanner.tsx` | §Pattern 4, §Code Examples |
| 7 | `settings` whitelist + how to add a global threshold | `isSafeBackupSetting` at `src/services/backup/exportBackup.ts:40-55`; denylist `UNSAFE_OR_EPHEMERAL_SETTING_KEYS` at `:14-38`. A key such as `ai_budget_warn_threshold_pct` passes (it does not end in `_token`/`_key`/`_passphrase`/`_secret`/`_pat`), so no whitelist edit is needed — only a new `settings` row and a reader following `getNineRouterConfig`'s pattern (`nineRouterTokenService.ts:102-138`) | §The five coordinated lists |
| 8 | Types to change | `AiTeam` (+`budgetWarnThresholdPct`), `AiTeamMember` (+`inputTokens`/`outputTokens`/`usageEstimated`), `AiTeamAssignment` (+same three), `ChatTokenUsage` (+cache fields), `TeamRunSnapshot` (+live usage) | §The five coordinated lists |
| 9 | Why is the split rule duplicated and what is its single home? | Two independent copies: a repo function (authoritative write) and a drawer preview function (optimistic UI). Neither imports the other. Single home: one pure module both import; keep `evenSplitRows` exported as a wrapper so `tests/views/TeamsView.test.tsx:362-366` still resolves | §Pattern 3 |
| 10 | Live state mechanism + reconcile hook | `listeners`/`notify()`/`subscribe()` retained by design; reconcile at `finalizeAttempt` after commit | §Live-vs-DB divergence |
| 11 | Test strategy | Extend `tests/services/ai/office/teamRunCoordinator.test.ts` (harness at `:113-250`, 18 `describe` blocks); the 20-way atomicity test belongs in `tests/services/ai/office/aiTeamRepo.test.ts` and **must** use a real `TaskPlannerDatabase` (already the case at `:33-40`) with `fake-indexeddb/auto` from `tests/setup.ts:1` — mocking Dexie would make the assertion meaningless | §Validation Architecture |

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Budget gate parks turns at 80% (`budgetGate.ts:6-14` docstring) | Warn only; user stops manually | Phase 38 D-01/D-02 (this phase) | `createBudgetGate` loses its production consumer for parking; keep the module for threshold math |
| Single `usedTokens` scalar | `inputTokens` + `outputTokens` + `usageEstimated` | This phase (D-23) | Backup envelope 13→14; SQLite payload shape changes; UI must coalesce old rows |
| Hard-coded 0.8 (`types/aiOffice.ts:260`, `budgetGate.ts:90`, `TeamSidebar.tsx:146`, `TeamCard.tsx:129`) | Configurable percent (global + per-team) | This phase (D-04/D-05) | Four hard-coded comparison sites must all read the same resolved value |
| `topUp` team scope touches only `aiTeams` (`:3198-3211`) | One transaction over member + team rows | This phase (D-16/D-17/D-19) | Fixes the "member gate stuck" class of bug |

**Deprecated/outdated:**
- `BUDGET_PAUSE_THRESHOLD` as a constant: keep the export temporarily so `BudgetTopUpModal.tsx:3,71` compiles, but the value shown must come from the resolved threshold, not the constant.

### Consequence of removing the gate — three traps

1. **`budgetGate.ts` must keep a production importer.** `.planning/scripts/verify-team-chat-architecture.sh` fails when any file in `src/services/ai/office/` has zero importers outside itself ("dead module check", `for f in src/services/ai/office/*.ts`). Deleting `createBudgetGate` usage while leaving the file would fail the gate. Keep the module as the home of the threshold math (percentage resolution + crossing predicate + `splitUsage`), imported by `teamRunCoordinator.ts`.
2. **Do not delete `'awaiting-budget'` from `TeamRunPhase`.** It appears in `types/aiOffice.ts:37`, `backupSchemas.ts:724` (`phaseAtEnd` enum), `TeamActivityIndicator.tsx:20` (`PHASE_ACTIVITY_VERB`), and `TeamWorkspace.tsx:758`. Removing it changes the backup enum (`strictObject` value set) for no benefit. Stop *producing* it; leave the value legal so restored batches still validate.
3. **`AgentPausedBanner` copy is asserted verbatim** at `tests/ai/office/AgentOfficeComponents.test.tsx:70-71,79-80` ("Đã dùng 80% ngân sách…"). Reprogramming the banner for warning-only text is a deliberate test rewrite, not a regression — do it in the same task as the copy change.


## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | 9router forwards cache token counts as `prompt_tokens_details.cached_tokens` and/or Anthropic-style `cache_read_input_tokens` | Usage policy / D-09 | If it forwards neither, cache tokens are simply not charged — D-09's requirement is then unimplementable at this layer and must be raised with the user |
| A2 | `js-tiktoken@1.0.21` constructor accepts a rank object synchronously with no async init | Code Examples | If an init is needed, the estimate path becomes async at more call sites (it already is async at the settle seam, so low risk) |
| A3 | `sendDesktopNotification` is safe to call from a non-React service module | Notification reuse | If the Tauri plugin requires a React lifecycle, dispatch must move to an app-level hook |
| A4 | Warning-only behaviour requires deleting `budget-pause` from the stop-reason union | Schema changes | Keeping it is harmless (never written); removing it changes the backup enum, so prefer keeping |
| A5 | A V25 additive store spec needs no `.upgrade()` hook (new columns live inside opaque rows) | Runtime State Inventory | Dexie indexes only what the store spec names; new unindexed fields need no migration, but old rows read as `undefined` and every reader must coalesce |

## Open Questions

1. **Does 9router expose cache token counts?**
   - What we know: `nineRouterClient.ts` maps only `prompt_tokens`/`completion_tokens`/`total_tokens` at four sites (`:329-337`, `:422-430`, `:634-640`, `:778-785`); `ChatTokenUsage` (`types/models.ts:270-274`) has no cache fields; `utils/agentMetrics.ts:24-30` already reads `cache_read_input_tokens`/`cache_creation_input_tokens` for a *different* (Ghost Dev) stream.
   - What's unclear: whether the 9router proxy passes those fields through for chat completions.
   - Recommendation: extend `ChatTokenUsage` with `cacheReadTokens?`/`cacheCreationTokens?`, map both naming conventions in `nineRouterClient`, and default to 0. Record the mapping as a one-line probe during execution; do not block the plan on it.

2. **Estimate source for an aborted stream**
   - What we know: `agents.get(agentId).streamingText` accumulates visible deltas (`:1141-1145`); `outcome.content` is absent on abort.
   - What's unclear: whether `streamingText` includes reasoning deltas (it does not — `onDelta` is fed only by `onTextChunk`).
   - Recommendation: estimate output from `streamingText`; document that reasoning tokens are unmeasured on abort (provider usage, when present, wins per D-12).

3. **Where the in-app warning lives when the workspace is closed**
   - What we know: the workspace banner only renders when mounted (`TeamWorkspace.tsx:758-774`); OS notification is global.
   - Recommendation: OS notification from the coordinator (global) + workspace banner/badge (local). Do not build a second in-app channel for an offline single-user app.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Build/test | ✓ | v26.13.0 (CLAUDE.md targets 24 LTS — works, but note the drift) | — |
| npm | Install | ✓ | 11.20.0 | — |
| Dexie | Atomic increments | ✓ | 4.4.6 (verified in `node_modules`) | — |
| fake-indexeddb | Atomicity test | ✓ | 6.2.5 (verified) | — |
| Rust toolchain | Tauri build gate | ✓ | cargo 1.93.1 / rustc 1.93.1 | No Rust change expected this phase |
| js-tiktoken | Estimation | ✗ | — | Install per D-07 (checkpoint first); while absent, estimation falls back to the existing chars÷4 and must still be marked estimated |
| Full Vitest suite | — | Deliberately not run | — | Project rule: focused runs only |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** `js-tiktoken` (temporarily — the phase cannot claim D-10/D-12 complete without it).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.2 (jsdom global env; node env per-file) |
| Config file | `vite.config.ts` (`test:` block; `setupFiles: ['./tests/setup.ts']`, `fileParallelism: false`) |
| Quick run command | `npx vitest run tests/services/ai/office/aiTeamRepo.test.ts` |
| Full suite command | **not run** (project rule — the suite takes ~1 hour) |

### Phase Requirements → Test Map

| Req / Criterion | Behavior | Test Type | Automated Command | File Exists? |
|-----------------|----------|-----------|-------------------|--------------|
| Crit 1 (overridden by D-01) | An over-budget turn still reaches the model; no park | unit | `npx vitest run tests/services/ai/office/teamRunCoordinator.test.ts -t "budget"` | ✅ (rewrite of the 7 existing `awaiting-budget` cases at `:631,887,927,950,980,1002,1206`) |
| AIO-BUDGET-02 / Crit 2 | A response with no usage still increments, marked estimated | unit | same file, new `-t "no usage"` | ❌ Wave 0 (new tests) |
| AIO-BUDGET-03 / Crit 3 | Both attempts of a retry carry their own usage | unit | `npx vitest run tests/services/ai/office/teamRunCoordinator.test.ts -t "Retry"` | ✅ (extend `:2689` block) |
| AIO-BUDGET-04 / Crit 4 | 20 concurrent increments sum exactly | unit (real Dexie + fake-indexeddb) | `npx vitest run tests/services/ai/office/aiTeamRepo.test.ts -t "concurrent"` | ❌ Wave 0 (home is `aiTeamRepo.test.ts`; it already runs against a real `TaskPlannerDatabase` at `:33-40`) |
| AIO-BUDGET-05 / Crit 5 | Even split, remainder on lead, sums exactly | unit | `npx vitest run tests/services/ai/office/aiTeamRepo.test.ts -t "remainder"` | ✅ (`:240-252`) |
| AIO-BUDGET-06 / Crit 6 (overridden) | Configurable threshold fires one warning per level; no pause | unit + component | `npx vitest run tests/services/ai/office/budgetGate.test.ts` and `npx vitest run tests/ai/office/AgentOfficeComponents.test.tsx` | ✅/❌ (gate tests exist; warning tests new) |
| AIO-BUDGET-07 / Crit 7 | Agent top-up raises member and team total atomically | unit | `npx vitest run tests/services/ai/office/aiTeamRepo.test.ts -t "top-up"` | ❌ Wave 0 |
| AIO-BUDGET-08 / Crit 8 | Display shows granted/used/remaining, input+output separate | component | `npx vitest run tests/views/TeamsView.test.tsx` / `tests/ai/office/AgentOfficeComponents.test.tsx` | ✅ partially (needs new assertions) |
| Backup parity | New fields survive export→validate→restore | integration | `npx vitest run tests/validation/backupSchemas.test.ts` and `npx vitest run tests/db/tableListParity.test.ts` | ✅ |
| Schema bump | DB opens at V25 | migration | `npx vitest run tests/db/schemaV22Migration.test.ts` | ✅ (currently red — fix the literal) |

### Sampling Rate
- **Per task commit:** the single focused file listed above for that task.
- **Per wave merge:** the union of the touched files, e.g. `npx vitest run tests/services/ai/office/aiTeamRepo.test.ts tests/services/ai/office/teamRunCoordinator.test.ts tests/services/ai/office/budgetGate.test.ts tests/validation/backupSchemas.test.ts`.
- **Phase gate:** every command in the table green + the D-25 doc edits landed. Full suite is explicitly out of scope (user rule).

### Wave 0 Gaps
- [ ] Fix `tests/db/tableListParity.test.ts:101` and `tests/db/schemaV22Migration.test.ts:70` (both assert 23, actual 24) — otherwise nothing else can be green.
- [ ] `tests/services/ai/office/aiTeamRepo.test.ts` — add the 20-way concurrency test and the two-table top-up test (real Dexie, no mocks; `fake-indexeddb/auto` is loaded by `tests/setup.ts:1` and the file already opens a real `TaskPlannerDatabase`).
- [ ] `tests/services/ai/office/budgetGate.test.ts` — replace the bucket assertions with percentage/threshold assertions; keep `createBudgetGate` tests only if the gate survives.
- [ ] New estimation tests (one file) covering: no usage → estimate, usage present → no estimate, aborted stream → estimate of received text.
- [ ] Install `js-tiktoken@1.0.21` behind the human checkpoint.

**What "pass" looks like (observable):** counter value exactly `start + 20 × delta`; a `~`-prefixed number in the sidebar after a scripted no-usage turn; exactly one OS-notification call per `(team, level)` across 5 consecutive tool rounds; `getState().phase` never becomes `awaiting-budget`; both member and team rows incremented in the same awaited call.

## Security Domain

> `workflow.security_enforcement: true`, ASVS level 1.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Single local user; no auth surface added |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | **yes** | zod at the boundary: `AiTeamUpdateSchema` (threshold 1–100 int), `AiTeamMemberInputSchema`, `BackupAiTeam*RecordSchema` (`strictObject` rejects unknown keys) |
| V6 Cryptography | no | No crypto in this phase; backup encryption untouched |
| V7 Error handling / logging | **yes** | Threshold notification body must contain counts and percentages only — never prompt text, never model output, never an API key |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Prompt text leaking into an OS notification or backup | Information disclosure | Notification body is templated from numbers + agent name only; `FORBIDDEN_BACKUP_KEYS` + the key regex (`backupSchemas.ts:194-216`) reject `prompt`/`error`/`diagnostic` keys |
| Corrupt/hostile backup injecting negative or absurd token counts | Tampering | `aiTokensSchema` is `z.number().int().nonnegative()` (`backupSchemas.ts:608`); keep the same for the new columns; clamp at the repo too |
| Unbounded notification spam as a DoS of the user's attention | DoS (nuisance) | D-06 dedupe marker per `(team, level)` |
| A backup field named like a secret being exported | Information disclosure | New key names must pass `isSafeBackupSetting` (`exportBackup.ts:40-55`) and the key regex; verified candidates `inputTokens`/`outputTokens`/`usageEstimated`/`budgetWarnThresholdPct` are **not** blocked |
| Threshold override bypassing the global setting via a hand-edited backup | Tampering | Per-team value validated 1–100 in the backup schema and re-clamped in `updateTeam` |

## Sources

### Primary (HIGH confidence — read this session)
- `src/services/ai/office/budgetGate.ts:78-96` — `bucketOf`, `shouldNotifyPause`, `normalizeUsageTotal` bodies.
- `src/services/ai/office/teamRunCoordinator.ts:595-600, 1171, 1187-1217, 1242-1285, 1325-1347, 3019-3029, 3179-3217, 3223-3228` — phase derivation, usage funnel, hydrate/ensure, `handleUsage`, `beforeToolRoundFor`, `setTeamBudget`, `topUp`, `subscribe`.
- `src/db/repositories/aiTeamRepo.ts:69-91, 104-160, 176-228, 242-252, 404-442, 467-508` — split, create, update, lead row carry, member add, top-up/used writes.
- `src/db/repositories/aiTeamRunRepo.ts:109-199` — assignment create/transition.
- `src/types/aiOffice.ts:28-45, 78-105, 199-231, 258-270` — `TeamRunPhase`, `AiTeam`, `AiTeamMember`, `AiTeamAssignment`, `BUDGET_PAUSE_THRESHOLD`.
- `src/types/models.ts:270-274` — `ChatTokenUsage`.
- `src/validation/aiOfficeSchemas.ts:34-40, 92-122`; `src/validation/backupSchemas.ts:194-216, 642-665, 703-780, 813-821`.
- `src/services/backup/exportBackup.ts:14-55, 165-168, 205-206, 238-239, 298-299, 333`; `restoreBackup.ts:50-72, 191-210, 300-314`; `validateBackup.ts:252-268, 505-560`.
- `src/services/localSqlitePersistence.ts:16-40, 106-112, 161-181`; `src-tauri/src/sqlite_persistence.rs:6-34`.
- `src/db/schema.ts:150-177`; `src/db/index.ts:636-644`.
- `src/services/ai/nineRouterClient.ts:329-337, 422-430, 634-640, 778-785` — the four `usage` mapping sites.
- `src/services/ai/aiOrchestratorLoop.ts:214-262, 303-315` — round loop, `beforeToolRound`, usage accumulation.
- `src/components/ai/runtime/chatTurnRuntime.ts:56-91, 284, 351-358, 447, 515` — request shape, usage accumulation, completion.
- `src/utils/desktopNotification.ts:19-193`; `src/hooks/useTeamChatNotifications.ts:20-96`; `src/components/shell/AppShell.tsx:120`.
- `src/components/ai/office/{TeamSidebar.tsx:55-57,115-121,140-154; TeamSettingsDrawer.tsx:48-59,101-118,140-158,340-360; TeamWorkspace.tsx:147-152,193,381-382,685-722,758-774,1043-1080; BudgetTopUpModal.tsx:3,71; AgentPausedBanner.tsx:15-43; TeamActivityIndicator.tsx:14-32; TeamCard.tsx:45-46,129}`.
- `tests/db/tableListParity.test.ts:95-103`; `tests/db/schemaV22Migration.test.ts:66-72`; `tests/services/ai/office/aiTeamRepo.test.ts:31-40,223-273`; `tests/services/ai/office/teamRunCoordinator.test.ts:18-60,255-330`; `tests/ai/office/AgentOfficeComponents.test.tsx:66-88`.
- `.planning/scripts/verify-team-chat-architecture.sh` — dead-module gate that a new office module must satisfy.

### Secondary (MEDIUM confidence)
- `npm view js-tiktoken version/repository/license/time/dependencies/exports/readme` and tarball inspection (sizes, `dist/lite.d.ts`) — `[CITED: npmjs.com/package/js-tiktoken]`.
- Dexie typings `node_modules/dexie/dist/dexie.d.ts:765-768` (`update` accepts a callback).

### Tertiary (LOW confidence)
- Cache-token field names from 9router (A1) — provider-dependent, must be probed.

## Metadata

**Confidence breakdown:**
- Current-code facts: HIGH — every file:line above was opened this session; the atomicity behaviour was reproduced experimentally with the project's exact Dexie + fake-indexeddb versions.
- Architecture: HIGH — the seams are few and already named by CONTEXT; the only genuine design choice is where estimation lives (settle path).
- js-tiktoken integration: MEDIUM — package metadata verified, actual runtime import not executed.
- Cache tokens: LOW — provider mapping unverified.

**Research date:** 2026-11-13
**Valid until:** 2026-12-13 (fast-moving area: provider usage shape and js-tiktoken versions)
