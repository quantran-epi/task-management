import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Collapse, Drawer, Input, Tag, theme } from 'antd';
import dayjs from 'dayjs';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../../../db';
import {
  countAgentsUsingSkill,
  createSkill,
  updateSkill,
} from '../../../db/repositories/aiOfficeRepo';
import {
  decideSkillVersion,
  listSkillVersions,
  STALE_VERSION_MESSAGE,
} from '../../../db/repositories/aiSkillVersionRepo';
import {
  isRefusal,
  prepareSkillVersionDiff,
  type ArtifactPatchProposal,
} from '../../../services/ai/patchProposal';
import { MarkdownContentRenderer } from '../ChatMessageBubble';
import { PatchDiffApprovalCard } from '../widget/PatchDiffApprovalCard';
import { AiSkillInputSchema } from '../../../validation/aiOfficeSchemas';
import type { AiSkill, AiSkillVersion } from '../../../types/aiOffice';

const CODE_FONT =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

const WRITE_FAILED_COPY =
  'Không duyệt được đề xuất. Đề xuất vẫn còn trong danh sách chờ duyệt — thử lại.';

interface SkillProposalEntry {
  row: AiSkillVersion;
  patch: ArtifactPatchProposal;
}

export interface SkillEditorDrawerProps {
  open: boolean;
  skill: AiSkill | null;
  onCancel: () => void;
  onSaved: () => void;
  db?: TaskPlannerDatabase | undefined;
}

/**
 * UI-SPEC §4. The description is the only text an agent receives up front (D-24); the
 * body is read on demand, so the label says so explicitly.
 *
 * The preview renders through `MarkdownContentRenderer`, the only permitted path to
 * `renderSafeMarkdown` — this file never emits raw HTML itself (T-34-47).
 *
 * D-26: this drawer is also the durable approval queue and the version history. The form
 * stays first so editing is never buried; the pending section and history sit below it.
 */
