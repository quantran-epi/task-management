import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ConfigProfileExportButton } from '../../../src/components/settings/ConfigProfileExportButton';
import type { ConfigurationProfile } from '../../../src/services/configProfiles/types';

const EXPORT_MOCK = vi.hoisted(() => vi.fn());
const ANNOUNCE_MOCK = vi.hoisted(() => vi.fn());
const SUCCESS_MOCK = vi.hoisted(() => vi.fn());
const ERROR_MOCK = vi.hoisted(() => vi.fn());
const INFO_MOCK = vi.hoisted(() => vi.fn());

vi.mock('../../../src/services/configProfiles/exportProfile', () => ({
  exportProfileToFile: EXPORT_MOCK,
}));

vi.mock('../../../src/components/common/AriaLiveRegion', () => ({
  announceToScreenReader: ANNOUNCE_MOCK,
  AriaLiveRegion: () => null,
}));

vi.mock('antd', async (importOriginal) => {
  const actual = await importOriginal<typeof import('antd')>();
  return {
    ...actual,
    notification: { success: SUCCESS_MOCK, error: ERROR_MOCK, info: INFO_MOCK },
  };
});

function selectedProfile(): ConfigurationProfile {
  return {
    id: 'profile-selected-1',
    name: 'Profile đã chọn',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    config: {
      settings: {
        ninerouter_api_key: 'sk-live-secret-must-not-be-saved',
        github_owner: 'acme-owner',
      },
      capacityRules: [],
      capacityOverrides: [],
      secretFields: { ninerouter_api_key: '' },
    },
  };
}

const writable = {
  write: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
};
const handle = { createWritable: vi.fn().mockResolvedValue(writable) };
const picker = vi.fn().mockResolvedValue(handle);

describe('ConfigProfileExportButton — one-click export of the selected profile (D-06, T-46-05)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    EXPORT_MOCK.mockResolvedValue({ saved: true });
    (window as any).showSaveFilePicker = picker;
  });

  afterEach(() => {
    cleanup();
    delete (window as any).showSaveFilePicker;
  });

  it('saves exactly the selected profile with blank secrets and reports success', async () => {
    render(<ConfigProfileExportButton profile={selectedProfile()} />);

    fireEvent.click(screen.getByRole('button', { name: /Xuất profile này/i }));

    await waitFor(() => expect(EXPORT_MOCK).toHaveBeenCalledTimes(1));
    const passedProfile = EXPORT_MOCK.mock.calls[0]?.[0] as ConfigurationProfile;
    expect(passedProfile.name).toBe('Profile đã chọn');
    expect(passedProfile.config.secretFields.ninerouter_api_key).toBe('');
    await waitFor(() => expect(SUCCESS_MOCK).toHaveBeenCalled());
    expect(ANNOUNCE_MOCK).toHaveBeenCalled();

    // Drive the real payload builder to prove no secret reaches the saved JSON.
    const { buildProfileExportPayload } = await vi.importActual<typeof import('../../../src/services/configProfiles/exportProfile')>(
      '../../../src/services/configProfiles/exportProfile'
    );
    const json = JSON.stringify(buildProfileExportPayload(passedProfile));
    expect(json).not.toContain('sk-live-secret-must-not-be-saved');
  });

  it('resets loading state after a rejected save and reports the error', async () => {
    EXPORT_MOCK.mockRejectedValueOnce(new Error('disk full'));
    render(<ConfigProfileExportButton profile={selectedProfile()} />);

    const button = screen.getByRole('button', { name: /Xuất profile này/i });
    fireEvent.click(button);

    await waitFor(() => expect(ERROR_MOCK).toHaveBeenCalled());
    await waitFor(() => expect(button).not.toBeDisabled());
    expect(SUCCESS_MOCK).not.toHaveBeenCalled();
  });
});
