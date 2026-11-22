import { test } from '@playwright/test';
import { captureControlEvidence } from '../tests/helpers/parityHarness';
import { CONTROL_REGISTRY } from '../tests/parity/parityEvidenceIntegrity.test';

/**
 * Phase 59 per-control Chrome parity capture. One PARITY_CONTROL per run.
 * A selector or pre-flight failure is a hard failure, never a silent skip.
 */
const requested = process.env.PARITY_CONTROL;
const ids = requested
  ? CONTROL_REGISTRY.filter((entry) => entry.id === requested).map((entry) => entry.id)
  : CONTROL_REGISTRY.map((entry) => entry.id);

if (requested && ids.length === 0) {
  throw new Error(`PARITY_CONTROL="${requested}" is not in CONTROL_REGISTRY (56 ids)`);
}

test.describe('Phase 59 control parity evidence capture', () => {
  for (const id of ids) {
    test(`${id} — capture light/dark DOM, computed metrics, interactions, screenshot`, async ({ page }) => {
      await captureControlEvidence(page, id);
    });
  }
});
