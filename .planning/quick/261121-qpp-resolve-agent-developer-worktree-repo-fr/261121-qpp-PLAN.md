---
id: 261121-qpp
slug: resolve-agent-developer-worktree-repo-fr
title: Resolve Agent Developer worktree repo từ CR-linked systems, kèm xử lý mơ hồ
date: 2026-11-21
status: planned
scope: AI Office team runtime — worktree target resolution, coordinator options, lead prompt
---

# 261121-qpp — Worktree target từ CR links

## Mục tiêu

Lỗi đã khoanh vùng, KHÔNG điều tra lại rộng. TeamWorkspace hiện chỉ lấy worktree repo từ `listTeamLinks(...).find(itemType === 'system')` (`TeamWorkspace.tsx:329-337`) và tại chip Coding Zone (`:617-622`). Khi team chỉ link CR mà CR có `targets` trỏ hệ thống, `agentDeveloperWorktree` là `undefined` → `provisionAgentSession` ném `WORKTREE_NOT_AVAILABLE`, Agent Developer thấy lỗi provider chung chung.

Sửa đúng khối đích:

1. Dùng chung bộ lọc hệ thống từ link: direct `system` links + `cr.targets[].systemId`, dedupe theo id hệ thống. Đây là logic có sẵn ở `teamTools.ts:1264-1283` — trích thành helper dùng lại, KHÔNG viết lại chỗ khác.
2. "Dùng được" = hệ thống có CẢ `sshConfigId` và `remoteRepoPath`. Đúng 1 → tự chọn, truyền vào `options.agentDeveloperWorktree`. Nhiều hơn 1 → KHÔNG đoán, bỏ worktree và đưa tên ứng viên vào prompt cho lead hỏi người dùng. Zero → giữ nguyên refusal hiện tại.
3. Model KHÔNG chọn repo path. `options.agentDeveloperWorktree` vẫn là input duy nhất quyết định worktree; giữ nguyên worktree confinement, role gate, vòng đời `provisionedWorktrees`, và chỉ resolve lúc dựng coordinator (effect `TeamWorkspace.tsx:303-337`) — KHÔNG thêm resolve mỗi turn.

Không thêm dependency. Không đụng PWA/GitHub Pages. Không đụng handler `code_edit`, `provisionWorktree`, hay `resolveGitRepo` behavior.

## Context / khối đích đã xác nhận

- `src/services/ai/office/teamTools.ts`
  - `type RepoResolutionCandidate` ~1174; `export function repoPathTail` ~1183; `resolveGitRepo` ~1236.
  - Vòng lặp link→systems cần trích: `1264-1283` (`allSystems` / `allConfigs` / `links` / `byId`), trong đó nhánh `itemType === 'cr'` lặp `cr.targets` và `byId.set(row.id, row)` — dedupe theo id.
  - Không đổi phần `candidates` / `ambiguous` / `finish` phía sau; chỉ thay vòng lặp bằng lời gọi helper.
- `src/components/ai/office/TeamWorkspace.tsx`
  - Import sẵn `listTeamLinks` (`:21`), `CODE_EDIT_AGENT_NAME` từ teamTools (`:49`), `deriveRemoteWorktreePath` (`:62`).
  - `links` live-query ở `:242`. Resolver dựng coordinator ở `:333-337`; spread vào options ở `:361`. Chip Coding Zone `:617-631`.
  - `developerId` `:614-616`, `codingZoneDescriptor` `:623-631` dùng `sshConfigId`/`remoteRepoPath` để dẫn `deriveRemoteWorktreePath`.
- `src/services/ai/office/teamRunCoordinator.ts`
  - `TeamRunCoordinatorOptions.agentDeveloperWorktree` `:276-280` (có `baseRef?`). Thêm field mơ hồ cạnh nó.
  - `provisionAgentSession` `:1441-1462`, `codeEditGranted` `:1486` — GIỮ NGUYÊN, không sửa.
  - Call site `buildLeadTurnRequest({...})` `:2676-2689`.
