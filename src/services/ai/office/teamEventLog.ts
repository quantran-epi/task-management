import type { TaskPlannerDatabase } from '../../../db';
import {
  cursorId,
  USER_PARTICIPANT_ID,
  type MessageSeenEntry,
  type TeamMessage,
  type TeamMessageKind,
  type TeamParticipant,
  type TeamReadCursor,
} from '../../../types/teamChat';
import { generateId } from '../../../utils/uuid';

/**
 * The team message log (37.1 rework).
 *
 * One durable, append-only log per team. Every participant has a cursor into it; advancing
 * that cursor IS the read receipt. Nothing here imports React, so the log outlives a view
 * switch and a remount.
 *
 * Invariants enforced here and nowhere else:
 *   L1  `to` is never empty — an unaddressed message cannot be appended.
 *   L2  `seq` is unique and monotonic per team, allocated inside the append transaction.
 *   L3  A cursor only ever moves forward.
 *
 * The log is the source of truth for "what was said to whom". Work state (queued / running /
 * done, budget, retry) stays in `aiTeamAssignments` — a message may open an attempt, but it
 * is not one.
 */

export interface AppendMessageInput {
  teamId: string;
  from: string;
  to: string[];
  content: string;
  kind?: TeamMessageKind | undefined;
  assignmentId?: string | undefined;
  deliversMessageId?: string | undefined;
  replyToId?: string | undefined;
}

export interface AppendMessageResult {
  message: TeamMessage;
  /** Recipients whose cursor did not already cover this message. */
  newlyDelivered: string[];
}

/** `to` is required and non-empty by contract; this is the runtime guard behind it. */
function assertAddressed(to: string[]): void {
  if (!Array.isArray(to) || to.length === 0) {
    throw new Error('TEAM_MESSAGE_UNADDRESSED');
  }
}

/**
 * Append one message. The `seq` allocation and the insert share one `rw` transaction, so two
 * concurrent appends cannot collide on `[teamId+seq]`.
 */
export async function appendMessage(
  input: AppendMessageInput,
  db: TaskPlannerDatabase
): Promise<AppendMessageResult> {
  assertAddressed(input.to);
  const now = new Date().toISOString();

  const message = await db.transaction('rw', db.teamMessages, async (): Promise<TeamMessage> => {
    const last = await db.teamMessages
      .where('[teamId+seq]')
      .between([input.teamId, -Infinity], [input.teamId, Infinity])
      .last();
    const seq = (last?.seq ?? 0) + 1;
    const row: TeamMessage = {
      id: generateId(),
      teamId: input.teamId,
      seq,
      from: input.from,
      to: [...input.to],
      content: input.content,
      kind: input.kind ?? 'chat',
      ...(input.assignmentId !== undefined ? { assignmentId: input.assignmentId } : {}),
      ...(input.deliversMessageId !== undefined
        ? { deliversMessageId: input.deliversMessageId }
        : {}),
      ...(input.replyToId !== undefined ? { replyToId: input.replyToId } : {}),
      createdAt: now,
    };
    await db.teamMessages.add(row);
    return row;
  });

  return { message, newlyDelivered: [...input.to] };
}
/**
 * Append the routing projection of a message that was ALREADY persisted as a `ChatMessage`.
 *
 * 37.1 rework: one message id, two projections — `chatMessages` for rendering and history,
 * `teamMessages` for addressing and read cursors. They share the id and are written in one
 * transaction, so there is never a moment where one exists without the other, and no second
 * source of truth for "what was said".
 */
export async function appendForExistingMessage(
  input: {
    id: string;
    teamId: string;
    from: string;
    to: string[];
    content: string;
    kind?: TeamMessageKind | undefined;
    assignmentId?: string | undefined;
    deliversMessageId?: string | undefined;
    replyToId?: string | undefined;
    createdAt?: string | undefined;
  },
  db: TaskPlannerDatabase
): Promise<TeamMessage> {
  assertAddressed(input.to);
  const row = await db.transaction('rw', db.teamMessages, async (): Promise<TeamMessage> => {
    const existing = await db.teamMessages.get(input.id);
    if (existing) return existing;
    const last = await db.teamMessages
      .where('[teamId+seq]')
      .between([input.teamId, -Infinity], [input.teamId, Infinity])
      .last();
    const row: TeamMessage = {
      id: input.id,
      teamId: input.teamId,
      seq: (last?.seq ?? 0) + 1,
      from: input.from,
      to: [...input.to],
      content: input.content,
      kind: input.kind ?? 'chat',
      ...(input.assignmentId !== undefined ? { assignmentId: input.assignmentId } : {}),
      ...(input.deliversMessageId !== undefined
        ? { deliversMessageId: input.deliversMessageId }
        : {}),
      ...(input.replyToId !== undefined ? { replyToId: input.replyToId } : {}),
      createdAt: input.createdAt ?? new Date().toISOString(),
    };
    await db.teamMessages.add(row);
    return row;
  });
  return row;
}

/** The highest `seq` in the team, or 0 when the log is empty. */
export async function headSeq(teamId: string, db: TaskPlannerDatabase): Promise<number> {
  const last = await db.teamMessages
    .where('[teamId+seq]')
    .between([teamId, -Infinity], [teamId, Infinity])
    .last();
  return last?.seq ?? 0;
}

