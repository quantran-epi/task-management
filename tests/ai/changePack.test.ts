import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ChangePackLimits,
  ChangePackValidationError,
  canonicalizePackPath,
  validateChangePack,
} from '../../src/services/wizard/changePack';

const fixture = (name: string) =>
  new File(
    [fs.readFile(path.resolve('tests/fixtures/ai/change-packs', name)) as unknown as BlobPart],
    name,
    { type: 'application/zip' },
  );

const identity = {
  cr: 'CR-25001',
  base: 'base-commit-001',
  head: 'head-commit-002',
  branch: 'feature/CR-25001',
};

async function readFixture(name: string): Promise<File> {
  const bytes = await fs.readFile(path.resolve('tests/fixtures/ai/change-packs', name));
  return new File([bytes], name, { type: 'application/zip' });
}

function expectCode(error: unknown, code: string): void {
  expect(error).toBeInstanceOf(ChangePackValidationError);
  expect((error as ChangePackValidationError).code).toBe(code);
  expect((error as Error).message).toBe(code);
}

describe('canonicalizePackPath', () => {
  it.each([
    ['diff.patch', 'diff.patch'],
    ['new-files/src/feature.ts', 'new-files/src/feature.ts'],
    ['new-files\\src\\feature.ts', 'new-files/src/feature.ts'],
  ])('canonicalizes %s', (raw, expected) => {
    expect(canonicalizePackPath(raw)).toBe(expected);
  });

  it.each(['../diff.patch', 'new-files/../diff.patch', '/diff.patch', 'C:\\diff.patch', 'new-files//x.ts', 'new-files/./x.ts', 'new-files/x\0.ts', ''])('rejects unsafe %s', (raw) => {
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
      await validateChangePack(await readFixture(name), identity, undefined, () => { writes += 1; });
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
