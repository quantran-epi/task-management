import { describe, it, expect } from 'vitest';
import {
  bytesToBase64,
  base64ToBytes,
  utf8ToBase64,
  base64ToUtf8,
} from '../../../src/services/crypto/base64';

describe('Base64 Utilities', () => {
  it('roundtrips arbitrary Uint8Array buffers including boundary bytes 0x00 and 0xFF', () => {
    const original = new Uint8Array([0x00, 0x01, 0x42, 0x7f, 0x80, 0xfe, 0xff]);
    const b64 = bytesToBase64(original);
    const restored = base64ToBytes(b64);

    expect(restored).toEqual(original);
  });

  it('handles empty buffer roundtrip', () => {
    const original = new Uint8Array(0);
    const b64 = bytesToBase64(original);
    expect(b64).toBe('');
    const restored = base64ToBytes(b64);
    expect(restored).toEqual(original);
  });

  it('tolerates whitespace and line breaks when decoding base64', () => {
    const original = new Uint8Array([1, 2, 3, 4, 5]);
    const b64 = bytesToBase64(original);
    const paddedB64 = `  \n${b64.slice(0, 2)}\r\n ${b64.slice(2)}  \t`;
    const restored = base64ToBytes(paddedB64);

    expect(restored).toEqual(original);
  });

  it('roundtrips multi-byte Unicode strings including Vietnamese diacritics', () => {
    const sample = 'Kế hoạch công việc & Dự án cá nhân 🚀';
    const b64 = utf8ToBase64(sample);
    const restored = base64ToUtf8(b64);

    expect(restored).toBe(sample);
  });
});
