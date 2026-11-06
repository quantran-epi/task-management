import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Button, Tooltip, message, Tag } from 'antd';
import {
  ApartmentOutlined,
  ReloadOutlined,
  ClearOutlined,
  CopyOutlined,
} from '@ant-design/icons';
import '@xterm/xterm/css/xterm.css';
import type { SshConfig } from '../../types/ssh';
import {
  startPtySession,
  writePtyInput,
  resizePty,
  closePtySession,
  subscribePtyData,
  subscribePtyExit,
} from '../../services/sshPtyService';
import { extractMermaidBlocks, saveDiagramToStudio, openDiagramInStudio } from '../../services/diagramSaveBridge';
import type { TaskPlannerDatabase } from '../../db';

export interface RemoteTerminalPanelProps {
  sessionId?: string | undefined;
  config?: SshConfig | undefined;
  repoPath?: string | undefined;
  db?: TaskPlannerDatabase | undefined;
  isActive?: boolean | undefined;
  onSessionReady?: ((sessionId: string) => void) | undefined;
}

export function RemoteTerminalPanel({
  sessionId: propSessionId,
  config,
  repoPath: _repoPath,
  db,
  isActive = true,
  onSessionReady,
}: RemoteTerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const sessionIdRef = useRef<string>('');
  const bufferLogRef = useRef<string>('');
  const lastColsRef = useRef<number>(0);
  const lastRowsRef = useRef<number>(0);

  const configId = config?.id;
  const configRef = useRef(config);
  configRef.current = config;

  const [connected, setConnected] = useState<boolean>(false);
  const [connecting, setConnecting] = useState<boolean>(false);
  const [extracting, setExtracting] = useState<boolean>(false);

  // Initialize and bind terminal session
  const initTerminal = useCallback(async () => {
    if (!containerRef.current) return;

    // Clean previous session if exists
    if (sessionIdRef.current) {
      try {
        await closePtySession(sessionIdRef.current);
      } catch {
        // ignore error on cleanup
      }
    }
    if (termRef.current) {
      termRef.current.dispose();
      termRef.current = null;
    }

    const sessionId = propSessionId || `term-${Date.now()}`;
    sessionIdRef.current = sessionId;
    bufferLogRef.current = '';

    // JetBrains ExpUI dark theme & pixel-perfect native terminal metrics
    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontFamily: "'JetBrains Mono', Menlo, Monaco, 'Courier New', monospace",
      fontSize: 13,
      lineHeight: 1.0,
      letterSpacing: 0,
      macOptionIsMeta: true,
      scrollback: 10000,
      theme: {
        background: '#1e1f22',
        foreground: '#bcbec4',
        cursor: '#3871e1',
        selectionBackground: 'rgba(56, 113, 225, 0.4)',
        black: '#1e1f22',
        red: '#fa6675',
        green: '#57c85f',
        yellow: '#f5c842',
        blue: '#54a0ff',
        magenta: '#d480aa',
        cyan: '#47c2c9',
        white: '#bcbec4',
        brightBlack: '#5f6269',
        brightRed: '#fa6675',
        brightGreen: '#57c85f',
        brightYellow: '#f5c842',
        brightBlue: '#54a0ff',
        brightMagenta: '#d480aa',
        brightCyan: '#47c2c9',
        brightWhite: '#ffffff',
      },
      convertEol: true,
    });

    // Native OS keybindings (Cmd/Ctrl+C copy, Cmd/Ctrl+V paste, Cmd/Ctrl+K clear)
    term.attachCustomKeyEventHandler?.((event) => {
      if (event.type === 'keydown') {
        const isCmdOrCtrl = event.metaKey || event.ctrlKey;
        if (isCmdOrCtrl && event.key.toLowerCase() === 'c' && term.hasSelection()) {
          navigator.clipboard.writeText(term.getSelection());
          return false;
        }
        if (isCmdOrCtrl && event.key.toLowerCase() === 'v') {
          navigator.clipboard.readText().then((text) => {
            if (text) writePtyInput(sessionId, text);
          });
          return false;
        }
        if (isCmdOrCtrl && event.key.toLowerCase() === 'k') {
          term.clear();
          return false;
        }
      }
      return true;
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    try {
      fitAddon.fit();
    } catch {
      // Container may have 0 dimensions initially
    }

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    setConnecting(true);

    try {
      const activeConf = configRef.current;
      if (activeConf) {
        term.write(`\r\n\x1B[34m[SSH PTY]\x1B[0m Connecting to ${activeConf.username}@${activeConf.host}...`);

        await startPtySession({
          sessionId,
          config: activeConf,
          cols: term.cols || 80,
          rows: term.rows || 24,
        });

        // Check if session ID was superseded while connecting
        if (sessionIdRef.current !== sessionId) {
          closePtySession(sessionId).catch(() => {});
          return;
        }

        term.write(`\r\n\x1B[32m[SSH PTY]\x1B[0m Connected.\r\n\r\n`);
        setConnected(true);
        onSessionReady?.(sessionId);
      } else {
        term.write(
          `\r\n\x1B[33m[TaskMate Terminal]\x1B[0m No remote SSH host selected.\r\n` +
          `Select an SSH host and remote repository in the Remote Git Explorer to start headful Claude Code.\r\n\r\n`
        );
        setConnected(false);
      }
    } catch (err: any) {
      if (sessionIdRef.current === sessionId) {
        term.write(`\r\n\x1B[31m[SSH PTY ERROR]\x1B[0m ${err?.message || 'Connection failed'}\r\n`);
        setConnected(false);
      }
    } finally {
      if (sessionIdRef.current === sessionId) {
        setConnecting(false);
      }
    }

    // Pipe user input to backend PTY stdin
    const onDataSub = term.onData((data) => {
      writePtyInput(sessionId, data);
    });

    // Subscribe to stdout/stderr stream from backend
    let unlistenData: (() => void) | undefined;
    subscribePtyData(sessionId, (data) => {
      term.write(data);
      bufferLogRef.current = (bufferLogRef.current + data).slice(-50000); // retain last 50KB for diagram extraction
    }).then((unsub) => {
      unlistenData = unsub;
    });

    // Subscribe to exit event
    let unlistenExit: (() => void) | undefined;
    subscribePtyExit(sessionId, () => {
      term.write('\r\n\x1B[33m[SSH PTY]\x1B[0m Connection closed by remote host.\r\n');
      setConnected(false);
    }).then((unsub) => {
      unlistenExit = unsub;
    });

    // Resize observer with dimension checking
    let resizeTimer: any = null;
    const ro = new ResizeObserver(() => {
      if (!termRef.current || !fitAddonRef.current || !containerRef.current) return;
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        try {
          fitAddonRef.current?.fit();
          const currentCols = termRef.current?.cols;
          const currentRows = termRef.current?.rows;
          if (
            currentCols &&
            currentRows &&
            (currentCols !== lastColsRef.current || currentRows !== lastRowsRef.current)
          ) {
            lastColsRef.current = currentCols;
            lastRowsRef.current = currentRows;
            resizePty(sessionId, currentCols, currentRows);
          }
        } catch {
          // Safe resize fallback
        }
      }, 50);
    });
    ro.observe(containerRef.current);

    return () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      ro.disconnect();
      onDataSub.dispose();
      unlistenData?.();
      unlistenExit?.();
      closePtySession(sessionId).catch(() => {});
    };
  }, [configId, propSessionId, onSessionReady]);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let cancelled = false;

    initTerminal().then((unsub) => {
      if (cancelled) {
        if (typeof unsub === 'function') {
          unsub();
        }
        return;
      }
      if (typeof unsub === 'function') {
        cleanup = unsub;
      }
    });

    return () => {
      cancelled = true;
      cleanup?.();
      if (termRef.current) {
        termRef.current.dispose();
        termRef.current = null;
      }
    };
  }, [initTerminal]);

  useEffect(() => {
    if (isActive && termRef.current && fitAddonRef.current) {
      const timer = setTimeout(() => {
        try {
          fitAddonRef.current?.fit();
          termRef.current?.focus();
        } catch {
          // ignore fit error
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isActive]);

  const handleClear = () => {
    if (termRef.current) {
      termRef.current.clear();
      bufferLogRef.current = '';
    }
  };

  const handleCopyLogs = async () => {
    if (!bufferLogRef.current) {
      message.info('No terminal logs to copy');
      return;
    }
    try {
      await navigator.clipboard.writeText(bufferLogRef.current);
      message.success('Terminal buffer copied');
    } catch {
      message.error('Failed to copy buffer');
    }
  };

  // SDLC-REPO-EXP-05: Extract diagrams from terminal buffer logs
  const handleExtractDiagrams = async () => {
    setExtracting(true);
    try {
      const blocks = extractMermaidBlocks(bufferLogRef.current);
      if (blocks.length === 0) {
        message.info('No Mermaid diagram blocks detected in current terminal session.');
        return;
      }

      let lastNoteId = '';
      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        if (!block) continue;
        const title = `Terminal Diagram ${i + 1} (${new Date().toLocaleTimeString()})`;
        const note = await saveDiagramToStudio(title, block, ['terminal', 'claude-code'], db);
        lastNoteId = note.id;
      }

      message.success(`Saved ${blocks.length} diagram(s) to Diagram Studio.`);
      if (lastNoteId) {
        openDiagramInStudio(lastNoteId);
      }
    } catch (err: any) {
      message.error(`Diagram extraction failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setExtracting(false);
    }
  };

  return (
    <div
      data-testid="remote-terminal-panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        background: '#1e1f22',
        overflow: 'hidden',
      }}
    >
      {/* Terminal Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 8px',
          background: '#2b2d30',
          borderBottom: '1px solid #1e1f22',
          fontSize: 12,
          color: '#bcbec4',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Tag color={connected ? 'green' : connecting ? 'orange' : 'default'} style={{ margin: 0, fontSize: 11 }}>
            {connected ? 'SSH Connected' : connecting ? 'Connecting...' : 'Disconnected'}
          </Tag>
          {config && (
            <span
              style={{
                fontSize: 11.5,
                color: '#8c8f9c',
                fontFamily: 'monospace',
                maxWidth: 320,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {config.username}@{config.host}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Tooltip title="Extract Mermaid diagrams from terminal output into Diagram Studio">
            <Button
              size="small"
              type="primary"
              icon={<ApartmentOutlined />}
              onClick={handleExtractDiagrams}
              loading={extracting}
              data-testid="extract-diagrams-btn"
              style={{ fontSize: 11.5, background: '#3871e1' }}
            >
              Extract Diagrams
            </Button>
          </Tooltip>

          <Tooltip title="Copy Terminal Buffer">
            <Button
              size="small"
              icon={<CopyOutlined style={{ fontSize: 11 }} />}
              onClick={handleCopyLogs}
              style={{ background: 'transparent', color: '#bcbec4', borderColor: '#43454a' }}
            />
          </Tooltip>

          <Tooltip title="Clear Terminal">
            <Button
              size="small"
              icon={<ClearOutlined style={{ fontSize: 11 }} />}
              onClick={handleClear}
              style={{ background: 'transparent', color: '#bcbec4', borderColor: '#43454a' }}
            />
          </Tooltip>

          <Tooltip title="Reconnect Terminal Session">
            <Button
              size="small"
              icon={<ReloadOutlined style={{ fontSize: 11 }} />}
              onClick={initTerminal}
              loading={connecting}
              style={{ background: 'transparent', color: '#bcbec4', borderColor: '#43454a' }}
            />
          </Tooltip>
        </div>
      </div>

      {/* Terminal DOM mounting node */}
      <div
        ref={containerRef}
        data-testid="xterm-container"
        onClick={() => termRef.current?.focus()}
        style={{
          flex: 1,
          width: '100%',
          height: '100%',
          minHeight: 0,
          background: '#1e1f22',
          padding: '4px 6px',
          boxSizing: 'border-box',
          overflow: 'hidden',
          cursor: 'text',
        }}
      />
    </div>
  );
}
export default RemoteTerminalPanel;
