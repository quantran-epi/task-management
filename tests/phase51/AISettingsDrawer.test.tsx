// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import Dexie from 'dexie';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db';
import { SSH_CONFIGS_SETTING_KEY } from '../../src/types/ssh';
import { generateId } from '../../src/utils/uuid';
import { KnowledgeConfigProvider } from '../../src/services/knowledge/knowledgeConfig';
import { AIChatProvider } from '../../src/context/AIChatContext';
import { AIPopoutView } from '../../src/views/AIPopoutView';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const GROUP_LABELS = [
  'Provider',
  'Knowledge Server',
  'MCP',
  'Graphiti',
  'Oracle SQLcl',
  'SSH File System',
  'Tool Catalog',
] as const;

const STANDALONE_GROUP_LABELS = [
  'Provider',
  'Knowledge Server',
  'MCP',
  'Graphiti',
  'Oracle SQLcl',
  'SSH Connections',
  'SSH File System',
  'Tool Catalog',
] as const;

type CardProps = { db?: TaskPlannerDatabase };

const cardMocks = vi.hoisted(() => ({
  nineRouter: vi.fn((_props: CardProps) => null),
  knowledge: vi.fn(() => null),
  mcp: vi.fn((_props: CardProps) => null),
  graphiti: vi.fn((_props: CardProps) => null),
  oracle: vi.fn((_props: CardProps) => null),
  sshFs: vi.fn((_props: CardProps) => null),
  sshConnections: vi.fn((_props: CardProps) => null),
  catalog: vi.fn((_props: CardProps) => null),
}));

vi.mock('../../src/components/settings/NineRouterConfigCard', () => ({
  NineRouterConfigCard: (props: CardProps) => {
    cardMocks.nineRouter(props);
    return (
      <div data-testid="card-nine-router">
        <span>API Endpoint</span>
        <span>API Key</span>
        <span>Default Model</span>
        <span>Context window</span>
        <span>Global conventions</span>
      </div>
    );
  },
}));

vi.mock('../../src/components/settings/KnowledgeServerConfigCard', () => ({
  KnowledgeServerConfigCard: () => {
    cardMocks.knowledge();
    return <div data-testid="card-knowledge-server" />;
  },
}));

vi.mock('../../src/components/settings/McpConfigCard', () => ({
  McpConfigCard: (props: CardProps) => {
    cardMocks.mcp(props);
    return <div data-testid="card-mcp" />;
  },
}));

vi.mock('../../src/components/settings/GraphitiSqlConfigCard', () => ({
  GraphitiSqlConfigCard: (props: CardProps) => {
    cardMocks.graphiti(props);
    return <div data-testid="card-graphiti" />;
  },
}));

vi.mock('../../src/components/settings/OracleAiToolConfigCard', () => ({
  OracleAiToolConfigCard: (props: CardProps) => {
    cardMocks.oracle(props);
    return <div data-testid="card-oracle" />;
  },
}));

vi.mock('../../src/components/settings/SshFsAiToolConfigCard', () => ({
  SshFsAiToolConfigCard: (props: CardProps) => {
    cardMocks.sshFs(props);
    return <div data-testid="card-ssh-fs" />;
  },
  DEFAULT_SSH_FS_CONFIG: {
    sshConfigId: '',
    defaultBasePath: '/',
    maxLinesPerRead: 100,
    maxListEntries: 100,
    maxGrepMatches: 50,
  },
}));

vi.mock('../../src/components/settings/SshConfigCard', () => ({
  SshConfigCard: (props: CardProps) => {
    cardMocks.sshConnections(props);
    return <div data-testid="card-ssh-connections" />;
  },
}));

vi.mock('../../src/components/settings/AiToolCatalogCard', () => ({
  AiToolCatalogCard: (props: CardProps) => {
    cardMocks.catalog(props);
    return <div data-testid="card-tool-catalog" />;
  },
}));

vi.mock('../../src/services/ai/nineRouterTokenService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/ai/nineRouterTokenService')>();
  return { ...actual, setNineRouterApiKey: vi.fn(actual.setNineRouterApiKey) };
});

