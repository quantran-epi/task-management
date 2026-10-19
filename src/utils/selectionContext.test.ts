import { describe, it, expect, vi } from 'vitest';
import {
  getDomContextFromNode,
  resolveEntityHierarchy,
  formatSelectionMentionPrompt,
  type SelectionContextPayload,
} from './selectionContext';

describe('selectionContext utility', () => {
  it('detects dom context from attribute hierarchy correctly', () => {
    const parent = document.createElement('div');
    parent.setAttribute('data-ai-context-type', 'task');
    parent.setAttribute('data-ai-context-id', 'task-123');

    const child = document.createElement('p');
    child.textContent = 'Sample selected text';
    parent.appendChild(child);

    const context = getDomContextFromNode(child);
    expect(context.entityType).toBe('task');
    expect(context.entityId).toBe('task-123');
  });

  it('falls back to unknown if no context attribute exists', () => {
    const div = document.createElement('div');
    const span = document.createElement('span');
    div.appendChild(span);

    const context = getDomContextFromNode(span);
    expect(context.entityType).toBe('unknown');
    expect(context.entityId).toBeUndefined();
  });

  it('resolves hierarchy and eager full context text for task and project correctly', async () => {
    const fakeDb = {
      tasks: {
        get: vi.fn().mockResolvedValue({
          id: 'task-1',
          name: 'Implement OAuth',
          description: 'OAuth2 with PKCE flow',
          status: 'In Progress',
          priority: 'High',
          progress: 50,
          estimateMinutes: 120,
          checklist: [{ id: 'c1', text: 'Define routes', done: true }],
          projectId: 'proj-1',
        }),
      },
      projects: {
        get: vi.fn().mockResolvedValue({
          id: 'proj-1',
          name: 'Identity Service',
          description: 'Single Sign-On platform',
          status: 'In Progress',
        }),
      },
    } as any;

    const hierarchy = await resolveEntityHierarchy('task', 'task-1', fakeDb);
    expect(hierarchy.targetType).toBe('task');
    expect(hierarchy.targetTitle).toBe('Implement OAuth');
    expect(hierarchy.parentProject?.name).toBe('Identity Service');
    expect(hierarchy.hierarchyPath).toContain('Dự án "Identity Service" > Tác vụ "Implement OAuth"');

    // Verify full eager context serialization
    expect(hierarchy.fullContextText).toBeDefined();
    expect(hierarchy.fullContextText).toContain('Implement OAuth');
    expect(hierarchy.fullContextText).toContain('OAuth2 with PKCE flow');
    expect(hierarchy.fullContextText).toContain('Identity Service');
    expect(hierarchy.fullContextText).toContain('Define routes');
  });

  it('formats mention prompt with quote block and hierarchy path', () => {
    const payload: SelectionContextPayload = {
      targetType: 'doc',
      targetId: 'doc-1',
      targetTitle: 'API Specs',
      hierarchyPath: 'Dự án "Core" > Tài liệu "API Specs"',
      selectedText: 'POST /v1/auth\nContent-Type: application/json',
    };

    const prompt = formatSelectionMentionPrompt(payload, 'Giải thích endpoint này');
    expect(prompt).toContain('[Trích đoạn từ Dự án "Core" > Tài liệu "API Specs"]');
    expect(prompt).toContain('> POST /v1/auth');
    expect(prompt).toContain('> Content-Type: application/json');
    expect(prompt).toContain('Giải thích endpoint này');
  });
});
