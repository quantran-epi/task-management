# Debug Session: Timer Not Ticking in UI

**Gap:** G-12.1-2
**Status:** Resolved

## Symptoms
When starting a task timer, the ticker stays at `00:00:00`. Reloading the page updates the ticker once to the actual elapsed time, but it immediately freezes again.

## Root Cause
In `src/context/TimerContext.tsx`, `TimerProvider` sets up an interval that calls `setTick((prev) => prev + 1)` every 1000ms. However:
1. `const [, setTick] = useState<number>(0)` discards the `tick` value.
2. `tick` is NOT in the dependency array of `useMemo` for the context `value`.
3. Because `activeTimers` comes from `useLiveQuery(database.activeTimers)` and only changes on database mutations (start, pause, finish), the context value object reference remains identical across ticker intervals (`Object.is(prev, next) === true`).
4. React context propagation bails out, so subscribers (`TaskTable`, `ActiveTimerWidget`, `WorkSessionsTab`) never re-render.

## Fix
Expose `tick` or include `tick` in the `useMemo` dependency array in `TimerContext.tsx`.
