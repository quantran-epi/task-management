---
phase: 14
slug: knowledge-base-integration-docs-linking-ai-retrieval
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-10-04
---

# Phase 14 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.2 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run src/utils/bm25.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run <changed_test_file>`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 14-01-01 | 01 | 1 | REQ-14.1 | T-14-01 | Schema migration preserves existing notes without corruption | unit | `npx vitest run src/db/repositories/noteRepo.test.ts` | ❌ W0 | ⬜ pending |
| 14-01-02 | 01 | 1 | REQ-14.2 | T-14-02 | Lexical BM25 search sanitizes regex and strips diacritics safely | unit | `npx vitest run src/utils/bm25.test.ts` | ❌ W0 | ⬜ pending |
| 14-02-01 | 02 | 2 | REQ-14.3 | T-14-03 | Wiki-links parse safely without XSS in chip rendering | unit | `npx vitest run src/utils/markdown.test.ts` | ✅ (extend) | ⬜ pending |
| 14-02-02 | 02 | 2 | REQ-14.4 | T-14-04 | Smart ingestion regex handles untrusted input without ReDoS | unit | `npx vitest run src/utils/smartIngestion.test.ts` | ❌ W0 | ⬜ pending |
| 14-03-01 | 03 | 3 | REQ-14.5 | T-14-05 | AI tool enforces char limit and filters deleted documents | integration | `npx vitest run src/services/ai/aiTools.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/utils/bm25.test.ts` — Tests BM25 ranking, weights (Title x3, Tags x2, Body x1), and Vietnamese diacritic tolerance
- [ ] `src/utils/smartIngestion.test.ts` — Tests title extraction from `# H1`, hashtag parsing, and Jira/task regex matching
- [ ] `src/db/repositories/noteRepo.test.ts` — Tests folder hierarchy (`parentId`), tag querying, and soft deletion (`deletedAt`)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 3-column Docs layout responsiveness & drag-drop | REQ-14.6 | Visual UI interaction across screen breakpoints | Open `/notes`, toggle folder tree sidebar, resize window, test split preview and ToC clicking |
| 1-Click Link "Áp dụng tất cả" banner interaction | REQ-14.4 | Toast/notification and immediate UI reflection | Paste markdown text containing task title, click "Áp dụng tất cả", verify chips appear |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending 2026-10-04
