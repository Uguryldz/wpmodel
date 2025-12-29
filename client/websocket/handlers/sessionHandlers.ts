// Session event handlers (sessions.update)
import { WebSocketContext, WebSocketEvent } from '../types';

export const handleSessionsUpdate = (data: WebSocketEvent, context: WebSocketContext) => {
  const {
    sessions,
  } = data;

  const {
    setAccounts,
  } = context;

  if (!sessions || !Array.isArray(sessions)) {
    console.warn('[WebSocket] ⚠️ sessions.update event geçersiz data içeriyor');
    return;
  }

  console.log('[WebSocket] 📋 Session listesi güncellendi:', sessions.length);

  // Temp- ile başlayan session'ları filtrele (geçici session'lar)
  const validSessions = sessions.filter((session: any) => !session.id?.startsWith('temp-'));
  console.log('[WebSocket] 📋 Geçerli session sayısı (temp hariç):', validSessions.length, 'Toplam:', sessions.length);

  if (setAccounts) {
    // Account'ları güncelle
    // Not: Bu sadece session ID ve status içeriyor, account names localStorage'dan gelecek
    setAccounts((prevAccounts: any[]) => {
      const accountNames = JSON.parse(localStorage.getItem('whatsapp_account_names') || '{}');
      const COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'];
      
      const updatedAccounts = validSessions.map((session: any, index: number) => {
        const accountName = accountNames[session.id] || session.id;
        const existingAccount = prevAccounts.find((acc: any) => acc.id === session.id);
        
        return {
          id: session.id,
          name: accountName,
          status: session.status || 'unknown',
          color: existingAccount?.color || COLORS[index % COLORS.length],
          active: existingAccount?.active || false,
          whatsappJid: session.whatsappJid || null,
        };
      });

      // Aktif account'ı koru
      const activeAccount = prevAccounts.find((acc: any) => acc.active);
      if (activeAccount && updatedAccounts.some((acc: any) => acc.id === activeAccount.id)) {
        updatedAccounts.forEach((acc: any) => {
          acc.active = acc.id === activeAccount.id;
        });
      } else if (updatedAccounts.length > 0 && !updatedAccounts.some((acc: any) => acc.active)) {
        updatedAccounts[0].active = true;
      }

      return updatedAccounts;
    });
  }
};

