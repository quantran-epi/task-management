import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * UAT live-inspection-resize-hide: the Activity rail's Splitter.Panel min limit must be a
 * numeric px value, not a px STRING. antd 6.6.5 parses a string `min` with
 * `getPtg(str) = Number(str.slice(0,-1))/100`, so "280px" becomes Number("280x") = NaN.
 * That NaN disables the min-size clamp (getLimitSize returns NaN), letting a resize/collapse
 * drive the rail to 0 while React's `activityOpen` stays true — the Activity affordance then
 * cannot reopen it. This source invariant is the durable guard (jsdom's noop ResizeObserver
 * cannot exercise the real browser's size math).
 */
const workspaceSource = readFileSync(
  resolve(process.cwd(), 'src/components/ai/office/TeamWorkspace.tsx'),
  'utf8'
);

describe('TeamWorkspace — Activity rail resize invariants (UAT live-inspection-resize-hide)', () => {
  it('uses a numeric px min limit on the Activity rail panel (no px-string NaN trap)', () => {
    const railPanel = workspaceSource.match(
      /<Splitter\.Panel[^>]*defaultSize="28%"[^>]*>/
    );
    expect(railPanel).not.toBeNull();
    const panelTag = railPanel![0];
    // A px-string like min="280px" parses to NaN in antd and silently disables the clamp.
    expect(panelTag).not.toMatch(/min="\d+px"/);
    expect(panelTag).toMatch(/min=\{\d+\}/);
  });

  it('keeps the Activity affordance wired to reopen the rail regardless of sidebar state', () => {
    // The rail is conditionally mounted from `activityOpen`; reopening must remain possible
    // through the header affordance (setActivityOpen(true)) independently of any layout state.
    expect(workspaceSource).toMatch(/data-testid="team-activity-affordance"/);
    expect(workspaceSource).toMatch(/onClick=\{\(\) => setActivityOpen\(true\)\}/);
  });
});