- `src/services/ai/office/teamPrompts.ts`
  - `BuildLeadTurnRequestInput` `:265-290`; rule 8 `:372` và 12 `:376` đã nói hỏi lại khi mơ hồ — giữ nguyên, thêm khối mới.
  - Mẫu constant-pin cho test: `LEAD_NO_WRITE_DOC_LINE` `:296`, `LEAD_CODE_DELEGATION_LINE` `:308`.
  - `wrapUntrusted` import ở `:11`, re-export `:27`; định nghĩa thật tại `src/services/ai/untrustedData.ts:56` — `wrapUntrusted(label, body)`.
  - Builder `buildLeadTurnRequest` `:340`; các segment tùy chọn được push theo mẫu `...(conventionsSegment ? [conventionsSegment] : [])` ở `:382-384`.
- Test: `tests/components/ai/office/TeamWorkspaceWorktreeTarget.test.tsx` (đã mock `createTeamRunCoordinator` qua `coordinatorOptionsMock`, fixture hệ thống ở `:64-69`, link ở `:69`); `tests/services/ai/office/teamPrompts.test.ts` (`buildLead(overrides)` helper `:144`, `describe` `:156`, test wrapUntrusted `:423+`); `tests/services/ai/office/teamTools.test.ts` (CR fixture mẫu `:476-490`, `targets: [{ systemId }]`).
- Quy tắc dự án: KHÔNG chạy full Vitest suite (> 1 giờ); chỉ chạy path cụ thể. Mọi chuỗi prompt bằng tiếng Việt, identifier giữ nguyên.

## Nhiệm vụ

### Task 1 — Trích helper hệ thống từ link + resolver worktree dùng chung

**Files:** `src/services/ai/office/teamTools.ts`, `tests/services/ai/office/teamTools.test.ts`

**Action:**

- Trích vòng lặp `teamTools.ts:1264-1283` thành `export async function listLinkedSystems(teamId: string, db: TaskPlannerDatabase): Promise<System[]>`: đọc `listTeamLinks(teamId, db)`, với `itemType === 'system'` lấy `db.systems.get(itemId)`, với `itemType === 'cr'` lấy `db.changeRequests.get(itemId)` rồi lặp `cr.targets` lấy từng `db.systems.get(target.systemId)`, gom vào `Map<string, System>` keyed by `row.id` rồi trả `[...map.values()]`. Giữ nguyên hành vi "missing row thì bỏ qua" và dedupe theo id. Trong `resolveGitRepo`, thay vòng lặp cũ bằng `const linkedSystems = await listLinkedSystems(ctx.teamId, ctx.db);`; giữ nguyên `allSystems` / `allConfigs` và toàn bộ logic candidates sau đó — `resolveGitRepo` phải không đổi hành vi.
- Thêm `export interface AgentDeveloperWorktreeResolution { worktree?: { sshConfigId: string; remoteRepoPath: string }; ambiguousSystemNames: string[] }` và `export async function resolveAgentDeveloperWorktree(teamId: string, db: TaskPlannerDatabase): Promise<AgentDeveloperWorktreeResolution>`. Gọi `listLinkedSystems`, lọc giữ hệ thống có CẢ `sshConfigId` lẫn `remoteRepoPath` (đã dedupe theo id sẵn). Đúng 1 → trả `{ worktree: { sshConfigId, remoteRepoPath }, ambiguousSystemNames: [] }`. Từ 2 trở lên → trả `{ ambiguousSystemNames: usable.map(s => s.name) }`, KHÔNG set `worktree`. Zero → trả `{ ambiguousSystemNames: [] }`. Không đọc SSH config, không gọi `provisionWorktree`, không trả `remoteRepoPath` trong nhánh mơ hồ.
- Test trong `tests/services/ai/office/teamTools.test.ts`: (a) link trực tiếp 1 hệ thống dùng được → `worktree` đúng ssh/path; (b) chỉ link CR có `targets` trỏ hệ thống dùng được → cùng kết quả (đây là regression chính); (c) vừa link trực tiếp vừa link CR trỏ CÙNG id → vẫn đúng 1, không mơ hồ; (d) 2 hệ thống dùng được → `worktree` undefined và `ambiguousSystemNames` chứa đúng 2 tên; (e) hệ thống thiếu `sshConfigId` hoặc `remoteRepoPath` bị loại, dẫn tới 0 ứng viên. Giữ nguyên mọi test `resolveGitRepo` hiện có.

