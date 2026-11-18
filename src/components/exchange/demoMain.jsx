import React from 'react';
import ReactDOM from 'react-dom/client';
import '../../styles/design-tokens.css';
import '../../styles/public-shell.css';
import '../../styles.css';
import '../../styles/v3-overrides.css';
import '../../styles/visual-refresh.css';
import { ExchangeWorkspaceView } from './ExchangeWorkspace.jsx';

// Local demo entry for the exchange screens (ping-demo.html, dev server only;
// not a build input). Renders nothing unless the demo switch is on.
const root = document.getElementById('root');
const demoToken = async () => 'demo';
if (import.meta.env.DEV && import.meta.env.VITE_PING_DEMO === '1') {
  const query = new URLSearchParams(window.location.search);
  const theme = query.get('theme') === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.toggle('dark', theme === 'dark');
  ReactDOM.createRoot(root).render(<React.StrictMode>
    <div className="top-panel-body exchange-demo-shell"><ExchangeWorkspaceView getToken={demoToken} initialTab={query.get('tab') || 'campaigns'} /></div>
  </React.StrictMode>);
}
