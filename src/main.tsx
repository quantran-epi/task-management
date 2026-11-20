import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import AppIntelliJ from './AppIntelliJ';
import './styles/markdown.css';
import './styles/team-chat.css';
// Default per-weight CSS carries unicode-range for every subset (incl. Vietnamese U+1EA0-1EF9),
// so Vite hashes both Latin and Vietnamese woff2 into dist/assets for offline Tauri. Never import
// subset-only CSS here — it has no unicode-range and would claim all glyphs.
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import '@xterm/xterm/css/xterm.css';

export function shouldBootIntelliJ(search: string = window.location.search): boolean {
  try {
    const searchParams = new URLSearchParams(search);
    const queryUi = searchParams.get('ui');
    if (queryUi === 'intellij') {
      try {
        localStorage.setItem('taskmate_ui_shell', 'intellij');
      } catch {
        // Ignore storage access errors in restricted environments
      }
      if (typeof window !== 'undefined' && window.history && window.location.search) {
        window.history.replaceState(null, '', window.location.pathname + window.location.hash);
      }
      return true;
    }
    if (queryUi === 'default') {
      try {
        localStorage.removeItem('taskmate_ui_shell');
      } catch {
        // Ignore storage access errors
      }
      if (typeof window !== 'undefined' && window.history && window.location.search) {
        window.history.replaceState(null, '', window.location.pathname + window.location.hash);
      }
      return false;
    }
    return localStorage.getItem('taskmate_ui_shell') === 'intellij';
  } catch {
    return false;
  }
}

const useIntelliJ = typeof window !== 'undefined' && shouldBootIntelliJ();

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      {useIntelliJ ? <AppIntelliJ /> : <App />}
    </React.StrictMode>
  );
}
