import { Tooltip } from 'antd';
import { MinusOutlined, TeamOutlined } from '@ant-design/icons';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import { useLayoutStore } from '../store/layoutStore';
import {
  JetBrainsProjectIcon,
  JetBrainsDocsIcon,
  JetBrainsDiagramIcon,
  JetBrainsSystemsIcon,
  JetBrainsRemoteGitIcon,
  JetBrainsAgentsIcon,
} from '../../components/icons/JetBrainsIcons';
import { CRExplorer } from './CRExplorer';
import { DocsExplorer } from './DocsExplorer';
import { DiagramExplorer } from './DiagramExplorer';
import { RemoteGitExplorer } from './RemoteGitExplorer';
import { SystemsExplorer } from './SystemsExplorer';
import { AiStaffExplorer } from './AiStaffExplorer';
import { AiOfficeExplorer } from './AiOfficeExplorer';

export interface LeftToolWindowProps {
  db?: TaskPlannerDatabase | undefined;
  onSelectChangeRequest?: ((changeRequestId: string | null) => void) | undefined;
}

export function LeftToolWindow({
  db = defaultDb,
  onSelectChangeRequest,
}: LeftToolWindowProps) {
  const leftActiveId = useLayoutStore((s) => s.leftActiveId);
  const toggleToolWindow = useLayoutStore((s) => s.toggleToolWindow);

  const isSystems = leftActiveId === 'systems';
  const isDocs = leftActiveId === 'docs';
  const isDiagrams = leftActiveId === 'diagrams';
  const isRemoteExplorer = leftActiveId === 'remote_explorer';
  const isAiStaff = leftActiveId === 'ai_staff';
  const isAiOffice = leftActiveId === 'ai_office';

  const title = isSystems
    ? 'Systems Explorer'
    : isRemoteExplorer
    ? 'Remote Git Explorer'
    : isDiagrams
    ? 'Diagram Explorer'
    : isDocs
    ? 'Docs Explorer'
    : isAiStaff
    ? 'AI Staff'
    : isAiOffice
    ? 'AI Office'
    : 'CR Explorer';

  const icon = isSystems ? (
    <JetBrainsSystemsIcon size={15} />
  ) : isRemoteExplorer ? (
    <JetBrainsRemoteGitIcon size={15} />
  ) : isDiagrams ? (
    <JetBrainsDiagramIcon size={15} />
  ) : isDocs ? (
    <JetBrainsDocsIcon size={15} />
  ) : isAiStaff ? (
    <JetBrainsAgentsIcon size={15} />
  ) : isAiOffice ? (
    <TeamOutlined style={{ fontSize: 15 }} />
  ) : (
    <JetBrainsProjectIcon size={15} />
  );

  return (
    <div
      className="workbench-toolwindow-left"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        background: 'var(--bg-island, #ffffff)',
        overflow: 'hidden',
      }}
    >
      {/* Tool Window Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 34,
          padding: '0 12px',
          borderBottom: '1px solid var(--border, #e9eaee)',
          background: 'var(--bg-elev, #f7f8fa)',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          {icon}
          <span
            style={{
              fontWeight: 600,
              fontSize: 'var(--font-size-ui, 13px)',
              letterSpacing: '0.01em',
              color: 'var(--fg-strong, #000000)',
            }}
          >
            {title}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Tooltip title={`Collapse ${title}`}>
            <button
              type="button"
              onClick={() => toggleToolWindow('left', leftActiveId || 'cr_explorer')}
              aria-label="Collapse tool window"
              style={{
                background: 'transparent',
                border: 'none',
                padding: 3,
                borderRadius: 3,
                cursor: 'pointer',
                color: 'var(--fg-muted, #6c707e)',
              }}
            >
              <MinusOutlined style={{ fontSize: 12 }} />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Explorer Content Body */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {isSystems ? (
          <SystemsExplorer db={db} />
        ) : isRemoteExplorer ? (
          <RemoteGitExplorer db={db} />
        ) : isDiagrams ? (
          <DiagramExplorer db={db} />
        ) : isDocs ? (
          <DocsExplorer db={db} />
        ) : isAiStaff ? (
          <AiStaffExplorer db={db} />
        ) : isAiOffice ? (
          <AiOfficeExplorer db={db} />
        ) : (
          <CRExplorer db={db} onSelectChangeRequest={onSelectChangeRequest} />
        )}
      </div>
    </div>
  );
}
