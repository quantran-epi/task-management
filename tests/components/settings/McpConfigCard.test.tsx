import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TaskPlannerDatabase } from '../../../src/db';
import { McpConfigCard } from '../../../src/components/settings/McpConfigCard';
import * as mcpClient from '../../../src/services/ai/mcpClient';

vi.mock('../../../src/utils/timerPopout', () => ({
  isTauriApp: vi.fn(() => false),
}));

describe('McpConfigCard', () => {
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    db = new TaskPlannerDatabase(`test-mcp-config-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await db.open();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('renders default MCP servers and controls', async () => {
    render(<McpConfigCard db={db} />);

    await waitFor(() => {
      expect(screen.getByText(/Cấu hình Máy chủ MCP/i)).toBeInTheDocument();
      expect(screen.getByText('Graphiti Banking MCP')).toBeInTheDocument();
      expect(screen.getByText('http://10.4.97.70:30456/mcp')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Thêm máy chủ/i })).toBeInTheDocument();
    });
  });

  it('toggles MCP server enabled status', async () => {
    const onConfigChange = vi.fn();
    render(<McpConfigCard db={db} onConfigChange={onConfigChange} />);

    await waitFor(() => {
      expect(screen.getByText('Graphiti Banking MCP')).toBeInTheDocument();
    });

    const switchBtn = screen.getByRole('switch', { name: /Bật\/tắt Graphiti Banking MCP/i });
    expect(switchBtn).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(switchBtn);

    await waitFor(() => {
      expect(switchBtn).toHaveAttribute('aria-checked', 'false');
      expect(onConfigChange).toHaveBeenCalled();
    });

    const updated = await mcpClient.getMcpServers(db);
    expect(updated[0]?.enabled).toBe(false);
  });

  it('adds a new MCP server through modal', async () => {
    const onConfigChange = vi.fn();
    render(<McpConfigCard db={db} onConfigChange={onConfigChange} />);

    await waitFor(() => {
      expect(screen.getByText('Graphiti Banking MCP')).toBeInTheDocument();
    });

    const addBtn = screen.getByRole('button', { name: /Thêm máy chủ/i });
    fireEvent.click(addBtn);

    await waitFor(() => {
      expect(screen.getByText('Thêm máy chủ MCP')).toBeInTheDocument();
    });

    const nameInput = screen.getByLabelText('Tên máy chủ');
    const urlInput = screen.getByLabelText('Địa chỉ Endpoint (HTTP/HTTPS)');

    fireEvent.change(nameInput, { target: { value: 'Custom Mock MCP' } });
    fireEvent.change(urlInput, { target: { value: 'http://localhost:8000/mcp' } });

    const saveBtn = screen.getByRole('button', { name: /Lưu máy chủ/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText('Custom Mock MCP')).toBeInTheDocument();
      expect(screen.getByText('http://localhost:8000/mcp')).toBeInTheDocument();
      expect(onConfigChange).toHaveBeenCalled();
    });

    const servers = await mcpClient.getMcpServers(db);
    expect(servers.some((s) => s.name === 'Custom Mock MCP')).toBe(true);
  });

  it('calls test connection and displays result', async () => {
    vi.spyOn(mcpClient, 'testMcpServerConnection').mockResolvedValueOnce({
      ok: true,
      message: 'Kết nối thành công (3 công cụ)',
      toolsCount: 3,
    });

    render(<McpConfigCard db={db} />);

    await waitFor(() => {
      expect(screen.getByText('Graphiti Banking MCP')).toBeInTheDocument();
    });

    const testBtn = screen.getByRole('button', { name: /Kiểm tra kết nối/i });
    fireEvent.click(testBtn);

    await waitFor(() => {
      expect(screen.getByText(/Kết nối thành công \(3 công cụ\)/i)).toBeInTheDocument();
    });
  });
});
