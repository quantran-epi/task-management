---
phase: quick
plan: 261124-uuo
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/ai/office/TeamWorkspace.tsx
  - tests/components/ai/office/TeamWorkspaceWorktreeTarget.test.tsx
autonomous: true
requirements:
  - WT-PICKER-CANDIDATES
  - WT-PICKER-OVERRIDE
  - WT-PICKER-REFUSAL
  - WT-PICKER-NO-PERSIST
must_haves:
  truths:
    - "Khi team có hơn 1 hệ thống linked hợp lệ (có sshConfigId + remoteRepoPath), header TeamWorkspace hiện picker chọn hệ thống worktree"
    - "Chọn 1 hệ thống thì coordinator đang sống nhận đúng {sshConfigId, remoteRepoPath} của hệ thống đó và danh sách tên ambiguity bị xoá"
    - "Lựa chọn chỉ nằm trong React state của TeamWorkspace, không ghi vào AiTeam/settings; reload hoặc đổi team không giữ lựa chọn"
    - "Khi Agent Developer đang chạy, coordinator từ chối đổi target; picker không commit lựa chọn mới và hiện thông báo lỗi cố định"
    - "Khi candidate list đổi làm target đã chọn không còn hợp lệ, override bị clear và coordinator nhận lại trạng thái ambiguity/resolver"
    - "Fallback gõ tên hệ thống trong chat của coordinator vẫn giữ nguyên"
  artifacts:
    - path: "src/components/ai/office/TeamWorkspace.tsx"
      provides: "Picker UI, runtime-only worktree override, effective target wiring vào coordinator và descriptor"
      contains: "worktree-system-picker"
    - path: "tests/components/ai/office/TeamWorkspaceWorktreeTarget.test.tsx"
      provides: "Regression tests cho picker, override, refusal và invalidate"
      contains: "worktree-system-picker"
  key_links:
    - from: "TeamWorkspace.tsx::worktreeCandidates"
      to: "listLinkedSystems(team.id, db)"
      via: "useLiveQuery lọc hệ thống có sshConfigId + remoteRepoPath; cùng nguồn với resolveAgentDeveloperWorktree"
      pattern: "listLinkedSystems\\(team\\.id, db\\)"
    - from: "TeamWorkspace.tsx::handleWorktreeSystemSelect"
      to: "coordinator.setAgentDeveloperWorktree"
      via: "thử apply trước, chỉ commit override khi trả về không phải false"
      pattern: "setAgentDeveloperWorktree\\(target\\) === false"
    - from: "TeamWorkspace.tsx::push effect"
      to: "effectiveSshConfigId / effectiveRemoteRepoPath / effectiveAmbiguityKey"
      via: "derived primitives, override ưu tiên resolver; gồm cả undefined khi resolver mất target"
      pattern: "effectiveAmbiguityKey"
    - from: "TeamWorkspace.tsx::codingZoneDescriptor"
      to: "effectiveSshConfigId / effectiveRemoteRepoPath"
      via: "descriptor dùng chung target đã chọn để Coding Zone mở đúng worktree khi session active"
      pattern: "codingZoneSshConfigId"
---

<objective>
Thêm picker chọn hệ thống worktree ngay trong header của `TeamWorkspace`, hiện khi có nhiều hệ thống ứng viên từ `listLinkedSystems`. Lựa chọn là runtime-only override, ưu tiên hơn resolver mặc định và được đẩy vào coordinator đang sống mà không rebuild coordinator.

Purpose: lỗi ambiguity xảy ra TRƯỚC khi có phiên Agent Developer, trong khi `CodingZoneTrigger` chỉ render khi `active` — đặt picker trong trigger/modal thì user không chọn được trước khi giao việc sửa code. Header là nơi duy nhất vừa thấy sớm, vừa nằm cạnh trigger khi session đã active. Giữ nguyên `CodingZoneTrigger.tsx`, `CodingZoneModal.tsx`, `teamRunCoordinator.ts` và fallback chat gõ tên hệ thống.

