import React, { useEffect, useState } from 'react';
import type { SshConfig } from '../../../types/ssh';
import type { DiffFile } from '../../../types/agent';
import type { ConnectionState, CodingZoneSharedState, WorktreeDescriptor } from '../../../types/codingZone';
import { CodingZoneModal } from '../CodingZoneModal';
import type { CodingZoneMessage } from '../CodingZoneChatStrip';
import { CodingZoneDiffPanel } from '../CodingZoneDiffPanel';
import { deriveConnectionState } from '../CodingZoneLiveState';
import { openCodingZonePopout, isCodingZonePopoutOpen } from '../../../utils/codingZonePopout';

/** Phase 48 D-02: one clear action shown only while an Agent Developer session is active. */
export interface CodingZoneTriggerProps {
  active: boolean;
  descriptor: WorktreeDescriptor | undefined;
  sshConfig: SshConfig | undefined;
  messages: readonly CodingZoneMessage[];
  connection: ConnectionState;
  onlineCount?: number | undefined;
  allFiles?: readonly string[] | undefined;
  diffFiles?: readonly DiffFile[] | undefined;
  diffRevision?: number | undefined;
  onSendMessage: (text: string) => void;
  compact?: boolean | undefined;
}

export const CodingZoneTrigger: React.FC<CodingZoneTriggerProps> = ({
  active,
  descriptor,
  sshConfig,
  messages,
  connection: incomingConnection,
  onlineCount = 1,
  allFiles = [],
  diffFiles = [],
  diffRevision = 0,
  onSendMessage,
  compact = false,
}) => {
  const [open, setOpen] = useState(false);
  const [popoutOpen, setPopoutOpen] = useState(false);
  const [probing, setProbing] = useState(true);
  const [sshProbeOk, setSshProbeOk] = useState(false);

  useEffect(() => {
    if (!open || !sshConfig) { setProbing(false); return; }
    let cancelled = false;
    setProbing(true);
    void import('../../../services/sshService').then(async ({ testSshConnection }) => {
      await testSshConnection(sshConfig);
      if (!cancelled) setSshProbeOk(true);
    }).catch(() => {
      if (!cancelled) setSshProbeOk(false);
    }).finally(() => {
      if (!cancelled) setProbing(false);
    });
    return () => { cancelled = true; };
  }, [open, sshConfig]);

  useEffect(() => {
    if (!open) return;
    const poll = () => { void isCodingZonePopoutOpen().then(setPopoutOpen); };
    poll();
    const timer = setInterval(poll, 2000);
    return () => clearInterval(timer);
  }, [open]);

  const connection: ConnectionState = incomingConnection === 'connected'
    ? deriveConnectionState({
        sshProbeOk: probing ? false : sshProbeOk,
        worktreeValid: Boolean(descriptor?.remoteWorktreePath),
        sessionActive: active,
        popoutOpen,
      })
    : incomingConnection;

  if (!active) return null;

  return (
    <>
      <button
        type="button"
        className={compact ? 'cz-btn tiny' : 'cz-btn tiny'}
        data-testid="coding-zone-trigger"
        onClick={() => setOpen(true)}
      >
        Mở Coding Zone
      </button>
      {open ? (
        <CodingZoneModal
          descriptor={descriptor}
          sshConfig={sshConfig}
          messages={messages}
          connection={connection}
          onlineCount={onlineCount}
          allFiles={allFiles}
          diffFiles={diffFiles}
          onClose={() => setOpen(false)}
          onSendMessage={onSendMessage}
          onPopout={(state: CodingZoneSharedState) => { void openCodingZonePopout(state); }}
          diffRevision={diffRevision}
          renderDiffPanel={({ filePath, hunkStates, setHunkState }) => (
            <CodingZoneDiffPanel
              descriptor={descriptor}
              filePath={filePath}
              files={diffFiles}
              revision={diffRevision}
              hunkStates={hunkStates}
              setHunkState={setHunkState}
            />
          )}
        />
      ) : null}
    </>
  );
};

export default CodingZoneTrigger;
