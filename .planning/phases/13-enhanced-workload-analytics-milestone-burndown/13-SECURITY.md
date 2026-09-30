---
phase: "13"
slug: "enhanced-workload-analytics-milestone-burndown"
status: verified
threats_open: 0
asvs_level: 1
created: "2026-09-30"
updated: "2026-09-30"
---

# Phase 13 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| URL Hash Params -> Routing | Untrusted input in hash route params (e.g. `#/analytics?milestoneId=...`) crosses into state | Route parameter string |
| User Input -> Date & Duration Math | Date inputs or malformed task dates cross into date math functions | Calendar strings & numeric durations |
| Component Props -> SVG Coordinate Math | Numeric inputs (`totalScope`, coordinates) cross into SVG path string generation | Numbers formatted into SVG markup |
| IndexedDB -> Analytics Computation | Corrupt or unexpected task/milestone records loaded into analytics aggregators | Local task & milestone domain objects |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-13-01 | Tampering | `src/hooks/useHashRoute.ts` | low | mitigate | Strict string extraction and validation for `milestoneId` query param | closed |
| T-13-02 | Denial of Service | `src/utils/analytics.ts` | low | mitigate | Clamped date ranges (max 365 days) and 14-day fallback prevent infinite loops | closed |
| T-13-03 | Tampering / XSS | `src/components/analytics/BurndownSvgChart.tsx` | low | mitigate | Native React JSX SVG elements instead of dangerouslySetInnerHTML | closed |
| T-13-04 | Denial of Service | `src/components/analytics/StackedStatusBar.tsx` | low | mitigate | Guard against division by zero (e.g. totalTasks === 0) preventing NaN in CSS widths | closed |
| T-13-05 | Denial of Service | `src/views/AnalyticsView.tsx` | low | mitigate | Wrap analytics calculations in React useMemo to prevent redundant recalculations | closed |
| T-13-06 | Information Disclosure | `src/views/AnalyticsView.tsx` | low | mitigate | Purely client-side IndexedDB reads with zero network transmission or remote logging | closed |
| T-13-SC | Tampering | npm dependencies | high | mitigate | Zero external charting libraries; native browser SVG elements only | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

No accepted risks.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-09-30 | 7 | 7 | 0 | gsd-secure-phase |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-09-30
