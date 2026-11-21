import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { AppstoreOutlined, CodeOutlined, DatabaseOutlined, DesktopOutlined, FolderOpenOutlined, FolderOutlined, ThunderboltOutlined } from '../../../components/ui/icon';
import { TaskPlannerDatabase } from '../../../db';
import {
  DEFAULT_SYSTEM_TYPE_OPTIONS,
  SYSTEM_TYPE_OPTIONS_SETTING_KEY,
  ensureSystemTypeOption,
  getSystemTypeIcon,
  getSystemTypeOptions,
  isValidSystemTypeValue,
  normalizeSystemTypeOptions,
  setSystemTypeOptions,
  toSystemTypeValue,
} from '../systemTypeSettings';import { SystemInputSchema } from '../../../validation/schemas';
import { BackupSystemRecordSchema } from '../../../validation/backupSchemas';

describe('getSystemTypeIcon', () => {
  it('maps built-in types to their Ant Design icons with a fallback for custom/unknown types', () => {
    expect(getSystemTypeIcon('LOGICAL_GROUP')).toBe(FolderOutlined);
    expect(getSystemTypeIcon('LOGICAL_GROUP', true)).toBe(FolderOpenOutlined);
    expect(getSystemTypeIcon('SERVICE')).toBe(CodeOutlined);
    expect(getSystemTypeIcon('SCHEMA')).toBe(DatabaseOutlined);
    expect(getSystemTypeIcon('UI')).toBe(DesktopOutlined);
    expect(getSystemTypeIcon('WORKER')).toBe(ThunderboltOutlined);
    expect(getSystemTypeIcon('PAYMENT_GATEWAY')).toBe(AppstoreOutlined);
    expect(getSystemTypeIcon('UNKNOWN_TYPE')).toBe(AppstoreOutlined);
  });
});

