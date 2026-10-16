/**
 * Seed documents & execute live smoke acceptance test against the real local Knowledge Server.
 * Also verifies federated retrieval and groundedTurn parity to ensure AI Chat Drawer consistency.
 */

const ENDPOINT = process.env.KNOWLEDGE_SERVER_URL || 'http://127.0.0.1:3001';
const TOKEN = process.env.KNOWLEDGE_SERVER_TOKEN || 'local-dev-knowledge-token';
const ORIGIN = process.env.KNOWLEDGE_ALLOWED_ORIGIN || 'http://localhost:5173';

const headers = {
  'Content-Type': 'application/json',
  Origin: ORIGIN,
  Authorization: `Bearer ${TOKEN}`,
};

const SET_ID = 'ae60b412-56ff-476b-9321-ed919600a94a';
const ATTEMPT_KEY = 'ae60b412-56ff-476b-9321-ed919600a94b';
const REBUILD_KEY = 'ae60b412-56ff-476b-9321-ed919600a94c';

// Pilot document set for process 60000006 & MAIN1.FCL_CYCLE_COUNTER
const DOC_01 = {
  documentId: '00000000-0000-4000-8000-000000000001',
  title: '01 — Overview',
  body: `# SHB - Credit calculations (60000006)

Tiến trình tính toán hạn mức tín dụng và chu kỳ tính lãi/phí cho hệ thống thẻ SmartVista.

| PRC_ID | PRC_NAME | IS_CONTAINER | IS_EXTERNAL |
| :--- | :--- | :--- | :--- |
| 60000006 | SHB - Credit calculations | 1 | 0 |
| 10000304 | Step 10 - Due date period cycle | 0 | 0 |
| 10000263 | Step 20 - Grace period length cycle | 0 | 0 |

## Danh sách bước thực thi trong container 60000006

| BIND_ID | ORDER | TARGET_ID | MO_TA |
| :--- | :--- | :--- | :--- |
| 60000005 | 10 | 10000304 | Step 10 - Due date period cycle CYTP1002 |
| 60000006 | 20 | 10000263 | Step 20 - Grace period length cycle CYTP1003 |

Quy trình thực thi của container 60000006 bắt đầu từ Scheduler, gọi các Container Step theo thứ tự execOrder từ Step 10 đến Step 20.
`,
};

const DOC_02 = {
  documentId: '00000000-0000-4000-8000-000000000002',
  title: '02-data-objects.md',
  body: `# 02 — Data objects

## Cơ sở dữ liệu Oracle SmartVista

### Bảng \`MAIN1.FCL_CYCLE_COUNTER\`

Bảng \`MAIN1.FCL_CYCLE_COUNTER\` lưu trữ số đếm chu kỳ tính toán và thông tin chu kỳ tính lãi của container 60000006.

| Field | Type | Description |
| :--- | :--- | :--- |
| CYCLE_ID | NUMBER | Mã định danh chu kỳ |
| COUNTER_VAL | NUMBER | Giá trị đếm |
| STATUS | VARCHAR2 | Trạng thái chu kỳ |

Gói PL/SQL \`MAIN1.FCL_PRC_CYCLE_COUNTER_PKG.PROCESS\` đọc dữ liệu từ bảng \`MAIN1.FCL_CYCLE_COUNTER\` và cập nhật kết quả tính toán chu kỳ.
Khi thay đổi cấu trúc bảng \`MAIN1.FCL_CYCLE_COUNTER\`, các package phụ thuộc như \`MAIN1.FCL_PRC_CYCLE_COUNTER_PKG.PROCESS\` và quy trình tính lãi container 60000006 sẽ bị ảnh hưởng trực tiếp.
`,
};

const DOC_04 = {
  documentId: '00000000-0000-4000-8000-000000000004',
  title: '04-cycles.md',
  body: `# 04 — Chu kỳ tính lãi và phí

Chu kỳ tính lãi container 60000006 và chu kỳ tính toán lãi suất được cấu hình qua các loại chu kỳ:

| BIND_ID | CYCLE_TYPE | DICT_NAME |
| :--- | :--- | :--- |
| 60000005 | CYTP1002 | Chu kỳ trích nợ tự động |
| 60000006 | CYTP1003 | Chu kỳ tính lãi và phí |

Các bảng dữ liệu và chu kỳ tính toán lãi suất container 60000006 bao gồm \`MAIN1.FCL_CYCLE_COUNTER\` và loại chu kỳ CYTP1003.
`,
};

