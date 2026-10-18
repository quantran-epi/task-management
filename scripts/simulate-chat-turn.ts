import fs from 'node:fs';
import path from 'node:path';
import { packEvidence } from '../src/services/ai/evidencePack';
import {
  buildSystemPrompt,
  normalizeRawGroundedOutput,
} from '../src/services/ai/groundedSynthesis';
import { GroundedAnswerJsonSchema } from '../src/services/ai/groundedAnswerSchemas';
import type { FederatedRetrievalResponse } from '../src/services/knowledge/retrievalProtocol';

async function runSimulation() {
  const query = 'process nào xử lý phân bổ khoản thanh toán thẻ tín dụng';
  const knowledgeServerUrl = 'http://127.0.0.1:3001/api/v1/retrieve';
  const token = 'local-dev-knowledge-token';

  console.log('=== BƯỚC 1: FRONTEND GỌI KNOWLEDGE SERVER (/api/v1/retrieve) ===');
  const setTierAssignments = [
    { setId: 'd6dc9334-5802-49ac-a1a7-b058931b1825', tier: 'REQUIRED', roleGroup: 'baseline' },
    { setId: '2fc3b8af-4b75-4c12-90cb-8854dfa87094', tier: 'REQUIRED', roleGroup: 'baseline' },
  ];

  const retrieveRequestBody = {
    query,
    setTierAssignments,
    comparisonMode: null,
    budgets: {
      concurrency: 2,
      elapsedMs: 20000,
      maxSets: 5,
      maxItems: 20,
      maxEvidenceChars: 15000,
    },
    limit: 20,
    includeInferred: true,
    recentTurns: [],
  };

  const retrieveResponseRaw = await fetch(knowledgeServerUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'http://localhost:5173',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(retrieveRequestBody),
  });

  if (!retrieveResponseRaw.ok) {
    throw new Error(`Retrieve HTTP error: ${retrieveResponseRaw.status}`);
  }

  const serverResponse = (await retrieveResponseRaw.json()) as FederatedRetrievalResponse;
  console.log(`-> Nhận được ${serverResponse.items.length} items. Outcome: ${serverResponse.outcome}`);
  console.log(`-> Modality status:`, serverResponse.modalityStatus);
  console.log(`-> Diagnostics:`, serverResponse.diagnostics);

  console.log('\n=== BƯỚC 2: FRONTEND ĐÓNG GÓI BẰNG CHỨNG (packEvidence) ===');
  const serverPack = packEvidence({
    authority: 'server',
    serverResponse,
  });

  const allowedCitationIds = Object.keys(serverPack.citations);
  const allowedPathIds = Object.keys(serverPack.paths);
  console.log(`-> Sinh ra ${allowedCitationIds.length} citations:`, allowedCitationIds);
  console.log(`-> Sinh ra ${allowedPathIds.length} paths:`, allowedPathIds);

  console.log('\n=== BƯỚC 3: FRONTEND DỰNG SYSTEM & USER PROMPT LÊN LLM ===');
  const sampleCitationId = allowedCitationIds[0] || 'S1';
  const targetLanguage = 'vi';
  const promptVersion = '2026.10.1';

  const systemPrompt = buildSystemPrompt(targetLanguage, promptVersion, sampleCitationId);
  const userPayload = {
    query,
    conversation_history: undefined,
    speculation_requested: false,
    evidence: serverPack.promptEvidence,
    allowedCitationIds,
    allowedPathIds,
    conflicts: serverPack.conflicts,
    responseLanguage: targetLanguage,
  };
  const userContent = JSON.stringify(userPayload, null, 2);

  const llmRequestBody = {
    model: 'gpt-4o', // Model default trong TaskMate config
    temperature: 0,
    max_tokens: 1800,
    stream: false,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'taskmate_grounded_answer_v2',
        strict: true,
        schema: GroundedAnswerJsonSchema as Record<string, unknown>,
      },
    },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
  };

  const sampleOutputDir = path.resolve('sample_ai_chat_turn');
  if (!fs.existsSync(sampleOutputDir)) {
    fs.mkdirSync(sampleOutputDir, { recursive: true });
  }

  // 1. Lưu Request/Response của Knowledge Retrieval
  fs.writeFileSync(
    path.join(sampleOutputDir, '01_retrieve_request.json'),
    JSON.stringify(retrieveRequestBody, null, 2),
    'utf-8'
  );
  fs.writeFileSync(
    path.join(sampleOutputDir, '02_retrieve_response.json'),
    JSON.stringify(serverResponse, null, 2),
    'utf-8'
  );

  // 2. Lưu Evidence Pack đã đóng gói
  fs.writeFileSync(
    path.join(sampleOutputDir, '03_evidence_pack.json'),
    JSON.stringify(serverPack, null, 2),
    'utf-8'
  );

  // 3. Lưu toàn bộ Payload sẽ gửi lên LLM
  fs.writeFileSync(
    path.join(sampleOutputDir, '04_llm_request_payload.json'),
    JSON.stringify(llmRequestBody, null, 2),
    'utf-8'
  );

  console.log(`\n-> Đã lưu các bước 01 - 04 vào thư mục: ${sampleOutputDir}`);

  // Thử kiểm tra xem có LLM Endpoint nào sống không (ví dụ OpenAI hay 9router)
  const endpoint = process.env.NINEROUTER_ENDPOINT || 'http://localhost:20128';
  const apiKey = process.env.NINEROUTER_API_KEY || process.env.OPENAI_API_KEY || '';

  console.log(`\n=== BƯỚC 4: GỌI LLM (Endpoint: ${endpoint}) ===`);
  try {
    const llmRes = await fetch(`${endpoint.replace(/\/+$/, '')}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify(llmRequestBody),
    });

    if (llmRes.ok) {
      const llmData = await llmRes.json();
      console.log('-> Đã nhận phản hồi thực từ LLM!');
      fs.writeFileSync(
        path.join(sampleOutputDir, '05_llm_raw_response.json'),
        JSON.stringify(llmData, null, 2),
        'utf-8'
      );
      const rawText = llmData?.choices?.[0]?.message?.content;
      if (rawText) {
        const parsed = JSON.parse(rawText);
        const normalized = normalizeRawGroundedOutput(
          parsed,
          allowedCitationIds,
          allowedPathIds,
          serverPack.promptEvidence
        );
        fs.writeFileSync(
          path.join(sampleOutputDir, '06_final_grounded_answer.json'),
          JSON.stringify(normalized, null, 2),
          'utf-8'
        );
        console.log('\n[KẾT QUẢ CUỐI CÙNG HIỂN THỊ TRÊN UI]:');
        console.log((normalized as any).conclusion);
      }
    } else {
      console.log(`-> LLM endpoint trả lỗi HTTP ${llmRes.status} (Chưa bật 9router hoặc thiếu API Key).`);
    }
  } catch (err: any) {
    console.log(`-> Không thể kết nối tới LLM Gateway (${endpoint}): ${err.message}`);
  }
}

runSimulation().catch(console.error);
