import { useState, useEffect, useRef } from 'react';
import { Tag, Button, Alert, Spin, Tooltip, useAntdToken, useMessage } from '../../components/ui';
import { FileTextOutlined, BranchesOutlined, CopyOutlined, CheckOutlined, WarningOutlined, ReloadOutlined, LockOutlined, ApartmentOutlined, FolderViewOutlined } from '../../components/ui/icon';
import type { SshConfig } from '../../types/ssh';
import { getRemoteFileContent } from '../../services/gitRemoteTreeService';
import { getSshSecret } from '../../services/sshService';
import { extractMermaidBlocks, saveDiagramToStudio, openDiagramInStudio } from '../../services/diagramSaveBridge';
import { DiffLineCodeRenderer } from '../../components/common/DiffSyntaxHighlighter';
import { deriveRemoteTargetUuid } from '../../utils/remoteTarget';
import { useAIChat } from '../../context/AIChatContext';
import { useLayoutStore } from '../store/layoutStore';

export interface RemoteFileViewerProps {
  config?: SshConfig;
  repoPath?: string;
  branch?: string;
  filePath?: string;
  size?: number;
  /** One-shot 1-based line to highlight and scroll to (search hit / citation). */
  initialLine?: number;
  db?: any;
}

const TWO_MB = 2 * 1024 * 1024;

function formatBytes(bytes?: number): string {
  if (bytes === undefined || bytes === null || Number.isNaN(bytes)) return '';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const formatted = parseFloat((bytes / Math.pow(k, i)).toFixed(1));
  return `${formatted} ${sizes[i]}`;
}

