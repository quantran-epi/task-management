import { describe, it, expect, vi } from 'vitest';
import {
  serializeTaskContext,
  serializeChangeRequestContext,
  serializeSystemContext,
  buildItemContextPrompt,
  MAX_CONTEXT_CHAR_LIMIT,
} from '../../src/services/ai/contextGrounding';
import type { Task, ChangeRequest, System, Note, NoteAttachment } from '../../src/types/models';

describe('contextGrounding', () => {
  const mockTask: Task = {
    id: 'task-123',
    crId: 'cr-1',
    systemId: 'sys-1',
    name: 'Implement OAuth Token Refresh',
    description: 'Support automatic token refreshing on 401',
    status: 'In Progress',
    priority: 'High',
    progress: 45,
    estimateMinutes: 240,
    workType: 'code',
    jiraKey: 'CORE-104',
    opsOwners: ['Duc Quan'],
    businessAnalysts: ['Alice BA'],
    deadline: '2026-10-15',
    notes: 'Initial implementation notes for auth token refresh.',
    checklist: [
      { id: 'c1', text: 'Define refresh endpoint', done: true },
      { id: 'c2', text: 'Add token expiry interceptor', done: false },
    ],
    documentLinks: [
      'https://example.com/api-docs',
      '/local/workspace/auth.ts',
      '/local/workspace/logo.png',
    ],
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-02T00:00:00Z',
  };

  const mockChangeRequest: ChangeRequest = {
    id: 'cr-1',
    code: 'CR-2026-001',
    name: 'Core Banking Auth Revamp',
    type: 'NEW_FEATURE',
    status: 'In Progress',
    description: 'Change request to overhaul authentication flows across retail banking',
    deadline: '2026-12-31',
    jiraEpicKey: 'EPIC-90',
    targets: [{ systemId: 'sys-1', featureBranch: 'feature/CR-2026-001' }],
    opsOwners: ['Duc Quan'],
    businessAnalysts: ['Alice BA'],
    documentLinks: ['https://confluence.bank.local/arch-spec'],
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-15T00:00:00Z',
  };

  const mockSystem: System = {
    id: 'sys-1',
    code: 'BACKEND_SEC',
    name: 'Backend Security',
    type: 'SERVICE',
    parentId: null,
    description: 'Tokens, session limits, and rate limiting',
    remoteRepoPath: '/srv/repos/backend-security',
    createdAt: '2026-09-10T00:00:00Z',
    updatedAt: '2026-09-20T00:00:00Z',
  };

  describe('serializeTaskContext', () => {
    it('produces structured XML <item_context type="task"> with key fields, checklist, and notes', () => {
      const xml = serializeTaskContext(mockTask);
      expect(xml).toContain('<item_context type="task" id="task-123">');
      expect(xml).toContain('</item_context>');
      expect(xml).toContain('Implement OAuth Token Refresh');
      expect(xml).toContain('- **Status:** In Progress');
      expect(xml).toContain('- **Priority:** High');
      expect(xml).toContain('- **Jira:** CORE-104');
      expect(xml).toContain('- **Work Type:** code');
      expect(xml).toContain('- **Ops Owners:** Duc Quan');
      expect(xml).toContain('- **Business Analysts:** Alice BA');
      expect(xml).toContain('- **Deadline:** 2026-10-15');
      expect(xml).toContain('- **Estimate:** 240m (4h)');
      expect(xml).toContain('[x] Define refresh endpoint');
      expect(xml).toContain('[ ] Add token expiry interceptor');
      expect(xml).toContain('Initial implementation notes for auth token refresh.');
    });
  });

  describe('serializeChangeRequestContext', () => {
    it('produces structured XML <item_context type="cr"> with CR metadata', () => {
      const xml = serializeChangeRequestContext(mockChangeRequest);
      expect(xml).toContain('<item_context type="cr" id="cr-1">');
      expect(xml).toContain('</item_context>');
      expect(xml).toContain('CR-2026-001');
      expect(xml).toContain('Core Banking Auth Revamp');
      expect(xml).toContain('- **Type:** NEW_FEATURE');
      expect(xml).toContain('- **Status:** In Progress');
      expect(xml).toContain('- **Jira Epic:** EPIC-90');
      expect(xml).toContain('- **Deadline:** 2026-12-31');
    });
  });

  describe('serializeSystemContext', () => {
    it('produces structured XML <item_context type="system"> with system metadata', () => {
      const xml = serializeSystemContext(mockSystem);
      expect(xml).toContain('<item_context type="system" id="sys-1">');
      expect(xml).toContain('</item_context>');
      expect(xml).toContain('BACKEND_SEC');
      expect(xml).toContain('Backend Security');
      expect(xml).toContain('- **Type:** SERVICE');
      expect(xml).toContain('- **Remote Repo Path:** /srv/repos/backend-security');
    });
  });

  describe('buildItemContextPrompt', () => {
    it('queries attached sticky notes and appends note bodies and screenshot captions', async () => {
      const mockNotes: Note[] = [
        {
          id: 'note-1',
          entityType: 'task',
          entityId: 'task-123',
          title: 'Investigation Finding',
          body: 'Refresh token expires in 14 days, rotation required.',
          isPinned: true,
          createdAt: '2026-10-02T10:00:00Z',
          updatedAt: '2026-10-02T10:00:00Z',
        },
      ];

      const mockAttachments: NoteAttachment[] = [
        {
          id: 'att-1',
          noteId: 'note-1',
          fileName: 'error_trace.png',
          mimeType: 'image/png',
          sizeBytes: 1024,
          data: new Blob(),
          caption: 'Screenshot of 401 response header',
          createdAt: '2026-10-02T10:05:00Z',
        },
      ];

      const mockDb: any = {
        notes: {
          where: () => ({
            equals: () => ({
              filter: () => ({
                toArray: async () => mockNotes,
              }),
            }),
          }),
        },
        noteAttachments: {
          where: () => ({
            equals: () => ({
              toArray: async () => mockAttachments,
            }),
          }),
        },
      };

      const prompt = await buildItemContextPrompt({
        entityType: 'task',
        item: mockTask,
        db: mockDb,
      });

      expect(prompt).toContain('<item_context type="task" id="task-123">');
      expect(prompt).toContain('### Sticky Notes');
      expect(prompt).toContain('Investigation Finding');
      expect(prompt).toContain('Refresh token expires in 14 days, rotation required.');
      expect(prompt).toContain('[Attachment: error_trace.png - Caption: Screenshot of 401 response header]');
    });

    it('embeds external web URLs as reference metadata without remote web scraping per D-12', async () => {
      const mockDb: any = {
        notes: {
          where: () => ({
            equals: () => ({
              filter: () => ({
                toArray: async () => [],
              }),
            }),
          }),
        },
        noteAttachments: {
          where: () => ({
            equals: () => ({
              toArray: async () => [],
            }),
          }),
        },
      };

      const prompt = await buildItemContextPrompt({
        entityType: 'task',
        item: mockTask,
        db: mockDb,
      });

      expect(prompt).toContain('### Document & External Links');
      expect(prompt).toContain('External URL: https://example.com/api-docs');
    });

    it('ingests local text file content up to 2,000 lines when Tauri invoke is available per D-11', async () => {
      const mockDb: any = {
        notes: {
          where: () => ({
            equals: () => ({
              filter: () => ({
                toArray: async () => [],
              }),
            }),
          }),
        },
        noteAttachments: {
          where: () => ({
            equals: () => ({
              toArray: async () => [],
            }),
          }),
        },
      };

      const mockFileRead = vi.fn().mockImplementation(async (filePath: string) => {
        if (filePath.endsWith('auth.ts')) {
          return 'export function refreshToken() {\n  return "token";\n}';
        }
        return null;
      });

      const prompt = await buildItemContextPrompt({
        entityType: 'task',
        item: mockTask,
        db: mockDb,
        fileReader: mockFileRead,
      });

      expect(prompt).toContain('/local/workspace/auth.ts');
      expect(prompt).toContain('export function refreshToken()');
      expect(prompt).toContain('/local/workspace/logo.png'); // binary file - metadata only
      expect(prompt).toContain('[Binary / non-text file]');
    });

    it('strictly clamps entire prompt to 12,000 characters maximum per D-10 and T-13.2-06', async () => {
      const longNoteBody = 'A'.repeat(15000);
      const mockNotes: Note[] = [
        {
          id: 'note-giant',
          entityType: 'task',
          entityId: 'task-123',
          body: longNoteBody,
          isPinned: false,
          createdAt: '2026-10-02T10:00:00Z',
          updatedAt: '2026-10-02T10:00:00Z',
        },
      ];

      const mockDb: any = {
        notes: {
          where: () => ({
            equals: () => ({
              filter: () => ({
                toArray: async () => mockNotes,
              }),
            }),
          }),
        },
        noteAttachments: {
          where: () => ({
            equals: () => ({
              toArray: async () => [],
            }),
          }),
        },
      };

      const prompt = await buildItemContextPrompt({
        entityType: 'task',
        item: mockTask,
        db: mockDb,
      });

      expect(prompt.length).toBeLessThanOrEqual(MAX_CONTEXT_CHAR_LIMIT);
      expect(prompt).toContain('... [Truncated at 12,000 character limit]');
      expect(prompt.endsWith('</item_context>')).toBe(true);
    });

    it('respects custom charLimit when provided in options', async () => {
      const longNoteBody = 'B'.repeat(10000);
      const mockNotes: Note[] = [
        {
          id: 'note-custom-limit',
          entityType: 'task',
          entityId: 'task-123',
          body: longNoteBody,
          isPinned: false,
          createdAt: '2026-10-02T10:00:00Z',
          updatedAt: '2026-10-02T10:00:00Z',
        },
      ];

      const mockDb: any = {
        notes: {
          where: () => ({
            equals: () => ({
              filter: () => ({
                toArray: async () => mockNotes,
              }),
            }),
          }),
        },
        noteAttachments: {
          where: () => ({
            equals: () => ({
              toArray: async () => [],
            }),
          }),
        },
      };

      const customLimit = 5000;
      const prompt = await buildItemContextPrompt({
        entityType: 'task',
        item: mockTask,
        db: mockDb,
        charLimit: customLimit,
      });

      expect(prompt.length).toBeLessThanOrEqual(customLimit);
      expect(prompt).toContain('... [Truncated at 5,000 character limit]');
      expect(prompt.endsWith('</item_context>')).toBe(true);
    });

    it('serializes target subsystems and child tasks when grounding a CR', async () => {
      const mockDb: any = {
        notes: { where: () => ({ equals: () => ({ filter: () => ({ toArray: async () => [] }) }) }) },
        noteAttachments: { where: () => ({ equals: () => ({ toArray: async () => [] }) }) },
        systems: {
          toArray: async () => [mockSystem],
        },
        tasks: {
          where: () => ({
            equals: () => ({
              toArray: async () => [mockTask],
            }),
          }),
        },
      };

      const prompt = await buildItemContextPrompt({
        entityType: 'cr',
        item: mockChangeRequest,
        db: mockDb,
      });

      expect(prompt).toContain('### Target Subsystems (1)');
      expect(prompt).toContain('Backend Security');
      expect(prompt).toContain('### Tasks (1 total, 1 open)');
      expect(prompt).toContain('Implement OAuth Token Refresh');
      expect(prompt).toContain('[Jira: CORE-104]');
    });
  });

  describe('buildGlobalContextPrompt', () => {
    it('summarizes active change requests and tasks across workspace', async () => {
      const { buildGlobalContextPrompt } = await import('../../src/services/ai/contextGrounding');
      const mockDb: any = {
        changeRequests: { toArray: async () => [mockChangeRequest] },
        tasks: { toArray: async () => [mockTask] },
      };

      const prompt = await buildGlobalContextPrompt(mockDb);
      expect(prompt).toContain('<global_context>');
      expect(prompt).toContain('Change Requests:** 1 total (1 active)');
      expect(prompt).toContain('Tasks:** 1 total (1 open)');
      expect(prompt).toContain('Core Banking Auth Revamp');
      expect(prompt).toContain('</global_context>');
    });
  });

  describe('serializeDocumentContext', () => {
    it('formats document metadata and snippet into structured XML <item_context type="document">', async () => {
      const { serializeDocumentContext } = await import('../../src/services/ai/contextGrounding');
      const mockDoc: Note = {
        id: 'doc-456',
        type: 'document',
        title: 'API Authentication Standard',
        tags: ['security', 'oauth'],
        body: '# API Auth Standard\nAll internal microservices must validate JWT bearer tokens issued by Auth0.',
        isPinned: false,
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
      };

      const xml = serializeDocumentContext(mockDoc, 'All internal microservices must validate JWT bearer tokens');
      expect(xml).toContain('<item_context type="document" id="doc-456">');
      expect(xml).toContain('## Document: API Authentication Standard');
      expect(xml).toContain('- **Tags:** security, oauth');
      expect(xml).toContain('### Relevant Content');
      expect(xml).toContain('All internal microservices must validate JWT bearer tokens');
      expect(xml).toContain('</item_context>');
    });
  });
});
