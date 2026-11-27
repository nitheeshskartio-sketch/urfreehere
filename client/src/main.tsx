import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { cleanupStaleIncoming } from './apps/postman/lib/transfer/sink';
import './index.css';
import { captureInstallPrompt } from './ui/InstallButton';

// Installable app (PWA): catch the browser's install offer, and cache the app for offline starts.
captureInstallPrompt();
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Remove temporary received files left behind by closed tabs.
window.setTimeout(() => void cleanupStaleIncoming(), 2000);
