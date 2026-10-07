---
phase: quick
plan: 261007-iwb
type: execute
wave: 1
depends_on: []
files_modified:
  - tests/noteAttachments.test.ts
autonomous: true
requirements:
  - QUICK-261007-IWB-FIX-NOTEATTACHMENTS-TEST
estimate:
  tokens: 15000
  raw_tokens: 10000
  tasks: 1
  confidence: high
must_haves:
  truths:
    - "tests/noteAttachments.test.ts passes completely without failures under vitest."
    - "Test verifies backup export excludes binary/base64 data from noteAttachments and generates/preserves filePath."
    - "Test verifies restore handles payloads without attachment binary data by generating a safe empty Blob fallback."
    - "Test verifies restore retains backward compatibility by converting legacy base64 data to Blob when present."
  artifacts:
    - tests/noteAttachments.test.ts
  key_links:
    - "tests/noteAttachments.test.ts imports exportBackupPayload from src/services/backup/exportBackup and restoreBackupPayload from src/services/backup/restoreBackup"
---

<objective>
Fix the failing `noteAttachments.test.ts` test caused by commit 4c40330, which strictly excluded binary/base64 image data from exported backups to prevent payload bloat. Update the test expectations to assert binary exclusion while verifying metadata preservation, empty Blob fallback, and legacy base64 restore capability.

Purpose: Restore 100% passing test status across the test suite after binary data exclusion from backup exports.
Output: Updated `tests/noteAttachments.test.ts` passing all test assertions.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/services/backup/exportBackup.ts
@src/services/backup/restoreBackup.ts
@tests/noteAttachments.test.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Align noteAttachments backup test assertions with binary exclusion policy</name>
  <files>tests/noteAttachments.test.ts</files>
  <action>
    Update `tests/noteAttachments.test.ts` in the describe block `Backup export and restore round-trip (D-19)`:
    1. Update the test `exports attachments as Base64 in backup payload version 4 and restores them faithfully`:
       - Rename it to reflect current behavior: `exports attachments without binary data in backup payload version 4 and restores metadata faithfully`.
       - Change `expect(exportedAttachment.data).toMatch(/^data:image\/png;base64,/)` to expect `exportedAttachment.data` to be undefined, and assert `exportedAttachment.filePath` is defined and matches the expected default pattern `attachments/${att.id}_${att.fileName}`.
       - In the restore verification section, assert that the restored attachment has the correct `fileName`, `caption`, `filePath`, and that `restoredAttachments[0]?.data` is defined (empty Blob fallback per `restoreBackup.ts`).
    2. Add/verify a test verifying legacy backup restore backward compatibility:
       - When a backup payload explicitly contains a base64 `data` string on an attachment (simulating legacy v4 or imported payload with data), `restoreBackupPayload` successfully restores the binary Blob and its `.text()` matches the original content.
  </action>
  <verify>
    <automated>npx vitest run tests/noteAttachments.test.ts</automated>
  </verify>
  <done>All 6+ tests in tests/noteAttachments.test.ts pass with zero errors.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Backup Payload -> Restore DB | Untrusted/external backup payload deserialized into IndexedDB |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-Q-01 | Tampering | tests/noteAttachments.test.ts | low | mitigate | Ensure test rigorously asserts both binary-excluded export format and legacy base64 import compatibility |
| T-Q-SC | Tampering | npm/pip/cargo installs | high | mitigate | No new packages installed |
</threat_model>

<verification>
Run `npx vitest run tests/noteAttachments.test.ts` and ensure all tests pass.
</verification>

<success_criteria>
`tests/noteAttachments.test.ts` passes cleanly without type errors or assertion failures.
</success_criteria>

<output>
Create `.planning/quick/261007-iwb-fix-noteattachments-test-failure-after-b/261007-iwb-SUMMARY.md` when done.
</output>
