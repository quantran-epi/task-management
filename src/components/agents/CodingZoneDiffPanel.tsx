import React, { useMemo, useState } from 'react';
import { Modal } from 'antd';
import type { DiffFile, DiffHunk, DiffLine } from '../../types/agent';
import type { WorktreeDescriptor } from '../../types/codingZone';
import { applyHunk, revertHunk } from '../../services/sshWorktreeService';
import { CODE_EDIT_AGENT_NAME } from '../../services/ai/office/teamTools';

/** Phase 48 D-11/D-12/D-14: worktree-local hunk review with truthful failure surfacing. */
export interface CodingZoneDiffPanelProps {
  descriptor: WorktreeDescriptor | undefined;
  filePath: string;
  files: readonly DiffFile[];
  /** Monotonic revision; a changed revision without a matching decision set means stale diff. */
  revision: number;
  hunkStates: Readonly<Record<string, 'pending' | 'accepted' | 'rejected'>>;
  setHunkState: (key: string, state: 'pending' | 'accepted' | 'rejected') => void;
}

export const COPY = {
  stale: 'Diff đã thay đổi từ lần duyệt trước. Vui lòng xem lại các hunk trước khi quyết định.',
  failed: 'Không áp dụng được thay đổi cho hunk này. Thay đổi trong worktree không bị ghi đè; hãy thử lại.',
  confirmTitle: 'Hoàn tác tất cả hunk đã chấp nhận trong worktree?',
  confirmBody: 'Chỉ ảnh hưởng worktree của agent, không đụng nhánh hiện tại.',
  confirmOk: 'Hoàn tác',
  confirmCancel: 'Hủy',
  pending: 'Chờ duyệt',
  accepted: 'Đã chấp nhận',
  rejected: 'Đã từ chối',
} as const;

/** Content hash of the hunk body; combines with path+header+revision into a decision key. */
export function hunkContentHash(hunk: DiffHunk): string {
  let hash = 0;
  for (const line of hunk.lines) {
    for (const char of `${line.type}${line.oldLineNumber ?? ''}${line.newLineNumber ?? ''}${line.content}`) {
      hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
    }
  }
  return String(hash >>> 0);
}

function hunkCounts(hunk: DiffHunk): { adds: number; dels: number } {
  let adds = 0;
  let dels = 0;
  for (const line of hunk.lines) {
    if (line.type === 'add') adds++;
    if (line.type === 'delete') dels++;
  }
  return { adds, dels };
}

function renderLines(lines: readonly DiffLine[], viewMode: 'unified' | 'split', dimmed: 'old' | 'new' | null) {
  if (viewMode === 'unified') {
    return lines.map((line, index) => {
      const type = line.type === 'add' ? 'add' : line.type === 'delete' ? 'del' : 'ctx';
      const dim = (dimmed === 'old' && type === 'del') || (dimmed === 'new' && type === 'add');
      return (
        <div key={index} className={`cz-diff-line ${type}${dim ? ' dimmed' : ''}`} data-testid="cz-diff-line">
          <span className="cz-diff-no">{line.oldLineNumber ?? ''}</span>
          <span className="cz-diff-no">{line.newLineNumber ?? ''}</span>
          <span className="cz-diff-marker">{type === 'add' ? '+' : type === 'del' ? '−' : ' '}</span>
          <span className="cz-diff-text">{line.content}</span>
        </div>
      );
    });
  }
  return lines.map((line, index) => {
    const type = line.type === 'add' ? 'add' : line.type === 'delete' ? 'del' : 'ctx';
    return (
      <div key={index} className="cz-split-line" data-testid="cz-split-line">
        <div className={`cz-split-side ${type === 'del' ? 'is-del' : ''}${dimmed === 'old' && type === 'del' ? ' dimmed' : ''}`}>
          <span className="cz-diff-no">{line.oldLineNumber ?? ''}</span>
          <span className="cz-diff-marker">{type === 'del' ? '−' : ' '}</span>
          <span className="cz-diff-text">{line.type === 'add' ? '' : line.content}</span>
        </div>
        <div className={`cz-split-side ${type === 'add' ? 'is-add' : ''}${dimmed === 'new' && type === 'add' ? ' dimmed' : ''}`}>
          <span className="cz-diff-no">{line.newLineNumber ?? ''}</span>
          <span className="cz-diff-marker">{type === 'add' ? '+' : ' '}</span>
          <span className="cz-diff-text">{line.type === 'delete' ? '' : line.content}</span>
        </div>
      </div>
    );
  });
}

