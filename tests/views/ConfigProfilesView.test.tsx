import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ConfigProfilesView } from '../../src/views/ConfigProfilesView';
import { TaskPlannerDatabase } from '../../src/db';
import { CONFIGURATION_PROFILES_SETTING_KEY } from '../../src/services/configProfiles/importProfile';
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

  it('fills the workbench panel with a border-box root and no centering maxWidth', () => {
    const { container } = render(<ConfigProfilesView db={db} />);

    const root = container.firstElementChild as HTMLElement;
    expect(root.style.width).toBe('100%');
    expect(root.style.height).toBe('100%');
    expect(root.style.boxSizing).toBe('border-box');
    expect(root.style.maxWidth).toBe('');
  });

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

  const openPanel = (label: string) => {
    fireEvent.click(screen.getByText(label).closest('.ant-collapse-header')!);
  };

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

  it('does not render blank secret inputs in authoring view (secrets handled by Import UI + checklist)', () => {
    render(<ConfigProfilesView db={db} />);

    expect(screen.queryByTestId('profile-secrets-section')).toBeNull();
    expect(document.querySelectorAll('[data-secret-field]').length).toBe(0);
  });

  it('renders notification_settings and system_type_options as readable JSON, never [object Object]', () => {
    render(<ConfigProfilesView db={db} />);

    expect((screen.getByLabelText('Cài đặt thông báo') as HTMLTextAreaElement).value).toContain(
      '"browserNotificationsEnabled"'
    );
    expect((screen.getByLabelText('Tùy chọn loại hệ thống') as HTMLTextAreaElement).value).toContain(
      '"LOGICAL_GROUP"'
    );
    expect(screen.queryByText('[object Object]')).toBeNull();
  });

  it('saves a valid edited notification_settings object, not a string', async () => {
    render(<ConfigProfilesView db={db} />);

    fireEvent.change(screen.getByLabelText('Cài đặt thông báo'), {
      target: { value: JSON.stringify({ browserNotificationsEnabled: true, dueSoonDays: 5 }, null, 2) },
    });
    fireEvent.change(screen.getByLabelText('Tên profile'), { target: { value: 'Profile JSON object' } });
    fireEvent.click(screen.getByRole('button', { name: /Lưu profile/i }));

    let savedConfig: { settings: Record<string, unknown> } | undefined;
    await waitFor(async () => {
      const stored = await db.settings.get(CONFIGURATION_PROFILES_SETTING_KEY);
      savedConfig = (stored?.value as Array<{ config: typeof savedConfig }> | undefined)?.[0]?.config;
      expect(savedConfig).toBeDefined();
    });
    expect(typeof savedConfig!.settings.notification_settings).toBe('object');
    expect(savedConfig!.settings.notification_settings).not.toBeInstanceOf(String);
    expect((savedConfig!.settings.notification_settings as { dueSoonDays: number }).dueSoonDays).toBe(5);
  });

  it('saves a valid edited system_type_options array, not a string', async () => {
    render(<ConfigProfilesView db={db} />);

    fireEvent.change(screen.getByLabelText('Tùy chọn loại hệ thống'), {
      target: { value: JSON.stringify([{ value: 'API', label: 'API', color: '#1890ff' }]) },
    });
    fireEvent.change(screen.getByLabelText('Tên profile'), { target: { value: 'Profile JSON array' } });
    fireEvent.click(screen.getByRole('button', { name: /Lưu profile/i }));

    let savedConfig: { settings: Record<string, unknown> } | undefined;
    await waitFor(async () => {
      const stored = await db.settings.get(CONFIGURATION_PROFILES_SETTING_KEY);
      savedConfig = (stored?.value as Array<{ config: typeof savedConfig }> | undefined)?.[0]?.config;
      expect(savedConfig).toBeDefined();
    });
    expect(Array.isArray(savedConfig!.settings.system_type_options)).toBe(true);
    expect((savedConfig!.settings.system_type_options as Array<{ value: string }>)[0]?.value).toBe('API');
  });

  it('blocks save and stores no string for invalid JSON or wrong structured shape', async () => {
    render(<ConfigProfilesView db={db} />);

    fireEvent.change(screen.getByLabelText('Cài đặt thông báo'), { target: { value: '{' } });
    fireEvent.change(screen.getByLabelText('Tùy chọn loại hệ thống'), {
      target: { value: JSON.stringify({ not: 'an array' }) },
    });
    fireEvent.change(screen.getByLabelText('Tên profile'), { target: { value: 'Profile JSON sai' } });
    fireEvent.click(screen.getByRole('button', { name: /Lưu profile/i }));

    await waitFor(() => {
      expect(document.body.textContent).toContain('Profile chưa hợp lệ');
    });
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
    expect(await db.settings.get(CONFIGURATION_PROFILES_SETTING_KEY)).toBeUndefined();
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

  it('keeps all grouped fields and DOM hooks reachable after collapsing', () => {
    render(<ConfigProfilesView db={db} />);

    expect(screen.getByLabelText('9Router endpoint')).toBeInTheDocument();
    expect(screen.getByLabelText('Team budget warn threshold')).toBeInTheDocument();
    expect(screen.getByTestId('profile-capacity-section')).toBeInTheDocument();
    expect(screen.getByTestId('profile-ghost-dev-section')).toBeInTheDocument();
    expect(screen.getByTestId('profile-ai-team-section')).toBeInTheDocument();
    expect(
      document.querySelector('[data-machine-specific-row="github_owner"] [data-machine-specific]')
    ).not.toBeNull();
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

    openPanel('Công suất làm việc (capacity)');
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

    openPanel('Công suất làm việc (capacity)');
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

    const savedProfile = (await db.settings.get(CONFIGURATION_PROFILES_SETTING_KEY))
      ?.value as Array<{ id: string }>;
    fireEvent.click(screen.getByTestId(`profile-list-item-${savedProfile[0]!.id}`));
    expect(screen.getByLabelText('Tên profile')).toHaveValue('Cấu hình cho bạn bè');

    // Delete asks for confirmation and writes the empty list back to the store.
    fireEvent.click(screen.getByRole('button', { name: /Xóa profile/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Xóa' }));
    await waitFor(async () => {
      const stored = await db.settings.get(CONFIGURATION_PROFILES_SETTING_KEY);
      expect(stored?.value).toEqual([]);
    });
  });

  it('lưu nhiều profile có người nhận; đổi tên giữ nguyên id và không sửa profile khác', async () => {
    render(<ConfigProfilesView db={db} />);

    fireEvent.change(screen.getByLabelText('Tên profile'), { target: { value: 'Cấu hình A' } });
    fireEvent.change(screen.getByLabelText('Người nhận'), { target: { value: 'Nam' } });
    fireEvent.click(screen.getByRole('button', { name: /Lưu profile/i }));

    await waitFor(async () => {
      const stored = await db.settings.get(CONFIGURATION_PROFILES_SETTING_KEY);
      expect((stored?.value as Array<{ name: string }> | undefined)?.[0]?.name).toBe('Cấu hình A');
    });

    fireEvent.click(screen.getByRole('button', { name: /Mới \(từ mặc định\)/i }));
    expect(screen.getByLabelText('Người nhận')).toHaveValue('');
    fireEvent.change(screen.getByLabelText('Tên profile'), { target: { value: 'Cấu hình B' } });
    fireEvent.change(screen.getByLabelText('Người nhận'), { target: { value: 'Lan' } });
    fireEvent.click(screen.getByRole('button', { name: /Lưu profile/i }));

    let rows: Array<{ id: string; name: string; recipient?: string }> = [];
    await waitFor(async () => {
      const stored = await db.settings.get(CONFIGURATION_PROFILES_SETTING_KEY);
      rows = (stored?.value ?? []) as typeof rows;
      expect(rows).toHaveLength(2);
    });
    expect(rows.map((row) => [row.name, row.recipient])).toEqual([
      ['Cấu hình A', 'Nam'],
      ['Cấu hình B', 'Lan'],
    ]);
    expect(screen.getByTestId(`profile-list-item-${rows[0]!.id}`).textContent).toContain('Nam');
    expect(screen.getByTestId(`profile-list-item-${rows[1]!.id}`).textContent).toContain('Lan');

    fireEvent.click(screen.getByTestId(`profile-list-item-${rows[0]!.id}`));
    expect(screen.getByLabelText('Người nhận')).toHaveValue('Nam');
    fireEvent.change(screen.getByLabelText('Tên profile'), { target: { value: 'Cấu hình A mới' } });
    fireEvent.click(screen.getByRole('button', { name: /Lưu profile/i }));

    await waitFor(async () => {
      const stored = await db.settings.get(CONFIGURATION_PROFILES_SETTING_KEY);
      const saved = (stored?.value ?? []) as typeof rows;
      expect(saved[0]).toMatchObject({ id: rows[0]!.id, name: 'Cấu hình A mới', recipient: 'Nam' });
      expect(saved[1]).toMatchObject({ id: rows[1]!.id, name: 'Cấu hình B', recipient: 'Lan' });
    });
  });

  it('tìm kiếm rail theo tên hoặc người nhận và nhân bản profile đang chọn', async () => {
    render(<ConfigProfilesView db={db} />);

    fireEvent.change(screen.getByLabelText('Tên profile'), { target: { value: 'Cấu hình A' } });
    fireEvent.change(screen.getByLabelText('Người nhận'), { target: { value: 'Nam' } });
    fireEvent.click(screen.getByRole('button', { name: /Lưu profile/i }));
    await waitFor(async () => {
      const stored = await db.settings.get(CONFIGURATION_PROFILES_SETTING_KEY);
      expect(Array.isArray(stored?.value)).toBe(true);
    });
    fireEvent.click(screen.getByRole('button', { name: /Mới \(từ mặc định\)/i }));
    fireEvent.change(screen.getByLabelText('Tên profile'), { target: { value: 'Cấu hình B' } });
    fireEvent.change(screen.getByLabelText('Người nhận'), { target: { value: 'Lan' } });
    fireEvent.click(screen.getByRole('button', { name: /Lưu profile/i }));

    let rows: Array<{ id: string; name: string; recipient?: string; config: unknown }> = [];
    await waitFor(async () => {
      const stored = await db.settings.get(CONFIGURATION_PROFILES_SETTING_KEY);
      rows = (stored?.value ?? []) as typeof rows;
      expect(rows).toHaveLength(2);
    });

    const search = screen.getByLabelText('Tìm profile');
    fireEvent.change(search, { target: { value: 'LAN' } });
    expect(screen.queryByTestId(`profile-list-item-${rows[0]!.id}`)).toBeNull();
    expect(screen.getByTestId(`profile-list-item-${rows[1]!.id}`)).toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'a' } });
    expect(screen.getByTestId(`profile-list-item-${rows[0]!.id}`)).toBeInTheDocument();
    fireEvent.change(search, { target: { value: '' } });

    fireEvent.click(screen.getByTestId(`profile-list-item-${rows[0]!.id}`));
    fireEvent.click(screen.getByRole('button', { name: /Nhân bản profile/i }));

    await waitFor(async () => {
      const stored = await db.settings.get(CONFIGURATION_PROFILES_SETTING_KEY);
      expect(((stored?.value ?? []) as unknown[])).toHaveLength(3);
    });
    const stored = await db.settings.get(CONFIGURATION_PROFILES_SETTING_KEY);
    const copied = ((stored?.value ?? []) as typeof rows)[2]!;
    expect(copied.id).not.toBe(rows[0]!.id);
    expect(copied.name).toBe('Cấu hình A (copy)');
    expect(copied.recipient).toBe('Nam');
    expect(copied.config).toEqual(rows[0]!.config);
    expect(screen.getByLabelText('Tên profile')).toHaveValue('Cấu hình A (copy)');
  });

  it('không đọc cấu hình máy chủ dù db.settings có giá trị trái ngược', async () => {
    await db.settings.put({ key: 'ninerouter_endpoint', value: 'http://evil' });
    render(<ConfigProfilesView db={db} />);

    expect(screen.getByLabelText('9Router endpoint')).toHaveValue(DEFAULT_NINEROUTER_ENDPOINT);
    expect(screen.getByLabelText('9Router endpoint')).not.toHaveValue('http://evil');
  });
});
