import { useContext } from 'react';
import { TimerContext, type TimerContextValue } from '../context/TimerContext';

/**
 * Hook to access the real-time active timer engine.
 * Must be used within a TimerProvider.
 */
export function useTimer(): TimerContextValue {
  const context = useContext(TimerContext);
  if (!context) {
    throw new Error('useTimer must be used within a TimerProvider');
  }
  return context;
}
