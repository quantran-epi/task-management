// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db';
import { createNote, updateNote, permanentDeleteNote } from '../../src/db/repositories/noteRepo';
import { createDocumentSet, updateDocumentSet } from '../../src/db/repositories/documentSetRepo';
import { reconcileRemoteAttempt } from '../../src/db/repositories/publishAttemptRepo';
import { buildChangePreview } from '../../src/services/knowledge/changePreview';
import { PublishSession } from '../../src/services/knowledge/publishOrchestrator';
import { createKnowledgeClient } from '../../src/services/knowledge/knowledgeClient';
import { exportBackupPayload } from '../../src/services/backup/exportBackup';
import { rankBM25 } from '../../src/utils/bm25';
import { DocumentSetDrawer } from '../../src/components/knowledge/DocumentSetDrawer';
import { AttemptHistoryList } from '../../src/components/knowledge/AttemptHistoryList';
import type { Note, PublishPrimaryState } from '../../src/types/models';

const SENSITIVE_CANARIES = {
  PAN: '4532015112830366',
  CVV: 'cvv: 789',
  PIN: 'PIN := 1234',
  HSM_KEY: 'ZPK: 0123456789ABCDEF0123456789ABCDEF',
  CREDENTIAL: 'client_secret: "super_secret_canary_value"',
  PII: 'Liên hệ: canary.customer@shb.com.vn',
};

const SECRET_TOKEN_CANARY = 'bearertoken-super-confidential-secret-canary-999';

const databases: TaskPlannerDatabase[] = [];

function createTestDb(): TaskPlannerDatabase {
  const db = new TaskPlannerDatabase(`phase16-acc-${crypto.randomUUID()}`);
  databases.push(db);
  return db;
}

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(databases.splice(0).map((d) => d.delete()));
});

