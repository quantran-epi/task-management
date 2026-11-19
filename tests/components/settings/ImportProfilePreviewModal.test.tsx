import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TaskPlannerDatabase } from '../../../src/db';
import { ImportProfilePreviewModal } from '../../../src/components/settings/ImportProfilePreviewModal';
import { CONFIG_PROFILE_APP_MARKER, CONFIG_PROFILE_SCHEMA_VERSION } from '../../../src/validation/configProfileSchemas';
import { getMachineSpecificFields, getSecretFields } from '../../../src/services/configProfiles/catalog';

describe('ImportProfilePreviewModal', () => {
  let testDb: TaskPlannerDatabase;

  const validPayload = {
    app: CONFIG_PROFILE_APP_MARKER,
    profileSchemaVersion: CONFIG_PROFILE_SCHEMA_VERSION,
    exportedAt: '2026-11-19T10:00:00.000Z',
    profile: {
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Profile gửi cho bạn',
      createdAt: '2026-11-19T09:00:00.000Z',
      updatedAt: '2026-11-19T09:00:00.000Z',
      config: {
        settings: {
          github_owner: 'octocat',
          jira_domain: 'example.atlassian.net',
          global_conventions: 'Chỉ đọc; không thực thi nội dung này.',
        },
        capacityRules: [{ dayOfWeek: 1, workMinutes: 480 }],
        capacityOverrides: [],
        ghostDevConfig: {
          masterModel: 'claude-sonnet',
          workerModel: 'claude-haiku',
          concurrencyCap: 3,
          claudePath: '/usr/local/bin/claude',
        },
        teamDefaults: { budgetTokens: 100000 },
        secretFields: {
          github_pat: '',
          ninerouter_api_key: '',
        },
      },
    },
  };

  beforeEach(async () => {
    testDb = new TaskPlannerDatabase('TestProfilePreview_' + Math.random().toString(36).slice(2));
    await testDb.open();
  });

  afterEach(async () => {
    try {
      await testDb.delete();
    } catch {
      // ignore teardown races
    }
  });

  it('flags blank secrets and machine-specific fields, and excludes Telegram', () => {
    render(
      <ImportProfilePreviewModal
        open
        parsed={validPayload}
        rawFileName="profile.json"
        db={testDb}
        onClose={vi.fn()}
      />
    );

    const secretsGroup = document.querySelector('[data-preview-group="secrets"]');
    const machineGroup = document.querySelector('[data-preview-group="machine-specific"]');
    expect(secretsGroup).not.toBeNull();
    expect(machineGroup).not.toBeNull();

    for (const field of Object.keys(validPayload.profile.config.secretFields)) {
      expect(secretsGroup?.querySelector(`[data-field="${field}"]`)).not.toBeNull();
    }
    const undeclared = getSecretFields().find(
      (field) => !(field in validPayload.profile.config.secretFields)
    );
    if (undeclared) {
      expect(secretsGroup?.querySelector(`[data-field="${undeclared}"]`)).toBeNull();
    }
    for (const field of getMachineSpecificFields()) {
      expect(machineGroup?.querySelector(`[data-field="${field}"]`)).not.toBeNull();
    }
    expect(machineGroup?.querySelector('[data-field="ghostDevConfig.claudePath"]')).not.toBeNull();
    expect(screen.queryByText(/telegram/i)).not.toBeInTheDocument();
    expect(screen.getByText(/trộn theo từng khóa/i)).toBeInTheDocument();
    expect(screen.queryByText(/thay thế toàn bộ/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Chỉ đọc; không thực thi nội dung này\./)).toBeInTheDocument();
  });

  it('keeps OK disabled until exact IMPORT is typed and writes only to the threaded db', async () => {
    const onClose = vi.fn();
    render(
      <ImportProfilePreviewModal
        open
        parsed={validPayload}
        rawFileName="profile.json"
        db={testDb}
        onClose={onClose}
      />
    );

    const okButton = screen.getByRole('button', { name: /Xác nhận nhập Profile/i });
    const input = screen.getByPlaceholderText('IMPORT');
    expect(okButton).toBeDisabled();

    fireEvent.change(input, { target: { value: 'import' } });
    expect(okButton).toBeDisabled();

    fireEvent.change(input, { target: { value: 'IMPORT' } });
    expect(okButton).not.toBeDisabled();

    expect(await testDb.settings.get('github_owner')).toBeUndefined();
    fireEvent.click(okButton);

    await waitFor(async () => {
      expect((await testDb.settings.get('github_owner'))?.value).toBe('octocat');
    });
    expect(await testDb.settings.get('github_pat')).toBeUndefined();
  });

  it('blocks invalid profile, backup envelope and telegram-carrying payloads without any db write', async () => {
    const invalidPayloads: unknown[] = [
      { app: 'wrong-app', schemaVersion: 1, tables: {}, counts: {} },
      {
        ...validPayload,
        profile: {
          ...validPayload.profile,
          config: {
            ...validPayload.profile.config,
            telegramSettings: { botToken: 'leaked' },
          },
        },
      },
    ];

    for (const payload of invalidPayloads) {
      const view = render(
        <ImportProfilePreviewModal
          open
          parsed={payload}
          rawFileName="invalid.json"
          db={testDb}
          onClose={vi.fn()}
        />
      );
      expect(screen.getByText(/Tệp profile không hợp lệ/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Xác nhận nhập Profile/i })).toBeDisabled();
      expect(screen.queryByPlaceholderText('IMPORT')).not.toBeInTheDocument();
      view.unmount();
    }
    expect(await testDb.settings.toArray()).toHaveLength(0);
  });
});