export function RemoteFileViewer({
  config,
  repoPath = '',
  branch = 'main',
  filePath = '',
  size,
  initialLine,
  db,
}: RemoteFileViewerProps) {
  const message = useMessage();
  const { token } = useAntdToken();
  const { registerActiveItem } = useAIChat();
  const isDark = token.colorBgBase === '#141414' || token.colorTextBase?.includes('255');

  // Phase 47 D-08 (Pitfall 5): opening/selecting this remote file auto-activates the target's
  // remote scope WITHOUT overriding a manual scope choice. registerActiveItem pushes onto the
  // AIChatContext stack, and activeScope = customScope ?? registeredTop ?? global, so a user's
  // explicit setCustomScope still wins. We never call setCustomScope here. The id is the same
  // derived target UUID the scope picker and drawer use, so all three agree on one identity.
  const targetUuid = config?.id && repoPath.trim()
    ? deriveRemoteTargetUuid(config.id, repoPath.trim(), branch)
    : undefined;
  useEffect(() => {
    if (!targetUuid || !config?.id) return undefined;
    const title = `${config.id} · ${repoPath.trim() || '/'} · ${branch || '-'}`;
    return registerActiveItem({ type: 'remote', id: targetUuid, title });
  }, [targetUuid, config?.id, repoPath, branch, registerActiveItem]);

  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [overrideLargeFile, setOverrideLargeFile] = useState<boolean>(false);
  const [savingDiagram, setSavingDiagram] = useState<boolean>(false);

  const isTooLarge = size !== undefined && size > TWO_MB && !overrideLargeFile;
  const mermaidBlocks = content ? extractMermaidBlocks(content) : [];
  const hasMermaid = mermaidBlocks.length > 0;

  const loadContent = async () => {
    if (!config || !repoPath.trim() || !filePath.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const secret = await getSshSecret(config.id);
      const text = await getRemoteFileContent(
        config,
        repoPath.trim(),
        branch,
        filePath.trim(),
        secret ?? undefined
      );
      setContent(text);
    } catch (err: any) {
      setError(err?.message || `Failed to fetch content for ${filePath}`);
      setContent(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isTooLarge) {
      setContent(null);
      return;
    }
    loadContent();
  }, [config?.id, repoPath, branch, filePath, overrideLargeFile, isTooLarge]);

  const handleCopyContent = async () => {
    if (content === null) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      message.success('Copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      message.error('Failed to copy');
    }
  };

  const handleCopyPath = async () => {
    if (!filePath) return;
    try {
      await navigator.clipboard.writeText(filePath);
      message.success('File path copied');
    } catch {
      message.error('Failed to copy path');
    }
  };

  const canReveal = Boolean(config && repoPath.trim() && filePath.trim());
  const handleRevealInExplorer = () => {
    if (!canReveal) return;
    const layout = useLayoutStore.getState();
    layout.setPendingRevealTarget({
      configId: config?.id ?? null,
      repoPath: repoPath.trim(),
      branch,
      filePath: filePath.trim(),
    });
    layout.setToolWindowActive('left', 'remote_explorer');
  };

  // Save extracted Mermaid diagram to Diagram Studio
  const handleSaveDiagram = async () => {
    if (mermaidBlocks.length === 0) return;
    setSavingDiagram(true);
    try {
      const fileName = filePath ? filePath.split('/').pop() || 'Remote' : 'Remote';
      let lastNoteId = '';
      for (let i = 0; i < mermaidBlocks.length; i++) {
        const block = mermaidBlocks[i];
        if (!block) continue;
        const title = `${fileName} Diagram ${i + 1}`;
        const note = await saveDiagramToStudio(title, block, ['remote-file', fileName], db);
        lastNoteId = note.id;
      }
      message.success(`Saved ${mermaidBlocks.length} diagram(s) to Diagram Studio.`);
      if (lastNoteId) {
        openDiagramInStudio(lastNoteId);
      }
    } catch (err: any) {
      message.error(`Failed to save diagram: ${err?.message || 'Unknown error'}`);
    } finally {
      setSavingDiagram(false);
    }
  };

  const lines = content !== null ? content.split('\n') : [];

  // One-shot initial line: only a positive in-range line is highlighted/scrolled; any stale,
  // out-of-range, or fractional value is ignored so an oversized/short file never crashes.
  const highlightLine =
    typeof initialLine === 'number' &&
    Number.isInteger(initialLine) &&
    initialLine >= 1 &&
    initialLine <= lines.length
      ? initialLine
      : null;
  const highlightLineRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (highlightLine === null) return;
    const el = highlightLineRef.current;
    if (!el || typeof el.scrollIntoView !== 'function') return;
    el.scrollIntoView({ block: 'center' });
  }, [highlightLine, content]);

  return (
    <div
      data-testid="remote-file-viewer"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        overflow: 'hidden',
        background: 'var(--bg-island, #ffffff)',
      }}
    >
      {/* Header bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 12px',
          borderBottom: '1px solid var(--border, #e9eaee)',
          background: 'var(--bg-elev, #f7f8fa)',
          gap: 8,
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, overflow: 'hidden' }}>
          <FileTextOutlined style={{ color: 'var(--accent, #3871e1)', fontSize: 14 }} />
          <span
            data-testid="remote-file-path"
            title={filePath}
            style={{
              fontFamily: 'monospace',
              fontSize: 12.5,
              fontWeight: 500,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              color: 'var(--fg-strong, #1f2328)',
            }}
          >
            {filePath || 'No file selected'}
          </span>

          {branch && (
            <Tag
              icon={<BranchesOutlined />}
              style={{
                fontSize: 11,
                lineHeight: '18px',
                borderRadius: 4,
                margin: 0,
              }}
            >
              {branch}
            </Tag>
          )}

          <Tag
            color="default"
            icon={<LockOutlined />}
            data-testid="readonly-badge"
            style={{
              fontSize: 11,
              lineHeight: '18px',
              borderRadius: 4,
              margin: 0,
              fontWeight: 500,
            }}
          >
            Read-Only
          </Tag>

          {size !== undefined && (
            <Tag
              bordered={false}
              style={{
                fontSize: 11,
                lineHeight: '18px',
                margin: 0,
                color: 'var(--fg-muted, #6c707e)',
              }}
            >
              {formatBytes(size)}
            </Tag>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {hasMermaid && (
            <Tooltip title="Save detected Mermaid diagram to Diagram Studio">
              <Button
                size="small"
                type="primary"
                icon={<ApartmentOutlined />}
                onClick={handleSaveDiagram}
                loading={savingDiagram}
                data-testid="save-diagram-studio-btn"
                style={{ fontSize: 11.5, background: '#10b981' }}
              >
                Save Diagram to Studio
              </Button>
            </Tooltip>
          )}

          <Tooltip title="Copy file path">
            <Button size="small" icon={<CopyOutlined />} onClick={handleCopyPath}>
              Copy Path
            </Button>
          </Tooltip>

          <Tooltip title="Copy full content">
            <Button
              size="small"
              icon={copied ? <CheckOutlined style={{ color: '#16a34a' }} /> : <CopyOutlined />}
              onClick={handleCopyContent}
              disabled={content === null}
            >
              Copy Content
            </Button>
          </Tooltip>

          <Tooltip title="Hiện trong Explorer">
            <Button
              size="small"
              icon={<FolderViewOutlined />}
              onClick={handleRevealInExplorer}
              disabled={!canReveal}
              data-testid="reveal-in-explorer-btn"
            >
              Reveal
            </Button>
          </Tooltip>

          <Tooltip title="Reload file">
            <Button
              size="small"
              icon={<ReloadOutlined spin={loading} />}
              onClick={loadContent}
              disabled={loading || isTooLarge}
            />
          </Tooltip>
        </div>
      </div>

      {/* Safety warning banner for files > 2MB */}
      {isTooLarge && (
        <Alert
          type="warning"
          showIcon
          icon={<WarningOutlined />}
          message="File exceeds 2MB read-only preview limit"
          description={
            <div style={{ marginTop: 4 }}>
              <span>
                This file is {formatBytes(size)}. Displaying very large or binary files in the editor may degrade performance.
              </span>
              <div style={{ marginTop: 8 }}>
                <Button
                  size="small"
                  type="primary"
                  onClick={() => setOverrideLargeFile(true)}
                  data-testid="load-anyway-btn"
                >
                  Load anyway
                </Button>
              </div>
            </div>
          }
          style={{ margin: 12 }}
        />
      )}

      {/* Error display */}
      {error && !isTooLarge && (
        <Alert
          type="error"
          message={error}
          showIcon
          style={{ margin: 12, fontSize: 12 }}
        />
      )}

      {/* Code viewer body */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          position: 'relative',
        }}
      >
        {loading ? (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              height: '100%',
              minHeight: 180,
            }}
          >
            <Spin description="Loading remote file..." />
          </div>
        ) : content !== null && !isTooLarge ? (
          <div
            data-testid="code-container"
            data-ai-context-type="remote"
            data-ai-context-id={targetUuid ?? undefined}
            data-remote-target-uuid={targetUuid ?? undefined}
            data-remote-config={config?.id ?? ''}
            data-remote-ssh-config-id={config?.id ?? ''}
            data-remote-repo-path={repoPath}
            data-remote-branch={branch}
            data-remote-path={filePath}
            style={{
              display: 'flex',
              minWidth: '100%',
              fontFamily: "'JetBrains Mono', Consolas, Monaco, monospace",
              fontSize: 12.5,
              lineHeight: '20px',
              padding: '8px 0',
            }}
          >
            {/* Line numbers gutter */}
            <div
              data-testid="line-numbers-gutter"
              style={{
                userSelect: 'none',
                textAlign: 'right',
                paddingRight: 12,
                paddingLeft: 8,
                color: 'var(--fg-muted, #8c8f9c)',
                borderRight: '1px solid var(--border, #e9eaee)',
                background: 'var(--bg-elev, #f7f8fa)',
                flexShrink: 0,
              }}
            >
              {lines.map((_, idx) => (
                <div key={idx} style={{ height: 20 }}>
                  {idx + 1}
                </div>
              ))}
            </div>

            {/* Code lines */}
            <div
              style={{
                flex: 1,
                paddingLeft: 12,
                paddingRight: 16,
                whiteSpace: 'pre',
                wordBreak: 'normal',
                color: 'var(--fg-primary, #1f2328)',
              }}
            >
              {lines.map((line, idx) => {
                const lineNo = idx + 1;
                const isHighlighted = highlightLine === lineNo;
                return (
                  <div
                    key={idx}
                    ref={isHighlighted ? highlightLineRef : undefined}
                    data-testid={isHighlighted ? 'initial-line-highlight' : undefined}
                    data-line-number={lineNo}
                    data-remote-line={lineNo}
                    data-remote-path={filePath}
                    style={{
                      height: 20,
                      ...(isHighlighted
                        ? {
                            background: 'rgba(56, 113, 225, 0.18)',
                            boxShadow: 'inset 2px 0 0 var(--accent, #3871e1)',
                          }
                        : {}),
                    }}
                  >
                    <DiffLineCodeRenderer content={line} isDark={isDark} />
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
