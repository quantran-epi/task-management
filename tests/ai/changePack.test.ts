import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ChangePackLimits,
  ChangePackValidationError,
  canonicalizePackPath,
  validateChangePack,
} from '../../src/services/wizard/changePack';

const manifest = JSON.parse(
  fs.readFileSync(path.resolve('tests/fixtures/ai/change-packs/manifest.json'), 'utf8'),
) as {
  schemaVersion: number;
  profile: Record<string, unknown>;
  archives: Array<{
    name: string;
    variant: string;
    expectedCode: string;
    writesBeforeConfirmation: number;
    writesAfterRollback?: number;
  }>;
};

const fixturePath = (name: string) => path.resolve('tests/fixtures/ai/change-packs', name);

async function readFixture(name: string): Promise<File> {
  const bytes = await fsp.readFile(fixturePath(name));
  return new File([bytes], name, { type: 'application/zip' });
}

const identity = {
  cr: 'CR-25001',
  base: 'base-commit-001',
  head: 'head-commit-002',
  branch: 'feature/CR-25001',
};

function expectCode(error: unknown, code: string): void {
  expect(error).toBeInstanceOf(ChangePackValidationError);
  expect((error as ChangePackValidationError).code).toBe(code);
  expect((error as Error).message).toBe(code);
}

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
      'valid',
      'compressed-overflow',
      'expanded-overflow',
      'entry-overflow',
      'count-overflow',
      'corrupt',
      'missing-meta',
      'invalid-meta',
      'traversal',
      'absolute-path',
      'canonical-collision',
      'prohibited',
      'unsupported',
      'binary',
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

describe('canonicalizePackPath', () => {
  it.each([
    ['diff.patch', 'diff.patch'],
    ['new-files/src/feature.ts', 'new-files/src/feature.ts'],
    ['new-files\\src\\feature.ts', 'new-files/src/feature.ts'],
  ])('canonicalizes %s', (raw, expected) => {
    expect(canonicalizePackPath(raw)).toBe(expected);
  });

  it.each([
    '../diff.patch',
    'new-files/../diff.patch',
    '/diff.patch',
    'C:\\diff.patch',
    'new-files//x.ts',
    'new-files/./x.ts',
    'new-files/x\0.ts',
    '',
  ])('rejects unsafe %s', (raw) => {
    expect(() => canonicalizePackPath(raw)).toThrow(ChangePackValidationError);
  });
});

describe('validateChangePack', () => {
  it('exports the exact profile-B ceilings', () => {
    expect(ChangePackLimits).toEqual({
      maxCompressedBytes: 5_242_880,
      maxExpandedBytes: 26_214_400,
      maxEntryBytes: 2_097_152,
      maxEntries: 256,
    });
  });

  it('validates the complete pack before returning an immutable manifest', async () => {
    const result = await validateChangePack(await readFixture('valid.zip'), identity);

    expect(result.identity).toEqual(identity);
    expect(result.packHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.entries.map((entry) => entry.path)).toEqual([
      'diff.patch',
      'meta.json',
      'new-files/src/feature.ts',
      'sql/alter.sql',
    ]);
    expect(result.entries.every((entry) => entry.status === 'included')).toBe(true);
    expect(result.commitCount).toBe(2);
    expect(result.fileCount).toBe(3);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.entries)).toBe(true);
  });

  it.each([
    ['wrong-cr.zip', 'PACK_IDENTITY_MISMATCH'],
    ['corrupt.zip', 'PACK_CORRUPT'],
    ['traversal.zip', 'PACK_PATH_UNSAFE'],
    ['collision.zip', 'PACK_PATH_COLLISION'],
    ['prohibited.zip', 'PACK_ENTRY_PROHIBITED'],
  ])('rejects %s with stable code and no write opportunity', async (name, code) => {
    let writes = 0;
    try {
      await validateChangePack(await readFixture(name), identity, undefined, () => {
        writes += 1;
      });
      throw new Error('expected validation failure');
    } catch (error) {
      expectCode(error, code);
      expect(writes).toBe(0);
    }
  });

  it('keeps binary content deferred instead of treating it as text', async () => {
    const result = await validateChangePack(await readFixture('binary.zip'), identity);
    expect(result.entries.find((entry) => entry.path === 'new-files/assets/logo.bin')).toMatchObject({
      status: 'binary',
      coverage: 'binary',
    });
    expect(result.coverageStatus).toBe('partial');
  });

  it('keeps partial content visible and never claims complete coverage', async () => {
    const result = await validateChangePack(await readFixture('partial.zip'), identity);
    expect(result.coverageStatus).toBe('partial');
    expect(result.entries.some((entry) => entry.coverage === 'deferred')).toBe(true);
  });

  it('rejects compressed, expanded, per-entry, and count ceilings before persistence', async () => {
    const valid = await readFixture('valid.zip');
    for (const [limits, code] of [
      [{ maxCompressedBytes: valid.size - 1 }, 'PACK_COMPRESSED_TOO_LARGE'],
      [{ maxExpandedBytes: 1 }, 'PACK_EXPANDED_TOO_LARGE'],
      [{ maxEntryBytes: 1 }, 'PACK_ENTRY_TOO_LARGE'],
      [{ maxEntries: 1 }, 'PACK_TOO_MANY_ENTRIES'],
    ] as const) {
      await expect(validateChangePack(valid, identity, { ...ChangePackLimits, ...limits })).rejects.toSatisfy(
        (error: unknown) => {
          expectCode(error, code);
          return true;
        },
      );
    }
  });

  it('rejects a compressed boundary plus one before JSZip parsing', async () => {
    const valid = await readFixture('valid.zip');
    await expect(
      validateChangePack(valid, identity, { ...ChangePackLimits, maxCompressedBytes: valid.size - 1 }),
    ).rejects.toMatchObject({ code: 'PACK_COMPRESSED_TOO_LARGE' });
  });
});

describe('change-pack behavior producer contracts', () => {
  it.todo('rejects profile-B boundary +1 archives before any persistent write');
  it.todo('rejects traversal, absolute, canonical collision, prohibited, unsupported, and corrupt entries');
  it.todo('requires explicit confirmation and persists a valid archive atomically');
  it.todo('deduplicates replayed confirmation and rolls transaction failures back to zero Notes');
});
