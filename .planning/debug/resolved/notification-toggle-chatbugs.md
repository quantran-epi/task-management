---
status: resolved
trigger: "Fix 3 bugs: (1) notification click opens wrong 'ghost dev agent list' tab instead of team chat tab with target message highlighted; remove ghost dev agent list page. Notification fix must be broad across all notification categories — fix every notification that opens the wrong tab, not only AI chat team notifications. (2) AI chat team settings auto-assign toggle saves but does not take effect / shows off when reopened. (3) AI chat team MCP toggle only toggles graphiti; with a single MCP it should toggle all MCPs."
created: 2026-11-18
updated: 2026-11-18
symptoms:
  expected_behavior: "Notification click opens the correct destination view for every notification category; AI chat message notifications open the team chat tab and highlight the target message. Ghost dev agent list page is removed. Auto-assign toggle persists and takes effect after save. MCP toggle controls all MCP servers, including the single available MCP."
  actual_behavior: "AI chat team message notification click opens a tab named 'ghost dev agent list' instead of team chat with the message highlighted. Auto-assign toggle shows enabled, save succeeds, but reopening settings shows it off and behavior does not take effect. MCP toggle only toggles Graphiti."
  error_messages: "none reported"
  timeline: "reported 2026-11-18"
  reproduction: "Click AI chat team message notification; toggle auto-assign in AI chat team settings, save, reopen; toggle MCP on AI chat team with one MCP present."
goal: find_and_fix

## Current Focus

- resumed: 2026-11-18 — human-verify checkpoint returned with new directives (supersedes prior awaiting_human_verify). User decision: option B — remove the "Ghost Dev Agents" page/tab from the UI surface entirely (or at minimum ensure it is no longer reachable/named as a notification target); preserve GHOST-04 staff-list feature elsewhere if the ghost dev list page hosted it. Additional directives: full review pass of all session changes + surrounding notification-click routing path, fix EVERY critical/warning issue found (not only the 3 reported bugs). Do NOT ask for native Tauri human confirmation; complete all code-level checks (typecheck, build, focused tests, review fixes) and explicitly list items still needing manual app verification in the final report.
- bug_class: Bohrbug (all three deterministic logic/persistence errors)
- hypothesis: "(1) Team chat + budget OS notifications hardcode `#/agents` deeplink → opens 'Ghost Dev Agents' tab; workbench NotificationPanel also mis-routes capacity alerts to tasks. No message-highlight param path exists. (2) TeamSettingsDrawer onSave sends autoSplitEnabled/autoApproveMutations/concurrencyLimit only to the in-memory coordinator, never persisted via updateTeam. (3) Master MCP toggle loops unawaited per-server toggleMcpServer calls that each do read-modify-write on the same settings row, so concurrent writes drop all but one server."
- test: "DONE: tsc --noEmit clean; npm run build passes; focused 6 suites/45 tests + adjacent 6 suites/66 tests all pass."
- resumed_next_action: "DONE — all 6 steps applied: 'agents' route/tab retired in both shells; ShellPermissionModal relocated to shell roots; last NotificationDeepLink.agents emitter repointed to task insight + constant removed; stale targetMessageId cleared on team tab reuse; tests updated/added; verification green."
- expecting: "All three reported bugs fixed + ghost-dev page/tab retired + review findings fixed; manual Tauri verification listed in final report (not gating per user directive)."
- reasoning_checkpoint:
  hypothesis: "Bug1: team-message and budget OS notifications emit `NotificationDeepLink.agents` (#/agents), and the workbench maps that key to a 'Ghost Dev Agents' tab; no team/message deeplink or highlight path exists, so every such click opens the wrong tab and discards message.id. Bug2: TeamWorkspace.handleSaveSettings writes budget+ssh/oracle to IndexedDB but sends autoSplitEnabled/autoApproveMutations/concurrencyLimit only to the transient coordinator; the DB row keeps the old value, so reopening shows it off and the DB→coordinator sync effect reverts runtime behavior. Bug3: ChatTabToolbox.handleMasterMcpToggle fans out unawaited per-server toggleMcpServer calls that each read-modify-write the same `mcp_servers` settings row; concurrent writes make last-write-win, so only one server's flag survives."
  confirming_evidence:
    - "useTeamChatNotifications.ts:88 and budgetWarning.ts:75 both pass deeplink = NotificationDeepLink.agents while holding teamId (and message.id for chat)."
    - "WorkbenchLayout.tsx:166 titles.agents='Ghost Dev Agents'; handleDeeplink has no team case; notificationDeepLink.ts has only agents/task/cr/system/planner constants."
    - "NotificationPanel.tsx:73-101: capacity alerts (date, no entityId) fall through to the generic 'tasks' tab."
    - "TeamWorkspace.tsx:788-801 updateTeam is called with only sshFs/oracle; autoSplit/autoApprove/concurrency go to coordinator.setTeamSettings only. Effect at 433-442 re-derives coordinator state from the stale DB team row."
    - "ChatTabToolbox.tsx:104-115 loops onToggleMcpServer without awaiting; toggleMcpServer (mcpClient.ts:178-191) does getMcpServers→saveMcpServers per call with no serialization."
  falsification_test: "If adding a team deeplink still opens 'Ghost Dev Agents', or if persisting autoSplitEnabled via updateTeam still shows off on reopen, or if a single atomic setAllMcpServersEnabled still toggles only one server, the hypothesis is wrong."
  fix_rationale: "Bug1: add a team(teamId,messageId) deeplink and handle it in both shells, thread targetMessageId to ChatMessageList for scroll+highlight, and fix the capacity case in NotificationPanel — addresses the routing data, not the symptom. Bug2: include autoSplit/autoApprove/concurrency in the existing updateTeam persistence call so DB is source of truth. Bug3: replace the per-server fan-out with one atomic bulk settings write."
  blind_spots: "Live Tauri OS banner click not observable here (verified via deeplink unit tests); highlight styling verified via component tests + build, not visual QA; multi-server MCP race verified via unit test on the bulk function."
  candidate_causes:
    - "code: wrong deeplink constants / missing DB fields in save patch / unawaited read-modify-write loop"
    - "data: team row retains stale autoSplitEnabled value; single seeded MCP server (graphiti-banking) masks the multi-server race"
  and_gate: "No — each bug reproduces from a single code defect; the shell routing and coordinator sync are the mechanism that surfaces it, not independent contributing faults."
