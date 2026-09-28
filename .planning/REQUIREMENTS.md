# Milestone v1.1 Requirements

**Milestone:** v1.1 Banking IT Enhancements & Jira Integration  
**Goal:** Enhance application for banking IT development environment (SHB) with operational ownership fields, task work types, Jira Cloud connectivity, date-range task search, custom reminders, and advanced workload analytics.

## Requirements

### Banking IT Domain Fields (SHB)

- [x] **SHB-01**: User can add and edit multiple Ops Owner names (`opsOwners: string[]`) on Project, Milestone, and Task.
- [x] **SHB-02**: User can add and edit multiple Business Analyst names (`businessAnalysts: string[]`) on Project, Milestone, and Task.
- [x] **SHB-03**: Tasks and milestones visually display inherited Ops Owner and BA tags from parent project/milestone when not overridden.
- [x] **SHB-04**: User can assign a Work Type (`workType: 'code' | 'document' | 'meeting' | 'support_testing' | 'investigate'`) to each Task with visual badge and filter support.
- [x] **SHB-05**: Database upgrades to schema v2 with multi-entry indexes for `*opsOwners`, `*businessAnalysts`, and index for `workType`, preserving v1 data and backup compatibility.

### Jira Cloud Integration

- [x] **JIRA-01**: User can configure Jira Cloud domain (`xxx.atlassian.net`), email, API token, and optional CORS Proxy URL in Settings.
- [x] **JIRA-02**: User can test Jira Cloud connection with immediate diagnostic feedback (authenticating, CORS detection, success/failure).
- [x] **JIRA-03**: User can create a new Jira issue directly from a local task with summary and minimal ADF description, auto-linking the Jira key.
- [x] **JIRA-04**: User can manually link an existing Jira issue key to a local task and open the Jira web URL in one click.
- [x] **JIRA-05**: User can inspect and execute Jira status transitions directly from the task detail modal.

### Date-Range Search & Multi-Criteria Filtering

- [x] **SRCH-01**: User can search and filter tasks by planned execution date window (via daily allocation ledger).
- [x] **SRCH-02**: User can search and filter tasks by deadline date range.
- [x] **SRCH-03**: User can filter tasks simultaneously by status, priority, workType, project, milestone, Ops Owner, and BA.
- [x] **SRCH-04**: User can copy filtered task results as formatted Markdown standup summary to clipboard.

### Notifications & Custom Reminders

- [ ] **NOTIF-01**: User can set custom reminder date (`reminderDate: YYYY-MM-DD`) and optional note on Project, Milestone, and Task.
- [ ] **NOTIF-02**: User sees proactive in-app alert badge and notification drawer in application header showing active alerts.
- [ ] **NOTIF-03**: System alerts user to overdue tasks and tasks approaching deadline (today/tomorrow).
- [ ] **NOTIF-04**: System alerts user to days where planned work exceeds available capacity (>100% overload).
- [ ] **NOTIF-05**: System alerts user to stale tasks in 'In Progress' or 'In Review' status with no activity for more than 5 days.

### Enhanced Analytics Dashboard

- [ ] **ANLT-01**: User can view milestone burndown chart (lightweight SVG vector) tracking remaining vs completed work over time.
- [ ] **ANLT-02**: User can view task status distribution and completion velocity across projects.
- [ ] **ANLT-03**: User can view workload allocation broken down by Ops Owner, Business Analyst, and Work Type (hours and active task counts).

## Future Requirements (Deferred)

- **FUTR-01**: Full bidirectional Jira issue webhook sync (deferred - requires server/push).
- **FUTR-02**: Jira sprint and epic hierarchical import (deferred - v1.2 candidate).
- **FUTR-03**: Native browser Push Notification API with service worker background sync.

## Out of Scope

- Direct OAuth 2.0 PKCE flow for Jira Cloud (requires registered client ID/secret; API tokens provide zero-config per-user access).
- Public third-party CORS proxy services (blocked to protect confidential banking tokens and data).
- Complex chart libraries (`@ant-design/plots`, `recharts`, `chart.js`) — keep zero new dependencies; lightweight native React SVG suffices.

## Traceability

| Requirement | Phase | Status |
|---|---|---|
| SHB-01 | Phase 9 | Complete |
| SHB-02 | Phase 9 | Complete |
| SHB-03 | Phase 9 | Complete |
| SHB-04 | Phase 9 | Complete |
| SHB-05 | Phase 9 | Complete |
| SRCH-01 | Phase 10 | Complete |
| SRCH-02 | Phase 10 | Complete |
| SRCH-03 | Phase 10 | Complete |
| SRCH-04 | Phase 10 | Complete |
| JIRA-01 | Phase 11 | Complete |
| JIRA-02 | Phase 11 | Complete |
| JIRA-03 | Phase 11 | Complete |
| JIRA-04 | Phase 11 | Complete |
| JIRA-05 | Phase 11 | Complete |
| NOTIF-01 | Phase 12 | Pending |
| NOTIF-02 | Phase 12 | Pending |
| NOTIF-03 | Phase 12 | Pending |
| NOTIF-04 | Phase 12 | Pending |
| NOTIF-05 | Phase 12 | Pending |
| ANLT-01 | Phase 13 | Pending |
| ANLT-02 | Phase 13 | Pending |
| ANLT-03 | Phase 13 | Pending |
