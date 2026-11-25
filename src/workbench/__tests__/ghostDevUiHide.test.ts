import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const at = (relativePath: string): string => resolve(process.cwd(), relativePath);
const source = (relativePath: string): string => readFileSync(at(relativePath), 'utf8');

describe('Ghost Dev UI triggers hidden', () => {
  const taskDrawer = source('src/components/tasks/TaskDrawer.tsx');
  const taskTable = source('src/components/tasks/TaskTable.tsx');

  it('TaskDrawer has no Ghost Dev trigger but keeps the AI button', () => {
    expect(/Khởi chạy Ghost Dev|>\s*Ghost Dev\s*</.test(taskDrawer)).toBe(false);
    expect(taskDrawer.includes('Hỏi AI về tác vụ này')).toBe(true);
  });

  it('TaskTable context menu has no Ghost Dev item but keeps AI chat', () => {
    expect(taskTable.includes("key: 'run-ghost-dev'")).toBe(false);
    expect(taskTable.includes('Chạy Ghost Dev')).toBe(false);
    expect(taskTable.includes("key: 'ai-chat'")).toBe(true);
  });

  it('modal code and state survive with no trigger', () => {
    expect(existsSync(at('src/components/agents/RunGhostDevModal.tsx'))).toBe(true);
    expect(taskDrawer.includes('ghostDevModalOpen')).toBe(true);
    expect(taskTable.includes('ghostDevTask')).toBe(true);
  });
});

describe('Ghost Dev config surfaces hidden', () => {
  const settingsView = source('src/views/SettingsView.tsx');
  const configProfilesView = source('src/views/ConfigProfilesView.tsx');

  it('SettingsView has no Ghost Dev config but keeps the other AI cards', () => {
    expect(settingsView.includes('GhostDevConfigCard')).toBe(false);
    expect(settingsView.includes('Trợ lý AI & Ghost Dev')).toBe(false);
    expect(settingsView.includes('Trợ lý & Ghost Dev')).toBe(false);
    for (const card of [
      'GlobalConventionsCard',
      'AiToolCatalogCard',
      'NineRouterConfigCard',
      'KnowledgeServerConfigCard',
    ]) {
      expect(settingsView.includes(card)).toBe(true);
    }
  });

  it('ConfigProfilesView has no Ghost Dev card but keeps the data helpers', () => {
    expect(configProfilesView.includes('profile-ghost-dev-section')).toBe(false);
    expect(configProfilesView.includes('Ghost Dev config')).toBe(false);
    expect(configProfilesView.includes('profile-ai-team-section')).toBe(true);
    expect(configProfilesView.includes('ghostDevConfig')).toBe(true);
  });

  it('runtime notification code stays intact', () => {
    for (const path of [
      'src/components/settings/GhostDevConfigCard.tsx',
      'src/services/agents/ghostDevConfig.ts',
      'src/AppIntelliJ.tsx',
    ]) {
      expect(existsSync(at(path))).toBe(true);
    }
    expect(source('src/AppIntelliJ.tsx').includes('useGhostDevNotifications')).toBe(true);
  });
});
