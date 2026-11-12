// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { SCHEMA_V23 } from '../../src/db/schema';

/**
 * Static parity guard (Phase 36, T-36-03, AIO-DATA-05).
 *
 * Reads the real sources rather than a hardcoded copy, so deleting a name from either side
 * fails the test. Contract: every table the TS SQLite mirror writes must be in the Rust
 * `ALLOWED_TABLES` allowlist, or the native writer rejects the row at runtime.
 */

const TS_SOURCE = readFileSync(new URL('../../src/services/localSqlitePersistence.ts', import.meta.url), 'utf8');
const RUST_SOURCE = readFileSync(new URL('../../src-tauri/src/sqlite_persistence.rs', import.meta.url), 'utf8');
const DB_SOURCE = readFileSync(new URL('../../src/db/index.ts', import.meta.url), 'utf8');
const SCHEMA_SOURCE = readFileSync(new URL('../../src/db/schema.ts', import.meta.url), 'utf8');

function quotedNames(block: string): string[] {
  return [...block.matchAll(/'([A-Za-z][A-Za-z0-9]*)'|"([A-Za-z][A-Za-z0-9]*)"/g)].map(
    (match) => (match[1] ?? match[2]) as string
  );
}

function tsDomainTables(): string[] {
  const match = /export const SQLITE_DOMAIN_TABLES = \[([\s\S]*?)\] as const;/.exec(TS_SOURCE);
  if (!match) throw new Error('SQLITE_DOMAIN_TABLES not found');
  return quotedNames(match[1]!);
}

function rustAllowedTables(): string[] {
  const match = /const ALLOWED_TABLES: &\[&str\] = &\[([\s\S]*?)\];/.exec(RUST_SOURCE);
  if (!match) throw new Error('ALLOWED_TABLES not found');
  return quotedNames(match[1]!);
}

function dexieTableNames(): string[] {
  return [...DB_SOURCE.matchAll(/^\s{2}([A-Za-z][A-Za-z0-9]*)!: Table</gm)].map((match) => match[1]!);
}

function schemaV23Stores(): string[] {
  // Resolved object, not the literal: SCHEMA_V23 spreads its predecessors.
  return Object.keys(SCHEMA_V23);
}

describe('TS ⊆ Rust SQLite table parity', () => {
  it('every TS domain table appears in the Rust allowlist', () => {
    const rust = new Set(rustAllowedTables());
    const missing = tsDomainTables().filter((name) => !rust.has(name));
    expect(missing).toEqual([]);
  });

  it('carries aiSkillVersions on both sides', () => {
    expect(tsDomainTables()).toContain('aiSkillVersions');
    expect(rustAllowedTables()).toContain('aiSkillVersions');
  });

  it('carries the three previously drifted tables on both sides', () => {
    for (const name of ['chatTabs', 'systems', 'changeRequests']) {
      expect(tsDomainTables()).toContain(name);
      expect(rustAllowedTables()).toContain(name);
    }
  });

  it('keeps the AI Office tables in the Dexie declarations, V23 stores and TS SQLite list', () => {
    const aiOffice = [
      'aiEmployees',
      'aiLeads',
      'aiSkills',
      'aiTeams',
      'aiTeamMembers',
      'aiTeamLinks',
      'aiSkillVersions',
      'aiTeamBatches',
      'aiTeamAssignments',
      'teamParticipants',
      'teamMessages',
      'teamReadCursors',
    ];
    const dexie = dexieTableNames();
    const stores = schemaV23Stores();
    const ts = tsDomainTables();

    for (const name of aiOffice) {
      expect(dexie).toContain(name);
      expect(stores).toContain(name);
      expect(ts).toContain(name);
    }
  });

  it('carries both ledger tables in the TS list and the Rust allowlist (Phase 37 D-26)', () => {
    for (const name of ['aiTeamBatches', 'aiTeamAssignments']) {
      expect(tsDomainTables()).toContain(name);
      expect(rustAllowedTables()).toContain(name);
    }
  });

  it('reads its store list from the schema version that is actually latest', () => {
    const match = /export const LATEST_SCHEMA_VERSION = (\d+);/.exec(SCHEMA_SOURCE);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBe(23);
    expect(SCHEMA_SOURCE).toContain('export const SCHEMA_V23 =');
  });
});
