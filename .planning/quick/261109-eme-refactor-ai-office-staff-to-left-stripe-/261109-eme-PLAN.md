---
phase: quick-261109-eme
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/workbench/TitleBar.tsx
  - src/views/AiOfficeView.tsx
  - src/workbench/store/layoutStore.ts
  - src/workbench/EditorArea.tsx
  - src/workbench/WorkbenchLayout.tsx
  - src/workbench/toolwindows/LeftToolWindow.tsx
  - src/workbench/toolwindows/AiStaffExplorer.tsx
  - src/workbench/toolwindows/AiOfficeExplorer.tsx
  - src/views/StaffDetailView.tsx
  - src/views/TeamWorkspaceView.tsx
  - tests/workbench/AiExplorers.test.tsx
autonomous: true
requirements: [AI-OFFICE-LEFT-STRIPE, HIDE-GHOST-DEV]
must_haves:
  truths:
    - "Ghost Dev and AI Office buttons are removed from TitleBar"
    - "AiOfficeView does not render Ghost Dev segment tab"
    - "AI Staff (Leads & Agents) tool window item exists in Left Stripe above remote_explorer"
    - "AI Office (Teams) tool window item exists in Left Stripe"
    - "Clicking an employee or lead in AI Staff explorer opens dedicated staff_detail tab in EditorArea"
    - "StaffDetailView supports viewing and editing staff persona, role, model, capability, and skill directly in tab"
    - "Clicking a team in AI Office explorer opens dedicated team_workspace tab in EditorArea"
  artifacts:
    - src/workbench/toolwindows/AiStaffExplorer.tsx
    - src/workbench/toolwindows/AiOfficeExplorer.tsx
    - src/views/StaffDetailView.tsx
    - src/views/TeamWorkspaceView.tsx
    - tests/workbench/AiExplorers.test.tsx
  key_links:
    - "LeftToolWindow renders AiStaffExplorer when leftActiveId === 'ai_staff'"
    - "LeftToolWindow renders AiOfficeExplorer when leftActiveId === 'ai_office'"
    - "EditorArea renders StaffDetailView for staff_detail viewType and TeamWorkspaceView for team_workspace viewType"
---

<objective>
Refactor AI Office & Staff management into IntelliJ Left Stripe tool windows and Editor Center tabs, while hiding Ghost Dev entry points.

Purpose: Bring AI Office teams and staff management into the native IDE workbench workflow (Left Stripe explorers + Editor tabs) rather than modal views or legacy top TitleBar buttons, and hide Ghost Dev from the main user navigation.
Output: AiStaffExplorer, AiOfficeExplorer, StaffDetailView, TeamWorkspaceView, updated TitleBar, WorkbenchLayout, LeftToolWindow, layoutStore, and EditorArea.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@src/workbench/TitleBar.tsx
@src/workbench/WorkbenchLayout.tsx
@src/workbench/toolwindows/LeftToolWindow.tsx
@src/workbench/store/layoutStore.ts
@src/workbench/EditorArea.tsx
@src/views/AiOfficeView.tsx
@src/views/TeamsView.tsx
@src/components/ai/office/EmployeeEditorDrawer.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Hide Ghost Dev from TitleBar & AiOfficeView and remove legacy AI Office TitleBar button</name>
  <files>src/workbench/TitleBar.tsx, src/views/AiOfficeView.tsx</files>
  <action>
    In src/workbench/TitleBar.tsx:
    - Remove Ghost Dev Agents button and its tooltip/badge from TitleBar header right quick view navigation group.
    - Remove AI Office button from TitleBar header right quick view navigation group (now accessed via Left Stripe).
    - Remove unused Ghost Dev imports/hooks if no longer needed in TitleBar.

    In src/views/AiOfficeView.tsx:
    - Remove the outer Segmented control switching between 'office' and 'ghost-dev'.
    - Remove rendering of AgentControlView. The view directly renders the AI Office content (employees, leads, skills segments) without the Ghost Dev tab.
  </action>
  <verify>
    <automated>npm run typecheck</automated>
  </verify>
  <done>
    Ghost Dev and AI Office buttons no longer appear in TitleBar; AiOfficeView renders AI Office content directly without Ghost Dev toggle.
  </done>
</task>