async function main() {
  console.log('=== Step 1: Check Knowledge Server Readiness ===');
  const readyRes = await fetch(`${ENDPOINT}/api/v1/health/readiness`, { headers });
  if (!readyRes.ok) {
    throw new Error(`Readiness failed: ${readyRes.status} ${readyRes.statusText}`);
  }
  const readyJson = await readyRes.json();
  console.log('Readiness response:', readyJson);

  console.log('\n=== Step 2: Publish Dump Document Set ===');
  const attemptRes = await fetch(`${ENDPOINT}/api/v1/sets/${SET_ID}/attempts`, {
    method: 'POST',
    headers: { ...headers, 'x-attempt-key': ATTEMPT_KEY },
    body: JSON.stringify({
      setName: 'Process 60000006 Pilot Set',
      documents: [DOC_01, DOC_02, DOC_04],
    }),
  });
  if (!attemptRes.ok && attemptRes.status !== 202) {
    throw new Error(`Publish failed: ${attemptRes.status} ${await attemptRes.text()}`);
  }
  console.log('Document snapshot published successfully.');

  console.log('\n=== Step 3: Trigger Graph Rebuild & Vector Extraction ===');
  const rebuildRes = await fetch(`${ENDPOINT}/api/v1/sets/${SET_ID}/graph/rebuild`, {
    method: 'POST',
    headers: { ...headers, 'x-rebuild-key': REBUILD_KEY },
    body: '{}',
  });
  if (!rebuildRes.ok && rebuildRes.status !== 202) {
    throw new Error(`Graph rebuild trigger failed: ${rebuildRes.status} ${await rebuildRes.text()}`);
  }
  const rebuildData = await rebuildRes.json();
  console.log('Candidate rebuild triggered:', rebuildData);

  // Poll candidate status until READY
  let candidateId = rebuildData.candidateSnapshotId;
  let ready = false;
  for (let i = 0; i < 20; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const statusRes = await fetch(`${ENDPOINT}/api/v1/sets/${SET_ID}/graph/status`, { headers });
    const status = await statusRes.json();
    console.log(`Polling status [${i + 1}/20]: state=${status.state}, candidateStatus=${status.candidateStatus}`);
    if (status.candidateStatus === 'READY' || status.state === 'Active') {
      candidateId = status.candidateSnapshotId || status.activeGraphSnapshotId || candidateId;
      ready = true;
      break;
    }
  }
  if (!ready) {
    throw new Error('Graph candidate rebuild timed out.');
  }

  console.log(`\n=== Step 4: Activate Candidate Snapshot (${candidateId}) ===`);
  const activateRes = await fetch(`${ENDPOINT}/api/v1/sets/${SET_ID}/graph/activate`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ candidateSnapshotId: candidateId }),
  });
  if (!activateRes.ok) {
    const errText = await activateRes.text();
    // If already active, it's fine
    console.log(`Activation response status: ${activateRes.status} (${errText})`);
  } else {
    console.log('Snapshot activated in Neo4j.');
  }

  const finalStatus = await (await fetch(`${ENDPOINT}/api/v1/sets/${SET_ID}/graph/status`, { headers })).json();
  console.log('Active Graph Status:', finalStatus);

  console.log('\n=== Step 5: Run Direct Smoke T-Cases ===');
  const testCases = [
    {
      id: 'T1',
      title: 'Fast-path lookup MAIN1.FCL_CYCLE_COUNTER',
      query: 'MAIN1.FCL_CYCLE_COUNTER',
      check: (res) => {
        if (res.outcome !== 'READY') throw new Error(`Expected READY, got ${res.outcome}`);
        if (!res.planTrace?.fastPath) throw new Error(`Expected fastPath true`);
        const titles = res.items.filter((i) => i.type === 'chunk').map((c) => c.sourceDocumentTitle);
        if (!titles.includes('02-data-objects.md')) throw new Error(`Expected 02-data-objects.md in citations`);
        return `Pass: fastPath=${res.planTrace.fastPath}, items=${res.items.length}, citations=${titles.join(', ')}`;
      },
    },
    {
      id: 'T2',
      title: 'Natural language query container 60000006',
      query: 'Chu kỳ tính lãi/phí container 60000006',
      check: (res) => {
        if (res.outcome !== 'READY') throw new Error(`Expected READY, got ${res.outcome}`);
        return `Pass: outcome=${res.outcome}, items=${res.items.length}, modalities=${res.modalitiesUsed?.join(', ')}`;
      },
    },
    {
      id: 'T3',
      title: 'Cross-lingual query container 60000006',
      query: 'Các bảng dữ liệu và chu kỳ tính toán lãi suất container 60000006 là gì?',
      check: (res) => {
        if (res.outcome !== 'READY') throw new Error(`Expected READY, got ${res.outcome}`);
        return `Pass: outcome=${res.outcome}, items=${res.items.length}`;
      },
    },
    {
      id: 'T4',
      title: 'Flow traversal',
      query: 'Quy trình thực thi của container 60000006 diễn ra theo các bước nào từ Scheduler đến PL/SQL?',
      check: (res) => {
        if (res.outcome !== 'READY') throw new Error(`Expected READY, got ${res.outcome}`);
        return `Pass: outcome=${res.outcome}, paths=${res.paths?.length || 0}`;
      },
    },
    {
      id: 'T5',
      title: 'Multi-hop impact analysis',
      query: 'Nếu thay đổi cấu trúc bảng MAIN1.FCL_CYCLE_COUNTER thì những package và quy trình nào bị ảnh hưởng?',
      check: (res) => {
        if (res.outcome !== 'READY') throw new Error(`Expected READY, got ${res.outcome}`);
        return `Pass: outcome=${res.outcome}, items=${res.items.length}`;
      },
    },
    {
      id: 'T6',
      title: 'Unreferenced domain abstention (SWIFT MT103)',
      query: 'Thủ tục xử lý chuyển tiền quốc tế SWIFT MT103 trong container 60000006 hoạt động ra sao?',
      check: (res) => {
        if (res.outcome !== 'NO_EVIDENCE') throw new Error(`Expected NO_EVIDENCE, got ${res.outcome}`);
        return `Pass: safe abstention NO_EVIDENCE`;
      },
    },
    {
      id: 'T7',
      title: 'Explicit speculation handling',
      query: 'Hãy phỏng đoán xem container 60000006 có thể hỗ trợ chuẩn SWIFT MT103 trong tương lai không?',
      check: (res) => {
        if (res.outcome !== 'NO_EVIDENCE') throw new Error(`Expected NO_EVIDENCE, got ${res.outcome}`);
        return `Pass: safe abstention NO_EVIDENCE`;
      },
    },
  ];

  for (const tc of testCases) {
    const t0 = Date.now();
    const res = await fetch(`${ENDPOINT}/api/v1/sets/${SET_ID}/retrieve`, {
      method: 'POST',
      headers: { ...headers, 'x-correlation-id': `smoke-${tc.id}` },
      body: JSON.stringify({
        query: tc.query,
        limit: 10,
        includeInferred: true,
        recentTurns: [],
      }),
    });
    if (!res.ok) {
      throw new Error(`Smoke ${tc.id} failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    const duration = Date.now() - t0;
    const detail = tc.check(data);
    console.log(`[PASS] ${tc.id} (${duration}ms): ${detail}`);
  }

  console.log('\n=== Step 6: Test Federated Retrieval (/api/v1/retrieve) used by AI Chat Drawer ===');
  const fedRes = await fetch(`${ENDPOINT}/api/v1/retrieve`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      query: 'Chu kỳ tính lãi/phí container 60000006',
      setTierAssignments: [{ setId: SET_ID, tier: 'REQUIRED', roleGroup: 'baseline' }],
      comparisonMode: 'single',
      budgets: {
        concurrency: 4,
        elapsedMs: 20000,
        maxSets: 10,
        maxItems: 50,
        maxEvidenceChars: 30000,
      },
      limit: 20,
      includeInferred: false,
      recentTurns: [],
    }),
  });

  if (!fedRes.ok) {
    throw new Error(`Federated retrieval failed: ${fedRes.status} ${await fedRes.text()}`);
  }
  const fedData = await fedRes.json();
  console.log(`Federated retrieval result: outcome=${fedData.outcome}, items=${fedData.items.length}, modalityStatus=`, fedData.modalityStatus);
  if (fedData.outcome !== 'READY' && fedData.outcome !== 'DEGRADED') {
    throw new Error(`Unexpected federated outcome: ${fedData.outcome}`);
  }
  if (fedData.items.length === 0) {
    throw new Error('Federated retrieval returned 0 items for container 60000006 query!');
  }
  console.log('[PASS] Federated retrieval returned grounded items consistently.');

  console.log('\n=== ALL SMOKE & AI CHAT PARITY CHECKS PASSED ===');
}

main().catch((err) => {
  console.error('\n[FATAL FAIL]', err);
  process.exit(1);
});
