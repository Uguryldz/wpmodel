import React from 'react';
import ReactDOM from 'react-dom/client';
import WhatsAppMultiAccount from './whatsapp_multi_account';
import './index.css';

// /docs route'una gidildiğinde direkt backend'e yönlendir
if (window.location.pathname === '/docs' || window.location.pathname.startsWith('/docs/')) {
  // VITE_BACKEND_URL varsa onu kullan, yoksa window.location.host kullan (proxy üzerinden)
  const backendUrl = import.meta.env.VITE_BACKEND_URL || `http://${window.location.host}`;
  window.location.href = backendUrl + window.location.pathname + window.location.search;
}

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element not found');
ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <WhatsAppMultiAccount />
  </React.StrictMode>
);

