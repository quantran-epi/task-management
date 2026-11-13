// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest';
import {
  estimateTokens,
  getEncoderKind,
  resetTokenEstimatorForTests,
  setEncoderLoaderForTests,
} from '../../../../src/services/ai/office/tokenEstimate';

describe('tokenEstimate (Phase 38 D-07/D-10)', () => {
  afterEach(() => {
    resetTokenEstimatorForTests();
  });

  it('returns 0 for empty text', async () => {
    expect(await estimateTokens('')).toBe(0);
  });

  it('returns a positive integer for real text', async () => {
    const tokens = await estimateTokens('hello world');
    expect(Number.isInteger(tokens)).toBe(true);
    expect(tokens).toBeGreaterThan(0);
  });

  it('returns the same value twice — the encoder is a singleton', async () => {
    const first = await estimateTokens('một đoạn văn bản tiếng Việt');
    const second = await estimateTokens('một đoạn văn bản tiếng Việt');
    expect(second).toBe(first);
  });

  it('reports the chars-div-4 fallback while js-tiktoken is absent', async () => {
    await estimateTokens('hello world');
    expect(getEncoderKind()).toBe('chars-div-4');
    // The documented fallback shape: ceil(length / 4).
    expect(await estimateTokens('12345678')).toBe(2);
  });

  it('still resolves after a reset', async () => {
    await estimateTokens('abc');
    resetTokenEstimatorForTests();
    expect(await estimateTokens('abc')).toBeGreaterThan(0);
  });

  it('never throws when the encoder loader fails', async () => {
    setEncoderLoaderForTests(async () => {
      throw new Error('no tokenizer');
    });
    expect(await estimateTokens('hello world')).toBe(3);
    expect(getEncoderKind()).toBe('chars-div-4');
  });
});
