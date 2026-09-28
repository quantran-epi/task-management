---
phase: 11
slug: jira-cloud-integration-task-lifecycle
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-28
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.2 |
| **Config file** | `vite.config.ts` |
| **Quick run command** | `npm test -- src/services/jira` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- src/services/jira`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 11-01-01 | 01 | 1 | JIRA-01 | T-11-01 | Token stored only in local `db.settings`, never exposed | unit | `npm test -- src/components/settings/__tests__/JiraConfigCard.test.tsx` | ❌ W0 | ⬜ pending |
| 11-01-02 | 01 | 1 | JIRA-02 | T-11-01 | Error diagnostics sanitize token from output | unit | `npm test -- src/services/jira/__tests__/jiraApi.test.ts` | ❌ W0 | ⬜ pending |
| 11-02-01 | 02 | 2 | JIRA-03 | T-11-03 | Plaintext converted to valid ADF structure | unit | `npm test -- src/services/jira/__tests__/adf.test.ts` | ❌ W0 | ⬜ pending |
| 11-02-02 | 02 | 2 | JIRA-03 | T-11-03 | Create issue modal triggers API and links key | component | `npm test -- src/components/tasks/__tests__/CreateJiraIssueModal.test.tsx` | ❌ W0 | ⬜ pending |
| 11-02-03 | 02 | 2 | JIRA-04 | T-11-02 | Jira key validated against regex and unlinked safely | component | `npm test -- src/components/tasks/__tests__/TaskJiraSection.test.tsx` | ❌ W0 | ⬜ pending |
| 11-03-01 | 03 | 3 | JIRA-05 | — | Status categories correctly mapped to local statuses | unit | `npm test -- src/services/jira/__tests__/statusMapping.test.ts` | ❌ W0 | ⬜ pending |
| 11-03-02 | 03 | 3 | D-12..15 | — | Tag in table, search filter, and standup include Jira Key | unit | `npm test -- src/utils/__tests__/filter.test.ts src/utils/__tests__/standup.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/services/jira/__tests__/jiraApi.test.ts` — Stubs for API client, auth headers, CORS handling, timeout, token sanitization.
- [ ] `src/services/jira/__tests__/adf.test.ts` — Stubs for plaintext to ADF v3 serialization.
- [ ] `src/services/jira/__tests__/statusMapping.test.ts` — Stubs for Smart Status Mapping rules.
- [ ] `src/components/settings/__tests__/JiraConfigCard.test.tsx` — Stubs for settings form and diagnostic feedback component.
- [ ] `src/components/tasks/__tests__/TaskJiraSection.test.tsx` — Stubs for TaskDrawer Jira section and transition triggers.
- [ ] `src/components/tasks/__tests__/CreateJiraIssueModal.test.tsx` — Stubs for Jira issue creation modal.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real Jira Cloud live API call | JIRA-02 | Requires live Atlassian Cloud instance, active user account, and CORS proxy | Enter real Jira domain, email, token, and CORS proxy in Settings, click "Test Connection", verify diagnostic success feedback |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending 2026-09-28
