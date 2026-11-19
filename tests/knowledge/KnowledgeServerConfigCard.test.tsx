// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import Dexie from 'dexie';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db';
import { KnowledgeServerConfigCard } from '../../src/components/settings/KnowledgeServerConfigCard';
import { AriaLiveRegion } from '../../src/components/common/AriaLiveRegion';
import { KnowledgeConfigProvider } from '../../src/services/knowledge/knowledgeConfig';
import { SettingsView } from '../../src/views/SettingsView';
import { generateId } from '../../src/utils/uuid';

const listPublishedSets = vi.hoisted(() => vi.fn());
const purgeDocumentSet = vi.hoisted(() => vi.fn());
const realCreateKnowledgeClient = vi.hoisted(() => vi.fn());

vi.mock('../../src/services/knowledge/knowledgeClient', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/services/knowledge/knowledgeClient')>();
  realCreateKnowledgeClient.mockImplementation(original.createKnowledgeClient);
  return {
    ...original,
    createKnowledgeClient: vi.fn((options: Parameters<typeof original.createKnowledgeClient>[0]) => {
      const client = realCreateKnowledgeClient(options);
      return Object.assign(client, { listPublishedSets, purgeDocumentSet });
    }),
  };
});

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
    listPublishedSets.mockReset();
    purgeDocumentSet.mockReset();
  });

  afterEach(async () => {
    cleanup();
    db.close();
    await Dexie.delete(dbName);
    vi.restoreAllMocks();
  });

  it('renders disabled in existing AI tab with one URL and one persisted password field', async () => {
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

  it('persists normalized URL and token across remounts', async () => {
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
    expect(await db.settings.get('knowledge_server_token')).toEqual({
      key: 'knowledge_server_token',
      value: 'secret-session-token',
    });
    first.unmount();

    renderCard(db);
    await waitFor(() =>
      expect(screen.getByLabelText('URL Knowledge Server')).toHaveValue(
        'https://knowledge.example.com'
      )
    );
    expect(screen.getByLabelText('Token phiên')).toHaveValue('secret-session-token');
  });

  it('normalizes URL and exposes no internal route fields', async () => {
    renderCard(db);
    const url = await screen.findByLabelText('URL Knowledge Server');

    fireEvent.change(url, { target: { value: 'http://knowledge.example.com/' } });
    fireEvent.click(screen.getByRole('button', { name: /Lưu cấu hình/ }));
    await waitFor(() => expect(screen.getByLabelText('URL Knowledge Server')).toHaveValue('http://knowledge.example.com'));

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
      target: { value: 'ftp://not-a-url' },
    });
    fireEvent.click(testButton);

    expect(await screen.findAllByText('URL Knowledge Server không hợp lệ.')).not.toHaveLength(0);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('lists published server sets and refreshes after a confirmed purge (D-03, D-04)', async () => {
    const setA = generateId();
    const setB = generateId();
    const snapshotA = generateId();
    listPublishedSets.mockResolvedValueOnce([
      { setId: setA, snapshotId: snapshotA },
      { setId: setB, snapshotId: generateId() },
    ]);
    listPublishedSets.mockResolvedValueOnce([{ setId: setB, snapshotId: generateId() }]);
    purgeDocumentSet.mockResolvedValue(undefined);

    renderCard(db);
    await screen.findByRole('switch', { name: 'Bật Knowledge Server' });
    fireEvent.click(screen.getByRole('switch', { name: 'Bật Knowledge Server' }));
    fireEvent.change(screen.getByLabelText('URL Knowledge Server'), {
      target: { value: 'https://knowledge.example.com' },
    });
    fireEvent.change(screen.getByLabelText('Token phiên'), {
      target: { value: 'secret-session-token' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: /Lưu cấu hình/ })[0]!);

    expect(await screen.findByText('Quản lý set')).toBeInTheDocument();
    expect(await screen.findByText(setA)).toBeInTheDocument();
    expect(screen.getByText(snapshotA)).toBeInTheDocument();
    expect(screen.getByText(setB)).toBeInTheDocument();
    expect(listPublishedSets).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getAllByRole('button', { name: 'Dọn set này' })[0]!);
    const popconfirm = await waitFor(() => {
      const node = document.querySelector('.ant-popconfirm');
      expect(node).toBeInTheDocument();
      return node as HTMLElement;
    });
    fireEvent.click(within(popconfirm).getByRole('button', { name: 'Dọn set này' }));
    await waitFor(() => expect(purgeDocumentSet).toHaveBeenCalledWith(setA));
    await waitFor(() => expect(listPublishedSets).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText(setA)).not.toBeInTheDocument());
  });

  it('renders the Vietnamese empty state for an empty published-set list (UI-SPEC)', async () => {
    listPublishedSets.mockResolvedValue([]);
    renderCard(db);
    await screen.findByRole('switch', { name: 'Bật Knowledge Server' });
    fireEvent.click(screen.getByRole('switch', { name: 'Bật Knowledge Server' }));
    fireEvent.change(screen.getByLabelText('URL Knowledge Server'), {
      target: { value: 'https://knowledge.example.com' },
    });
    fireEvent.change(screen.getByLabelText('Token phiên'), {
      target: { value: 'secret-session-token' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: /Lưu cấu hình/ })[0]!);

    expect(await screen.findByText('Chưa có set nào được xuất bản')).toBeInTheDocument();
    expect(
      screen.getByText(/Chọn "Làm mới" để tải lại từ Knowledge Server/)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Làm mới danh sách set' })
    ).toBeInTheDocument();
  });

  it('shows a diagnostic when the daemon is unreachable without breaking local config (D-03)', async () => {
    listPublishedSets.mockRejectedValue(new Error('daemon unavailable'));
    renderCard(db);
    await screen.findByRole('switch', { name: 'Bật Knowledge Server' });
    fireEvent.click(screen.getByRole('switch', { name: 'Bật Knowledge Server' }));
    fireEvent.change(screen.getByLabelText('URL Knowledge Server'), {
      target: { value: 'https://knowledge.example.com' },
    });
    fireEvent.change(screen.getByLabelText('Token phiên'), {
      target: { value: 'secret-session-token' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Lưu cấu hình/ }));

    expect(await screen.findByText(/Không thể tải danh sách set/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Lưu cấu hình/ })).toBeEnabled();
  });

  it('makes no published-set request when the daemon is disabled', async () => {
    renderCard(db);
    await screen.findByRole('switch', { name: 'Bật Knowledge Server' });
    expect(await screen.findByText('Quản lý set')).toBeInTheDocument();
    expect(listPublishedSets).not.toHaveBeenCalled();
    expect(screen.getByText(/Không thể kết nối/)).toBeInTheDocument();
  });

  it('maintains persisted token across views while excluding it from backups', async () => {
    const tokenCanary = 'bearer-token-canary-secret-12345';

    function Shell({
      testDb,
      fetcher,
    }: {
      testDb: TaskPlannerDatabase;
      fetcher: typeof fetch;
    }) {
      const [route, setRoute] = useState<'settings' | 'sets'>('settings');
      return (
        <KnowledgeConfigProvider db={testDb}>
          <button onClick={() => setRoute('settings')}>Go Settings</button>
          <button onClick={() => setRoute('sets')}>Go Sets</button>
          {route === 'settings' ? (
            <SettingsView db={testDb} defaultActiveTab="ai" />
          ) : (
            <KnowledgeServerConfigCard fetcher={fetcher} />
          )}
        </KnowledgeConfigProvider>
      );
    }

    const { exportBackupPayload } = await import('../../src/services/backup/exportBackup');

    // Plan 02 replaced the long-scroll document-set drawer with the dedicated Docs workspace,
    // so the old "Bộ tài liệu" -> "Mở chi tiết" -> publish-preview path no longer exists.
    // The same persisted-token invariant is observed through the set-management section,
    // which builds its client from the provider's token on mount.
    const fetchSpy = vi.fn().mockImplementation(async () => {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchSpy);

    const { unmount } = render(<Shell testDb={db} fetcher={fetchSpy} />);

    // 1. In Settings view, configure Knowledge Server
    await screen.findByRole('switch', { name: 'Bật Knowledge Server' });
    fireEvent.click(screen.getByRole('switch', { name: 'Bật Knowledge Server' }));
    fireEvent.change(screen.getByLabelText('URL Knowledge Server'), {
      target: { value: 'https://knowledge.example.com' },
    });
    fireEvent.change(screen.getByLabelText('Token phiên'), {
      target: { value: tokenCanary },
    });
    const saveButtons = screen.getAllByRole('button', { name: /Lưu cấu hình/ });
    const knowledgeSave = saveButtons.find((button) =>
      button.closest('.ant-card')?.textContent?.includes('Dịch vụ độc lập và tùy chọn')
    );
    expect(knowledgeSave).toBeDefined();
    fireEvent.click(knowledgeSave!);

    expect(await screen.findAllByText('Đã lưu cấu hình Knowledge Server.')).not.toHaveLength(0);
    await waitFor(async () => {
      const [urlSetting, enabledSetting] = await Promise.all([
        db.settings.get('knowledge_server_base_url'),
        db.settings.get('knowledge_server_enabled'),
      ]);
      expect(urlSetting?.value).toBe('https://knowledge.example.com');
      expect(enabledSetting?.value).toBe(true);
    });

    // 2. Switch to the set-management surface on the same provider/db: it reads the persisted
    // token and issues its authoritative list request through the supplied fetcher.
    fireEvent.click(screen.getByRole('button', { name: 'Go Sets' }));
    expect(await screen.findByText('Quản lý set')).toBeInTheDocument();

    // 3. Assert the card built its client with the persisted token, and that the real client
    // sends that token as a Bearer header (listPublishedSets is mocked at the card boundary).
    const { createKnowledgeClient } = await import('../../src/services/knowledge/knowledgeClient');
    await waitFor(() =>
      expect(vi.mocked(createKnowledgeClient)).toHaveBeenCalledWith(
        expect.objectContaining({ token: tokenCanary })
      )
    );
    const probeClient = realCreateKnowledgeClient({
      baseUrl: 'https://knowledge.example.com',
      token: tokenCanary,
      fetcher: fetchSpy,
    });
    await probeClient.listPublishedSets();
    const authHeader = fetchSpy.mock.calls[0]?.[1]?.headers?.Authorization || fetchSpy.mock.calls[0]?.[1]?.headers?.authorization;
    expect(authHeader).toBe(`Bearer ${tokenCanary}`);

    // 5. Token persists only in IndexedDB and stays excluded from backup/visible text
    const settingsRows = await db.settings.toArray();
    expect(JSON.stringify(settingsRows)).toContain(tokenCanary);
    expect(JSON.stringify(localStorage)).not.toContain(tokenCanary);
    expect(JSON.stringify(sessionStorage)).not.toContain(tokenCanary);
    expect(document.body.textContent).not.toContain(tokenCanary);

    const backup = await exportBackupPayload(db);
    expect(JSON.stringify(backup)).not.toContain(tokenCanary);

    // 6. Provider remount restores token
    unmount();
    const freshDb = new TaskPlannerDatabase(dbName);
    render(
      <KnowledgeConfigProvider db={freshDb}>
        <SettingsView db={freshDb} defaultActiveTab="ai" />
      </KnowledgeConfigProvider>
    );
    await waitFor(() => {
      expect(screen.getByLabelText('Token phiên')).toHaveValue(tokenCanary);
    });
  }, 30_000);
});
