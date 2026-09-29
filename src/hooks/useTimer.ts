import { useContext } from 'react';
import { TimerContext, type TimerContextValue } from '../context/TimerContext';

const fallbackTimerContext: TimerContextValue = {
  activeTimers: [],
  getTimerForTask: () => undefined,
  getElapsedSeconds: () => 0,
  startTimer: async () => {},
  pauseTimer: async () => {},
  finishTimer: async () => null,
  cancelTimer: async () => {},
};

/**
 * Hook to access the real-time active timer engine.
 * Falls back safely if used outside a TimerProvider.
 */
export function useTimer(): TimerContextValue {
  const context = useContext(TimerContext);
  if (!context) {
    return fallbackTimerContext;
  }
  return context;
}
