/**
 * Quick 261126-ky8 browser harness. Mounts the REAL standalone AppIntelliJ boot path
 * with its own DB and the app's theme tokens. No DB or component mocks; not in production bundle.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import AppIntelliJ from '../src/AppIntelliJ';
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
        <AppIntelliJ standaloneChat />
      </div>
    </div>
  );
}

window.location.hash = '#ai-popout';
createRoot(document.getElementById('root')!).render(<HarnessShell />);
