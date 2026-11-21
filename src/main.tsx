import React from 'react';
import ReactDOM from 'react-dom/client';
import AppIntelliJ from './AppIntelliJ';
// CR-01: OpenIDEA token sheet + global reset must be the first styles in the
// bundle; the vendored theme selectors key off :root[data-theme].
import './components/ui/openidea/tokens.css';
import './components/ui/openidea/global.css';
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

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <AppIntelliJ />
    </React.StrictMode>
  );
}
