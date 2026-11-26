/**
 * Quick 261126-rfx browser harness. Mounts the REAL standalone AppIntelliJ boot path
 * with its own DB and a synthetic Tauri IPC shim for confined SSH fixture data.
 * No DB or component mocks beyond the IPC boundary; not in production bundle.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import JSZip from 'jszip';
import AppIntelliJ from '../src/AppIntelliJ';
import { chatWindowDb } from '../src/db/chatWindowDb';
import type { SshConfig } from '../src/types/ssh';
import { SSH_FS_TOOL_CONFIG_KEY } from '../src/types/sshFsTool';
import { SSH_CONFIGS_SETTING_KEY } from '../src/types/ssh';
import { executeAiTool } from '../src/services/ai/aiTools';
import { getGatedAddenda, getToolsForTurnWithRemote } from '../src/services/ai/chatTurnTools';
import {
  attachmentOutOfScope,
  resolveTeamAttachmentScope,
} from '../src/services/ai/office/teamRunCoordinator';
import '../src/styles/workbench-tokens.css';

const SSH_CONFIG: SshConfig = {
  id: 'rfx-fixture-ssh',
  name: 'Rfx fixture SSH',
  host: 'fixture.invalid',
  port: 22,
  username: 'uat',
  authType: 'password',
  createdAt: '2026-11-26T00:00:00.000Z',
  updatedAt: '2026-11-26T00:00:00.000Z',
};

const BASE = '/srv/taskmate-fixture';
const DOCX_PATH = `${BASE}/reports/plan.docx`;
const TXT_PATH = `${BASE}/reports/summary.txt`;
const DOCX_TEXT = 'Kế hoạch: 6 giờ mỗi ngày.';

async function makeDocxBytes(): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${DOCX_TEXT}</w:t></w:r></w:p><w:p><w:r><w:t>Phân đoạn thứ hai.</w:t></w:r></w:p></w:body></w:document>`,
  );
  return zip.generateAsync({ type: 'arraybuffer' });
}

interface TauriShim {
  invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
  transformCallback: (fn: (payload: unknown) => void, once?: boolean) => number;
  metadata: { currentWindow: { label: string }; currentWebview: { label: string } };
}

interface RfxFixture {
  paths: { docx: string; txt: string };
  /** Production tool payload helpers — stand/dock/team share one definition set. */
  standaloneTools: () => string[];
  dockTools: () => string[];
  teamTools: () => string[];
  teamScope: (paths: string[], repoPaths: string[]) => {
    scope: unknown;
    refusal: string | null;
  };
  /** Real executor with an out-of-scope model path and a valid attached identity set. */
  dispatchOutOfScope: () => Promise<string>;
}

async function installTauriShim(withFixtureKey: boolean): Promise<void> {
  const docxBytes = await makeDocxBytes();
  const callbacks = new Map<number, (payload: unknown) => void>();
  let nextId = 1;
  const shim: TauriShim = {
    metadata: {
      currentWindow: { label: 'main' },
      currentWebview: { label: 'main' },
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
          return withFixtureKey ? 'sk-rfx-fixture-key' : null;
        case 'select_local_file':
          return TXT_PATH;
        case 'ssh_list_dir':
          return [
            {
              name: 'plan.docx',
              path: DOCX_PATH,
              isDir: false,
              isSymlink: false,
              size: docxBytes.byteLength,
              modified: 0,
            },
            {
              name: 'summary.txt',
              path: TXT_PATH,
              isDir: false,
              isSymlink: false,
              size: 64,
              modified: 0,
            },
          ];
        case 'ssh_exec_command': {
          const command = String(args.command ?? '');
          if (command.includes('grep')) {
            return {
              stdout: `${TXT_PATH}:2:CAPACITY 6h`,
              stderr: '',
              exitStatus: 0,
              finishReason: 'complete',
            };
          }
          if (command.includes('find')) {
            return {
              stdout: [DOCX_PATH, TXT_PATH].join('\n'),
              stderr: '',
              exitStatus: 0,
              finishReason: 'complete',
            };
          }
          return { stdout: '', stderr: '', exitStatus: 0, finishReason: 'complete' };
        }
        case 'ssh_read_file_slice':
          return {
            lines: ['# Kế hoạch', 'CAPACITY 6h', 'Xong'],
            totalLines: 3,
            limit: 100,
            hasMore: false,
          };
        case 'ssh_read_file_bytes':
          return String(args.remotePath ?? '').endsWith('.docx')
            ? docxBytes
            : new TextEncoder().encode('fixture text').buffer;
        case 'ssh_test_connection':
          return 'fixture connection ok';
        case 'graphiti_mcp_request': {
          const body = JSON.parse(String(args.body ?? '{}')) as { method?: string; id?: number };
          const result = body.method === 'tools/list' ? { tools: [] } : {
            protocolVersion: '2025-03-26',
            capabilities: {},
            serverInfo: { name: 'rfx-fixture-mcp', version: '0' },
          };
          return {
            status: 200,
            headers: { 'mcp-session-id': 'rfx-fixture-session' },
            body: JSON.stringify({ jsonrpc: '2.0', id: body.id ?? 1, result }),
          };
        }
        case 'ai_proxy_request': {
          const response = await fetch(String(args.url ?? ''), {
            method: String(args.method ?? 'GET'),
            headers: (args.headers ?? {}) as Record<string, string>,
            body: typeof args.body === 'string' ? args.body : undefined,
          });
          return {
            status: response.status,
            headers: Object.fromEntries(response.headers.entries()),
            body: await response.text(),
          };
        }
        case 'plugin:event|listen': {
          const id = nextId++;
          callbacks.set(id, () => undefined);
          return id;
        }
        case 'plugin:event|unlisten':
          return null;
        case 'plugin:event|emit':
        case 'plugin:event|emit_to':
          return null;
        default:
          // Window/geometry commands are best-effort in the harness; no-op keeps the
          // standalone boot path alive without widening the SSH fixture surface.
          return null;
      }
    },
  };
  (window as unknown as { __TAURI_INTERNALS__?: TauriShim }).__TAURI_INTERNALS__ = shim;
}

