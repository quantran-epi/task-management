#!/usr/bin/env node
/**
 * Builds `change-pack-CR-2026-001.zip` for manually walking the SDLC hub flow.
 *
 * Run from the repo root: node test-data/sdlc-flow/generate-change-pack.mjs
 *
 * The pack's `meta.json.cr` MUST equal the CR typed into the hub's intake modal, otherwise
 * `validateHubChangePack` rejects it with PACK_IDENTITY_MISMATCH. Entry paths must also pass
 * `entryPolicy` in src/services/wizard/changePack.ts: only diff.patch, meta.json,
 * sql/*.sql|plb|pck|pkb and new-files/* are accepted.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const here = path.dirname(fileURLToPath(import.meta.url));
const CR = 'CR-2026-001';

const meta = {
  cr: CR,
  base: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0',
  head: 'b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0',
  branch: `feature/${CR}`,
  author: 'dev@example.local',
  generatedAt: '2026-11-01T09:00:00.000Z',
  commits: [
    { sha: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0', subject: 'base: sổ tiết kiệm hiện tại' },
    { sha: 'b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0', subject: `feat(${CR}): rút gốc một phần` },
  ],
  files: [
    { path: 'src/services/savings/partialWithdrawal.ts', status: 'added' },
    { path: 'src/api/routes/savings.ts', status: 'modified' },
    { path: 'sql/SYN_SAVING_WITHDRAWAL.sql', status: 'added' },
  ],
};

/**
 * Drift is intentional here: the implementation follows PL02 (which asks for the withdrawal
 * history query and the in-app notification) but skips the notification, and it adds a
 * rate-snapshot column the spec never mentions. That gives the drift matrix both a `missing`
 * tuple and an `outside_solution` tuple to render.
 */
const diffPatch = `diff --git a/src/services/savings/partialWithdrawal.ts b/src/services/savings/partialWithdrawal.ts
new file mode 100644
index 0000000..1111111
--- /dev/null
+++ b/src/services/savings/partialWithdrawal.ts
@@ -0,0 +1,38 @@
+export const MIN_WITHDRAW = 1_000_000;
+export const MIN_REMAINING = 500_000;
+
+export interface PartialWithdrawalInput {
+  principalAmount: number;
+  amount: number;
+  nonTermRate: number;
+  daysHeld: number;
+}
+
+export interface PartialWithdrawalResult {
+  nonTermInterest: number;
+  remainingPrincipal: number;
+}
+
+export function computePartialWithdrawal(
+  input: PartialWithdrawalInput,
+): PartialWithdrawalResult {
+  if (input.amount < MIN_WITHDRAW) throw new Error('AMOUNT_BELOW_MINIMUM');
+  if (input.principalAmount - input.amount < MIN_REMAINING) {
+    throw new Error('REMAINING_BELOW_MINIMUM');
+  }
+  const nonTermInterest = Math.round(
+    ((input.amount * input.nonTermRate * input.daysHeld) / 365) * 100,
+  ) / 100;
+  return {
+    nonTermInterest,
+    remainingPrincipal: input.principalAmount - input.amount,
+  };
+}
diff --git a/src/api/routes/savings.ts b/src/api/routes/savings.ts
index 2222222..3333333 100644
--- a/src/api/routes/savings.ts
+++ b/src/api/routes/savings.ts
@@ -10,6 +10,20 @@ import { Router } from 'express';
 const router = Router();

+router.post('/savings/:accountId/partial-withdrawal', async (req, res) => {
+  const account = await findSavingAccount(req.params.accountId);
+  if (!account || account.status !== 'ACTIVE') {
+    return res.status(409).json({ code: 'ACCOUNT_NOT_ACTIVE' });
+  }
+  const { nonTermInterest, remainingPrincipal } = computePartialWithdrawal({
+    principalAmount: account.principalAmount,
+    amount: req.body.amount,
+    nonTermRate: account.nonTermRate,
+    daysHeld: account.daysHeld,
+  });
+  // NOTE: commits the new principal before writing the withdrawal history row.
+  await updatePrincipal(account.id, remainingPrincipal);
+  return res.status(201).json({ nonTermInterest, remainingPrincipal });
+});
+
 export default router;
`;

const newFile = `export const MIN_WITHDRAW = 1_000_000;
export const MIN_REMAINING = 500_000;

export function isWithdrawalAllowed(principalAmount: number, amount: number): boolean {
  return amount >= MIN_WITHDRAW && principalAmount - amount >= MIN_REMAINING;
}
`;

const sqlFile = `CREATE TABLE SYN_SAVING_WITHDRAWAL (
  WITHDRAWAL_ID      VARCHAR2(32)  NOT NULL,
  ACCOUNT_ID         VARCHAR2(32)  NOT NULL,
  WITHDRAWN_AMOUNT   NUMBER(18,2)  NOT NULL,
  NON_TERM_INTEREST  NUMBER(18,2)  NOT NULL,
  REMAINING_PRINCIPAL NUMBER(18,2) NOT NULL,
  RATE_SNAPSHOT      NUMBER(9,4),
  WITHDRAWN_AT       TIMESTAMP     DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT PK_SYN_SAVING_WITHDRAWAL PRIMARY KEY (WITHDRAWAL_ID)
);
`;

const entries = {
  'diff.patch': diffPatch,
  'meta.json': JSON.stringify(meta, null, 2),
  'new-files/src/services/savings/partialWithdrawal.ts': newFile,
  'sql/SYN_SAVING_WITHDRAWAL.sql': sqlFile,
};

const zip = new JSZip();
for (const [name, content] of Object.entries(entries)) zip.file(name, content);
const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
const out = path.join(here, `change-pack-${CR}.zip`);
await fs.writeFile(out, bytes);
console.log(`wrote ${path.relative(process.cwd(), out)} (${bytes.byteLength} bytes, cr=${CR})`);
