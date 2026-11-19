import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ConfigProfilesView } from '../../src/views/ConfigProfilesView';
import { TaskPlannerDatabase } from '../../src/db';
import { CONFIGURATION_PROFILES_SETTING_KEY } from '../../src/services/configProfiles/importProfile';
import { getSecretFields } from '../../src/services/configProfiles/catalog';
import { DEFAULT_NINEROUTER_ENDPOINT } from '../../src/services/ai/nineRouterTokenService';
import {
  CONFIG_PROFILE_APP_MARKER,
  CONFIG_PROFILE_SCHEMA_VERSION,
  ConfigProfileEnvelopeSchema,
} from '../../src/validation/configProfileSchemas';
import { applyConfigProfile } from '../../src/services/configProfiles/importProfile';

vi.mock('../../src/components/common/AriaLiveRegion', () => ({
  announceToScreenReader: vi.fn(),
  AriaLiveRegion: () => null,
}));

describe('ConfigProfilesView — defaults-seeded authoring (D-01..D-07)', () => {
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    db = new TaskPlannerDatabase(`Authoring_${Date.now()}_${Math.random()}`);
    await db.open();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    cleanup();
    try {
      await db.close();
      await db.delete();
    } catch {
      // ignore
    }
  });

  it('seeds the form from DEFAULT_* constants and NEVER reads db.settings during authoring', async () => {
    const settingsSpy = vi.spyOn(db.settings, 'get');

    render(<ConfigProfilesView db={db} />);

    // The form is seeded from defaults, not from the author's live settings.
    expect(
      screen.getByLabelText('9Router endpoint')
    ).toHaveValue(DEFAULT_NINEROUTER_ENDPOINT);
    await waitFor(() => {
      const getCalls = settingsSpy.mock.calls.map((call) => String(call[0]));
      expect(getCalls.every((key) => key === CONFIGURATION_PROFILES_SETTING_KEY)).toBe(true);
    });
  });

  it('renders secret fields blank with an export-blank placeholder', () => {
    render(<ConfigProfilesView db={db} />);

    const secretsCard = screen.getByTestId('profile-secrets-section');
    const secretFields = getSecretFields();
    for (const key of secretFields) {
      const field = secretsCard.querySelector(`[data-secret-field="${key}"]`);
      expect(field, `secret field ${key} must be rendered`).not.toBeNull();
      expect(field).toHaveValue('');
      expect(field).toHaveAttribute('placeholder', 'Sẽ để trống khi export');
    }
  });

  it('flags machine-specific fields including ghostDevConfig.claudePath with a warning marker', () => {
    render(<ConfigProfilesView db={db} />);

    expect(
      document.querySelector('[data-machine-specific-row="github_owner"] [data-machine-specific]')
    ).not.toBeNull();
    const claudePath = screen.getByLabelText('Ghost Dev claudePath');
    expect(claudePath).toHaveAttribute('data-machine-specific', 'ghostDevConfig.claudePath');
    expect(
      screen.getByTestId('profile-ghost-dev-section').querySelector('[data-machine-specific="ghostDevConfig.claudePath"]')
    ).not.toBeNull();
  });

  it('renders capacity, Ghost Dev and AI-team template sections', () => {
    render(<ConfigProfilesView db={db} />);

    expect(screen.getByTestId('profile-capacity-section')).toBeInTheDocument();
    expect(screen.getByTestId('profile-ghost-dev-section')).toBeInTheDocument();
    expect(screen.getByTestId('profile-ai-team-section')).toBeInTheDocument();
    expect(screen.getByText('Công suất làm việc (capacity)')).toBeInTheDocument();
    expect(screen.getByText('Ghost Dev config')).toBeInTheDocument();
    expect(screen.getByLabelText('Team budget warn threshold')).toBeInTheDocument();
    expect(within(screen.getByTestId('profile-ai-team-section')).getByText('Kế thừa global')).toBeInTheDocument();
  });

  it('renders NO Telegram field/section and no team record controls', () => {
    render(<ConfigProfilesView db={db} />);

    expect(screen.queryByText(/telegram/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/telegram/i)).not.toBeInTheDocument();
    const teamSection = screen.getByTestId('profile-ai-team-section');
    expect(within(teamSection).queryByText(/tên đội|team name|member|thành viên|folder|thư mục/i)).not.toBeInTheDocument();
  });

  it('exposes a keyboard-focusable machine-specific warning with an accessible name (IN-02)', () => {
    render(<ConfigProfilesView db={db} />);

    const warnings = document.querySelectorAll('[data-machine-specific][role="img"]');
    expect(warnings.length).toBeGreaterThan(0);
    for (const warning of Array.from(warnings)) {
      expect(warning).toHaveAttribute('tabindex', '0');
      expect(warning.getAttribute('aria-label')).toMatch(/cảnh báo/i);
    }
  });

  it('clamps blank/invalid draft values before saving so the profile passes schema and import (WR-04)', async () => {
    render(<ConfigProfilesView db={db} />);

    fireEvent.click(screen.getByRole('button', { name: /Thêm ngoại lệ/ }));
    fireEvent.change(screen.getByLabelText('Ghost Dev concurrency cap'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Phút làm việc Thứ Hai'), { target: { value: '2000' } });
    fireEvent.change(screen.getByLabelText('Team concurrency limit'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Tên profile'), { target: { value: 'Profile tự soạn' } });
    fireEvent.click(screen.getByRole('button', { name: /Lưu profile/i }));

    let rows: Array<{ name: string; config: unknown }> = [];
    await waitFor(async () => {
      const stored = await db.settings.get(CONFIGURATION_PROFILES_SETTING_KEY);
      expect(Array.isArray(stored?.value)).toBe(true);
      rows = (stored?.value ?? []) as Array<{ name: string; config: unknown }>;
    });
    const savedConfig = rows[0]?.config;
    expect(savedConfig).toBeDefined();

    const validation = ConfigProfileEnvelopeSchema.safeParse({
      app: CONFIG_PROFILE_APP_MARKER,
      profileSchemaVersion: CONFIG_PROFILE_SCHEMA_VERSION,
      exportedAt: '2026-11-19T00:00:00.000Z',
      profile: {
        id: 'validation-check',
        name: 'Profile tự soạn',
        createdAt: '2026-11-19T00:00:00.000Z',
        updatedAt: '2026-11-19T00:00:00.000Z',
        config: savedConfig,
      },
    });
    expect(validation.success).toBe(true);
    if (!validation.success) return;

    const config = validation.data.profile.config;
    expect(config.capacityOverrides[0]?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(config.ghostDevConfig?.concurrencyCap).toBe(1);
    expect(config.capacityRules.find((rule) => rule.dayOfWeek === 1)?.workMinutes).toBe(1440);
    expect(config.teamDefaults?.concurrencyLimit).toBe(1);

    const result = await applyConfigProfile(validation.data, db);
    expect(result.applied).toBe(true);
    expect(await db.settings.get('ai_team_defaults')).toBeUndefined();
  });

  it('rejects a user-typed invalid override date without writing or overwriting today (WR-02 round 2)', async () => {
    render(<ConfigProfilesView db={db} />);

    const today = new Date().toISOString().slice(0, 10);
    await db.capacityOverrides.add({ id: 'recipient-today', date: today, workMinutes: 480 });

    fireEvent.click(screen.getByRole('button', { name: /Thêm ngoại lệ/ }));
    // New exceptions are seeded with today, but the user may mistype the date.
    expect(screen.getByLabelText('Ngày ngoại lệ 1')).toHaveValue(today);
    fireEvent.change(screen.getByLabelText('Ngày ngoại lệ 1'), {
      target: { value: '2026-13-99' },
    });
    fireEvent.change(screen.getByLabelText('Tên profile'), {
      target: { value: 'Profile với ngày sai' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Lưu profile/i }));

    await waitFor(() => {
      expect(document.body.textContent).toContain('Profile chưa hợp lệ');
    });
    expect(screen.getByText(/capacityOverrides\.0\.date/)).toBeInTheDocument();
    expect(screen.getByLabelText('Ngày ngoại lệ 1')).toHaveValue('2026-13-99');
    expect(await db.settings.get(CONFIGURATION_PROFILES_SETTING_KEY)).toBeUndefined();

    // The bad profile never reaches import; the recipient's existing override is untouched.
    const rows = await db.capacityOverrides.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 'recipient-today', date: today, workMinutes: 480 });

    const invalidEnvelope = {
      app: CONFIG_PROFILE_APP_MARKER,
      profileSchemaVersion: CONFIG_PROFILE_SCHEMA_VERSION,
      exportedAt: '2026-11-19T00:00:00.000Z',
      profile: {
        id: 'bad-date',
        name: 'Profile với ngày sai',
        createdAt: '2026-11-19T00:00:00.000Z',
        updatedAt: '2026-11-19T00:00:00.000Z',
        config: {
          settings: {},
          capacityRules: [],
          capacityOverrides: [{ date: '2026-13-99', workMinutes: 0 }],
          secretFields: {},
        },
      },
    };
    expect(ConfigProfileEnvelopeSchema.safeParse(invalidEnvelope).success).toBe(false);
    const result = await applyConfigProfile(invalidEnvelope, db);
    expect(result.applied).toBe(false);
    expect(await db.capacityOverrides.toArray()).toEqual(rows);
  });

  it('creates, saves, selects and deletes named profiles through the one-row store', async () => {
    render(<ConfigProfilesView db={db} />);

    const nameInput = screen.getByLabelText('Tên profile');
    fireEvent.change(nameInput, { target: { value: 'Cấu hình cho bạn bè' } });
    fireEvent.click(screen.getByRole('button', { name: /Lưu profile/i }));

    await waitFor(async () => {
      const stored = await db.settings.get(CONFIGURATION_PROFILES_SETTING_KEY);
      expect(Array.isArray(stored?.value)).toBe(true);
      expect((stored?.value as Array<{ name: string }>)[0]?.name).toBe('Cấu hình cho bạn bè');
    });

    // New seeds a fresh draft from defaults; the saved profile remains selectable.
    fireEvent.click(screen.getByRole('button', { name: /Mới \(từ mặc định\)/i }));
    expect(screen.getByLabelText('Tên profile')).toHaveValue('');

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Chọn profile' }));
    fireEvent.click(
      (await screen.findAllByText('Cấu hình cho bạn bè')).find(
        (element) => element.closest('.ant-select-item-option') !== null
      )!
    );
    expect(screen.getByLabelText('Tên profile')).toHaveValue('Cấu hình cho bạn bè');

    // Delete asks for confirmation and writes the empty list back to the store.
    fireEvent.click(screen.getByRole('button', { name: /Xóa profile/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Xóa' }));
    await waitFor(async () => {
      const stored = await db.settings.get(CONFIGURATION_PROFILES_SETTING_KEY);
      expect(stored?.value).toEqual([]);
    });
  });
});