Output: 2 file — UI + state wiring trong `TeamWorkspace.tsx`, tests bổ sung trong `TeamWorkspaceWorktreeTarget.test.tsx`. Không dependency mới, không persist, không commit.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/components/ai/office/TeamWorkspace.tsx
@src/services/ai/office/teamTools.ts
@src/services/ai/office/teamRunCoordinator.ts
@src/components/agents/office/CodingZoneTrigger.tsx
@tests/components/ai/office/TeamWorkspaceWorktreeTarget.test.tsx
@tests/services/ai/office/teamRunCoordinator.test.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Picker hệ thống worktree + runtime override trong TeamWorkspace (RED then GREEN)</name>
  <files>src/components/ai/office/TeamWorkspace.tsx, tests/components/ai/office/TeamWorkspaceWorktreeTarget.test.tsx</files>
  <behavior>
    - Test 1: hai hệ thống linked có sshConfigId + remoteRepoPath → `getByTestId('worktree-system-picker')` hiện, option hiển thị `Core (CORE)` và `Payments (PAY)`, coordinator vẫn nhận `setAgentDeveloperWorktree(undefined)` + `setWorktreeAmbiguousSystems([...])`, không tự chọn.
    - Test 2: click option `Payments` → `setAgentDeveloperWorktreeMock` nhận `{sshConfigId:'ssh-2', remoteRepoPath:'/srv/payments'}` và `setWorktreeAmbiguousSystemsMock` nhận `[]`; `db.aiTeams.get(team.id)` trước/sau bằng nhau.
    - Test 3: `setAgentDeveloperWorktreeMock.mockReturnValueOnce(false)` → click option không commit override (không có push thứ hai với target đó), thông báo cố định `Không đổi được hệ thống khi Agent Developer đang chạy. Hãy dừng phiên rồi chọn lại.` hiện; click lại khi mock trả true thì commit.
    - Test 4: sau khi đã chọn, thêm link hệ thống thứ ba rồi xoá link hệ thống đã chọn → override tự clear, coordinator nhận lại `undefined`/ambiguity names, không stale target.
    - Test 5 (regression): hai file test hiện có vẫn xanh — coordinator vẫn giải nghĩa tên hệ thống trong chat (`teamRunCoordinator.test.ts` ambiguity cases) và trigger vẫn chỉ hiện khi active (`CodingZoneDiffPanel.test.tsx`).
  </behavior>
  <action>
    Viết các test 1-4 trước vào `tests/components/ai/office/TeamWorkspaceWorktreeTarget.test.tsx`, dùng lại harness có sẵn: fake-indexeddb, `createTeamRunCoordinator` mock, `getOrCreateRun` mock, settings ninerouter, `addSystem`, `addCrWithTargets`. Tương tác AntD Select bằng `fireEvent.mouseDown(container.querySelector('.ant-select-selector'))` rồi click `screen.findByText('Payments (PAY)', { selector: '.ant-select-item-option-content' })` (pattern đã có trong `SystemModal.test.tsx`). Chạy lệnh verify để thấy RED (picker chưa tồn tại), rồi implement.

    Trong `TeamWorkspace.tsx`: thêm `listLinkedSystems` vào import teamTools hiện có và `Select` từ `../../ui` (barrel đã export, không import thẳng `antd`). Thêm hằng `WORKTREE_SWAP_BLOCKED_COPY` với đúng câu tiếng Việt nêu trong Test 3. Thêm `useLiveQuery(() => listLinkedSystems(team.id, db), [db, team.id])`, lọc bằng `useMemo` chỉ giữ row có cả `sshConfigId` và `remoteRepoPath` — cùng tiêu chí với `resolveAgentDeveloperWorktree` (`teamTools.ts:1227`). Tạo state `worktreeOverride: { systemId, sshConfigId, remoteRepoPath } | undefined` (runtime-only).

    Tạo `candidateKey` là chuỗi ổn định từ `(id, sshConfigId, remoteRepoPath)` của mọi candidate đã sort; effect validate chạy khi candidateKey/candidate list đổi, clear override nếu `systemId + sshConfigId + remoteRepoPath` không còn khớp row nào. Dùng state updater trả về `current` khi còn hợp lệ để không gây re-render thừa. KHÔNG đưa array identity của `snapshot.agents`, `links`, hay `worktreeResolution` object vào dependency của effect push — chỉ primitive strings, giữ đúng WR-06.

    Tính `effectiveSshConfigId = worktreeOverride?.sshConfigId ?? worktreeResolution?.worktree?.sshConfigId`, `effectiveRemoteRepoPath` tương tự, và `effectiveAmbiguityKey = worktreeOverride ? '' : ambiguityKey`. Sửa effect push hiện tại (~649-666) để dùng ba primitive này: vẫn gọi cả `setWorktreeAmbiguousSystems` và `setAgentDeveloperWorktree`, vẫn đẩy `undefined` khi resolver mất target. Khi override active, ambiguity key rỗng để lead không còn hỏi lại trong prompt.

    Handler `handleWorktreeSystemSelect(systemId)` (useCallback, deps ổn định): tìm candidate theo id, tạo `target`, gọi `coordinator?.setAgentDeveloperWorktree(target)` TRƯỚC; nếu kết quả `=== false` thì set `actionError` với `WORKTREE_SWAP_BLOCKED_COPY` và return, không commit; ngược lại clear actionError rồi set override. Việc push effect sau đó là idempotent (identity không đổi). Không tự ý sửa `teamRunCoordinator.ts` — setter trả false khi `developerIsRunning()` đã là hành vi đúng (`teamRunCoordinator.ts:1541`).

    Dùng `effectiveSshConfigId` / `effectiveRemoteRepoPath` cho `codingZoneSshConfigId` / `codingZoneRepoPath` để descriptor Coding Zone trỏ đúng hệ thống đã chọn.

    Render picker trong header ngay trước `{codingZoneTrigger}` (~1127), chỉ khi `usableCandidates.length > 1`: span `data-testid="worktree-system-picker"` với inline style (dùng token sẵn, không sửa CSS file), chứa `<Select size="small" allowClear={false} width="auto" style={{ width: 220 }} aria-label="Chọn hệ thống worktree" placeholder="Chọn hệ thống để sửa code" value={worktreeOverride?.systemId} options={...} onChange={handleWorktreeSystemSelect} />`. Label option là `` `${system.name} (${system.code})` ``. Không thêm prop cho `CodingZoneTrigger`/`CodingZoneModal`; không ghi `updateTeam`, settings, hay bất kỳ Dexie write nào cho lựa chọn này.

    Chạy verify. Nếu test 4 lỗi do effect validate chạy trước/sau push effect, ưu tiên fix ở derived primitives (override chỉ được dùng khi vẫn khớp candidate) thay vì thêm effect mới.
  </action>
  <verify>
    <automated>npx tsc --noEmit && npx vitest run tests/components/ai/office/TeamWorkspaceWorktreeTarget.test.tsx --bail=1 && npx vitest run tests/services/ai/office/teamRunCoordinator.test.ts -t "ambiguity" --bail=1 && npx vitest run src/components/agents/__tests__/CodingZoneDiffPanel.test.tsx --bail=1</automated>
  </verify>
  <done>Picker hiện đúng lúc ambiguity, chọn hệ thống đẩy target đúng vào coordinator đang sống, refusal khi running không commit, invalidate clear stale target, AiTeam không đổi, chat fallback và trigger tests vẫn xanh, `tsc --noEmit` sạch.</done>
