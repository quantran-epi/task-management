// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { TaskPlannerDatabase } from '../../../../src/db';
import {
  advanceCursor,
  appendMessage,
  getCursor,
  readMessagesAfter,
} from '../../../../src/services/ai/office/teamEventLog';
import { USER_PARTICIPANT_ID } from '../../../../src/types/teamChat';

/**
 * 37.1 §7.3–7.4: the two capabilities that make the log worth having. Neither needs the app
 * to run — a second database handle over the same store IS a remount, and closing one IS a
 * crash.
 */

const TEAM = 'team-1';
const LEAD = 'lead-1';
const AGENT = 'agent-1';

describe('team log — replay and crash recovery (37.1 §7)', () => {
  let db: TaskPlannerDatabase;

  beforeEach(() => {
    db = new TaskPlannerDatabase(`test-replay-${Date.now()}-${Math.random()}`);
  });

  // §7.3: a remount mid-batch must not lose a message. The new reader finds it because the
  // cursor — not an in-memory set — says what has been read.
  it('a remount mid-batch re-reads the messages nobody read', async () => {
    await appendMessage({ teamId: TEAM, from: USER_PARTICIPANT_ID, to: [AGENT], content: 'one' }, db);
    await appendMessage({ teamId: TEAM, from: USER_PARTICIPANT_ID, to: [AGENT], content: 'two' }, db);

    // The first mount crashes after consuming only the first message.
    await advanceCursor(TEAM, AGENT, 1, db);

    // The remount reads exactly what the first mount never consumed.
    const cursor = await getCursor(TEAM, AGENT, db);
    const pending = await readMessagesAfter(TEAM, cursor.lastSeq, db);
    expect(pending.map((row) => row.content)).toEqual(['two']);
  });

  // §7.4: closing the database is a crash. An unread message is still unread on reopen,
  // because "unread" is a cursor row, not a memory flag.
  it('an unread message stays unread after the database is reopened', async () => {
    await appendMessage({ teamId: TEAM, from: USER_PARTICIPANT_ID, to: [LEAD], content: 'unread' }, db);
    expect((await getCursor(TEAM, LEAD, db)).lastSeq).toBe(0);

    db.close();
    await db.open();

    const cursor = await getCursor(TEAM, LEAD, db);
    expect(cursor.lastSeq).toBe(0);
    const pending = await readMessagesAfter(TEAM, cursor.lastSeq, db);
    expect(pending.map((row) => row.content)).toEqual(['unread']);
  });

  // §7.4: the converse — a message that WAS read stays read across a reopen.
  it('a read message stays read after the database is reopened', async () => {
    const { message } = await appendMessage(
      { teamId: TEAM, from: USER_PARTICIPANT_ID, to: [LEAD], content: 'read' },
      db
    );
    await advanceCursor(TEAM, LEAD, message.seq, db);

    db.close();
    await db.open();

    expect((await getCursor(TEAM, LEAD, db)).lastSeq).toBe(message.seq);
    expect(await readMessagesAfter(TEAM, message.seq, db)).toEqual([]);
  });

  // I3: two cursors over one log advance independently — one participant reading does not
  // mark anything read for the other.
  it('advances two cursors over one log independently', async () => {
    await appendMessage({ teamId: TEAM, from: USER_PARTICIPANT_ID, to: [LEAD, AGENT], content: 'both' }, db);
    await advanceCursor(TEAM, LEAD, 1, db);

    expect((await getCursor(TEAM, LEAD, db)).lastSeq).toBe(1);
    expect((await getCursor(TEAM, AGENT, db)).lastSeq).toBe(0);
  });
});
