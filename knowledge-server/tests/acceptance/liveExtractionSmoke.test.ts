import { describe, it, expect } from 'vitest';

describe('Realtime End-to-End Extraction Pipeline Verification', () => {
  const KNOWLEDGE_SERVER_URL = 'http://127.0.0.1:3001';
  const TOKEN = 'local-dev-knowledge-token';
  const ORIGIN = 'http://localhost:5173';

  it('connects to live knowledge-server healthcheck', async () => {
    const res = await fetch(`${KNOWLEDGE_SERVER_URL}/api/v1/health`, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        Origin: ORIGIN,
      },
    });
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.status).toBe('ok');
  });

  it('publishes a test document attempt and triggers graph rebuild to verify live LLM progress', async () => {
    const setId = '00000000-0000-4000-8000-000000000001';
    const attemptKey = '00000000-0000-4000-8000-000000000002';
    const rebuildKey = '00000000-0000-4000-8000-000000000003';

    // 1. Create a clean publish attempt
    const docBody = [
      '# Quy trình quyết toán thẻ ATM',
      '',
      'Quy trình PRC_SETTLEMENT thực hiện quyết toán giao dịch thẻ ATM hàng ngày.',
      '',
      'Thủ tục ACC_ENTRY_PKG đọc dữ liệu từ bảng TBL_TRANSACTION và cập nhật bảng ACC_BALANCE.',
      '',
      'Sau khi hoàn tất, hệ thống kích hoạt chu kỳ CYTP1001 và đặt trạng thái READY.',
    ].join('\n');

    const publishPayload = {
      setName: 'Quy trình quyết toán',
      documents: [
        {
          documentId: '11111111-1111-4111-8111-111111111111',
          title: 'Quy trình quyết toán thẻ',
          body: docBody,
        },
      ],
    };

    const pubRes = await fetch(`${KNOWLEDGE_SERVER_URL}/api/v1/sets/${setId}/attempts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TOKEN}`,
        Origin: ORIGIN,
        'X-Attempt-Key': attemptKey,
      },
      body: JSON.stringify(publishPayload),
    });
    expect(pubRes.status).toBe(202);

    // 2. Trigger graph rebuild
    const rebuildRes = await fetch(`${KNOWLEDGE_SERVER_URL}/api/v1/sets/${setId}/graph/rebuild`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        Origin: ORIGIN,
        'X-Rebuild-Key': rebuildKey,
      },
    });
    expect(rebuildRes.status).toBe(202);
    const rebuildData = await rebuildRes.json();
    expect(rebuildData.status).toBe('ACCEPTED');

    // 3. Poll graph status to observe live progress schema
    let status: any;
    for (let i = 0; i < 10; i++) {
      const statusRes = await fetch(`${KNOWLEDGE_SERVER_URL}/api/v1/sets/${setId}/graph/status`, {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          Origin: ORIGIN,
        },
      });
      expect(statusRes.ok).toBe(true);
      status = await statusRes.json();
      if (status.state !== 'Building') break;
      await new Promise((r) => setTimeout(r, 500));
    }

    expect(status.setId).toBe(setId);
    expect(['Building', 'Active', 'Never built', 'Failed']).toContain(status.state);
    if (status.progress) {
      expect(status.progress.percent).toBeGreaterThanOrEqual(0);
    }
  });
});
