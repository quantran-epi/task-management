// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { TaskPlannerDatabase } from '../../../../src/db';
import {
  advanceCursor,
  appendForExistingMessage,
  appendMessage,
  deliveryStateFor,
  getCursor,
  headSeq,
  listMessages,
  readMessagesAfter,
  seenBy,
} from '../../../../src/services/ai/office/teamEventLog';
import { USER_PARTICIPANT_ID } from '../../../../src/types/teamChat';

const TEAM = 'team-1';
const LEAD = 'lead-1';
const AGENT = 'agent-1';

describe('teamEventLog — the unified message log', () => {
  let db: TaskPlannerDatabase;

  beforeEach(() => {
    db = new TaskPlannerDatabase(`test-team-log-${Date.now()}-${Math.random()}`);
  });

  // L1: an unaddressed message is not a message. This is the structural fix for 37.1 gap 5,
  // where `targetAgentId` was an optional field that could simply be missing.
  it('refuses to append a message with no recipient', async () => {
    await expect(
      appendMessage({ teamId: TEAM, from: USER_PARTICIPANT_ID, to: [], content: 'x' }, db)
    ).rejects.toThrow('TEAM_MESSAGE_UNADDRESSED');
  });

  // L2: `seq` is monotonic per team, allocated inside the append transaction.
  it('allocates a monotonic seq per team, even under concurrent appends', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        appendMessage(
          { teamId: TEAM, from: USER_PARTICIPANT_ID, to: [LEAD], content: `m${index}` },
          db
        )
      )
    );
    const seqs = results.map((row) => row.message.seq).sort((a, b) => a - b);
    expect(seqs).toEqual([1, 2, 3, 4, 5]);
    expect(await headSeq(TEAM, db)).toBe(5);
  });

  it('keeps seq independent per team', async () => {
    await appendMessage({ teamId: TEAM, from: USER_PARTICIPANT_ID, to: [LEAD], content: 'a' }, db);
    const other = await appendMessage(
      { teamId: 'team-2', from: USER_PARTICIPANT_ID, to: [LEAD], content: 'b' },
      db
    );
    expect(other.message.seq).toBe(1);
  });

  // 37.1 §1.1: everyone reads the whole log; `to[]` only decides who must respond.
  it('reads the whole log, so a non-recipient still sees the message', async () => {
    await appendMessage({ teamId: TEAM, from: USER_PARTICIPANT_ID, to: [LEAD], content: 'to lead' }, db);
    await appendMessage({ teamId: TEAM, from: USER_PARTICIPANT_ID, to: [AGENT], content: 'to agent' }, db);
    await appendMessage({ teamId: TEAM, from: LEAD, to: [AGENT], content: 'lead to agent' }, db);

    const all = await readMessagesAfter(TEAM, 0, db);
    expect(all.map((row) => row.content)).toEqual(['to lead', 'to agent', 'lead to agent']);

    // What each participant owes a reply to is a filter, not a different query.
    expect(all.filter((row) => row.to.includes(AGENT)).map((row) => row.content)).toEqual([
      'to agent',
      'lead to agent',
    ]);
    expect(all.filter((row) => row.to.includes(LEAD)).map((row) => row.content)).toEqual(['to lead']);
  });

  // The exclusive lower bound is what stops a drained steer from being injected twice.
  it('does not re-read the message at the cursor', async () => {
    const first = await appendMessage(
      { teamId: TEAM, from: USER_PARTICIPANT_ID, to: [AGENT], content: 'one' },
      db
    );
    await appendMessage({ teamId: TEAM, from: USER_PARTICIPANT_ID, to: [AGENT], content: 'two' }, db);

    await advanceCursor(TEAM, AGENT, first.message.seq, db);
    const rest = await readMessagesAfter(TEAM, first.message.seq, db);
    expect(rest.map((row) => row.content)).toEqual(['two']);
  });

  // L3: a cursor only moves forward, so a replay cannot un-read a message.
  it('never moves a cursor backward', async () => {
    await advanceCursor(TEAM, AGENT, 5, db);
    const after = await advanceCursor(TEAM, AGENT, 2, db);
    expect(after.lastSeq).toBe(5);
  });

  // I4: advancing the cursor IS the read receipt.
  it('reports who read a message and when', async () => {
    const { message } = await appendMessage(
      { teamId: TEAM, from: USER_PARTICIPANT_ID, to: [LEAD, AGENT], content: 'hello' },
      db
    );
    const names = new Map([
      [LEAD, 'Minh'],
      [AGENT, 'Eva'],
    ]);

    expect(await seenBy(message, names, db)).toEqual([]);

    await advanceCursor(TEAM, AGENT, message.seq, db);
    const seen = await seenBy(message, names, db);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ participantId: AGENT, participantName: 'Eva' });
    expect(seen[0]!.at).toBeTruthy();

    // A participant the message was not addressed to never counts as a reader.
    await advanceCursor(TEAM, 'stranger', message.seq, db);
    expect(await seenBy(message, names, db)).toHaveLength(1);
  });

  it('derives the three delivery states from the cursor', async () => {
    const { message } = await appendMessage(
      { teamId: TEAM, from: USER_PARTICIPANT_ID, to: [AGENT], content: 'x' },
      db
    );
    const before = await getCursor(TEAM, AGENT, db);
    expect(deliveryStateFor(message, AGENT, before)).toBe('delivered');
    expect(deliveryStateFor(message, LEAD, before)).toBe('sent');

    const after = await advanceCursor(TEAM, AGENT, message.seq, db);
    expect(deliveryStateFor(message, AGENT, after)).toBe('read');
  });

  // One message id, two projections: the routing row shares the ChatMessage's id.
  it('projects an already-persisted message onto the log with the same id', async () => {
    const projected = await appendForExistingMessage(
      {
        id: 'chat-message-1',
        teamId: TEAM,
        from: USER_PARTICIPANT_ID,
        to: [LEAD],
        content: 'hello',
        kind: 'instruction',
      },
      db
    );
    expect(projected.id).toBe('chat-message-1');
    expect(projected.seq).toBe(1);

    // Idempotent: a repeat call returns the stored row and appends nothing.
    const again = await appendForExistingMessage(
      { id: 'chat-message-1', teamId: TEAM, from: USER_PARTICIPANT_ID, to: [LEAD], content: 'hello' },
      db
    );
    expect(again.seq).toBe(1);
    expect(await listMessages(TEAM, db)).toHaveLength(1);
  });

  it('lists messages in seq order', async () => {
    await appendMessage({ teamId: TEAM, from: USER_PARTICIPANT_ID, to: [LEAD], content: 'a' }, db);
    await appendMessage({ teamId: TEAM, from: LEAD, to: [USER_PARTICIPANT_ID], content: 'b' }, db);
    const rows = await listMessages(TEAM, db);
    expect(rows.map((row) => row.content)).toEqual(['a', 'b']);
  });
});
