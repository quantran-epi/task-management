import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { InstallButton } from '../../../src/components/pwa/InstallButton';
import { AppShell } from '../../../src/components/shell/AppShell';
import * as pwaHookModule from '../../../src/hooks/usePWAInstall';

describe('InstallButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when running in standalone mode', () => {
    vi.spyOn(pwaHookModule, 'usePWAInstall').mockReturnValue({
      installPrompt: null,
      isInstallable: false,
      isStandalone: true,
      isIos: false,
      isInstalled: false,
      promptInstall: vi.fn(),
    });

    const { container } = render(<InstallButton />);
    expect(container).toBeEmptyDOMElement();
  });

  it('returns null after application is installed', () => {
    vi.spyOn(pwaHookModule, 'usePWAInstall').mockReturnValue({
      installPrompt: null,
      isInstallable: false,
      isStandalone: false,
      isIos: false,
      isInstalled: true,
      promptInstall: vi.fn(),
    });

    const { container } = render(<InstallButton />);
    expect(container).toBeEmptyDOMElement();
  });

  it('returns null when not installable and not iOS', () => {
    vi.spyOn(pwaHookModule, 'usePWAInstall').mockReturnValue({
      installPrompt: null,
      isInstallable: false,
      isStandalone: false,
      isIos: false,
      isInstalled: false,
      promptInstall: vi.fn(),
    });

    const { container } = render(<InstallButton />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders button and triggers promptInstall when clicked on Chromium with installPrompt', async () => {
    const promptInstallMock = vi.fn().mockResolvedValue('accepted');
    vi.spyOn(pwaHookModule, 'usePWAInstall').mockReturnValue({
      installPrompt: {} as any,
      isInstallable: true,
      isStandalone: false,
      isIos: false,
      isInstalled: false,
      promptInstall: promptInstallMock,
    });

    render(<InstallButton mode="header" />);

    const button = screen.getByRole('button', { name: /Cài đặt/i });
    expect(button).toBeInTheDocument();

    fireEvent.click(button);
    expect(promptInstallMock).toHaveBeenCalledTimes(1);
  });

  it('renders button and opens IosInstallModal when clicked on iOS', async () => {
    vi.spyOn(pwaHookModule, 'usePWAInstall').mockReturnValue({
      installPrompt: null,
      isInstallable: true,
      isStandalone: false,
      isIos: true,
      isInstalled: false,
      promptInstall: vi.fn(),
    });

    render(<InstallButton mode="header" />);

    const button = screen.getByRole('button', { name: /Cài đặt/i });
    expect(button).toBeInTheDocument();

    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText('Cài đặt trên iOS Safari')).toBeInTheDocument();
    });

    const closeBtn = screen.getByRole('button', { name: 'Đã hiểu' });
    fireEvent.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByText('Cài đặt trên iOS Safari')).not.toBeInTheDocument();
    });
  });

  it('renders with settings mode styling and full label', () => {
    vi.spyOn(pwaHookModule, 'usePWAInstall').mockReturnValue({
      installPrompt: {} as any,
      isInstallable: true,
      isStandalone: false,
      isIos: false,
      isInstalled: false,
      promptInstall: vi.fn(),
    });

    render(<InstallButton mode="settings" />);

    const button = screen.getByRole('button', { name: 'Cài đặt ứng dụng' });
    expect(button).toBeInTheDocument();
  });

  it('renders within AppShell header when installable', () => {
    vi.spyOn(pwaHookModule, 'usePWAInstall').mockReturnValue({
      installPrompt: {} as any,
      isInstallable: true,
      isStandalone: false,
      isIos: false,
      isInstalled: false,
      promptInstall: vi.fn(),
    });

    render(
      <AppShell currentRoute="dashboard" onNavigate={vi.fn()}>
        <div>App Content</div>
      </AppShell>
    );

    const button = screen.getByRole('button', { name: /Cài đặt/i });
    expect(button).toBeInTheDocument();
  });
});
