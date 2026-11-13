/**
 * The single home of the even-split rule (Phase 38 D-14).
 *
 * The total is rounded and clamped to a non-negative integer ONCE, before any division, so
 * every returned `budgetTokens` is an integer and the returned budgets sum to exactly that
 * normalized total. Floor per row, remainder on the `role === 'lead'` row.
 *
 * A roster with no lead leaves the remainder undistributed (sum = total - remainder); the repo
 * never produces such a roster, but the behaviour is stated rather than left undefined.
 *
 * Dependency-free on purpose: both `aiTeamRepo` and `TeamSettingsDrawer` import it, and the
 * repo must never import a React component.
 */

export function splitEvenly<T extends { role: 'lead' | 'employee' }>(
  total: number,
  rows: readonly T[]
): Array<T & { budgetTokens: number }> {
  const count = rows.length;
  if (count === 0) return [];

  const normalized = Math.round(Math.max(0, Number.isFinite(total) ? total : 0));
  const perRow = Math.floor(normalized / count);
  const remainder = normalized - perRow * count;

  return rows.map((row) => ({
    ...row,
    budgetTokens: row.role === 'lead' ? perRow + remainder : perRow,
  }));
}
