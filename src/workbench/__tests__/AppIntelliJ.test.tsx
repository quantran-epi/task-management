import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppIntelliJ } from '../../AppIntelliJ';

// Mock WorkbenchLayout to verify mounting without loading all children views
vi.mock('../../workbench/WorkbenchLayout', () => ({
  WorkbenchLayout: () => <div data-testid="mock-workbench-layout">Mock Workbench Layout Mounted</div>,
}));

// Keep popout mounts observable without loading the full chat runtime.
vi.mock('../../components/ChatStandaloneSplash', () => ({
  ChatStandaloneSplash: () => <div data-testid="mock-chat-splash" />,
}));

vi.mock('../../views/AIPopoutView', () => ({
  AIPopoutView: () => <div data-testid="mock-ai-popout-view" />,
}));

vi.mock('../../context/AIChatProvider', () => ({
  AIChatProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock seeds and storage persistence
vi.mock('../../db/seeds', () => ({
  initializeDatabaseDefaults: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../services/storage/storagePersistence', () => ({
  checkAndRequestStoragePersistence: vi.fn().mockResolvedValue({ isPersisted: true, isSupported: true }),
}));

function setHash(hash: string) {
  window.location.hash = hash;
}

describe('AppIntelliJ entrypoint shell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mounts WorkbenchLayout inside all required providers without crashing', () => {
    setHash('#/dashboard');
    render(<AppIntelliJ />);
    expect(screen.getByTestId('mock-workbench-layout')).toBeInTheDocument();
  });

  it('mounts the standalone splash on #/ai-popout when standaloneChat is true', () => {
    setHash('#/ai-popout');
    render(<AppIntelliJ standaloneChat />);
    expect(screen.getByTestId('mock-chat-splash')).toBeInTheDocument();
    expect(screen.getByTestId('mock-ai-popout-view')).toBeInTheDocument();
  });

  it('does not mount the standalone splash on #/ai-popout when standaloneChat is false', () => {
    setHash('#/ai-popout');
    render(<AppIntelliJ standaloneChat={false} />);
    expect(screen.queryByTestId('mock-chat-splash')).not.toBeInTheDocument();
    expect(screen.getByTestId('mock-ai-popout-view')).toBeInTheDocument();
  });

  it.each([true, false])(
    'does not mount the standalone splash on a normal route (standaloneChat=%s)',
    (standaloneChat) => {
      setHash('#/dashboard');
      render(<AppIntelliJ standaloneChat={standaloneChat} />);
      expect(screen.queryByTestId('mock-chat-splash')).not.toBeInTheDocument();
      expect(screen.getByTestId('mock-workbench-layout')).toBeInTheDocument();
    }
  );
});
