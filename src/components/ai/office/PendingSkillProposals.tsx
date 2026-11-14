import React, { useMemo, useState } from 'react';
import { theme } from 'antd';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../../../db';
import {
  decideSkillVersion,
  listPendingSkillVersions,
  STALE_VERSION_MESSAGE,
} from '../../../db/repositories/aiSkillVersionRepo';
import {
  isRefusal,
  prepareSkillVersionDiff,
  type ArtifactPatchProposal,
} from '../../../services/ai/patchProposal';
import type {
  AiEmployee,
  AiSkill,
  AiSkillVersion,
  AiTeamMember,
} from '../../../types/aiOffice';
import { PatchDiffApprovalCard } from '../widget/PatchDiffApprovalCard';

/** UI-SPEC §2: D-29 lets pendings accumulate, so the transcript caps the diff wall. */
const MAX_VISIBLE = 3;

const WRITE_FAILED_COPY =
  'Không duyệt được đề xuất. Đề xuất vẫn còn trong danh sách chờ duyệt — thử lại.';

interface SkillProposalEntry {
  row: AiSkillVersion;
  patch: ArtifactPatchProposal;
}

export interface PendingSkillProposalsProps {
  members: AiTeamMember[];
  employees: AiEmployee[];
  skills: AiSkill[];
  db?: TaskPlannerDatabase | undefined;
}

/**
 * D-13: a version row carries no proposer field, so the subtitle derives one. First match in
 * `employees` order wins — never guess between two agents sharing a skill, and never render
 * `undefined` when nobody carries it (unassigned skill / stale backup pairing).
 */
export function skillSubtitle(
  skillId: string,
  skillName: string,
  employees: AiEmployee[]
): string {
  const proposer = employees.find((employee) => employee.skillId === skillId);
  const base = `Kỹ năng · ${skillName}`;
  return proposer ? `${base} · đề xuất bởi ${proposer.name}` : base;
}

/**
 * UI-SPEC §2: the transcript render site for pending skill proposals.
 *
 * Deliberately NOT the turn's parked-approval field — that field is only populated by the
 * parked-patch branch, and D-04 forbids parking `propose_skill_version`. The pending live
 * query is pending-only by construction, so a decided row leaves it immediately; `recentlyDecided`
 * keeps a pre-write snapshot (row AND diff) so the card survives its own decision with its
 * real diff — `aiSkills` is overwritten by the approval, so a recomputed diff would collapse.
 */