**Verify:** `npx vitest run tests/services/ai/office/teamTools.test.ts` và `npx tsc --noEmit`. Không chạy full suite.

**Done:** Helper trích xong, `resolveGitRepo` vẫn xanh. Resolver trả đúng 1 worktree cho direct link lẫn CR-only link, dedupe theo id, và chỉ liệt kê tên khi nhiều ứng viên — không bao giờ trả path trong nhánh mơ hồ.

### Task 2 — Thêm field mơ hồ vào options, khối prompt, và glue trong coordinator

**Files:** `src/services/ai/office/teamRunCoordinator.ts`, `src/services/ai/office/teamPrompts.ts`, `tests/services/ai/office/teamPrompts.test.ts`

**Action:**

- Trong `teamPrompts.ts`, thêm vào `BuildLeadTurnRequestInput` field tùy chọn `worktreeAmbiguitySegment?: string | undefined` cạnh `pinnedContextSegment`. Export hằng `WORKTREE_AMBIGUITY_LINE` (mẫu `LEAD_CODE_DELEGATION_LINE`) với nội dung cố định tiếng Việt, đại ý: nhiều hệ thống đủ cấu hình worktree cùng được liên kết; KHÔNG tự chọn repo; hỏi người dùng tên hệ thống cần làm việc rồi mới ủy thác sửa code cho Agent Developer. Trong `buildLeadTurnRequest`, push nguyên segment vào `parts` theo mẫu `...(worktreeAmbiguitySegment ? [worktreeAmbiguitySegment] : [])`, ngay sau `pinnedContextSegment`. Builder vẫn pure — KHÔNG tự đọc db, KHÔNG tự tạo segment.
- Trong `teamRunCoordinator.ts`, thêm `worktreeAmbiguousSystems?: readonly string[] | undefined` vào `TeamRunCoordinatorOptions` cạnh `agentDeveloperWorktree` (`:276-280`). Tại call site `:2676-2689`, nếu `options.worktreeAmbiguousSystems?.length` thì tạo segment = `[WORKTREE_AMBIGUITY_LINE, '[CÁC HỆ THỐNG ỨNG VIÊN]', ...options.worktreeAmbiguousSystems.map(name => \`- ${wrapUntrusted('TÊN HỆ THỐNG', name)}\`)].join('\n')`, rồi spread `worktreeAmbiguitySegment` vào `buildLeadTurnRequest`. Import `WORKTREE_AMBIGUITY_LINE` từ `teamPrompts` và `wrapUntrusted` từ `../../untrustedData` (hoặc dùng re-export có sẵn của teamPrompts). Tên hệ thống đi qua `wrapUntrusted` dạng DỮ LIỆU; KHÔNG đưa sshConfigId hay remoteRepoPath vào prompt. Không đổi `provisionAgentSession` / `codeEditGranted` / `toolContext`.
- Test trong `tests/services/ai/office/teamPrompts.test.ts`: dùng helper `buildLead(overrides)` — (a) truyền segment chứa hằng + tên đã wrap → system prompt chứa đúng `WORKTREE_AMBIGUITY_LINE` và tên ứng viên; (b) không truyền → không có hằng và không có header `[CÁC HỆ THỐNG ỨNG VIÊN]`; (c) tên ứng viên có cụm giả delimiter → vẫn nằm trong wrap, không thoát khối (dùng pattern nonce đã có ở test `:423+`).

**Verify:** `npx vitest run tests/services/ai/office/teamPrompts.test.ts` và `npx tsc --noEmit`. Không chạy full suite.

**Done:** Lead nhận khối hỏi tên hệ thống chỉ khi có mơ hồ, kèm tên đã frame an toàn; builder vẫn pure; không path nào lọt vào prompt. Coordinator options có field mới, type-check sạch.

