import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SshConfig } from '../../../types/ssh';
import { Button, Checkbox, Input, Modal, Tabs, Tooltip, Tag } from 'antd';
import {
  CloseOutlined,
  FileOutlined,
  FilterOutlined,
  PushpinOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { grepRemoteRef } from '../../../services/gitRemoteService';
import { confineRepoPath, getRemoteFileContent, searchRemoteTree } from '../../../services/gitRemoteTreeService';
import { cancelRemoteCall, getSshConfigById, getSshSecret } from '../../../services/sshService';
import { useLayoutStore } from '../../store/layoutStore';
import { buildGrepOptions, matchesMask } from './query';
import { hitsToMatchRows, matchRanges, type MatchRow } from './parsing';
import { CodePreview, FolderPreview, ResultRow } from './parts';
import { FIND_DEBOUNCE_MS, FIND_STATUS_COPY, FindSession, type FindState, type RemoteQuery } from './session';
import { FIND_CONTROL_LABELS, FIND_DIALOG_TITLE, useFindStore } from './store';
import { VirtualizedList } from '../../virtual/VirtualizedList';
import './find.css';

/** Preview byte cap (D-10); a larger or binary file shows truthful copy + open-full-file. */
const PREVIEW_BYTE_CAP = 256 * 1024;
function looksBinary(text: string): boolean {
  // NUL byte or a high ratio of non-printable control characters.
  if (text.includes('\0')) return true;
  const sample = text.slice(0, 2048);
  if (!sample) return false;
  let controls = 0;
  for (let i = 0; i < sample.length; i += 1) {
    const c = sample.charCodeAt(i);
    if (c < 9 || (c > 13 && c < 32)) controls += 1;
  }
  return controls / sample.length > 0.1;
}

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

export function FindInRemoteFiles(props: FindInRemoteFilesProps) {
  const open = useFindStore((s) => s.open);
  const pinned = useFindStore((s) => s.pinned);
  const seed = useFindStore((s) => s.seed);
  const closeFind = useFindStore((s) => s.closeFind);
  const togglePinned = useFindStore((s) => s.togglePinned);
  const openTab = useLayoutStore((s) => s.openTab);
  const setPendingRevealTarget = useLayoutStore((s) => s.setPendingRevealTarget);

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
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewUnavailable, setPreviewUnavailable] = useState(false);
  const [treeRows, setTreeRows] = useState<MatchRow[]>([]);

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
          await cancelRemoteCall(callId);
        },
        nextRequestId: () => `find-${crypto.randomUUID()}`,
      },
      (next) => setState(next)
    );
  }, [seedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // WR-03: tear down in-flight SSH work when the dialog closes or the target (seed) changes.
  // A `useMemo` keyed on seedKey builds a NEW session on reseed, so also cancel the PREVIOUS one;
  // otherwise its late response commits old config/repo/branch results into the reopened dialog.
  const prevSessionRef = useRef<FindSession | null>(null);
  useEffect(() => {
    const previous = prevSessionRef.current;
    prevSessionRef.current = session;
    if (previous && previous !== session) previous.cancel();
    if (!open) session.cancel();
  }, [open, session]);

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
  // WR-08: an empty content pattern cancels in-flight work and resets session state so results
  // from the previous pattern cannot linger on screen — mirrors the Files/Folders empty guard.
  useEffect(() => {
    if (!open || mode !== 'content') return;
    if (!remoteQuery.pattern) {
      session.reset();
      return;
    }
    session.invalidate();
    const timer = setTimeout(() => {
      void session.search(remoteQuery);
    }, FIND_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [open, mode, remoteQuery, session]);

  // Files/Folders modes: filter the cached ls-tree client-side by query + mask (D-05/D-09).
  // The query text never reaches git — no grep, no command construction in these modes.
  useEffect(() => {
    const needle = remoteQuery.pattern.trim();
    // WR-04: an empty needle fetches nothing (searchRemoteTree returns [] immediately); do not
    // dispatch a pointless remote call — show the prompt in the results pane instead.
    if (!open || mode === 'content' || !needle) {
      setTreeRows([]);
      return;
    }
    let cancelled = false;
    // Directory scope uses the same confinement as plan 01; a throwing path refuses the whole
    // filter rather than silently widening the subtree.
    const confinedDir = remoteQuery.directory ? confineRepoPath(remoteQuery.directory) : '';
    void (async () => {
      try {
        const config = configId ? await getSshConfigById(configId) : null;
        if (!config) return;
        configRef.current = config;
        const entries = await searchRemoteTree(config, repoPath, branch, needle);
        if (cancelled) return;
        const wanted = mode === 'folders' ? 'folder' : 'file';
        const filtered = entries.filter((entry) =>
          entry.type === wanted &&
          entry.name.toLowerCase().includes(needle.toLowerCase()) &&
          matchesMask(entry.path, remoteQuery.mask) &&
          (!confinedDir || entry.path.startsWith(confinedDir + '/'))
        );
        setTreeRows(filtered.map((entry) => ({
          path: entry.path,
          line: 0,
          text: entry.path,
          ...(entry.size !== undefined ? { count: entry.size } : {}),
          ranges: matchRanges(entry.path, needle, {
            literal: true,
            matchCase: remoteQuery.matchCase,
            words: remoteQuery.words,
          }),
        })));
      } catch {
        if (!cancelled) setTreeRows([]);
      }
    })();
    return () => { cancelled = true; };
  }, [open, mode, remoteQuery.pattern, remoteQuery.mask, remoteQuery.directory, repoPath, branch, configId]);

  // Single mapping point: committed hits → display rows with ranges from hit.text (D-06).
  const contentRows: MatchRow[] = useMemo(
    () => hitsToMatchRows(state.hits, remoteQuery.pattern, {
      literal: !remoteQuery.regex,
      matchCase: remoteQuery.matchCase,
      words: remoteQuery.words,
    }),
    [state.hits, remoteQuery.pattern, remoteQuery.regex, remoteQuery.matchCase, remoteQuery.words]
  );
  const rows: MatchRow[] = mode === 'content' ? contentRows : treeRows;
  const activeRow = rows[activeIndex];
  useEffect(() => {
    setActiveIndex((i) => Math.min(i, Math.max(0, rows.length - 1)));
  }, [rows.length]);

  // Preview follows the active row immediately (D-07). Fetch bound at 256 KB (D-10).
  useEffect(() => {
    if (mode !== 'content') return;
    if (!activeRow || !configRef.current) {
      setPreviewContent(null);
      setPreviewUnavailable(false);
      return;
    }
    let cancelled = false;
    setPreviewContent(null);
    setPreviewUnavailable(false);
    void (async () => {
      try {
        const content = await getRemoteFileContent(
          configRef.current!, repoPath, branch, activeRow.path,
          (await getSshSecret(configRef.current!.id)) ?? undefined
        );
        if (cancelled) return;
        if (new TextEncoder().encode(content).length > PREVIEW_BYTE_CAP || looksBinary(content)) {
          setPreviewUnavailable(true);
          return;
        }
        setPreviewContent(content);
      } catch {
        if (!cancelled) setPreviewUnavailable(true);
      }
    })();
    return () => { cancelled = true; };
  }, [activeRow?.path, mode, repoPath, branch]);

  const openRow = useCallback(
    (index: number, secondary: boolean) => {
      const row = rows[index];
      if (!row || !configId) return;
      if (mode === 'folders') {
        // Folders-mode reveal: set the one-shot target consumed by RemoteGitExplorer. An
        // explicit onReveal prop (if a host supplies one) takes precedence over the default.
        // No new reveal transport, no new store field (D-11/D-12).
        if (props.onReveal) {
          props.onReveal(row.path);
        } else {
          setPendingRevealTarget({
            configId,
            repoPath,
            branch,
            filePath: row.path,
          });
        }
        return;
      }
      const suffix = secondary ? `-side-${Date.now()}` : '';
      openTab({
        id: `remote:${row.path}${suffix}`,
        title: row.path.split('/').pop() || row.path,
        viewType: 'remote_file',
        closable: true,
        params: {
          config: configRef.current ?? { id: configId, name: '', host: '', port: 22, username: '', authType: 'agent', createdAt: '', updatedAt: '' },
          repoPath,
          branch,
          filePath: row.path,
          // One-shot line only for content hits; a Files row opens with no line highlight.
          ...(mode === 'content' && row.line >= 1 ? { initialLine: row.line } : {}),
        },
      });
    },
    [rows, configId, repoPath, branch, openTab, mode, props, setPendingRevealTarget]
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
          {state.status === 'searching' ? (
            <Tooltip title={FIND_CONTROL_LABELS.stop}>
              <Button
                type="text"
                aria-label={FIND_CONTROL_LABELS.stop}
                icon={<StopOutlined />}
                onClick={() => session.cancel()}
              />
            </Tooltip>
          ) : null}
          <Tooltip title={FIND_CONTROL_LABELS.fileMask}>
            <Button
              type="text"
              aria-label={FIND_CONTROL_LABELS.fileMask}
              aria-controls="find-file-mask"
              icon={<FilterOutlined />}
              onClick={() => document.getElementById('find-file-mask')?.focus()}
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
            id="find-file-mask"
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
          <div className="find-axis" role="group" aria-label="Find mode">
            <span className="find-axis-label">Mode</span>
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
          </div>
          <div className="find-axis" role="group" aria-label="Search scope">
            <span className="find-axis-label">Scope</span>
            <Tabs
              size="small"
              activeKey={scope}
              onChange={(key) => setScope(key as Scope)}
              items={[
                { key: 'whole-ref', label: 'Toàn bộ nhánh' },
                { key: 'directory', label: 'Trong thư mục' },
              ]}
            />
          </div>
          <span
            className="find-scopeval"
            data-testid="find-seed"
            data-config-id={configId ?? ''}
            data-repo-path={repoPath}
            data-branch={branch}
          >
            {repoPath && branch ? `${repoPath} / ${branch}` : 'No active remote target'}
          </span>
        </div>

        <div className="find-split">
          <div className="find-results-pane">
            <VirtualizedList
              items={rows}
              className="find-results"
              aria-label="Search results"
              estimateSize={() => 24}
              height="100%"
              style={{ flex: '1 1 0', minHeight: 0 }}
              scrollToIndex={activeIndex}
              renderItem={(row, index) => (
                <div
                  data-testid={`find-result-row-${index}`}
                  onMouseDown={() => setActiveIndex(index)}
                >
                  <ResultRow
                    text={row.text}
                    ranges={row.ranges}
                    path={row.path}
                    line={row.line}
                    active={index === activeIndex}
                    count={row.count}
                    variant={mode === 'folders' ? 'folders' : mode === 'files' ? 'files' : 'content'}
                    onSelect={() => setActiveIndex(index)}
                    onOpen={() => openRow(index, false)}
                  />
                </div>
              )}
            />
            {mode !== 'content' && !remoteQuery.pattern ? (
              <div className="find-empty" data-testid="find-empty-prompt">
                {FIND_STATUS_COPY.emptyPrompt}
              </div>
            ) : null}
            {state.status === 'done' && rows.length === 0 ? (
              <div className="find-empty" data-testid="find-empty">
                <strong>{FIND_STATUS_COPY.emptyHeading}</strong>
                <div>{FIND_STATUS_COPY.emptyBody(remoteQuery.pattern, repoPath, branch)}</div>
              </div>
            ) : null}
            {state.truncated ? <Tag variant="filled">{FIND_STATUS_COPY.truncated}</Tag> : null}
          </div>
          <div className="find-handle" aria-hidden="true" />
          <div className="find-preview">
            <div className="find-pane-head">
              <FileOutlined aria-hidden="true" />
              <span>{activeRow?.path ?? ''}</span>
            </div>
            <div className="find-preview-body">
              {mode !== 'content' ? <FolderPreview entries={rows.map((r) => r.path)} /> : null}
              {mode === 'content' && previewUnavailable ? (
                <div className="find-preview-notice">
                  <span>{FIND_STATUS_COPY.previewUnavailable}</span>
                  <Button
                    size="small"
                    onClick={() => {
                      if (!activeRow || !configId) return;
                      openTab({
                        id: `remote:${activeRow.path}`,
                        title: activeRow.path.split('/').pop() || activeRow.path,
                        viewType: 'remote_file',
                        closable: true,
                        params: {
                          config: configRef.current ?? { id: configId, name: '', host: '', port: 22, username: '', authType: 'agent', createdAt: '', updatedAt: '' },
                          repoPath, branch, filePath: activeRow.path,
                        },
                      });
                    }}
                  >{FIND_STATUS_COPY.openFullFile}</Button>
                </div>
              ) : null}
              {mode === 'content' && previewContent !== null ? (
                <CodePreview
                  content={previewContent}
                  pattern={remoteQuery.pattern}
                  options={{ literal: !remoteQuery.regex, matchCase: remoteQuery.matchCase, words: remoteQuery.words }}
                  activeLine={activeRow?.line ?? 1}
                />
              ) : null}
            </div>
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
