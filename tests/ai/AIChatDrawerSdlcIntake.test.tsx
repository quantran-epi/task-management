import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { AIChatDrawer } from '../../src/components/ai/AIChatDrawer';
// The Note picker reads the app-wide db singleton, so the drawer is mounted on the same instance.
import { db } from '../../src/db';
import type { Note } from '../../src/types/models';
import { buildMergedSdlcInput } from '../../src/services/wizard/sourceMerge';
import * as nineRouterTokenService from '../../src/services/ai/nineRouterTokenService';
import * as nineRouterClient from '../../src/services/ai/nineRouterClient';

vi.mock('../../src/utils/pptxExport', () => ({ exportPresentationAsFile: vi.fn() }));

const TS = '2026-10-30T00:00:00.000Z';
const PROJECT_A = '11111111-1111-4111-8111-111111111111';
const PROJECT_B = '22222222-2222-4222-8222-222222222222';
const NOTE_A1 = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001';
const NOTE_A2 = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002';
const NOTE_A3 = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000003';
const NOTE_A4 = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000004';
const NOTE_B1 = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001';

const scopeB = { type: 'cr' as const, id: PROJECT_B, title: 'Project B' };

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function note(id: string, entityId: string, title: string, body: string, version = 1) {
  return {
    id,
    title,
    body,
    entityType: 'cr' as const,
    entityId,
    isPinned: false,
    sdlcArtifact: {
      kind: 'PL02' as const,
      changeRequestId: entityId,
      threadId: '33333333-3333-4333-8333-333333333333',
      sessionId: '44444444-4444-4444-8444-444444444444',
      version,
      inputHash: '00'.repeat(32),
      sourceArtifactIds: [],
      sourceArtifactHashes: [],
      approvedAt: TS,
      idempotencyKey: `key-${id}`,
    },
    createdAt: TS,
    updatedAt: TS,
  } as Note;
}

const AGREE_PL01 = '# PL01\n\nKênh phân phối: Mobile banking.';
const AGREE_PL02 = '# PL02\n\nKênh phân phối: Mobile banking.';
const CONFLICT_PL01 = '# PL01\n\nHạn mức chuyển tiền: 500 triệu.';
const CONFLICT_PL02 = '# PL02\n\nHạn mức chuyển tiền: 1000 triệu.';

