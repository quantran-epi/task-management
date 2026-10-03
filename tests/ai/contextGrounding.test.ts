import { describe, it, expect, vi } from 'vitest';
import {
  serializeTaskContext,
  serializeProjectContext,
  serializeMilestoneContext,
  buildItemContextPrompt,
  MAX_CONTEXT_CHAR_LIMIT,
} from '../../src/services/ai/contextGrounding';
import type { Task, Project, Milestone, Note, NoteAttachment } from '../../src/types/models';

describe('contextGrounding', () => {
  const mockTask: Task = {
    id: 'task-123',
    projectId: 'proj-1',
    milestoneId: 'ms-1',
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

  const mockProject: Project = {
    id: 'proj-1',
    name: 'Core Banking Auth Revamp',
    description: 'Project to overhaul authentication flows across retail banking',
    status: 'In Progress',
    deadline: '2026-12-31',
    jiraEpicKey: 'EPIC-90',
    opsOwners: ['Duc Quan'],
    businessAnalysts: ['Alice BA'],
    documentLinks: ['https://confluence.bank.local/arch-spec'],
    notes: 'Project level strategic roadmap notes.',
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-15T00:00:00Z',
  };

  const mockMilestone: Milestone = {
    id: 'ms-1',
    projectId: 'proj-1',
    name: 'Milestone 1: Backend Security',
    description: 'Tokens, session limits, and rate limiting',
    status: 'In Progress',
    deadline: '2026-11-01',
    opsOwners: ['Duc Quan'],
    businessAnalysts: ['Alice BA'],
    notes: 'Milestone security requirements.',
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

  describe('serializeProjectContext', () => {
    it('produces structured XML <item_context type="project"> with project metadata', () => {
      const xml = serializeProjectContext(mockProject);
      expect(xml).toContain('<item_context type="project" id="proj-1">');
      expect(xml).toContain('</item_context>');
      expect(xml).toContain('Core Banking Auth Revamp');
      expect(xml).toContain('- **Status:** In Progress');
      expect(xml).toContain('- **Jira Epic:** EPIC-90');
      expect(xml).toContain('- **Deadline:** 2026-12-31');
    });
  });

  describe('serializeMilestoneContext', () => {
    it('produces structured XML <item_context type="milestone"> with milestone metadata', () => {
      const xml = serializeMilestoneContext(mockMilestone);
      expect(xml).toContain('<item_context type="milestone" id="ms-1">');
      expect(xml).toContain('</item_context>');
      expect(xml).toContain('Milestone 1: Backend Security');
      expect(xml).toContain('- **Status:** In Progress');
      expect(xml).toContain('- **Deadline:** 2026-11-01');
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

    it('serializes child milestones and child tasks when grounding a project', async () => {
      const mockDb: any = {
        notes: { where: () => ({ equals: () => ({ filter: () => ({ toArray: async () => [] }) }) }) },
        noteAttachments: { where: () => ({ equals: () => ({ toArray: async () => [] }) }) },
        milestones: {
          where: () => ({
            equals: () => ({
              toArray: async () => [mockMilestone],
            }),
          }),
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
        entityType: 'project',
        item: mockProject,
        db: mockDb,
      });

      expect(prompt).toContain('### Milestones (1)');
      expect(prompt).toContain('Milestone 1: Backend Security');
      expect(prompt).toContain('### Tasks (1 total, 1 open)');
      expect(prompt).toContain('Implement OAuth Token Refresh');
      expect(prompt).toContain('[Jira: CORE-104]');
    });
  });

  describe('buildGlobalContextPrompt', () => {
    it('summarizes active projects and tasks across workspace', async () => {
      const { buildGlobalContextPrompt } = await import('../../src/services/ai/contextGrounding');
      const mockDb: any = {
        projects: { toArray: async () => [mockProject] },
        tasks: { toArray: async () => [mockTask] },
      };

      const prompt = await buildGlobalContextPrompt(mockDb);
      expect(prompt).toContain('<global_context>');
      expect(prompt).toContain('Projects:** 1 total (1 active)');
      expect(prompt).toContain('Tasks:** 1 total (1 open)');
      expect(prompt).toContain('Core Banking Auth Revamp');
      expect(prompt).toContain('</global_context>');
    });
  });
});
