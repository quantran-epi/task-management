import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const manifest = JSON.parse(
  fs.readFileSync(path.resolve('tests/fixtures/ai/change-packs/manifest.json'), 'utf8')
) as {
  schemaVersion: number;
  profile: Record<string, unknown>;
  archives: Array<{ name: string; variant: string; expectedCode: string; writesBeforeConfirmation: number; writesAfterRollback?: number }>;
};

describe('change-pack fixture manifest', () => {
  it('pins resolved profile-B limits and metadata shapes', () => {
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.profile).toEqual({
      maxCompressedBytes: 5_242_880,
      maxExpandedBytes: 26_214_400,
      maxEntryBytes: 2_097_152,
      maxEntries: 256,
      requiredMetadata: {
        commits: '{sha:string,subject:string}[]',
        files: '{path:string,status:string}[]',
      },
    });
  });

  it('catalogs archive, path, collision, prohibited, binary, corrupt, and rollback threats', () => {
    const variants = new Set(manifest.archives.map(({ variant }) => variant));
    for (const variant of [
      'valid', 'compressed-overflow', 'expanded-overflow', 'entry-overflow',
      'count-overflow', 'corrupt', 'missing-meta', 'invalid-meta', 'traversal',
      'absolute-path', 'canonical-collision', 'prohibited', 'unsupported', 'binary',
      'transaction-failure',
    ]) {
      expect(variants.has(variant)).toBe(true);
    }
    expect(new Set(manifest.archives.map(({ name }) => name)).size).toBe(manifest.archives.length);
    manifest.archives.forEach((archive) => {
      expect(archive.expectedCode).toMatch(/^[A-Z][A-Z0-9_]+$/);
      expect(archive.writesBeforeConfirmation).toBe(0);
    });
    expect(manifest.archives.find(({ variant }) => variant === 'transaction-failure')?.writesAfterRollback).toBe(0);
  });
});

describe('change-pack behavior producer contracts', () => {
  it.todo('rejects profile-B boundary +1 archives before any persistent write');
  it.todo('rejects traversal, absolute, canonical collision, prohibited, unsupported, and corrupt entries');
  it.todo('requires explicit confirmation and persists a valid archive atomically');
  it.todo('deduplicates replayed confirmation and rolls transaction failures back to zero Notes');
});
