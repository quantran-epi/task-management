/**
 * Phase 48 D-21 browser harness. Mounts the REAL Coding Zone components with confined,
 * synthetic SSH responses via a minimal Tauri IPC shim. Not part of the production bundle.
 */
import React, { useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigProvider } from 'antd';
import { AIChatProvider } from '../src/context/AIChatContext';
import { CodingZoneTrigger } from '../src/components/agents/office/CodingZoneTrigger';
import { CodingZonePopoutView } from '../src/views/CodingZonePopoutView';
import type { CodingZoneMessage } from '../src/components/agents/CodingZoneChatStrip';
import type { DiffFile } from '../src/types/agent';
import type { WorktreeDescriptor } from '../src/types/codingZone';
import { SSH_CONFIGS_SETTING_KEY, type SshConfig } from '../src/types/ssh';
import { db } from '../src/db';
import '../src/styles/workbench-tokens.css';

interface TauriShim {
  invoke: (cmd: string, args?: any) => Promise<any>;
  transformCallback: (fn: (payload: any) => void, once?: boolean) => number;
  metadata: { currentWindow: { label: string }; currentWebview: { label: string } };
}

declare global {
  interface Window {
    __TAURI_INTERNALS__?: TauriShim;
    __codingZoneFixtureSent?: string[];
  }
}

const DESCRIPTOR: WorktreeDescriptor = {
  sshConfigId: 'fixture-ssh',
  remoteRepoPath: '/srv/taskmate-fixture/repo',
  remoteWorktreePath: '/srv/taskmate-fixture/repo/.taskmate-worktrees/agent-developer-uat',
  branch: 'taskmate/agent-developer-uat',
};

const CONFIG: SshConfig = {
  id: 'fixture-ssh',
  name: 'Fixture SSH',
  host: 'fixture.invalid',
  port: 22,
  username: 'uat',
  authType: 'key',
  keyPath: '/fixture/id_ed25519',
  createdAt: '2026-11-20T00:00:00.000Z',
  updatedAt: '2026-11-20T00:00:00.000Z',
};

const FILE_CONTENT = [
  'export function planHours(hours: number): number {',
  '  const capped = Math.min(hours, 8);',
  '  return capped;',
  '}',
].join('\n');

const DIFF_FILES: DiffFile[] = [
  {
    oldPath: 'src/planner/planHours.ts',
    newPath: 'src/planner/planHours.ts',
    status: 'modified',
    additions: 2,
    deletions: 2,
    hunks: [
      {
        oldStart: 1,
        oldCount: 4,
        newStart: 1,
        newCount: 5,
        header: '@@ -1,4 +1,5 @@',
        lines: [
          { type: 'context', oldLineNumber: 1, newLineNumber: 1, content: 'export function planHours(hours: number): number {' },
          { type: 'delete', oldLineNumber: 2, content: '  return hours;' },
          { type: 'add', newLineNumber: 2, content: '  const capped = Math.min(hours, 8);' },
          { type: 'add', newLineNumber: 3, content: '  return capped;' },
          { type: 'context', oldLineNumber: 3, newLineNumber: 4, content: '}' },
        ],
      },
      {
        oldStart: 8,
        oldCount: 1,
        newStart: 9,
        newCount: 1,
        header: '@@ -8,1 +9,1 @@',
        lines: [
          { type: 'delete', oldLineNumber: 8, content: 'export const LIMIT = 12;' },
          { type: 'add', newLineNumber: 9, content: 'export const LIMIT = 8;' },
        ],
      },
    ],
  },
];

const ALL_FILES = [
  'src/planner/planHours.ts',
  'src/planner/notes.md',
  'src/services/sshWorktreeService.ts',
  'README.md',
];

const INITIAL_MESSAGES: CodingZoneMessage[] = [
  { id: 'm1', author: 'Bạn', time: '09:00', text: 'Kiểm tra worktree trước khi duyệt diff.', kind: 'chat' },
  { id: 'm2', author: 'Agent Developer', time: '09:01', text: 'Đã chuẩn bị thay đổi trong worktree riêng.', kind: 'agent' },
];