/**
 * Messages with `seq > afterSeq`, oldest first — the WHOLE log, not just the ones addressed
 * to one participant.
 *
 * 37.1 §1.1: `to[]` is who must RESPOND, not who may READ. Every consumer advances its
 * cursor over every message (that is what makes "the leader has seen my message to Eva"
 * verifiable), and only acts on the ones that name it. Callers filter with
 * `msg.to.includes(me)`.
 */
export async function readMessagesAfter(
  teamId: string,
  afterSeq: number,
  db: TaskPlannerDatabase,
  limit = 100
): Promise<TeamMessage[]> {
  // EXCLUSIVE lower bound: `afterSeq` is already read, so re-reading it would inject the
  // same steer twice (the cursor would advance past it but the message would repeat once).
  return db.teamMessages
    .where('[teamId+seq]')
    .between([teamId, afterSeq], [teamId, Infinity], false, false)
    .limit(limit)
    .toArray();
}

/** Every message in the team, oldest first — for rendering the transcript. */
export async function listMessages(
  teamId: string,
  db: TaskPlannerDatabase
): Promise<TeamMessage[]> {
  return db.teamMessages.where('teamId').equals(teamId).sortBy('seq');
}

export async function getCursor(
  teamId: string,
  participantId: string,
  db: TaskPlannerDatabase
): Promise<TeamReadCursor> {
  const existing = await db.teamReadCursors.get(cursorId(teamId, participantId));
  return (
    existing ?? {
      id: cursorId(teamId, participantId),
      teamId,
      participantId,
      lastSeq: 0,
      updatedAt: new Date(0).toISOString(),
    }
  );
}

/**
 * Advance a cursor to `seq`. L3: it never moves backward, so a replayed or out-of-order
 * advance cannot un-read a message.
 */
export async function advanceCursor(
  teamId: string,
  participantId: string,
  seq: number,
  db: TaskPlannerDatabase
): Promise<TeamReadCursor> {
  const id = cursorId(teamId, participantId);
  return db.transaction('rw', db.teamReadCursors, async (): Promise<TeamReadCursor> => {
    const existing = await db.teamReadCursors.get(id);
    if (existing && existing.lastSeq >= seq) return existing;
    const row: TeamReadCursor = {
      id,
      teamId,
      participantId,
      lastSeq: seq,
      updatedAt: new Date().toISOString(),
    };
    await db.teamReadCursors.put(row);
    return row;
  });
}

/**
 * Who has read this message. This is the seen receipt.
 *
 * 37.1: the question a receipt answers is "who has READ this", not "who was addressed". In a
 * group chat everyone may read everything — `to[]` only decides who owes a reply — so a
 * reader is anyone whose cursor covers the message, minus its author. Filtering by `to[]`
 * hid the receipt on every agent→lead reply, because the user is not the addressee.
 */
export async function seenBy(
  message: TeamMessage,
  names: ReadonlyMap<string, string>,
  db: TaskPlannerDatabase
): Promise<MessageSeenEntry[]> {
  const rows = await db.teamReadCursors.where('teamId').equals(message.teamId).toArray();
  return rows
    .filter((row) => row.participantId !== message.from && row.lastSeq >= message.seq)
    .map((row) => ({
      participantId: row.participantId,
      participantName: names.get(row.participantId) ?? row.participantId,
      at: row.updatedAt,
    }));
}

/** Delivery state for one recipient: not in `to` → `sent`; cursor covers it → `read`. */
export function deliveryStateFor(
  message: TeamMessage,
  participantId: string,
  cursor: TeamReadCursor
): 'sent' | 'delivered' | 'read' {
  if (!message.to.includes(participantId)) return 'sent';
  return cursor.lastSeq >= message.seq ? 'read' : 'delivered';
}

/**
 * The participants of a team: the user singleton plus every stored lead/agent row.
 * `kind` decides permissions; nothing else about them differs.
 */
export async function listParticipants(
  teamId: string,
  db: TaskPlannerDatabase
): Promise<TeamParticipant[]> {
  const stored = await db.teamParticipants.where('teamId').equals(teamId).toArray();
  const user: TeamParticipant = {
    id: USER_PARTICIPANT_ID,
    teamId,
    kind: 'user',
    name: 'Bạn',
    createdAt: new Date(0).toISOString(),
  };
  return [user, ...stored];
}

/** Upsert the stored (non-user) participants of a team. Idempotent per id. */
export async function syncParticipants(
  teamId: string,
  rows: Array<Pick<TeamParticipant, 'id' | 'kind' | 'name'>>,
  db: TaskPlannerDatabase
): Promise<void> {
  const now = new Date().toISOString();
  await db.transaction('rw', db.teamParticipants, async () => {
    for (const row of rows) {
      const existing = await db.teamParticipants.get(row.id);
      await db.teamParticipants.put({
        id: row.id,
        teamId,
        kind: row.kind,
        name: row.name,
        createdAt: existing?.createdAt ?? now,
      });
    }
  });
}