export const PendingSkillProposals: React.FC<PendingSkillProposalsProps> = ({
  members,
  employees,
  skills,
  db = defaultDb,
}) => {
  const { token } = theme.useToken();
  const pending = useLiveQuery(() => listPendingSkillVersions(db), [db]) ?? [];
  const approvedRows =
    useLiveQuery(() => db.aiSkillVersions.where('status').equals('approved').toArray(), [db]) ?? [];

  const [recentlyDecided, setRecentlyDecided] = useState<Map<string, SkillProposalEntry>>(new Map());
  const [decision, setDecision] = useState<Map<string, 'approved' | 'rejected'>>(new Map());
  const [applying, setApplying] = useState<Set<string>>(new Set());
  const [error, setError] = useState<Map<string, string>>(new Map());

  /** T-39-21: only this team's own roster is addressable — no cross-team leakage. */
  const rosterSkillIds = useMemo(() => {
    const memberIds = new Set(members.map((member) => member.agentId));
    const ids = new Set<string>();
    for (const employee of employees) {
      if (memberIds.has(employee.id) && employee.skillId) ids.add(employee.skillId);
    }
    return ids;
  }, [members, employees]);

  const remaining = useMemo(
    () => pending.filter((row) => rosterSkillIds.has(row.skillId) && !recentlyDecided.has(row.id)),
    [pending, rosterSkillIds, recentlyDecided]
  );

  /** D-16: the highest approved number per skill, from the same query the base lookup uses. */
  const currentApproved = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of approvedRows) {
      if (row.version === undefined) continue;
      map.set(row.skillId, Math.max(map.get(row.skillId) ?? 0, row.version));
    }
    return map;
  }, [approvedRows]);

  const patches = useMemo(() => {
    const map = new Map<string, ArtifactPatchProposal>();
    for (const row of remaining) {
      const baseVersion = row.baseVersion ?? 0;
      const base =
        baseVersion > 0
          ? approvedRows.find((candidate) => candidate.skillId === row.skillId && candidate.version === baseVersion)
          : skills.find((skill) => skill.id === row.skillId);
      // Neither side resolves: skip rather than render a card with an empty base.
      if (!base) continue;
      const result = prepareSkillVersionDiff({ skillId: row.skillId, base, next: row, baseVersion });
      // The tool already refused at write time; this is defensive only.
      if (!isRefusal(result)) map.set(row.id, result);
    }
    return map;
  }, [remaining, approvedRows, skills]);

  const { visible, overflow } = useMemo(() => {
    // WR-07: cap the decided list too. It is appended on every decision and never trimmed,
    // so an unbounded list would push the pending side out permanently (`slots` stays 0).
    const decided = [...recentlyDecided.values()]
      .sort((a, b) => b.row.createdAt.localeCompare(a.row.createdAt))
      .slice(0, MAX_VISIBLE);
    const eligible = remaining.filter((row) => patches.has(row.id));
    // WR-08: a proposal whose base cannot be resolved renders no card, so count it into the
    // overflow line — otherwise the badge claims a proposal the transcript never shows.
    const unresolved = remaining.length - eligible.length;
    const slots = Math.max(0, MAX_VISIBLE - decided.length);
    const visiblePending = eligible.slice(0, slots).map((row) => ({
      row,
      patch: patches.get(row.id)!,
    }));
    return {
      visible: [...decided, ...visiblePending],
      overflow: eligible.length - visiblePending.length + unresolved,
    };
  }, [recentlyDecided, remaining, patches]);

  const decide = async (entry: SkillProposalEntry, status: 'approved' | 'rejected') => {
    const { row, patch } = entry;
    // Snapshot before the write: the row leaves the live query and `aiSkills` changes.
    setRecentlyDecided((prev) => new Map(prev).set(row.id, { row, patch }));
    setApplying((prev) => new Set(prev).add(row.id));
    setError((prev) => {
      const next = new Map(prev);
      next.delete(row.id);
      return next;
    });
    try {
      // WR-03: the repo refuses an approval whose reviewed base is no longer the live one —
      // the disabled button above is the affordance, this is the enforcement.
      await decideSkillVersion(row.id, status, db, row.baseVersion ?? 0);
      setDecision((prev) => new Map(prev).set(row.id, status));
    } catch (err) {
      // The row is still pending and will re-render from the live query — drop the snapshot
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

  // WR-08: an unresolved proposal has no card but still owes the user an overflow line.
  if (visible.length === 0 && overflow === 0) return null;

  return (
    <div
      data-testid="skill-pending-proposals"
      style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 16px' }}
    >
      {visible.map(({ row, patch }) => (
        <div key={row.id} data-testid={`skill-pending-card-${row.id}`}>
          <PatchDiffApprovalCard
            patch={patch}
            variant="skill"
            subtitle={skillSubtitle(row.skillId, patch.sectionTitle, employees)}
            // WR-01: a decided card is not stale — the decision supersedes the check, and
            // approving raises the maximum to this row's own number.
            stale={!decision.get(row.id) && (row.baseVersion ?? 0) < (currentApproved.get(row.skillId) ?? 0)}
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
      {overflow > 0 && (
        <div data-testid="skill-pending-overflow" style={{ fontSize: 12, color: token.colorTextSecondary }}>
          {`Còn ${overflow} đề xuất chờ duyệt — xem trong AI Staff › Kỹ năng.`}
        </div>
      )}
    </div>
  );
};

export default PendingSkillProposals;
