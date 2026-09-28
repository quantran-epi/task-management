---
status: complete
phase: 11-jira-cloud-integration-task-lifecycle
source: [11-01-SUMMARY.md, 11-02-SUMMARY.md, 11-03-SUMMARY.md]
started: 2026-09-28T21:15:00Z
updated: 2026-09-28T22:15:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running server/service. Clear ephemeral state (temp DBs, caches, lock files). Start the application from scratch. Server boots without errors, any seed/migration completes, and a primary query (health check, homepage load, or basic API call) returns live data.
result: pass

### 2. Jira Settings Configuration and Connection Test
expected: Navigate to Settings -> Jira Cloud tab. Form renders fields for Jira Domain, Email, API Token, and optional CORS Proxy URL. Entering credentials and clicking Test Connection shows diagnostic feedback (success with user name/email, CORS warning if blocked, or auth error on 401/403). Saving persists credentials in local settings.
result: pass

### 3. Jira Section in Task Drawer & Issue Creation
expected: Open Task Drawer for any task. Jira section displays either "Not linked" status or existing Jira link. Clicking "Tạo Jira Issue" opens modal pre-filled with task title and description. Submitting creates issue in Jira Cloud and links key to task.
result: pass

### 4. Manual Jira Key Linking & Status Transitions
expected: In Task Drawer Jira section, entering a valid Jira key (e.g. "PROJ-123") links the issue. Linking loads issue details and available status transitions. Executing a transition updates Jira status and syncs local task status. Unlinking with Popconfirm confirmation removes Jira key from task.
result: pass

### 5. Jira Filter & Keyword Search in Tasks View
expected: In Tasks view (/tasks), TaskFilterBar displays Jira status filter (All / Có Jira / Chưa có Jira). Selecting "Có Jira" filters tasks to only linked tasks. Keyword search matching a Jira key (e.g. "PROJ-123") case-insensitively returns the corresponding task.
result: pass

### 6. Jira Key Tags in Task Table & Planner Card
expected: TaskTable displays blue/colored Jira key tag in Jira column with external link icon. TaskAllocationCard in /planner displays micro-badge for linked tasks. Clicking Jira key opens Jira issue in a new browser tab without opening TaskDrawer or allocation popover (stopPropagation).
result: pass

### 7. Jira Key in Standup Summary Export
expected: In Standup Export modal (/tasks), generated daily summary text includes `[JiraKey]` immediately after `[WorkType]` (e.g. `- [Lập trình][PROJ-123] Feature name`) for linked tasks, and omits it cleanly for unlinked tasks.
result: pass

## Summary

total: 7
passed: 7
issues: 0
pending: 0
skipped: 0

## Gaps

[none yet]
