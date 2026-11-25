import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const readText = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

const readJson = <T>(relativePath: string): T => JSON.parse(readText(relativePath)) as T;

interface TauriWindow {
  title?: string;
  url?: string;
  width?: number;
  height?: number;
  minWidth?: number;
  minHeight?: number;
  resizable?: boolean;
  fullscreen?: boolean;
}

interface TauriConfig {
  productName: string;
  identifier: string;
  build: {
    beforeDevCommand: string;
    beforeBuildCommand: string;
    devUrl: string;
    frontendDist: string;
  };
  app: { windows: TauriWindow[] };
}

interface Capabilities {
  windows: string[];
  permissions: string[];
}

interface PackageJson {
  scripts: Record<string, string>;
}

const BASE_SCRIPTS: Record<string, string> = {
  dev: 'vite',
  build: 'tsc && vite build',
  test: 'vitest run',
  'test:knowledge': 'npm --prefix knowledge-server test',
  'test:knowledge:live': 'node scripts/test-knowledge-live.mjs',
  'knowledge:dev': 'npm --prefix knowledge-server run dev',
  'knowledge:build': 'npm --prefix knowledge-server run build',
  'test:jira-proxy': 'node --test proxy/jira-proxy.test.mjs',
  'jira:proxy': 'node proxy/jira-proxy.mjs',
  preview: 'vite preview',
  benchmark: 'tsx scripts/run-benchmark.ts',
  'graph:benchmark': 'tsx scripts/run-graph-benchmark.ts',
  tauri: 'tauri',
  'tauri:dev': 'tauri dev',
  'tauri:build': 'tauri build',
  'test:e2e': 'playwright test',
  lint: 'eslint src',
  'test:foundation':
    'vitest run src/components/ui/__tests__ src/workbench/__tests__/shellRemoval.test.ts src/workbench/__tests__/mainBoot.test.ts src/workbench/__tests__/AntdThemeAdapter.test.tsx src/hooks/__tests__/themeBroadcast.test.ts --bail=1',
};

const BASE_WINDOW_FIELDS = {
  width: 1280,
  height: 800,
  minWidth: 900,
  minHeight: 600,
  resizable: true,
  fullscreen: false,
} as const;

const ORIGINAL_PERMISSIONS = [
  'core:default',
  'core:webview:allow-create-webview-window',
  'core:window:allow-set-always-on-top',
  'core:window:allow-is-always-on-top',
  'core:window:allow-set-focus',
  'core:window:allow-close',
  'core:window:allow-destroy',
  'core:window:allow-set-size',
  'core:window:allow-start-dragging',
  'notification:default',
];

describe('phase 51 chat bundle contract', () => {
  test('chat config declares a distinct TaskMate Chat identity', () => {
    const chat = readJson<TauriConfig>('src-tauri/tauri.conf.chat.json');
    const base = readJson<TauriConfig>('src-tauri/tauri.conf.json');

    expect(chat.productName).toBe('TaskMate Chat');
    expect(chat.identifier).toBe('com.personal.taskmate.chat');
    expect(chat.identifier).not.toBe(base.identifier);
  });

  test('chat main window seeds the hash route without losing base window fields', () => {
    const chat = readJson<TauriConfig>('src-tauri/tauri.conf.chat.json');

    expect(chat.app.windows).toHaveLength(1);
    const [mainWindow] = chat.app.windows;
    expect(mainWindow).toBeDefined();
    expect(mainWindow).toMatchObject({
      title: 'TaskMate Chat',
      url: 'index.html#ai-popout',
      ...BASE_WINDOW_FIELDS,
    });
  });

  test('chat npm scripts exist and pre-existing scripts stay byte-identical', () => {
    const { scripts } = readJson<PackageJson>('package.json');

    expect(scripts['tauri:build:chat']).toContain('-c src-tauri/tauri.conf.chat.json');
    expect(scripts['tauri:dev:chat']).toContain('-c src-tauri/tauri.conf.chat.json');
    for (const [name, command] of Object.entries(BASE_SCRIPTS)) {
      expect(scripts[name], `pre-existing script ${name}`).toBe(command);
    }
  });

  test('base config and capabilities remain unchanged', () => {
    const base = readJson<TauriConfig>('src-tauri/tauri.conf.json');
    const capabilities = readJson<Capabilities>('src-tauri/capabilities/default.json');

    expect(base.identifier).toBe('com.personal.taskplanner');
    expect(JSON.stringify(base.app.windows)).not.toContain('ai-popout');
    expect(capabilities.windows).toEqual(['*']);
    expect(capabilities.permissions).toEqual(ORIGINAL_PERMISSIONS);
  });

  test('chat Vite config defines the standalone marker without changing base behavior', () => {
    const chatViteSource = readText('vite.chat.config.ts');
    const baseViteSource = readText('vite.config.ts');

    // Marker is committed source, compiled into the bundle (never a gitignored .env file).
    expect(chatViteSource).toMatch(/['"]import\.meta\.env\.VITE_CHAT_STANDALONE['"]\s*:\s*['"]"1"['"]/);
    expect(chatViteSource).toMatch(/mergeConfig\(|baseConfig/);
    expect(chatViteSource).toContain("./vite.config");
    expect(chatViteSource).not.toMatch(/loadEnv|envDir|\.env\.(?:local|production|development)|\.env['"]/);

    // Chat config only overrides define; all other Vite behavior comes from base config.
    expect(chatViteSource).not.toContain("plugins:");
    expect(chatViteSource).not.toContain("worker:");
    expect(chatViteSource).not.toContain('base:');
    expect(chatViteSource).not.toContain('test:');
    expect(baseViteSource).toContain("plugins: [react()]");
    expect(baseViteSource).toContain("worker: { format: 'es' }");
    expect(baseViteSource).not.toContain('define:');
  });

  test('chat scripts build with the committed chat Vite config and no .env file', () => {
    const { scripts } = readJson<PackageJson>('package.json');
    const chatConfig = readJson<TauriConfig>('src-tauri/tauri.conf.chat.json');

    expect(scripts['build:chat']).toContain('vite build --config vite.chat.config.ts');
    expect(scripts['dev:chat']).toBe('vite --config vite.chat.config.ts');
    expect(chatConfig.build.beforeBuildCommand).toBe('npm run build:chat');
    expect(chatConfig.build.beforeDevCommand).toBe('npm run dev:chat');
    expect(scripts['tauri:build:chat']).toContain('-c src-tauri/tauri.conf.chat.json');
    expect(scripts['tauri:dev:chat']).toContain('-c src-tauri/tauri.conf.chat.json');
    for (const [name, script] of Object.entries(scripts)) {
      expect(script, `script ${name}`).not.toMatch(/\.env/);
    }
    const chatViteSource = readText('vite.chat.config.ts');
    expect(chatViteSource).toContain('VITE_CHAT_STANDALONE');
    expect(chatViteSource).not.toMatch(/loadEnv|envDir|\.env\.(?:local|production|development)|\.env['"]/);
  });
});