### Task 3 — TeamWorkspace dùng chung resolver ở cả hai site + truyền mơ hồ vào options

**Files:** `src/components/ai/office/TeamWorkspace.tsx`, `tests/components/ai/office/TeamWorkspaceWorktreeTarget.test.tsx`

**Action:**

- Import `resolveAgentDeveloperWorktree` từ `../../../services/ai/office/teamTools` (gộp vào import `CODE_EDIT_AGENT_NAME` hiện có `:49`). Thay block `:333-337` bằng `const resolution = await resolveAgentDeveloperWorktree(team.id, db);` rồi lấy `const agentDeveloperWorktree = resolution.worktree;`. Spread vào `createTeamRunCoordinator` như cũ (`:361`), thêm `...(resolution.ambiguousSystemNames.length > 0 ? { worktreeAmbiguousSystems: resolution.ambiguousSystemNames } : {})`. Giữ nguyên mọi guard `cancelled`, `apiKey`, `config.endpoint`, `getOrCreateRun`, `loadRoster`, `createRuntimeDeps`.
- Thay block chip `:617-622` bằng cùng resolver qua live query: `const worktreeResolution = useLiveQuery(() => resolveAgentDeveloperWorktree(team.id, db), [db, team.id]);`, rồi `codingZoneSshConfigId = worktreeResolution?.worktree?.sshConfigId`, `codingZoneRepoPath = worktreeResolution?.worktree?.remoteRepoPath`. `codingZoneDescriptor` `:623-631` giữ nguyên — chip giờ target CÙNG repo với coordinator. Giữ `links` `:242` nếu vẫn dùng ở UI khác; không xóa bừa.
- Test trong `tests/components/ai/office/TeamWorkspaceWorktreeTarget.test.tsx`: đổi fixture để phủ (a) CR-only link: tạo CR `targets: [{ systemId }]`, bỏ link direct (dùng `removeTeamLink` hoặc không thêm), assert `coordinatorOptionsMock` vẫn nhận `agentDeveloperWorktree: { sshConfigId: 'ssh-1', remoteRepoPath: '/srv/repo' }`; (b) giữ lại test direct-link hiện tại; (c) 2 hệ thống dùng được → assert options KHÔNG có `agentDeveloperWorktree` VÀ có `worktreeAmbiguousSystems` chứa đúng 2 tên; (d) dedupe direct+CR cùng id vẫn ra đúng 1. Dùng `addTeamLink`/`removeTeamLink` từ `aiTeamRepo`, CR fixture theo mẫu `teamTools.test.ts:480-487`.

**Verify:** `npx vitest run tests/components/ai/office/TeamWorkspaceWorktreeTarget.test.tsx` và `npx tsc --noEmit`. Không chạy full suite.

**Done:** Team với CR-only link vẫn provision đúng repo. Nhiều ứng viên → không set worktree, chỉ truyền tên. Chip Coding Zone và coordinator cùng dùng một resolver nên cùng target. Không resolve trong mỗi turn; role gate và vòng đời worktree nguyên vẹn.

## Thứ tự & phụ thuộc

Task 1 → Task 2 → Task 3 (file rời nhau; mỗi task tự verify được). Chạy lần lượt trong cùng plan.

## Success criteria

- CR-only link tự chọn hệ thống dùng được duy nhất và provision worktree thật; không còn `WORKTREE_NOT_AVAILABLE` trong kịch bản này.
- Direct link, CR target, và chồng lấn cùng id dedupe đúng theo `System.id`.
- 0 ứng viên → giữ refusal cũ. Nhiều ứng viên → không chọn, lead hỏi tên hệ thống, tên frame qua `wrapUntrusted`, không lộ path.
- Model không bao giờ chọn repo path; `options.agentDeveloperWorktree` vẫn là input duy nhất của provisioning.
- Coding Zone chip target cùng repo với coordinator.
- Ba lệnh verify scoped ở trên đều xanh; không chạy full Vitest suite.

**Output:** Cập nhật `.planning/STATE.md` quick-tasks table và commit theo convention GSD sau khi verify xong.
