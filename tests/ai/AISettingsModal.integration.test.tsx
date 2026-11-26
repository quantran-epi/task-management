// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db';
import { generateId } from '../../src/utils/uuid';
import { AISettingsDrawer } from '../../src/components/ai/AISettingsDrawer';

vi.mock('../../src/utils/timerPopout', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/utils/timerPopout')>()),
  isTauriApp: vi.fn(() => false),
}));

describe('AI settings Modal reads real db.settings', () => {
  let dbName: string;
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    dbName = `AISettingsModal_${generateId()}`;
    db = new TaskPlannerDatabase(dbName);
    await db.open();
    await db.settings.put({ key: 'ninerouter_endpoint', value: 'https://ai.example.test/v1' });
  });

  afterEach(async () => {
    cleanup();
    db.close();
    await Dexie.delete(dbName);
  });

  it('loads the persisted endpoint into the real NineRouter card inside the full-width Modal', async () => {
    render(<AISettingsDrawer open onClose={() => {}} db={db} />);

    await waitFor(() => {
      const input = screen.getByText('API Endpoint').closest('.ant-form-item')?.querySelector('input');
      expect(input).toHaveValue('https://ai.example.test/v1');
    });

    expect(document.querySelector('.ant-modal-container')).not.toBeNull();
    expect(document.querySelector('.ant-drawer')).toBeNull();
    const modal = screen.getByText('AI Settings · tất cả').closest('.ant-modal') as HTMLElement | null;
    expect(modal?.style.width).toBe('calc(100vw - 48px)');
  });
});