export const SkillEditorDrawer: React.FC<SkillEditorDrawerProps> = ({
  open,
  skill,
  onCancel,
  onSaved,
  db = defaultDb,
}) => {
  const { token } = theme.useToken();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [agentCount, setAgentCount] = useState(0);

  /**
   * D-25: a row decided here must keep its card (and its `role="status"` line) until the
   * drawer closes. `versions` is live and approving flips `status` in place, so the row
   * leaves the pending filter immediately — the snapshot holds row AND diff, because the
   * approval overwrites `aiSkills` and a recomputed diff would collapse to zero lines.
   */
  const [recentlyDecided, setRecentlyDecided] = useState<Map<string, SkillProposalEntry>>(new Map());
  const [decision, setDecision] = useState<Map<string, 'approved' | 'rejected'>>(new Map());
  const [applying, setApplying] = useState<Set<string>>(new Set());
  const [error, setError] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!open) return;
    setName(skill?.name ?? '');
    setDescription(skill?.description ?? '');
    setBody(skill?.body ?? '');
  }, [open, skill]);

  /** A reopened drawer starts clean — no decision overlay from the previous session. */
  useEffect(() => {
    if (!open) return;
    setRecentlyDecided(new Map());
    setDecision(new Map());
    setApplying(new Set());
    setError(new Map());
    setSaveError(null);
  }, [open, skill?.id]);

  useEffect(() => {
    if (!open || !skill) {
      setAgentCount(0);
      return;
    }
    let cancelled = false;
    void countAgentsUsingSkill(skill.id, db).then((count) => {
      if (!cancelled) setAgentCount(count);
    });
    return () => {
      cancelled = true;
    };
  }, [open, skill, db]);

  const versions =
    useLiveQuery(
      () => (skill ? listSkillVersions(skill.id, db) : Promise.resolve<AiSkillVersion[]>([])),
      [open, skill?.id, db]
    ) ?? [];

  const { pendingSectionRows, unresolvedCount, historyRows, highestApproved, pendingCount } =
    useMemo(() => {
      const pending = versions.filter((row) => row.status === 'pending');

      // Built before the section rows, which read from it. The builder is synchronous.
      const patches = new Map<string, ArtifactPatchProposal>();
      if (skill) {
        for (const row of pending) {
          const baseVersion = row.baseVersion ?? 0;
          const base =
            baseVersion > 0
              ? versions.find(
                  (candidate) =>
                    candidate.status === 'approved' && candidate.version === baseVersion
                )
              : skill;
          // Neither side resolves: skip rather than render a card with an empty base.
          if (!base) continue;
          const result = prepareSkillVersionDiff({
            skillId: skill.id,
            base,
            next: row,
            baseVersion,
          });
          // The tool already refused at write time; this is defensive only.
          if (!isRefusal(result)) patches.set(row.id, result);
        }
      }

      const rows: SkillProposalEntry[] = [
        ...recentlyDecided.values(),
        ...pending
          .filter((row) => patches.has(row.id))
          .map((row) => ({ row, patch: patches.get(row.id)! })),
      ].sort((a, b) => b.row.createdAt.localeCompare(a.row.createdAt));

      return {
        pendingSectionRows: rows,
        // A row decided in this session is already visible above — listing it again would
        // double it, with its `v{n}` chip shown before the decision line was read.
        historyRows: versions.filter(
          (row) => row.status !== 'pending' && !recentlyDecided.has(row.id)
        ),
        highestApproved: versions
          .filter((row) => row.status === 'approved')
          .reduce((max, row) => Math.max(max, row.version ?? 0), 0),
        // WR-02: the badge and the header count what is still awaiting a decision. `rows` also
        // carries this session's decided cards (D-25 keeps them visible), so counting it would
        // claim a pending proposal that no longer exists — `SkillCard` reads 0 at the same time.
        // A row whose base cannot resolve is still pending, so it counts here too: the card
        // reads it from the raw DB count and the drawer must not disagree.
        pendingCount: pending.length,
        // WR-02: a row whose base cannot resolve renders no card. It is counted into the
        // chrome above and surfaced below, mirroring `PendingSkillProposals`' overflow line —
        // silently dropping it left the user unable to approve or reject it, forever.
        unresolvedCount: pending.length - patches.size,
      };
    }, [versions, skill, recentlyDecided]);

  const valid = useMemo(
    () => AiSkillInputSchema.safeParse({ name, description, body }).success,
    [name, description, body]
  );

  /**
   * IN-02: a no-op save writes nothing (WR-01's early return in `updateSkill`), so the caption
   * promising a new version must not be reachable — the button is disabled until something
   * actually changed. Create mode always has something to write.
   */
  const dirty =
    skill === null ||
    name !== skill.name ||
    description !== skill.description ||
    body !== skill.body;

  const decide = async (entry: SkillProposalEntry, status: 'approved' | 'rejected') => {
    const { row, patch } = entry;
    // Snapshot before the write: the row leaves the pending filter and `aiSkills` changes.
    setRecentlyDecided((prev) => new Map(prev).set(row.id, { row, patch }));
    setApplying((prev) => new Set(prev).add(row.id));
    setError((prev) => {
      const next = new Map(prev);
      next.delete(row.id);
      return next;
    });
    try {
      // WR-03: hand the repo the base the user reviewed, so a stale approval is refused at
      // the state owner rather than merely hidden behind a disabled button.
      await decideSkillVersion(row.id, status, db, row.baseVersion ?? 0);
      setDecision((prev) => new Map(prev).set(row.id, status));
    } catch (err) {
      // The row is still pending and re-renders from the live query — drop the snapshot
      // or the card would appear twice.
      setRecentlyDecided((prev) => {
        const next = new Map(prev);
        next.delete(row.id);
        return next;
      });
      setError(
        (prev) =>
          new Map(prev).set(
            row.id,
            err instanceof Error && err.message === STALE_VERSION_MESSAGE
              ? STALE_VERSION_MESSAGE
              : WRITE_FAILED_COPY
          )
      );
    } finally {
      setApplying((prev) => {
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
    }
  };

  // D-09: the repo writes the version, so saving stays immediate — no approval step here.
  // WR-03: a failed write must surface, not escape the click handler as an unhandled rejection.
  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      if (skill) await updateSkill(skill.id, { name, description, body }, db);
      else await createSkill({ name, description, body }, db);
      onSaved();
    } catch {
      setSaveError('Không lưu được kỹ năng. Thử lại.');
    } finally {
      setSaving(false);
    }
  };

  const title = skill ? (
    <>
      Sửa kỹ năng
      {pendingCount > 0 && (
        <Tag
          color="warning"
          data-testid="skill-editor-pending-badge"
          style={{ marginLeft: 8, fontSize: 12 }}
        >
          {`${pendingCount} chờ duyệt`}
        </Tag>
      )}
    </>
  ) : (
    'Thêm kỹ năng'
  );

  return (
    <Drawer
      width={560}
      placement="right"
      open={open}
      onClose={onCancel}
      destroyOnHidden
      title={title}
      footer={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 12, color: token.colorTextSecondary }}>
            {`Đang dùng bởi ${agentCount} nhân viên`}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button onClick={onCancel}>Hủy</Button>
            <Button
              type="primary"
              disabled={!valid || !dirty}
              loading={saving}
              onClick={handleSave}
              data-testid="skill-editor-save"
            >
              Lưu kỹ năng
            </Button>
          </div>
        </div>
      }
    >
      <div
        data-testid="skill-editor-drawer"
        style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        {saveError !== null && (
          <Alert type="error" showIcon role="alert" data-testid="skill-editor-save-error" title={saveError} />
        )}

        <div>
          <div style={{ fontSize: 12, marginBottom: 4 }}>Tên</div>
          <Input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} aria-label="Tên" />
        </div>


        <div>
          <div style={{ fontSize: 12, marginBottom: 4 }}>Mô tả (nhân viên chỉ thấy phần này)</div>
          <Input.TextArea
            rows={2}
            maxLength={300}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            aria-label="Mô tả (nhân viên chỉ thấy phần này)"
          />
        </div>

        <div>
          <div style={{ fontSize: 12, marginBottom: 4 }}>Nội dung</div>
          <Input.TextArea
            rows={14}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            aria-label="Nội dung"
            style={{ fontFamily: CODE_FONT, fontSize: 12, whiteSpace: 'pre' }}
          />
        </div>

        {skill !== null && (
          <div style={{ fontSize: 12, color: token.colorTextSecondary }}>
            Lưu thay đổi (nếu có) sẽ tạo một phiên bản mới trong lịch sử.
          </div>
        )}

        <Collapse
          size="small"
          items={[
            {
              key: 'preview',
              label: 'Xem trước',
              children: <MarkdownContentRenderer content={body} />,
            },
          ]}
        />

        {skill !== null && pendingSectionRows.length + unresolvedCount > 0 && (
          <div
            data-testid="skill-pending-section"
            style={{
              paddingTop: 24,
              borderTop: `1px solid ${token.colorBorderSecondary}`,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            {/* WR-02: the header counts only still-pending rows. The decided cards below
                stay visible until the drawer closes (D-25), so the section outlives them. */}
            {pendingCount > 0 && (
              <div style={{ fontSize: 14, fontWeight: 600 }}>{`Chờ duyệt (${pendingCount})`}</div>
            )}
            {pendingSectionRows.map(({ row, patch }) => (
              <div key={row.id} data-testid={`skill-pending-card-${row.id}`}>
                <PatchDiffApprovalCard
                  patch={patch}
                  variant="skill"
                  // The drawer has no roster prop, so it cannot name a proposer — the
                  // ` · đề xuất bởi …` segment is a transcript-only affordance.
                  subtitle={`Kỹ năng · ${skill.name}`}
                  // WR-01: a decided card is not stale — approving raises `highestApproved`
                  // to this row's own number, so the check would fire on every approval.
                  stale={!decision.get(row.id) && (row.baseVersion ?? 0) < highestApproved}
                  staleReason="newer-version-approved"
                  evidence={row.evidence}
                  decision={decision.get(row.id)}
                  applying={applying.has(row.id)}
                  error={error.get(row.id)}
                  onApprove={() => void decide({ row, patch }, 'approved')}
                  onReject={() => void decide({ row, patch }, 'rejected')}
                />
              </div>
            ))}
            {/* WR-02: a pending row whose base cannot resolve has no card. Say so instead of
                dropping it — the user still has to reject it or ask for a re-proposal. */}
            {unresolvedCount > 0 && (
              <div
                data-testid="skill-pending-unresolved"
                style={{ fontSize: 12, color: token.colorTextSecondary }}
              >
                {`Còn ${unresolvedCount} đề xuất không xem được bản diff — hãy từ chối hoặc đề xuất lại.`}
              </div>
            )}
          </div>
        )}

        {skill !== null && (
          <div
            data-testid="skill-version-history"
            style={{
              paddingTop: 24,
              borderTop: `1px solid ${token.colorBorderSecondary}`,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600 }}>
              {`Lịch sử phiên bản (${historyRows.length})`}
            </div>
            {historyRows.length === 0 ? (
              <div style={{ fontSize: 12, color: token.colorTextSecondary }}>
                Chưa có phiên bản nào — lần lưu đầu tiên sẽ lưu nội dung hiện tại thành phiên
                bản 1.
              </div>
            ) : (
              // D-12: view-only. No restore, no edit, no action of any kind.
              <Collapse
                size="small"
                items={historyRows.map((row) => ({
                  key: row.id,
                  label: (
                    <div
                      data-testid={`skill-version-row-${row.id}`}
                      style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}
                    >
                      {row.status === 'approved' && row.version !== undefined ? (
                        <span
                          style={{
                            border: `1px solid ${token.colorBorderSecondary}`,
                            borderRadius: 4,
                            padding: '0 4px',
                            lineHeight: '16px',
                            fontSize: 12,
                            fontWeight: 600,
                          }}
                        >
                          {`v${row.version}`}
                        </span>
                      ) : (
                        // D-14: a rejected row has no number — never `v0` / `vundefined`.
                        <span
                          style={{ fontSize: 12, fontWeight: 600, color: token.colorTextSecondary }}
                        >
                          Đề xuất bị từ chối
                        </span>
                      )}
                      <span
                        title={row.name}
                        style={{
                          fontSize: 13.5,
                          flex: 1,
                          minWidth: 0,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {row.name}
                      </span>
                      <span
                        style={{
                          fontSize: 12,
                          color: token.colorTextSecondary,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {row.decidedAt ? dayjs(row.decidedAt).format('DD/MM/YYYY HH:mm') : ''}
                      </span>
                      {row.status === 'approved' ? (
                        <Tag color="success" style={{ margin: 0 }}>
                          Đã duyệt
                        </Tag>
                      ) : (
                        <Tag style={{ margin: 0 }}>Đã từ chối</Tag>
                      )}
                    </div>
                  ),
                  children: (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{row.name}</div>
                      <div style={{ fontSize: 13.5 }}>{row.description}</div>
                      <MarkdownContentRenderer content={row.body} />
                      {row.evidence !== undefined && row.evidence.trim() !== '' && (
                        <div
                          style={{
                            fontSize: 13.5,
                            whiteSpace: 'pre-wrap',
                            color: token.colorTextSecondary,
                          }}
                        >
                          {row.evidence}
                        </div>
                      )}
                    </div>
                  ),
                }))}
              />
            )}
          </div>
        )}
      </div>
    </Drawer>
  );
};

export default SkillEditorDrawer;
