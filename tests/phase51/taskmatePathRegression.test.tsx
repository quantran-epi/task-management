// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppIntelliJ } from '../../src/AppIntelliJ';

const initializeDatabaseDefaults = vi.fn().mockResolvedValue(undefined);

vi.mock('../../src/db/seeds', () => ({ initializeDatabaseDefaults }));
vi.mock('../../src/services/storage/storagePersistence', () => ({
  checkAndRequestStoragePersistence: vi.fn().mockResolvedValue({ isPersisted: true, isSupported: true }),
}));
vi.mock('../../src/workbench/WorkbenchLayout', () => ({
  WorkbenchLayout: () => <div data-testid="workbench-layout" />,
}));
vi.mock('../../src/views/AIPopoutView', () => ({
  AIPopoutView: ({ standaloneChat }: { standaloneChat?: boolean }) => (
    <div data-testid="ai-popout-view" data-standalone={String(standaloneChat ?? false)} />
  ),
}));

const readSource = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

describe('TaskMate default path keeps the original database (TASKMATE-PATH-UNCHANGED)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.location.hash = '#/dashboard';
  });

  it('keeps the shared db singleton and schema source untouched', () => {
    const dbSource = readSource('src/db/index.ts');
    expect(dbSource).toContain("export const db = new TaskPlannerDatabase()");
    expect(dbSource).not.toContain('chatWindowDb');
    expect(readSource('src/db/schema.ts')).not.toContain('chatWindowDb');
  });

  it('boots the default DB and mounts the workbench when not standalone', () => {
    render(<AppIntelliJ standaloneChat={false} />);
    expect(screen.getByTestId('workbench-layout')).toBeInTheDocument();
    expect(initializeDatabaseDefaults).toHaveBeenCalledTimes(1);
    expect(initializeDatabaseDefaults.mock.calls[0]?.[0]?.name).toBe('PersonalTaskPlannerDB');
  });

  it('keeps the docked chat host on the default DB without a standalone prop', () => {
    const source = readSource('src/workbench/toolwindows/RightToolWindow.tsx');
    expect(source).toContain('<AIChatDrawer');
    expect(source).toContain('<AISettingsDrawer');
    expect(source).not.toContain('chatWindowDb');
    expect(source).not.toContain('standalone');
  });
});