function installTauriShim(): void {
  const isPopout = window.location.hash === '#/coding-zone-popout';
  let nextId = 1;
  const callbacks = new Map<number, (payload: any) => void>();
  const listeners = new Map<string, Set<number>>();
  let popoutHandle: Window | null = null;

  const dispatchLocal = (event: string, payload: unknown) => {
    for (const id of listeners.get(event) ?? []) {
      callbacks.get(id)?.({ event, payload });
    }
  };

  const emitRemote = (event: string, payload: unknown) => {
    const handle = popoutHandle && !popoutHandle.closed ? popoutHandle : window.open('', 'taskmate-coding-zone-popout');
    if (handle && !handle.closed) {
      // Give the secondary window time to mount its event listener before handoff arrives.
      setTimeout(() => {
        try { handle.postMessage({ __tauriEvent: event, payload }, window.location.origin); } catch { /* noop */ }
      }, 250);
    }
  };

  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin) return;
    const data = event.data as { __tauriEvent?: string; payload?: unknown } | null;
    if (data && typeof data.__tauriEvent === 'string') dispatchLocal(data.__tauriEvent, data.payload);
  });

  const shim: TauriShim = {
    metadata: {
      currentWindow: { label: isPopout ? 'coding-zone-popout' : 'main' },
      currentWebview: { label: isPopout ? 'coding-zone-popout' : 'main' },
    },
    transformCallback: (fn, once = false) => {
      const id = nextId++;
      callbacks.set(id, (payload) => {
        if (once) callbacks.delete(id);
        fn(payload);
      });
      return id;
    },
    invoke: async (cmd, args = {}) => {
      switch (cmd) {
        case 'get_credential':
          return null;
        case 'ssh_test_connection':
          return 'fixture connection ok';
        case 'ssh_exec_command': {
          const command = String(args.command ?? '');
          if (command.includes('cat-file')) return { stdout: FILE_CONTENT, stderr: '', exitStatus: 0 };
          if (command.includes('git apply')) return { stdout: '', stderr: '', exitStatus: 0 };
          if (command.includes('git ls-files')) return { stdout: ALL_FILES.join('\n'), stderr: '', exitStatus: 0 };
          return { stdout: '', stderr: '', exitStatus: 0 };
        }
        case 'plugin:event|listen': {
          const event = String(args.event ?? '');
          const id = Number(args.handler);
          if (!listeners.has(event)) listeners.set(event, new Set());
          listeners.get(event)!.add(id);
          return id;
        }
        case 'plugin:event|unlisten': {
          for (const set of listeners.values()) set.delete(Number(args.eventId));
          return null;
        }
        case 'plugin:event|emit':
          dispatchLocal(String(args.event ?? ''), args.payload);
          return null;
        case 'plugin:event|emit_to': {
          dispatchLocal(String(args.event ?? ''), args.payload);
          emitRemote(String(args.event ?? ''), args.payload);
          return null;
        }
        case 'plugin:window|get_all_windows':
          return popoutHandle && !popoutHandle.closed ? [{ label: 'coding-zone-popout' }] : [];
        case 'plugin:webview|create_webview_window': {
          const url = new URL(String(args.options?.url ?? ''), window.location.href).href;
          popoutHandle = window.open(url, 'taskmate-coding-zone-popout', 'width=1200,height=800,resizable=yes');
          dispatchLocal('tauri://created', {});
          return null;
        }
        case 'plugin:window|show':
        case 'plugin:window|set_focus':
        case 'plugin:webview|show':
        case 'plugin:webview|set_focus':
          return null;
        case 'plugin:window|close':
        case 'plugin:webview|close':
          window.close();
          return null;
        default:
          throw new Error(`Unmocked Tauri command: ${cmd}`);
      }
    },
  };
  window.__TAURI_INTERNALS__ = shim;
}

installTauriShim();

const FixtureMain: React.FC = () => {
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const onSend = useCallback((text: string) => {
    window.__codingZoneFixtureSent = [...(window.__codingZoneFixtureSent ?? []), text];
    setMessages((current) => [...current, {
      id: `sent-${current.length + 1}`, author: 'Bạn', time: '09:02', text, kind: 'chat',
    }]);
  }, []);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <header data-testid="fixture-header" style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
        <strong>Agent Developer</strong>
        <span>Phiên đang chạy</span>
        <CodingZoneTrigger
          active
          descriptor={DESCRIPTOR}
          sshConfig={CONFIG}
          messages={messages}
          connection="connected"
          onlineCount={2}
          allFiles={ALL_FILES}
          diffFiles={DIFF_FILES}
          diffRevision={1}
          onSendMessage={onSend}
        />
      </header>
      <main data-testid="fixture-body" style={{ flex: 1, padding: 16 }}>Team workspace</main>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);

// Seed only the synthetic SSH config row the confined worktree verbs resolve through.
void db.settings.put({ key: SSH_CONFIGS_SETTING_KEY, value: [CONFIG] }).finally(() => {
  root.render(
    <ConfigProvider>
      <AIChatProvider>
        {window.location.hash === '#/coding-zone-popout' ? <CodingZonePopoutView /> : <FixtureMain />}
      </AIChatProvider>
    </ConfigProvider>
  );
});
