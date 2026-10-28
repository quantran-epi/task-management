import JSZip from 'jszip';
import { z } from 'zod';

export interface ChangePackLimits {
  maxCompressedBytes: number;
  maxExpandedBytes: number;
  maxEntryBytes: number;
  maxEntries: number;
}

export const ChangePackLimits: Readonly<ChangePackLimits> = Object.freeze({
  maxCompressedBytes: 5_242_880,
  maxExpandedBytes: 26_214_400,
  maxEntryBytes: 2_097_152,
  maxEntries: 256,
});

const boundedText = z.string().trim().min(1).max(500);
const hexSha = z.string().trim().min(1).max(128);
export const ChangePackMetaSchema = z.strictObject({
  cr: boundedText,
  base: hexSha,
  head: hexSha,
  branch: boundedText,
  author: boundedText,
  generatedAt: z.string().datetime(),
  commits: z.array(z.strictObject({ sha: hexSha, subject: boundedText })).max(256),
  files: z.array(z.strictObject({ path: boundedText, status: z.string().trim().min(1).max(100) })).max(256),
});
export type ChangePackMeta = z.infer<typeof ChangePackMetaSchema>;

export const ChangePackIdentitySchema = ChangePackMetaSchema.pick({
  cr: true,
  base: true,
  head: true,
  branch: true,
});
export type ChangePackIdentity = z.infer<typeof ChangePackIdentitySchema>;

const coverageSchema = z.enum(['included', 'deferred', 'unreadable', 'binary']);
export const ChangePackEntrySchema = z.strictObject({
  path: z.string().min(1).max(500),
  sizeBytes: z.number().int().nonnegative(),
  status: coverageSchema,
  coverage: coverageSchema,
  content: z.union([z.string(), z.instanceof(Uint8Array)]),
});
export type ChangePackEntry = z.infer<typeof ChangePackEntrySchema>;

export const ChangePackManifestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  packHash: z.string().regex(/^[a-f0-9]{64}$/),
  identity: ChangePackIdentitySchema,
  meta: ChangePackMetaSchema,
  entries: z.array(ChangePackEntrySchema).max(ChangePackLimits.maxEntries),
  compressedBytes: z.number().int().nonnegative(),
  expandedBytes: z.number().int().nonnegative(),
  commitCount: z.number().int().nonnegative(),
  fileCount: z.number().int().nonnegative(),
  coverageStatus: z.enum(['complete', 'partial']),
});
export type ChangePackManifest = z.infer<typeof ChangePackManifestSchema>;

export type ChangePackValidationCode =
  | 'PACK_COMPRESSED_TOO_LARGE'
  | 'PACK_CORRUPT'
  | 'PACK_PATH_UNSAFE'
  | 'PACK_PATH_COLLISION'
  | 'PACK_ENTRY_PROHIBITED'
  | 'PACK_ENTRY_UNSUPPORTED'
  | 'PACK_REQUIRED_ENTRY_MISSING'
  | 'PACK_META_INVALID'
  | 'PACK_IDENTITY_MISMATCH'
  | 'PACK_TOO_MANY_ENTRIES'
  | 'PACK_ENTRY_TOO_LARGE'
  | 'PACK_EXPANDED_TOO_LARGE';

export class ChangePackValidationError extends Error {
  constructor(readonly code: ChangePackValidationCode) {
    super(code);
    this.name = 'ChangePackValidationError';
  }
}

function reject(code: ChangePackValidationCode): never {
  throw new ChangePackValidationError(code);
}

export function canonicalizePackPath(raw: string): string {
  if (!raw || raw.includes('\0')) reject('PACK_PATH_UNSAFE');
  if (/^[A-Za-z]:[\\/]/.test(raw) || /^[\\/]/.test(raw)) reject('PACK_PATH_UNSAFE');
  const normalized = raw.replace(/\\/g, '/');
  const parts = normalized.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) reject('PACK_PATH_UNSAFE');
  return parts.join('/');
}

function entryPolicy(path: string): 'text' | 'binary' {
  const lower = path.toLowerCase();
  if (lower.split('/').includes('node_modules') || lower.endsWith('.min.js') || lower.endsWith('/package-lock.json') || lower === 'package-lock.json') {
    reject('PACK_ENTRY_PROHIBITED');
  }
  if (path === 'diff.patch' || path === 'meta.json') return 'text';
  if (/^sql\/.+\.(?:sql|plb|pck|pkb)$/i.test(path)) return 'text';
  if (/^new-files\/.+/.test(path)) return isProbablyBinaryPath(path) ? 'binary' : 'text';
  reject('PACK_ENTRY_UNSUPPORTED');
}

