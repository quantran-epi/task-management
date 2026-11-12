// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { TaskPlannerDatabase } from '../../../../src/db';
import {
  advanceCursor,
  appendMessage,
  getCursor,
  listMessages,
} from '../../../../src/services/ai/office/teamEventLog';
import {
  createTeamConsumer,
  type TeamPresence,
} from '../../../../src/services/ai/office/teamConsumer';
import { USER_PARTICIPANT_ID } from '../../../../src/types/teamChat';

const TEAM = 'team-1';
const LEAD = 'lead-1';
const AGENT = 'agent-1';

describe('teamConsumer — one loop per participant', () => {
  let db: TaskPlannerDatabase;

  beforeEach(() => {
    db = new TaskPlannerDatabase(`test-consumer-${Date.now()}-${Math.random()}`);
  });

  const consumerFor = (
    participantId: string,
    handle: (content: string) => Promise<void>,
    onPresence?: (p: TeamPresence) => void
  ) =>
    createTeamConsumer({
      teamId: TEAM,
      participantId,
      db,
      handle: (message) => handle(message.content),
      ...(onPresence ? { onPresence } : {}),
    });

  // I3: two participants over one log do not block each other.
  it('gives every participant its own cursor over the same log', async () => {
    await appendMessage({ teamId: TEAM, from: USER_PARTICIPANT_ID, to: [LEAD], content: 'a' }, db);
    await appendMessage({ teamId: TEAM, from: USER_PARTICIPANT_ID, to: [AGENT], content: 'b' }, db);

    const seenByLead: string[] = [];
    const seenByAgent: string[] = [];
    await consumerFor(LEAD, async (c) => void seenByLead.push(c)).pump();
    await consumerFor(AGENT, async (c) => void seenByAgent.push(c)).pump();

    // §1.1: both read the whole log, so both cursors cover both messages.
    expect(seenByLead).toEqual(['a']);
    expect(seenByAgent).toEqual(['b']);
    expect((await getCursor(TEAM, LEAD, db)).lastSeq).toBe(2);
    expect((await getCursor(TEAM, AGENT, db)).lastSeq).toBe(2);
  });

  // I4: reading IS the receipt, and the time is the cursor's.
  it('advances the cursor past messages it only read', async () => {
    await appendMessage({ teamId: TEAM, from: USER_PARTICIPANT_ID, to: [AGENT], content: 'not for lead' }, db);
    const seen: string[] = [];
    await consumerFor(LEAD, async (c) => void seen.push(c)).pump();

    expect(seen).toEqual([]);
    const cursor = await getCursor(TEAM, LEAD, db);
    expect(cursor.lastSeq).toBe(1);
    expect(cursor.updatedAt).not.toBe(new Date(0).toISOString());
  });

  // C2: reading and acting are separate. The read happened, so the cursor advances even
  // when the handler throws — a retry would double-write a report. The message stays in the
  // log and the transcript; surfacing the failure is the handler's job.
  it('advances past a message whose handler threw, without re-running it', async () => {
    await appendMessage({ teamId: TEAM, from: USER_PARTICIPANT_ID, to: [AGENT], content: 'one' }, db);
    await appendMessage({ teamId: TEAM, from: USER_PARTICIPANT_ID, to: [AGENT], content: 'two' }, db);

    let attempts = 0;
    const consumer = consumerFor(AGENT, async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('boom');
    });

    await expect(consumer.pump()).rejects.toThrow('boom');
    // Stopped at the failing message, not past it: the batch is not silently skipped.
    expect((await getCursor(TEAM, AGENT, db)).lastSeq).toBe(1);

    await consumer.pump();
    expect((await getCursor(TEAM, AGENT, db)).lastSeq).toBe(2);
    expect(attempts).toBe(2);
  });

  // C1: presence is local, so it cannot outlive the loop.
  it('reports working while handling and idle when caught up', async () => {
    await appendMessage({ teamId: TEAM, from: USER_PARTICIPANT_ID, to: [AGENT], content: 'x' }, db);
    const states: TeamPresence[] = [];
    const consumer = consumerFor(AGENT, async () => {}, (p) => states.push(p));

    await consumer.pump();
    expect(states).toEqual(['working', 'idle']);
    expect(consumer.presence()).toBe('idle');
  });

  it('reports offline once stopped', async () => {
    const consumer = consumerFor(AGENT, async () => {});
    consumer.stop();
    expect(consumer.presence()).toBe('offline');
  });

  // I2: an idle consumer is parked on the log, not asleep on a timer.
  it('wakes and handles a message appended after it went idle', async () => {
    const handled: string[] = [];
    const consumer = consumerFor(AGENT, async (c) => void handled.push(c));
    consumer.start();

    // Let the loop reach the parked state before appending.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(handled).toEqual([]);

    await appendMessage({ teamId: TEAM, from: USER_PARTICIPANT_ID, to: [AGENT], content: 'late' }, db);
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(handled).toEqual(['late']);
    consumer.stop();
  });

  // I1: a message appended mid-handling is read next, not lost.
  it('picks up a message appended while it was handling another', async () => {
    const handled: string[] = [];
    const consumer = consumerFor(AGENT, async (content) => {
      handled.push(content);
      if (content === 'first') {
        await appendMessage(
          { teamId: TEAM, from: USER_PARTICIPANT_ID, to: [AGENT], content: 'second' },
          db
        );
      }
    });

    await appendMessage({ teamId: TEAM, from: USER_PARTICIPANT_ID, to: [AGENT], content: 'first' }, db);
    await consumer.pump();

    expect(handled).toEqual(['first', 'second']);
    expect(await listMessages(TEAM, db)).toHaveLength(2);
  });

  // A stopped consumer must not consume: the cursor stays where it was.
  it('stops consuming once stopped', async () => {
    await appendMessage({ teamId: TEAM, from: USER_PARTICIPANT_ID, to: [AGENT], content: 'x' }, db);
    const handled: string[] = [];
    const consumer = consumerFor(AGENT, async (c) => void handled.push(c));
    consumer.stop();
    await consumer.pump();

    expect(handled).toEqual([]);
    expect((await getCursor(TEAM, AGENT, db)).lastSeq).toBe(0);
  });

  // Two pumps in the same tick must not double-handle one message.
  it('serializes concurrent pumps', async () => {
    await appendMessage({ teamId: TEAM, from: USER_PARTICIPANT_ID, to: [AGENT], content: 'x' }, db);
    const handled: string[] = [];
    const consumer = consumerFor(AGENT, async (c) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      handled.push(c);
    });

    await Promise.all([consumer.pump(), consumer.pump()]);
    expect(handled).toEqual(['x']);
  });

  it('leaves an already-advanced cursor alone', async () => {
    await appendMessage({ teamId: TEAM, from: USER_PARTICIPANT_ID, to: [AGENT], content: 'x' }, db);
    await advanceCursor(TEAM, AGENT, 1, db);
    const handled: string[] = [];
    await consumerFor(AGENT, async (c) => void handled.push(c)).pump();
    expect(handled).toEqual([]);
  });
});
