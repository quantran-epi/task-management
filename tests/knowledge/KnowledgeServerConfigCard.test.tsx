// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db';
import { KnowledgeServerConfigCard } from '../../src/components/settings/KnowledgeServerConfigCard';
import { AriaLiveRegion } from '../../src/components/common/AriaLiveRegion';
import { KnowledgeConfigProvider } from '../../src/services/knowledge/knowledgeConfig';
import { SettingsView } from '../../src/views/SettingsView';
import { generateId } from '../../src/utils/uuid';

function renderCard(db: TaskPlannerDatabase, fetcher = vi.fn<typeof fetch>()) {
  return render(
    <KnowledgeConfigProvider db={db}>
      <AriaLiveRegion />
      <KnowledgeServerConfigCard fetcher={fetcher} />
    </KnowledgeConfigProvider>
  );
}

describe('KnowledgeServerConfigCard', () => {
  let dbName: string;
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    dbName = `KnowledgeServerConfigCard_${generateId()}`;
    db = new TaskPlannerDatabase(dbName);
    await db.open();
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(async () => {
    cleanup();
    db.close();
    await Dexie.delete(dbName);
    vi.restoreAllMocks();
  });

  it('renders disabled in existing AI tab with one URL and one ephemeral password field', async () => {
    render(
      <KnowledgeConfigProvider db={db}>
        <SettingsView db={db} defaultActiveTab="ai" />
      </KnowledgeConfigProvider>
    );

    expect(await screen.findByText('Knowledge Server')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Bật Knowledge Server' })).not.toBeChecked();
    expect(screen.getAllByLabelText('URL Knowledge Server')).toHaveLength(1);
    expect(screen.getAllByLabelText('Token phiên')).toHaveLength(1);
    expect(screen.getByLabelText('Token phiên')).toHaveAttribute('type', 'password');
    expect(screen.queryByText(/ghi nhớ token/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Knowledge Server/i })).not.toBeInTheDocument();
  });

  it('persists normalized URL while token disappears on remount and never reaches settings writes', async () => {
    const put = vi.spyOn(db.settings, 'put');
    const first = renderCard(db);
    await screen.findByText('Knowledge Server');

    fireEvent.click(screen.getByRole('switch', { name: 'Bật Knowledge Server' }));
    fireEvent.change(screen.getByLabelText('URL Knowledge Server'), {
      target: { value: 'https://knowledge.example.com///' },
    });
    fireEvent.change(screen.getByLabelText('Token phiên'), {
      target: { value: 'secret-session-token' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu cấu hình' }));

    await waitFor(() =>
      expect(screen.getByLabelText('URL Knowledge Server')).toHaveValue(
        'https://knowledge.example.com'
      )
    );
    expect(put.mock.calls.flat().join(' ')).not.toContain('secret-session-token');
    expect(await db.settings.get('knowledge_server_token')).toBeUndefined();
    first.unmount();

    renderCard(db);
    expect(await screen.findByLabelText('URL Knowledge Server')).toHaveValue(
      'https://knowledge.example.com'
    );
    expect(screen.getByLabelText('Token phiên')).toHaveValue('');
  });

  it('rejects remote HTTP, warns for loopback HTTP, normalizes slash, and exposes no route fields', async () => {
    renderCard(db);
    const url = await screen.findByLabelText('URL Knowledge Server');

    fireEvent.change(url, { target: { value: 'http://knowledge.example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu cấu hình' }));
    expect(await screen.findByText('Máy chủ từ xa phải dùng HTTPS.')).toBeInTheDocument();

    fireEvent.change(url, { target: { value: 'http://localhost:4100/' } });
    expect(await screen.findByText('HTTP chỉ được phép cho máy cục bộ.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Lưu cấu hình' }));
    await waitFor(() => expect(url).toHaveValue('http://localhost:4100'));

    expect(screen.queryByLabelText(/api\/v1/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/endpoint/i)).not.toBeInTheDocument();
  });

  it.each([
    [200, 'Kết nối Knowledge Server thành công.'],
    [401, 'Token phiên không hợp lệ hoặc đã hết hạn.'],
    [403, 'Token phiên không có quyền truy cập Knowledge Server.'],
  ])('maps HTTP %s to fixed content-free diagnostics', async (status, message) => {
    const fetcher = vi.fn(async () =>
      new Response(status === 200 ? JSON.stringify({ ok: true }) : JSON.stringify({ secret: 'raw' }), {
        status,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    renderCard(db, fetcher);
    fireEvent.change(await screen.findByLabelText('URL Knowledge Server'), {
      target: { value: 'https://knowledge.example.com' },
    });
    fireEvent.change(screen.getByLabelText('Token phiên'), {
      target: { value: 'secret-session-token' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra kết nối' }));

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledWith(
      'https://knowledge.example.com/api/v1/health',
      expect.objectContaining({ method: 'GET' })
    );
    const init = fetcher.mock.calls[0]?.[1];
    expect(init?.body).toBeUndefined();
    expect(document.body.textContent).not.toContain('raw');
    expect(document.body.textContent).not.toContain('secret-session-token');
  });

  it.each([
    [new TypeError('Failed to fetch'), 'Không thể kết nối Knowledge Server. Kiểm tra máy chủ và mạng rồi thử lại.'],
    [new TypeError('CORS blocked'), 'Trình duyệt đã chặn kết nối CORS. Kiểm tra nguồn được phép trên Knowledge Server.'],
  ])('maps network failure to fixed diagnostics', async (error, message) => {
    const fetcher = vi.fn(async () => Promise.reject(error));
    renderCard(db, fetcher);
    fireEvent.change(await screen.findByLabelText('URL Knowledge Server'), {
      target: { value: 'https://knowledge.example.com' },
    });
    fireEvent.change(screen.getByLabelText('Token phiên'), {
      target: { value: 'secret-session-token' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra kết nối' }));

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(error.message);
  });

  it('validates URL before diagnostics and makes no request while disabled', async () => {
    const fetcher = vi.fn<typeof fetch>();
    renderCard(db, fetcher);
    fireEvent.change(await screen.findByLabelText('URL Knowledge Server'), {
      target: { value: 'not-a-url' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra kết nối' }));

    expect(await screen.findByText('URL Knowledge Server không hợp lệ.')).toBeInTheDocument();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
