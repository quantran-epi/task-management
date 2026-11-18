---
status: awaiting_human_verify
trigger: "Khi các tiến trình AI chạy, footer có indicator tiến trình; click vào mở nhóm chat nhưng tab hiện là tên agent, đáng ra là tên nhóm chat. Indicator trong AI chat panel cũng phải mở đúng tab."
created: 2026-11-17T00:00:00Z
updated: 2026-11-17T17:00:00Z
---

## Current Focus

bug_class: Bohrbug (deterministic — title derived from wrong source every time)

reasoning_checkpoint:
  hypothesis: "The single shared click handler handleOpenChat in ActiveAiTurnIndicator.tsx names the team-workspace tab with turn.title. Team-run agent turns are registered with title = agent name (registerAgentTurn(agentId, name) -> title: name in teamRunCoordinator.ts:2041-2049), so clicking their progress capsule opens team_workspace:<teamId> with the agent's name as the label. openTab overwrites an existing tab's title with the supplied value (layoutStore.ts:171-179), so even a previously correct team-named tab is renamed to the agent."
  confirming_evidence:
    - "ActiveAiTurnIndicator.handleOpenChat passes title: turn.title || 'Nhóm AI' into openTab for team turns (lines 42-48)."
    - "teamRunCoordinator registerAgentTurn sets title: name (agent name) while carrying the team id only in scopeKey/teamId (lines 2041-2049)."
    - "layoutStore.openTab maps an existing tab and sets title: tab.title || t.title, so the wrong title wins (line 175)."
    - "Both click sites (status bar compact and AppShell non-compact) mount the same ActiveAiTurnIndicator; both single-capsule (line 109) and dropdown (line 213) clicks route to handleOpenChat."
  falsification_test: "If a team:agent turn capsule is clicked with a team named 'Nhóm Alpha' and an agent named 'An', and the resulting/focused team_workspace tab is titled 'An' rather than 'Nhóm Alpha', hypothesis is confirmed. If it is titled 'Nhóm Alpha', hypothesis is wrong."
  fix_rationale: "Resolve the authoritative team name from the team id (db.aiTeams.get(teamId)) and use it as the tab title for ALL team turns (team or agent), instead of the per-turn title. Fall back to the existing tab's title or a generic label when the team row is unavailable, so the group tab is never renamed to an agent. This addresses the wrong data source at the click handler, not just the visible label."
  blind_spots: "Not yet verified in the running Tauri UI (no live app). Have not confirmed whether the AI-chat-panel 'progress indicator' the user mentions is a distinct component or the same ActiveAiTurnIndicator mounted in the header; exhaustive grep found no other clickable AI-progress control with navigation. Have not confirmed async team-name lookup timing in the click handler. Note: existing tabs are focused via setActiveTabId (no rename); the wrong name appears when an agent turn CREATES the team_workspace tab."
  candidate_causes:
    - "code: handleOpenChat uses turn.title (agent name for agent turns) as tab title instead of the authoritative team name."
    - "code: openTab blindly overwrites an existing tab's title with the caller-supplied value, so a wrong-title click corrupts an already-correct tab."
    - "data: agent turns store agent name in title and only team id in scopeKey/id, losing the team-name label at the agent-turn level."
    - "config: none suspected — no build/env dependency; both footer and chat-panel indicators mount the same component."
  and_gate: "Yes — wrong label requires (1) an agent turn whose title is the agent name AND (2) handleOpenChat treating that title as the tab label AND (3) openTab accepting the overwrite. All three hold deterministically."

known_pattern_candidate: none (no debug knowledge base exists).

test: "Add a failing regression test in tests/ai/ActiveAiTurnIndicator.test.tsx: register a team:agent turn (scopeKey team-1, title 'An', team row named 'Nhóm Alpha'), click the capsule, assert openTab receives title 'Nhóm Alpha' and id 'team_workspace:team-1' for both compact and default rendering; also assert an existing correct tab is not renamed when clicked."

expecting: "Both click sites name the opened/focused tab after the chat group (team name), never the agent; existing tabs keep their correct title."

next_action: "Write the failing regression test, confirm RED, then implement the minimal fix in ActiveAiTurnIndicator.tsx."

## Symptoms

expected: Clicking an AI progress indicator (in the footer and in the AI chat panel) opens the corresponding chat group, and the opened tab's title/label is the chat group name.
actual: Clicking the footer AI progress indicator opens the chat group but the tab shown is the individual agent's name. The AI chat panel progress indicator does not reliably open the correct tab either.
errors: None reported by user.
timeline: Reported 2026-11-17.
reproduction: Start an AI process so the progress indicator appears in the footer and in the AI chat panel; click each indicator and observe the opened chat group tab label.
scope: Both the footer AI progress indicator and the AI chat panel progress indicator must open the correct chat group tab named after the chat group (not the agent).

## Eliminated

## Evidence

- timestamp: 2026-11-17T17:00:00Z
  checked: src/components/ai/ActiveAiTurnIndicator.tsx (full file)
  found: Single shared component mounted in both the IntelliJ workbench StatusBar (compact, StatusBar.tsx:135) and the legacy AppShell header (non-compact, AppShell.tsx:618). handleOpenChat (lines 30-67) handles team turns by opening/focusing tab id `team_workspace:<teamId>` and sets title: turn.title || 'Nhóm AI' when creating. Both the single capsule (line 109) and multi-turn dropdown items (line 213) call handleOpenChat(turn).
  implication: Both reported click sites share one handler; a fix here covers both. The tab title source is turn.title.

