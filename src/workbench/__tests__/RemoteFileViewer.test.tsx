import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RemoteFileViewer } from '../editor/RemoteFileViewer';
import { AntdThemeAdapter } from '../AntdThemeAdapter';
import * as gitRemoteTreeService from '../../services/gitRemoteTreeService';
import * as sshService from '../../services/sshService';
import * as diagramSaveBridge from '../../services/diagramSaveBridge';
import type { SshConfig } from '../../types/ssh';

const mockConfig: SshConfig = {
  id: 'ssh-1',
  name: 'Dev Server',
  host: '192.168.1.100',
  port: 22,
  username: 'dev',
  authType: 'key_file',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const sampleCode = `// Sample TypeScript File
export function add(a: number, b: number): number {
  return a + b;
}
`;

const sampleMermaidFile = `# System Architecture
\`\`\`mermaid
flowchart TD
  Client --> API
\`\`\`
`;

describe('RemoteFileViewer Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(sshService, 'getSshSecret').mockResolvedValue('secret-123');
    vi.spyOn(gitRemoteTreeService, 'getRemoteFileContent').mockResolvedValue(sampleCode);
    // jsdom does not implement scrollIntoView; stub it so the highlight effect is observable.
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('renders file header with file path, branch, and Read-Only badge', async () => {
    render(
      <AntdThemeAdapter>
        <RemoteFileViewer
          config={mockConfig}
          repoPath="/home/dev/my-repo"
          branch="feature/test"
          filePath="src/math.ts"
          size={1024}
        />
      </AntdThemeAdapter>
    );

    expect(screen.getByTestId('remote-file-path').textContent).toBe('src/math.ts');
    expect(screen.getByText('feature/test')).toBeDefined();
    expect(screen.getByTestId('readonly-badge')).toBeDefined();
    expect(screen.getByText('1 KB')).toBeDefined();

    await waitFor(() => {
      expect(gitRemoteTreeService.getRemoteFileContent).toHaveBeenCalledWith(
        mockConfig,
        '/home/dev/my-repo',
        'feature/test',
        'src/math.ts',
        'secret-123'
      );
    });

    // Code container and line numbers should be rendered
    await waitFor(() => {
      expect(screen.getByTestId('code-container')).toBeDefined();
      expect(screen.getByTestId('line-numbers-gutter')).toBeDefined();
      expect(screen.getByTestId('code-container').textContent).toContain(
        'export function add(a: number, b: number): number {'
      );
    });
  });

  it('displays 2MB limit warning and loads only when override button is clicked', async () => {
    const largeSize = 3 * 1024 * 1024; // 3MB > 2MB

    render(
      <AntdThemeAdapter>
        <RemoteFileViewer
          config={mockConfig}
          repoPath="/home/dev/my-repo"
          branch="main"
          filePath="bundle.min.js"
          size={largeSize}
        />
      </AntdThemeAdapter>
    );

    // Initial state: safety warning displayed, content fetch deferred
    expect(screen.getByText('File exceeds 2MB read-only preview limit')).toBeDefined();
    expect(gitRemoteTreeService.getRemoteFileContent).not.toHaveBeenCalled();
    expect(screen.queryByTestId('code-container')).toBeNull();

    // Click "Load anyway"
    const loadBtn = screen.getByTestId('load-anyway-btn');
    fireEvent.click(loadBtn);

    // Content should now be fetched and displayed
    await waitFor(() => {
      expect(gitRemoteTreeService.getRemoteFileContent).toHaveBeenCalledWith(
        mockConfig,
        '/home/dev/my-repo',
        'main',
        'bundle.min.js',
        'secret-123'
      );
      expect(screen.getByTestId('code-container')).toBeDefined();
    });
  });

  it('detects Mermaid diagram in file and saves to Diagram Studio', async () => {
    vi.spyOn(gitRemoteTreeService, 'getRemoteFileContent').mockResolvedValue(sampleMermaidFile);
    const saveSpy = vi.spyOn(diagramSaveBridge, 'saveDiagramToStudio').mockResolvedValue({
      id: 'note-doc-1',
      type: 'diagram',
      title: 'architecture.md Diagram 1',
      body: 'flowchart TD\n  Client --> API',
      tags: ['diagram'],
      isPinned: false,
      createdAt: '',
      updatedAt: '',
    });
    const openSpy = vi.spyOn(diagramSaveBridge, 'openDiagramInStudio').mockImplementation(() => {});

    render(
      <AntdThemeAdapter>
        <RemoteFileViewer
          config={mockConfig}
          repoPath="/home/dev/my-repo"
          branch="main"
          filePath="docs/architecture.md"
          size={500}
        />
      </AntdThemeAdapter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('save-diagram-studio-btn')).toBeInTheDocument();
    });

    const saveBtn = screen.getByTestId('save-diagram-studio-btn');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(saveSpy).toHaveBeenCalledWith(
        'architecture.md Diagram 1',
        'flowchart TD\n  Client --> API',
        ['remote-file', 'architecture.md'],
        undefined
      );
      expect(openSpy).toHaveBeenCalledWith('note-doc-1');
    });
  });

  it('highlights and scrolls to initialLine, ignores out-of-range, and leaves no stale highlight without it', async () => {
    const { unmount } = render(
      <AntdThemeAdapter>
        <RemoteFileViewer
          config={mockConfig}
          repoPath="/home/dev/my-repo"
          branch="main"
          filePath="src/math.ts"
          initialLine={2}
        />
      </AntdThemeAdapter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('initial-line-highlight')).toBeDefined();
    });
    expect(screen.getByTestId('initial-line-highlight').getAttribute('data-line-number')).toBe('2');
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    // Readonly markers stay byte-stable with the line feature enabled.
    expect(screen.getByTestId('readonly-badge')).toBeDefined();
    expect(screen.getByTestId('code-container')).toBeDefined();
    expect(screen.getByTestId('line-numbers-gutter')).toBeDefined();
    unmount();

    // Out-of-range line is ignored gracefully (no crash, no highlight).
    vi.mocked(Element.prototype.scrollIntoView).mockClear();
    const oor = render(
      <AntdThemeAdapter>
        <RemoteFileViewer
          config={mockConfig}
          repoPath="/home/dev/my-repo"
          branch="main"
          filePath="src/math.ts"
          initialLine={999}
        />
      </AntdThemeAdapter>
    );
    await waitFor(() => {
      expect(screen.getByTestId('code-container')).toBeDefined();
    });
    expect(screen.queryByTestId('initial-line-highlight')).toBeNull();
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
    oor.unmount();

    // Plain reopen with no initialLine: no stale highlight.
    const plain = render(
      <AntdThemeAdapter>
        <RemoteFileViewer
          config={mockConfig}
          repoPath="/home/dev/my-repo"
          branch="main"
          filePath="src/math.ts"
        />
      </AntdThemeAdapter>
    );
    await waitFor(() => {
      expect(screen.getByTestId('code-container')).toBeDefined();
    });
    expect(screen.queryByTestId('initial-line-highlight')).toBeNull();
    plain.unmount();
  });
});
