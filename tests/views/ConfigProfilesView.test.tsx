import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ConfigProfilesView } from '../../src/views/ConfigProfilesView';
import { TaskPlannerDatabase } from '../../src/db';
import { CONFIGURATION_PROFILES_SETTING_KEY } from '../../src/services/configProfiles/importProfile';
import { getSecretFields } from '../../src/services/configProfiles/catalog';
import { DEFAULT_NINEROUTER_ENDPOINT } from '../../src/services/ai/nineRouterTokenService';

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
    fireEvent.click(await screen.findByText('Cấu hình cho bạn bè'));
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