- timestamp: 2026-11-17T17:00:00Z
  checked: src/services/ai/office/teamRunCoordinator.ts (lines 876, 2030-2049)
  found: teamTurnId = `team:<teamId>` with title = liveTeam.name (team name). agentTurnId = `team:<teamId>:agent:<agentId>` with title = agent name (registerAgentTurn(agentId, name) -> title: name). Both carry scopeKey = teamId. The isTeam detection in handleOpenChat catches both id prefixes, so agent turns also route to the team-workspace tab — but with the agent's name.
  implication: Root of the wrong label — agent turns carry agent name as title.

- timestamp: 2026-11-17T17:00:00Z
  checked: src/workbench/store/layoutStore.ts (lines 165-198)
  found: openTab(tab) with an existing id maps the tab and sets `title: tab.title || t.title`, overwriting an existing correct team title with the caller's (wrong agent) title. AiOfficeExplorer.handleOpenTeam (lines 105-112) opens the same tab with title = team.name, which is the correct label.
  implication: Even a correctly-named tab gets renamed to the agent when the indicator click arrives.

- timestamp: 2026-11-17T17:00:00Z
  checked: git history for ActiveAiTurnIndicator.tsx
  found: Commit fd7a88f1 added team-workspace navigation using `title: turn?.title || 'Nhóm AI'`. Earlier related session ai-office-group-chat-bugs.md confirms this handler was intended to open/focus the team workspace for team turns.
  implication: The navigation target (id) was correct from that fix; the label source (turn.title) was never adjusted for agent turns.

- timestamp: 2026-11-17T17:00:00Z
  checked: exhaustive grep for other AI progress indicators across src/components/ai, src/components/shell, src/workbench
  found: No other clickable AI-progress control performs tab navigation. AgentActivityPanel's progress card (activity-progress-card) has no click handler; TeamActivityIndicator opens only a stop popover; ChatTabBar status badges are non-interactive. The only navigation-bearing progress clicks are the two ActiveAiTurnIndicator mount sites.
  implication: Scope #2 ("indicator in AI chat panel") is served by the same component/handler; no second distinct fix site needed, but both mounts will be verified.

- timestamp: 2026-11-17T17:00:00Z
  checked: src/db/repositories/aiTeamRepo.ts (getTeam, lines 92-97) and src/db/index.ts (db export, line 689)
  found: getTeam(id, db) returns the AiTeam row with .name; db singleton is available for an async lookup in the click handler.
  implication: Authoritative team name can be resolved from teamId at click time.

- timestamp: 2026-11-17T17:10:00Z
  checked: tests/ai/ActiveAiTurnIndicator.test.tsx (RED phase)
  found: Added 3 regression tests (2 mount modes + stale-tab correction). Running `npx vitest run tests/ai/ActiveAiTurnIndicator.test.tsx` yields 3 failures all with `expected 'An' to be 'Nhóm Alpha'` at the tab-title assertion — confirming the bug reproduces deterministically via test. A 4th unrelated pre-existing failure (BudgetTopUpModal "12,000 token" vs "12000 token" separator) was present and is not caused by this change.
  implication: Bug reproduced; proceed to minimal fix.

## Resolution

root_cause: handleOpenChat in ActiveAiTurnIndicator.tsx used `turn.title` as the team_workspace tab title. For team-run agent turns, title is the individual agent's name (teamRunCoordinator registerAgentTurn sets title: name), while the authoritative chat-group name lives on the AiTeam row (db.aiTeams.get(teamId).name). Clicking the indicator therefore created/opened the group tab labelled with the agent name. Both the compact footer indicator and the default chat-panel indicator share this one handler (2 mount sites, 2 click paths each).
fix: Resolve the authoritative group name via getTeam(teamId) at click time; always route through openTab (which both focuses and can rename an existing tab) using the team row's name as the tab title. Fall back to an existing correct tab title or 'Nhóm AI' if the team row is unavailable. Never use turn.title (agent name) as the tab label.
verification:
  target_test: { result: pass, note: "3 new regression tests pass (footer compact, chat-panel default, stale-tab correction); 10/11 pass in focused file; 1 pre-existing unrelated BudgetTopUpModal failure (12,000 vs 12000 locale separator) present in both RED and GREEN runs" }
  mutation_check: { result: skipped, reason: "no Stryker config or dependency in this project" }
  no_op_deletion: { result: pass, deletion_justified_by_rca: false, note: "fix adds an authoritative name lookup and stale-tab correction; adds behavior rather than deleting/short-circuiting it" }
  adjacent_tests: { result: pass, suites_run: [src/workbench/__tests__/layoutStore.test.ts, tests/services/ai/office/teamRunCoordinator.test.ts, src/db/repositories/__tests__/chatTabRepo.test.ts, tests/ai/ActiveAiTurnIndicator.test.tsx], note: "225 passed / 226; 1 pre-existing BudgetTopUpModal failure confirmed present at HEAD (12,000 vs 12000 locale separator), file not modified by me" }
  revert_and_reconfirm: { result: pass, bug_returned_on_revert: true, fixed_on_reapply: true, note: "reverted ActiveAiTurnIndicator.tsx to HEAD -> 3 regression tests failed again with expected 'An' to be 'Nhóm Alpha'; reapplied fix -> tests green" }
  typecheck: { result: pass_for_owned_files, note: "npx tsc --noEmit: no errors in ActiveAiTurnIndicator.tsx or its test; unrelated pre-existing errors in WorkbenchLayout.tsx and useTimerAlertMonitor.ts from parallel sessions" }
  guardrail_verdict: accepted
files_changed:
  - src/components/ai/ActiveAiTurnIndicator.tsx
  - tests/ai/ActiveAiTurnIndicator.test.tsx