export const CodingZoneDiffPanel: React.FC<CodingZoneDiffPanelProps> = ({
  descriptor,
  filePath,
  files,
  revision,
  hunkStates,
  setHunkState,
}) => {
  const [viewMode, setViewMode] = useState<'unified' | 'split'>('unified');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [seenRevision, setSeenRevision] = useState(revision);

  const file = useMemo(() => files.find((candidate) => candidate.newPath === filePath), [files, filePath]);
  const hunks = file?.hunks ?? [];
  // WR-02: decisions are keyed by CONTENT, not revision. A new diff revision must keep
  // decisions for unchanged hunks (and only mark genuinely changed hunks stale via the
  // content hash), never silently reset every accepted/rejected hunk to pending.
  const keyFor = (hunk: DiffHunk) => `${filePath}::${hunk.header}::${hunkContentHash(hunk)}`;
  const pending = hunks.filter((hunk) => (hunkStates[keyFor(hunk)] ?? 'pending') === 'pending');
  const pendingAdds = pending.reduce((sum, hunk) => sum + hunkCounts(hunk).adds, 0);
  const pendingDels = pending.reduce((sum, hunk) => sum + hunkCounts(hunk).dels, 0);
  const stale = seenRevision !== revision;
  const acceptedCount = hunks.filter((hunk) => (hunkStates[keyFor(hunk)] ?? 'pending') === 'accepted').length;

  const act = async (hunk: DiffHunk, decision: 'accepted' | 'rejected') => {
    if (!descriptor) {
      setError(COPY.failed);
      return;
    }
    const key = keyFor(hunk);
    if ((hunkStates[key] ?? 'pending') === decision) {
      setHunkState(key, 'pending');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      if (decision === 'accepted') await applyHunk(descriptor, filePath, hunk);
      else await revertHunk(descriptor, filePath, hunk);
      setHunkState(key, decision);
      setSeenRevision(revision);
    } catch {
      // D-14: failure never clears an existing decision and never claims success.
      setError(COPY.failed);
    } finally {
      setBusy(false);
    }
  };

  const bulkAccept = async () => {
    setError(null);
    setBusy(true);
    try {
      for (const hunk of pending) {
        if (!descriptor) throw new Error('no descriptor');
        await applyHunk(descriptor, filePath, hunk);
        setHunkState(keyFor(hunk), 'accepted');
      }
      setSeenRevision(revision);
    } catch {
      setError(COPY.failed);
    } finally {
      setBusy(false);
    }
  };

  const bulkRevert = () => {
    Modal.confirm({
      title: COPY.confirmTitle,
      content: COPY.confirmBody,
      okText: COPY.confirmOk,
      cancelText: COPY.confirmCancel,
      onOk: async () => {
        setError(null);
        setBusy(true);
        try {
          for (const hunk of hunks) {
            const decision = hunkStates[keyFor(hunk)] ?? 'pending';
            if (decision !== 'accepted') continue;
            if (!descriptor) throw new Error('no descriptor');
            await revertHunk(descriptor, filePath, hunk);
            setHunkState(keyFor(hunk), 'rejected');
          }
          setSeenRevision(revision);
        } catch {
          setError(COPY.failed);
        } finally {
          setBusy(false);
        }
      },
    });
  };

  return (
    <div className="cz-diff-panel" data-testid="cz-diff-panel">
      <div className="cz-diff-toolbar">
        <div className="cz-segmented" role="group" aria-label="Chế độ hiển thị diff">
          <button type="button" className={viewMode === 'unified' ? 'on' : ''} aria-pressed={viewMode === 'unified'} data-testid="cz-diff-unified" onClick={() => setViewMode('unified')}>Unified</button>
          <button type="button" className={viewMode === 'split' ? 'on' : ''} aria-pressed={viewMode === 'split'} data-testid="cz-diff-split" onClick={() => setViewMode('split')}>Side-by-side</button>
        </div>
        <div className="cz-counters" data-testid="cz-diff-counters">
          <span className="cz-count add">+{pendingAdds}</span>
          <span className="cz-count del">−{pendingDels}</span>
          <span className="cz-count-label">dòng chưa quyết định</span>
        </div>
        <span className="cz-spacer" />
        <button type="button" className="cz-btn tiny" data-testid="cz-accept-all" disabled={pending.length === 0 || busy} onClick={() => void bulkAccept()}>Accept All</button>
        <button type="button" className="cz-btn tiny danger" data-testid="cz-revert-all" disabled={acceptedCount === 0 || busy} onClick={bulkRevert}>Revert All</button>
      </div>
      {stale ? <div className="cz-diff-error" role="alert" data-testid="cz-diff-stale">{COPY.stale}</div> : null}
      {error ? <div className="cz-diff-error" role="alert" data-testid="cz-diff-error">{error}</div> : null}
      <div className="cz-diff-body">
        {hunks.length === 0 ? (
          <div className="cz-center-empty">Chưa có thay đổi trong worktree. Khi agent chỉnh sửa, các file sẽ xuất hiện ở đây.</div>
        ) : hunks.map((hunk, index) => {
          const key = keyFor(hunk);
          const decision = hunkStates[key] ?? 'pending';
          const counts = hunkCounts(hunk);
          return (
            <div key={`${hunk.header}-${index}`} className="cz-hunk" data-state={decision} data-testid="cz-hunk">
              <div className="cz-hunk-head">
                <span className="cz-hunk-hdr">{hunk.header}</span>
                <span className={`cz-hunk-tag tag state-${decision}`} data-testid="cz-hunk-tag">
                  {decision === 'accepted' ? COPY.accepted : decision === 'rejected' ? COPY.rejected : COPY.pending}
                </span>
                <span className="cz-hunk-counts"><span className="cz-count add">+{counts.adds}</span> <span className="cz-count del">−{counts.dels}</span></span>
                <span className="cz-spacer" />
                <button type="button" className="cz-btn tiny" disabled={busy} data-testid="cz-hunk-accept" onClick={() => void act(hunk, 'accepted')}>Accept</button>
                <button type="button" className="cz-btn tiny danger" disabled={busy} data-testid="cz-hunk-reject" onClick={() => void act(hunk, 'rejected')}>Reject</button>
              </div>
              <div className={`cz-hunk-body${decision === 'accepted' ? ' dimmed-old' : ''}${decision === 'rejected' ? ' dimmed-new' : ''}`}>
                {viewMode === 'split' ? <div className="cz-split-head"><div>OLD</div><div>NEW</div></div> : null}
                {renderLines(hunk.lines, viewMode, decision === 'accepted' ? 'old' : decision === 'rejected' ? 'new' : null)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/** Trigger visibility is name-based: only the Agent Developer role may open the workbench. */
export function hasActiveAgentDeveloperSession(
  agents: readonly { agentId: string; status: string }[],
  roster: readonly { id: string; name: string }[]
): boolean {
  const developerIds = new Set(roster.filter((member) => member.name === CODE_EDIT_AGENT_NAME).map((member) => member.id));
  return agents.some((agent) =>
    developerIds.has(agent.agentId) &&
    ['queued', 'running', 'paused', 'waiting'].includes(agent.status)
  );
}
