// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Dexie from 'dexie';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db';
import { KnowledgeServerConfigCard } from '../../src/components/settings/KnowledgeServerConfigCard';
import { AriaLiveRegion } from '../../src/components/common/AriaLiveRegion';
import { KnowledgeConfigProvider } from '../../src/services/knowledge/knowledgeConfig';
import { SettingsView } from '../../src/views/SettingsView';
import { generateId } from '../../src/utils/uuid';

vi.mock('../../src/components/settings/McpConfigCard', () => ({
  McpConfigCard: () => null,
}));
vi.mock('../../src/components/settings/GhostDevConfigCard', () => ({
  GhostDevConfigCard: () => null,
}));
vi.mock('../../src/components/settings/NineRouterConfigCard', () => ({
  NineRouterConfigCard: () => null,
}));

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
    expect(await screen.findByRole('switch', { name: 'Bật Knowledge Server' })).not.toBeChecked();
    expect(screen.getAllByLabelText('URL Knowledge Server')).toHaveLength(1);
    expect(screen.getAllByLabelText('Token phiên')).toHaveLength(1);
    expect(screen.getByLabelText('Token phiên')).toHaveAttribute('type', 'password');
    expect(screen.queryByText(/ghi nhớ token/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Knowledge Server/i })).not.toBeInTheDocument();
  });

  it('persists normalized URL while token disappears on remount and never reaches settings writes', async () => {
    const put = vi.spyOn(db.settings, 'put');
    const first = renderCard(db);
    await screen.findByRole('switch', { name: 'Bật Knowledge Server' });

    fireEvent.click(screen.getByRole('switch', { name: 'Bật Knowledge Server' }));
    fireEvent.change(screen.getByLabelText('URL Knowledge Server'), {
      target: { value: 'https://knowledge.example.com///' },
    });
    fireEvent.change(screen.getByLabelText('Token phiên'), {
      target: { value: 'secret-session-token' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Lưu cấu hình/ }));

    await waitFor(() =>
      expect(screen.getByLabelText('URL Knowledge Server')).toHaveValue(
        'https://knowledge.example.com'
      )
    );
    expect(put.mock.calls.flat().join(' ')).not.toContain('secret-session-token');
    expect(await db.settings.get('knowledge_server_token')).toBeUndefined();
    first.unmount();

    renderCard(db);
    await waitFor(() =>
      expect(screen.getByLabelText('URL Knowledge Server')).toHaveValue(
        'https://knowledge.example.com'
      )
    );
    expect(screen.getByLabelText('Token phiên')).toHaveValue('');
  });

  it('rejects remote HTTP, warns for loopback HTTP, normalizes slash, and exposes no route fields', async () => {
    renderCard(db);
    const url = await screen.findByLabelText('URL Knowledge Server');

    fireEvent.change(url, { target: { value: 'http://knowledge.example.com' } });
    expect(await screen.findByText('Máy chủ từ xa phải dùng HTTPS.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Lưu cấu hình/ }));

    fireEvent.change(url, { target: { value: 'http://localhost:4100/' } });
    expect(await screen.findByText('HTTP chỉ được phép cho máy cục bộ.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Lưu cấu hình/ }));
    await waitFor(() => expect(url).toHaveValue('http://localhost:4100'));

    expect(screen.queryByLabelText(/api\/v1/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/endpoint/i)).not.toBeInTheDocument();
  });

  it.each([
    [200, 'Kết nối Knowledge Server thành công.'],
    [401, 'Token phiên không hợp lệ hoặc đã hết hạn.'],
    [403, 'Token phiên không có quyền truy cập Knowledge Server.'],
  ])('maps HTTP %s to fixed content-free diagnostics', async (status, message) => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      new Response(status === 200 ? JSON.stringify({ ok: true }) : JSON.stringify({ secret: 'raw' }), {
        status,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    renderCard(db, fetcher);
    await screen.findByRole('switch', { name: 'Bật Knowledge Server' });
    fireEvent.click(screen.getByRole('switch', { name: 'Bật Knowledge Server' }));
    fireEvent.change(screen.getByLabelText('URL Knowledge Server'), {
      target: { value: 'https://knowledge.example.com' },
    });
    fireEvent.change(screen.getByLabelText('Token phiên'), {
      target: { value: 'secret-session-token' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Kiểm tra kết nối/ }));

    expect(await screen.findAllByText(message)).not.toHaveLength(0);
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
    const fetcher = vi.fn<typeof fetch>(async () => Promise.reject(error));
    renderCard(db, fetcher);
    await screen.findByRole('switch', { name: 'Bật Knowledge Server' });
    fireEvent.click(screen.getByRole('switch', { name: 'Bật Knowledge Server' }));
    fireEvent.change(screen.getByLabelText('URL Knowledge Server'), {
      target: { value: 'https://knowledge.example.com' },
    });
    fireEvent.change(screen.getByLabelText('Token phiên'), {
      target: { value: 'secret-session-token' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Kiểm tra kết nối/ }));

    expect(await screen.findAllByText(message)).not.toHaveLength(0);
    expect(document.body.textContent).not.toContain(error.message);
  });

  it('makes no request while disabled and validates URL before enabled diagnostics', async () => {
    const fetcher = vi.fn<typeof fetch>();
    renderCard(db, fetcher);
    await screen.findByRole('switch', { name: 'Bật Knowledge Server' });
    const testButton = screen.getByRole('button', { name: /Kiểm tra kết nối/ });
    expect(testButton).toBeDisabled();
    expect(fetcher).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('switch', { name: 'Bật Knowledge Server' }));
    fireEvent.change(await screen.findByLabelText('URL Knowledge Server'), {
      target: { value: 'not-a-url' },
    });
    fireEvent.click(testButton);

    expect(await screen.findAllByText('URL Knowledge Server không hợp lệ.')).not.toHaveLength(0);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('proves single root provider maintains token across views with zero leakage to storage or backups', async () => {
    const tokenCanary = 'bearer-token-canary-secret-12345';

    function Shell({ testDb }: { testDb: TaskPlannerDatabase }) {
      const [route, setRoute] = useState<'settings' | 'notes'>('settings');
      return (
        <KnowledgeConfigProvider db={testDb}>
          <button onClick={() => setRoute('settings')}>Go Settings</button>
          <button onClick={() => setRoute('notes')}>Go Notes</button>
          {route === 'settings' ? <SettingsView db={testDb} defaultActiveTab="ai" /> : <NotesView db={testDb} />}
        </KnowledgeConfigProvider>
      );
    }

    const { NotesView } = await import('../../src/views/NotesView');
    const { createNote } = await import('../../src/db/repositories/noteRepo');
    const { createDocumentSet } = await import('../../src/db/repositories/documentSetRepo');
    const { exportBackupPayload } = await import('../../src/services/backup/exportBackup');

    const note = await createNote({ title: 'Ghi chú', body: '# Nội dung', type: 'document' }, db);
    await createDocumentSet({ name: 'Bộ 1', documentIds: [note.id] }, db);

    const fetchSpy = vi.fn().mockImplementation(async () => {
      return new Response(JSON.stringify({ ok: true, attemptId: '11111111-1111-4111-8111-111111111111', status: 'Publishing' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchSpy);

    const { unmount } = render(<Shell testDb={db} />);

    // 1. In Settings view, configure Knowledge Server
    await screen.findByRole('switch', { name: 'Bật Knowledge Server' });
    fireEvent.click(screen.getByRole('switch', { name: 'Bật Knowledge Server' }));
    fireEvent.change(screen.getByLabelText('URL Knowledge Server'), {
      target: { value: 'https://knowledge.example.com' },
    });
    fireEvent.change(screen.getByLabelText('Token phiên'), {
      target: { value: tokenCanary },
    });
    fireEvent.click(screen.getByRole('button', { name: /Lưu cấu hình/ }));

    await waitFor(async () => {
      const urlSetting = await db.settings.get('knowledge_server_base_url');
      expect(urlSetting?.value).toBe('https://knowledge.example.com');
    });

    // 2. Switch to NotesView without unmounting KnowledgeConfigProvider
    fireEvent.click(screen.getByRole('button', { name: 'Go Notes' }));
    expect(await screen.findByText('Ghi chú & Tài liệu')).toBeInTheDocument();

    // 3. Open document set drawer and preview
    fireEvent.click((await screen.findByText('Bộ tài liệu')).closest('button') as HTMLButtonElement);
    fireEvent.click(await screen.findByRole('button', { name: 'Mở chi tiết' }));
    const previewButton = await screen.findByRole('button', { name: 'Xem trước xuất bản' });
    await waitFor(() => expect(previewButton).toBeEnabled());
    fireEvent.click(previewButton);

    // 4. Assert Authorization header contains token
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const authHeader = fetchSpy.mock.calls[0]?.[1]?.headers?.Authorization || fetchSpy.mock.calls[0]?.[1]?.headers?.authorization;
    expect(authHeader).toBe(`Bearer ${tokenCanary}`);

    // 5. Assert zero leakage across storage, DOM, and backup
    const settingsRows = await db.settings.toArray();
    expect(JSON.stringify(settingsRows)).not.toContain(tokenCanary);
    expect(JSON.stringify(localStorage)).not.toContain(tokenCanary);
    expect(JSON.stringify(sessionStorage)).not.toContain(tokenCanary);
    expect(document.body.textContent).not.toContain(tokenCanary);

    const backup = await exportBackupPayload(db);
    expect(JSON.stringify(backup)).not.toContain(tokenCanary);

    // 6. Provider remount clears token
    unmount();
    const freshDb = new TaskPlannerDatabase(dbName);
    render(
      <KnowledgeConfigProvider db={freshDb}>
        <SettingsView db={freshDb} defaultActiveTab="ai" />
      </KnowledgeConfigProvider>
    );
    await waitFor(() => {
      expect(screen.getByLabelText('Token phiên')).toHaveValue('');
    });
  }, 30_000);
});
