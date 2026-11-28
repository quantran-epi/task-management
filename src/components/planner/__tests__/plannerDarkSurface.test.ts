import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = process.cwd();

function source(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), 'utf8');
}

const PLANNER_SOURCES = [
  'src/views/PlannerView.tsx',
  'src/components/planner/DayColumn.tsx',
  'src/components/planner/DayColumnHeader.tsx',
  'src/components/planner/TaskAllocationCard.tsx',
  'src/components/planner/ActualWorklogPlanner.tsx',
  'src/components/planner/AllocationModal.tsx',
  'src/components/planner/FeasibilityModal.tsx',
  'src/components/planner/WorkSessionDetailModal.tsx',
  'src/components/planner/DayInsightPanel.tsx',
];

const LIGHT_LITERALS = [
  '#fafafa',
  '#f0f0f0',
  '#d9d9d9',
  '#f5f5f5',
  '#52c41a',
  '#ff4d4f',
  '#faad14',
  '#fa8c16',
  '#e6f4ff',
  '#91caff',
  'rgba(22, 119, 255',
];

describe('planner dark surface', () => {
  it.each(PLANNER_SOURCES)('%s has no hardcoded light literal', (relativePath) => {
    const text = source(relativePath);
    for (const literal of LIGHT_LITERALS) {
      expect(text, `${relativePath} must not contain ${literal}`).not.toContain(literal);
    }
  });

  it('scoped CSS uses theme variables instead of redefining the palette', () => {
    const css = source('src/components/planner/planner-surface.css');
    expect(css).toContain('var(--bg-island)');
    expect(css).toContain('var(--accent)');
    expect(css).not.toMatch(/#fafafa|#f0f0f0|#d9d9d9|#f5f5f5/);
  });

  it('PlannerView imports the scoped stylesheet', () => {
    expect(source('src/views/PlannerView.tsx')).toContain('planner-surface.css');
  });
});
