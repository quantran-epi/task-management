import React, { useMemo, useState } from 'react';
import { Alert, Input, Typography, Tooltip, Popconfirm, IconButton } from '../../components/ui';
import { SearchOutlined, PlusOutlined, TeamOutlined, DeleteOutlined } from '../../components/ui/icon';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import { listEmployees, listLeads } from '../../db/repositories/aiOfficeRepo';
import { deleteTeam, listTeams } from '../../db/repositories/aiTeamRepo';
import { describeTeamDocsTree } from '../../db/repositories/teamDocsRepo';
import { USER_PARTICIPANT_ID } from '../../types/teamChat';
import { disposeRun } from '../../services/ai/office/teamRunManager';
import { useLayoutStore } from '../store/layoutStore';
import { TeamEditorDrawer } from '../../components/ai/office/TeamEditorDrawer';
import type { AiTeam } from '../../types/aiOffice';

export interface AiOfficeExplorerProps {
  db?: TaskPlannerDatabase | undefined;
}

/** WR-12 idiom: one fixed message for a failed teardown — repo errors can embed ids. */
const ACTION_ERROR_COPY = 'Không xoá được nhóm. Vui lòng thử lại.';

export const AiOfficeExplorer: React.FC<AiOfficeExplorerProps> = ({ db = defaultDb }) => {
  const [search, setSearch] = useState('');
  const [createTeamOpen, setCreateTeamOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const openTab = useLayoutStore((s) => s.openTab);
  const closeTab = useLayoutStore((s) => s.closeTab);
  const openTabs = useLayoutStore((s) => s.openTabs);

  const teams = useLiveQuery(() => listTeams(db), [db]) ?? [];
  const leads = useLiveQuery(() => listLeads(db), [db]) ?? [];
  const employees = useLiveQuery(() => listEmployees(db), [db]) ?? [];
  const members = useLiveQuery(() => db.aiTeamMembers.toArray(), [db]) ?? [];

  /**
   * 37.1 R13: unread per team, live. Read from the log and the user's cursors — the same two
   * tables the workspace uses — so the explorer badge and the in-chat badge cannot disagree.
   * A `liveQuery` means a message arriving while the user is elsewhere updates this without
   * any interaction.
   */
  const unreadByTeam = useLiveQuery(async () => {
    const cursors = await db.teamReadCursors.toArray();
    const cursorSeq = new Map(
      cursors
        .filter((row) => row.participantId === USER_PARTICIPANT_ID)
        .map((row) => [row.teamId, row.lastSeq])
    );
    const rows = await db.teamMessages.toArray();
    const counts = new Map<string, number>();
    for (const message of rows) {
      if (message.from === USER_PARTICIPANT_ID) continue;
      if (message.seq <= (cursorSeq.get(message.teamId) ?? 0)) continue;
      counts.set(message.teamId, (counts.get(message.teamId) ?? 0) + 1);
    }
    return counts;
  }, [db]) ?? new Map<string, number>();

  const leadMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const lead of leads) {
      map.set(lead.id, lead.name);
    }
    return map;
  }, [leads]);

  const memberCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const member of members) {
      map.set(member.teamId, (map.get(member.teamId) ?? 0) + 1);
    }
    return map;
  }, [members]);

  /**
   * D-10: what each team's delete will destroy, so the confirmation can name it. Live, because
   * the tree changes as agents write.
   */
  const treeSummary = useLiveQuery(async () => {
    const map = new Map<string, { folderCount: number; documentCount: number }>();
    for (const team of teams) {
      if (team.docsFolderId === undefined) continue;
      map.set(team.docsFolderId, await describeTeamDocsTree(team.docsFolderId, db));
    }
    return map;
  }, [db, teams]) ?? new Map<string, { folderCount: number; documentCount: number }>();

  const query = search.trim().toLowerCase();
  const filteredTeams = useMemo(() => {
    if (!query) return teams;
    return teams.filter((team) => {
      const leadName = (team.leadId ? leadMap.get(team.leadId) : undefined) ?? '';
      return (
        team.name.toLowerCase().includes(query) ||
        leadName.toLowerCase().includes(query)
      );
    });
  }, [teams, query, leadMap]);

  const handleOpenTeam = (team: AiTeam) => {
    openTab({
      id: `team_workspace:${team.id}`,
      title: team.name,
      viewType: 'team_workspace',
      closable: true,
      params: { teamId: team.id },
    });
  };

  /**
   * D-18: a live run is torn down BEFORE the row is deleted, so no coordinator can write to
   * a deleted parent. A dispose failure aborts the delete — data safety over completion.
   * IN-06: the delete itself is guarded too — the `onConfirm` arrow discards the promise, so
   * an unguarded rejection was an unhandled rejection with no `actionError`, after the run
   * had already been torn down.
   *
   * WR-03: the teardown uses the reversible cause. `deleteTeam` can REFUSE, and the transaction
   * then rolls back — so stamping `team-deleted` on the ledger first would claim a deletion that
   * never happened. `app-exit` is the honest vocabulary for "the run is over, the team may still
   * exist".
   *
   * W2: a refusal leaves the team alive, so the message must say that instead of the generic
   * failure copy — otherwise the owner reads "nothing happened" as "it broke". The coordinator
   * is recreated by `getOrCreateRun` the next time the workspace mounts, so the team is usable.
   */
  const handleDeleteTeam = async (team: AiTeam) => {
    try {
      await disposeRun(db, team.id, 'app-exit');
    } catch {
      setActionError(ACTION_ERROR_COPY);
      return;
    }
    try {
      await deleteTeam(team.id, db);
    } catch (err) {
      const refused = err instanceof Error && err.message.includes('không xác định được thư mục');
      setActionError(
        refused
          ? 'Không xoá được: thư mục tài liệu của nhóm không xác định được. Nhóm vẫn còn nguyên.'
          : ACTION_ERROR_COPY
      );
      return;
    }
    const workspaceTab = openTabs.find((tab) => tab.id === `team_workspace:${team.id}`);
    if (workspaceTab) closeTab(workspaceTab.id);
  };

  /**
   * D-10's safety mechanism: the owner sees what the delete will destroy. A corrupted
   * `docsFolderId` cannot forge this text, which is why it — not a slug check — is what protects
   * the owner's documents.
   */
  const deleteConfirmText = (team: AiTeam): string => {
    const base = `Xóa nhóm «${team.name}»? Toàn bộ transcript, phân công và tab chat của nhóm sẽ bị xóa.`;
    const tree = team.docsFolderId === undefined ? undefined : treeSummary.get(team.docsFolderId);
    if (tree === undefined) return `${base} Dùng Sao lưu để khôi phục nếu đã xuất trước đó.`;
    const parts: string[] = [];
    if (tree.folderCount > 0) parts.push(`${tree.folderCount} thư mục`);
    if (tree.documentCount > 0) parts.push(`${tree.documentCount} tài liệu`);
    if (parts.length === 0) return `${base} Dùng Sao lưu để khôi phục nếu đã xuất trước đó.`;
    return `${base} Thư mục tài liệu của nhóm (${parts.join(', ')}) cũng sẽ bị xóa vĩnh viễn.`;
  };

  return (
    <div
      data-testid="ai-office-explorer"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        overflow: 'hidden',
        background: 'var(--bg-island, #ffffff)',
      }}
    >
      {/* Search and Action Bar */}
      <div
        style={{
          padding: '8px 10px',
          borderBottom: '1px solid var(--border, #e9eaee)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <Input
          size="small"
          prefix={<SearchOutlined style={{ color: 'var(--fg-muted, #6c707e)' }} />}
          placeholder="Tìm nhóm AI..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          allowClear
          style={{ flex: 1, fontSize: 12 }}
        />
        <Tooltip title="Tạo nhóm mới">
          <IconButton
            size="small"
            type="text"
            icon={<PlusOutlined />}
            onClick={() => setCreateTeamOpen(true)}
            aria-label="Tạo nhóm mới"
            data-testid="ai-office-add-team-btn"
          />
        </Tooltip>
      </div>

      {/* D-18: a dispose failure skips the delete, so it has to be visible. */}
      {actionError && (
        <div style={{ padding: '6px 8px 0' }} data-testid="ai-office-team-delete-error">
          <Alert
            type="error"
            showIcon
            closable
            onClose={() => setActionError(null)}
            message={actionError}
          />
        </div>
      )}

      {/* Team List */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '6px 8px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '4px 6px',
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase',
            color: 'var(--fg-secondary, #5f6269)',
            letterSpacing: '0.04em',
          }}
        >
          <span>Nhóm AI ({filteredTeams.length})</span>
        </div>

        {filteredTeams.length === 0 ? (
          <div style={{ padding: '16px 8px', textAlign: 'center', color: 'var(--fg-muted, #8c8f9c)' }}>
            Chưa có nhóm AI nào
          </div>
        ) : (
          filteredTeams.map((team) => {
            const leadName = team.leadId ? leadMap.get(team.leadId) : undefined;
            const count = memberCountMap.get(team.id) ?? 0;

            return (
              <div
                key={team.id}
                role="button"
                tabIndex={0}
                data-testid={`ai-office-team-${team.id}`}
                onClick={() => handleOpenTeam(team)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    handleOpenTeam(team);
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '7px 8px',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: 12,
                  marginBottom: 3,
                  transition: 'background 0.15s ease',
                  border: '1px solid var(--border-subtle, #f0f2f5)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--bg-selected, #f0f2f5)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                  <TeamOutlined style={{ fontSize: 14, color: 'var(--accent, #3871e1)', flexShrink: 0 }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <Typography.Text
                      ellipsis
                      style={{ fontSize: 12.5, fontWeight: 600, display: 'block', lineHeight: 1.3 }}
                    >
                      {team.name}
                    </Typography.Text>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      <span style={{ fontSize: 11, color: 'var(--fg-secondary, #5f6269)' }}>
                        {leadName ? `Lead: ${leadName}` : 'Chưa chọn lead'}
                      </span>
                      <span style={{ fontSize: 10, color: 'var(--fg-muted, #8c8f9c)' }}>
                        • {count} thành viên
                      </span>
                    </div>
                  </div>
                </div>

                {(unreadByTeam.get(team.id) ?? 0) > 0 && (
                  <span
                    data-testid={`ai-office-team-unread-${team.id}`}
                    aria-label={`${unreadByTeam.get(team.id)} tin chưa đọc`}
                    style={{
                      flexShrink: 0,
                      minWidth: 18,
                      height: 18,
                      padding: '0 5px',
                      borderRadius: 9,
                      background: 'var(--danger, #c54e58)',
                      color: '#fff',
                      fontSize: 10,
                      fontWeight: 700,
                      lineHeight: '18px',
                      textAlign: 'center',
                    }}
                  >
                    {unreadByTeam.get(team.id)}
                  </span>
                )}

                <span
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                  role="presentation"
                  style={{ marginLeft: 4, flexShrink: 0 }}
                >
                  <Popconfirm
                    title={deleteConfirmText(team)}
                    okText="Xóa"
                    cancelText="Hủy"
                    okButtonProps={{ danger: true }}
                    onConfirm={() => handleDeleteTeam(team)}
                  >
                    <IconButton
                      size="small"
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      aria-label={`Xóa nhóm ${team.name}`}
                      data-testid={`ai-office-team-delete-${team.id}`}
                    />
                  </Popconfirm>
                </span>
              </div>
            );
          })
        )}
      </div>

      <TeamEditorDrawer
        open={createTeamOpen}
        leads={leads}
        employees={employees}
        db={db}
        onCancel={() => setCreateTeamOpen(false)}
        onSaved={() => setCreateTeamOpen(false)}
      />
    </div>
  );
};

export default AiOfficeExplorer;
