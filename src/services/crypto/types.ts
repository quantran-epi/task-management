export interface KdfParams {
  hash: 'SHA-256';
  iterations: number;
  salt: string; // Base64 (16 bytes)
}

export interface CryptoMetadata {
  algorithm: 'AES-GCM';
  keyLength: 256;
  kdf: 'PBKDF2';
  kdfParams: KdfParams;
  iv: string; // Base64 (12 bytes / 96-bit)
}

export interface EncryptedEnvelope {
  app: 'personal-task-planner';
  format: 'encrypted-v1';
  schemaVersion: number;
  exportedAt: string; // ISO 8601 timestamp
  crypto: CryptoMetadata;
  ciphertext: string; // Base64 AES-GCM ciphertext + 128-bit auth tag
}

export interface CryptoConfig {
  iterations: number;
  saltByteLength: number;
  ivByteLength: number;
}