describe('systemTypeSettings', () => {
  let db: TaskPlannerDatabase;

  beforeEach(() => {
    db = new TaskPlannerDatabase(`TestDB_${Math.random()}`);
  });

  afterEach(async () => {
    await db.delete();
  });

  it('returns the five built-in options on a fresh DB without writing a setting row', async () => {
    const options = await getSystemTypeOptions(db);
    expect(options).toEqual([...DEFAULT_SYSTEM_TYPE_OPTIONS]);
    expect(await db.settings.get(SYSTEM_TYPE_OPTIONS_SETTING_KEY)).toBeUndefined();
  });

  it('round-trips a custom option list through the settings row', async () => {
    const custom = [
      { value: 'LOGICAL_GROUP', label: 'Parent System', color: '#722ed1' },
      { value: 'PAYMENT_GATEWAY', label: 'Payment Gateway', color: '#ff0000' },
    ];
    await setSystemTypeOptions(custom, db);
    expect(await getSystemTypeOptions(db)).toEqual(custom);
  });

  it('rejects invalid values, de-dupes, and falls back to defaults', () => {
    expect(isValidSystemTypeValue('PAYMENT_GATEWAY')).toBe(true);
    expect(isValidSystemTypeValue('payment_gateway')).toBe(false);
    expect(isValidSystemTypeValue('9X')).toBe(false);
    expect(isValidSystemTypeValue('')).toBe(false);
    expect(isValidSystemTypeValue('A'.repeat(41))).toBe(false);
    expect(isValidSystemTypeValue(' PAYMENT')).toBe(false);

    const normalized = normalizeSystemTypeOptions([
      { value: 'PAYMENT_GATEWAY', label: 'Pay', color: '#123456' },
      { value: 'PAYMENT_GATEWAY', label: 'Dup', color: '#000000' },
      { value: 'bad-type', label: 'Bad' },
      { value: 'lower', label: 'Lower' },
      { value: 'NO_COLOR' },
      { value: 'NO_LABEL', color: '#abcdef' },
      'garbage',
      null,
    ]);
    expect(normalized).toEqual([
      { value: 'PAYMENT_GATEWAY', label: 'Pay', color: '#123456' },
      { value: 'NO_COLOR', label: 'NO_COLOR', color: '#8c8c8c' },  // ponytail: data/export value, not a UI style token
      { value: 'NO_LABEL', label: 'NO_LABEL', color: '#abcdef' },
    ]);

    expect(normalizeSystemTypeOptions('not-an-array')).toEqual([...DEFAULT_SYSTEM_TYPE_OPTIONS]);
    expect(normalizeSystemTypeOptions([{ value: 'bad-type' }])).toEqual([
      ...DEFAULT_SYSTEM_TYPE_OPTIONS,
    ]);
  });

  it('ensureSystemTypeOption appends once', async () => {
    await ensureSystemTypeOption('PAYMENT_GATEWAY', db);
    await ensureSystemTypeOption('PAYMENT_GATEWAY', db);
    const options = await getSystemTypeOptions(db);
    const matches = options.filter((o) => o.value === 'PAYMENT_GATEWAY');
    expect(matches).toHaveLength(1);
    expect(matches[0]).toEqual({
      value: 'PAYMENT_GATEWAY',
      label: 'PAYMENT_GATEWAY',
      color: '#8c8c8c',  // ponytail: data/export value, not a UI style token
    });
  });

  it('toSystemTypeValue reuses a known value or label, otherwise slugifies free text', () => {
    const options = [...DEFAULT_SYSTEM_TYPE_OPTIONS];
    // Known value / label — case-insensitive, keeps the canonical value.
    expect(toSystemTypeValue('SERVICE', options)).toBe('SERVICE');
    expect(toSystemTypeValue('service', options)).toBe('SERVICE');
    expect(toSystemTypeValue('DB Schema', options)).toBe('SCHEMA');
    expect(toSystemTypeValue('Parent System', options)).toBe('LOGICAL_GROUP');
    // Free text: lowercase, spaces and diacritics are normalized instead of rejected.
    expect(toSystemTypeValue('payment gateway', options)).toBe('PAYMENT_GATEWAY');
    expect(toSystemTypeValue('  Payment   Gateway  ', options)).toBe('PAYMENT_GATEWAY');
    expect(toSystemTypeValue('Dịch vụ nội bộ', options)).toBe('DICH_VU_NOI_BO');
    expect(toSystemTypeValue('Đơn hàng', options)).toBe('DON_HANG');
    expect(toSystemTypeValue('api-gateway/v2', options)).toBe('API_GATEWAY_V2');
    // Nothing workable left → empty, so the form rule can report it.
    expect(toSystemTypeValue('', options)).toBe('');
    expect(toSystemTypeValue('   ', options)).toBe('');
    expect(toSystemTypeValue('!!!', options)).toBe('');
  });

  it('SystemInputSchema accepts a custom type and rejects malformed ones', () => {
    const base = { name: 'Pay', code: 'PAY' };
    expect(SystemInputSchema.safeParse({ ...base, type: 'PAYMENT_GATEWAY' }).success).toBe(true);
    expect(SystemInputSchema.safeParse({ ...base, type: 'payment-gateway' }).success).toBe(false);
    expect(SystemInputSchema.safeParse({ ...base, type: '9X' }).success).toBe(false);
  });

  it('BackupSystemRecordSchema accepts a custom type and rejects a malformed one', () => {
    const record = {
      id: '00000000-0000-4000-8000-000000000010',
      name: 'Pay',
      code: 'PAY',
      parentId: null,
      type: 'PAYMENT_GATEWAY',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(BackupSystemRecordSchema.safeParse(record).success).toBe(true);
    expect(
      BackupSystemRecordSchema.safeParse({ ...record, type: 'bad-type' }).success
    ).toBe(false);
  });

  it('still rejects a LOGICAL_GROUP that has a parent', () => {
    const result = SystemInputSchema.safeParse({
      name: 'Parent',
      code: 'PARENT',
      type: 'LOGICAL_GROUP',
      parentId: 'abc',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('hệ thống cha'))).toBe(true);
    }
  });
});
