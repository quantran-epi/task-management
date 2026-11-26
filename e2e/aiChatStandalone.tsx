/**
 * Quick 261126-ky8 browser harness. Mounts the REAL standalone chat shell with its own DB
 * and the app's theme wrapper/tokens. No DB or component mocks; not part of the production bundle.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeAppHolder } from '../src/components/ui';
import { AntdThemeAdapter } from '../src/workbench/AntdThemeAdapter';
import { AIChatProvider } from '../src/context/AIChatContext';
import { KnowledgeConfigProvider } from '../src/services/knowledge/knowledgeConfig';
import { AIPopoutView } from '../src/views/AIPopoutView';
import { broadcastThemeMode, THEME_STORAGE_KEY } from '../src/workbench/themeBroadcast';
import '../src/styles/workbench-tokens.css';

function toggleTheme(): void {
  const mode = localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'light' : 'dark';
  broadcastThemeMode(mode);
}

function HarnessShell() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <button type="button" aria-label="Chuyển đổi giao diện sáng/tối" onClick={toggleTheme} style={{ height: 28 }}>
        Chuyển đổi giao diện
      </button>
      <div style={{ flex: 1, minHeight: 0 }}>
        <AIPopoutView standaloneChat />
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <AntdThemeAdapter>
    <ThemeAppHolder>
      <KnowledgeConfigProvider>
        <AIChatProvider>
          <HarnessShell />
        </AIChatProvider>
      </KnowledgeConfigProvider>
    </ThemeAppHolder>
  </AntdThemeAdapter>
);
