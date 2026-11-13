// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest';
import {
  estimateTokens,
  getEncoderKind,
  resetTokenEstimatorForTests,
  setEncoderLoaderForTests,
} from '../../../../src/services/ai/office/tokenEstimate';

const VIETNAMESE_SAMPLE =
  'Xin chào, đây là một đoạn văn bản tiếng Việt dùng để kiểm tra bộ đếm token.';

describe('tokenEstimate (Phase 38 D-07/D-10)', () => {
  afterEach(() => {
    resetTokenEstimatorForTests();
  });

  it('returns 0 for empty text', async () => {
    expect(await estimateTokens('')).toBe(0);
  });

  it('reports the tiktoken encoder once js-tiktoken is installed', async () => {
    await estimateTokens('hello world');
    expect(getEncoderKind()).toBe('tiktoken');
  });

  it('counts a known ASCII phrase as a concrete BPE count', async () => {
    expect(await estimateTokens('hello world')).toBe(2);
    expect(await estimateTokens('The quick brown fox jumps over the lazy dog.')).toBe(10);
  });

  it('counts Vietnamese with the tokenizer, not chars÷4', async () => {
    const tokens = await estimateTokens(VIETNAMESE_SAMPLE);
    expect(Number.isInteger(tokens)).toBe(true);
    expect(tokens).toBeGreaterThan(0);
    // No direction asserted: o200k_base may land above or below the naive heuristic.
    expect(tokens).not.toBe(Math.ceil(VIETNAMESE_SAMPLE.length / 4));
    expect(await estimateTokens(VIETNAMESE_SAMPLE)).toBe(tokens);
  });

  it('still resolves after a reset', async () => {
    await estimateTokens('abc');
    resetTokenEstimatorForTests();
    expect(await estimateTokens('abc')).toBeGreaterThan(0);
  });

  it('falls back to chars÷4 when the encoder loader fails', async () => {
    setEncoderLoaderForTests(async () => {
      throw new Error('no tokenizer');
    });
    expect(await estimateTokens('hello world')).toBe(3);
    expect(getEncoderKind()).toBe('chars-div-4');
  });

  it('retries once with special tokens allowed before giving up on the encoder (WR-14)', async () => {
    const calls: Array<string | undefined> = [];
    setEncoderLoaderForTests(async () => ({
      encode(text: string, allowedSpecial?: string[] | 'all') {
        calls.push(allowedSpecial as string | undefined);
        if (allowedSpecial !== 'all') throw new Error('special token <|endoftext|>');
        return new Array(text.length).fill(0);
      },
    }));

    // 12 chars → the retry's count (12), not chars÷4 (3).
    expect(await estimateTokens('123456789012')).toBe(12);
    expect(calls).toEqual([undefined, 'all']);
  });

  it('falls back to chars÷4 when the encoder itself throws', async () => {
    setEncoderLoaderForTests(async () => ({
      encode() {
        throw new Error('bad input');
      },
    }));
    expect(await estimateTokens('12345678')).toBe(2);
    expect(getEncoderKind()).toBe('tiktoken');
  });
});
