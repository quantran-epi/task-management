import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const at = (relativePath: string): string => resolve(process.cwd(), relativePath);
const source = (relativePath: string): string => readFileSync(at(relativePath), 'utf8');

describe('Single-shell + zero-PWA source guard (SHELL-01..03)', () => {
  const main = source('src/main.tsx');
  const appIntelliJ = source('src/AppIntelliJ.tsx');
  const titleBar = source('src/workbench/TitleBar.tsx');
  const viteConfig = source('vite.config.ts');
  const pkg = source('package.json');

  it('boots AppIntelliJ unconditionally with no shell flag tokens', () => {
    expect(main.includes('<AppIntelliJ />')).toBe(true);
    expect(main.includes('shouldBootIntelliJ')).toBe(false);
    expect(main.includes('taskmate_ui_shell')).toBe(false);
    expect(main.includes('?ui=')).toBe(false);
    expect(/from ['"]\.\/App['"]/.test(main)).toBe(false);
  });

  it('AppIntelliJ owns every popout route and boot side effect', () => {
    expect(appIntelliJ.includes('coding-zone-popout')).toBe(true);
    expect(appIntelliJ.includes('CodingZonePopoutView')).toBe(true);
    expect(appIntelliJ.includes('attachGlobalToolTaskListener')).toBe(true);
    expect(appIntelliJ.includes('useGhostDevNotifications')).toBe(true);
    expect(appIntelliJ.includes('ServiceWorkerProvider')).toBe(false);
  });

  it('TitleBar has no shell switch', () => {
    expect(titleBar.includes('taskmate_ui_shell')).toBe(false);
    expect(titleBar.includes('handleSwitchShell')).toBe(false);
  });

  it('vite config has no PWA plugin, manifest, workbox or virtual alias', () => {
    expect(viteConfig.includes('VitePWA')).toBe(false);
    expect(viteConfig.includes('vite-plugin-pwa')).toBe(false);
    expect(viteConfig.includes('virtual:pwa-register')).toBe(false);
    expect(viteConfig.includes('manifest:')).toBe(false);
    expect(viteConfig.includes('workbox:')).toBe(false);
  });

  it('package.json has no PWA dependencies', () => {
    expect(pkg.includes('vite-plugin-pwa')).toBe(false);
    expect(pkg.includes('workbox-window')).toBe(false);
  });

  it('legacy shell and PWA sources no longer exist', () => {
    for (const path of [
      'src/App.tsx',
      'src/hooks/usePWAInstall.ts',
      'src/context/ServiceWorkerContext.tsx',
      'src/components/settings/PwaStatusCard.tsx',
      'tests/mocks/pwaRegister.ts',
      'tests/hooks/usePWAInstall.test.tsx',
      'tests/context/ServiceWorkerContext.test.tsx',
      'tests/components/pwa/InstallButton.test.tsx',
      'tests/components/settings/PwaStatusCard.test.tsx',
    ]) {
      expect(existsSync(at(path))).toBe(false);
    }
  });
});
