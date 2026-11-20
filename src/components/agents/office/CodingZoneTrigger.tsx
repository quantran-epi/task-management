import React, { useState } from 'react';
import type { SshConfig } from '../../../types/ssh';
import type { DiffFile } from '../../../types/agent';
import type { ConnectionState, WorktreeDescriptor } from '../../../types/codingZone';
import { CodingZoneModal } from '../CodingZoneModal';
import type { CodingZoneMessage } from '../CodingZoneChatStrip';
import { CodingZoneDiffPanel } from '../CodingZoneDiffPanel';

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
  connection,
  onlineCount = 1,
  allFiles = [],
  diffFiles = [],
  diffRevision = 0,
  onSendMessage,
  compact = false,
}) => {
  const [open, setOpen] = useState(false);
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
