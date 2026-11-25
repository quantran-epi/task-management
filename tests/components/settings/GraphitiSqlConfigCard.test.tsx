import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TaskPlannerDatabase } from '../../../src/db';
import { GraphitiSqlConfigCard } from '../../../src/components/settings/GraphitiSqlConfigCard';

vi.mock('../../../src/utils/timerPopout', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/utils/timerPopout')>()),
  isTauriApp: vi.fn(() => false),
}));

const getServersMock = vi.hoisted(() => vi.fn());
const saveServersMock = vi.hoisted(() => vi.fn());
const messageErrorMock = vi.hoisted(() => vi.fn());
const messageSuccessMock = vi.hoisted(() => vi.fn());
const fetchMock = vi.hoisted(() => vi.fn());

vi.mock('antd', async (importOriginal) => {
  const actual = await importOriginal<typeof import('antd')>();
  return {
    ...actual,
    App: {
      ...actual.App,
      useApp: () => ({
        message: {
          error: (...args: unknown[]) => messageErrorMock(...args),
          success: (...args: unknown[]) => messageSuccessMock(...args),
        },
      }),
    },
  };
});

vi.mock('../../../src/services/ai/graphitiRules', () => ({
  GRAPHITI_SQL_SERVER_IDS: { memory: 'graphiti-banking', source: 'svng-source' },
  getGraphitiSqlServers: getServersMock,
  saveGraphitiSqlServers: saveServersMock,
}));

describe('GraphitiSqlConfigCard', () => {
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    db = new TaskPlannerDatabase(`test-graphiti-sql-config-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await db.open();
    vi.clearAllMocks();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    getServersMock.mockResolvedValue({
      memory: { url: 'http://localhost:9101/mcp', enabled: true },
      source: { url: 'http://localhost:9102/mcp', enabled: true },
    });
    saveServersMock.mockImplementation(async (config: any) => [
      {
        id: 'graphiti-banking',
        name: 'Graphiti Banking MCP',
        url: config.memory.url,
        enabled: config.memory.enabled,
        instruction: '',
        desktopOnly: true,
      },
      {
        id: 'svng-source',
        name: 'SVNG Source MCP',
        url: config.source.url,
        enabled: config.source.enabled,
        instruction: '',
        desktopOnly: true,
      },
    ]);
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await db.delete();
  });

  it('renders the two implicit server URLs from settings', async () => {
    render(<GraphitiSqlConfigCard db={db} />);

    await waitFor(() => {
      expect(screen.getByLabelText('URL Graphiti Memory')).toHaveValue('http://localhost:9101/mcp');
      expect(screen.getByLabelText('URL SVNG Source')).toHaveValue('http://localhost:9102/mcp');
    });
        expect(screen.getByText(/SHA-256/i)).toBeInTheDocument();
  });

  it('offers URL-only editing: implicit servers stay always-on with no toggle', async () => {
    render(<GraphitiSqlConfigCard db={db} />);
    await waitFor(() => expect(screen.getByLabelText('URL SVNG Source')).toHaveValue('http://localhost:9102/mcp'));
    expect(screen.queryByRole('switch', { name: 'Bật Graphiti Memory' })).not.toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'Bật SVNG Source' })).not.toBeInTheDocument();
    expect(screen.getByText(/luôn bật/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('URL SVNG Source'), {
      target: { value: 'http://localhost:9202/mcp' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Lưu cấu hình Graphiti\/SQL/i }));
    await waitFor(() => expect(saveServersMock).toHaveBeenCalledWith(
      {
        memory: { url: 'http://localhost:9101/mcp', enabled: true },
        source: { url: 'http://localhost:9202/mcp', enabled: true },
      },
      db
    ));
  });

  it('disables saving when the current config cannot be read', async () => {
    getServersMock.mockRejectedValueOnce(new Error('IndexedDB busy'));
    render(<GraphitiSqlConfigCard db={db} />);

    await waitFor(() => {
      expect(screen.getByText(/Không đọc được cấu hình hiện tại/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Lưu cấu hình Graphiti\/SQL/i })).toBeDisabled();
    });
    fireEvent.click(screen.getByRole('button', { name: /Lưu cấu hình Graphiti\/SQL/i }));
    expect(saveServersMock).not.toHaveBeenCalled();
  });

  it('reports save failures in Vietnamese without calling onConfigChange', async () => {
    saveServersMock.mockRejectedValueOnce(new Error('URL không hợp lệ'));
    const onConfigChange = vi.fn();
    render(<GraphitiSqlConfigCard db={db} onConfigChange={onConfigChange} />);

    await waitFor(() => expect(screen.getByLabelText('URL Graphiti Memory')).toHaveValue('http://localhost:9101/mcp'));
    fireEvent.click(screen.getByRole('button', { name: /Lưu cấu hình Graphiti\/SQL/i }));

    await waitFor(() => {
      expect(messageErrorMock).toHaveBeenCalledWith('Không thể lưu cấu hình Graphiti/SQL: URL không hợp lệ');
    });
    expect(onConfigChange).not.toHaveBeenCalled();
    expect(screen.getByLabelText('URL Graphiti Memory')).toHaveValue('http://localhost:9101/mcp');
  });
});