</task>

<task type="auto">
  <name>Task 2: Rà soát runtime-only, effect deps và scoped verification cuối</name>
  <files>src/components/ai/office/TeamWorkspace.tsx, tests/components/ai/office/TeamWorkspaceWorktreeTarget.test.tsx</files>
  <action>
    Đọc lại đúng các block đã sửa một lần (state + resolver effect + header render + test describe mới), đối chiếu các điểm sau và sửa ngay nếu lệch: không có `updateTeam`/`db.*.put` nào liên quan đến lựa chọn; không import dependency mới; dependency array của mọi effect mới chỉ gồm primitive/`useCallback` ổn định, không có array identity từ liveQuery hay snapshot; `candidateKey` sort deterministic để đổi thứ tự link không sinh ra clear override nhầm; `value` của Select là `undefined` khi chưa chọn để placeholder hiện; refusal copy đúng chuỗi; descriptor dùng target đã chọn; `setAgentDeveloperWorktree(undefined)` vẫn được push khi resolver mất target; `CodingZoneTrigger.tsx`, `CodingZoneModal.tsx`, `teamRunCoordinator.ts` không nằm trong diff (`git diff --name-only` chỉ 2 file của plan). Chạy lại full lệnh verify scoped; không chạy full vitest suite (project rule: trên 1 giờ), không commit.
  </action>
  <verify>
    <automated>npx tsc --noEmit && npx vitest run tests/components/ai/office/TeamWorkspaceWorktreeTarget.test.tsx tests/components/agents/__tests__/CodingZoneDiffPanel.test.tsx --bail=1 && npx vitest run tests/services/ai/office/teamRunCoordinator.test.ts -t "ambiguity" --bail=1</automated>
  </verify>
  <done>Diff chỉ 2 file, không persist, không re-render loop/stale target, scoped tests xanh, sếp có kết quả verify để review UI trong Chrome.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Team link rows (systems/CR targets) -> picker candidates | Dữ liệu cấu hình do user nhập, có thể trỏ repo/sshConfig sai hoặc bị xoá trong lúc chạy |