function HarnessShell() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, minHeight: 0 }}>
        <AppIntelliJ standaloneChat />
      </div>
    </div>
  );
}

const familyOptions = {
  effectiveAnalysisMode: true,
  globalSshConfigReady: true,
  hasRemoteTarget: false,
  oracleConfigReady: false,
} as const;

function toolNames(tools: ReadonlyArray<{ function: { name: string } }>): string[] {
  return tools.map((tool) => tool.function.name);
}

(window as unknown as { __rfxFixture: RfxFixture }).__rfxFixture = {
  paths: { docx: DOCX_PATH, txt: TXT_PATH },
  standaloneTools: () => toolNames(getToolsForTurnWithRemote({ ...familyOptions, standaloneCapability: true })),
  dockTools: () => toolNames(getToolsForTurnWithRemote({ ...familyOptions, standaloneCapability: false })),
  teamTools: () => toolNames(getGatedAddenda({
    team: { sshFsToolsEnabled: true, oracleToolsEnabled: false } as any,
    sshConfigReady: true,
    oracleConfigReady: false,
  })),
  teamScope: (paths, repoPaths) => {
    const scope = resolveTeamAttachmentScope(paths, repoPaths, [], 'rfx-team');
    return { scope, refusal: scope ? null : attachmentOutOfScope() };
  },
  dispatchOutOfScope: () => executeAiTool(
    'ssh_attached_file_read',
    { path: '/etc/passwd', offset: 1, limit: 3 },
    chatWindowDb,
    undefined,
    { attachedPaths: [DOCX_PATH], attachmentScope: { attachedPaths: [DOCX_PATH] } },
  ),
};

window.location.hash = '#ai-popout';

const root = createRoot(document.getElementById('root')!);
// `?rfx=ui` mounts the real settings flow with an empty SSH config list (ky8 legacy test).
// Default mount seeds the 261126-rfx fixture for the attached-file tool flow.
const seedRfxFixture = new URLSearchParams(window.location.search).get('rfx') !== 'ui';
void Promise.all([
  installTauriShim(seedRfxFixture),
  chatWindowDb.settings.bulkPut([
    ...(seedRfxFixture
      ? [
          { key: SSH_CONFIGS_SETTING_KEY, value: [SSH_CONFIG] },
          {
            key: SSH_FS_TOOL_CONFIG_KEY,
            value: {
              sshConfigId: SSH_CONFIG.id,
              defaultBasePath: BASE,
              maxLinesPerRead: 100,
              maxListEntries: 100,
              maxGrepMatches: 50,
            },
          },
          { key: 'ninerouter_api_key', value: 'sk-rfx-fixture-key' },
          { key: 'ninerouter_endpoint', value: 'http://localhost:20128' },
          { key: 'ninerouter_default_model', value: 'rfx-fixture-model' },
        ]
      : []),
  ]),
]).then(() => {
  root.render(<HarnessShell />);
});
