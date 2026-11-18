---
status: diagnosed
trigger: "diện tích header ở cái panel này nhỏ nên cho vào dropdown menu đi, và có 1 bug ở cả cái này và ở ai chat drawer, đó là bấm báo nút mcp và bật mcp trong popover đang là 2 cái khác nhau, không đồng bộ, toggle mcp cần 1 chỗ thôi. còn lại thì các nút toggle được rôi"
created: 2026-11-01T00:00:00Z
updated: 2026-11-01T15:45:00Z
---

## Current Focus

hypothesis: 
1. StepChatPanel header is constrained to 320-380px width, causing ChatTabToolbox (width >430px) to wrap and overflow; needs compact Dropdown menu in header.
2. MCP control in ChatTabToolbox is rendered as a split button with two disconnected states: tab-level `mcpEnabled` boolean button (`tab-mcp-btn`) vs global DB `mcpServers[i].enabled` switches in Popover (`tab-mcp-manage-btn`). Toggling one does not synchronize with the other, causing confusion and dead tools.
test: Confirmed via codebase inspection of ChatTabToolbox.tsx, StepChatPanel.tsx, AIChatDrawer.tsx, and SdlcWorkspace.tsx.
expecting: Root cause identified; diagnosis report generated.
next_action: Return ROOT CAUSE FOUND structured output.

## Symptoms

expected: Header toolbox fits small header area cleanly; MCP toggle button and popover MCP toggle control single unified state.
actual: diện tích header ở cái panel này nhỏ nên cho vào dropdown menu đi, và có 1 bug ở cả cái này và ở ai chat drawer, đó là bấm báo nút mcp và bật mcp trong popover đang là 2 cái khác nhau, không đồng bộ, toggle mcp cần 1 chỗ thôi. còn lại thì các nút toggle được rôi
errors: None reported
reproduction: Open SDLC Studio panel header and AI chat drawer, check toolbox header layout and toggle MCP button vs popover toggle.
started: Discovered during Phase 25.2 UAT

## Eliminated

## Evidence

- timestamp: 2026-11-01T15:35:00Z
  checked: SdlcWorkspace.tsx layout for StepChatPanel
  found: StepChatPanel right container is fixed at width 380px (minWidth: 320px, maxWidth: 480px).
  implication: Full horizontal ChatTabToolbox requires >430px width (model select 145px, refresh 22px, analysis 70px, mcp 65px, auto-approve 75px, clear 22px + gaps). In a 320-380px header, this overflows and causes ugly 2-row / 3-row wrapping.

- timestamp: 2026-11-01T15:40:00Z
  checked: ChatTabToolbox.tsx lines 228-286 and AIChatDrawer.tsx / StepChatPanel.tsx MCP logic
  found: ChatTabToolbox renders a split button grouping:
    1. Outer button (`tab-mcp-btn`): toggles per-tab `mcpEnabled` boolean state (or useState in StepChatPanel).
    2. Attached popover button (`tab-mcp-manage-btn`): opens popover listing `mcpServers` with independent switches toggling `server.enabled` in DB.
  implication: The two states are completely un-synchronized:
    - If user toggles the outer button to OFF, popover switches still show ON.
    - If user toggles a server in the popover to ON while the outer button was OFF, AI tools discovery discards all tools because `mcpEnabled` is false.
    - User expects MCP toggle to exist in ONE place only rather than two desynchronized controls.

## Resolution

root_cause:
  1. Header layout: `StepChatPanel.tsx` embeds the complete desktop horizontal `ChatTabToolbox` into a narrow container (320px-380px), overflowing the header row. All toggle controls (Analysis Mode, Auto-Approve, MCP, Clear Context) need to be moved into a compact Ant Design Dropdown menu on the header row next to the Model selector.
  2. MCP desynchronization: `ChatTabToolbox.tsx` splits MCP into two separate and un-synchronized controls: an outer button that toggles `mcpEnabled` boolean, and an inner popover with independent switches toggling `server.enabled` in DB. When `mcpEnabled` is toggled off, popover switches still appear on; when servers are toggled in popover, outer `mcpEnabled` button does not update, and if `mcpEnabled` is false, popover toggles have zero effect on tools. MCP toggling must be unified in one single place.
fix:
verification:
files_changed: []
