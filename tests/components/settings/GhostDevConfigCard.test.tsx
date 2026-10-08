import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GhostDevConfigCard } from '../../../src/components/settings/GhostDevConfigCard';
import { getGhostDevConfig } from '../../../src/services/agents/ghostDevConfig';
import * as timerPopout from '../../../src/utils/timerPopout';
import * as documentLinks from '../../../src/utils/documentLinks';

vi.mock('../../../src/utils/timerPopout', () => ({
  isTauriApp: vi.fn(),
}));

vi.mock('../../../src/utils/documentLinks', () => ({
  browseLocalFile: vi.fn(),
}));

describe('GhostDevConfigCard', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.mocked(timerPopout.isTauriApp).mockReturnValue(false);
  });

  it('renders default values and inputs', () => {
    render(<GhostDevConfigCard />);
    expect(screen.getByText(/Ghost Dev Agent Configuration/i)).toBeDefined();
    expect(screen.getByPlaceholderText(/claude-3-5-sonnet/i)).toBeDefined();
    expect(screen.getByPlaceholderText(/Mặc định: claude/i)).toBeDefined();
  });

  it('binds typed claudePath to form and persists on save', async () => {
    render(<GhostDevConfigCard />);

    const claudeInput = screen.getByPlaceholderText(/Mặc định: claude/i);
    fireEvent.change(claudeInput, {
      target: { value: 'C:\\Users\\user\\AppData\\Roaming\\npm\\claude.cmd' },
    });

    const saveButton = screen.getByRole('button', { name: /Lưu cấu hình/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      const config = getGhostDevConfig();
      expect(config.claudePath).toBe('C:\\Users\\user\\AppData\\Roaming\\npm\\claude.cmd');
    });
  });

  it('updates claudePath when browsing local file in desktop app', async () => {
    vi.mocked(timerPopout.isTauriApp).mockReturnValue(true);
    vi.mocked(documentLinks.browseLocalFile).mockResolvedValue('D:\\tools\\claude.cmd');

    render(<GhostDevConfigCard />);

    const browseBtn = screen.getByRole('button', { name: /Duyệt tập tin/i });
    fireEvent.click(browseBtn);

    await waitFor(() => {
      const claudeInput = screen.getByPlaceholderText(/Mặc định: claude/i) as HTMLInputElement;
      expect(claudeInput.value).toBe('D:\\tools\\claude.cmd');
    });

    const saveButton = screen.getByRole('button', { name: /Lưu cấu hình/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      const config = getGhostDevConfig();
      expect(config.claudePath).toBe('D:\\tools\\claude.cmd');
    });
  });
});
