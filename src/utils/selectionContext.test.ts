import { describe, it, expect, vi } from 'vitest';
import {
  getDomContextFromNode,
  resolveEntityHierarchy,
  formatSelectionMentionPrompt,
  type SelectionContextPayload,
} from './selectionContext';
import {
  extractRemoteSelectionAnchor,
  remoteAnchorToPayload,
  type RemoteSelectionAnchor,
} from '../components/ai/RemoteSelectionAnchor';

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

  it('resolves hierarchy and eager full context text for task and CR correctly', async () => {
    const fakeDb = {
      tasks: {
        get: vi.fn().mockResolvedValue({
          id: 'task-1',
          crId: 'cr-1',
          systemId: 'sys-1',
          name: 'Implement OAuth',
          description: 'OAuth2 with PKCE flow',
          status: 'In Progress',
          priority: 'High',
          progress: 50,
          estimateMinutes: 120,
          checklist: [{ id: 'c1', text: 'Define routes', done: true }],
        }),
      },
      changeRequests: {
        get: vi.fn().mockResolvedValue({
          id: 'cr-1',
          code: 'CR-AUTH-01',
          name: 'Identity Service',
          description: 'Single Sign-On platform',
          status: 'In Progress',
          type: 'NEW_FEATURE',
          targets: [{ systemId: 'sys-1' }],
        }),
      },
      systems: {
        get: vi.fn().mockResolvedValue({
          id: 'sys-1',
          code: 'AUTH-SVC',
          name: 'Auth Service',
          parentId: null,
          type: 'SERVICE',
        }),
      },
    } as any;

    const hierarchy = await resolveEntityHierarchy('task', 'task-1', fakeDb);
    expect(hierarchy.targetType).toBe('task');
    expect(hierarchy.targetTitle).toBe('Implement OAuth');
    expect(hierarchy.parentCr?.name).toBe('Identity Service');
    expect(hierarchy.hierarchyPath).toContain('CR "CR-AUTH-01" > Subsystem "AUTH-SVC" > Tác vụ "Implement OAuth"');

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

  describe('remote selection anchor (Phase 47 D-11)', () => {
    const TARGET_UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

    function buildViewerDom(): { container: HTMLElement; lineEls: HTMLElement[] } {
      const container = document.createElement('div');
      container.setAttribute('data-testid', 'code-container');
      container.setAttribute('data-ai-context-type', 'remote');
      container.setAttribute('data-ai-context-id', TARGET_UUID);
      container.setAttribute('data-remote-target-uuid', TARGET_UUID);
      container.setAttribute('data-remote-ssh-config-id', 'ssh-prod');
      container.setAttribute('data-remote-repo-path', '/srv/repo');
      container.setAttribute('data-remote-branch', 'feature/x');
      container.setAttribute('data-remote-path', 'src/service.ts');
      const codeLines = document.createElement('div');
      const lineEls: HTMLElement[] = [];
      ['line one', 'const answer = 42;', 'line three'].forEach((text, idx) => {
        const line = document.createElement('div');
        line.setAttribute('data-remote-path', 'src/service.ts');
        line.setAttribute('data-remote-line', String(idx + 1));
        line.setAttribute('data-ai-context-type', 'remote');
        line.setAttribute('data-ai-context-id', TARGET_UUID);
        line.textContent = text;
        codeLines.appendChild(line);
        lineEls.push(line);
      });
      container.appendChild(codeLines);
      document.body.appendChild(container);
      return { container, lineEls };
    }

    it('extracts a structured remote anchor with target/path/startLine/endLine/text', () => {
      const { container, lineEls } = buildViewerDom();
      const range = document.createRange();
      range.setStart(lineEls[1]!.firstChild!, 0);
      range.setEnd(lineEls[1]!.firstChild!, 18);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);

      const anchor = extractRemoteSelectionAnchor(selection, container);
      expect(anchor).not.toBeNull();
      expect(anchor!.targetUuid).toBe(TARGET_UUID);
      expect(anchor!.sshConfigId).toBe('ssh-prod');
      expect(anchor!.repoPath).toBe('/srv/repo');
      expect(anchor!.branch).toBe('feature/x');
      expect(anchor!.relativeFilePath).toBe('src/service.ts');
      expect(anchor!.startLine).toBe(2);
      expect(anchor!.endLine).toBeGreaterThanOrEqual(anchor!.startLine);
      expect(anchor!.selectedText).toContain('const answer');
      selection.removeAllRanges();
      document.body.removeChild(container);
    });

    it('orders backward multi-line selections into start/end line (WR-02)', () => {
      const { container, lineEls } = buildViewerDom();
      const fakeSelection = {
        isCollapsed: false,
        rangeCount: 1,
        anchorNode: lineEls[2]!.firstChild!,
        focusNode: lineEls[0]!.firstChild!,
        toString: () => 'line one\nconst answer = 42;\nline three',
      } as unknown as Selection;

      const anchor = extractRemoteSelectionAnchor(fakeSelection, container);
      expect(anchor?.startLine).toBe(1);
      expect(anchor?.endLine).toBe(3);
    });

    it('formats a remote mention with path:line and never resolves a fake doc', async () => {
      const anchor: RemoteSelectionAnchor = {
        targetUuid: TARGET_UUID,
        sshConfigId: 'ssh-prod',
        repoPath: '/srv/repo',
        branch: 'feature/x',
        relativeFilePath: 'src/service.ts',
        startLine: 2,
        endLine: 4,
        selectedText: 'const answer = 42;',
      };
      const payload = remoteAnchorToPayload(anchor);
      expect(payload.targetType).toBe('remote');
      expect(payload.targetId).toBe(TARGET_UUID);
      expect(payload.hierarchyPath).toContain('src/service.ts:2-4');

      const notesGet = vi.fn().mockResolvedValue(undefined);
      const fakeDb = { notes: { get: notesGet } } as any;
      const resolved = await resolveEntityHierarchy(payload.targetType, payload.targetId, fakeDb, payload.remote);
      // Remote hierarchy is resolved from the anchor itself, never via notes.get().
      expect(resolved.targetType).toBe('remote');
      expect(notesGet).not.toHaveBeenCalled();

      const prompt = formatSelectionMentionPrompt(payload, 'Giải thích');
      expect(prompt).toContain('src/service.ts:2-4');
      expect(prompt).toContain('> const answer = 42;');
      expect(prompt).toContain('Giải thích');
    });
  });
});
