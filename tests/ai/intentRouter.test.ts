import { describe, it, expect } from 'vitest';
import { routeIntent } from '../../src/services/ai/intentRouter';

describe('intentRouter', () => {
  it('classifies operational-only query as operational', () => {
    const result = routeIntent('tạo task mới và đánh dấu hoàn thành');
    expect(result.route).toBe('operational');
    expect(result.confidence).toBeGreaterThan(0.3);
  });

  it('classifies knowledge-only query as knowledge', () => {
    const result = routeIntent('luồng thanh toán thẻ là gì và phụ thuộc vào đâu');
    expect(result.route).toBe('knowledge');
    expect(result.confidence).toBeGreaterThan(0.3);
  });

  it('classifies mixed query with both verbs as mixed', () => {
    const result = routeIntent('tạo task để tra cứu luồng xử lý giao dịch');
    expect(result.route).toBe('mixed');
    expect(result.confidence).toBeGreaterThan(0.3);
  });

  it('classifies ambiguous query with zero keyword hits as clarify with confidence 0', () => {
    const result = routeIntent('hôm nay trời đẹp quá xin chào');
    expect(result.route).toBe('clarify');
    expect(result.confidence).toBe(0);
  });

  it('normalizes Vietnamese diacritics and case variations correctly', () => {
    // Without diacritics
    const opNoDiacritic = routeIntent('tao task moi');
    expect(opNoDiacritic.route).toBe('operational');

    // Mixed case with diacritics
    const knMixedCase = routeIntent('LUỒNG THANH TOÁN LÀ GÌ');
    expect(knMixedCase.route).toBe('knowledge');
  });

  it('returns clarify with confidence 0 for empty or whitespace query', () => {
    expect(routeIntent('')).toEqual({ route: 'clarify', confidence: 0 });
    expect(routeIntent('   ')).toEqual({ route: 'clarify', confidence: 0 });
  });
});