- resumed_reasoning_checkpoint:
  hypothesis: "The 3 reported bugs are fixed, but the user's explicit original ask (remove the ghost dev agent list page/tab) is unfulfilled: 'agents' is still a routable page in BOTH shells (App.tsx:114 renders AgentControlView; useHashRoute VALID_ROUTES; Navigation.tsx:53 sidebar item; layoutStore EditorViewType 'agents'; EditorArea.tsx:593 renders AiOfficeView; WorkbenchLayout title maps still say 'Ghost Dev Agents'). Any notification that still emits NotificationDeepLink.agents (useGhostDevNotifications.ts:56 shell-permission request) opens that page. Review additionally found stale-param risk: workbench openTab() merges params on same-id reuse (layoutStore.ts:176), so a team tab opened once with messageId keeps that highlight forever when a later notification opens the same team without a message id."
  confirming_evidence:
    - "Git diff of this session confirms the 3 fixes are present and scoped; base has a pre-existing unrelated AIChatDrawerMcpToggle initial-state failure (already recorded)."
    - "grep shows 'agents' route/page reachable in default shell (Navigation.tsx key 'agents', App.tsx case 'agents' → AgentControlView) and workbench (EditorArea.tsx:593 → AiOfficeView, layoutStore view type, WorkbenchLayout titles)."
    - "useGhostDevNotifications.ts:56 still sends NotificationDeepLink.agents; AgentControlView.tsx:243 renders ShellPermissionModal, so removing the page/tab would strand the permission-approval UI unless handled."
    - "layoutStore.ts:176 params merge means team_workspace:<teamId> reused across notifications retains a stale targetMessageId."
  falsification_test: "If after removing the 'agents' route/tab no code path can open a 'Ghost Dev Agents' page, the shell-permission modal is still reachable for approvals, and re-clicking a team notification with no messageId drops the old highlight, the hypothesis is wrong."
  fix_rationale: "Remove the 'agents' page/tab from both shells' navigation surfaces (route whitelist, sidebar, title maps, editor view type mapping) while relocating the shell-permission approval modal into a still-mounted surface (RightToolWindow or WorkbenchLayout) so GHOST-04 permission handling survives; repoint the shell-permission notification to the relocated destination. In WorkbenchLayout team-deeplink case, explicitly clear targetMessageId when absent so reused tabs do not keep a stale highlight."
  blind_spots: "Cannot visually confirm the IntelliJ workbench in native Tauri here; rely on code-level routing review + focused component tests + build. Need to confirm GHOST-04 staff/session list has an alternate surface (AiOfficeView employees segment / AI Staff bottom tool window) before deleting the page."
  candidate_causes:
    - "code: 'agents' route/tab still registered in both shells; stale targetMessageId in reused workbench tab params"
    - "config: product decision (user requires the ghost dev list page removed from UI) — the route existed by prior design, not by runtime misconfiguration"
  and_gate: "Yes for the notification symptom: the wrong-tab outcome requires BOTH a deeplink emitter pointing at 'agents' AND the 'agents' tab/route existing in the shell; removing either alone mitigates it, so the fix removes both the remaining emitter and the tab surface."

