import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SshConfig } from '../../../types/ssh';
import { Button, Checkbox, Input, Modal, Tabs, Tooltip, Tag } from 'antd';
import {
  CloseOutlined,
  FileOutlined,
  FilterOutlined,
  PushpinOutlined,
} from '@ant-design/icons';
import { grepRemoteRef } from '../../../services/gitRemoteService';
import { cancelToolCall, getSshConfigById, getSshSecret } from '../../../services/sshService';
import { useLayoutStore } from '../../store/layoutStore';
import { buildGrepOptions } from './query';
import { FIND_DEBOUNCE_MS, FIND_STATUS_COPY, FindSession, type FindState, type RemoteQuery } from './session';
import { FIND_CONTROL_LABELS, FIND_DIALOG_TITLE, useFindStore } from './store';
import './find.css';

/** Plan 03 fills this; declared now so Files/Folders rows do not silently lack a reveal path. */
export interface FindInRemoteFilesProps {
  onReveal?: ((path: string) => void) | undefined;
}

type Mode = RemoteQuery['mode'];
type Scope = RemoteQuery['scope'];

const EMPTY_STATE: FindState = {
  status: 'idle',
  stale: false,
  hits: [],
  error: null,
  truncated: false,
};

export function FindInRemoteFiles(_props: FindInRemoteFilesProps) {
  const open = useFindStore((s) => s.open);
  const pinned = useFindStore((s) => s.pinned);
  const seed = useFindStore((s) => s.seed);
  const closeFind = useFindStore((s) => s.closeFind);
  const togglePinned = useFindStore((s) => s.togglePinned);
  const openTab = useLayoutStore((s) => s.openTab);

  const [pattern, setPattern] = useState('');
  const [mode, setMode] = useState<Mode>('content');
  const [scope, setScope] = useState<Scope>('whole-ref');
  const [directory, setDirectory] = useState('');
  const [mask, setMask] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [words, setWords] = useState(false);
  const [regex, setRegex] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [state, setState] = useState<FindState>(EMPTY_STATE);

  const configId = seed?.configId ?? null;
  const repoPath = seed?.repoPath ?? '';
  const branch = seed?.branch ?? '';
  const seedKey = `${configId ?? ''}|${repoPath}|${branch}`;
  const configRef = useRef<SshConfig | null>(null);

  const session = useMemo(() => {
    return new FindSession(
      {
        // deps.start is the single owner of buildGrepOptions: session.search receives a
        // RemoteQuery; grepRemoteRef receives GrepRemoteRefOptions.
        start: async (callId, query) => {
          const config = configId ? await getSshConfigById(configId) : null;
          if (!config) throw new Error('No active remote target');
          configRef.current = config;
          const secret = await getSshSecret(config.id);
          return grepRemoteRef(
            config,
            repoPath,
            branch,
            buildGrepOptions(query),
            secret ?? undefined,
            callId
          );
        },
        cancel: async (callId) => {
          await cancelToolCall(callId);
        },
        nextRequestId: () => `find-${crypto.randomUUID()}`,
      },
      (next) => setState(next)
    );
  }, [seedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const remoteQuery = useMemo<RemoteQuery>(
    () => ({
      pattern: pattern.trim(),
      mode,
      scope,
      ...(scope === 'directory' ? { directory: directory.trim() } : {}),
      ...(mask.trim() ? { mask: mask.trim() } : {}),
      matchCase,
      words,
      regex,
    }),
    [pattern, mode, scope, directory, mask, matchCase, words, regex]
  );

  // 150 ms debounce (D-08). A query change marks current results stale immediately; the
  // seq-guarded session drops any late response. Files/Folders modes never call grep (Task 3).
  useEffect(() => {
    if (!open || mode !== 'content' || !remoteQuery.pattern) return;
    session.invalidate();
    const timer = setTimeout(() => {
      void session.search(remoteQuery);
    }, FIND_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [open, mode, remoteQuery, session]);

  const rows = state.hits;
  useEffect(() => {
    setActiveIndex((i) => Math.min(i, Math.max(0, rows.length - 1)));
  }, [rows.length]);

  const openRow = useCallback(
    (index: number, secondary: boolean) => {
      const hit = rows[index];
      if (!hit || !configId) return;
      const suffix = secondary ? `-side-${Date.now()}` : '';
      openTab({
        id: `remote:${hit.path}${suffix}`,
        title: hit.path.split('/').pop() || hit.path,
        viewType: 'remote_file',
        closable: true,
        params: {
          config: configRef.current ?? { id: configId, name: '', host: '', port: 22, username: '', authType: 'agent', createdAt: '', updatedAt: '' },
          repoPath,
          branch,
          filePath: hit.path,
          initialLine: hit.line,
        },
      });
    },
    [rows, configId, repoPath, branch, openTab]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) {
          togglePinned();
          return;
        }
        openRow(activeIndex, e.shiftKey);
        return;
      }
      if (e.key === 'Escape') {
        if (pinned) return;
        e.preventDefault();
        closeFind();
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'PageDown') {
        e.preventDefault();
        setActiveIndex((i) => (rows.length ? Math.min(i + 1, rows.length - 1) : 0));
        return;
      }
      if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        setActiveIndex((i) => (rows.length ? Math.max(i - 1, 0) : 0));
      }
    },
    [activeIndex, rows.length, openRow, pinned, closeFind, togglePinned]
  );

  if (!open) return null;

  return (
    <Modal
      open={open}
      title={null}
      footer={null}
      closable={false}
      mask={false}
      width="var(--find-dialog-width)"
      modalRender={(node) => <div className="find-dialog-frame">{node}</div>}
      onCancel={() => { if (!pinned) closeFind(); }}
      destroyOnHidden
    >
      <div className="find-root" onKeyDown={handleKeyDown}>
        <div className="find-drag">
          <span className="find-grip" aria-hidden="true">⠿</span>
          <span className="find-title">{FIND_DIALOG_TITLE}</span>
          <span className="find-status" aria-live="polite">
            {state.status === 'searching' ? FIND_STATUS_COPY.searching : ''}
            {state.stale ? FIND_STATUS_COPY.stale : ''}
            {state.status === 'partial' ? FIND_STATUS_COPY.partial : ''}
            {state.error}
          </span>
          <Tooltip title={FIND_CONTROL_LABELS.fileMask}>
            <Button
              type="text"
              aria-label={FIND_CONTROL_LABELS.fileMask}
              icon={<FilterOutlined />}
            />
          </Tooltip>
          <Tooltip title={pinned ? FIND_CONTROL_LABELS.unpin : FIND_CONTROL_LABELS.pin}>
            <Button
              type="text"
              aria-label={pinned ? FIND_CONTROL_LABELS.unpin : FIND_CONTROL_LABELS.pin}
              aria-pressed={pinned}
              icon={<PushpinOutlined />}
              onClick={togglePinned}
            />
          </Tooltip>
          <Tooltip title={FIND_CONTROL_LABELS.close}>
            <Button
              type="text"
              aria-label={FIND_CONTROL_LABELS.close}
              icon={<CloseOutlined />}
              onClick={closeFind}
            />
          </Tooltip>
        </div>

        <div className="find-fields">
          <Input
            aria-label="Pattern"
            className="find-pattern"
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            allowClear
          />
          <Checkbox aria-label="Match Case" checked={matchCase} onChange={(e) => setMatchCase(e.target.checked)}>Aa</Checkbox>
          <Checkbox aria-label="Words" checked={words} onChange={(e) => setWords(e.target.checked)}>Word</Checkbox>
          <Checkbox aria-label="Regex" checked={regex} onChange={(e) => setRegex(e.target.checked)}>.*</Checkbox>
          <Input
            aria-label="File mask"
            className="find-mask"
            value={mask}
            onChange={(e) => setMask(e.target.value)}
            placeholder="*.ts"
          />
          {scope === 'directory' ? (
            <Input
              aria-label="Directory"
              className="find-directory"
              value={directory}
              onChange={(e) => setDirectory(e.target.value)}
              placeholder="src/main"
            />
          ) : null}
        </div>

        <div className="find-scopes">
          <Tabs
            size="small"
            activeKey={mode}
            onChange={(key) => setMode(key as Mode)}
            items={[
              { key: 'content', label: 'Content' },
              { key: 'files', label: 'Files' },
              { key: 'folders', label: 'Folders' },
            ]}
          />
          <Tabs
            size="small"
            activeKey={scope}
            onChange={(key) => setScope(key as Scope)}
            items={[
              { key: 'whole-ref', label: 'Whole ref' },
              { key: 'directory', label: 'Directory' },
            ]}
          />
          <span className="find-scopeval">
            <span data-testid="find-seed-config">{configId}</span>
            <span data-testid="find-seed-repo">{repoPath}</span>
            <span data-testid="find-seed-branch">{branch}</span>
            {repoPath} / {branch}
          </span>
        </div>

        <div className="find-split">
          <div className="find-results" role="listbox" aria-label="Search results">
            {rows.map((hit, index) => (
              <div
                key={`${hit.path}:${hit.line}:${index}`}
                data-testid={`find-result-row-${index}`}
                className={`find-rrow${index === activeIndex ? ' on' : ''}`}
                role="option"
                aria-selected={index === activeIndex}
                onMouseDown={() => setActiveIndex(index)}
                onDoubleClick={() => openRow(index, false)}
              >
                <span className="find-rcode">{hit.text}</span>
                <span className="find-rfile">{hit.path}:{hit.line}</span>
              </div>
            ))}
            {state.status === 'idle' && rows.length === 0 ? <div className="find-empty">No matches</div> : null}
            {state.truncated ? <Tag variant="filled">{FIND_STATUS_COPY.truncated}</Tag> : null}
          </div>
          <div className="find-handle" aria-hidden="true" />
          <div className="find-preview">
            <div className="find-pane-head">
              <FileOutlined aria-hidden="true" />
              <span>{rows[activeIndex]?.path ?? ''}</span>
            </div>
            <div className="find-preview-body" />
          </div>
        </div>

        <div className="find-footer">
          <span>↑↓ navigate</span>
          <span>Enter open at line</span>
          <span>Esc close</span>
          <span>preview follows selection · 256 KB cap</span>
        </div>
      </div>
    </Modal>
  );
}