| Picker -> `coordinator.setAgentDeveloperWorktree` | Lựa chọn cấp quyền `code_edit` cho đúng worktree; swap nhầm repo là ghi code sai chỗ |
| Live resolver + candidate list -> override | Hai nguồn có thể lệch nhau; stale target phải bị từ chối thay vì âm thầm dùng tiếp |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-UUO-01 | Tampering | candidate filter | mitigate | Chỉ lấy row từ `listLinkedSystems` có cả `sshConfigId` + `remoteRepoPath`, cùng predicate với resolver; option dùng `system.id` làm value, không dùng tên/path tự gõ |
| T-UUO-02 | Tampering | `handleWorktreeSystemSelect` | mitigate | Gọi setter trước, chỉ commit override khi không trả `false`; `developerIsRunning()` trong coordinator từ chối swap lúc agent đang chạy |
| T-UUO-03 | Information integrity | override validation effect | mitigate | `candidateKey` deterministic; clear override khi id/ssh/repo không còn khớp; push lại `undefined` + ambiguity names cho coordinator |
| T-UUO-04 | Elevation of privilege | persisted AiTeam | accept | Lựa chọn là React state runtime-only, không field mới trong backup/encrypted sync; reload trở về resolver mặc định |
| T-UUO-SC | Tampering | Package installs | accept | Không cài package; dùng `Select` đã có qua barrel `../../ui` |

</threat_model>

<verification>
1. RED trước GREEN: test picker mới fail khi chưa có `worktree-system-picker`.
2. `npx tsc --noEmit` sạch.
3. `npx vitest run tests/components/ai/office/TeamWorkspaceWorktreeTarget.test.tsx --bail=1` — test mới + 7 test cũ xanh.
4. `npx vitest run tests/services/ai/office/teamRunCoordinator.test.ts -t "ambiguity" --bail=1` — fallback chat gõ tên vẫn xanh, coordinator không đổi.
5. `npx vitest run src/components/agents/__tests__/CodingZoneDiffPanel.test.tsx --bail=1` — trigger vẫn chỉ hiện khi active.
6. Review diff: `git diff --name-only` đúng 2 file; `git status` không thấy file worktree/branch bị đụng.
</verification>

<success_criteria>
- Có thể chọn hệ thống worktree từ header trước khi delegate, không cần gõ tên vào chat.
- Coordinator đang sống nhận target đúng, ambiguity prompt biến mất, Coding Zone descriptor theo target đã chọn.
- Không swap worktree lúc developer đang chạy; invalid candidate clear override ngay.
- Không persist, không dependency mới, không sửa coordinator/trigger/modal, scoped tests + tsc xanh.
</success_criteria>

<output>
Hoàn thành ghi kết quả vào `.planning/quick/261124-uuo-add-worktree-system-picker-chip-in-codin/261124-uuo-SUMMARY.md` (nếu orchestrator yêu cầu). Không commit.
</output>
