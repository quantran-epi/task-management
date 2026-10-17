import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TaskPlannerDatabase } from '../../../src/db';
import { NineRouterConfigCard } from '../../../src/components/settings/NineRouterConfigCard';

vi.mock('../../../src/utils/timerPopout', () => ({
  isTauriApp: vi.fn(() => false),
}));

describe('NineRouterConfigCard', () => {
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    db = new TaskPlannerDatabase(`test-ninerouter-config-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await db.open();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Avoid closing while pending async operations settle
  });

  it('renders NineRouter API settings and Image Generation settings', async () => {
    render(<NineRouterConfigCard db={db} />);

    await waitFor(() => {
      expect(screen.getByText(/Cấu hình Trợ lý AI \(9router API\)/i)).toBeInTheDocument();
      expect(screen.getByText('API Endpoint')).toBeInTheDocument();
      expect(screen.getByText(/Mô hình AI mặc định/i)).toBeInTheDocument();
      expect(screen.getByText(/Giới hạn ký tự ngữ cảnh/i)).toBeInTheDocument();
      expect(screen.getByText(/Cấu hình Tạo hình ảnh AI/i)).toBeInTheDocument();
      expect(screen.getByText('Image Endpoint')).toBeInTheDocument();
      expect(screen.getByText(/Mô hình tạo ảnh/i)).toBeInTheDocument();
    });
  });

  it('does NOT render Graphiti MCP section, endpoint input, or test button', async () => {
    render(<NineRouterConfigCard db={db} />);

    await waitFor(() => {
      expect(screen.getByText(/Cấu hình Trợ lý AI \(9router API\)/i)).toBeInTheDocument();
    });

    expect(screen.queryByText(/Graphiti MCP \(Knowledge Graph & Domain Memory\)/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Graphiti MCP Endpoint/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Kiểm tra kết nối Graphiti MCP/i })).not.toBeInTheDocument();
  });

  it('saves configuration without Graphiti references and emits notification', async () => {
    render(<NineRouterConfigCard db={db} />);

    await waitFor(() => {
      expect(screen.getByText(/Cấu hình Trợ lý AI \(9router API\)/i)).toBeInTheDocument();
    });

    const saveBtn = screen.getByRole('button', { name: /Lưu tất cả cấu hình/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText(/Lưu cấu hình thành công/i)).toBeInTheDocument();
    });
  });
});
