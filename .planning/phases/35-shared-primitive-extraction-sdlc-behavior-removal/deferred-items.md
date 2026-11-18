# Phase 35 — Deferred Items

Out-of-scope findings discovered during execution. Not fixed here; each names the
owning change so the verifier can route it.

## 1. `tests/knowledge/KnowledgeServerConfigCard.test.tsx:225` — ambiguous `Lưu cấu hình` selector

- **Status:** pre-existing, unrelated to Phase 35
- **Symptom:** `Found multiple elements with the role "button" and name /Lưu cấu hình/`
- **Cause:** `SettingsView`'s `ai` tab renders `KnowledgeServerConfigCard`,
  `OracleAiToolConfigCard`, and `SshFsAiToolConfigCard`, all of which expose a
  `Lưu cấu hình` button. The test mocks only `McpConfigCard`,
  `GhostDevConfigCard`, and `NineRouterConfigCard`.
- **Evidence it predates this phase:** the test file is byte-identical to the
  phase base `d504a18f` (`md5sum` `d7f1710cea0c467e98451a3f0c2ba3c0`), no Phase 35
  plan touched `src/views/SettingsView.tsx`, and the two competing cards landed in
  `a55e41e0` / `fb5279ed`, both ancestors of the phase base. The test's own last
  edit (`c71a3838`) precedes both.
- **Fix when picked up:** scope the query (`getAllByRole(...)[n]`) or mock the two
  AI-tool cards in that test's `vi.mock` block.
