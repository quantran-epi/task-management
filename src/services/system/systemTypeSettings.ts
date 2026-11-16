import { useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';

/**
 * The single source of truth for system type labels/colors at runtime. The `settings`
 * row `system_type_options` overrides the in-code defaults; every surface reads
 * through `useSystemTypeOptions` / `useSystemTypeLookup` so no component keeps its own copy.
 */
export const SYSTEM_TYPE_OPTIONS_SETTING_KEY = 'system_type_options';
export const SYSTEM_TYPE_VALUE_PATTERN = /^[A-Z][A-Z0-9_]*$/;
export const SYSTEM_TYPE_VALUE_MAX_LENGTH = 40;
export const LOGICAL_GROUP_TYPE = 'LOGICAL_GROUP';
export const SYSTEM_TYPE_FALLBACK_COLOR = '#8c8c8c';

export interface SystemTypeOption {
  value: string;
  label: string;
  color: string;
}

/** Pure fallback — nothing is written to the DB on read. */
export const DEFAULT_SYSTEM_TYPE_OPTIONS: readonly SystemTypeOption[] = [
  { value: 'LOGICAL_GROUP', label: 'Parent System', color: '#722ed1' },
  { value: 'SERVICE', label: 'Service', color: '#13c2c2' },
  { value: 'SCHEMA', label: 'DB Schema', color: '#1890ff' },
  { value: 'UI', label: 'Frontend UI', color: '#eb2f96' },
  { value: 'WORKER', label: 'Worker', color: '#fa8c16' },
];

export function isValidSystemTypeValue(value: string): boolean {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= SYSTEM_TYPE_VALUE_MAX_LENGTH &&
    value.trim() === value &&
    SYSTEM_TYPE_VALUE_PATTERN.test(value)
  );
}

/**
 * Turn free-typed text into a canonical type value: an existing value/label is reused as-is,
 * anything else is slugified (diacritics stripped, non-alphanumerics → `_`, uppercased).
 * Returns `''` when nothing workable is left, so the form rule reports it.
 */
export function toSystemTypeValue(
  input: string,
  options: readonly SystemTypeOption[]
): string {
  const raw = typeof input === 'string' ? input.trim() : '';
  if (!raw) return '';

  const lower = raw.toLowerCase();
  const known =
    options.find((opt) => opt.value.toLowerCase() === lower) ??
    options.find((opt) => opt.label.trim().toLowerCase() === lower);
  if (known) return known.value;

  const slug = raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase()
    .slice(0, SYSTEM_TYPE_VALUE_MAX_LENGTH)
    .replace(/_+$/g, '');

  return isValidSystemTypeValue(slug) ? slug : '';
}

/** Re-normalize on every read (T-e64-02): a crafted or stale stored value cannot leak through. */
export function normalizeSystemTypeOptions(raw: unknown): SystemTypeOption[] {
  if (!Array.isArray(raw)) return [...DEFAULT_SYSTEM_TYPE_OPTIONS];

  const seen = new Set<string>();
  const result: SystemTypeOption[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const candidate = entry as Record<string, unknown>;
    const value = candidate.value;
    if (typeof value !== 'string' || !isValidSystemTypeValue(value)) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    const label =
      typeof candidate.label === 'string' && candidate.label.trim()
        ? candidate.label.trim()
        : value;
    const color =
      typeof candidate.color === 'string' && candidate.color.trim()
        ? candidate.color.trim()
        : SYSTEM_TYPE_FALLBACK_COLOR;
    result.push({ value, label, color });
  }

  return result.length > 0 ? result : [...DEFAULT_SYSTEM_TYPE_OPTIONS];
}

export async function getSystemTypeOptions(
  db: TaskPlannerDatabase = defaultDb
): Promise<SystemTypeOption[]> {
  const rec = await db.settings.get(SYSTEM_TYPE_OPTIONS_SETTING_KEY);
  return normalizeSystemTypeOptions(rec?.value);
}

export async function setSystemTypeOptions(
  options: readonly SystemTypeOption[],
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  await db.settings.put({
    key: SYSTEM_TYPE_OPTIONS_SETTING_KEY,
    value: normalizeSystemTypeOptions(options),
  });
}

/** Append a user-typed value so validation accepts it and every surface picks it up. */
export async function ensureSystemTypeOption(
  value: string,
  db: TaskPlannerDatabase = defaultDb,
  label?: string
): Promise<void> {
  const options = await getSystemTypeOptions(db);
  if (options.some((opt) => opt.value === value)) return;
  await setSystemTypeOptions(
    [
      ...options,
      { value, label: label?.trim() || value, color: SYSTEM_TYPE_FALLBACK_COLOR },
    ],
    db
  );
}

export function useSystemTypeOptions(db: TaskPlannerDatabase = defaultDb): SystemTypeOption[] {
  return useLiveQuery(() => getSystemTypeOptions(db), [db]) ?? [...DEFAULT_SYSTEM_TYPE_OPTIONS];
}

/** Unknown/deleted types still render their raw value in grey rather than going blank. */
export function useSystemTypeLookup(
  db: TaskPlannerDatabase = defaultDb
): (value: string) => { label: string; color: string } {
  const options = useSystemTypeOptions(db);
  return useCallback(
    (value: string) => {
      const found = options.find((opt) => opt.value === value);
      return found
        ? { label: found.label, color: found.color }
        : { label: value, color: SYSTEM_TYPE_FALLBACK_COLOR };
    },
    [options]
  );
}
