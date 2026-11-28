import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppIntelliJ } from '../../src/AppIntelliJ';

vi.mock('../../src/views/AIPopoutView', () => ({
  AIPopoutView: ({ standaloneChat }: { standaloneChat?: boolean }) => (
    <div data-testid="ai-popout-view" data-standalone={String(standaloneChat ?? false)} />
  ),
}));

vi.mock('../../src/workbench/WorkbenchLayout', () => ({
  WorkbenchLayout: () => <div data-testid="workbench-layout" />,
}));

vi.mock('../../src/services/knowledge/knowledgeConfig', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/knowledge/knowledgeConfig')>();
  return {
    ...actual,
    KnowledgeConfigProvider: ({ children }: React.PropsWithChildren) => (
      <div data-testid="knowledge-provider">{children}</div>
    ),
  };
});

vi.mock('../../src/db/seeds', () => ({
  initializeDatabaseDefaults: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/services/storage/storagePersistence', () => ({
  checkAndRequestStoragePersistence: vi.fn().mockResolvedValue({ isPersisted: true, isSupported: true }),
}));

const readSource = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

describe('phase 51 standalone chat route', () => {
  it('reads the committed standalone marker and forwards it to AIPopoutView only on the chat route', () => {
    const source = readSource('src/AppIntelliJ.tsx');
    expect(source).toContain("import.meta.env.VITE_CHAT_STANDALONE === '1'");
    expect(source).toMatch(/standaloneChat\s*=\s*STANDALONE_CHAT/);
    expect(source).toMatch(/<AIPopoutView\s+standaloneChat=\{standaloneChat\}\s*\/>/);
    expect(source).toContain('<KnowledgeConfigProvider db={standaloneChat ? chatWindowDb : defaultDb}>');
    expect(source).toMatch(/standaloneChat\s*\?\s*chatWindowDb\s*:\s*defaultDb/);

    window.location.hash = '#ai-popout';
    render(<AppIntelliJ standaloneChat />);
    expect(screen.getByTestId('ai-popout-view')).toHaveAttribute('data-standalone', 'true');
    expect(screen.queryByTestId('workbench-layout')).not.toBeInTheDocument();
  });

  it('keeps the legacy branch shape when the marker is unset', () => {
    window.location.hash = '#ai-popout';
    render(<AppIntelliJ />);
    expect(screen.getByTestId('ai-popout-view')).toHaveAttribute('data-standalone', 'false');
    expect(screen.queryByTestId('workbench-layout')).not.toBeInTheDocument();
  });

  it('selects chat on first render for both hash-at-mount forms', () => {
    for (const hash of ['#ai-popout', '#/ai-popout?scopeType=task&scopeId=abc']) {
      window.location.hash = hash;
      const { unmount } = render(<AppIntelliJ standaloneChat />);
      expect(screen.getByTestId('ai-popout-view')).toBeInTheDocument();
      expect(screen.queryByTestId('workbench-layout')).not.toBeInTheDocument();
      unmount();
    }
  });

  it('wraps the standalone chat branch in KnowledgeConfigProvider', () => {
    window.location.hash = '#ai-popout';
    render(<AppIntelliJ standaloneChat />);
    expect(within(screen.getByTestId('knowledge-provider')).getByTestId('ai-popout-view')).toBeInTheDocument();
  });
});
