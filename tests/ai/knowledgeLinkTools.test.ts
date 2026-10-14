// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db/index';
import { createTask } from '../../src/db/repositories/taskRepo';
import {
  isMutationTool,
  describeToolMutation,
  describeToolMutationWithContext,
  executeAiTool,
} from '../../src/services/ai/aiTools';
import {
  getKnowledgeLinksForEntity,
} from '../../src/db/repositories/knowledgeLinkRepo';

describe('AI Linking Tools with Mutation Confirmation (LINK-03, D-23)', () => {
  let testDb: TaskPlannerDatabase;

  beforeEach(async () => {
    testDb = new TaskPlannerDatabase('TestAiLinkingToolsDB_' + Math.random().toString(36).slice(2));
    await testDb.open();
  });

  afterEach(async () => {
    await testDb.delete();
  });

  it('registers link_taskmate_to_knowledge and unlink_taskmate_knowledge as mutation tools', () => {
    expect(isMutationTool('link_taskmate_to_knowledge')).toBe(true);
    expect(isMutationTool('unlink_taskmate_knowledge')).toBe(true);
  });

  it('describes tool mutation accurately in Vietnamese', async () => {
    const task = await createTask({ name: 'Implement Core Module' }, testDb);
    const setId = '00000000-0000-4000-8000-000000000001';

    const descLink = describeToolMutation('link_taskmate_to_knowledge', {
      taskMateEntityType: 'task',
      taskMateEntityId: task.id,
      setId,
      urn: 'urn:node:module:core',
      displayLabel: 'Core Module Node',
    });
    expect(descLink).toContain('Liên kết tri thức');
    expect(descLink).toContain('Core Module Node');

    const descContext = await describeToolMutationWithContext(
      'link_taskmate_to_knowledge',
      {
        taskMateEntityType: 'task',
        taskMateEntityId: task.id,
        setId,
        urn: 'urn:node:module:core',
        displayLabel: 'Core Module Node',
      },
      testDb
    );
    expect(descContext).toContain('Implement Core Module');
    expect(descContext).toContain('Core Module Node');

    const descUnlink = describeToolMutation('unlink_taskmate_knowledge', {
      taskMateEntityType: 'task',
      taskMateEntityId: task.id,
      urn: 'urn:node:module:core',
    });
    expect(descUnlink).toContain('Hủy liên kết tri thức');
  });

  it('executes link_taskmate_to_knowledge and creates KnowledgeLink record in Dexie', async () => {
    const task = await createTask({ name: 'Task For Linking' }, testDb);
    const setId = '00000000-0000-4000-8000-000000000001';

    const resultStr = await executeAiTool(
      'link_taskmate_to_knowledge',
      {
        taskMateEntityType: 'task',
        taskMateEntityId: task.id,
        setId,
        urn: 'urn:node:table:accounts',
        displayLabel: 'Bảng tài khoản',
      },
      testDb
    );

    const result = JSON.parse(resultStr);
    expect(result.success).toBe(true);
    expect(result.link).toBeDefined();

    const links = await getKnowledgeLinksForEntity('task', task.id, testDb);
    expect(links).toHaveLength(1);
    expect(links[0]?.displayLabel).toBe('Bảng tài khoản');
    expect(links[0]?.urn).toBe('urn:node:table:accounts');

    // Now execute unlink_taskmate_knowledge
    const unlinkStr = await executeAiTool(
      'unlink_taskmate_knowledge',
      {
        linkId: links[0]?.id,
      },
      testDb
    );
    const unlinkRes = JSON.parse(unlinkStr);
    expect(unlinkRes.success).toBe(true);

    const linksAfter = await getKnowledgeLinksForEntity('task', task.id, testDb);
    expect(linksAfter).toHaveLength(0);
  });

  it('fails if neither urn nor docId is provided', async () => {
    const task = await createTask({ name: 'Task With Invalid Link' }, testDb);
    const setId = '00000000-0000-4000-8000-000000000001';

    const resultStr = await executeAiTool(
      'link_taskmate_to_knowledge',
      {
        taskMateEntityType: 'task',
        taskMateEntityId: task.id,
        setId,
        displayLabel: 'Invalid Link',
      },
      testDb
    );

    const result = JSON.parse(resultStr);
    expect(result.error).toBeDefined();
  });
});
