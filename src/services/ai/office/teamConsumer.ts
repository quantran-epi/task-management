import type { TaskPlannerDatabase } from '../../../db';
import type { TeamMessage } from '../../../types/teamChat';
import {
  advanceCursor,
  getCursor,
  readMessagesAfter,
  waitForAppend,
} from './teamEventLog';

/**
 * One consumer loop per participant (37.1 §4.1).
 *
 * The log is the only input. A participant reads every message in the team, advances its
 * cursor over all of them, and acts only on the ones that name it. That split is what makes
 * "the leader has seen my message to Eva" a verifiable fact (§1.1) while keeping the leader
 * out of turns it was not asked to take.
 *
 * Three properties this file owns, and nothing else may re-implement:
 *
 *   C1  `presence` is a LOCAL variable. No stored flag, no setter to forget. A consumer that
 *       dies takes its presence with it, so "stuck đang tổng hợp" cannot recur.
 *   C2  `advanceCursor` runs in `finally`. A throw mid-handle leaves the message unread, so
 *       the next pump re-reads it — at-least-once, never lost.
 *   C3  Idle means PARKED ON THE LOG, not "not busy". `waitForAppend` is push; there is no
 *       polling interval to tune and no window where an append goes unnoticed.
 */

export type TeamPresence = 'idle' | 'working' | 'offline';

export interface TeamConsumerDeps {
  teamId: string;
  participantId: string;
  db: TaskPlannerDatabase;
  /** Runs for each message addressed to this participant. May throw; the cursor stays put. */
  handle: (message: TeamMessage) => Promise<void>;
  /** Presence is published, never stored. */
  onPresence?: ((presence: TeamPresence) => void) | undefined;
  /** Stops the background loop and rejects a parked wait. */
  signal?: AbortSignal | undefined;
}

export interface TeamConsumer {
  /** Process everything pending right now, oldest first. Resolves when caught up. */
  pump(): Promise<void>;
  /** Start the background loop: pump, then park on the log until something arrives. */
  start(): void;
  /** Stop the loop. Idempotent. */
  stop(): void;
  presence(): TeamPresence;
}

export function createTeamConsumer(deps: TeamConsumerDeps): TeamConsumer {
  const { teamId, participantId, db, handle } = deps;
  let presence: TeamPresence = 'idle';
  let stopped = false;
  let loop: Promise<void> | null = null;
  /** Serializes pumps: two callers must not interleave cursor reads and handles. */
  let pumping: Promise<void> | null = null;

  const publish = (next: TeamPresence) => {
    if (presence === next) return;
    presence = next;
    deps.onPresence?.(next);
  };

  async function drainOnce(): Promise<void> {
    for (;;) {
      if (stopped) return;
      const cursor = await getCursor(teamId, participantId, db);
      const batch = await readMessagesAfter(teamId, cursor.lastSeq, db);
      if (batch.length === 0) return;

      for (const message of batch) {
        if (stopped) return;
        const addressed = message.to.includes(participantId);
        if (addressed) publish('working');
        try {
          // C2: the read happens only if handling succeeded. A throw leaves the cursor
          // behind this message, so the next pump retries it instead of skipping it.
          if (addressed) await handle(message);
        } finally {
          if (!stopped) await advanceCursor(teamId, participantId, message.seq, db);
        }
      }
    }
  }

  const pump = (): Promise<void> => {
    if (pumping) return pumping;
    pumping = drainOnce().finally(() => {
      pumping = null;
      if (!stopped) publish('idle');
    });
    return pumping;
  };

  async function runLoop(): Promise<void> {
    while (!stopped) {
      await pump();
      if (stopped) break;
      // C3: park on the log. Push, not poll — the append resolves this.
      try {
        await waitForAppend(teamId, deps.signal);
      } catch {
        break;
      }
    }
    publish('offline');
  }

  return {
    pump,
    start: () => {
      if (loop || stopped) return;
      loop = runLoop();
    },
    stop: () => {
      if (stopped) return;
      stopped = true;
      publish('offline');
    },
    presence: () => presence,
  };
}
