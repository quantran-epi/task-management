/**
 * Unified team-chat model (37.1 rework).
 *
 * One primitive serves every "A says something to B" act: user→leader, user→agent,
 * leader→agent, agent→leader. The only thing that differs is the sender's permissions.
 * See `.planning/ARCHITECTURE-TEAM-CHAT.md` for the full contract.
 *
 * Three concepts, and nothing else:
 *   Participant — who
 *   TeamMessage — what, to whom (addressing is a required field)
 *   ReadCursor  — how far each participant has read (this IS the seen receipt)
 *
 * Presence ("working" / "idle") is deliberately NOT here: it is ephemeral runtime state,
 * never persisted, so it cannot get stuck the way a stored phase can.
 */

/** What a participant may do. Everything else about them is identical. */
export type TeamPermission =
  | 'send'
  | 'dispatch'
  | 'amend'
  | 'synthesize'
  | 'stop';

export type TeamParticipantKind = 'user' | 'lead' | 'agent';

export interface TeamParticipant {
  id: string;
  teamId: string;
  kind: TeamParticipantKind;
  name: string;
  createdAt: string;
}

/**
 * The user is not a stored row — it is a singleton per team, addressed by this fixed id.
 * Keeping it out of the table avoids a migration writing one row per existing team and
 * keeps "who is the user" unambiguous.
 */
export const USER_PARTICIPANT_ID = 'user';

export type TeamMessageKind = 'chat' | 'instruction' | 'report' | 'synthesis';

export interface TeamMessage {
  id: string;
  teamId: string;
  /** Monotonic within a team. Cursor comparison is a plain integer compare. */
  seq: number;
  from: string;
  /** Recipients. NEVER empty — an unaddressed message is not a message (37.1 gap 5). */
  to: string[];
  content: string;
  /** Display only. Routing is `to[]`, never this. */
  kind: TeamMessageKind;
  /** The attempt this message opened, when it opened one. */
  assignmentId?: string | undefined;
  /**
   * When the leader forwards a user steer to an agent, this names the steer row it delivers.
   * Delivery is a REAL message (leader → agent), not a marker on someone else's row, so the
   * agent's read cursor covers it like any other message.
   */
  deliversMessageId?: string | undefined;
  /**
   * 37.1 R14: the message this one answers. A reply that does not name its question makes a
   * long conversation unreadable — the reader cannot tell which of their messages was
   * answered. Absent only for a message that starts a thread.
   */
  replyToId?: string | undefined;
  createdAt: string;
}

export interface TeamReadCursor {
  /** `${teamId}:${participantId}` — one cursor per participant per team. */
  id: string;
  teamId: string;
  participantId: string;
  /** Everything with `seq <= lastSeq` has been read. */
  lastSeq: number;
  /** When the participant last advanced. This is the "seen at" timestamp. */
  updatedAt: string;
}

/** Delivery state of one message with respect to one recipient. */
export type MessageDeliveryState = 'sent' | 'delivered' | 'read';

export interface MessageSeenEntry {
  participantId: string;
  participantName: string;
  at: string;
}

export function cursorId(teamId: string, participantId: string): string {
  return `${teamId}:${participantId}`;
}

/** The permission table. The ONLY place a role's capabilities are decided. */
const ROLE_PERMISSIONS: Record<TeamParticipantKind, ReadonlySet<TeamPermission>> = {
  user: new Set(['send', 'dispatch', 'amend', 'synthesize', 'stop']),
  lead: new Set(['send', 'dispatch', 'amend', 'synthesize', 'stop']),
  // An agent answers and can be steered; it never dispatches, amends, synthesizes or stops.
  agent: new Set(['send']),
};

export function permissionsFor(kind: TeamParticipantKind): ReadonlySet<TeamPermission> {
  return ROLE_PERMISSIONS[kind];
}

export function can(kind: TeamParticipantKind, permission: TeamPermission): boolean {
  return ROLE_PERMISSIONS[kind].has(permission);
}
