import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page, type Route } from '@playwright/test';
import { openAiAssistant, seedV28InBrowser } from './helpers';

const SAMPLES = resolve(process.cwd(), 'sample_ai_chat_turn');
const retrieveSample = JSON.parse(
  readFileSync(resolve(SAMPLES, '02_retrieve_response.json'), 'utf8')
);
const requestSample = JSON.parse(
  readFileSync(resolve(SAMPLES, '01_retrieve_request.json'), 'utf8')
) as { query: string };
const evidencePack = JSON.parse(
  readFileSync(resolve(SAMPLES, '03_evidence_pack.json'), 'utf8')
) as { citations: Record<string, { documentTitle?: string }> };
const finalAnswer = JSON.parse(
  readFileSync(resolve(SAMPLES, '06_final_grounded_answer.json'), 'utf8')
) as { conclusion: string };
const rawLlmSample = JSON.parse(
  readFileSync(resolve(SAMPLES, '05_llm_raw_response.json'), 'utf8')
) as {
  choices: { message: { content: string } }[];
};

const LLM_PATH = '/task-management/__wb';

interface SeenRequests {
  retrieveBodies: unknown[];
  schemaNames: string[];
}

async function configureMocks(page: Page, seen: SeenRequests): Promise<void> {
  await page.route('**/api/v1/retrieve', async (route: Route) => {
    seen.retrieveBodies.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(retrieveSample),
    });
  });
  await page.route('**/__wb/v1/chat/completions', async (route: Route) => {
    const body = route.request().postDataJSON() as {
      response_format?: { json_schema?: { name?: string } };
    };
    const schemaName = body?.response_format?.json_schema?.name ?? 'json_object';
    seen.schemaNames.push(schemaName);
    let content: string;
    if (schemaName === 'taskmate_intent_v1') {
      content = JSON.stringify({
        intent: 'query_knowledge',
        confidence: 0.99,
        entities: ['60000004'],
        language: 'vi',
        needs_clarification: false,
        clarify_question: null,
        speculation_requested: false,
        require_mcp: false,
        target_mcp_servers: [],
      });
    } else if (schemaName === 'probe_test') {
      content = JSON.stringify({ ok: true });
    } else if (schemaName === 'semantic_scope_v1') {
      content = JSON.stringify({
        domain: null,
        environment: null,
        version: null,
        comparisonMode: 'single',
        subqueries: [],
      });
    } else {
      content = JSON.stringify(finalAnswer);
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...rawLlmSample,
        choices: [{ ...rawLlmSample.choices[0]!, message: { role: 'assistant', content } }],
      }),
    });
  });
}

/** Seed settings directly; token is generated in-browser and never written to source/evidence. */
async function seedKnowledgeSettings(page: Page): Promise<void> {
  await page.evaluate(
    async ({ llm }) => {
      const { TaskPlannerDatabase } = await import('/task-management/src/db/index.ts');
      const db = new TaskPlannerDatabase('PersonalTaskPlannerDB');
      const token = `wb-${crypto.randomUUID()}`;
      await db.settings.bulkPut([
        { key: 'knowledge_server_enabled', value: true },
        { key: 'knowledge_server_base_url', value: window.location.origin },
        { key: 'knowledge_server_token', value: token },
        { key: 'ninerouter_endpoint', value: llm },
        { key: 'ninerouter_api_key', value: token },
        { key: 'ninerouter_default_model', value: 'gpt-4o' },
      ]);
      db.close();
    },
    { llm: LLM_PATH }
  );
}

test('grounded chat renders sample answer with citations from real app route mocks', async ({
  page,
}) => {
  const seen: SeenRequests = { retrieveBodies: [], schemaNames: [] };
  await seedV28InBrowser(page);
  await configureMocks(page, seen);
  await seedKnowledgeSettings(page);
  await page.reload();
  await openAiAssistant(page);

  const composer = page.getByRole('textbox', { name: 'Nội dung tin nhắn trò chuyện AI' });
  await composer.fill(requestSample.query);
  await page.getByRole('button', { name: 'Gửi tin nhắn' }).click();

  const bubble = page.locator('[data-testid="grounded-bubble"]').first();
  await expect(bubble).toBeVisible({ timeout: 30_000 });
  await expect(bubble).toContainText('60000004');
  const chips = bubble.locator('.grounded-inline-chip');
  await expect(chips.first()).toBeVisible();
  const chipIds = await chips.evaluateAll((nodes) =>
    nodes.map((node) => (node as HTMLElement).dataset.citationId ?? '')
  );
  expect(chipIds.length).toBeGreaterThan(0);
  expect(Object.keys(evidencePack.citations).length).toBeGreaterThan(0);
  for (const id of chipIds) {
    expect(Object.keys(evidencePack.citations).map((k) => k.toUpperCase())).toContain(id.toUpperCase());
  }
  await expect(bubble).not.toContainText('Không tìm thấy thông tin');
  await expect(bubble).not.toContainText('Lỗi truy xuất');

  expect(seen.retrieveBodies.length).toBeGreaterThan(0);
  const retrieveBody = seen.retrieveBodies[0] as { query?: string };
  expect(retrieveBody.query).toBe(requestSample.query);
  expect(seen.schemaNames).toContain('taskmate_intent_v1');
  expect(seen.schemaNames).toContain('taskmate_grounded_answer_v2');
});