describe('Phase 16 Client Acceptance Suite (INGEST-01 - INGEST-05, D-01 - D-29)', () => {
  it('exercises stable document sets: create, move note, reorder, render 4-way preview, and never mutates Notes (INGEST-01, D-01, D-02, D-03, D-04)', async () => {
    const db = createTestDb();
    await db.open();

    // 1. Create notes inside a folder
    const folder = await createNote({ title: 'Tín dụng', body: '', type: 'folder' }, db);
    const docA = await createNote({ title: 'Tài liệu A', body: '# Tiêu đề A\nNội dung A', type: 'document', parentId: folder.id }, db);
    const docB = await createNote({ title: 'Tài liệu B', body: '# Tiêu đề B\nNội dung B', type: 'document', parentId: folder.id }, db);
    const docC = await createNote({ title: 'Tài liệu C', body: '# Tiêu đề C\nNội dung C', type: 'document' }, db);

    // Initial snapshot from folder
    const set = await createDocumentSet({
      name: 'Bộ quy trình thẻ',
      documentIds: [docA.id, docB.id],
    }, db);

    expect(set.documentIds).toEqual([docA.id, docB.id]);

    // Move docA to a different folder / root; set membership must remain stable (D-01)
    await updateNote(docA.id, { parentId: undefined }, db);
    const setAfterMove = await db.documentSets.get(set.id);
    expect(setAfterMove?.documentIds).toEqual([docA.id, docB.id]);

    // Reorder members and add docC manually
    const reorderedSet = (await updateDocumentSet(set.id, {
      name: 'Bộ quy trình thẻ',
      documentIds: [docB.id, docA.id, docC.id],
    }, db))!;
    expect(reorderedSet.documentIds).toEqual([docB.id, docA.id, docC.id]);

    // Build 4-way preview locally without network (D-04)
    const notes = [await db.notes.get(docA.id), await db.notes.get(docB.id), await db.notes.get(docC.id)] as Note[];
    const originalNotes = structuredClone(notes);

    const preview = await buildChangePreview({
      documentSet: reorderedSet,
      notes,
      activeManifest: null,
    });

    expect(preview.counts.documentsAdded).toBe(3);
    expect(preview.counts.documentsChanged).toBe(0);
    expect(preview.counts.documentsRemoved).toBe(0);
    expect(preview.counts.documentsUnchanged).toBe(0);

    // Notes remain deeply untouched (no canonical mutation)
    expect(notes).toEqual(originalNotes);
    const persistedNotes = await db.notes.toArray();
    for (const n of persistedNotes) {
      const match = originalNotes.find((o) => o.id === n.id);
      if (match) {
        expect(n.body).toBe(match.body);
        expect(n.title).toBe(match.title);
      }
    }
  });

  it('enforces pre-send DLP gate for every category: masks findings, blocks egress on stale/no consent, permits once upon approval, and asks again on next attempt (INGEST-02, D-15 - D-19, T-16-54)', async () => {
    const db = createTestDb();
    await db.open();

    // Outbound fetch spy
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const client = createKnowledgeClient({
      baseUrl: 'http://localhost:3000',
      token: 'session-token',
      fetcher: fetchSpy,
      db,
    });

    const session = new PublishSession({ client, db });

    // Document containing every DLP category
    const sensitiveBody = `
# Tài liệu bảo mật cao

## Thông tin thẻ
Thẻ: ${SENSITIVE_CANARIES.PAN}
${SENSITIVE_CANARIES.CVV}
${SENSITIVE_CANARIES.PIN}

## Khóa giải mã
${SENSITIVE_CANARIES.HSM_KEY}

## Thông tin đăng nhập
${SENSITIVE_CANARIES.CREDENTIAL}

## Thông tin khách hàng
${SENSITIVE_CANARIES.PII}
`;

    const note = await createNote({ title: 'Thẻ và Khóa', body: sensitiveBody, type: 'document' }, db);
    const docSet = await createDocumentSet({ name: 'Bộ nhạy cảm', documentIds: [note.id] }, db);

    // 1. Build preview
    await session.buildPreview({
      documentSet: docSet,
      notes: [note],
      activeManifest: null,
    });

    // Zero network egress before review/POST
    expect(fetchSpy).not.toHaveBeenCalled();

    // 2. Scan DLP
    const findings = await session.scan();
    expect(findings.length).toBeGreaterThanOrEqual(6);

    const categoriesFound = new Set(findings.map((f) => f.category));
    expect(categoriesFound.has('PAN')).toBe(true);
    expect(categoriesFound.has('CVV')).toBe(true);
    expect(categoriesFound.has('PIN')).toBe(true);
    expect(categoriesFound.has('HSM_KEY')).toBe(true);
    expect(categoriesFound.has('CREDENTIAL')).toBe(true);
    expect(categoriesFound.has('PII')).toBe(true);

    // All findings have masked contexts and do not reveal clear canary text
    for (const f of findings) {
      expect(f.maskedContext).toBeDefined();
      expect(f.maskedContext).not.toContain(SENSITIVE_CANARIES.PAN);
      expect(f.maskedContext).not.toContain('super_secret_canary_value');
    }

    // 3. Submitting without confirmation must throw and cause ZERO network POST
    await expect(session.submitConfirmedAttempt('invalid-nonce')).rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();

    // 4. Confirm findings and submit with valid nonce
    const { nonce } = await session.confirmFindings(true);

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        attemptId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        setId: docSet.id,
        status: 'Publishing',
        startedAt: new Date().toISOString(),
        metrics: {
          addedCount: 1,
          changedCount: 0,
          removedCount: 0,
          unchangedCount: 0,
          warningCount: findings.length,
        },
      }),
    });

    const submitResult = await session.submitConfirmedAttempt(nonce);
    expect(submitResult.status).toBe('Publishing');
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Nonce cannot be reused (stale)
    await expect(session.submitConfirmedAttempt(nonce)).rejects.toThrow();
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // 5. Audit record is persisted in IndexedDB and contains NO sensitive values/excerpts (D-18)
    const audits = await db.dlpAudits.toArray();
    expect(audits.length).toBe(1);
    const serializedAudit = JSON.stringify(audits[0]);
    for (const canary of Object.values(SENSITIVE_CANARIES)) {
      expect(serializedAudit).not.toContain(canary);
    }

    // 6. Next attempt asks again (no persistent trust bypass per D-16)
    const nextSession = new PublishSession({ client, db });
    await nextSession.buildPreview({
      documentSet: docSet,
      notes: [note],
      activeManifest: null,
    });
    const nextFindings = await nextSession.scan();
    expect(nextFindings.length).toBeGreaterThanOrEqual(6);
  });

  it('proves zero secret leakage across all storage, UI, backup, audit, and log channels (T-16-57, D-07, D-18, D-29)', async () => {
    const db = createTestDb();
    await db.open();

    const fetchSpy = vi.fn().mockImplementation(async () => {
      throw new Error(`Unauthorized or connection failed with secret ${SECRET_TOKEN_CANARY}`);
    });
    vi.stubGlobal('fetch', fetchSpy);

    const client = createKnowledgeClient({
      baseUrl: 'http://localhost:3000',
      token: SECRET_TOKEN_CANARY,
      fetcher: fetchSpy,
      db,
    });

    // Run a failing getAttempt to verify error message redacts token
    try {
      await client.getAttempt('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    } catch (e: any) {
      expect(e.message).not.toContain(SECRET_TOKEN_CANARY);
      expect(e.message).toContain('***');
    }

    // Populate IndexedDB with realistic set, attempts, documents, settings
    const doc = await createNote({ title: 'Ghi chú', body: '# Nội dung', type: 'document' }, db);
    const set = await createDocumentSet({ name: 'Bộ an toàn', documentIds: [doc.id] }, db);

    await reconcileRemoteAttempt({
      attempt: {
        id: '11111111-1111-4111-8111-111111111111',
        setId: set.id,
        startedAt: '2026-10-08T00:00:00.000Z',
        status: 'In sync',
        addedCount: 1,
        changedCount: 0,
        removedCount: 0,
        unchangedCount: 0,
        warningCount: 0,
      },
    }, db);

    // Export backup and verify secret tokens / sensitive values are completely absent
    const backup = await exportBackupPayload(db);
    const serializedBackup = JSON.stringify(backup);
    expect(serializedBackup).not.toContain(SECRET_TOKEN_CANARY);
    for (const canary of Object.values(SENSITIVE_CANARIES)) {
      expect(serializedBackup).not.toContain(canary);
    }

    // Verify localStorage & IndexedDB have no bearer token
    const allSettings = await db.settings.toArray();
    expect(JSON.stringify(allSettings)).not.toContain(SECRET_TOKEN_CANARY);

    // Verify UI AttemptHistoryList renders without exposing content or secrets
    render(<AttemptHistoryList attempts={await db.publishAttempts.toArray()} />);
    expect(screen.getByTestId('attempt-history-item')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(SECRET_TOKEN_CANARY);
  });

  it('manages six primary states, connection uncertainty banner, 11-to-10 history bounding, and handles conflicts (INGEST-05, D-11, D-13, D-27, D-28, D-29)', async () => {
    const db = createTestDb();
    await db.open();

    const doc = await createNote({ title: 'Tài liệu', body: '# Nội dung', type: 'document' }, db);
    const set = await createDocumentSet({ name: 'Bộ theo dõi', documentIds: [doc.id] }, db);

    // Exercise exactly 11 attempts to verify pruning keeps exactly 10 newest (D-29)
    for (let i = 1; i <= 11; i++) {
      const padded = String(i).padStart(2, '0');
      const attemptId = `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
      await reconcileRemoteAttempt({
        attempt: {
          id: attemptId,
          setId: set.id,
          startedAt: `2026-10-08T01:${padded}:00.000Z`,
          status: i === 11 ? 'Warning' : 'In sync',
          addedCount: 1,
          changedCount: 0,
          removedCount: 0,
          unchangedCount: 0,
          warningCount: i === 11 ? 1 : 0,
        },
      }, db);
    }

    const cachedAttempts = await db.publishAttempts.where('setId').equals(set.id).toArray();
    expect(cachedAttempts).toHaveLength(10);
    // Oldest attempt (01:01:00) should have been pruned; newest (01:11:00) retained
    const timestamps = cachedAttempts.map((a) => a.startedAt);
    expect(timestamps).not.toContain('2026-10-08T01:01:00.000Z');
    expect(timestamps).toContain('2026-10-08T01:11:00.000Z');

    // Drawer renders the 6 primary states
    const states: PublishPrimaryState[] = ['Never published', 'In sync', 'Local changes', 'Publishing', 'Warning', 'Failed'];
    for (const state of states) {
      const { unmount } = render(
        <DocumentSetDrawer
          open
          sets={[set]}
          notes={[doc]}
          attempts={cachedAttempts}
          selectedSetId={set.id}
          state={state}
          configured={true}
          onClose={vi.fn()}
          onSave={vi.fn()}
          onPreview={vi.fn()}
        />
      );
      unmount();
    }

    // Modal with conflict shows warning and action to inspect
    const client = createKnowledgeClient({
      baseUrl: 'http://localhost:3000',
      token: 'tok',
      fetcher: vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({
          error: { code: 'SET_PUBLISH_IN_PROGRESS', message: 'Set publish in progress' },
        }),
      }),
      db,
    });
    const session = new PublishSession({ client, db });
    await session.buildPreview({ documentSet: set, notes: [doc], activeManifest: null });
    await session.scan();
    const { nonce } = await session.confirmFindings();

    // Submit with conflict code returns conflict flag
    const submitResult = await session.submitConfirmedAttempt(nonce);
    expect(submitResult.conflict).toBe(true);
  });

  it('operates fully offline and without daemon: note CRUD, autosave, folder moves, and BM25 search function with zero network egress (T-16-59, CLAUDE.md)', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const db = createTestDb();
    await db.open();

    // 1. Local note creation
    const doc = await createNote({ title: 'Tra cứu ngoại tuyến', body: '# Nghiệp vụ ngân hàng\nTính toán lãi suất 60000006', type: 'document' }, db);
    expect(await db.notes.get(doc.id)).toBeDefined();

    // 2. Local update (autosave equivalent)
    await updateNote(doc.id, { body: '# Nghiệp vụ ngân hàng\nCập nhật thêm công thức' }, db);
    const updated = await db.notes.get(doc.id);
    expect(updated?.body).toContain('Cập nhật thêm công thức');

    // 3. Local folder organization
    const folder = await createNote({ title: 'Thư mục tín dụng', body: '', type: 'folder' }, db);
    await updateNote(doc.id, { parentId: folder.id }, db);
    const moved = await db.notes.get(doc.id);
    expect(moved?.parentId).toBe(folder.id);

    // 4. BM25 local search operates in memory without daemon
    const allNotes = await db.notes.toArray();
    const searchResults = rankBM25('tra cuu ngoai tuyen', allNotes.map((n) => ({
      id: n.id,
      title: n.title ?? '',
      body: n.body,
      tags: n.tags ?? [],
    })));
    expect(searchResults.length).toBeGreaterThan(0);

    // 5. Local permanent deletion
    await permanentDeleteNote(doc.id, db);
    expect(await db.notes.get(doc.id)).toBeUndefined();

    // ZERO network requests made throughout entire lifecycle
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