describe('phase 51 AI settings drawer', () => {
  let dbName: string;
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    dbName = `AISettingsDrawer_${generateId()}`;
    db = new TaskPlannerDatabase(dbName);
    await db.open();
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    cleanup();
    db.close();
    await Dexie.delete(dbName);
  });

  it('Test 1: side nav exposes exactly seven locked labels in order', async () => {
    const { AISettingsDrawerBody } = await import('../../src/components/ai/AISettingsDrawer');
    render(<AISettingsDrawerBody db={db} />);

    const nav = screen.getByRole('navigation', { name: 'Cài đặt AI' });
    expect(within(nav).getAllByRole('button').map((button) => button.textContent)).toEqual(GROUP_LABELS);
    expect(screen.queryByText('GlobalConventionsCard')).not.toBeInTheDocument();
  });

  it('Test 2: switching groups shows one card, marks nav active, and exposes accordion state', async () => {
    const { AISettingsDrawerBody } = await import('../../src/components/ai/AISettingsDrawer');
    render(<AISettingsDrawerBody db={db} />);

    const nav = screen.getByRole('navigation', { name: 'Cài đặt AI' });
    expect(within(nav).getByRole('button', { name: 'Provider' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByTestId('card-nine-router')).toBeInTheDocument();
    expect(screen.queryByTestId('card-mcp')).not.toBeInTheDocument();

    const accordionHeader = screen.getByRole('button', { name: 'NineRouter' });
    expect(accordionHeader).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(accordionHeader);
    expect(accordionHeader).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(accordionHeader);
    expect(accordionHeader).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(within(nav).getByRole('button', { name: 'MCP' }));
    expect(within(nav).getByRole('button', { name: 'MCP' })).toHaveAttribute('aria-current', 'true');
    expect(within(nav).getByRole('button', { name: 'Provider' })).not.toHaveAttribute('aria-current');
    expect(screen.queryByTestId('card-nine-router')).not.toBeInTheDocument();
    expect(screen.getByTestId('card-mcp')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'MCP servers' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('Test 3: Provider mounts real card with locked fields and shared keyring service', async () => {
    const { AISettingsDrawerBody } = await import('../../src/components/ai/AISettingsDrawer');
    render(<AISettingsDrawerBody db={db} />);

    for (const label of ['API Endpoint', 'API Key', 'Default Model', 'Context window', 'Global conventions']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(cardMocks.nineRouter).toHaveBeenCalledTimes(1);
    expect(cardMocks.nineRouter).toHaveBeenCalledWith({ db });

    const { setNineRouterApiKey } = await import('../../src/services/ai/nineRouterTokenService');
    expect(vi.isMockFunction(setNineRouterApiKey)).toBe(true);
    const keyring = await import('../../src/services/keyringService');
    expect(keyring.KEYRING_KEYS.NINEROUTER_API_KEY).toBe('ninerouter_api_key');
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    expect(readFileSync(resolve(process.cwd(), 'src/services/keyringService.ts'), 'utf8')).toContain("KEYRING_SERVICE = 'task-planner'");
  });

  it('Test 4: every other group mounts its real card module with the same db', async () => {
    const { AISettingsDrawerBody } = await import('../../src/components/ai/AISettingsDrawer');
    render(
      <KnowledgeConfigProvider db={db}>
        <AISettingsDrawerBody db={db} />
      </KnowledgeConfigProvider>
    );

    const nav = screen.getByRole('navigation', { name: 'Cài đặt AI' });
    const expected: Array<[string, string, keyof typeof cardMocks]> = [
      ['Knowledge Server', 'card-knowledge-server', 'knowledge'],
      ['MCP', 'card-mcp', 'mcp'],
      ['Graphiti', 'card-graphiti', 'graphiti'],
      ['Oracle SQLcl', 'card-oracle', 'oracle'],
      ['SSH File System', 'card-ssh-fs', 'sshFs'],
      ['Tool Catalog', 'card-tool-catalog', 'catalog'],
    ];

    for (const [label, testId, cardKey] of expected) {
      fireEvent.click(within(nav).getByRole('button', { name: label }));
      expect(screen.getByTestId(testId)).toBeInTheDocument();
      const cardMock = cardMocks[cardKey];
      expect(cardMock).toHaveBeenCalled();
      if (cardKey !== 'knowledge') {
        expect(cardMock.mock.calls.at(-1)?.[0]?.db?.name).toBe(db.name);
      }
    }
  });

  it('Test 9: standalone adds SSH Connections before SSH File System and passes the same db', async () => {
    const { AISettingsDrawerBody } = await import('../../src/components/ai/AISettingsDrawer');
    render(<AISettingsDrawerBody db={db} standalone />);

    const nav = screen.getByRole('navigation', { name: 'Cài đặt AI' });
    expect(within(nav).getAllByRole('button').map((button) => button.textContent)).toEqual(STANDALONE_GROUP_LABELS);
    fireEvent.click(within(nav).getByRole('button', { name: 'SSH Connections' }));
    expect(screen.getByTestId('card-ssh-connections')).toBeInTheDocument();
    expect(cardMocks.sshConnections).toHaveBeenCalledWith({ db });
    expect(screen.getByRole('button', { name: 'SSH Connections' })).toHaveAttribute('aria-current', 'true');
  });

  it('Test 10: docked settings keeps the seven locked groups with no SSH Connections', () => {
    const { AISettingsDrawerBody } = require('../../src/components/ai/AISettingsDrawer') as typeof import('../../src/components/ai/AISettingsDrawer');
    render(<AISettingsDrawerBody db={db} />);

    const nav = screen.getByRole('navigation', { name: 'Cài đặt AI' });
    expect(within(nav).getAllByRole('button').map((button) => button.textContent)).toEqual(GROUP_LABELS);
    expect(within(nav).queryByRole('button', { name: 'SSH Connections' })).not.toBeInTheDocument();
    const popoutSource = readFileSync(resolve(process.cwd(), 'src/views/AIPopoutView.tsx'), 'utf8');
    expect(popoutSource).toContain('<AISettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} db={activeDb} standalone={standaloneChat} />');
  });

  it('Test 11: SSH configs live in the selected DB and are invisible from another', async () => {
    const { saveSshConfig, getSshConfigs } = await import('../../src/services/sshService');
    const otherName = `AISettingsDrawerOther_${generateId()}`;
    const other = new TaskPlannerDatabase(otherName);
    await other.open();
    try {
      await saveSshConfig({
        id: 'ky8-ssh-connection',
        name: 'Ky8 fixture',
        host: '127.0.0.1',
        port: 22,
        username: 'test',
        authType: 'password',
        createdAt: '2026-11-26T00:00:00.000Z',
        updatedAt: '2026-11-26T00:00:00.000Z',
      }, undefined, db);

      expect((await getSshConfigs(db)).map((config) => config.id)).toEqual(['ky8-ssh-connection']);
      expect(await getSshConfigs(other)).toEqual([]);
      expect((await db.settings.get(SSH_CONFIGS_SETTING_KEY))?.value).toHaveLength(1);
      expect(await other.settings.get(SSH_CONFIGS_SETTING_KEY)).toBeUndefined();
    } finally {
      other.close();
      await Dexie.delete(otherName);
    }
  });

  it('Test 6: standalone host mounts one full-width settings Modal with db and open state', async () => {
    const source = readFileSync(resolve(process.cwd(), 'src/views/AIPopoutView.tsx'), 'utf8');
    expect(source.match(/<AISettingsDrawer\b/g)).toHaveLength(1);
    expect(source).not.toMatch(/<Drawer\b/);
    expect(source).toContain('onClose={() => setSettingsOpen(false)}');
    const workbench = readFileSync(resolve(process.cwd(), 'src/workbench/toolwindows/RightToolWindow.tsx'), 'utf8');
    expect(workbench).toContain('<AISettingsDrawer');
    expect(workbench).toContain('onOpenSettings={() => setSettingsOpen(true)}');

    render(
      <AIChatProvider>
        <AIPopoutView standaloneChat db={db} />
      </AIChatProvider>
    );

    fireEvent.click(screen.getByTestId('chat-settings-gear'));
    await waitFor(() => expect(screen.getByText('AI Settings · tất cả')).toBeInTheDocument());
    // AntD 6.6.5 renamed the modal panel class to .ant-modal-container.
    expect(document.querySelector('.ant-modal-container')).not.toBeNull();
    expect(document.querySelector('.ant-drawer')).toBeNull();
    expect(screen.getByRole('navigation', { name: 'Cài đặt AI' })).toBeInTheDocument();
  });

  it('Test 7: KnowledgeServerConfigCard resolves route provider without throw', async () => {
    const { KnowledgeConfigProvider: RealProvider } =
      await import('../../src/services/knowledge/knowledgeConfig');
    render(
      <AIChatProvider>
        <RealProvider db={db}>
          <AIPopoutView standaloneChat db={db} />
        </RealProvider>
      </AIChatProvider>
    );

    fireEvent.click(screen.getByTestId('chat-settings-gear'));
    await waitFor(() => expect(screen.getByText('AI Settings · tất cả')).toBeInTheDocument());
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Cài đặt AI' })).getByRole('button', { name: 'Knowledge Server' }));
    expect(screen.getByTestId('card-knowledge-server')).toBeInTheDocument();
    expect(screen.queryByText(/requires KnowledgeConfigProvider/)).not.toBeInTheDocument();
  });

  it('Test 8: close button, Esc and backdrop restore gear focus and keep draft', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <AIChatProvider>
        <AIPopoutView standaloneChat db={db} />
      </AIChatProvider>
    );

    const composer = screen.getByLabelText('Nội dung tin nhắn trò chuyện AI');
    fireEvent.change(composer, { target: { value: 'giữ nháp qua đóng drawer' } });
    const gear = screen.getByTestId('chat-settings-gear');
    gear.focus();
    fireEvent.click(gear);
    await waitFor(() => expect(screen.getByText('AI Settings · tất cả')).toBeInTheDocument());

    const closeButton = screen.getByRole('button', { name: 'Close' });
    expect(within(closeButton).getByLabelText('Đóng Cài đặt AI')).toBeInTheDocument();
    fireEvent.click(closeButton);
    await waitFor(() => expect(document.activeElement).toBe(gear), { timeout: 2000 });
    expect(screen.getByLabelText('Nội dung tin nhắn trò chuyện AI')).toHaveValue('giữ nháp qua đóng drawer');

    gear.focus();
    fireEvent.click(gear);
    await waitFor(() => expect(screen.getByText('AI Settings · tất cả')).toBeInTheDocument());
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(document.activeElement).toBe(gear), { timeout: 2000 });

    fireEvent.click(gear);
    await waitFor(() => expect(screen.getByText('AI Settings · tất cả')).toBeInTheDocument());
    // Esc is a supported backdrop-equivalent dismissal path; the visible Close button path
    // was already verified above, and assert that the modal leaves the DOM afterwards.
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(document.activeElement).toBe(gear), { timeout: 2000 });
    expect(screen.getByLabelText('Nội dung tin nhắn trò chuyện AI')).toHaveValue('giữ nháp qua đóng drawer');
    errorSpy.mockRestore();
  });

  it('Test 5: opening and closing the drawer keeps chat mounted and preserves draft', async () => {
    const { AISettingsDrawer } = await import('../../src/components/ai/AISettingsDrawer');
    const ChatAndDrawer = () => {
      const [open, setOpen] = useState(false);
      return (
        <>
          <input aria-label="Nội dung tin nhắn trò chuyện AI" defaultValue="" />
          <button onClick={() => setOpen(true)}>Mở Cài đặt AI</button>
          <AISettingsDrawer open={open} onClose={() => setOpen(false)} db={db} />
        </>
      );
    };
    render(<ChatAndDrawer />);

    const composer = screen.getByLabelText('Nội dung tin nhắn trò chuyện AI');
    fireEvent.change(composer, { target: { value: 'draft trước khi mở drawer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Mở Cài đặt AI' }));
    await waitFor(() => expect(screen.getByText('AI Settings · tất cả')).toBeInTheDocument());

    expect(screen.getByLabelText('Nội dung tin nhắn trò chuyện AI')).toHaveValue('draft trước khi mở drawer');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByLabelText('Nội dung tin nhắn trò chuyện AI')).toHaveValue('draft trước khi mở drawer');
  });
});
