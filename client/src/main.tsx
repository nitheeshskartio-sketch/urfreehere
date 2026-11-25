import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { cleanupStaleIncoming } from './apps/postman/lib/transfer/sink';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Remove temporary received files left behind by closed tabs.
window.setTimeout(() => void cleanupStaleIncoming(), 2000);
