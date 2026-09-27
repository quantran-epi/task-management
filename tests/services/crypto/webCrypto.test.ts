import { describe, it, expect } from 'vitest';
import {
  deriveKey,
  encryptPayload,
  decryptPayload,
  PBKDF2_ITERATIONS,
  SALT_BYTE_LENGTH,
  IV_BYTE_LENGTH,
} from '../../../src/services/crypto/webCrypto';
import { base64ToBytes } from '../../../src/services/crypto/base64';
import type { EncryptedEnvelope } from '../../../src/services/crypto/types';

describe('Web Crypto Service', () => {
  const samplePassphrase = 'super-secret-passphrase-123';
  const samplePayloadJson = JSON.stringify({
    app: 'personal-task-planner',
    schemaVersion: 1,
    exportedAt: '2026-09-27T12:00:00.000Z',
    tables: { projects: [], milestones: [], tasks: [], capacityRules: [], capacityOverrides: [], plannedAllocations: [] },
    counts: { projects: 0, milestones: 0, tasks: 0, capacityRules: 0, capacityOverrides: 0, plannedAllocations: 0 },
  });

  it('verifies configuration constants match security specifications', () => {
    expect(PBKDF2_ITERATIONS).toBe(600000);
    expect(SALT_BYTE_LENGTH).toBe(16);
    expect(IV_BYTE_LENGTH).toBe(12);
  });

  it('derives a non-extractable 256-bit AES-GCM CryptoKey using PBKDF2', async () => {
    const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTE_LENGTH));
    const key = await deriveKey(samplePassphrase, salt);

    expect(key).toBeDefined();
    expect(key.type).toBe('secret');
    expect(key.extractable).toBe(false);
    expect(key.algorithm.name).toBe('AES-GCM');
    // @ts-expect-error length exists on AesKeyAlgorithm
    expect(key.algorithm.length).toBe(256);
  });

  it('encrypts payload into a valid EncryptedEnvelope format', async () => {
    const envelope = await encryptPayload(samplePayloadJson, samplePassphrase);

    expect(envelope.app).toBe('personal-task-planner');
    expect(envelope.format).toBe('encrypted-v1');
    expect(envelope.schemaVersion).toBe(1);
    expect(typeof envelope.exportedAt).toBe('string');
    expect(envelope.crypto.algorithm).toBe('AES-GCM');
    expect(envelope.crypto.keyLength).toBe(256);
    expect(envelope.crypto.kdf).toBe('PBKDF2');
    expect(envelope.crypto.kdfParams.hash).toBe('SHA-256');
    expect(envelope.crypto.kdfParams.iterations).toBe(600000);

    const decodedSalt = base64ToBytes(envelope.crypto.kdfParams.salt);
    expect(decodedSalt.byteLength).toBe(16);

    const decodedIv = base64ToBytes(envelope.crypto.iv);
    expect(decodedIv.byteLength).toBe(12);

    expect(typeof envelope.ciphertext).toBe('string');
    expect(envelope.ciphertext.length).toBeGreaterThan(0);
  });

  it('decrypts payload with matching passphrase recovering exact JSON', async () => {
    const envelope = await encryptPayload(samplePayloadJson, samplePassphrase);
    const decryptedJson = await decryptPayload(envelope, samplePassphrase);

    expect(decryptedJson).toBe(samplePayloadJson);
  });

  it('throws error when decrypting with incorrect passphrase', async () => {
    const envelope = await encryptPayload(samplePayloadJson, samplePassphrase);

    await expect(decryptPayload(envelope, 'wrong-passphrase')).rejects.toThrow();
  });

  it('throws error when ciphertext is tampered', async () => {
    const envelope = await encryptPayload(samplePayloadJson, samplePassphrase);
    const rawCiphertext = base64ToBytes(envelope.ciphertext);
    // Tamper with one byte in the ciphertext or auth tag
    rawCiphertext[0] = (rawCiphertext[0]! ^ 0xff);
    const tamperedEnvelope: EncryptedEnvelope = {
      ...envelope,
      ciphertext: btoa(String.fromCharCode(...rawCiphertext)),
    };

    await expect(decryptPayload(tamperedEnvelope, samplePassphrase)).rejects.toThrow();
  });

  it('rejects envelope with invalid app marker or format', async () => {
    const envelope = await encryptPayload(samplePayloadJson, samplePassphrase);

    const badAppEnvelope = { ...envelope, app: 'wrong-app' as const };
    // @ts-expect-error test invalid envelope app
    await expect(decryptPayload(badAppEnvelope, samplePassphrase)).rejects.toThrow(/Định dạng/);

    const badFormatEnvelope = { ...envelope, format: 'unknown-format' as const };
    // @ts-expect-error test invalid envelope format
    await expect(decryptPayload(badFormatEnvelope, samplePassphrase)).rejects.toThrow(/Định dạng/);
  });
});
