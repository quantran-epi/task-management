import { bytesToBase64, base64ToBytes } from './base64';
import type { EncryptedEnvelope } from './types';

export const PBKDF2_ITERATIONS = 600000;
export const SALT_BYTE_LENGTH = 16;
export const IV_BYTE_LENGTH = 12; // 96-bit standard for AES-GCM

function getSubtle(): SubtleCrypto {
  const subtle = (typeof window !== 'undefined' && window.crypto?.subtle) || globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('Web Crypto API (crypto.subtle) không khả dụng trong môi trường này');
  }
  return subtle;
}

function getRandomValues(array: Uint8Array): Uint8Array {
  const c = (typeof window !== 'undefined' && window.crypto) || globalThis.crypto;
  if (!c?.getRandomValues) {
    throw new Error('Web Crypto API (crypto.getRandomValues) không khả dụng');
  }
  return c.getRandomValues(array as unknown as ArrayBufferView<ArrayBuffer>) as unknown as Uint8Array;
}

/**
 * Derives a non-extractable 256-bit AES-GCM CryptoKey from passphrase and salt
 * using PBKDF2 with 600,000 iterations and HMAC-SHA256 (per OWASP / D-11).
 */
export async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const subtle = getSubtle();
  const enc = new TextEncoder();
  const keyMaterial = await subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts a plaintext JSON payload with AES-GCM-256 using a fresh 96-bit IV
 * and PBKDF2 key derived with a fresh 16-byte salt (per D-10, D-11).
 */
export async function encryptPayload(
  payloadJson: string,
  passphrase: string
): Promise<EncryptedEnvelope> {
  const salt = getRandomValues(new Uint8Array(SALT_BYTE_LENGTH));
  const iv = getRandomValues(new Uint8Array(IV_BYTE_LENGTH));
  const key = await deriveKey(passphrase, salt);

  const subtle = getSubtle();
  const enc = new TextEncoder();
  const ciphertextBuffer = await subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    enc.encode(payloadJson)
  );

  return {
    app: 'personal-task-planner',
    format: 'encrypted-v1',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    crypto: {
      algorithm: 'AES-GCM',
      keyLength: 256,
      kdf: 'PBKDF2',
      kdfParams: {
        hash: 'SHA-256',
        iterations: PBKDF2_ITERATIONS,
        salt: bytesToBase64(salt),
      },
      iv: bytesToBase64(iv),
    },
    ciphertext: bytesToBase64(new Uint8Array(ciphertextBuffer)),
  };
}

/**
 * Decrypts an EncryptedEnvelope with the provided passphrase.
 * Validates envelope headers and verifies AES-GCM authentication tag.
 * Throws if passphrase is wrong or ciphertext is tampered.
 */
export async function decryptPayload(
  envelope: EncryptedEnvelope,
  passphrase: string
): Promise<string> {
  if (envelope.app !== 'personal-task-planner' || envelope.format !== 'encrypted-v1') {
    throw new Error('Định dạng tệp mã hóa không hợp lệ: app hoặc format không đúng');
  }

  const salt = base64ToBytes(envelope.crypto.kdfParams.salt);
  const iv = base64ToBytes(envelope.crypto.iv);
  const ciphertext = base64ToBytes(envelope.ciphertext);

  const key = await deriveKey(passphrase, salt);
  const subtle = getSubtle();

  try {
    const decryptedBuffer = await subtle.decrypt(
      { name: 'AES-GCM', iv: iv as unknown as BufferSource },
      key,
      ciphertext as unknown as BufferSource
    );

    return new TextDecoder().decode(decryptedBuffer);
  } catch (err: any) {
    throw new Error('Giải mã thất bại: mật khẩu không đúng hoặc dữ liệu bị sửa đổi (tampered)');
  }
}