## Evidence

- timestamp: 2026-11-18
  checked: src/utils/notificationDeepLink.ts
  found: NotificationDeepLink has no team/team-chat deeplink. `agents: '#/agents'`. deeplinkForAlert maps entityType task/cr/system/capacity; default dashboard. isSafeHashRoute allows `#/route?query`. applyNotificationDeepLink sets hash + dispatches NOTIFICATION_DEEPLINK_EVENT.
  implication: No way to deep-link to a team chat with a specific message. All 'agents' deeplinks land on the Ghost Dev Agents tab/page.

- timestamp: 2026-11-18
  checked: src/hooks/useTeamChatNotifications.ts:88
  found: Team message OS notification sets `deeplink: NotificationDeepLink.agents` (#/agents). Has teamId + message.id available in `row`.
  implication: This is the exact cause of the reported bug — team chat click opens Ghost Dev Agents instead of team chat; the target message id is discarded.

- timestamp: 2026-11-18
  checked: src/services/ai/office/budgetWarning.ts:75
  found: Team budget warning notification also uses `deeplink: NotificationDeepLink.agents`, with warning.teamId available.
  implication: Second notification category opening the wrong tab; must route to team workspace too.

- timestamp: 2026-11-18
  checked: src/workbench/WorkbenchLayout.tsx:150-199 (handleDeeplink)
  found: title map `agents: 'Ghost Dev Agents'`. viewKey 'insight' handled specially; other keys open a tab with viewType=viewKey. No 'team' handling; params only date/tab.
  implication: Workbench opens the wrongly-named tab from #/agents. Needs a 'team' case opening team_workspace tab with teamId + messageId params.

- timestamp: 2026-11-18
  checked: src/App.tsx:94-132 + src/hooks/useHashRoute.ts:11-25 (default shell)
  found: VALID_ROUTES/AppRoute has no 'team'. Agents route renders AgentControlView. No team workspace route in default shell.
  implication: Need a 'team' route rendering TeamWorkspaceView for the non-workbench shell.

- timestamp: 2026-11-18
  checked: src/workbench/toolwindows/NotificationPanel.tsx:72-102 (workbench in-app notification panel)
  found: handleItemClick maps capacity→'task' (default). Capacity alerts have `date` but no `entityId`, so they fall to else → open generic 'tasks' tab instead of planner on that date.
  implication: Wrong destination for capacity category in workbench panel; fix to open planner with date. This is a broad-audit finding.

- timestamp: 2026-11-18
  checked: src/components/shell/AppShell.tsx:385-403 (default shell NotificationDrawer click)
  found: task→inspect, cr/system→insight, capacity→planner(date). Correct as-is.
  implication: Default-shell in-app drawer routing is fine.

- timestamp: 2026-11-18
  checked: other deeplink senders
  found: useGhostDevNotifications done/error→task(s.taskId) [ok], shell-permission→agents [genuine Ghost Dev, keep]; AIChatDrawer AI-turn-finished→dashboard; telegram→telegram; useTimerAlertMonitor→task; NotificationSettingsCard→settings; useDesktopNotification→deeplinkForAlert(item).
  implication: Only team-message + budget warnings are wrong OS deeplinks; capacity wrong only in workbench panel.

- timestamp: 2026-11-18
  checked: src/components/ai/ChatMessageList.tsx + src/views/TeamWorkspaceView.tsx + EditorArea.tsx
  found: No target-message highlight capability. Rows carry data-chat-message-id. TeamWorkspaceView takes only teamId. TeamWorkspace builds messageListExtensions (firstUnread/lastRead).
  implication: Need to thread targetMessageId → ChatMessageList to scroll+highlight the row.

- timestamp: 2026-11-18
  checked: src/components/ai/office/TeamSettingsDrawer.tsx:218-241 + src/components/ai/office/TeamWorkspace.tsx:764-809 (handleSaveSettings)
  found: Drawer's onSave passes autoSplitEnabled/autoApproveMutations/concurrencyLimit. handleSaveSettings persists only budget (applyTeamBudgetSettings) + sshFs/oracle (updateTeam). It sends autoSplit/autoApprove/concurrency ONLY to coordinator.setTeamSettings (in-memory). updateTeam is never called with these. The sidebar toggle (line 901) DOES persist via updateTeam. Effect at 433-442 re-syncs coordinator from DB team fields.
  implication: Root cause of bug 2 — drawer save never writes autoSplitEnabled to IndexedDB; reopen shows stale DB value (off) and the sync effect can revert the in-memory value.

- timestamp: 2026-11-18
  checked: src/components/ai/ChatTabToolbox.tsx:96-116 (handleMasterMcpToggle) + AIChatDrawer.tsx:375-388 + TeamWorkspace.tsx:1119-1121 + src/services/ai/mcpClient.ts:178-191 (toggleMcpServer)
  found: Master toggle loops servers calling onToggleMcpServer(id,true/false) unawaited. Each downstream toggleMcpServer does getMcpServers()→saveMcpServers() (read-modify-write of same settings row). Concurrent calls read the same initial state and last write wins → all but one server's change lost. Only one MCP (graphiti-banking) is seeded by default.
  implication: Root cause of bug 3 — need one atomic bulk write for all servers.

- timestamp: 2026-11-18
  checked: src/services/ai/mcpClient.ts:37-46,109-133
  found: DEFAULT_MCP_SERVERS has one entry graphiti-banking; getMcpServers seeds from legacy graphiti settings.
  implication: Confirms single-server default; bulk toggle must still be correct for N servers.

- timestamp: 2026-11-18 (resumed review pass)
  checked: full git diff of all 22 changed source/test files + routing/navigation surfaces
  found: 3 reported fixes are present and correct in scope. GHOST-04 staff/session feature survives independently of the 'agents' page: workbench has ai_office/ai_staff left tool windows (LeftToolWindow.tsx:132-134 renders AiOfficeView/AiStaffExplorer) and default shell has SettingsView GhostDevConfigCard. Only AgentControlView (session list/terminal/diff) is exclusive to the 'agents' page and it hosts the global ShellPermissionModal (AgentControlView.tsx:243). 'agents' remains reachable: App.tsx:114, useHashRoute whitelist, Navigation.tsx:53 sidebar, layoutStore EditorViewType, EditorArea.tsx:593, WorkbenchLayout title maps. Last NotificationDeepLink.agents emitter: useGhostDevNotifications.ts:56 (shell permission OS notice). Workbench openTab merges params on reuse (layoutStore.ts:176) → stale targetMessageId possible. layoutStore already has RETIRED_VIEW_TYPES + v3 storage key filter pattern for retired views.
  implication: Removal must retire the route/view in both shells AND relocate ShellPermissionModal to an always-mounted surface so permission approval is not lost; need stale-param clear on team deeplink reuse.

- timestamp: 2026-11-18 (resumed review pass)
  checked: src/main.tsx shell selection + AppShell.tsx render tail + WorkbenchLayout.tsx
  found: Exactly one shell mounts at boot (default App OR AppIntelliJ). AppShell renders AIChatDrawer + global overlays at lines 820-840; WorkbenchLayout renders global overlays at lines 438-447. Both are always mounted in their respective shell.
  implication: Mounting ShellPermissionModal once in AppShell and once in WorkbenchLayout is safe (never both active), keeps permission approval functional with the agents page removed.

- timestamp: 2026-11-18 (removal applied + verification)
  checked: typecheck/build/tests after removing the 'agents' route/tab across both shells
  found: tsc --noEmit initially caught one dangling navigate('agents') in RunGhostDevModal.tsx launch toast; removed that dead "Xem trong Agent Control" button and its onNavigate prop chain (RunGhostDevModal/TaskDrawer/TaskTable). After fix: tsc clean, npm run build passes, focused 6 suites/45 tests pass, adjacent 6 suites/66 tests pass (AgentControlView, shell, AppShell, TaskTable, AiOfficeView, layoutStore). 'agents' now only survives as a retired value in RETIRED_VIEW_TYPES (so persisted tabs get filtered) and in negative test assertions.
  implication: No dangling route references; staff list survives via ai_office/ai_staff tool windows; permission approval survives via shell-root modals. Two source files (AgentControlView.tsx, JetBrainsIcons comment) remain as unused definitions/tests — left in place since they are harmless and covered by existing tests.

## Eliminated

- hypothesis: "Keep the ghost-dev agents page/tab and only stop notifications from targeting it (the checkpoint's option A)."
  evidence: "User explicitly chose option B at the checkpoint: remove the ghost dev agent list page/tab from the UI surface entirely (preserve the staff-list feature elsewhere). Implemented by retiring the 'agents' route/view in both shells while keeping ai_office/ai_staff tool windows and relocating the permission modal."
  timestamp: "2026-11-18"

## Resolution

- root_cause: "Bug1 (routing, broad): OS notifications for team chat (useTeamChatNotifications.ts) and team budget warnings (budgetWarning.ts) both emitted `NotificationDeepLink.agents` (#/agents), which the workbench maps to a 'Ghost Dev Agents' tab — so those clicks never reached the team chat, and the message id was discarded. No team deeplink or message-highlight path existed. Additionally the workbench in-app NotificationPanel routed `capacity` alerts to the generic Tasks tab (capacity alerts carry a date, not an entityId). Bug2: TeamWorkspace.handleSaveSettings persisted only budget + ssh/oracle fields via updateTeam; autoSplitEnabled/autoApproveMutations/concurrencyLimit were sent only to the transient in-memory coordinator, so the DB kept the stale value — reopening the drawer showed it off and the DB→coordinator sync effect reverted runtime behavior. Bug3: ChatTabToolbox.handleMasterMcpToggle fanned out unawaited per-server `toggleMcpServer` calls, each doing its own getMcpServers→saveMcpServers read-modify-write on the same `mcp_servers` row; concurrent writes read the same pre-toggle state so last-write-wins left only one server toggled."
- fix: "Bug1: added `NotificationDeepLink.team(teamId, messageId?)` → `#/team?teamId=..&messageId=..`; repointed team-chat and budget notifications to it; added `team` to AppRoute/VALID_ROUTES and both shells' routing (App.tsx renders TeamWorkspaceView; WorkbenchLayout opens a `team_workspace` tab with teamId+targetMessageId); threaded targetMessageId through TeamWorkspaceView→TeamWorkspace→ChatMessageList which scrolls to and highlights the target row (data-testid=chat-target-message); fixed NotificationPanel capacity alerts to open the planner on their date. Bug2: handleSaveSettings now includes autoSplitEnabled/autoApproveMutations/concurrencyLimit in the updateTeam persistence call. Bug3: added atomic `setAllMcpServersEnabled` (single settings-row write) and a new `onToggleAllMcpServers` callback threaded through AiChatWidget to both hosts (AIChatDrawer + TeamWorkspace); master switch now calls it instead of the racing per-server fan-out."
- verification: "npx tsc --noEmit clean; npm run build (tsc+vite) passes; focused vitest: 45/45 pass across notificationDeepLink, mcpClient, ChatMessageList, WorkbenchLayout, TeamWorkspaceSettingsPersist, useHashRoute (includes new team deeplink, stale-highlight-clearing, retired-agents-ignored and highlight cases); adjacent suites 66/66 pass (AgentControlView, shell, AppShell, TaskTable, AiOfficeView, layoutStore). Final review caught and fixed an effect-ordering issue where read-position restore could scroll away from the notification target; read-position restore now yields when targetMessageId is set. Pre-existing unrelated failure: tests/ai/AIChatDrawerMcpToggle.test.tsx initial-state assertion fails identically at baseline HEAD (tab config mcpEnabled:false is overwritten during scope init) — confirmed not caused by these changes. Resumed pass additionally retired the ghost-dev agents page/tab in both shells, relocated ShellPermissionModal, repointed the last #/agents emitter, cleared stale targetMessageId, and removed the dangling navigate('agents') toast button; all re-verified green."
- guardrail:
    target_test: pass
    mutation_check: { result: skipped, reason: "Stryker not configured or installed in this project" }
    no_op_deletion: { result: pass, deletion_justified_by_rca: true, note: "diff is additive except the racy per-server MCP loop intentionally replaced by the atomic setAllMcpServersEnabled write (justified in reasoning checkpoint)" }
    adjacent_tests: { result: pass, suites_run: [notificationDeepLink, mcpClient, ChatMessageList, WorkbenchLayout, TeamWorkspaceSettingsPersist], note: "full build + tsc also pass" }
    revert_and_reconfirm: { result: pass, bug_returned_on_revert: true, fixed_on_reapply: true, note: "autoSplit persistence fix reverted → TeamWorkspaceSettingsPersist failed (autoSplitEnabled undefined); reapplied → passed" }
    guardrail_verdict: accepted
- files_changed:
  - src/utils/notificationDeepLink.ts
  - src/hooks/useTeamChatNotifications.ts
  - src/services/ai/office/budgetWarning.ts
  - src/types/navigation.ts
  - src/hooks/useHashRoute.ts
  - src/App.tsx
  - src/workbench/WorkbenchLayout.tsx
  - src/views/TeamWorkspaceView.tsx
  - src/workbench/EditorArea.tsx
  - src/components/ai/office/TeamWorkspace.tsx
  - src/components/ai/ChatMessageList.tsx
  - src/workbench/toolwindows/NotificationPanel.tsx
  - src/services/ai/mcpClient.ts
  - src/components/ai/ChatTabToolbox.tsx
  - src/components/ai/AiChatWidget.tsx
  - src/components/ai/AIChatDrawer.tsx
  - src/components/shell/Navigation.tsx
  - src/components/shell/AppShell.tsx
  - src/components/agents/RunGhostDevModal.tsx
  - src/components/tasks/TaskDrawer.tsx
  - src/components/tasks/TaskTable.tsx
  - src/views/AiOfficeView.tsx
  - src/workbench/store/layoutStore.ts
  - src/hooks/useGhostDevNotifications.ts
  - tests: notificationDeepLink.test.ts, mcpClient.test.ts, ChatMessageList.test.tsx, WorkbenchLayout.test.tsx, TeamWorkspaceSettingsPersist.test.tsx (new), useHashRoute.test.ts

## Closure Note (session-manager)
- Code-level verification complete: tsc --noEmit clean; npm run build passes; focused 6 suites/45 tests re-confirmed passing (plus adjacent 66 tests per debugger). Not gated on native Tauri human confirmation per user directive.
- Still needs manual UAT on the real Tauri app (non-blocking):
  1. Click team-chat OS notification -> opens team chat tab with message scrolled to and highlighted.
  2. Click budget-warning OS notification -> opens correct team workspace; re-click with no messageId clears old highlight.
  3. Click capacity/overload in-app notification -> opens Capacity Planner on the target date.
  4. Toggle "Tự động chia việc" in team settings -> Save -> reopen stays on and affects next run.
  5. Master MCP switch with multiple servers -> all flip on/off together.
  6. "Ghost Dev Agents" / "Agent Control" tab and sidebar item absent in both shells; GHOST-04 staff list still reachable via AI Office / AI Staff; shell-permission approval modal still works.
  7. Post-"chạy Ghost Dev" toast has no navigation button to the retired page.
- Pre-existing unrelated failure recorded: tests/ai/AIChatDrawerMcpToggle.test.tsx initial-state assertion fails identically at baseline HEAD.