<task type="auto">
  <name>Task 2: Register viewTypes and implement StaffDetailView and TeamWorkspaceView editor views</name>
  <files>src/workbench/store/layoutStore.ts, src/views/StaffDetailView.tsx, src/views/TeamWorkspaceView.tsx, src/workbench/EditorArea.tsx</files>
  <action>
    In src/workbench/store/layoutStore.ts:
    - Add 'staff_detail' and 'team_workspace' to EditorViewType union.

    Create src/views/StaffDetailView.tsx:
    - Accept props: db?: TaskPlannerDatabase, staffId: string, role: 'employee' | 'lead'.
    - Query employee or lead from db via liveQuery/listEmployees/listLeads.
    - Provide inline editor form in the tab area for editing name, role, capability, persona, model (using available models from nineRouterTokenService), and skill (if employee).
    - Provide Save button updating record via updateEmployee or updateLead, with feedback message.

    Create src/views/TeamWorkspaceView.tsx:
    - Accept props: db?: TaskPlannerDatabase, teamId: string.
    - Load team, lead, members, employees, and skills using existing repositories (aiTeamRepo, aiOfficeRepo).
    - Render TeamWorkspace component directly inside the tab. If team is not found or deleted, show friendly empty/back message.

    In src/workbench/EditorArea.tsx:
    - Update getEditorTabIcon to handle 'staff_detail' (e.g. JetBrainsAgentsIcon or UserOutlined) and 'team_workspace' (TeamOutlined).
    - In renderViewContent, add handlers for 'staff_detail' returning StaffDetailView with params (staffId, role) and 'team_workspace' returning TeamWorkspaceView with params (teamId).
  </action>
  <verify>
    <automated>npm run typecheck</automated>
  </verify>
  <done>
    EditorArea supports opening staff_detail and team_workspace tabs with interactive viewing and editing capabilities.
  </done>
</task>

<task type="auto">
  <name>Task 3: Implement AiStaffExplorer, AiOfficeExplorer and wire Left Stripe in WorkbenchLayout & LeftToolWindow</name>
  <files>src/workbench/toolwindows/AiStaffExplorer.tsx, src/workbench/toolwindows/AiOfficeExplorer.tsx, src/workbench/toolwindows/LeftToolWindow.tsx, src/workbench/WorkbenchLayout.tsx, tests/workbench/AiExplorers.test.tsx</files>
  <action>
    Create src/workbench/toolwindows/AiStaffExplorer.tsx:
    - Lists AI Leads and AI Employees with search filter, badge count, roles, and status.
    - Includes quick button/action to create Lead or Employee.
    - Clicking an item triggers layoutStore.openTab({ id: `staff_detail:${item.id}`, title: item.name, viewType: 'staff_detail', closable: true, params: { staffId: item.id, role: item.roleType } }).

    Create src/workbench/toolwindows/AiOfficeExplorer.tsx:
    - Lists AI Teams with team name, lead, member count, and status badge (active/paused/archived).
    - Includes action to create a new team (opening drawer or modal).
    - Clicking a team triggers layoutStore.openTab({ id: `team_workspace:${team.id}`, title: team.name, viewType: 'team_workspace', closable: true, params: { teamId: team.id } }).

    In src/workbench/WorkbenchLayout.tsx:
    - In DEFAULT_LEFT_ITEMS, add { id: 'ai_office', name: 'AI Office', icon: <TeamOutlined style={{ fontSize: 16 }} />, shortcut: 'Alt+7' }.
    - In DEFAULT_BOTTOM_LEFT_ITEMS, add { id: 'ai_staff', name: 'AI Staff', icon: <JetBrainsAgentsIcon size={16} />, shortcut: 'Alt+8' } positioned directly above 'remote_explorer'.

    In src/workbench/toolwindows/LeftToolWindow.tsx:
    - Add title, icon, and component rendering for leftActiveId === 'ai_staff' (AiStaffExplorer) and leftActiveId === 'ai_office' (AiOfficeExplorer).

    Create tests/workbench/AiExplorers.test.tsx:
    - Unit tests checking that clicking an AI staff item calls openTab with staff_detail and clicking a team calls openTab with team_workspace.
  </action>
  <verify>
    <automated>npm test -- tests/workbench/AiExplorers.test.tsx</automated>
  </verify>
  <done>
    Left stripe displays AI Office in top left group and AI Staff directly above Remote Git Explorer; clicking items opens dedicated editor tabs; focused tests pass.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| User UI -> Local DB | Staff and team edits validate schemas before persistence |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-quick-01 | Tampering | StaffDetailView | medium | mitigate | Validate inputs against AiEmployeeInputSchema/AiLeadInputSchema before database update |
| T-quick-02 | Denial of Service | TeamWorkspaceView | low | mitigate | Gracefully handle deleted or missing teamId without crash |
| T-quick-SC | Tampering | npm dependencies | low | accept | No new dependencies added; using existing project libraries |
</threat_model>

<verification>
Run focus tests:
- `npm run typecheck`
- `npm test -- tests/workbench/AiExplorers.test.tsx`
</verification>

<success_criteria>
- Ghost Dev and AI Office removed from TitleBar
- AiOfficeView simplified without ghost dev tab
- AI Staff explorer on Left Stripe above remote_explorer
- AI Office explorer on Left Stripe
- Clicking staff opens StaffDetailView tab
- Clicking team opens TeamWorkspaceView tab
- Typecheck passes and focused test passes
</success_criteria>

<output>
Create `.planning/quick/261109-eme-refactor-ai-office-staff-to-left-stripe-/261109-eme-PLAN.md`
</output>