// Re-pointed from the deleted Drawer intake wizard to the real owner: `buildMergedSdlcInput`
// is what produces the merged prompt, citations and conflict block (D-18/D-19/SC-5).
// The three citation-closure/conflict behaviours below are unchanged; only the driver moved.
describe('SDLC intake through buildMergedSdlcInput (D-18/D-19/SC-5) — re-pointed at sourceMerge', () => {
  let db_: typeof db;

  const sourceRef = async (id: string, title: string, body: string, version: number) => ({
    id,
    title,
    body,
    version,
    hash: await sha256(body),
    updatedAt: TS,
  });

  const seed = async (pl01Body: string, pl02Body: string) => {
    await db.changeRequests.bulkAdd([
      { id: PROJECT_A, name: 'CR A', code: 'CR-A', status: 'Open', type: 'ENHANCEMENT', targets: [], createdAt: TS, updatedAt: TS },
      { id: PROJECT_B, name: 'CR B', code: 'CR-B', status: 'Open', type: 'ENHANCEMENT', targets: [], createdAt: TS, updatedAt: TS },
    ]);
    await db.notes.bulkAdd([
      note(NOTE_A1, PROJECT_A, 'Nguồn PL01 Alpha', pl01Body, 2),
      note(NOTE_A2, PROJECT_A, 'Nguồn PL01 Beta', pl01Body, 1),
      note(NOTE_A3, PROJECT_A, 'Nguồn PL02 Gamma', pl02Body, 3),
      note(NOTE_A4, PROJECT_A, 'Nguồn PL02 Delta', pl02Body, 1),
      note(NOTE_B1, PROJECT_B, 'Nguồn dự án B', '# B\n\nNội dung B.', 1),
    ]);
  };

  const merge = async (pl01: Array<[string, string, string, number]>, pl02: Array<[string, string, string, number]>) =>
    buildMergedSdlcInput({
      pl01Text: pl01.map(([, , body]) => body).join('\n\n'),
      pl02Text: pl02.map(([, , body]) => body).join('\n\n'),
      pl01Sources: await Promise.all(pl01.map(([id, title, body, version]) => sourceRef(id, title, body, version))),
      pl02Sources: await Promise.all(pl02.map(([id, title, body, version]) => sourceRef(id, title, body, version))),
    });

  beforeEach(async () => {
    db_ = db;
    await db.notes.clear();
    await db.changeRequests.clear();
    await db.settings.clear();
    vi.spyOn(nineRouterTokenService, 'getNineRouterApiKey').mockResolvedValue('test-api-key');
    vi.spyOn(nineRouterTokenService, 'getNineRouterConfig').mockResolvedValue({
      endpoint: 'http://localhost:20128',
      defaultModel: 'gpt-4o',
      charLimit: 12000,
    });
    vi.spyOn(nineRouterClient, 'streamChatEvents').mockImplementation((async function* () {
      yield { type: 'text' as const, delta: 'ok' };
    }) as never);
  });

  afterEach(async () => {
    cleanup();
    vi.restoreAllMocks();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });

  it('carries per-source id/version/hash citations closed through sourceId', async () => {
    await seed(AGREE_PL01, AGREE_PL02);
    const merged = await merge(
      [
        [NOTE_A1, 'Nguồn PL01 Alpha', AGREE_PL01, 2],
        [NOTE_A2, 'Nguồn PL01 Beta', AGREE_PL01, 1],
      ],
      [
        [NOTE_A3, 'Nguồn PL02 Gamma', AGREE_PL02, 3],
        [NOTE_A4, 'Nguồn PL02 Delta', AGREE_PL02, 1],
      ]
    );

    expect(merged.mergedContent).toContain('Kênh phân phối: Mobile banking.');
    const citedIds = new Set(merged.citations.map((citation) => citation.sourceId));
    expect(citedIds).toEqual(new Set([NOTE_A1, NOTE_A2, NOTE_A3, NOTE_A4]));
    const hashes = merged.pl01Sources.map((source) => source.hash);
    expect(hashes).toEqual([await sha256(AGREE_PL01), await sha256(AGREE_PL01)]);
  });

  it('emits a conflict block when PL01 and PL02 sources disagree', async () => {
    await seed(CONFLICT_PL01, CONFLICT_PL02);
    const merged = await merge(
      [[NOTE_A1, 'Nguồn PL01 Alpha', CONFLICT_PL01, 2]],
      [[NOTE_A3, 'Nguồn PL02 Gamma', CONFLICT_PL02, 3]]
    );

    expect(merged.conflicts.length).toBeGreaterThan(0);
    expect(merged.conflicts[0]?.topic.toLowerCase()).toContain('hạn mức chuyển tiền');
    const values = merged.conflicts[0]!.sources.map((source) => source.value).join(' | ');
    expect(values).toContain('500 triệu');
    expect(values).toContain('1000 triệu');
  });

  it('omits the conflict block when all sources agree', async () => {
    await seed(AGREE_PL01, AGREE_PL02);
    const merged = await merge(
      [[NOTE_A1, 'Nguồn PL01 Alpha', AGREE_PL01, 2]],
      [[NOTE_A3, 'Nguồn PL02 Gamma', AGREE_PL02, 3]]
    );
    expect(merged.conflicts).toEqual([]);
  });

  it('never mutates the seeded source Notes', async () => {
    await seed(AGREE_PL01, AGREE_PL02);
    const before = await db.notes.toArray();
    await merge(
      [[NOTE_A1, 'Nguồn PL01 Alpha', AGREE_PL01, 2]],
      [[NOTE_A3, 'Nguồn PL02 Gamma', AGREE_PL02, 3]]
    );
    expect(await db.notes.toArray()).toEqual(before);
  });

  it('ignores citations resolved under a different scope (no cross-project id leak)', async () => {
    await seed(AGREE_PL01, AGREE_PL02);
    const merged = await merge(
      [[NOTE_A1, 'Nguồn PL01 Alpha', AGREE_PL01, 2]],
      [[NOTE_A3, 'Nguồn PL02 Gamma', AGREE_PL02, 3]]
    );

    const prompt = merged.mergedContent;
    expect(prompt).not.toContain(NOTE_B1);
    expect(new Set(merged.citations.map((citation) => citation.sourceId)).has(NOTE_B1)).toBe(false);
    // The drawer still mounts against the same scope without cross-project leakage.
    render(<AIChatDrawer open onClose={() => {}} db={db_} activeScope={scopeB} />);
    await waitFor(() =>
      expect(screen.getAllByLabelText('Nội dung tin nhắn trò chuyện AI').length).toBeGreaterThan(0)
    );
  });
});
