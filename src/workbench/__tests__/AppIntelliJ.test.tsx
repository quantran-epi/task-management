import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppIntelliJ } from '../../AppIntelliJ';

// Mock WorkbenchLayout to verify mounting without loading all children views
vi.mock('../../workbench/WorkbenchLayout', () => ({
  WorkbenchLayout: () => <div data-testid="mock-workbench-layout">Mock Workbench Layout Mounted</div>,
}));

// Mock seeds and storage persistence
vi.mock('../../db/seeds', () => ({
  initializeDatabaseDefaults: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../services/storage/storagePersistence', () => ({
  checkAndRequestStoragePersistence: vi.fn().mockResolvedValue({ isPersisted: true, isSupported: true }),
}));

describe('AppIntelliJ entrypoint shell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mounts WorkbenchLayout inside all required providers without crashing', () => {
    render(<AppIntelliJ />);
    expect(screen.getByTestId('mock-workbench-layout')).toBeInTheDocument();
  });
});
