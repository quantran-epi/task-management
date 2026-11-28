import { describe, it, expect } from 'vitest';
import { turnStatusForPaint } from '../../src/components/ai/runtime/tabTypes';

describe('turnStatusForPaint', () => {
  it('paints preparing during prelude when previous turn left runtime complete', () => {
    expect(turnStatusForPaint('complete', false, true)).toBe('preparing');
  });

  it('paints preparing during prelude for a fresh idle runtime (turn 1)', () => {
    expect(turnStatusForPaint('idle', false, true)).toBe('preparing');
  });

  it('does not override a running turn with prelude status', () => {
    expect(turnStatusForPaint('tool', true, true)).toBe('tool');
    expect(turnStatusForPaint('streaming', true, true)).toBe('streaming');
  });

  it('keeps active status when prelude is set but runtime already active', () => {
    expect(turnStatusForPaint('preparing', true, true)).toBe('preparing');
  });

  it('falls back to idle with no runtime', () => {
    expect(turnStatusForPaint(undefined, false, false)).toBe('idle');
  });

  it('leaves terminal status alone once prelude ends', () => {
    expect(turnStatusForPaint('complete', false, false)).toBe('complete');
  });
});
