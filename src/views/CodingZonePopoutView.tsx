/**
 * Phase 48 D-06/D-13: dedicated popout route rendering the SAME Coding Zone workbench.
 * Shared state arrives via targeted handoff / versioned sync; no paths or secrets in the hash.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { CodingZoneModal } from '../components/agents/CodingZoneModal';
import { CodingZoneDiffPanel } from '../components/agents/CodingZoneDiffPanel';
import type { DiffFile } from '../types/agent';
import type {
  CodingZoneSharedMessage,
  CodingZoneSharedState,
  CodingZoneSyncPayload,
  ConnectionState,
} from '../types/codingZone';
import { isCodingZoneFullState } from '../types/codingZone';
import { useCodingZoneSync } from '../hooks/useCodingZoneSync';
import { closeCodingZonePopout } from '../utils/codingZonePopout';

const WINDOW_ID = `coding-zone-popout-${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random()}`;

// Stable empties: inline literals would retrigger CodingZoneModal's environment effect on every render.
const EMPTY_FILES: readonly string[] = [];
const EMPTY_DIFF_FILES: readonly DiffFile[] = [];
const EMPTY_MESSAGES: readonly CodingZoneSharedMessage[] = [];

export interface CodingZonePopoutViewProps {
  /** Popout window always quotes the connection carried in the handoff snapshot. */
  connection?: ConnectionState | undefined;
}

export const CodingZonePopoutView: React.FC<CodingZonePopoutViewProps> = ({ connection = 'connecting' }) => {
  const [shared, setShared] = useState<CodingZoneSharedState | undefined>(undefined);

  const onState = useCallback((event: CodingZoneSyncPayload) => {
    if (event.kind !== 'full' || !isCodingZoneFullState(event.payload)) return;
    setShared(event.payload);
  }, []);
  // The modal owns tabs/decisions; this view needs the same full snapshot to feed its diff panel.
  const { requestState } = useCodingZoneSync(WINDOW_ID, onState);
  // Initial handoff can arrive before this listener mounts; ask the owner to republish.
  useEffect(() => { requestState(); }, [requestState]);

  return (
    <div className="cz-popout-window" data-testid="coding-zone-popout-view" data-shared-state={shared ? 'ready' : 'pending'}>
      <style>{`
        .cz-popout-window { width: 100vw; height: 100vh; background: var(--bg); }
        .cz-popout-window .cz-backdrop { position: static; padding: 0; }
        .cz-popout-window .cz-modal { border-radius: 10px; }
        .cz-popout-window .cz-modal-body { grid-template-columns: 210px minmax(0, 1fr) 230px; }
        @media (max-width: 760px) {
          .cz-popout-window .cz-modal-body { grid-template-columns: 210px minmax(0, 1fr); }
          .cz-popout-window .cz-modal-body > .cz-chat-pane { display: none; }
        }
      `}</style>
      <CodingZoneModal
        messages={shared?.messages ?? EMPTY_MESSAGES}
        allFiles={shared?.allFiles ?? EMPTY_FILES}
        diffFiles={shared?.diffFiles ?? EMPTY_DIFF_FILES}
        {...(shared ? {
          descriptor: shared.descriptor,
          sshConfig: shared.sshConfig,
          diffRevision: shared.diffRevision,
          onlineCount: shared.onlineCount,
        } : {})}
        connection={shared?.connection ?? connection}
        windowId={WINDOW_ID}
        title="Coding Zone — Popout"
        onClose={() => { void closeCodingZonePopout(); }}
        onPopout={undefined}
        onSendMessage={undefined}
        renderDiffPanel={({ filePath, hunkStates, setHunkState }) => (
          <CodingZoneDiffPanel
            descriptor={shared?.descriptor}
            filePath={filePath}
            files={shared?.diffFiles ?? []}
            revision={shared?.diffRevision ?? 0}
            hunkStates={hunkStates}
            setHunkState={setHunkState}
          />
        )}
      />
    </div>
  );
};

export default CodingZonePopoutView;
