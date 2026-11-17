# Phase 28 deferred items

## Out-of-scope pre-existing failure (28-02)

- `tests/ai/AIChatDrawerGroundedWiring.test.tsx` fails 21/24 tests at stock HEAD in this
  isolated worktree (`Cannot read properties of null (reading 'useMemo')` in React/dnd-kit
  hooks), before any 28-02 edits. Not caused by this plan; left untouched. The plan's
  drawer contract is instead covered by `groundedTurn.test.ts` query-only cases and by
  static inspection of `AIChatDrawer.tsx` (best-effort catalog, no pre-gate).
