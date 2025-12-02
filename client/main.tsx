import React from 'react';
import ReactDOM from 'react-dom/client';
import WhatsAppMultiAccount from './whatsapp_multi_account';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element not found');
ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <WhatsAppMultiAccount />
  </React.StrictMode>
);