function isProbablyBinaryPath(path: string): boolean {
  return /\.(?:bin|bmp|gif|ico|jpe?g|pdf|png|webp|woff2?|zip)$/i.test(path);
}

function bytesContainNul(bytes: Uint8Array): boolean {
  return bytes.includes(0);
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function freezeManifest(manifest: ChangePackManifest): Readonly<ChangePackManifest> {
  for (const entry of manifest.entries) Object.freeze(entry);
  Object.freeze(manifest.entries);
  Object.freeze(manifest.identity);
  Object.freeze(manifest.meta.commits);
  Object.freeze(manifest.meta.files);
  Object.freeze(manifest.meta);
  return Object.freeze(manifest);
}

export async function validateChangePack(
  file: Blob,
  expectedIdentity: ChangePackIdentity,
  limits: ChangePackLimits = ChangePackLimits,
  onPersistentWrite?: () => void,
): Promise<Readonly<ChangePackManifest>> {
  void onPersistentWrite; // Pure phase A: persistence callback intentionally never invoked.
  if (file.size > limits.maxCompressedBytes) reject('PACK_COMPRESSED_TOO_LARGE');
  const packedBytes = new Uint8Array(await file.arrayBuffer());

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(packedBytes, { checkCRC32: true, createFolders: false });
  } catch {
    reject('PACK_CORRUPT');
  }

  const candidates = Object.values(zip.files).filter((entry) => !entry.dir);
  if (candidates.length > limits.maxEntries) reject('PACK_TOO_MANY_ENTRIES');

  const seen = new Set<string>();
  const normalized = candidates.map((entry) => {
    const path = canonicalizePackPath(entry.unsafeOriginalName ?? entry.name);
    const key = path.toLocaleLowerCase('en-US');
    if (seen.has(key)) reject('PACK_PATH_COLLISION');
    seen.add(key);
    return { entry, path, mode: entryPolicy(path) };
  });

  if (!seen.has('diff.patch') || !seen.has('meta.json')) reject('PACK_REQUIRED_ENTRY_MISSING');

  let expandedBytes = 0;
  const entries: ChangePackEntry[] = [];
  for (const candidate of normalized) {
    let bytes: Uint8Array;
    try {
      bytes = await candidate.entry.async('uint8array');
    } catch {
      reject('PACK_CORRUPT');
    }
    if (bytes.byteLength > limits.maxEntryBytes) reject('PACK_ENTRY_TOO_LARGE');
    expandedBytes += bytes.byteLength;
    if (expandedBytes > limits.maxExpandedBytes) reject('PACK_EXPANDED_TOO_LARGE');

    const binary = candidate.mode === 'binary' || bytesContainNul(bytes);
    const coverage = candidate.path === 'diff.patch' && new TextDecoder().decode(bytes).includes('WIZARD_DEFERRED_HUNK')
      ? 'deferred'
      : binary ? 'binary' : 'included';
    entries.push({
      path: candidate.path,
      sizeBytes: bytes.byteLength,
      status: coverage,
      coverage,
      content: binary ? new Uint8Array(bytes) : new TextDecoder('utf-8', { fatal: false }).decode(bytes),
    });
  }

  const rawMeta = entries.find((entry) => entry.path === 'meta.json')?.content;
  if (typeof rawMeta !== 'string') reject('PACK_META_INVALID');
  let meta: ChangePackMeta;
  try {
    meta = ChangePackMetaSchema.parse(JSON.parse(rawMeta));
  } catch {
    reject('PACK_META_INVALID');
  }

  const expected = ChangePackIdentitySchema.parse(expectedIdentity);
  if (Object.keys(expected).some((key) => meta[key as keyof ChangePackIdentity] !== expected[key as keyof ChangePackIdentity])) {
    reject('PACK_IDENTITY_MISMATCH');
  }

  entries.sort((a, b) => a.path.localeCompare(b.path));
  const manifest = ChangePackManifestSchema.parse({
    schemaVersion: 1,
    packHash: await sha256Hex(packedBytes),
    identity: expected,
    meta,
    entries,
    compressedBytes: file.size,
    expandedBytes,
    commitCount: meta.commits.length,
    fileCount: meta.files.length,
    coverageStatus: entries.every((entry) => entry.coverage === 'included') ? 'complete' : 'partial',
  });
  return freezeManifest(manifest);
}
